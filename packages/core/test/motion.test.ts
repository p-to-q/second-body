import test from 'node:test';
import assert from 'node:assert/strict';
import { createMotion, MOTION_TUNING } from '../src/motion.ts';
import { BONES } from '../src/skeleton.ts';
import { CAPTURE } from '../src/tuning.ts';
import type { Bone, BoneId, MotionFeatures, Skeleton, Vec3 } from '../src/types.ts';

// ── 合成骨架 ────────────────────────────────────────────────────────────────
// skeleton.ts 的 buildSkeleton 还没实现（T-02），所以这里直接按 docs/04 §2 的
// 关节名造一副骨架。身高固定 1.7m，方便手算期望值。

const HEIGHT = 1.7;

/** 站立中立姿势（Y-up，脚踩 y=0） */
const STAND: Record<string, Vec3> = {
  pelvis: [0, 0.92, 0],
  chest: [0, 1.30, 0],
  neck: [0, 1.45, 0],
  headCenter: [0, 1.62, 0],
  shoulderL: [0.20, 1.40, 0], shoulderR: [-0.20, 1.40, 0],
  elbowL: [0.25, 1.12, 0], elbowR: [-0.25, 1.12, 0],
  wristL: [0.28, 0.85, 0], wristR: [-0.28, 0.85, 0],
  handTipL: [0.30, 0.72, 0], handTipR: [-0.30, 0.72, 0],
  hipL: [0.10, 0.92, 0], hipR: [-0.10, 0.92, 0],
  kneeL: [0.10, 0.48, 0], kneeR: [-0.10, 0.48, 0],
  ankleL: [0.10, 0.08, 0], ankleR: [-0.10, 0.08, 0],
  footIdxL: [0.10, 0.02, 0.15], footIdxR: [-0.10, 0.02, 0.15],
};

const pose = (over: Record<string, Vec3> = {}): Record<string, Vec3> => ({ ...STAND, ...over });

/** 关节字典 → Skeleton。confidence 可以按关节名单独压低，用来测"低置信度不参与统计"。 */
function makeSkeleton(
  joints: Record<string, Vec3>,
  t = 0,
  lowConfidence: readonly string[] = [],
): Skeleton {
  const bad = new Set(lowConfidence);
  const bones: Bone[] = BONES.map(([id, a, b]) => {
    const p0 = joints[a] ?? [0, 0, 0];
    const p1 = joints[b] ?? [0, 0, 0];
    // bone.confidence = 两端 visibility 的较小值（types.ts）
    const c = bad.has(a) || bad.has(b) ? 0.1 : 0.9;
    return {
      id: id as BoneId,
      p0: [p0[0], p0[1], p0[2]],
      p1: [p1[0], p1[1], p1[2]],
      length: Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]),
      roll: 0,
      confidence: c,
    };
  });
  return { bones, joints, height: HEIGHT, warmingUp: false, t };
}

/** 把一段 t → 姿势的动作按给定 dt 喂进去，返回最后一帧的特征 */
function play(
  at: (t: number) => Record<string, Vec3>,
  seconds: number,
  dt: number,
  lowConfidence: readonly string[] = [],
) {
  const m = createMotion();
  const steps = Math.round(seconds / dt);
  let f = m.features;
  for (let i = 0; i <= steps; i++) {
    const t = i * dt;
    f = m.update(makeSkeleton(at(t), t * 1000, lowConfidence), dt);
  }
  return { m, f };
}

/** 大幅挥手：两条手臂整条绕肩上下扫，躯干不动 */
const WAVE_HZ = 2;
const WAVE_A = 0.55;
function wavePose(t: number): Record<string, Vec3> {
  const s = Math.sin(2 * Math.PI * WAVE_HZ * t);
  const lift = (p: Vec3, k: number): Vec3 => [p[0] + WAVE_A * k * s * 0.5, p[1] + WAVE_A * k * s, p[2]];
  return pose({
    elbowL: lift(STAND.elbowL, 0.5), elbowR: lift(STAND.elbowR, 0.5),
    wristL: lift(STAND.wristL, 1.0), wristR: lift(STAND.wristR, 1.0),
    handTipL: lift(STAND.handTipL, 1.2), handTipR: lift(STAND.handTipR, 1.2),
  });
}

// ── 1. 静止 ────────────────────────────────────────────────────────────────

test('motion: 静止输入 → stillness > 0.9 且 energy < 0.05', () => {
  const { f } = play(() => STAND, 3, 1 / 60);
  assert.ok(f.stillness > 0.9, `stillness=${f.stillness}`);
  assert.ok(f.energy < 0.05, `energy=${f.energy}`);
  assert.equal(f.speed, 0);
});

// ── 2. 大动作 ──────────────────────────────────────────────────────────────

test('motion: 大幅挥手 → energy > 0.5 且 stillness 明显下降', () => {
  const { f } = play(wavePose, 6, 1 / 60);
  assert.ok(f.energy > 0.5, `energy=${f.energy}`);
  assert.ok(f.stillness < 0.2, `stillness=${f.stillness}`);
  assert.ok(f.jerk >= 0 && Number.isFinite(f.jerk));
});

// ── 3. 帧率无关性（必测） ──────────────────────────────────────────────────

test('motion: 同一段动作 30fps 与 60fps 的 energy 终值相差 < 10%', () => {
  const a = play(wavePose, 6, 1 / 30).f.energy;
  const b = play(wavePose, 6, 1 / 60).f.energy;
  const rel = Math.abs(a - b) / Math.max(a, b);
  assert.ok(a > 0.5 && b > 0.5, `energy 30fps=${a} 60fps=${b}`);
  assert.ok(rel < 0.10, `相对差 ${(rel * 100).toFixed(2)}% (30fps=${a}, 60fps=${b})`);
});

test('motion: 极端帧率 15fps 与 120fps 也读出同一个 energy 量级', () => {
  const a = play(wavePose, 6, 1 / 15).f.energy;
  const b = play(wavePose, 6, 1 / 120).f.energy;
  const rel = Math.abs(a - b) / Math.max(a, b);
  assert.ok(rel < 0.20, `相对差 ${(rel * 100).toFixed(2)}% (15fps=${a}, 120fps=${b})`);
});

// ── 4. 脏输入（P2：绝不抛异常、绝不吐 NaN） ────────────────────────────────

const assertClean = (f: MotionFeatures, label: string) => {
  for (const [k, v] of Object.entries(f)) {
    assert.ok(Number.isFinite(v), `${label}: ${k}=${v}`);
  }
};

test('motion: dt 非有限 / <=0 / 巨大 都不产生 NaN', () => {
  const m = createMotion();
  for (const dt of [NaN, Infinity, -Infinity, 0, -1 / 60, 5, 1e12]) {
    const f = m.update(makeSkeleton(wavePose(0.1)), dt);
    assertClean(f, `dt=${dt}`);
  }
  assertClean(m.update(makeSkeleton(STAND), 1 / 60), 'recover');
});

test('motion: 关节含 NaN / Infinity 不产生 NaN 输出', () => {
  const m = createMotion();
  m.update(makeSkeleton(STAND), 1 / 60);
  const dirty = pose({
    wristL: [NaN, 0.85, 0],
    handTipR: [Infinity, -Infinity, NaN],
    headCenter: [0, NaN, 0],
  });
  for (let i = 0; i < 30; i++) assertClean(m.update(makeSkeleton(dirty), 1 / 60), 'dirty joints');
  // 脏帧不能永久毒化状态
  for (let i = 0; i < 60; i++) m.update(makeSkeleton(STAND), 1 / 60);
  assertClean(m.features, 'after recovery');
  assert.ok(m.features.stillness > 0.9, `stillness=${m.features.stillness}`);
});

test('motion: height 非法 / 骨架残缺 不抛异常也不产生 NaN', () => {
  const m = createMotion();
  const broken = { ...makeSkeleton(STAND), height: 0 } as Skeleton;
  assertClean(m.update(broken, 1 / 60), 'height=0');
  assertClean(m.update({ ...makeSkeleton(STAND), height: NaN } as Skeleton, 1 / 60), 'height=NaN');
  assertClean(m.update({ ...makeSkeleton({}), joints: {} } as Skeleton, 1 / 60), 'no joints');
  assertClean(m.update(undefined as unknown as Skeleton, 1 / 60), 'no skeleton');
  assertClean(m.update({ joints: STAND, height: HEIGHT } as unknown as Skeleton, 1 / 60), 'no bones');
});

test('motion: 首帧返回全零而不是 NaN', () => {
  const m = createMotion();
  const f = m.update(makeSkeleton(STAND), 1 / 60);
  assertClean(f, 'first frame');
  for (const v of Object.values(f)) assert.equal(v, 0);
});

// ── 5. expansiveness ───────────────────────────────────────────────────────

const SPREAD = pose({
  elbowL: [0.42, 1.40, 0], elbowR: [-0.42, 1.40, 0],
  wristL: [0.62, 1.40, 0], wristR: [-0.62, 1.40, 0],
  handTipL: [0.85, 1.40, 0], handTipR: [-0.85, 1.40, 0],
  kneeL: [0.28, 0.48, 0], kneeR: [-0.28, 0.48, 0],
  ankleL: [0.45, 0.08, 0], ankleR: [-0.45, 0.08, 0],
  footIdxL: [0.50, 0.02, 0.15], footIdxR: [-0.50, 0.02, 0.15],
});

const HUGGED = pose({
  elbowL: [0.22, 1.05, 0.10], elbowR: [-0.22, 1.05, 0.10],
  wristL: [0.02, 1.18, 0.14], wristR: [-0.02, 1.18, 0.14],
  handTipL: [-0.12, 1.25, 0.12], handTipR: [0.12, 1.25, 0.12],
  ankleL: [0.08, 0.08, 0], ankleR: [-0.08, 0.08, 0],
  footIdxL: [0.08, 0.02, 0.15], footIdxR: [-0.08, 0.02, 0.15],
});

test('motion: expansiveness 张开四肢 ≫ 抱胸，且都落在 docs/05 §2 的范围里', () => {
  const open = play(() => SPREAD, 1, 1 / 60).f;
  const shut = play(() => HUGGED, 1, 1 / 60).f;
  assert.ok(open.expansiveness > shut.expansiveness * 1.3,
    `open=${open.expansiveness} hugged=${shut.expansiveness}`);
  for (const f of [open, shut]) {
    assert.ok(f.expansiveness > 0.2 && f.expansiveness < 0.8, `expansiveness=${f.expansiveness}`);
  }
});

test('motion: verticality 蹲下时变小', () => {
  const tall = play(() => STAND, 1, 1 / 60).f;
  const squat = play(() => pose({
    pelvis: [0, 0.50, 0], hipL: [0.10, 0.50, 0], hipR: [-0.10, 0.50, 0],
    chest: [0, 0.90, 0], neck: [0, 1.05, 0], headCenter: [0, 1.20, 0],
  }), 1, 1 / 60).f;
  assert.ok(squat.verticality < tall.verticality, `squat=${squat.verticality} stand=${tall.verticality}`);
  assert.ok(tall.verticality > 0 && tall.verticality < 0.6, `verticality=${tall.verticality}`);
});

// ── 归一化 / 置信度 / reset ────────────────────────────────────────────────

test('motion: 特征无量纲 —— 同一动作放大到两倍身高读出同样的数', () => {
  const scaled = (t: number): Record<string, Vec3> => {
    const p = wavePose(t);
    const out: Record<string, Vec3> = {};
    for (const k of Object.keys(p)) out[k] = [p[k][0] * 2, p[k][1] * 2, p[k][2] * 2];
    return out;
  };
  const m = createMotion();
  const big = createMotion();
  let a = m.features, b = big.features;
  const dt = 1 / 60;
  for (let i = 0; i <= Math.round(4 / dt); i++) {
    const t = i * dt;
    a = m.update(makeSkeleton(wavePose(t), t * 1000), dt);
    const sk = makeSkeleton(scaled(t), t * 1000);
    b = big.update({ ...sk, height: HEIGHT * 2 }, dt);
  }
  for (const k of ['energy', 'speed', 'expansiveness', 'verticality'] as const) {
    assert.ok(Math.abs(a[k] - b[k]) < 1e-9, `${k}: ${a[k]} vs ${b[k]}`);
  }
});

test('motion: confidence < minJointConfidence 的关节不参与统计', () => {
  assert.equal(CAPTURE.minJointConfidence, 0.4);
  const moving = ['elbowL', 'wristL', 'handTipL', 'elbowR', 'wristR', 'handTipR'];
  const trusted = play(wavePose, 4, 1 / 60).f;
  // 同一段挥手，但挥动的关节全被标成低置信度 → 不该喂出能量
  const ignored = play(wavePose, 4, 1 / 60, moving).f;
  assert.ok(trusted.energy > 0.5, `trusted=${trusted.energy}`);
  assert.ok(ignored.energy < 0.05, `ignored=${ignored.energy}`);
  assert.ok(ignored.stillness > 0.9, `stillness=${ignored.stillness}`);
});

test('motion: symmetry —— 双臂同挥为正，单臂独挥明显更低', () => {
  const both = play(wavePose, 4, 1 / 60).f;
  const oneArm = play((t) => {
    const s = Math.sin(2 * Math.PI * WAVE_HZ * t);
    const lift = (p: Vec3, k: number): Vec3 => [p[0], p[1] + WAVE_A * k * s, p[2]];
    return pose({
      elbowL: lift(STAND.elbowL, 0.5),
      wristL: lift(STAND.wristL, 1.0),
      handTipL: lift(STAND.handTipL, 1.2),
    });
  }, 4, 1 / 60).f;
  assert.ok(both.symmetry > 0.5, `both=${both.symmetry}`);
  assert.ok(oneArm.symmetry < both.symmetry, `one=${oneArm.symmetry} both=${both.symmetry}`);
  for (const f of [both, oneArm]) {
    assert.ok(f.symmetry >= -1 && f.symmetry <= 1, `symmetry=${f.symmetry}`);
  }
});

test('motion: EMA 时间常数来自 tuning.ts，不是本地常数', () => {
  assert.equal(MOTION_TUNING.tauSpeed, 0.25);
  assert.equal(MOTION_TUNING.tauEnergy, 1.5);
  assert.equal(MOTION_TUNING.stillnessSpeedRef, 0.3);
});

test('motion: reset() 清空所有状态', () => {
  const { m } = play(wavePose, 4, 1 / 60);
  assert.ok(m.features.energy > 0.5);
  m.reset();
  for (const v of Object.values(m.features)) assert.equal(v, 0);
  // reset 之后第一帧重新算作"首帧"
  const f = m.update(makeSkeleton(STAND), 1 / 60);
  for (const v of Object.values(f)) assert.equal(v, 0);
  const { f: still } = play(() => STAND, 3, 1 / 60);
  assert.ok(still.stillness > 0.9);
});
