/**
 * 姿态时钟 —— 推理的节拍 → 渲染的节拍。**纯的**：时间全部由调用方给（AGENTS 不变量）。
 *
 * stub：先把接口立住，让守卫先红（docs/15 §6.8）。
 */
import type { RawPose } from '../../../core/src/types.ts';

export type PoseClockState = 'waiting' | 'live' | 'extrapolating' | 'holding' | 'stalled' | 'empty';

export interface PoseClock {
  observe(pose: RawPose | null, inferredAt: number): void;
  sample(now: number): RawPose | null;
  readonly state: PoseClockState;
  readonly intervalMs: number;
  reset(): void;
}

export function createPoseClock(): PoseClock {
  let latest: RawPose | null = null;
  return {
    observe(pose) { latest = pose; },
    sample() { return latest; },
    get state() { return 'live' as PoseClockState; },
    get intervalMs() { return 0; },
    reset() { latest = null; },
  };
}
