import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPool, POOL_KINDS, type PoolKind } from '../src/ui/pool.ts';

/**
 * 上场名单（`ui/pool.ts`）。这里只测**纯的那一半** —— `applyPool`。
 *
 * `readPool` / `setPool` 摸 `location` 和 `localStorage`，在 node 里要么造两个假的、
 * 要么就测不到；造假的那一份测的是假的那一份。真正会把装置弄停的是筛选本身：
 * 「勾了一类，结果选择页是空的」。所以门立在这儿。
 */

type Row = { id: string; kind: PoolKind };

const ROSTER: Row[] = [
  { id: 'atlas', kind: 'archetype' },
  { id: 'g1', kind: 'archetype' },
  { id: 'spot', kind: 'archetype' },
  { id: 'guest.keynote', kind: 'guest' },
  { id: 'char.inflate', kind: 'character' },
  { id: 'char.diva', kind: 'character' },
];

test('pool: 只勾一类就只剩那一类', () => {
  const only = applyPool(ROSTER, new Set<PoolKind>(['archetype']));
  assert.deepEqual(only.map((t) => t.id), ['atlas', 'g1', 'spot']);
});

test('pool: 勾两类是并集，且**保持原来的顺序**', () => {
  // 顺序不是可有可无的：选择页按形态空间绕圈排（choose.ts 的 morphologyOrder），
  // 它拿到的数组顺序如果被筛选打乱，同一个名单每次刷新排出来的圈都不一样。
  const two = applyPool(ROSTER, new Set<PoolKind>(['archetype', 'character']));
  assert.deepEqual(two.map((t) => t.id), ['atlas', 'g1', 'spot', 'char.inflate', 'char.diva']);
});

test('pool: 全勾 = 原样', () => {
  const all = applyPool(ROSTER, new Set<PoolKind>(POOL_KINDS));
  assert.deepEqual(all.map((t) => t.id), ROSTER.map((t) => t.id));
});

test('pool: 筛空了就原样放行 —— 选择页永远不会是空的', () => {
  // 这一条是这个文件存在的理由。名单里一个 guest 都没有的时候，
  // 一个只勾了 guest 的设置**不该**让装置停在一张白纸上。
  const noGuests = ROSTER.filter((t) => t.kind !== 'guest');
  const kept = applyPool(noGuests, new Set<PoolKind>(['guest']));
  assert.deepEqual(kept.map((t) => t.id), noGuests.map((t) => t.id));
});

test('pool: 空名单进、空名单出，不炸', () => {
  assert.deepEqual(applyPool([] as Row[], new Set<PoolKind>(['archetype'])), []);
});

test('pool: 一个空的勾选集合等于"全放行"，不是"全拦掉"', () => {
  // setPool 拒绝写入空集合，但 URL 是可以被人手改的，`?kinds=` 就能造出这一种。
  // 那时候要么全放行、要么装置停 —— 只有一个答案是对的。
  const kept = applyPool(ROSTER, new Set<PoolKind>());
  assert.equal(kept.length, ROSTER.length);
});
