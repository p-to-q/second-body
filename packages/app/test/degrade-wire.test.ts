/**
 * 降级阶梯的前两级**有没有人接**（docs/36 D4）。
 *
 * `degrade.test.ts` 测的是阶梯本身：事件发得出去、状态位翻得对、处理器被调到。
 * 它一直是绿的 —— 而正式程序里那两级是空转的，因为 `registerDegradeHandler`
 * 在 `packages/app/src` 里一个调用者都没有，只有 `/dev/degrade.html` 注册了它自己的三条。
 * 那一页测的是"事件发得出去吗"，不是"有人接吗"。
 *
 * 所以这里问的是后一个问题，两种问法：
 *  1. 接线本身 —— 降到第 1 / 2 级时，后期真的被关、几何真的被换；
 *  2. 那条 grep —— `src` 里真的存在一个非 `degrade.ts` 的注册者。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { degrade, resetDegrade, setDegradeReloadAction } from '../src/shell/degrade.ts';
import { wireDegrade } from '../src/shell/degrade-wire.ts';

function spy() {
  const post: boolean[] = [];
  let placeholders = 0;
  const targets = { setPost: (on: boolean) => post.push(on), toPlaceholder: () => { placeholders++; } };
  return { targets, post, get placeholders() { return placeholders; } };
}

test('第 1 级真的关后期，第 2 级真的换占位几何 —— 一级只做一级的事', () => {
  resetDegrade();
  setDegradeReloadAction(() => {});
  const s = spy();
  wireDegrade(s.targets);

  assert.deepEqual(s.post, [], '还没降级就不该动后期');

  degrade('boom');
  assert.deepEqual(s.post, [false], '第 1 级必须真的调 setPost(false)');
  assert.equal(s.placeholders, 0, '第 1 级不许顺手把第 2 级也做了');

  degrade('boom');
  assert.deepEqual(s.post, [false]);
  assert.equal(s.placeholders, 1, '第 2 级必须真的换回占位几何');
});

test('注销之后不再被打到 —— 接线不许在 dispose 之后继续动画面', () => {
  resetDegrade();
  setDegradeReloadAction(() => {});
  const s = spy();
  wireDegrade(s.targets)();
  degrade('boom');
  degrade('boom');
  assert.deepEqual(s.post, []);
  assert.equal(s.placeholders, 0);
});

test('src 里真的有一个非 degrade.ts 的注册者 —— 这正是那次审计的 grep', () => {
  const root = resolve(import.meta.dirname, '../src');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = resolve(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.ts')) files.push(p);
    }
  };
  walk(root);
  const callers = files.filter((f) => !f.endsWith('shell/degrade.ts')
    && /registerDegradeHandler\s*\(/.test(readFileSync(f, 'utf8')));
  assert.ok(callers.length > 0,
    'packages/app/src 里没有人注册降级处理器 —— 阶梯前两级在正式程序里是空转的（docs/36 D4）');
});

test('main.ts 真的把 stage 与 creature 接上了 —— 光有接线模块不算', () => {
  const src = readFileSync(resolve(import.meta.dirname, '../src/main.ts'), 'utf8');
  assert.match(src, /wireDegrade\(/, 'main.ts 没有调用 wireDegrade');
  assert.match(src, /setPost:/);
  assert.match(src, /toPlaceholder:/);
});
