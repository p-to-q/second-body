/**
 * dt 尖峰（docs/48 §5）：切回前台、一次长任务 —— 状态机拿到的 dt 被钳住，
 * 调速器拿到的是**真实**间隔（它要据此认出"这是一次恢复，不是一次丢帧"）。
 * 两件事用的是同一次测量，不是两个时钟。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

let queued: ((t: number) => void) | null = null;
const g = globalThis as unknown as {
  requestAnimationFrame: (cb: (t: number) => void) => number;
  cancelAnimationFrame: (h: number) => void;
};
g.requestAnimationFrame = (cb) => { queued = cb; return 1; };
g.cancelAnimationFrame = () => { queued = null; };
const step = (tMs: number): void => { const cb = queued; queued = null; cb?.(tMs); };

const { createFrameLoop } = await import('../src/shell/safe-frame.ts');
const { notePresence, resetIdle } = await import('../src/shell/idle.ts');
const { TIME } = await import('../../core/src/tuning.ts');

test('帧循环: 5 秒的间隔 —— tick 拿到钳过的 dt，stats.frameMs 是真实的 5000', () => {
  resetIdle();
  notePresence(true);
  const dts: number[] = [];
  const loop = createFrameLoop((dt) => { dts.push(dt); }, { noIdleThrottle: true });
  loop.start();
  step(0); step(16); step(33);
  step(5033);
  loop.stop();
  assert.equal(dts.at(-1), TIME.dtMax, '状态机不许被 5 秒冲飞');
  assert.ok(Math.abs(loop.stats.frameMs - 5000) < 1e-6, `真实间隔要留给调速器，实际 ${loop.stats.frameMs}`);
});
