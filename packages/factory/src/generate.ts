/**
 * 批量生成部件。
 * 保证：幂等（已 done 的不重复花钱）、有预算闸门、并发自适应、崩了能续。
 *
 * 风格一致性靠 **anchor 图**（docs/07 §4A、assets/refs/README.md）：
 * 每个主题先用 text-to-3D 生成一件 anchor 并让 Rodin 附带一张渲染图，
 * 该主题其余部件全部以这张图做 image-to-3D 的参考。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RECIPES, recipeById, type Recipe } from '../recipes/catalog.ts';

import { generateOne, checkBalance, RodinError, PARALLELISM } from './rodin.ts';
import { load, save, hashRecipe, needsRun, RAW_DIR, ROOT, type Ledger } from './ledger.ts';
import { loadCuration, isKept } from './curation.ts';

/** 硬预算闸门：任何一次调用最多花这么多 credits，防止脚本跑飞（docs/09 §C） */
const MAX_CREDITS_PER_RUN = 40;
const REFS_DIR = resolve(ROOT, 'assets/refs');
/** 项目负责人丢图的入口（docs/30）。这里的图优先级最高，有它就不自渲锚 */
const INTAKE_DIR = resolve(ROOT, 'assets/intake');
/** 每个主题的 anchor 用哪个槽位 —— 躯干信息量最大，最能定调 */
const ANCHOR_SLOT = 'spine';

/**
 * 只对"会改变生成结果"的字段取哈希。
 * flip / partSymmetry 只影响规范化与运行时，改它们不该重新花 credits（P9）。
 */
function genHash(r: Recipe, refKey: string): string {
  return hashRecipe({
    prompt: r.prompt, seed: r.seed, bbox: r.bbox, isSymmetric: r.isSymmetric,
    qualityOverride: r.qualityOverride, material: r.material, tier: 'Gen-2.5-Low', ref: refKey,
    mode: r.geometryInstructMode,
  });
}

export interface ThemeRefs { files: { name: string; data: Buffer }[]; key: string; }

const IMG = /\.(png|jpe?g|webp)$/i;

const imagesIn = (dir: string, keepUnderscore = false): string[] => {
  if (!existsSync(dir)) return [];
  const names = readdirSync(dir).filter((f) => IMG.test(f)).sort();
  const manual = names.filter((n) => !n.startsWith('_'));
  return manual.length || !keepUnderscore ? manual : names;
};

/**
 * 读该主题的参考图，三级优先：
 *
 *   1. `assets/intake/<id>/`  —— **项目负责人自己丢进来的图**
 *   2. `assets/refs/<id>/`    里不以 `_` 开头的（历史上的人工放置位）
 *   3. `assets/refs/<id>/_anchor.png` —— 我们自渲的锚
 *
 * 为什么 intake 要排第一：`docs/30-ASSET-INTAKE.md` 告诉他把图丢 `assets/intake/`，
 * 而这里原来只读 `assets/refs/`。两处不一致的后果不是报错，是**他丢了图，
 * 管线照样拿自渲的锚去生成**，而且一声不吭 —— 等发现时 credits 已经烧完了。
 *
 * 有 intake 图就**不需要**自渲锚那一步：那一步存在的唯一理由就是"没有参考图"。
 */
function loadRefs(themeId: string): ThemeRefs {
  const intake = imagesIn(resolve(INTAKE_DIR, themeId));
  if (intake.length) {
    const use = intake.slice(0, 5);
    return {
      files: use.map((n) => ({ name: n, data: readFileSync(resolve(INTAKE_DIR, themeId, n)) })),
      key: `intake:${use.join(',')}`,
    };
  }
  const dir = resolve(REFS_DIR, themeId);
  const use = imagesIn(dir, true).slice(0, 5);
  if (!use.length) return { files: [], key: 'none' };
  return {
    files: use.map((n) => ({ name: n, data: readFileSync(resolve(dir, n)) })),
    key: use.join(','),
  };
}

function paramsFor(r: Recipe, refs: ThemeRefs, previewRender: boolean) {
  return {
    prompt: r.prompt,
    images: refs.files.length ? refs.files.map((f) => ({ name: f.name, data: f.data })) : undefined,
    image_label: refs.files.length ? refs.files.map(() => '?') : undefined,
    tier: 'Gen-2.5-Low',
    mesh_mode: 'Raw' as const,
    quality_override: r.qualityOverride,
    material: r.material,
    geometry_file_format: 'glb' as const,
    seed: r.seed,
    bbox_condition: r.bbox,
    is_symmetric: r.isSymmetric,
    geometry_instruct_mode: r.geometryInstructMode,
    preview_render: previewRender || undefined,
  };
}

function writeFiles(id: string, files: { name: string; bytes: Uint8Array }[]): string[] {
  const dir = resolve(RAW_DIR, id);
  mkdirSync(dir, { recursive: true });
  const names: string[] = [];
  for (const f of files) {
    const safe = f.name.replace(/[^\w.\-]/g, '_');
    writeFileSync(resolve(dir, safe), f.bytes);
    names.push(`${id}/${safe}`);
  }
  return names;
}

/**
 * 保证某主题有 anchor 几何。
 *
 * 注意这是**两阶段**流程，因为 Rodin 的 preview_render 在本账号拿不到渲染图（docs/09 U12）：
 *   阶段 1（本函数）：text-to-3D 生成 spine.<theme>.a
 *   阶段 2（人工一步）：打开 /dev/anchor.html，它把这件渲染成 assets/refs/<theme>/_anchor.png
 *   阶段 3：重跑本命令，剩下 19 件全部以该图做 image-to-3D
 * 把这一步显式化，比让它悄悄退回纯文字生成要好 —— 风格一致性是这个主题成不成立的关键。
 */
export async function ensureAnchorGeometry(themeId: string, ledger: Ledger): Promise<'has-ref' | 'built-geometry' | 'exists'> {
  if (loadRefs(themeId).files.length) return 'has-ref';
  const r = recipeById(`${ANCHOR_SLOT}.${themeId}.a`);
  if (!r) throw new Error(`主题 ${themeId} 没有 anchor 配方 ${ANCHOR_SLOT}.${themeId}.a`);
  if (ledger.entries[r.id]?.status === 'done' || ledger.entries[r.id]?.status === 'normalized') return 'exists';

  console.log(`  ⚓ ${themeId}: 生成 anchor 几何 ${r.id}（text-to-3D）…`);
  const res = await generateOne(paramsFor(r, { files: [], key: 'none' }, false));
  const names = writeFiles(r.id, res.files);
  ledger.entries[r.id] = {
    recipeHash: genHash(r, 'none'), taskUuid: res.uuid, status: 'done',
    consumed: res.consumed, files: names, completedAt: new Date().toISOString(), error: null,
  };
  ledger.totalConsumed = Object.values(ledger.entries).reduce((s, e) => s + (e.consumed ?? 0), 0);
  save(ledger);
  return 'built-geometry';
}

export interface GenerateOptions {
  ids?: string[];
  theme?: string;
  pilot?: boolean;
  concurrency?: number;
  dryRun?: boolean;
  /** 跳过 anchor 流程，全部用纯 text-to-3D（风格一致性会差一截） */
  noAnchor?: boolean;
  /**
   * 不把主题参考图当 image-to-3D 输入，只用文字（anchor 几何该生成还是生成）。
   *
   * 为什么需要：近立方槽位（joint/head/foot）的 bbox_condition 是个立方体，
   * 对形状没有约束力，于是**躯干 anchor 图压过文字提示**，产出的是一个小躯干。
   * `geometry_instruct_mode=creative` 治不了这个 —— 实测重生成 8 个 joint 前后
   * 「像自己主题躯干」的程度几乎没变（Δ +0.24..+0.43 → +0.24..+0.44）。
   * 这个开关是用来做对照实验的：同一件，只去掉图，看形状是否回到槽位语义。
   *
   * 注意：规范化会丢掉全部贴图与材质（docs/03 §4），所以对小件来说
   * anchor 图贡献的只有几何风格，代价却是整块形状被照抄。
   */
  noImages?: boolean;
}

function select(opt: GenerateOptions): Recipe[] {
  let rs = RECIPES;
  if (opt.theme) rs = rs.filter((r) => r.theme === opt.theme);
  if (opt.ids?.length) rs = rs.filter((r) => opt.ids!.includes(r.id));
  else if (opt.pilot) {
    const keep = new Set(['spine', 'head', 'upperArm', 'foreArm', 'foot', 'joint']);
    rs = rs.filter((r) => keep.has(r.slot) && r.id.endsWith('.a'));
  }
  return rs;
}

export async function generate(opt: GenerateOptions = {}): Promise<void> {
  const ledger = load();
  const all = select(opt);
  if (!all.length) { console.log('没有匹配的配方'); return; }

  const themes = [...new Set(all.map((r) => r.theme))];
  const NO_REFS: ThemeRefs = { files: [], key: 'none' };
  const refsByTheme = new Map(themes.map((t) => [t, opt.noImages ? NO_REFS : loadRefs(t)]));
  // keep 的部件已经是资产，不再是配方的产物 —— 改 prompt 也不重生成（docs/14 §5）
  const curation = loadCuration();
  const protectedIds = all.filter((r) => isKept(curation, r.id)).map((r) => r.id);
  const todo = all.filter(
    (r) => !isKept(curation, r.id) && needsRun(ledger, r.id, genHash(r, refsByTheme.get(r.theme)!.key)),
  );
  if (protectedIds.length) console.log(`保护 ${protectedIds.length} 件已标 keep 的素材，不重新生成`);

  // anchor 自己不算在 todo 里（它要先跑），但要计入预算
  // --no-images 是「故意不用图」，不是「还缺图」—— 不要因此触发 anchor 流程
  const needAnchor = opt.noImages ? [] : themes.filter((t) => !refsByTheme.get(t)!.files.length);
  const estimate = (todo.length + needAnchor.length) * 0.5;

  console.log(`主题 ${themes.join(', ')}`);
  console.log(`选中 ${all.length} 个配方，需要生成 ${todo.length} 个（其余已完成/未变更）`);
  for (const t of themes) {
    const r = refsByTheme.get(t)!;
    console.log(`  ${t}: 参考图 ${r.files.length ? r.key : opt.noImages ? '（--no-images：只用文字）' : '（将自动生成 anchor）'}`);
  }
  console.log(`预计消耗 ≈ ${estimate} credits`);

  if (!todo.length && !needAnchor.length) return;
  if (estimate > MAX_CREDITS_PER_RUN) {
    console.error(`✗ 超过单次预算闸门 ${MAX_CREDITS_PER_RUN} credits。按主题分批：--theme=<id>`);
    process.exit(1);
  }

  const balance = await checkBalance();
  console.log(`账户余额 ${balance} credits`);
  if (balance < estimate + 5) { console.error('✗ 余额不足（留 5 credits 缓冲）。'); process.exit(1); }
  if (opt.dryRun) { todo.forEach((r) => console.log('  would generate', r.id)); return; }

  // 1) anchor 流程（除非显式跳过）
  if (!opt.noAnchor && needAnchor.length) {
    const waiting: string[] = [];
    for (const t of needAnchor) {
      try {
        const r = await ensureAnchorGeometry(t, ledger);
        if (r !== 'has-ref') waiting.push(t);
      } catch (e) {
        console.error(`  ✗ ${t} anchor 失败: ${(e as Error).message}`);
      }
    }
    if (waiting.length) {
      console.log(`
────────────────────────────────────────────────────────────
以下主题的 anchor 几何已就绪，还缺参考图: ${waiting.join(', ')}

下一步（一次手动操作，之后就全自动了）:
  1. npm run dev
  2. 打开 http://localhost:5173/dev/anchor.html
     它会把每个主题的 spine.<theme>.a 渲染成 assets/refs/<theme>/_anchor.png
  3. 重跑本命令 —— 该主题剩下的 19 件会全部以这张图做 image-to-3D

为什么要这一步: Rodin 的 preview_render 在本账号拿不到渲染图（docs/09 U12），
所以参考图由我们自己渲。要跳过、直接用纯 text-to-3D: 加 --no-anchor（风格一致性会差一截）。
────────────────────────────────────────────────────────────`);
      return;
    }
  }

  // 2) 批量生成剩余部件
  const queue = todo.filter((r) => ledger.entries[r.id]?.status !== 'done');
  let concurrency = opt.concurrency ?? 3;
  let active = 0, done = 0, failed = 0;
  const total = queue.length;

  async function runOne(r: Recipe): Promise<void> {
    const t0 = Date.now();
    const refs = refsByTheme.get(r.theme)!;
    ledger.entries[r.id] = { recipeHash: genHash(r, refs.key), status: 'queued', submittedAt: new Date().toISOString(), error: null };
    save(ledger);
    try {
      const res = await generateOne(paramsFor(r, refs, false), {
        onSubmitted: (uuid, consumed) => {
          Object.assign(ledger.entries[r.id], { taskUuid: uuid, status: 'generating', consumed });
          save(ledger);
          console.log(`  ↑ ${r.id}  uuid=${uuid.slice(0, 8)} (-${consumed})${refs.files.length ? ' [img]' : ''}`);
        },
      });
      const names = writeFiles(r.id, res.files);
      const sec = Math.round((Date.now() - t0) / 1000);
      Object.assign(ledger.entries[r.id], {
        status: 'done', files: names, completedAt: new Date().toISOString(), durationSec: sec, error: null,
      });
      ledger.totalConsumed = Object.values(ledger.entries).reduce((s, e) => s + (e.consumed ?? 0), 0);
      save(ledger);
      done++;
      console.log(`  ✓ ${r.id.padEnd(24)} ${sec}s  [${done + failed}/${total}]`);
    } catch (e) {
      const err = e as Error;
      failed++;
      Object.assign(ledger.entries[r.id], { status: 'failed', error: err.message });
      save(ledger);
      console.error(`  ✗ ${r.id}  ${err.message}`);
      if (e instanceof RodinError && e.code === PARALLELISM) concurrency = 1;
      if (e instanceof RodinError && e.code === 'API_INSUFFICIENT_FUNDS') queue.length = 0;
    }
  }

  await new Promise<void>((resolveAll) => {
    const pump = () => {
      if (!queue.length && active === 0) return resolveAll();
      while (active < concurrency && queue.length) {
        const r = queue.shift()!;
        active++;
        runOne(r).finally(() => { active--; pump(); });
      }
    };
    pump();
  });

  console.log(`\n完成 ${done}，失败 ${failed}，累计消耗 ${ledger.totalConsumed} credits`);
  if (failed) console.log('失败项已记入 ledger，重跑同一条命令会自动只重试失败项。');
}
