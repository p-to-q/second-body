/**
 * TODO(T-06) —— 见 docs/11-TASKS.md，规格在 docs/05-SPEC §2。
 * 全部特征除以 sk.height 归一化；所有 EMA 用 filter.ts 的 emaAlpha(dt, τ)（帧率无关）。
 */
import type { MotionFeatures, Skeleton } from './types.ts';

export interface MotionMachine {
  update(sk: Skeleton, dt: number): MotionFeatures;
  readonly features: MotionFeatures;
  reset(): void;
}

export function createMotion(): MotionMachine {
  throw new Error('not implemented — docs/11-TASKS.md T-06');
}
