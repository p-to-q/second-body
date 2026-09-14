/**
 * 空闲切片队列（docs/48 §10）：把"迟早要做、但不必在帧循环里做"的活挪进浏览器空闲时间。
 *
 * 实测（B-prof2，升档 2→3 那一帧 255ms）：帧循环里 `library.mirrored()` 现做镜像副本、
 * `entryFor` 现建桶。镜像副本只依赖已经到货的几何，它不该等到第一次被画的那一帧才做。
 * 这张表守的是调度本身：去重、按切片预算停手、没有 requestIdleCallback 也能跑、一件活炸了不拖垮后面的。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdleQueue } from '../src/assets/idle-queue.ts';

/** 可控的时钟：每做一件活走 `cost` 毫秒 */
function clock() {
  let now = 0;
  return { now: () => now, advance: (ms: number) => { now += ms; } };
}

test('空闲队列: 同一个 key 排两次只做一次；做过的 key 再排不再做', () => {
  const c = clock();
  const done: string[] = [];
  const q = createIdleQueue({ now: c.now, schedule: () => {} });
  q.add('a', () => { done.push('a'); });
  q.add('a', () => { done.push('a2'); });
  q.add('b', () => { done.push('b'); });
  q.run(1000);
  assert.deepEqual(done, ['a', 'b']);
  q.add('a', () => { done.push('a3'); });
  q.run(1000);
  assert.deepEqual(done, ['a', 'b'], '做过的不再做');
  assert.equal(q.pending, 0);
});

test('空闲队列: 切片预算用完就停手，剩下的留给下一个空闲时段，并且要求再排一次', () => {
  const c = clock();
  const done: number[] = [];
  let scheduled = 0;
  const q = createIdleQueue({ now: c.now, schedule: () => { scheduled++; } });
  for (let i = 0; i < 10; i++) q.add(`k${i}`, () => { done.push(i); c.advance(4); });
  assert.ok(scheduled >= 1, '加了活要请求空闲时段');
  scheduled = 0;
  q.run(10);                      // 10ms 的切片：做到第三件时超了，停
  assert.ok(done.length >= 1 && done.length <= 3, `一片做了 ${done.length} 件`);
  assert.ok(q.pending > 0);
  assert.ok(scheduled >= 1, '没做完要再请求一次');
  while (q.pending) q.run(10);
  assert.deepEqual(done, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], '顺序不变');
});

test('空闲队列: 一件活炸了只记一笔，后面的照做；切片为 0 时至少做一件（不饿死）', () => {
  const c = clock();
  const done: string[] = [];
  const q = createIdleQueue({ now: c.now, schedule: () => {}, onError: () => {} });
  q.add('boom', () => { throw new Error('x'); });
  q.add('ok', () => { done.push('ok'); });
  assert.doesNotThrow(() => q.run(0));
  q.run(0);
  assert.deepEqual(done, ['ok']);
});

test('空闲队列: clear 丢掉没做的（换了一个观众），做过的记账也清掉', () => {
  const c = clock();
  const done: string[] = [];
  const q = createIdleQueue({ now: c.now, schedule: () => {} });
  q.add('a', () => { done.push('a'); });
  q.clear();
  q.run(100);
  // 用 length 比，不用 deepEqual(done, [])：后者是类型断言，会把 done 收窄成 never[]
  assert.equal(done.length, 0);
  q.add('a', () => { done.push('a'); });
  q.run(100);
  assert.deepEqual(done, ['a']);
});
