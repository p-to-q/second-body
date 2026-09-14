/**
 * 运动特征：连续两帧骨架 → MotionFeatures。规格见 docs/05-SPEC §2。
 *
 * 两条不可妥协的性质：
 *  1. **无量纲**：所有长度都除以 `sk.height`，换个人、换个站位都读出同样的数。
 *  2. **帧率无关**：所有 EMA 用 `filter.ts` 的 `emaAlpha(dt, τ)`（a = 1 - e^(-dt/τ)）。
 *     固定系数会让同一段动作在 30fps 和 60fps 下读出不同的 energy，
 *     现场机器一降频整条演化曲线就变了。
 *
 * 时间常数与阈值全部来自 tuning.ts，本文件不声明自己的常数表（P0）。
 */
import type { MotionFeatures, Skeleton, Vec3 } from './types.ts';
import { CAPTURE, MOTION as MOTION_TUNING, SKELETON, TIME } from './tuning.ts';
import { emaAlpha } from './filter.ts';
import { BONES } from './skeleton.ts';

export { MOTION_TUNING };

export interface MotionMachine {
  update(sk: Skeleton, dt: number): MotionFeatures;
  readonly features: MotionFeatures;
  reset(): void;
}

/** 骨头 id → [起点关节, 终点关节]，用来把 bone.confidence 摊回到关节上 */
const BONE_ENDS: ReadonlyMap<string, readonly [string, string]> = new Map(
  BONES.map((b) => [b[0] as string, [b[1] as string, b[2] as string] as const]),
);

/** extremity（docs/05 §2：两手两脚 + 头）。每项按优先级给候选名，缺一个退一个 */
const EXTREMITIES: readonly (readonly string[])[] = [
  ['handTipL', 'wristL'],
  ['handTipR', 'wristR'],
  ['footIdxL', 'ankleL'],
  ['footIdxR', 'ankleR'],
  ['headCenter', 'neck'],
];

/** symmetry 的左右配对：同一采样点的左值与右值 */
const LIMB_PAIRS: readonly (readonly [string, string])[] = [
  ['shoulderL', 'shoulderR'],
  ['elbowL', 'elbowR'],
  ['wristL', 'wristR'],
  ['handTipL', 'handTipR'],
  ['hipL', 'hipR'],
  ['kneeL', 'kneeR'],
  ['ankleL', 'ankleR'],
  ['footIdxL', 'footIdxR'],
];

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const fin = (v: number, fallback = 0): number => (Number.isFinite(v) ? v : fallback);

const isVec3 = (v: unknown): v is Vec3 =>
  Array.isArray(v) && v.length >= 3 &&
  Number.isFinite(v[0]) && Number.isFinite(v[1]) && Number.isFinite(v[2]);

const zero = (): MotionFeatures =>
  ({ speed: 0, energy: 0, expansiveness: 0, verticality: 0, symmetry: 0, jerk: 0, stillness: 0 });

export function createMotion(): MotionMachine {
  const T = MOTION_TUNING;

  // 上一帧被采纳的关节位置。记下帧号：中间掉过置信度的关节不能跨帧做差，
  // 否则遮挡 2 秒后回来会算出一个巨大的 Δ，把 energy/jerk 冲飞。
  let prev = new Map<string, { p: Vec3; frame: number }>();
  let frame = 0;

  let speedEma = 0;
  let energyEma = 0;
  let symEma = 0;
  let jerkEma = 0;
  let expansiveness = 0;
  let verticality = 0;
  let out: MotionFeatures = zero();

  /** bone.confidence = 两端 visibility 的较小值 → 关节取所有相邻骨的最大值（最紧的下界） */
  function jointConfidence(sk: Skeleton): Map<string, number> {
    const m = new Map<string, number>();
    const bones = sk?.bones;
    if (!Array.isArray(bones)) return m;
    for (const b of bones) {
      const ends = BONE_ENDS.get(b?.id as string);
      if (!ends) continue;
      const c = Number.isFinite(b?.confidence) ? b.confidence : 0;
      for (const name of ends) {
        const cur = m.get(name);
        if (cur === undefined || c > cur) m.set(name, c);
      }
    }
    return m;
  }

  function update(sk: Skeleton, dt: number): MotionFeatures {
    // ── 时间（P2）：非有限 / 非正 → 退回名义帧长，再钳进 TIME 的范围 ──────────
    let d = Number.isFinite(dt) && dt > 0 ? dt : 1 / 60;
    d = clamp(d, TIME.dtMin, TIME.dtMax);

    const joints = sk?.joints as Record<string, Vec3> | undefined;
    if (!joints || typeof joints !== 'object') return out; // 没有骨架：保持上一帧，不抛

    const H = Number.isFinite(sk.height) && sk.height > 1e-3 ? sk.height : SKELETON.referenceHeight;
    const conf = jointConfidence(sk);

    /** 取一个可用关节：位置有限，且置信度不低于阈值（没有置信度信息 = 不排除） */
    const take = (name: string): Vec3 | null => {
      const p = joints[name];
      if (!isVec3(p)) return null;
      const c = conf.get(name);
      if (c !== undefined && c < CAPTURE.minJointConfidence) return null;
      return p;
    };

    // ── 逐关节位移 → 归一化速度 ────────────────────────────────────────────
    const cur = new Map<string, { p: Vec3; frame: number }>();
    const jointSpeed = new Map<string, number>();
    let sum = 0;
    let n = 0;
    for (const name of Object.keys(joints)) {
      const p = take(name);
      if (!p) continue;
      const here: Vec3 = [p[0], p[1], p[2]];
      cur.set(name, { p: here, frame });
      const last = prev.get(name);
      if (!last || last.frame !== frame - 1) continue;
      const s = Math.hypot(here[0] - last.p[0], here[1] - last.p[1], here[2] - last.p[2]) / (d * H);
      if (!Number.isFinite(s)) continue;
      jointSpeed.set(name, s);
      sum += s;
      n++;
    }

    const isFirst = n === 0 && prev.size === 0;
    prev = cur;
    frame++;

    // 首帧没有上一帧：给全零而不是 0/0（docs/05 §2；下游 evolution 只读 energy）
    if (isFirst) {
      speedEma = 0; energyEma = 0; jerkEma = 0;
      out = zero();
      return out;
    }

    // Σ‖Δjoint‖ / (dt·H·N) 的 EMA(τ=tauSpeed)
    const rawSpeed = n > 0 ? sum / n : 0;
    const prevSpeed = speedEma;
    speedEma += (rawSpeed - speedEma) * emaAlpha(d, T.tauSpeed);

    // energy = speed 的慢 EMA(τ=tauEnergy)
    energyEma += (speedEma - energyEma) * emaAlpha(d, T.tauEnergy);

    // jerk = ‖Δspeed‖/dt 的 EMA(τ=tauJerk)
    const rawJerk = Math.abs(speedEma - prevSpeed) / d;
    jerkEma += (fin(rawJerk) - jerkEma) * emaAlpha(d, T.tauJerk);

    // ── pelvis：优先用关节，退化到两髋中点 ─────────────────────────────────
    let pelvis = take('pelvis');
    if (!pelvis) {
      const hl = take('hipL');
      const hr = take('hipR');
      if (hl && hr) pelvis = [(hl[0] + hr[0]) / 2, (hl[1] + hr[1]) / 2, (hl[2] + hr[2]) / 2];
    }

    // expansiveness = mean(‖extremity - pelvis‖)/H。算不出就保持上一帧，不写 NaN
    if (pelvis) {
      let acc = 0;
      let k = 0;
      for (const candidates of EXTREMITIES) {
        for (const name of candidates) {
          const p = take(name);
          if (!p) continue;
          acc += Math.hypot(p[0] - pelvis[0], p[1] - pelvis[1], p[2] - pelvis[2]) / H;
          k++;
          break;
        }
      }
      if (k > 0) expansiveness = acc / k;

      // verticality = (headCenter.y - pelvis.y)/H
      const head = take('headCenter') ?? take('neck');
      if (head) verticality = (head[1] - pelvis[1]) / H;
    }

    // ── symmetry：左右配对速度的相关系数，EMA(τ=tauSymmetry) ────────────────
    const L: number[] = [];
    const R: number[] = [];
    for (const [ln, rn] of LIMB_PAIRS) {
      const a = jointSpeed.get(ln);
      const b = jointSpeed.get(rn);
      if (a === undefined || b === undefined) continue;
      L.push(a);
      R.push(b);
    }
    if (L.length >= 2) {
      const mL = L.reduce((s, v) => s + v, 0) / L.length;
      const mR = R.reduce((s, v) => s + v, 0) / R.length;
      let cov = 0;
      let vL = 0;
      let vR = 0;
      for (let i = 0; i < L.length; i++) {
        const dl = L[i] - mL;
        const dr = R[i] - mR;
        cov += dl * dr;
        vL += dl * dl;
        vR += dr * dr;
      }
      const den = Math.sqrt(vL * vR);
      // 方差为 0（真静止 / 完全同速）时相关系数无定义 —— 保持上一帧，不注入 NaN
      if (den > 1e-12) {
        const r = clamp(cov / den, -1, 1);
        symEma += (r - symEma) * emaAlpha(d, T.tauSymmetry);
      }
    }

    const speed = Math.max(0, fin(speedEma));
    out = {
      speed,
      energy: Math.max(0, fin(energyEma)),
      expansiveness: Math.max(0, fin(expansiveness)),
      verticality: fin(verticality),
      symmetry: clamp(fin(symEma), -1, 1),
      jerk: Math.max(0, fin(jerkEma)),
      stillness: 1 - clamp(speed / Math.max(1e-6, T.stillnessSpeedRef), 0, 1),
    };
    // 内部状态也不许留 NaN，否则一帧脏输入会永久毒化后面所有帧
    speedEma = out.speed;
    energyEma = out.energy;
    jerkEma = out.jerk;
    symEma = out.symmetry;
    expansiveness = out.expansiveness;
    verticality = out.verticality;
    return out;
  }

  return {
    update,
    get features() { return out; },
    reset() {
      prev = new Map();
      frame = 0;
      speedEma = 0; energyEma = 0; symEma = 0; jerkEma = 0;
      expansiveness = 0; verticality = 0;
      out = zero();
    },
  };
}

/**
 * 逐骨运动能量 —— `docs/44 §3` 的 `motionBias` 要的那一半输入。
 *
 * `MotionFeatures.energy` 是**整具**的一个数，回答不了"他现在在用哪根肢体"，
 * 而 §3 那条机制（"它拿走你正在用的那一部分"）恰恰只关心这个。
 * 所以这里另给一个读数，但**沿用上面那一套纪律**：无量纲（除以 `sk.height`）、
 * 帧率无关（`emaAlpha`）、常数全部来自 tuning。
 *
 * 输出是**相对**的 0..1：最忙的那根骨头趋近 1，其余按比例。
 * 归一化的分母取 `max(当前最大值, MOTION.stillnessSpeedRef)`，所以
 * 一个几乎静止的人不会因为某根骨头抖了一下就被判成"在挥那只手"——
 * 真静止时所有骨头都接近 0，`motionBias` 退回 1，排期器只看陈旧度。
 */
export interface BoneEnergyMachine {
  update(sk: Skeleton, dt: number): Readonly<Record<string, number>>;
  readonly current: Readonly<Record<string, number>>;
  reset(): void;
}

export function createBoneEnergy(): BoneEnergyMachine {
  let prev: Map<string, Vec3> | null = null;
  const ema = new Map<string, number>();
  let out: Record<string, number> = {};

  const mid = (j: Record<string, Vec3>, a: string, b: string): Vec3 | null => {
    const pa = j[a];
    const pb = j[b];
    if (!isVec3(pa) || !isVec3(pb)) return null;
    return [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2];
  };

  return {
    update(sk, dt) {
      let d = Number.isFinite(dt) && dt > 0 ? dt : 1 / 60;
      d = clamp(d, TIME.dtMin, TIME.dtMax);
      const joints = sk?.joints as Record<string, Vec3> | undefined;
      if (!joints || typeof joints !== 'object') return out;   // 没有骨架：保持上一帧，不抛
      const H = Number.isFinite(sk.height) && sk.height > 1e-3 ? sk.height : SKELETON.referenceHeight;

      const cur = new Map<string, Vec3>();
      const a = emaAlpha(d, MOTION_TUNING.tauEnergy);
      for (const bone of BONES) {
        const [id, ja, jb] = bone;
        const m = mid(joints, ja, jb);
        if (!m) continue;
        cur.set(id, m);
        const last = prev?.get(id);
        if (!last) continue;
        const s = Math.hypot(m[0] - last[0], m[1] - last[1], m[2] - last[2]) / (d * H);
        if (!Number.isFinite(s)) continue;
        const was = ema.get(id) ?? 0;
        ema.set(id, was + (s - was) * a);
      }
      prev = cur;

      let peak = 0;
      for (const v of ema.values()) if (v > peak) peak = v;
      const denom = Math.max(peak, MOTION_TUNING.stillnessSpeedRef);
      const next: Record<string, number> = {};
      for (const [id, v] of ema) next[id] = clamp(fin(v) / denom, 0, 1);
      out = next;
      return out;
    },
    get current() { return out; },
    reset() { prev = null; ema.clear(); out = {}; },
  };
}
