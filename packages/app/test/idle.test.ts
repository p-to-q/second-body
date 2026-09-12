import test from 'node:test';
import assert from 'node:assert/strict';
import { IDLE, idleState, noteActivity, notePresence, resetIdle } from '../src/shell/idle.ts';

// 无人降帧是给机器降温用的（docs/09 §C 过热那一行）。
// 它最容易错的方向不是"没降"，而是"有人的时候也降" —— 那会当着观众的面变卡。

test('idle: 没收到过任何信号时不许降帧', () => {
  resetIdle();
  assert.equal(idleState(0).throttled, false, '没接线的页面不该莫名其妙变慢');
});

test('idle: 没人超过阈值才降，差一秒都不降', () => {
  resetIdle();
  notePresence(true, 0);
  assert.equal(idleState(0).throttled, false);
  assert.equal(idleState((IDLE.afterSeconds - 1) * 1000).throttled, false);
  assert.equal(idleState(IDLE.afterSeconds * 1000).throttled, true);
});

test('idle: 人一回来立刻满血，不等任何过渡', () => {
  resetIdle();
  notePresence(true, 0);
  const late = IDLE.afterSeconds * 1000 + 5000;
  assert.equal(idleState(late).throttled, true);
  notePresence(true, late);
  assert.equal(idleState(late).throttled, false);
});

test('idle: 动一下鼠标也算有人（现场调试不该对着 10fps 调参）', () => {
  resetIdle();
  notePresence(true, 0);
  const late = IDLE.afterSeconds * 1000 + 1;
  assert.equal(idleState(late).throttled, true);
  noteActivity(late);
  assert.equal(idleState(late).throttled, false);
});

test('idle: notePresence(false) 不刷新计时器 —— 否则"没人"反而会被当成有人', () => {
  resetIdle();
  notePresence(true, 0);
  notePresence(false, 1000);
  assert.equal(idleState(IDLE.afterSeconds * 1000).throttled, true);
});
