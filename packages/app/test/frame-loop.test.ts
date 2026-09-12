import test from 'node:test';
import assert from 'node:assert/strict';

// 帧循环要在 node 里被驱动，先把 rAF 换成手动步进的假实现，再 import。
// 这样"降级"和"降帧"就不用坐在浏览器前面等五分钟、也不用肉眼数帧。
let queued: ((t: number) => void) | null = null;
const g = globalThis as unknown as {
  requestAnimationFrame: (cb: (t: number) => void) => number;
  cancelAnimationFrame: (h: number) => void;
};
g.requestAnimationFrame = (cb) => { queued = cb; return 1; };
g.cancelAnimationFrame = () => { queued = null; };
const step = (tMs: number): void => { const cb = queued; queued = null; cb?.(tMs); };

const { createFrameLoop } = await import('../src/shell/safe-frame.ts');
const { IDLE, notePresence, resetIdle } = await import('../src/shell/idle.ts');
const { getDegradeState, resetDegrade, setDegradeReloadAction } = await import('../src/shell/degrade.ts');

test('帧循环: 有人时每一帧都跑', () => {
  resetIdle(); resetDegrade();
  notePresence(true);
  let ticks = 0;
  const loop = createFrameLoop(() => { ticks++; });
  loop.start();
  for (let t = 0; t <= 200; t += 10) step(t);
  loop.stop();
  assert.equal(ticks, 21, '21 次 rAF 就该跑 21 帧，不许偷偷跳帧');
});

test('帧循环: 无人超时后真的降到 IDLE.fps，而不是"打算降"', () => {
  resetIdle(); resetDegrade();
  // 把"上次见到人"推到阈值之前 = 现场没人五分钟。
  // 必须走 notePresence：只有采集端上报过，降帧计时器才会被"武装"起来。
  notePresence(true, performance.now() - (IDLE.afterSeconds + 1) * 1000);
  let ticks = 0;
  const loop = createFrameLoop(() => { ticks++; });
  loop.start();
  // 假装显示器还在 100fps 地发 rAF：0,10,…,1000 共 101 次
  for (let t = 0; t <= 1000; t += 10) step(t);
  loop.stop();
  const expected = Math.round(1000 / (1000 / IDLE.fps)) + 1;   // 1 秒 × IDLE.fps + 第一帧
  assert.equal(ticks, expected, `降帧后 1 秒应当只跑 ${expected} 帧，实际 ${ticks}`);
  assert.equal(loop.stats.throttled, true);
});

test('帧循环: 人一回来立刻恢复满帧', () => {
  resetIdle(); resetDegrade();
  notePresence(true, performance.now() - (IDLE.afterSeconds + 1) * 1000);
  let ticks = 0;
  const loop = createFrameLoop(() => { ticks++; });
  loop.start();
  for (let t = 0; t <= 200; t += 10) step(t);
  const throttledTicks = ticks;
  notePresence(true);
  for (let t = 210; t <= 400; t += 10) step(t);
  loop.stop();
  assert.ok(throttledTicks <= 4, `降帧时 200ms 内最多 3~4 帧，实际 ${throttledTicks}`);
  assert.equal(ticks - throttledTicks, 20, '人回来之后每一帧都要跑');
});

test('帧循环: tick 每帧抛异常 —— rAF 不许断，降级阶梯要一级一级走完', () => {
  resetIdle(); resetDegrade();
  notePresence(true);
  const reloads: number[] = [];
  setDegradeReloadAction(() => reloads.push(1));

  const loop = createFrameLoop(() => { throw new Error('注入的假故障'); }, { degradeAfter: 5 });
  loop.start();

  for (let i = 1; i <= 4; i++) step(i * 10);
  assert.equal(getDegradeState().steps, 0, '还没到阈值就不许降级');

  step(50);
  assert.equal(getDegradeState().stage, 'post', '连续 5 帧 → 第 1 级：关后期');
  assert.equal(getDegradeState().nopost, true);

  for (let i = 6; i <= 10; i++) step(i * 10);
  assert.equal(getDegradeState().stage, 'placeholder', '还在错 → 第 2 级：占位几何');

  for (let i = 11; i <= 15; i++) step(i * 10);
  assert.equal(getDegradeState().stage, 'reload', '还在错 → 第 3 级：重载');
  assert.equal(reloads.length, 1);

  assert.ok(queued !== null, '帧循环必须还活着 —— P2：永不中断 rAF');
  assert.equal(loop.stats.errors, 15);
  assert.equal(loop.stats.degraded, 'reload');
  loop.stop();
});

test('帧循环: 错一帧又好了，不许把它算进连续出错', () => {
  resetIdle(); resetDegrade();
  notePresence(true);
  let n = 0;
  const loop = createFrameLoop(() => { if (++n % 2 === 0) throw new Error('间歇性故障'); }, { degradeAfter: 3 });
  loop.start();
  for (let i = 1; i <= 20; i++) step(i * 10);
  loop.stop();
  assert.equal(getDegradeState().steps, 0, '一帧好一帧坏不该触发降级 —— 那是抖动，不是崩');
  assert.ok(loop.stats.errors > 0);
});
