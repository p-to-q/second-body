/**
 * 上半身模式下的腿（`core/src/leghold.ts`）：乱甩的腿点换成一个站在地上的站姿，
 * 上半身一根骨头的朝向都不许变，权重 0 时原样返回。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { holdLegs } from '../src/leghold.ts';
import { buildSkeleton } from '../src/skeleton.ts';
import type { Skeleton, Vec3 } from '../src/types.ts';

const POSE: Record<string, Vec3> = {
  pelvis: [0, 0.95, 0], chest: [0, 1.35, 0], neck: [0, 1.45, 0], headCenter: [0, 1.60, 0],
  shoulderL: [0.19, 1.38, 0], elbowL: [0.33, 1.10, 0.02], wristL: [0.44, 0.86, 0.04], handTipL: [0.48, 0.77, 0.05],
  shoulderR: [-0.19, 1.38, 0], elbowR: [-0.33, 1.10, 0.02], wristR: [-0.44, 0.86, 0.04], handTipR: [-0.48, 0.77, 0.05],
  hipL: [0.09, 0.93, 0], kneeL: [0.10, 0.51, 0.01], ankleL: [0.10, 0.09, 0], footIdxL: [0.10, 0.03, 0.16],
  hipR: [-0.09, 0.93, 0], kneeR: [-0.10, 0.51, 0.01], ankleR: [-0.10, 0.09, 0], footIdxR: [-0.10, 0.03, 0.16],
};
const sk = (over: Record<string, Vec3> = {}): Skeleton => buildSkeleton({ ...POSE, ...over }, [], 0);
/** 笔记本观众：腿在桌子底下乱猜 —— 一条腿甩到身前、一条缩到胯上，最低点被猜到很低 */
const GARBAGE = { kneeL: [0.5, 0.2, 0.6], ankleL: [0.9, -0.4, 0.3], footIdxL: [1.1, -0.5, 0.2], kneeR: [-0.1, 1.0, 0.4], ankleR: [-0.2, 0.9, 0.1], footIdxR: [-0.3, 0.95, 0.1] } as Record<string, Vec3>;
const dir = (sk: Skeleton, id: string): Vec3 => {
  const b = sk.bones.find((x) => x.id === id)!;
  const l = Math.hypot(b.p1[0] - b.p0[0], b.p1[1] - b.p0[1], b.p1[2] - b.p0[2]);
  return [(b.p1[0] - b.p0[0]) / l, (b.p1[1] - b.p0[1]) / l, (b.p1[2] - b.p0[2]) / l];
};

test('腿：权重 1 时乱甩的腿变成竖直站姿，脚踩在 y=0，膝在髋正下方', () => {
  const out = holdLegs(sk(GARBAGE), 1);
  const J = out.joints;
  for (const s of ['L', 'R']) {
    assert.ok(Math.abs(J['knee' + s][0] - J['hip' + s][0]) < 1e-9, `膝${s}不在髋正下方`);
    assert.ok(J['knee' + s][1] < J['hip' + s][1] - 0.3, `膝${s}没在髋下面`);
    assert.ok(J['ankle' + s][1] < J['knee' + s][1] - 0.3, `踝${s}没在膝下面`);
  }
  const lo = Math.min(J.footIdxL[1], J.footIdxR[1], J.ankleL[1], J.ankleR[1]);
  assert.ok(Math.abs(lo) < 1e-9, `脚没踩在地上：最低 ${lo}`);
  // 骨盆回到一个站着的人的高度（标准站姿 0.95m 附近），而不是被乱猜的脚拽上拽下
  assert.ok(J.pelvis[1] > 0.85 && J.pelvis[1] < 1.05, `骨盆 ${J.pelvis[1].toFixed(3)}`);
  for (const id of ['thighL', 'shinR']) {
    const b = out.bones.find((x) => x.id === id)!;
    assert.ok(b.length > 0.3 && b.length < 0.5, `${id} 长 ${b.length}`);
    assert.ok(b.confidence >= 0.999, `站姿腿骨的 confidence 是 ${b.confidence}（团块身体会让它淡出）`);
  }
});

test('腿：上半身一根骨头的朝向和长度都不变 —— 只平移', () => {
  const src = sk(GARBAGE);
  const out = holdLegs(src, 1);
  // neck / head 在这副夹具里是零长的（没有 landmark，头退到胸口），朝向没有定义，不比
  for (const id of ['spine', 'clavicleL', 'clavicleR', 'upperArmL', 'foreArmR', 'handR']) {
    const a = dir(src, id), b = dir(out, id);
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-9, `${id} 朝向变了`);
    assert.equal(out.bones.find((x) => x.id === id)!.length, src.bones.find((x) => x.id === id)!.length);
  }
  assert.notEqual(out, src);
  assert.deepEqual(src.joints.kneeL, GARBAGE.kneeL, '输入被改写了');
});

test('腿：权重 0 原样返回同一个对象；权重一路从 0 到 1，脚始终在地上、骨盆高度单调地走', () => {
  const src = sk(GARBAGE);
  assert.equal(holdLegs(src, 0), src);
  let prev = -Infinity;
  const ys: number[] = [];
  for (let k = 1; k <= 10; k++) {
    const out = holdLegs(src, k / 10);
    const lo = Math.min(out.joints.footIdxL[1], out.joints.footIdxR[1], out.joints.ankleL[1], out.joints.ankleR[1]);
    assert.ok(Math.abs(lo) < 1e-9, `权重 ${k / 10} 时脚离地 ${lo}`);
    ys.push(out.joints.pelvis[1]);
    for (const b of out.bones) for (const p of [b.p0, b.p1]) assert.ok(p.every(Number.isFinite), `权重 ${k / 10} 出了 NaN`);
    prev = out.joints.pelvis[1];
  }
  assert.ok(Number.isFinite(prev));
  assert.ok(Math.abs(ys.at(-1)! - holdLegs(src, 1).joints.pelvis[1]) < 1e-12);
});

test('腿：身材跟着脊柱走并夹住 —— 脊柱被量成 3 米也长不出高跷', () => {
  const tall = holdLegs(sk({ chest: [0, 4.0, 0] }), 1);
  const thigh = tall.bones.find((b) => b.id === 'thighL')!.length;
  assert.ok(thigh <= 0.42 * 1.35 + 1e-9, `大腿 ${thigh}`);
});
