/**
 * docs/26 §H / §I 的 girth 区间：uniform 槽位的件，`localGirth` 必须落在该槽位中位数的
 * [0.7×, 1.3×] 里 —— uniform 槽位会把这个比例**直接变成尺寸**。
 *
 * **只有这一份定义。** 两个读者：
 *  - `factory/src/check-parts.ts` 拿它报警告（合并门）；
 *  - `core/src/borrow.ts` 拿它挡借件：越界件只留给它自己的物种用，**不借给别人**。
 * 放在 core 而不是 factory，是因为依赖只许向下指：factory 可以 import core，
 * core 不能 import factory（AGENTS.md 不变量）。纯函数，不读文件。
 */
import { SLOT_FIT } from './tuning.ts';
import type { PartMeta, Slot } from './types.ts';

export const GIRTH_BAND: readonly [number, number] = [0.7, 1.3];

/** 样本少于这个数时中位数没有意义，那个槽位不判 */
const MIN_SAMPLES = 3;

export const median = (xs: readonly number[]): number => {
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * 受区间约束的槽位 = uniform 槽位，**脚除外**：`assemble.ts` 给脚传了 `axisLength`
 * （脚长从骨长算），横向又被 girth 归一化回 `SLOT_WIDTH.foot` —— 两个方向都把
 * localGirth 除干净了，它对成品没有影响（这条例外原来写在 check-parts.ts 里，一字未改地搬过来）。
 */
export function girthBandSlots(): Slot[] {
  return (Object.keys(SLOT_FIT) as Slot[]).filter((s) => SLOT_FIT[s] === 'uniform' && s !== 'foot');
}

export interface GirthOutlier {
  part: PartMeta;
  slot: Slot;
  /** localGirth / 该槽位中位数 */
  ratio: number;
}

/**
 * 越界件。中位数**每次现算**、按 `parts` 里该槽位的全部件算（含策展否掉的 ——
 * 和 check-parts 原来的口径一致；派生数只在派生的那一刻为真，P21）。
 */
export function girthOutliers(parts: readonly PartMeta[]): GirthOutlier[] {
  const out: GirthOutlier[] = [];
  for (const slot of girthBandSlots()) {
    const inSlot = parts.filter((p) => p.slot === slot && Number.isFinite(p.localGirth));
    if (inSlot.length < MIN_SAMPLES) continue;
    const mid = median(inSlot.map((p) => p.localGirth));
    if (!(mid > 0)) continue;
    for (const p of inSlot) {
      const ratio = p.localGirth / mid;
      if (ratio < GIRTH_BAND[0] || ratio > GIRTH_BAND[1]) out.push({ part: p, slot, ratio });
    }
  }
  return out;
}
