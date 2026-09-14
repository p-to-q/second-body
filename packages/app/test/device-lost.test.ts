/**
 * WebGPU device lost（docs/48 §5）。
 *
 * device 丢了之后什么都画不出来：关后期、换占位几何都救不回来，前两级是白走。
 * 所以这一种直接跳到重载 —— 但仍然吃 `degrade.ts` 那道"一个会话最多重载两次"的闸。
 *
 * **`destroyed` 不重载**：那是我们自己把渲染器拆了（离开舞台时由页面过渡那条线做）。
 * 把它当成事故，观众每离开一次舞台页面就会被重载一次。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  degradeTo, deviceLostAction, getDegradeState, registerDegradeHandler,
  resetDegrade, setDegradeReloadAction,
} from '../src/shell/degrade.ts';

test('device lost: 意外丢失 → 重载；自己拆的（destroyed）→ 不管', () => {
  assert.equal(deviceLostAction({ reason: 'unknown' }), 'reload');
  assert.equal(deviceLostAction({ reason: null }), 'reload');
  assert.equal(deviceLostAction(undefined), 'reload');
  assert.equal(deviceLostAction({ reason: 'destroyed' }), 'ignore');
});

test('device lost: degradeTo(reload) 直接重载，不白走前两级', () => {
  resetDegrade();
  const reloads: number[] = [];
  const post: number[] = [];
  setDegradeReloadAction(() => reloads.push(1));
  registerDegradeHandler('post', () => post.push(1));
  assert.equal(degradeTo('reload', 'device lost'), 'reload');
  assert.equal(reloads.length, 1, '必须真的调重载');
  assert.equal(post.length, 0, 'device 都没了，关后期没有意义');
  assert.equal(getDegradeState().stage, 'reload');
  assert.equal(getDegradeState().reason, 'device lost');
});

test('device lost: 重载闸照旧 —— 一个会话最多两次，第三次不重载', () => {
  resetDegrade();
  const reloads: number[] = [];
  setDegradeReloadAction(() => reloads.push(1));
  const store = new Map<string, string>();
  const g = globalThis as { sessionStorage?: unknown };
  const had = 'sessionStorage' in g;
  const prev = g.sessionStorage;
  g.sessionStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
  try {
    degradeTo('reload', 'a');
    degradeTo('reload', 'b');
    assert.equal(degradeTo('reload', 'c'), null, '第三次不许重载 —— 宁可画面坏，不要每几秒黑一次');
    assert.equal(reloads.length, 2);
  } finally {
    if (had) g.sessionStorage = prev; else delete g.sessionStorage;
    resetDegrade();
  }
});
