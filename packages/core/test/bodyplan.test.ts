import test from 'node:test';
import assert from 'node:assert/strict';
import { remapSkeleton, BODY_PLANS } from '../src/bodyplan.ts';
import { buildSkeleton } from '../src/skeleton.ts';
import { dist } from '../src/vec.ts';
import type { Skeleton, Vec3 } from '../src/types.ts';

// 合成一副站立的人体骨架（米，Y-up，面朝 +Z，左侧在 +X）
const POSE: Record<string, Vec3> = {
  pelvis: [0, 0.95, 0], chest: [0, 1.35, 0], neck: [0, 1.45, 0], headCenter: [0, 1.60, 0],
  shoulderL: [0.19, 1.38, 0], elbowL: [0.33, 1.10, 0.02], wristL: [0.44, 0.86, 0.04], handTipL: [0.48, 0.77, 0.05],
  shoulderR: [-0.19, 1.38, 0], elbowR: [-0.33, 1.10, 0.02], wristR: [-0.44, 0.86, 0.04], handTipR: [-0.48, 0.77, 0.05],
  hipL: [0.09, 0.93, 0], kneeL: [0.10, 0.51, 0.01], ankleL: [0.10, 0.09, 0], footIdxL: [0.10, 0.03, 0.16],
  hipR: [-0.09, 0.93, 0], kneeR: [-0.10, 0.51, 0.01], ankleR: [-0.10, 0.09, 0], footIdxR: [-0.10, 0.03, 0.16],
};

const human = (over: Record<string, Vec3> = {}): Skeleton =>
  buildSkeleton({ ...POSE, ...over }, [], 0);

const lowestFoot = (sk: Skeleton) => Math.min(
  sk.joints.footIdxL?.[1] ?? Infinity, sk.joints.footIdxR?.[1] ?? Infinity,
  sk.joints.ankleL?.[1] ?? Infinity, sk.joints.ankleR?.[1] ?? Infinity,
);

test('rig 是恒等映射', () => {
  const sk = human();
  const out = remapSkeleton(sk, 'rig');
  assert.equal(out, sk, 'rig 应该原样返回同一个对象，不做任何拷贝');
});

test('未知 plan 按 rig 处理，不抛异常（P2）', () => {
  const sk = human();
  assert.equal(remapSkeleton(sk, 'no-such-plan'), sk);
  assert.equal(remapSkeleton(sk, undefined as never), sk);
});

test('每个 plan 都不产生 NaN，且骨头数不变', () => {
  const sk = human();
  for (const plan of BODY_PLANS) {
    const out = remapSkeleton(sk, plan);
    assert.equal(out.bones.length, sk.bones.length, `${plan} 改变了骨头数`);
    for (const b of out.bones) {
      assert.ok(b.p0.every(Number.isFinite) && b.p1.every(Number.isFinite), `${plan} 的 ${b.id} 有 NaN`);
      assert.ok(Number.isFinite(b.length), `${plan} 的 ${b.id} 长度非有限`);
    }
    for (const k in out.joints) {
      assert.ok(out.joints[k].every(Number.isFinite), `${plan} 的关节 ${k} 有 NaN`);
    }
  }
});

test('重映射之后要重新贴地（rig 除外 —— 它是恒等，落地是 stabilize 的职责）', () => {
  // 为什么排除 rig：remapSkeleton('rig') 原样返回同一个对象（上面第一条测试写死了这点）。
  // 落地已经由 stabilize.ts 在 FK 之后做过（docs/04 §3.5），这里不该再做一遍 ——
  // 为了让一条断言更整齐而去拷贝一份骨架，是拿性能换整齐。
  const sk = human();
  for (const plan of BODY_PLANS) {
    if (plan === 'rig') continue;
    const y = lowestFoot(remapSkeleton(sk, plan));
    assert.ok(Math.abs(y) < 1e-9, `${plan} 的最低脚在 y=${y}，没贴地`);
  }
});

// ── quadruped：真的是四足吗 ────────────────────────────────────────────────

test('quadruped：躯干是水平的', () => {
  const q = remapSkeleton(human(), 'quadruped');
  const trunk = dist(q.joints.pelvis, q.joints.chest);
  const rise = Math.abs(q.joints.chest[1] - q.joints.pelvis[1]);
  assert.ok(trunk > 0.3, `躯干太短: ${trunk}`);
  // 允许前低后高的自然斜度，但抬升不能超过躯干长度的一半 —— 否则还是竖着的
  assert.ok(rise < trunk * 0.5, `躯干不够水平：长 ${trunk.toFixed(2)}，抬升 ${rise.toFixed(2)}`);
  // 前后要真的分开在 Z 上
  assert.ok(Math.abs(q.joints.chest[2] - q.joints.pelvis[2]) > trunk * 0.8, '前后没有在 Z 上拉开');
});

test('quadruped：四只脚都在地面附近 —— 它是站着的，不是拖着走', () => {
  const q = remapSkeleton(human(), 'quadruped');
  const feet = ['footIdxL', 'footIdxR', 'handTipL', 'handTipR'].map((n) => q.joints[n][1]);
  for (const y of feet) {
    assert.ok(y < 0.35, `有一只脚离地 ${y.toFixed(2)}m，四足应该四点触地`);
  }
});

test('quadruped：头伸向前方，不是朝上', () => {
  const q = remapSkeleton(human(), 'quadruped');
  const d = [
    q.joints.headCenter[0] - q.joints.chest[0],
    q.joints.headCenter[1] - q.joints.chest[1],
    q.joints.headCenter[2] - q.joints.chest[2],
  ];
  assert.ok(Math.abs(d[2]) > Math.abs(d[1]), `头主要朝 ${Math.abs(d[2]) > Math.abs(d[1]) ? 'Z' : 'Y'}，应该朝前(Z)`);
});

test('quadruped：因果没断 —— 抬起人的手臂，前腿跟着抬', () => {
  const down = remapSkeleton(human(), 'quadruped');
  // 把左臂抬到水平
  const up = remapSkeleton(human({
    elbowL: [0.40, 1.36, 0.02], wristL: [0.62, 1.36, 0.04], handTipL: [0.71, 1.36, 0.05],
  }), 'quadruped');
  const before = down.joints.handTipL[1];
  const after = up.joints.handTipL[1];
  assert.ok(after > before + 0.15,
    `抬手之后前爪只从 ${before.toFixed(2)} 变到 ${after.toFixed(2)} —— 因果链断了`);
});

test('quadruped：人转身时四足跟着转（左右没有被写死）', () => {
  const q = remapSkeleton(human(), 'quadruped');
  assert.ok(q.joints.shoulderL[0] > 0 && q.joints.shoulderR[0] < 0, '左右肩的 X 符号反了');
  assert.ok(q.joints.hipL[0] > 0 && q.joints.hipR[0] < 0, '左右胯的 X 符号反了');
});

// ── 比例类 ────────────────────────────────────────────────────────────────

test('towering 更高、stub 更矮', () => {
  const base = human();
  const tall = remapSkeleton(base, 'towering');
  const short = remapSkeleton(base, 'stub');
  assert.ok(tall.height > base.height * 1.15, `towering 只有 ${tall.height.toFixed(2)}`);
  assert.ok(short.height < base.height * 0.85, `stub 有 ${short.height.toFixed(2)}`);
});

test('inverted：头到了下面', () => {
  const inv = remapSkeleton(human(), 'inverted');
  assert.ok(inv.joints.headCenter[1] < inv.joints.pelvis[1], '倒立之后头应该比胯低');
});

test('退化输入：空骨架 / 缺关节 / NaN 都不抛', () => {
  const empty = { bones: [], joints: {}, height: 0, warmingUp: false, t: 0 } as Skeleton;
  for (const plan of BODY_PLANS) assert.equal(remapSkeleton(empty, plan), empty);
  const broken = human({ kneeL: [NaN, NaN, NaN], footIdxR: [Infinity, 0, 0] });
  for (const plan of BODY_PLANS) {
    const out = remapSkeleton(broken, plan);
    for (const b of out.bones) assert.ok(b.p0.every(Number.isFinite) && b.p1.every(Number.isFinite));
  }
});

// ── 参数化比例：物种身份的另一半 ────────────────────────────────────────────

test('比例 spec：球形物种真的是"巨大躯干 + 退化四肢"', () => {
  const base = human();
  const orb = remapSkeleton(base, { limb: 0.2, torso: 2.2, head: 0.4 });
  const armBase = dist(base.joints.shoulderL, base.joints.handTipL);
  const armOrb = dist(orb.joints.shoulderL, orb.joints.handTipL);
  const torsoBase = dist(base.joints.pelvis, base.joints.chest);
  const torsoOrb = dist(orb.joints.pelvis, orb.joints.chest);
  assert.ok(armOrb < armBase * 0.35, `四肢没退化：${armBase.toFixed(2)} → ${armOrb.toFixed(2)}`);
  assert.ok(torsoOrb > torsoBase * 1.8, `躯干没变大：${torsoBase.toFixed(2)} → ${torsoOrb.toFixed(2)}`);
});

test('比例 spec：arm / leg 可以分别叠加在 limb 之上', () => {
  const base = human();
  const longArms = remapSkeleton(base, { arm: 1.5, leg: 0.82 });
  const a0 = dist(base.joints.shoulderL, base.joints.handTipL);
  const a1 = dist(longArms.joints.shoulderL, longArms.joints.handTipL);
  const l0 = dist(base.joints.hipL, base.joints.footIdxL);
  const l1 = dist(longArms.joints.hipL, longArms.joints.footIdxL);
  assert.ok(a1 > a0 * 1.4, `手臂没变长：${a0.toFixed(2)} → ${a1.toFixed(2)}`);
  assert.ok(l1 < l0 * 0.9, `腿没变短：${l0.toFixed(2)} → ${l1.toFixed(2)}`);
});

test('比例 spec：全是 1 的 spec 等于不做（不白跑一趟）', () => {
  const base = human();
  const noop = remapSkeleton(base, { limb: 1, torso: 1 });
  assert.equal(noop, base, '没有任何比例变化时应该原样返回');
});

test('拓扑 + 比例可以叠加，且顺序是先拓扑后比例', () => {
  const base = human();
  const q = remapSkeleton(base, 'quadruped');
  const qSmall = remapSkeleton(base, { kind: 'quadruped', limb: 0.7 });
  // 仍然是四足（躯干水平）
  const trunk = dist(qSmall.joints.pelvis, qSmall.joints.chest);
  const rise = Math.abs(qSmall.joints.chest[1] - qSmall.joints.pelvis[1]);
  assert.ok(rise < trunk * 0.5, '叠加比例之后不再是四足了 —— 说明比例把拓扑冲掉了');
  // 而且确实变小了
  const legQ = dist(q.joints.hipL, q.joints.footIdxL);
  const legS = dist(qSmall.joints.hipL, qSmall.joints.footIdxL);
  assert.ok(legS < legQ * 0.85, `腿没变短：${legQ.toFixed(2)} → ${legS.toFixed(2)}`);
});

test('比例 spec 同样贴地、同样不产生 NaN', () => {
  const specs = [
    { limb: 0.2, torso: 2.2, head: 0.4 },
    { arm: 1.5, leg: 0.82 },
    { kind: 'quadruped', limb: 0.7 },
    { head: 1.9 },
  ];
  for (const spec of specs) {
    const out = remapSkeleton(human(), spec);
    const y = lowestFoot(out);
    assert.ok(Math.abs(y) < 1e-9, `${JSON.stringify(spec)} 没贴地: ${y}`);
    for (const b of out.bones) assert.ok(b.p0.every(Number.isFinite) && b.p1.every(Number.isFinite));
  }
});

test('未知 kind 按 rig 处理，但比例照常生效（外部数据可能带我们不认识的 plan）', () => {
  const base = human();
  const out = remapSkeleton(base, { kind: 'some-future-plan', torso: 1.5 });
  const t0 = dist(base.joints.pelvis, base.joints.chest);
  const t1 = dist(out.joints.pelvis, out.joints.chest);
  assert.ok(t1 > t0 * 1.4, '未知拓扑时比例也该生效');
});
