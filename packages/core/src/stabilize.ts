/**
 * TODO(T-04) —— 见 docs/11-TASKS.md，规格在 docs/04-SPEC §3。
 * 方向来自模型，长度来自统计：90 帧滑动中位数 + 前向运动学重建。
 * 没有这一步，角色会以 ±15% 的幅度"呼吸"。
 */
import type { Skeleton } from './types.ts';

export interface Stabilizer {
  apply(sk: Skeleton, dt: number): Skeleton;
  reset(): void;
}

export function createStabilizer(_windowFrames = 90, _warmupFrames = 30): Stabilizer {
  throw new Error('not implemented — docs/11-TASKS.md T-04');
}
