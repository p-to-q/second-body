#!/usr/bin/env node
/**
 * 取件脚本 —— 从开源仓库下载真实机器人/解剖网格，拆成单件，过规范化流水线。
 *
 * 为什么脚本是交付物而下载的网格不是：各来源授权不同（BSD-3 / Apache-2.0 / MIT 都要保留声明），
 * 而且原始 CAD 动辄几 MB。把网址和授权写进代码、让任何人能重新取一遍，
 * 比把二进制塞进仓库更诚实也更可维护。原料落到 `assets/harvest/`（.gitignore）。
 *
 * 为什么每条来源带一行授权注释：这件作品是公开仓库 + 公开部署。
 * 授权判断必须跟着 URL 走，不能只写在文档里 —— 文档会和代码分叉，这里不会。
 *
 * 用法：
 *   node scripts/harvest.mjs            下载 + 规范化 + 验收
 *   node scripts/harvest.mjs --list     只列来源和授权，不下载
 *   node scripts/harvest.mjs --only=shin.real.cassie.a
 *   node scripts/harvest.mjs --verify   只对已有产物验收（不重新下载）
 */
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HARVEST = resolve(ROOT, 'assets/harvest');          // 下载的原始网格
const OUT = resolve(ROOT, 'assets/parts/harvest');        // 规范化产物

/**
 * 契约阈值 —— 和 `packages/factory/src/check-parts.ts` 逐字一致。
 * 为什么在这里复述而不是 import：那个文件是合并门，只认 `assets/parts/parts.json`，
 * 而 parts.json 由别的线在动（AGENTS.md：不碰）。取件池是独立的池子，
 * 就像慢回路的 `assets/parts/lineage/` 一样 —— 但**验收标准必须是同一套数字**。
 */
const EPS = 2e-3, MAX_TRIS = 5000, MAX_BYTES = 1_500_000;

/**
 * 来源一律钉死在 commit SHA，不要指向 `main`。
 *
 * 指向分支的后果不是报错，是**来源在脚下变**：今天取到的和明天取到的可能不是同一个网格，
 * 而 `check:parts` 照样 0 错 —— 你不会知道它变过。
 * 这和海报数字漂掉是同一类错（`assets/brand/README.md` 记过一次）：
 * 没人在说谎，只是没人负责重新核对。
 *
 * 要升级来源：改 SHA，重跑，**在提交信息里写清楚为什么升**。
 */
const MENAGERIE_SHA = '8161bba264d7fa7c99ca301e91e7fb44737676ad';   // 2026-09-13
const BODYPARTS_SHA = 'fd527e6f4daf732fd814314d9257df5877b844bc';   // 2026-09-13
const MENAGERIE = `https://raw.githubusercontent.com/google-deepmind/mujoco_menagerie/${MENAGERIE_SHA}`;

/**
 * 来源清单。
 *
 * `license` 一列是**对这件作品的判定**（公开仓库 + 公开部署 + 非商业艺术装置），
 * 不是泛泛的授权名。三档见 docs/33 §1：✅ 直接可用 / 🟡 有条件 / ❌ 不能用。
 * 这里只放 ✅ 和 🟡 —— ❌ 的来源根本不该出现在可执行的取件路径上。
 *
 * MuJoCo Menagerie 的关键事实：**每个机器人子目录带自己的 LICENSE**，
 * 仓库根的 Apache-2.0 管的是 MJCF 和工具，不是厂商的几何。所以判定必须逐个机器人做。
 */
const SOURCES = [
  {
    id: 'shin.real.cassie.a', slot: 'shin', family: 'real.cassie',
    // MIT（Agility Robotics 自己发布）—— 保留版权声明即可，无 share-alike。这是最干净的一档。
    license: '✅ MIT · Agility Robotics · mujoco_menagerie/agility_cassie/LICENSE',
    url: `${MENAGERIE}/agility_cassie/assets/shin.obj`,
    note: 'Cassie 小腿。真机就叫 shin，几何直接对上我们的 shin 槽位',
  },
  {
    id: 'foreArm.real.cassie.a', slot: 'foreArm', family: 'real.cassie',
    license: '✅ MIT · Agility Robotics · mujoco_menagerie/agility_cassie/LICENSE',
    url: `${MENAGERIE}/agility_cassie/assets/tarsus.obj`,
    note: 'Cassie 跗骨连杆。细长、两端有轴承座，当前臂用比当小腿更像',
  },
  {
    id: 'thigh.real.anymal.a', slot: 'thigh', family: 'real.anymal',
    // BSD-3-Clause（ANYbotics AG, 2020）—— 保留版权 + 免责声明，可再分发。
    license: '✅ BSD-3-Clause · ANYbotics AG · mujoco_menagerie/anybotics_anymal_c/LICENSE',
    url: `${MENAGERIE}/anybotics_anymal_c/assets/thigh.obj`,
    note: 'ANYmal C 大腿。带驱动器外壳，分缝和散热筋是真的',
  },
  {
    id: 'shin.real.anymal.a', slot: 'shin', family: 'real.anymal',
    license: '✅ BSD-3-Clause · ANYbotics AG · mujoco_menagerie/anybotics_anymal_c/LICENSE',
    url: `${MENAGERIE}/anybotics_anymal_c/assets/shank_l.obj`,
    note: 'ANYmal C 小腿。碳纤维管 + 端头，比生成件瘦得多 —— 正是生成模型编不出来的比例',
  },
  {
    id: 'shin.real.g1.a', slot: 'shin', family: 'real.g1',
    // Unitree 的 BSD-3 变体：保留版权 + 免责声明，禁止用 Unitree 名义背书。
    // 我们不声称背书，判定为可用；但**必须**在 docs/33 和 credits 里写明来源。
    license: '🟡 BSD-3 变体 · Unitree Robotics · 需署名且不得暗示背书',
    url: `${MENAGERIE}/unitree_g1/assets/left_knee_link.STL`,
    note: 'G1 膝下连杆。roster 的 compact 条目就是 G1，而它的参考图一直没找到（docs/31 §1 第 5 行）',
  },
  {
    id: 'spine.real.g1.a', slot: 'spine', family: 'real.g1',
    license: '🟡 BSD-3 变体 · Unitree Robotics · 需署名且不得暗示背书',
    url: `${MENAGERIE}/unitree_g1/assets/torso_link_rev_1_0.STL`,
    note: 'G1 躯干。人形躯干的真实比例，生成件最容易编错的就是这个',
  },
  {
    id: 'shin.real.spot.a', slot: 'shin', family: 'real.spot',
    // BSD-3-Clause（Clearpath Robotics 发布的 Spot 描述包）。
    license: '✅ BSD-3-Clause · Clearpath Robotics · mujoco_menagerie/boston_dynamics_spot/LICENSE',
    url: `${MENAGERIE}/boston_dynamics_spot/assets/front_left_lower_leg.obj`,
    note: 'Spot 前左小腿。roster 的 patrol 条目就是 Spot',
  },

  // ── 解剖骨骼（docs/33 §2 B 脉络）───────────────────────────────────────────
  // 这两件是 🟡：CC-BY-SA 要求署名 + 注明改动 + 衍生件同样开源。
  // 我们做的改动恰恰全是 CC-BY-SA 眼里的「改动」：转轴、挪原点、归一长度、减面、去材质。
  // 所以取件池**不进版本库**（.gitignore），署名写在 docs/33 §4 —— 分享传染到网格，传染不到代码。
  {
    id: 'thigh.real.bone.a', slot: 'thigh', family: 'real.bone', ext: '.obj',
    license: '🟡 CC-BY-SA 2.1 JP · BodyParts3D / DBCLS · 需署名 + 注明改动 + 衍生件同样 BY-SA',
    url: `https://media.githubusercontent.com/media/olivercase/body_parts_3d_api/${BODYPARTS_SHA}/meshes/FJ3365_BP23346_FMA24474_Right%20femur.obj`,
    note: '右股骨。3102 tris，已经在预算内 —— 解剖数据天生就是单 mesh、无贴图，比 CAD 还合规',
  },
  {
    id: 'spine.real.bone.a', slot: 'spine', family: 'real.bone', ext: '.obj',
    license: '🟡 CC-BY-SA 2.1 JP · BodyParts3D / DBCLS · 需署名 + 注明改动 + 衍生件同样 BY-SA',
    url: `https://media.githubusercontent.com/media/olivercase/body_parts_3d_api/${BODYPARTS_SHA}/meshes/FJ3152_BP23294_FMA16586_Right%20hip%20bone.obj`,
    note: '右髋骨。BodyParts3D 没有整块颅骨也没有整副胸廓 —— 它按 FMA 本体拆到单骨，这对我们正好',
  },
  {
    id: 'thigh.real.nih.a', slot: 'thigh', family: 'real.nih', ext: '.stl',
    // CC0：署名都不要求。整份调研里授权最干净的一件解剖网格。
    license: '✅ CC0 / 公有领域 · NIH 3D · entry 3DPX-000168',
    url: 'https://3d.nih.gov/api/submissions/162/runs/4e6c5ffb-a687-4992-ac61-198998d7fbcf/output-files/1333',
    note: '人股骨，34k tris 的扫描件。留着它是为了压测减面那一段：CAD 是硬表面，扫描件不是',
  },
];

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const only = args.find((a) => a.startsWith('--only='))?.slice(7);
const picked = SOURCES.filter((s) => !only || s.id === only);

if (has('--list')) {
  for (const s of SOURCES) console.log(`${s.id.padEnd(24)} ${s.license}\n${' '.repeat(25)}${s.url}\n${' '.repeat(25)}${s.note}\n`);
  process.exit(0);
}

async function download(src) {
  // NIH 3D 的下载地址没有扩展名（/output-files/1333），所以来源可以显式声明 `ext`。
  const ext = src.ext ?? src.url.slice(src.url.lastIndexOf('.')).toLowerCase();
  const path = resolve(HARVEST, src.id + ext);
  if (existsSync(path)) return path;                     // 幂等：取过就不再取，别白占别人带宽
  const r = await fetch(src.url);
  if (!r.ok) throw new Error(`${r.status} ${src.url}`);
  mkdirSync(HARVEST, { recursive: true });
  writeFileSync(path, Buffer.from(await r.arrayBuffer()));
  return path;
}

/** 验收：用和 check:parts 同一套数字，对取件池独立跑一遍。 */
async function verify() {
  const { glbStats } = await import(resolve(ROOT, 'packages/factory/src/glb-stats.ts'));
  const idxPath = resolve(OUT, '_harvest.json');
  if (!existsSync(idxPath)) { console.log('还没有产物，先跑一次不带 --verify 的取件'); return 1; }
  const metas = JSON.parse(readFileSync(idxPath, 'utf8'));
  const errs = [], warns = [];
  for (const m of metas) {
    const f = resolve(OUT, `${m.id}.glb`);
    if (!existsSync(f)) { errs.push(`${m.id}: 文件缺失`); continue; }
    const s = glbStats(f);
    if (Math.abs(s.size[1] - 1) > EPS) errs.push(`${m.id}: 长度 ${s.size[1].toFixed(4)} ≠ 1.0`);
    if (Math.abs(s.min[1]) > EPS) errs.push(`${m.id}: socketA 不在原点 y=${s.min[1].toFixed(4)}`);
    if (s.triangles > MAX_TRIS) errs.push(`${m.id}: ${s.triangles} tris > ${MAX_TRIS}`);
    if (s.bytes > MAX_BYTES) errs.push(`${m.id}: ${(s.bytes / 1e6).toFixed(1)} MB 超预算`);
    if (s.hasAnimation || s.hasSkin) errs.push(`${m.id}: 含动画/骨骼`);
    if (s.meshes !== 1) warns.push(`${m.id}: ${s.meshes} 个 mesh`);
    if (s.images > 0) warns.push(`${m.id}: 仍带 ${s.images} 张贴图`);
    if (Math.abs((s.min[0] + s.max[0]) / 2) > EPS * 5) warns.push(`${m.id}: X 未居中`);
    console.log(`  ${errs.length ? ' ' : '✓'} ${m.id.padEnd(24)} ${String(s.triangles).padStart(5)} tris  ` +
      `girth=${m.localGirth.toFixed(3)}  len=${s.size[1].toFixed(5)}  y0=${s.min[1].toFixed(5)}  ${(s.bytes / 1024).toFixed(0)}KB`);
  }
  for (const w of warns) console.warn('  ⚠ ' + w);
  for (const e of errs) console.error('  ✗ ' + e);
  console.log(`\n取件池契约检查 — ${metas.length} 件, ${errs.length} 错, ${warns.length} 警告`);
  return errs.length ? 1 : 0;
}

if (has('--verify')) process.exit(await verify());

const { normalizeOne } = await import(resolve(ROOT, 'packages/factory/src/normalize.ts'));
const metas = [];
for (const src of picked) {
  try {
    const raw = await download(src);
    const { meta, warnings, orient } = await normalizeOne(src.id, raw, {
      outDir: OUT,
      file: `harvest/${src.id}.glb`,      // 运行时按 `/parts/` + file 取件
      slot: src.slot,
      tier: 2,                            // 真机几何是机械化/关节化的，按 docs/03 §3.2 归 tier 2
      family: src.family,
      symmetry: 'mirror',
      source: { provider: 'harvest', model: src.url, recipeId: src.id },
    });
    metas.push(meta);
    console.log(`  ✓ ${src.id.padEnd(24)} ${String(meta.triCount).padStart(5)} tris  girth=${meta.localGirth.toFixed(3)}  ${orient}` +
      (warnings.length ? `\n      ⚠ ${warnings.join('; ')}` : ''));
  } catch (e) {
    console.error(`  ✗ ${src.id}: ${e.message}`);
  }
}

// 和 normalizeAll 一样：定向取件（--only）必须合并进已有索引，不能整个重写。
const idxPath = resolve(OUT, '_harvest.json');
let merged = metas;
if (only && existsSync(idxPath)) {
  const byId = new Map(JSON.parse(readFileSync(idxPath, 'utf8')).map((m) => [m.id, m]));
  for (const m of metas) byId.set(m.id, m);
  merged = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}
mkdirSync(OUT, { recursive: true });
writeFileSync(idxPath, JSON.stringify(merged, null, 2));
console.log(`\n取件 ${metas.length} 件；索引共 ${merged.length} 件 → assets/parts/harvest/`);

writeMixedIndex(merged);
console.log(`混合索引 → /dev/figure.html?parts=/parts/harvest/&theme=real.g1\n`);
process.exit(await verify());

/**
 * 写一份**混合索引**：192 件 Rodin 生成件 + 取件池，放进同一个 PartLibrary。
 *
 * 为什么要这个：验收问的是「真实网格和生成件放在同一具身体上会不会打架」。
 * 这个问题只能看出来，不能想出来 —— 所以必须真的拼一具。
 *
 * 为什么不直接改 `assets/parts/parts.json`：那个文件由别的线在动（AGENTS.md：不碰）。
 * 这里另写一份，`file` 指回 `../`，同一批 glb 不复制第二遍。
 *
 * 混合是靠 genome 的 `base` 回退链实现的（core/genome.ts 的 baseChain）：
 * `real.g1` 这个 theme 只有 shin 和 spine 两个槽位有件，其余槽位自动回退到
 * `base: 'compact'` 的 Rodin 件。于是一具身体里两种来源**天然**并存。
 */
function writeMixedIndex(harvestMetas) {
  const basePath = resolve(ROOT, 'assets/parts/parts.json');
  if (!existsSync(basePath)) { console.warn('没有 assets/parts/parts.json，跳过混合索引'); return; }
  const base = JSON.parse(readFileSync(basePath, 'utf8'));

  // 每个真实来源挂到 docs/31 对表里那个对应的 archetype 上。
  // 挂错了这具身体就没有意义：Cassie 的腿必须落在鸟腿人身上，不是落在瓷上。
  // 解剖骨骼挂到 xeno 上：那是 roster 里唯一一条生物机械的线（docs/31 §3）。
  const BASE_OF = { 'real.g1': 'compact', 'real.spot': 'patrol', 'real.anymal': 'patrol',
                    'real.cassie': 'digitigrade', 'real.bone': 'xeno', 'real.nih': 'xeno' };
  const themes = [...base.themes];
  for (const [fam, baseId] of Object.entries(BASE_OF)) {
    if (!harvestMetas.some((m) => m.family === fam)) continue;
    const b = base.themes.find((t) => t.id === baseId);
    themes.push({
      ...(b ?? {}), id: fam, base: baseId, kind: 'archetype', source: 'harvest',
      name: `真实·${fam.split('.')[1]}`, nameEn: `Real ${fam.split('.')[1]}`,
      tagline: '这是那台机器真正的几何', taglineEn: 'The actual geometry of the actual machine',
    });
  }

  writeFileSync(resolve(OUT, 'parts.json'), JSON.stringify({
    ...base,
    generatedAt: new Date().toISOString(),
    themes,
    parts: [
      ...base.parts.map((p) => ({ ...p, file: `../${p.file}` })),   // 同一批 glb，不复制第二份
      ...harvestMetas.map((m) => ({ ...m, file: `${m.id}.glb` })),
    ],
  }, null, 2));
}
