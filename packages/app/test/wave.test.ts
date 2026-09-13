/**
 * 举手滚动的两件纯东西：**状态机**和**速度映射**（`src/choose/ring/wave.ts`）。
 *
 * 这个文件要钉住的不是"它能滚"，是**它什么时候不该滚**。
 * 一个会被路人走过就转起来的装置，比一个根本不会转的装置更糟：
 * 后者只是少一个功能，前者读起来是"它自己有主意"。所以下面的用例里，
 * 真正重要的是那几条**假阳性**：手在肩线以下、举得不够久、双手都举着、
 * 追踪跳变、以及举着不动的手在抖。
 *
 * 帧全部用固定 dt 手动推 —— 没有时钟、没有 rAF（P1 / P21：
 * "等几帧再看"那种测法，在 dt 被钳住的地方会给出一个看起来对的假结果）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWaveReader, WAVE, type WaveInput } from '../src/choose/ring/wave.ts';

const DT = 1 / 60;

/** 一只垂着的手（远低于肩），永远不该触发任何东西 */
const down = (x = -0.2) => ({ x, y: 0.0, shoulderY: 0.5, ok: true });
/** 一只举过肩的手。`x` 是横向位置（米，世界系已镜像） */
const up = (x: number) => ({ x, y: 0.5 + WAVE.raise + 0.05, shoulderY: 0.5, ok: true });

const input = (left: WaveInput['left'], right: WaveInput['right']): WaveInput => ({ left, right });

/** 举着不动推 n 帧，返回最后一帧的读数快照（`update` 复用同一个对象，必须拷贝） */
function hold(reader: ReturnType<typeof createWaveReader>, frames: number, x = 0) {
  let out = reader.update(null, 0);
  for (let i = 0; i < frames; i++) out = reader.update(input(down(), up(x)), DT);
  return { ...out };
}

test('wave: 手在肩线以下 —— 举多久都不武装（挡的是边说话边比划的人）', () => {
  const r = createWaveReader();
  let out = r.update(null, 0);
  // 5 秒，远超 0.75 秒的蓄势时间
  for (let i = 0; i < 300; i++) {
    out = r.update(input(down(-0.2), { x: 0.1 * Math.sin(i / 5), y: 0.45, shoulderY: 0.5, ok: true }), DT);
  }
  assert.equal(out.phase, 'idle');
  assert.equal(out.charge, 0);
  assert.equal(out.spin, 0);
});

test('wave: 举过肩要连续 0.75 秒才武装 —— 蓄势期间一步都不滚', () => {
  const r = createWaveReader();
  // 0.5 秒：已经在蓄势，但还没武装
  const mid = hold(r, Math.round(0.5 / DT));
  assert.equal(mid.phase, 'arming');
  assert.ok(mid.charge > 0.5 && mid.charge < 1, `charge=${mid.charge}`);
  assert.equal(mid.spin, 0, '蓄势期间必须一步都不滚');

  // 再补到 0.75 秒以上
  const armed = hold(r, Math.round(0.4 / DT));
  assert.equal(armed.phase, 'armed');
  assert.equal(armed.charge, 1);
});

test('wave: 走过去的路人 —— 手越过肩线 0.3 秒就落下，不武装', () => {
  const r = createWaveReader();
  let out = r.update(null, 0);
  for (let i = 0; i < Math.round(0.3 / DT); i++) out = r.update(input(down(), up(0)), DT);
  assert.equal(out.phase, 'arming');
  // 手臂摆下去；宽限期 0.35 秒之后必须彻底归零
  for (let i = 0; i < Math.round(0.5 / DT); i++) out = r.update(input(down(), down(0.2)), DT);
  assert.equal(out.phase, 'idle');
  assert.equal(out.charge, 0);
  assert.equal(out.hand, null);
});

test('wave: 双手都举过肩 = 伸懒腰 / 拍照，不是操作 —— 整类切掉', () => {
  const r = createWaveReader();
  let out = r.update(null, 0);
  for (let i = 0; i < 300; i++) out = r.update(input(up(-0.3 + 0.2 * Math.sin(i / 8)), up(0.3)), DT);
  assert.equal(out.phase, 'idle', '双手举着不该武装');
  assert.equal(out.spin, 0);
});

test('wave: 武装之后，横向挥手给出与位移同号、成正比的角速度增量', () => {
  const r = createWaveReader();
  hold(r, Math.round(1.0 / DT), 0);         // 先武装，停在 x=0
  // 一次连续右挥：每帧 0.01 m（0.6 m/s，高于 minSpeed）
  let sum = 0;
  let out = r.update(null, 0);
  for (let i = 1; i <= 60; i++) {
    out = r.update(input(down(), up(i * 0.01)), DT);
    sum += out.spin;
  }
  assert.equal(out.phase, 'armed');
  assert.ok(sum > 0, `手往右 → 增量为正，实得 ${sum}`);
  // 平滑之后走过的净距离 ≈ 0.6 m 少一点（一阶低通的滞后），换算成弧度
  assert.ok(sum > 0.5 * 0.6 * WAVE.gain && sum < 0.6 * WAVE.gain * 1.01,
    `0.6m 的挥手应换出 ≈${(0.6 * WAVE.gain).toFixed(2)} rad/s 的冲量，实得 ${sum.toFixed(2)}`);

  // 反方向必须反号
  const r2 = createWaveReader();
  hold(r2, Math.round(1.0 / DT), 0);
  let back = 0;
  for (let i = 1; i <= 60; i++) back += r2.update(input(down(), up(-i * 0.01)), DT).spin;
  assert.ok(back < 0, `手往左 → 增量为负，实得 ${back}`);
});

test('wave: 举着不动的手在抖 —— 死区把它吃掉，名单绝不自己漂', () => {
  const r = createWaveReader();
  hold(r, Math.round(1.0 / DT), 0);
  let sum = 0;
  // ±3mm 的抖动，60Hz。速度峰值 0.18 m/s，但净位移为零 ——
  // 没有死区的话这会累成一个缓慢的漂移
  for (let i = 0; i < 600; i++) sum += r.update(input(down(), up(0.003 * Math.sin(i))), DT).spin;
  assert.ok(Math.abs(sum) < 1e-6, `抖动累计出了 ${sum}`);
});

test('wave: 追踪跳变（一帧挪半米）不算一次超快的挥手', () => {
  const r = createWaveReader();
  hold(r, Math.round(1.0 / DT), 0);
  const out = { ...r.update(input(down(), up(0.6)), DT) };
  assert.equal(out.spin, 0, '一帧 0.6m = 36 m/s，人办不到，必须丢掉');
});

test('wave: 追踪闪断一帧不该把人踢下来（0.35 秒宽限期）', () => {
  const r = createWaveReader();
  hold(r, Math.round(1.0 / DT), 0);
  // 丢 0.2 秒
  let out = r.update(null, 0);
  for (let i = 0; i < Math.round(0.2 / DT); i++) out = r.update(null, DT);
  assert.equal(out.phase, 'armed', '宽限期内必须还认得这个人');
  assert.equal(out.spin, 0, '但看不见手的时候一步都不许滚');
  // 手回来，立刻还能滚
  out = r.update(input(down(), up(0.01)), DT);
  out = r.update(input(down(), up(0.02)), DT);
  assert.equal(out.phase, 'armed');
});

test('wave: 正在开的那只手还举着时不许换手 —— 换手要重新蓄势', () => {
  const r = createWaveReader();
  hold(r, Math.round(1.0 / DT), 0);
  // 右手仍举着，左手也抬起来 → 双手，直接不认；放下右手之后左手要从头蓄
  let out = r.update(null, 0);
  for (let i = 0; i < Math.round(0.5 / DT); i++) out = r.update(input(up(-0.3), down(0.2)), DT);
  assert.equal(out.hand, 'left');
  assert.equal(out.phase, 'arming', '换到左手必须重新蓄 0.75 秒');
});

test('wave: 阈值有滞回 —— 停在肩线附近不会 30Hz 反复上下电', () => {
  const r = createWaveReader();
  hold(r, Math.round(1.0 / DT), 0);
  // 掉到肩线**之下** 0.01m：低于 raise，但还没到 drop（0.02），所以仍然算举着
  let out = r.update(null, 0);
  for (let i = 0; i < 20; i++) {
    out = r.update(input(down(), { x: 0, y: 0.5 - 0.01, shoulderY: 0.5, ok: true }), DT);
  }
  assert.equal(out.phase, 'armed', '滞回带里必须保持武装');
  // 再低一点，越过 drop，宽限期之后掉线
  for (let i = 0; i < Math.round(0.5 / DT); i++) {
    out = r.update(input(down(), { x: 0, y: 0.5 - 0.05, shoulderY: 0.5, ok: true }), DT);
  }
  assert.equal(out.phase, 'idle');
});

test('wave: 不可信 / 非有限的读数一律当作没有这只手（P2）', () => {
  const r = createWaveReader();
  let out = r.update(null, 0);
  for (let i = 0; i < 120; i++) out = r.update(input(down(), { ...up(0), ok: false }), DT);
  assert.equal(out.phase, 'idle', 'visibility 不够的手不算举起来');

  const r2 = createWaveReader();
  for (let i = 0; i < 120; i++) out = r2.update(input(down(), { ...up(0), y: NaN }), DT);
  assert.equal(out.phase, 'idle', 'NaN 不许变成一个举着的手');

  // dt 本身也是不可信输入
  const r3 = createWaveReader();
  out = r3.update(input(down(), up(0)), NaN);
  assert.ok(Number.isFinite(out.charge) && Number.isFinite(out.spin));
});

test('wave: offset 从举起来那一刻量起，钳在 -1..1', () => {
  const r = createWaveReader();
  // 举在 x = 2.0（人站在画面很偏的地方），offset 仍该从 0 起步
  const start = hold(r, 2, 2.0);
  assert.ok(Math.abs(start.offset) < 0.05, `刚举起来 offset 应 ≈0，实得 ${start.offset}`);
  let out = r.update(null, 0);
  for (let i = 0; i < 200; i++) out = r.update(input(down(), up(2.0 + 3)), DT);
  assert.equal(out.offset, 1, '远超满行程要钳住，不能一路跑出屏幕');
});

test('wave: reset() 之后是全新的一次 —— 不留上一个人的蓄势', () => {
  const r = createWaveReader();
  hold(r, Math.round(1.0 / DT), 0);
  r.reset();
  const out = { ...r.update(input(down(), up(0)), DT) };
  assert.equal(out.phase, 'arming');
  assert.ok(out.charge < 0.1);
});
