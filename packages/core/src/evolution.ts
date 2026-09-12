/**
 * 演化状态机：运动能量 → charge → tier。见 docs/05 §3。
 * 现场调参只改 EVOLUTION_TUNING。
 */
import type { EvolutionState, MotionFeatures, Tier } from './types.ts';

export const EVOLUTION_TUNING = {
  gain: 1.0,
  decay: 0.08,
  /** 各档的 charge 阈值 */
  thresholds: [0, 1.5, 5.0, 11.0],
  /** 降档滞回：低于 threshold*(1-hysteresis) 才降 */
  hysteresis: 0.25,
  /** 两次换装之间最小间隔（秒），防止在阈值附近反复横跳 */
  cooldown: 2.0,
  chargeMax: 14.0,
};

export interface EvolutionMachine {
  update(f: MotionFeatures, dt: number): EvolutionState;
  readonly state: EvolutionState;
  reset(): void;
}

export function createEvolution(): EvolutionMachine {
  let charge = 0;
  let tier: Tier = 0;
  let sinceChange = Infinity;
  let tierChanged = false;

  const T = EVOLUTION_TUNING;

  function tierFor(c: number, cur: Tier): Tier {
    let up: Tier = 0;
    for (let k = 3; k >= 1; k--) if (c >= T.thresholds[k]) { up = k as Tier; break; }
    if (up > cur) return up;
    // 降档要过滞回
    let down: Tier = cur;
    while (down > 0 && c < T.thresholds[down] * (1 - T.hysteresis)) down = (down - 1) as Tier;
    return down;
  }

  return {
    update(f, dt) {
      if (!Number.isFinite(dt) || dt <= 0) dt = 1 / 60;
      const energy = Number.isFinite(f?.energy) ? Math.max(0, f.energy) : 0;
      charge = Math.min(T.chargeMax, Math.max(0, charge + (energy * T.gain - T.decay) * dt));
      sinceChange += dt;

      tierChanged = false;
      const want = tierFor(charge, tier);
      if (want !== tier && sinceChange >= T.cooldown) {
        tier = want; tierChanged = true; sinceChange = 0;
      }

      const lo = T.thresholds[tier];
      const hi = T.thresholds[Math.min(3, tier + 1)];
      const progress = tier >= 3 ? 1 : Math.min(1, Math.max(0, (charge - lo) / Math.max(1e-6, hi - lo)));
      return { charge, tier, tierChanged, progress };
    },
    get state() {
      const lo = EVOLUTION_TUNING.thresholds[tier];
      const hi = EVOLUTION_TUNING.thresholds[Math.min(3, tier + 1)];
      return { charge, tier, tierChanged, progress: tier >= 3 ? 1 : (charge - lo) / Math.max(1e-6, hi - lo) };
    },
    reset() { charge = 0; tier = 0; sinceChange = Infinity; tierChanged = false; },
  };
}
