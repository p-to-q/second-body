import test from 'node:test';
import assert from 'node:assert/strict';
import { createVitality } from '../src/vitality.ts';
import { buildSkeleton } from '../src/skeleton.ts';
import { VITALITY } from '../src/tuning.ts';
import type { Skeleton, Vec3 } from '../src/types.ts';

const POSE: Record<string, Vec3> = {
  pelvis: [0, 0.95, 0], chest: [0, 1.35, 0], neck: [0, 1.45, 0], headCenter: [0, 1.60, 0],
  shoulderL: [0.19, 1.38, 0], elbowL: [0.33, 1.10, 0.02], wristL: [0.44, 0.86, 0.04], handTipL: [0.48, 0.77, 0.05],
  shoulderR: [-0.19, 1.38, 0], elbowR: [-0.33, 1.10, 0.02], wristR: [-0.44, 0.86, 0.04], handTipR: [-0.48, 0.77, 0.05],
  hipL: [0.09, 0.93, 0], kneeL: [0.10, 0.51, 0.01], ankleL: [0.10, 0.09, 0], footIdxL: [0.10, 0.03, 0.16],
  hipR: [-0.09, 0.93, 0], kneeR: [-0.10, 0.51, 0.01], ankleR: [-0.10, 0.09, 0], footIdxR: [-0.10, 0.03, 0.16],
};
const sk = (over: Record<string, Vec3> = {}): Skeleton => buildSkeleton({ ...POSE, ...over }, [], 0);
const len = (b: { p0: Vec3; p1: Vec3 }) => Math.hypot(b.p1[0] - b.p0[0], b.p1[1] - b.p0[1], b.p1[2] - b.p0[2]);

test('骨长逐根不变 —— 这条破了，零件会一帧胖一帧瘦', () => {
  const v = createVitality();
  const base = sk();
  v.apply(base, null, 1 / 60);
  // 突然把手甩出去：延迟最大的一帧，也是骨长最容易被拉坏的一帧
  const moved = sk({ wristL: [0.9, 1.4, 0.3], handTipL: [1.0, 1.5, 0.35], elbowL: [0.6, 1.3, 0.1] });
  const out = v.apply(moved, null, 1 / 60);
  for (const b of out.bones) {
    const want = moved.bones.find((x) => x.id === b.id)!;
    assert.ok(Math.abs(len(b) - want.length) < 1e-9, `${b.id}: ${len(b)} ≠ ${want.length}`);
  }
});

test('末端比根部落后得多 —— 没有这个差值就没有"弯"', () => {
  const v = createVitality();
  const base = sk();
  for (let i = 0; i < 30; i++) v.apply(base, null, 1 / 60);   // 先稳住
  const moved = sk({
    chest: [0.1, 1.35, 0], shoulderL: [0.29, 1.38, 0],
    elbowL: [0.43, 1.10, 0.02], wristL: [0.54, 0.86, 0.04], handTipL: [0.58, 0.77, 0.05],
  });
  const out = v.apply(moved, null, 1 / 60);
  const err = (k: string) => Math.abs(out.joints[k][0] - moved.joints[k][0]);
  assert.ok(err('pelvis') < 1e-6, '骨盆必须是实时的');
  assert.ok(err('handTipL') > err('chest'), '指尖应该比胸口落后更多');
});

test('输入不被改写', () => {
  const v = createVitality();
  const input = sk();
  const before = JSON.stringify(input.joints);
  v.apply(input, null, 1 / 60);
  v.apply(sk({ wristL: [0.9, 1.4, 0.3] }), null, 1 / 60);
  assert.equal(JSON.stringify(input.joints), before);
});

test('输出永远贴地 —— 延迟和呼吸都会让脚离地，影子会飘', () => {
  const v = createVitality();
  for (let i = 0; i < 60; i++) {
    const out = v.apply(sk({ pelvis: [0, 0.95 + i * 0.004, 0] }), null, 1 / 60);
    const lo = Math.min(out.joints.footIdxL[1], out.joints.footIdxR[1]);
    assert.ok(Math.abs(lo) < 1e-9, `第 ${i} 帧脚在 ${lo}`);
  }
});

test('退化输入不产生 NaN', () => {
  const v = createVitality();
  const bad = sk({ wristL: [NaN, NaN, NaN], elbowL: [0.33, 1.10, 0.02], handTipL: [0.33, 1.10, 0.02] });
  const out = v.apply(bad, null, 1 / 60);
  for (const k in out.joints) for (const c of out.joints[k]) assert.ok(Number.isFinite(c), `${k} 出了 NaN`);
  for (const b of out.bones) assert.ok(Number.isFinite(len(b)), `${b.id} 长度是 NaN`);
});

test('dt 异常（0 / 负 / NaN / 卡顿一秒）都不崩', () => {
  const v = createVitality();
  for (const dt of [0, -1, NaN, Infinity, 1]) {
    const out = v.apply(sk(), null, dt as number);
    for (const k in out.joints) for (const c of out.joints[k]) assert.ok(Number.isFinite(c));
  }
});

test('静止时也在动 —— 呼吸；能量高时呼吸让位', () => {
  const v = createVitality();
  const still = sk();
  const ys: number[] = [];
  for (let i = 0; i < 120; i++) ys.push(v.apply(still, null, 1 / 60).joints.chest[1]);
  const span = Math.max(...ys) - Math.min(...ys);
  assert.ok(span > 1e-4, `站着不动时胸口应该有起伏，实际 ${span}`);

  const v2 = createVitality();
  const hot: number[] = [];
  const loud = { energy: VITALITY.breathFadeEnergy * 2, speed: 0, accel: 0, spread: 0, verticality: 0 } as never;
  for (let i = 0; i < 120; i++) hot.push(v2.apply(still, loud, 1 / 60).joints.chest[1]);
  assert.ok(Math.max(...hot) - Math.min(...hot) < span, '动起来时呼吸应该让位');
});

test('关掉之后原样返回同一个对象 —— A/B 必须是真的关掉', () => {
  const was = VITALITY.enabled;
  try {
    (VITALITY as { enabled: boolean }).enabled = false;
    const v = createVitality();
    const input = sk();
    assert.equal(v.apply(input, null, 1 / 60), input);
  } finally { (VITALITY as { enabled: boolean }).enabled = was; }
});
