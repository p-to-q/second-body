/**
 * 交接中的身体**最坏**要画多少（`docs/02` P5）。纯函数：不碰 three，只读 `PartMeta`。
 *
 * 为什么需要它：稳态的身体被 `test/outline-budget.test.ts` 守着，但交接那几帧不是稳态 ——
 * 2026-09-14 无头 Chrome 正常速率实测 porcelain 42/40 draw、338k/250k 面。三处来源：
 *
 *  1. **draw call**：每个在交接的槽位多开一个桶（新件）。描边模式每桶两次提交，
 *     18 个槽位 = 18 桶 = 36/40 —— 余量是 2 个桶，而 `MORPH.maxConcurrentSwaps` 是 3，
 *     `replace()` 还能再叠一件。→ `swapCeiling()`：上限从预算里**算**出来。
 *  2. **面数**：一件实例的面数和它画得多大无关。关节那一格 13 处盖片同时交接
 *     = 39 份几何。→ `replace-event.ts` 的关节波（`THESEUS.jointWave`）。
 *  3. **借件**：远处物种的件可以比本物种自己的重得多（patrol 的件 46–5000 面）。
 *     全身每一格都借到最重的那件 = 145k 面填充 → 描边 290k，一件都不交接就越界。
 *     → `makeAdmit()`：借件之前先算"借了之后最坏那一帧"，放不下的件不进池子。
 *
 * 最坏那一帧 = 稳态（每一格 × 实例数 × 这一格的面数上界）
 *            + 一件替换多出来的几何 + (上限 − 1) 件交叉淡入多出来的几何。
 * 多出来的份数不是手写的常数：`eventExtra()` 把 `replaceRenders` / `crossfadeRenders`
 * 在 [0,1] 上扫一遍数出来 —— 改墨屑片数、改关节波宽，这里跟着变。
 */
import { ALL_SLOT_KEYS, SLOT_OF_BONE } from '../../../core/src/slots.ts';
import { PLACEHOLDER_PREFIX } from '../../../core/src/genome.ts';
import { BUDGET, MORPH } from '../../../core/src/tuning.ts';
import type { Genome, PartLibraryIndex, PartMeta, Slot, SlotKey, SlotPick } from '../../../core/src/types.ts';
import { JOINT_CAPS, type SlotRender } from './assemble.ts';
import { crossfadeRenders, replaceRenders } from './replace-event.ts';

/** 描边模式每个桶提交两次（填充 + 外壳），平涂之外的着色一次 */
export const passesOf = (shading: string): number => (shading === 'toon' ? 2 : 1);

/** 一格在稳态下画几份：关节那一格是每一处盖片一份，骨头件一份 */
export const instancesOf = (key: SlotKey): number => (key === 'joint' ? JOINT_CAPS.length : 1);

/**
 * 同时在交接的件数上限（交叉淡入 + 替换一起算）。
 * draw call 预算按提交次数折成桶，扣掉稳态每个槽位一个桶，剩下的就是能同时开的新桶。
 * 不高于 docs/05 §3 的 `MORPH.maxConcurrentSwaps`（"整个人炸开"那条），也不低于 1。
 */
export function swapCeiling(passes: number): number {
  const spare = Math.floor(BUDGET.maxDrawCalls / Math.max(1, passes)) - ALL_SLOT_KEYS.length;
  return Math.max(1, Math.min(MORPH.maxConcurrentSwaps, spare));
}

const OLD: SlotPick = { partId: 'budget.old', materialRole: 'primary' };
const NEW: SlotPick = { partId: 'budget.new', materialRole: 'primary' };

/** 一条渲染会落到几处上（`caps` 区间外的盖片不画；缩没的不占实例位，和 `assemble()` 同一条） */
function spanOf(r: SlotRender, key: SlotKey): number {
  if ((r.scale ?? 1) <= 1e-3) return 0;
  if (key !== 'joint') return 1;
  return r.caps ? Math.max(0, Math.min(JOINT_CAPS.length, r.caps[1]) - Math.max(0, r.caps[0])) : JOINT_CAPS.length;
}

const extraMemo = new Map<string, number>();

/**
 * 这一格交接时，最坏那一刻比稳态**多**画几份几何。在 t ∈ [0,1] 上扫 401 个点取最大。
 * 结果按 (kind, 骨头/关节) 缓存 —— 它只依赖 tuning 里那几个数，一场里不变。
 */
export function eventExtra(kind: 'replace' | 'crossfade', key: SlotKey): number {
  const memoKey = `${kind}:${key === 'joint' ? 'joint' : 'bone'}`;
  const hit = extraMemo.get(memoKey);
  if (hit !== undefined) return hit;
  const renders = kind === 'replace' ? replaceRenders : crossfadeRenders;
  let worst = 0;
  for (let i = 0; i <= 400; i++) {
    let n = 0;
    for (const r of renders(key, OLD, NEW, i / 400)) n += spanOf(r, key);
    worst = Math.max(worst, n - instancesOf(key));
  }
  extraMemo.set(memoKey, worst);
  return worst;
}

/** 测试改了 tuning 之后要重算（生产路径一场里 tuning 不变，用不到） */
export function clearEventExtraMemo(): void { extraMemo.clear(); }

const slotOfKey = (key: SlotKey): Slot => (key === 'joint' ? 'joint' : SLOT_OF_BONE[key]);

/**
 * 这个物种自己的件里，每个槽位类型最重的一件（所有 tier）。
 * 升档会把没被换过的格子换成本物种更高 tier 的件，所以没被借过的格子按这个数算上界。
 */
export function ownMaxTris(index: PartLibraryIndex, theme: string, rejected?: ReadonlySet<string>): Partial<Record<Slot, number>> {
  const out: Partial<Record<Slot, number>> = {};
  for (const p of index.parts ?? []) {
    if (!p || p.family !== theme || rejected?.has(p.id) || p.id.startsWith(PLACEHOLDER_PREFIX)) continue;
    const tris = Number.isFinite(p.triCount) ? p.triCount : BUDGET.maxPartTris;
    out[p.slot] = Math.max(out[p.slot] ?? 0, tris);
  }
  return out;
}

export interface FrameBound {
  /** 最坏那一帧的填充面数（一遍，不含描边） */
  fill: number;
  /** 其中稳态那一部分 */
  steady: number;
  /** 其中交接多出来的那一部分，和它落在哪几格 */
  events: number;
  replaceKey: SlotKey | null;
  crossfadeKeys: SlotKey[];
}

/**
 * 给定每一格的面数上界，最坏那一帧画多少。
 * `replace` = 这一场有没有替换（`?theseus=off` 时没有，上限全给交叉淡入）。
 * 最坏的组合是逐格枚举替换那一格、剩下的名额给多出来最多的几格交叉淡入 —— 18 格，不贵。
 */
export function worstFrame(
  bound: Readonly<Record<SlotKey, number>>, passes: number, replace = true,
): FrameBound {
  let steady = 0;
  for (const key of ALL_SLOT_KEYS) steady += instancesOf(key) * Math.max(0, bound[key] ?? 0);
  const ceiling = swapCeiling(passes);
  const xfade = ALL_SLOT_KEYS
    .map((key) => ({ key, extra: eventExtra('crossfade', key) * Math.max(0, bound[key] ?? 0) }))
    .sort((a, b) => b.extra - a.extra);
  const topCrossfades = (n: number, skip: SlotKey | null) => {
    const keys: SlotKey[] = [];
    let sum = 0;
    for (const x of xfade) {
      if (keys.length >= n) break;
      if (x.key === skip) continue;
      keys.push(x.key);
      sum += x.extra;
    }
    return { keys, sum };
  };
  let best: FrameBound = { fill: steady, steady, events: 0, replaceKey: null, crossfadeKeys: [] };
  if (!replace) {
    const c = topCrossfades(ceiling, null);
    return { fill: steady + c.sum, steady, events: c.sum, replaceKey: null, crossfadeKeys: c.keys };
  }
  for (const key of ALL_SLOT_KEYS) {
    const rep = eventExtra('replace', key) * Math.max(0, bound[key] ?? 0);
    const c = topCrossfades(ceiling - 1, key);
    const events = rep + c.sum;
    if (steady + events > best.fill) best = { fill: steady + events, steady, events, replaceKey: key, crossfadeKeys: c.keys };
  }
  return best;
}

/** 填充一遍能用的面数 */
export const fillBudget = (passes: number): number => BUDGET.maxTriangles / Math.max(1, passes);

/**
 * 这具身体此刻每一格的面数上界：现在那一件和本物种这一格最重的那件取大。
 * 取大而不是只看现在那一件，是因为升档会把没被换过的格子换成本物种更重的件，
 * 而这一层看不见哪几格被换过（那张表在 `main.ts`）。
 */
export function boundOf(
  genome: Genome, index: PartLibraryIndex, own: Partial<Record<Slot, number>>,
  metaOf: (id: string) => PartMeta | undefined,
): Record<SlotKey, number> {
  const out = {} as Record<SlotKey, number>;
  for (const key of ALL_SLOT_KEYS) {
    const id = genome.slots?.[key]?.partId;
    const m = id ? metaOf(id) : undefined;
    const cur = m && Number.isFinite(m.triCount) ? m.triCount : 0;
    out[key] = Math.max(cur, own[slotOfKey(key)] ?? 0);
  }
  return out;
}

export interface AdmitOptions {
  genome: Genome;
  index: PartLibraryIndex;
  slot: SlotKey;
  rejected?: ReadonlySet<string>;
  /**
   * 按几遍提交算。缺省 2（描边）：着色语言在现场可以被 O 键切换，
   * 借件这一刻按更贵的那一种算，切过去不会越界。
   */
  passes?: number;
}

/**
 * 借件的预算门（`borrowPart` 的 `admit`）：候选件换上 `slot` 之后，最坏那一帧还放得下才放行。
 * 替换那一格按新旧两件里重的那件算 —— 替换进行中旧件的芯和墨屑与新件同时在场。
 */
export function makeAdmit(opt: AdmitOptions): (candidate: PartMeta) => boolean {
  const passes = opt.passes ?? 2;
  const byId = new Map((opt.index.parts ?? []).map((p) => [p.id, p]));
  const own = ownMaxTris(opt.index, opt.genome.theme, opt.rejected);
  const bound = boundOf(opt.genome, opt.index, own, (id) => byId.get(id));
  const budget = fillBudget(passes);
  const base = bound[opt.slot];
  return (candidate) => {
    const tris = Number.isFinite(candidate?.triCount) ? candidate.triCount : BUDGET.maxPartTris;
    bound[opt.slot] = Math.max(base, tris);
    const fits = worstFrame(bound, passes).fill <= budget;
    bound[opt.slot] = base;
    return fits;
  };
}
