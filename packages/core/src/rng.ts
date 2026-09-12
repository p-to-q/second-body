/** 确定性随机。P1：禁止裸用 Math.random()。 */
import type { Rng } from './types.ts';

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (m) => Math.floor(next() * m),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    weighted: (arr, weights) => {
      let total = 0;
      for (const w of weights) total += Math.max(0, w);
      if (total <= 0) return arr[Math.floor(next() * arr.length)];
      let r = next() * total;
      for (let i = 0; i < arr.length; i++) { r -= Math.max(0, weights[i]); if (r <= 0) return arr[i]; }
      return arr[arr.length - 1];
    },
  };
}

/** 字符串 → uint32 种子（FNV-1a），用于给 recipe/session 起稳定种子 */
export function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
