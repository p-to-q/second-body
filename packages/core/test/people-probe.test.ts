/**
 * 自动探测（`core/src/people-probe.ts`，docs/50 §6.3 修订）。钉的是四条决定好的行为：
 * 稳稳地被选中才升档、一次擦肩而过不升档、顶格了不再探、多出来的身体没人坐够久就退档。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createProbeState, stepProbe, type ProbeState } from '../src/people-probe.ts';
import { PEOPLE } from '../src/tuning.ts';

const HZ = 30;
const DT = 1 / HZ;

/** 跑 `seconds` 秒，每一帧问 `selectedAt(t)` 这一帧有几个人拿到身体。返回最终 state 和逐帧的 target/justEscalated */
function run(state: ProbeState, seconds: number, selectedAt: (t: number) => number) {
  let s = state;
  let t = 0;
  const steps: Array<{ target: number; justEscalated: boolean; hint: number }> = [];
  while (t < seconds) {
    const r = stepProbe(s, { dt: DT, selectedCount: selectedAt(t) });
    s = r.state;
    steps.push({ target: r.target, justEscalated: r.justEscalated, hint: s.hint });
    t += DT;
  }
  return { state: s, steps };
}

test('稳态：没有多出来的人时不会自己升档，探测窗口按 probeIntervalSeconds 定期开', () => {
  const { steps } = run(createProbeState(1), PEOPLE.probeIntervalSeconds + PEOPLE.probeWindowSeconds + 1, () => 1);
  assert.ok(!steps.some((s) => s.justEscalated), '画面里只有一个人，永远不该升档');
  assert.ok(steps.some((s) => s.target === 2), '到点了该开一扇窗口，target 短暂抬到 2');
  // 窗口没等到人，退回稳态：结尾的 target 应该是 1
  assert.equal(steps[steps.length - 1].target, 1, '窗口没等到人，退回原来那一档');
});

test('第二个人稳稳地被选中够久才升档，不是转正那一刻就升', () => {
  // probeIntervalSeconds 之后窗口打开，从那一刻起这个人就一直被选中
  const openAt = PEOPLE.probeIntervalSeconds;
  const { state, steps } = run(createProbeState(1), openAt + PEOPLE.probeWindowSeconds, (t) => (t >= openAt ? 2 : 1));
  assert.equal(state.level, 2, '窗口内持续被选中够久，该升到 2');
  const hit = steps.find((s) => s.justEscalated);
  assert.ok(hit, '应该有恰好一帧标记 justEscalated');
  assert.ok(hit!.hint > 0, '升档那一帧提示要点亮');
});

test('一次擦肩而过（够不上 probeConfirmSeconds）不会升档', () => {
  const openAt = PEOPLE.probeIntervalSeconds;
  const blipStart = openAt + 0.2;
  const blipEnd = blipStart + Math.max(0.05, PEOPLE.probeConfirmSeconds - 0.3); // 明显短于 probeConfirmSeconds
  const { state, steps } = run(createProbeState(1), openAt + PEOPLE.probeWindowSeconds + 1, (t) => (t >= blipStart && t < blipEnd ? 2 : 1));
  assert.equal(state.level, 1, '一晃而过的第二个人不该拿到一具永久的身体');
  assert.ok(!steps.some((s) => s.justEscalated), '不该有任何一帧标记升档');
});

test('顶格之后不再开探测窗口（省下无意义的检测器成本）', () => {
  const top = createProbeState(PEOPLE.hardMax);
  const { steps } = run(top, PEOPLE.probeIntervalSeconds * 3, () => PEOPLE.hardMax);
  assert.ok(steps.every((s) => s.target === PEOPLE.hardMax), '顶格了，target 应该恒定在 hardMax');
});

test('升档之后，多出来的身体连续没人坐够久，退回上一档', () => {
  let s = createProbeState(2); // 已经在 level=2（比如上一段测试升上去的）
  let t = 0;
  let level = 2;
  // 走够 probeDeescalateSeconds，期间 selectedCount 恒为 1（只剩主身体）。
  // 上限留够余量：中途可能穿插一次给第三个人开的探测窗口，那几秒 idleHeld 不涨
  const cap = PEOPLE.probeDeescalateSeconds + PEOPLE.probeIntervalSeconds + PEOPLE.probeWindowSeconds * 2 + 2;
  while (t < cap && level > 1) {
    const r = stepProbe(s, { dt: DT, selectedCount: 1 });
    s = r.state;
    level = r.target;
    t += DT;
  }
  assert.equal(level, 1, `伴随身体久没人坐，该退回单人（用了 ${t.toFixed(1)}s）`);
});

test('坏输入不 throw：负 dt、NaN 人数、超大 dt', () => {
  const s = createProbeState(1);
  assert.doesNotThrow(() => stepProbe(s, { dt: -1, selectedCount: Number.NaN }));
  assert.doesNotThrow(() => stepProbe(s, { dt: Number.NaN, selectedCount: -3 }));
  assert.doesNotThrow(() => stepProbe(s, { dt: 999, selectedCount: 2 }));
});
