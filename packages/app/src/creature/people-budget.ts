/**
 * 台上几具身体放得下（docs/50 §5，`docs/02` P5）。纯函数：不碰 three，只读面数上界。
 *
 * ## 身体们怎么画（`creature.ts` 的 companions）
 *
 * 所有身体**共用同一份 genome、同一组桶**：每个桶的实例数 × N，draw call 不变。
 * 差异（每个人一个颜色）走 `InstancedMesh.instanceColor`，不开新桶。
 * 于是 draw call 的预算和单人**完全相同**（`outline-budget` / `swap-budget` 已经守着），
 * 这里只剩一个数要算：**面数**。
 *
 * ## 面数怎么算
 *
 *   一具身体最坏那一帧的填充面数 = `fill`（稳态 + 交接多出来的，一遍）
 *   主身体带描边：× 2；伴随身体（非主身体）永远不带描边：× 1
 *   N 具：  fill × (描边 ? 2 : 1) + (N − 1) × fill  ≤  BUDGET.maxTriangles
 *
 * 描边外壳和填充共用 `instanceMatrix`，外壳的 `count` 只数主身体那几份 —— 所以"伴随身体不带描边"不花任何东西。
 *
 * ## `fill` 取哪个数
 *
 * - **忒修斯开着**：借件门（`swap-budget.ts` 的 `makeAdmit`）保证任何时刻一具身体最坏那一帧 ≤ `fillBudget(2)`
 *   = 125k。借件在三分钟里一直会发生，所以这里取这个**被保证的**上界，而不是开场那一具的实际面数 ——
 *   按开场算，第三分钟借来一件重的，台上就得溶掉一个人（docs/50 §5.2 否掉的那条路）。
 * - **忒修斯关着**：身体只跟着四档走，上界是本物种每一格最重那件的最坏一帧（`worstFrame(own, passes, false)`）。
 *
 * 结论（docs/50 §5.3 的表）：忒修斯开着时**两具、伴随身体进场时主身体的描边让位**；
 * 第三具要等伴随身体的低面数 LOD（docs/50 §8 第 1 条），在那之前第三个人和超过上限的人同一个待遇：没有身体。
 */
import { ALL_SLOT_KEYS, SLOT_OF_BONE } from '../../../core/src/slots.ts';
import { BUDGET } from '../../../core/src/tuning.ts';
import type { PartLibraryIndex, Slot, SlotKey } from '../../../core/src/types.ts';
import { fillBudget, ownMaxTris, passesOf, worstFrame } from './swap-budget.ts';

export interface PeoplePlan {
  /** 台上最多几具身体（≤ 想要的人数） */
  bodies: number;
  /** 有伴随身体在场时，主身体还带不带描边。`false` = 伴随身体进场时描边让位，走了再回来 */
  outlineWithCompanions: boolean;
  /** 算这个结论用的那一具身体的最坏填充面数 */
  fill: number;
  /** 最坏那一帧的总面数（按上面两个结论） */
  tris: number;
}

/** N 具身体最坏那一帧的总面数 */
export function trisFor(bodies: number, fill: number, primaryPasses: number): number {
  const n = Math.max(1, Math.floor(bodies));
  return fill * Math.max(1, primaryPasses) + (n - 1) * fill;
}

/**
 * 想要 `want` 个人，给定一具身体的面数上界，台上放几具、描边留不留。
 * 从想要的人数往下试：先试"主身体留描边"，放不下再试"描边让位"，都放不下就少一具。
 * 单人永远是 1 具、描边照物种声明（这一版之前的行为）。
 */
export function planPeople(want: number, fill: number, shading: string): PeoplePlan {
  const passes = passesOf(shading);
  const f = Number.isFinite(fill) && fill > 0 ? fill : fillBudget(passes);
  for (let n = Math.max(1, Math.floor(want)); n >= 2; n--) {
    if (trisFor(n, f, passes) <= BUDGET.maxTriangles) return { bodies: n, outlineWithCompanions: passes > 1, fill: f, tris: trisFor(n, f, passes) };
    if (passes > 1 && trisFor(n, f, 1) <= BUDGET.maxTriangles) return { bodies: n, outlineWithCompanions: false, fill: f, tris: trisFor(n, f, 1) };
  }
  return { bodies: 1, outlineWithCompanions: passes > 1, fill: f, tris: trisFor(1, f, passes) };
}

/**
 * 一具身体的面数上界（见文件头「`fill` 取哪个数」）。
 * @param theseus 忒修斯开着没有（`?theseus=off` 时 false）
 */
export function bodyFill(index: PartLibraryIndex, theme: string, shading: string, theseus: boolean, rejected?: ReadonlySet<string>): number {
  const passes = passesOf(shading);
  // 借件门按描边（2 遍）守：着色语言能被 O 键切过去，它按更贵的那一种算（`makeAdmit` 的缺省）
  if (theseus) return fillBudget(2);
  const own: Partial<Record<Slot, number>> = ownMaxTris(index, theme, rejected);
  const bound = {} as Record<SlotKey, number>;
  for (const key of ALL_SLOT_KEYS) bound[key] = own[key === 'joint' ? 'joint' : SLOT_OF_BONE[key]] ?? BUDGET.maxPartTris;
  return worstFrame(bound, passes, false).fill;
}
