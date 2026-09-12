/**
 * TODO(T-08) —— 见 docs/11-TASKS.md，规格在 docs/05-SPEC §1。
 * 唯一的随机源必须是 mulberry32(seed ^ (tier * 0x9E3779B9))。
 * 同样的 (seed, tier, index) 必须永远得到同样的 Genome（P9）。
 */
import type { Genome, PartLibraryIndex, Tier } from './types.ts';

export function makeGenome(_seed: number, _tier: Tier, _index: PartLibraryIndex): Genome {
  throw new Error('not implemented — docs/11-TASKS.md T-08');
}
