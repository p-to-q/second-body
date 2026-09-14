import test from 'node:test';
import assert from 'node:assert/strict';
import { createVitality } from '../src/vitality.ts';
import { remapSkeleton } from '../src/bodyplan.ts';
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

/**
 * 没有脚的身体方案（`PLANS_WITHOUT_FEET`：`radial` / `inverted`）**不许拿脚当落地基准**。
 *
 * 为什么这条必须在这里、而不是在 `bodyplan.test.ts`：`bodyplan.ts` 里的 `rebuild()`
 * 早就分了 `groundAll`，重映射交出来的那具身体是对的。而 `vitality` 在它**之后**跑，
 * 末尾又落地了一次 —— 那一次一直写死 `footIdxL/R, ankleL/R`。
 * 于是整具身体在这里被按着脚（`inverted` 的脚在最上面）重新平移了一遍，沉下去一米多。
 * 网格落地（`ground.ts`）会把递给它的东西原样抬起来，所以**画面上看不见**；
 * 但接触阴影、取景、截图读到的是**关节**，不是网格 —— 它们全都读到了这具沉下去的骨架。
 *
 * 判据取"整具骨架的最低关节回到 y=0"，正是 `PLANS_WITHOUT_FEET` 那条注释写下的定义。
 */
for (const plan of ['inverted', 'radial'] as const) {
  test(`${plan}：没有脚的方案按整体最低关节落地，不按脚`, () => {
    const v = createVitality();
    const planned = remapSkeleton(sk(), plan);
    // 重映射那一层自己已经落好地了 —— 先把这个前提钉住，否则下面量的是别人的错
    const before = Math.min(...Object.values(planned.joints).map((p) => p[1]));
    assert.ok(Math.abs(before) < 1e-6, `前提不成立：remapSkeleton 交出来的身体最低点已经在 ${before}`);

    for (let i = 0; i < 10; i++) {
      const out = v.apply(planned, null, 1 / 60, plan);
      const lo = Math.min(...Object.values(out.joints).map((p) => p[1]));
      assert.ok(
        Math.abs(lo) < 1e-9,
        `第 ${i} 帧整具身体的最低关节在 ${lo.toFixed(3)}m —— ` +
        '按脚落地会把没有脚的身体整个埋进地里（网格落地会把症状盖住，但关节是错的）',
      );
    }
  });
}

test('有脚的方案不受影响 —— 手甩到脚底下也不该改落地基准', () => {
  const v = createVitality();
  // 蹲下摸地：手尖比脚尖还低。按"整体最低关节"落地会把整个人举起来
  const low = sk({ wristL: [0.3, 0.05, 0.2], handTipL: [0.32, -0.04, 0.24] });
  for (let i = 0; i < 5; i++) {
    const out = v.apply(low, null, 1 / 60, 'rig');
    const feet = Math.min(out.joints.footIdxL[1], out.joints.footIdxR[1]);
    assert.ok(Math.abs(feet) < 1e-9, `第 ${i} 帧脚在 ${feet} —— 人形的落地基准仍然是脚`);
  }
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

/**
 * **骨盆在两个水平方向上都不落后，而且贴地不拖着它走 —— 前提是输入守贴地契约。**
 *
 * 上面那条「骨盆必须是实时的」只量 x，而且喂的是 `POSE` —— 它经 `buildSkeleton` 之后
 * 最低的脚在 90mm 高处，是**悬空**的。`vitality` 第 4 步按契约把输出贴回地面，
 * 整具骨架（连骨盆）往下挪 90mm。那条测试看不见，因为那 90mm 全在 y 上。
 *
 * `/dev/vitality.html` 看见了，印成「骨盆落后 90.97 mm（应当 ≈ 0）」，
 * 侧室那条线据此拒绝过展出那一页（docs/23 §S9.1）。2026-09-14 在 node 里逐帧拆开：
 * 水平 0.00mm，竖直 = 目标脚悬空的高度 + 约 2mm。真实输入来自稳定器、永远贴地，
 * 所以线上从来没有那 90mm —— 是靶场的目标不守契约。
 *
 * 这一条把拆开的结论钉住：**贴地的**甩臂目标，走 10 秒，骨盆 x/z 都实时、竖直挪动 < 5mm。
 * 哪天有人让延迟真的漏进骨盆（水平），或者让贴地按错的关节拽（竖直），它会红。
 */
test('骨盆 x/z 都实时，贴地不拖着它走 —— 输入按稳定器契约贴地时', () => {
  const floor = (() => {
    const j = sk().joints;
    return Math.min(j.footIdxL[1], j.footIdxR[1], j.ankleL[1], j.ankleR[1]);
  })();
  const grounded = (t: number): Skeleton => {
    const s = Math.sin(t * 2.1);
    const j: Record<string, Vec3> = {};
    for (const k in POSE) j[k] = [POSE[k][0], POSE[k][1] - floor, POSE[k][2]];
    const swing = (k: string, amt: number) => {
      j[k] = [j[k][0] + s * amt, j[k][1] + Math.abs(s) * amt * 0.5, j[k][2] + s * amt * 0.6];
    };
    swing('chest', 0.05); swing('neck', 0.07); swing('headCenter', 0.09);
    swing('shoulderL', 0.10); swing('elbowL', 0.26); swing('wristL', 0.46); swing('handTipL', 0.52);
    swing('shoulderR', 0.08); swing('elbowR', 0.20); swing('wristR', 0.36); swing('handTipR', 0.41);
    return buildSkeleton(j, [], t);
  };
  const v = createVitality();
  let maxH = 0, maxV = 0;
  for (let i = 1; i <= 600; i++) {
    const tgt = grounded(i / 60);
    const out = v.apply(tgt, null, 1 / 60);
    if (i < 120) continue;
    const a = out.joints.pelvis, b = tgt.joints.pelvis;
    maxH = Math.max(maxH, Math.hypot(a[0] - b[0], a[2] - b[2]));
    maxV = Math.max(maxV, Math.abs(a[1] - b[1]));
  }
  assert.ok(maxH < 1e-6, `骨盆水平落后 ${(maxH * 1000).toFixed(3)}mm —— 延迟漏进了根部`);
  assert.ok(maxV < 0.005, `骨盆竖直挪了 ${(maxV * 1000).toFixed(2)}mm —— 贴地拽错了关节，或者输入没贴地`);
});
