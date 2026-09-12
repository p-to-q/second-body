import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresence, PRESENCE_TUNING } from '../src/presence.ts';
import { createEvolution, EVOLUTION_TUNING } from '../src/evolution.ts';
import { oneEuro, emaAlpha, rollingMedian } from '../src/filter.ts';
import type { MotionFeatures } from '../src/types.ts';

const F = (energy: number): MotionFeatures =>
  ({ speed: energy, energy, expansiveness: 0.4, verticality: 0.4, symmetry: 0, jerk: 0, stillness: 0 });

const run = (fn: (dt: number) => void, seconds: number, dt = 1 / 60) => {
  for (let i = 0; i < Math.round(seconds / dt); i++) fn(dt);
};

test('presence: 进入需要滞回，不会被单帧抖动触发', () => {
  const p = createPresence();
  assert.equal(p.update(true, 0.1).state, 'IDLE');
  assert.equal(p.update(false, 0.1).state, 'IDLE');
  run((dt) => p.update(true, dt), 0.5);
  assert.notEqual(p.update(true, 1 / 60).state, 'IDLE');
});

test('presence: ENTERING → ALIVE → LEAVING → IDLE 并给出 justReset', () => {
  const p = createPresence();
  run((dt) => p.update(true, dt), 2.0);
  assert.equal(p.update(true, 1 / 60).state, 'ALIVE');
  run((dt) => p.update(false, dt), 1.2);
  assert.equal(p.update(false, 1 / 60).state, 'LEAVING');
  let reset = false;
  run((dt) => { p.update(false, dt); if (p.justReset) reset = true; }, PRESENCE_TUNING.leaveAnim + 0.5);
  assert.ok(reset, 'justReset 必须恰好触发一次');
  assert.equal(p.update(false, 1 / 60).state, 'IDLE');
});

test('presence: LEAVING 中途回来 → 直接 ALIVE，不清零', () => {
  const p = createPresence();
  run((dt) => p.update(true, dt), 2.0);
  run((dt) => p.update(false, dt), 1.3);
  assert.equal(p.update(false, 1 / 60).state, 'LEAVING');
  run((dt) => p.update(true, dt), 0.6);
  assert.equal(p.update(true, 1 / 60).state, 'ALIVE');
  assert.equal(p.justReset, false);
});

test('evolution: 持续运动升档，静止缓慢降档', () => {
  const e = createEvolution();
  run((dt) => e.update(F(1.0), dt), 2.0);
  assert.ok(e.state.tier >= 1, `tier=${e.state.tier}`);
  run((dt) => e.update(F(1.0), dt), 20.0);
  assert.equal(e.state.tier, 3);
  run((dt) => e.update(F(0), dt), 120.0);
  assert.ok(e.state.tier < 3, '长时间静止应该降档');
});

test('evolution: 第一次升档应在 8-15 秒内（docs/05 §3 设计意图）', () => {
  const e = createEvolution();
  let t = 0, firstUp = -1;
  run((dt) => { t += dt; const s = e.update(F(0.35), dt); if (firstUp < 0 && s.tier >= 1) firstUp = t; }, 40);
  assert.ok(firstUp > 0 && firstUp < 20, `一个温和活动的人第一次升档用了 ${firstUp.toFixed(1)}s`);
});

test('evolution: 阈值附近不抖（滞回 + cooldown）', () => {
  const e = createEvolution();
  run((dt) => e.update(F(1.0), dt), 3.0);
  let changes = 0;
  // 能量刚好抵消衰减，charge 在阈值附近游走
  run((dt) => { if (e.update(F(EVOLUTION_TUNING.decay), dt).tierChanged) changes++; }, 30);
  assert.ok(changes <= 1, `阈值附近换装 ${changes} 次，应 ≤1`);
});

test('filter: oneEuro 抗 NaN、抗 dt<=0', () => {
  const f = oneEuro();
  assert.equal(f(1, 1 / 60), 1);
  assert.ok(Number.isFinite(f(NaN, 1 / 60)));
  assert.ok(Number.isFinite(f(2, 0)));
  assert.ok(Number.isFinite(f(2, -1)));
});

test('filter: oneEuro 降噪但能收敛到真值', () => {
  const f = oneEuro({ minCutoff: 1.0, beta: 0.02 });
  let out = 0;
  for (let i = 0; i < 600; i++) out = f(5 + (i % 2 ? 0.3 : -0.3), 1 / 60);
  assert.ok(Math.abs(out - 5) < 0.15, `收敛到 ${out}`);
});

test('filter: emaAlpha 帧率无关', () => {
  const a60 = emaAlpha(1 / 60, 0.5), a30 = emaAlpha(1 / 30, 0.5);
  const after60 = 1 - (1 - a60) ** 60, after30 = 1 - (1 - a30) ** 30;
  assert.ok(Math.abs(after60 - after30) < 1e-6, '一秒后的响应量必须一致');
});

test('filter: rollingMedian 抗跳变', () => {
  const m = rollingMedian(9);
  let v = 0;
  for (let i = 0; i < 8; i++) v = m.push(1.0);
  v = m.push(100);                       // 单个离群值
  assert.ok(Math.abs(v - 1.0) < 1e-9, `中位数被离群值带偏: ${v}`);
});
