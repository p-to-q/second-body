import test from 'node:test';
import assert from 'node:assert/strict';
import { createRefiner, clampFold, qualityScale, DEFAULT_REFINE, LANDMARK_GROUP } from '../src/refine.ts';
import { buildSkeleton, mediapipeToWorld } from '../src/skeleton.ts';
import type { Landmark, RawPose } from '../src/types.ts';

const DT = 1 / 30;

/** 33 个点，全部可信，可以逐点覆盖 */
function pose(over: Record<number, Partial<Landmark>> = {}, score = 1): RawPose {
  const world: Landmark[] = [];
  for (let i = 0; i < 33; i++) {
    world.push({ x: i * 0.01, y: i * 0.02, z: i * 0.003, visibility: 0.9, ...over[i] });
  }
  return { world, screen: world.map((l) => ({ ...l })), score, t: 0 };
}

test('refine: 分组表覆盖 33 个点，肩髋是 torso、肘膝是 limb、腕是 extremity', () => {
  assert.equal(LANDMARK_GROUP.length, 33);
  for (const i of [11, 12, 23, 24]) assert.equal(LANDMARK_GROUP[i], 'torso');
  for (const i of [13, 14, 25, 26]) assert.equal(LANDMARK_GROUP[i], 'limb');
  for (const i of [15, 16, 19, 20]) assert.equal(LANDMARK_GROUP[i], 'extremity');
});

test('refine: 降噪 —— 静止点的输出方差远小于输入方差', () => {
  const r = createRefiner();
  let sin = 0, sout = 0, n = 0;
  // 固定噪声序列（不许 Math.random，AGENTS 不变量）
  let s = 1;
  const noise = () => { s = (s * 1103515245 + 12345) % 2147483648; return (s / 2147483648 - 0.5) * 0.04; };
  for (let f = 0; f < 200; f++) {
    const nx = noise();
    const out = r.apply(pose({ 15: { x: nx } }), DT);
    if (f < 60) continue;                  // 让滤波器收敛
    sin += nx * nx; sout += out.world[15].x ** 2; n++;
  }
  assert.ok(n > 0);
  // 0.6 而不是 0.1：默认档是 MediaPipe 自己的 world 参数（beta=40），它偏"跟手"不偏"稳"。
  // 这条断言守的是"滤波确实在降噪"，**不是**"降到某个好看的数" —— 具体降多少由
  // /dev/accuracy.html 在真实输入上量，不在这里假装。
  assert.ok(sout < sin * 0.6, `输出噪声功率应显著更低：in=${(sin / n).toExponential(2)} out=${(sout / n).toExponential(2)}`);
});

test('refine: 遮挡 —— 低 visibility 的点保持最后可信位置，不跟着垃圾值跑', () => {
  const r = createRefiner();
  for (let f = 0; f < 90; f++) r.apply(pose({ 15: { x: 0.5 } }), DT);
  const before = r.apply(pose({ 15: { x: 0.5 } }), DT).world[15].x;
  // 遮挡：visibility 掉下去，同时测量值飞掉
  const held = r.apply(pose({ 15: { x: 99, visibility: 0.05 } }), DT).world[15].x;
  assert.ok(Math.abs(held - before) < 0.05, `保持位置应贴近遮挡前：before=${before} held=${held}`);
  assert.equal(r.stats.held, 1);
});

test('refine: 遮挡超时后放手 —— visibility 归零、不再假装知道位置', () => {
  const r = createRefiner({ holdSeconds: 0.1 });
  for (let f = 0; f < 60; f++) r.apply(pose({ 15: { x: 0.5 } }), DT);
  let out = pose();
  for (let f = 0; f < 20; f++) out = r.apply(pose({ 15: { x: 99, visibility: 0.05 } }), DT);
  assert.equal(out.world[15].visibility, 0, '超时后的点必须自报不可信');
  assert.equal(r.stats.dropped, 1);
});

test('refine: 质量兜底 —— score 低时截止频率被压低（更平滑更迟钝）', () => {
  assert.equal(qualityScale(1), 1);
  assert.equal(qualityScale(0), DEFAULT_REFINE.slowdownFactor);
  const mid = qualityScale((DEFAULT_REFINE.qualityFloor + DEFAULT_REFINE.qualityStart) / 2);
  assert.ok(mid > DEFAULT_REFINE.slowdownFactor && mid < 1, `中间值应在两端之间：${mid}`);

  // 端到端：同一个阶跃，低 score 的响应必须更慢
  const step = (score: number) => {
    const r = createRefiner();
    for (let f = 0; f < 120; f++) r.apply(pose({ 15: { x: 0 } }, score), DT);
    let v = 0;
    for (let f = 0; f < 10; f++) v = r.apply(pose({ 15: { x: 1 } }, score), DT).world[15].x;
    return v;
  };
  assert.ok(step(0.2) < step(1.0), '低质量时对阶跃的跟随应更慢');
});

test('refine: 抗 NaN / 抗坏输入 —— 绝不产生非有限值（P2）', () => {
  const r = createRefiner();
  const bad: RawPose = {
    world: [{ x: NaN, y: 0, z: 0 }, { x: 0, y: Infinity, z: 0, visibility: NaN }],
    score: NaN, t: NaN,
  };
  for (let f = 0; f < 5; f++) {
    const out = r.apply(bad, NaN);
    for (const l of out.world) {
      assert.ok(Number.isFinite(l.x) && Number.isFinite(l.y) && Number.isFinite(l.z), '坐标必须有限');
      assert.ok(Number.isFinite(l.visibility ?? 0), 'visibility 必须有限');
    }
  }
  // 空输入也不许炸
  assert.doesNotThrow(() => r.apply({ world: [], score: 0, t: 0 }, DT));
});

test('refine: apply 不改写输入', () => {
  const r = createRefiner();
  const p = pose({ 15: { x: 0.5 } });
  const snapshot = JSON.stringify(p);
  r.apply(p, DT);
  assert.equal(JSON.stringify(p), snapshot);
});

test('clampFold: 折成一根针的手臂被推开到最小折叠角，骨长不变', () => {
  const raw = pose();
  // 造一条"肘处折成 0°"的左臂：wrist 正好落在 shoulder 方向上
  raw.world[11] = { x: 0.2, y: 0, z: 0, visibility: 1 };   // L_SHOULDER
  raw.world[13] = { x: 0.0, y: 0, z: 0, visibility: 1 };   // L_ELBOW
  raw.world[15] = { x: 0.1, y: 0, z: 0, visibility: 1 };   // L_WRIST  ← 折回去了
  const sk = buildSkeleton(mediapipeToWorld(raw), raw.world, 0);
  const before = Math.hypot(
    sk.joints.wristL[0] - sk.joints.elbowL[0],
    sk.joints.wristL[1] - sk.joints.elbowL[1],
    sk.joints.wristL[2] - sk.joints.elbowL[2],
  );
  const fixed = clampFold(sk);
  assert.equal(fixed >= 1, true, '至少修正一处');
  const after = Math.hypot(
    sk.joints.wristL[0] - sk.joints.elbowL[0],
    sk.joints.wristL[1] - sk.joints.elbowL[1],
    sk.joints.wristL[2] - sk.joints.elbowL[2],
  );
  assert.ok(Math.abs(after - before) < 1e-9, `骨长必须保持：${before} → ${after}`);

  // 修正后的夹角 ≥ 最小折叠角
  const u = [sk.joints.shoulderL[0] - sk.joints.elbowL[0], sk.joints.shoulderL[1] - sk.joints.elbowL[1], sk.joints.shoulderL[2] - sk.joints.elbowL[2]];
  const v = [sk.joints.wristL[0] - sk.joints.elbowL[0], sk.joints.wristL[1] - sk.joints.elbowL[1], sk.joints.wristL[2] - sk.joints.elbowL[2]];
  const lu = Math.hypot(...u), lv = Math.hypot(...v);
  const ang = Math.acos(Math.min(1, Math.max(-1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (lu * lv))));
  assert.ok(ang >= (18 * Math.PI) / 180 - 1e-6, `夹角应被推到最小值以上：${(ang * 180 / Math.PI).toFixed(1)}°`);
});

test('clampFold: 正常姿势不被改动；退化/缺失输入不产生 NaN', () => {
  const raw = pose();
  raw.world[11] = { x: 0.2, y: 0, z: 0, visibility: 1 };
  raw.world[13] = { x: 0.2, y: -0.3, z: 0, visibility: 1 };
  raw.world[15] = { x: 0.2, y: -0.6, z: 0, visibility: 1 };   // 手臂伸直
  const sk = buildSkeleton(mediapipeToWorld(raw), raw.world, 0);
  const snap = JSON.stringify(sk.joints.wristL);
  clampFold(sk);
  assert.equal(JSON.stringify(sk.joints.wristL), snap, '伸直的手臂不该被动');

  // 零长（关节重合）不许产生 NaN
  const deg = buildSkeleton(mediapipeToWorld(pose({ 11: { x: 0, y: 0, z: 0 }, 13: { x: 0, y: 0, z: 0 }, 15: { x: 0, y: 0, z: 0 } })), pose().world, 0);
  assert.doesNotThrow(() => clampFold(deg));
  for (const k in deg.joints) {
    for (const c of deg.joints[k]) assert.ok(Number.isFinite(c), `${k} 必须有限`);
  }
});
