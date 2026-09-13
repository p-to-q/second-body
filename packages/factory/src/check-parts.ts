/**
 * 规范化契约的可执行版本（docs/03 §6）。
 * 文档会撒谎，这个不会。合并门 `npm run check` 会跑它。
 * 没有资产时视为通过（ADR-4：无资产也能开发）。
 */
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { PARTS_DIR } from './ledger.ts';
import { glbStats } from './glb-stats.ts';
import { SLOT_FIT } from '../../core/src/tuning.ts';
import { entryById, isPublic, SIGNATURE_SLOTS } from '../recipes/roster.ts';
import type { PartLibraryIndex, Slot, ThemeDef } from '../../core/src/types.ts';

const EPS = 2e-3;
const MAX_TRIS = 5000;
const MAX_BYTES = 1_500_000;   // docs/02 P5 的单件预算

/** docs/26 §H / §I：uniform 槽位的 girth 必须落在该槽位中位数的这个区间里 */
const GIRTH_BAND: [number, number] = [0.7, 1.3];
/** `remapSkeleton` 里把整份 spec 换成预设、只认 kind 的那两个拓扑（bodyplan.ts 的 switch） */
const PRESET_ONLY_KINDS = new Set(['stub', 'towering']);
/** 一件槽位件都不实例化的身体方案（docs/18 B 档）—— 对它们问"凑不凑得齐件"没有意义 */
const PLANS_WITHOUT_PARTS = new Set(['mass', 'swarm']);

const median = (xs: number[]): number => {
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const planKindOf = (t: ThemeDef): string => {
  const bp = t.bodyPlan;
  return typeof bp === 'string' ? bp : (bp?.kind ?? 'rig');
};

async function importCuration() { return await import('./curation.ts'); }

export async function checkParts(): Promise<number> {
  const indexPath = resolve(PARTS_DIR, 'parts.json');
  if (!existsSync(indexPath)) { console.log('check:parts — 没有 parts.json，跳过（运行时会用占位几何）'); return 0; }
  const index: PartLibraryIndex = JSON.parse(readFileSync(indexPath, 'utf8'));
  const errs: string[] = [];
  const warns: string[] = [];

  if (index.convention.axis !== '+Y' || index.convention.length !== 1) errs.push('convention 与 docs/03 不符');

  const seen = new Set<string>();
  for (const p of index.parts) {
    const file = resolve(PARTS_DIR, p.file);
    if (seen.has(p.id)) errs.push(`${p.id}: id 重复`);
    seen.add(p.id);
    if (!existsSync(file)) { errs.push(`${p.id}: 文件缺失 ${p.file}`); continue; }
    const s = glbStats(file);
    if (Math.abs(s.size[1] - 1) > EPS) errs.push(`${p.id}: 长度 ${s.size[1].toFixed(4)} ≠ 1.0`);
    if (Math.abs(s.min[1]) > EPS) errs.push(`${p.id}: socketA 不在原点 y=${s.min[1].toFixed(4)}`);
    if (Math.abs((s.min[0] + s.max[0]) / 2) > EPS * 5) warns.push(`${p.id}: X 未居中 ${((s.min[0]+s.max[0])/2).toFixed(4)}`);
    if (Math.abs((s.min[2] + s.max[2]) / 2) > EPS * 5) warns.push(`${p.id}: Z 未居中 ${((s.min[2]+s.max[2])/2).toFixed(4)}`);
    if (s.triangles > MAX_TRIS) errs.push(`${p.id}: ${s.triangles} tris > ${MAX_TRIS}`);
    if (s.bytes > MAX_BYTES) errs.push(`${p.id}: ${(s.bytes/1e6).toFixed(1)} MB > ${(MAX_BYTES/1e6).toFixed(1)} MB（多半是 prune 没跑，旧 buffer 还在）`);
    if (s.meshes !== 1) warns.push(`${p.id}: ${s.meshes} 个 mesh（契约要求 1）`);
    if (s.hasAnimation || s.hasSkin) errs.push(`${p.id}: 含动画/骨骼`);
    if (s.images > 0) warns.push(`${p.id}: 仍带 ${s.images} 张贴图（应在规范化时删掉）`);
    if (Math.abs(p.localGirth - Math.max(s.size[0], s.size[2])) > EPS * 5) errs.push(`${p.id}: localGirth 与几何不符`);
  }

  // 槽位覆盖：任一 tier 下，每个骨头槽位都要至少有一个候选，否则运行时会大面积回退占位
  const SLOTS = ['head','spine','clavicle','upperArm','foreArm','hand','thigh','shin','foot','joint'];
  for (const t of [1, 2, 3]) for (const slot of SLOTS) {
    if (!index.parts.some((p) => p.slot === slot && p.tier <= t)) warns.push(`tier${t} 的 ${slot} 槽位没有候选`);
  }

  /**
   * docs/26 §H / §I 的那条「真实几何不能免检」：`head`/`spine`/`hand`/`foot`/`joint`
   * 运行时是 **uniform 缩放**（`SLOT_WIDTH / localGirth`，忽略骨长），所以一件
   * 长宽比跑偏的件不会被截成"稍微怪一点"，而是被整件放大成一根杆子。
   *
   * 中位数**每次现算**，不写死（P21 第 2 条：派生数只在派生的那一刻为真）。
   * 槽位用 `SLOT_FIT` 而不是在这里再抄一张表 —— 抄一张就会有一天对不上。
   */
  const uniformSlots = (Object.keys(SLOT_FIT) as Slot[])
    .filter((s) => SLOT_FIT[s] === 'uniform')
    // 脚是例外，而且 §H 那张名单在这一点上已经过期：`assemble.ts` 给脚传了
    // `axisLength`（脚长从骨长算，见 tuning.ts 的 FOOT），横向又被 girth 归一化回
    // `SLOT_WIDTH.foot` —— 两个方向都把 localGirth 除干净了，它对成品**没有影响**。
    // 把它留在检查里只会稳定地报 7 条永远不用管的警告，那就是仪表噪声。
    .filter((s) => s !== 'foot');
  for (const slot of uniformSlots) {
    const girths = index.parts.filter((p) => p.slot === slot).map((p) => p.localGirth);
    if (girths.length < 3) continue;              // 样本太少，中位数没有意义
    const mid = median(girths);
    for (const p of index.parts.filter((x) => x.slot === slot)) {
      const ratio = p.localGirth / mid;
      if (ratio >= GIRTH_BAND[0] && ratio <= GIRTH_BAND[1]) continue;
      warns.push(`${p.id}: girth ${p.localGirth.toFixed(4)} = ${slot} 中位数的 ${ratio.toFixed(2)}×`
        + `（docs/26 §H 要求 ${GIRTH_BAND[0]}×–${GIRTH_BAND[1]}×；uniform 槽位会把这个比例直接变成尺寸）`);
    }
  }

  /**
   * `bodyPlan: { kind: 'stub' | 'towering', ... }` 的比例字段会被**丢掉**。
   * `bodyplan.ts` 的 switch 对这两个 kind 走的是 `proportion(sk, PRESETS[kind])`，
   * 用的是预设而不是条目自己的 spec，出口那一遍又被 `FIXED_PROPORTION` 挡住。
   * 实测：`{kind:'stub',head:2.1,limb:0.3,torso:0.9}` 与 `'stub'` 输出的关节坐标一模一样。
   * 于是 parts.json 里那几个数是**装饰**：条目声明了一种身材，运行时给的是另一种。
   */
  for (const t of index.themes ?? []) {
    const bp = t.bodyPlan;
    if (typeof bp !== 'object' || bp === null) continue;
    if (!PRESET_ONLY_KINDS.has(bp.kind ?? '')) continue;
    const dropped = (['limb', 'torso', 'head', 'arm', 'leg'] as const).filter((k) => bp[k] !== undefined);
    if (dropped.length) {
      warns.push(`${t.id}: bodyPlan kind='${bp.kind}' 会丢掉它自己的比例 ${dropped.join('/')}`
        + `（bodyplan.ts 对 stub/towering 只认预设）—— 声明的身材不是运行时的身材`);
    }
  }

  const { loadCuration, summary } = await importCuration();
  const cur = loadCuration();
  const rejected = Object.entries(cur).filter(([, e]) => e.verdict === 'reject').map(([id]) => id);
  const stillIndexed = rejected.filter((id) => index.parts.some((p) => p.id === id));
  if (stillIndexed.length) {
    // 这句话以前是假的：它写着「genome 会排除它们」，而当时**没有任何调用者**把
    // rejected 传进 makeGenome。检查每次都绿，问的却是让人舒服的那个问题（docs/02 P21）。
    // 现在排除是真的发生的：app 层 `createPartLibrary` 拉 /parts/curation.json，
    // 把 reject 的 id 传给 `makeGenome({ rejected })`。文件保留仍然是故意的（curation.ts 规则 2）。
    warns.push(`${stillIndexed.length} 件已标 reject 但仍在 parts.json 里：`
      + `运行时由 curation.json → makeGenome({ rejected }) 排除，文件保留是故意的（${stillIndexed.join(', ')}）`);

    // 这一条才是「坏掉时会变样」的那个仪表：某个物种的自有件被 reject 光了。
    // 它不会消失（名单只看 tier，不看策展），但它整具都要沿 base 链借件 ——
    // 借不到就只剩占位几何，那是一个物种事实上的死亡，必须当场看见。
    const rejectedSet = new Set(rejected);
    const own = (fam: string, curated: boolean) =>
      index.parts.filter((p) => p.family === fam && (!curated || !rejectedSet.has(p.id))).length;
    for (const t of index.themes ?? []) {
      if (!own(t.id, false) || own(t.id, true)) continue;      // 本来就没自有件 / 还剩自有件
      // 沿整条 base 链找第一个还供得上件的祖先（genome.ts 的 baseChain 就是这么走的）
      let cur = t.base, donor: string | undefined, seen = new Set([t.id]);
      while (cur && !seen.has(cur)) {
        seen.add(cur);
        if (own(cur, true)) { donor = cur; break; }
        cur = (index.themes ?? []).find((x) => x.id === cur)?.base;
      }
      const msg = `${t.id}: 自有件已被 reject 光，整具沿 base 链借件`;
      if (donor) warns.push(`${msg}（← ${donor}）`);
      else errs.push(`${msg}，但 base 链上没有一层供得上件 —— 这个物种只会出占位几何`);
    }
  }
  /**
   * 两条「这个物种在画面上还在不在」的仪表。`check:parts` 一直只数件数，
   * 而件数在这两种坏法下**一个都不少**（docs/02 P21：问一个坏掉时会变样的问题）。
   *
   * 1. **点不到的物种**：`makeGenome` 的名单是 `parts.json` 里出现过的 family。
   *    一个条目一件自有件都没有进过索引，`themes.includes(opt.theme)` 就是 false，
   *    于是 `{ theme: 'char.diva' }` **静默变成另一个物种** —— 没有报错、没有警告，
   *    观众选的那一具身体和他看到的那一具不是同一个。
   *    （`mass` / `swarm` 本来就不实例化任何件，不适用。）
   * 2. **借光了的物种**：自有件全被策展否掉之后，整具沿 base 链借件 ——
   *    上面那一条已经报了，这里补的是 `coverage` 说好的件数与实际的差额：
   *    `light` 声明了 6 个标志性槽位，少一个就少一分辨识度。
   */
  /**
   * `clearance` 那道门（docs/14 §2）**没有执行者**：`index-parts.ts` 把整个 ROSTER
   * 原样写进 parts.json，从来不问 `isPublic()`，而 parts.json 是要进 dist 的。
   * 现在没出事只是因为唯一一个非 `own` 的条目正好没有 look、也没有件 ——
   * 「没出事」不是「有门」。这条警告就是那道门暂时的执行者。
   */
  for (const t of index.themes ?? []) {
    const entry = entryById(t.id);
    if (entry && !isPublic(entry)) {
      warns.push(`${t.id}: clearance='${entry.clearance}'，按 docs/14 §2 不该进公开构建，`
        + `但 index-parts.ts 不看 clearance，它已经在 parts.json 里`);
    }
  }

  const rejectedIds = new Set(rejected);
  const familiesInIndex = new Set(index.parts.map((p) => p.family));
  const liveOwnSlots = (fam: string) =>
    new Set(index.parts.filter((p) => p.family === fam && !rejectedIds.has(p.id)).map((p) => p.slot));
  for (const t of index.themes ?? []) {
    if (PLANS_WITHOUT_PARTS.has(planKindOf(t))) continue;
    if (t.source === 'procedural') continue;
    if (!familiesInIndex.has(t.id)) {
      warns.push(`${t.id}: parts.json 里一件自有件都没有 —— `
        + `makeGenome 的物种名单来自 family，点它会静默换成别的物种（实测渲染出来的是 base）`);
      continue;
    }
    const have = liveOwnSlots(t.id) as Set<string>;
    const missing = SIGNATURE_SLOTS.filter((s) => !have.has(s));
    if (t.coverage === 'light' && missing.length) {
      warns.push(`${t.id}: coverage='light' 说好 ${SIGNATURE_SLOTS.length} 个标志性槽位，`
        + `实际只有 ${SIGNATURE_SLOTS.length - missing.length} 个（缺 ${missing.join('/')}，沿 base 链借）`);
    }
  }

  console.log(`  策展: ${summary(cur)}`);

  for (const w of warns) console.warn('  ⚠ ' + w);
  for (const e of errs) console.error('  ✗ ' + e);
  console.log(`check:parts — ${index.parts.length} 件, ${errs.length} 错, ${warns.length} 警告`);
  return errs.length ? 1 : 0;
}

// 注意：路径含非 ASCII 时 import.meta.url 会被百分号编码，必须用 pathToFileURL 比较
if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(await checkParts());
