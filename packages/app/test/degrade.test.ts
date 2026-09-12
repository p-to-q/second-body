import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEGRADE_LADDER, degrade, getDegradeState, registerDegradeHandler,
  resetDegrade, setDegradeReloadAction,
} from '../src/shell/degrade.ts';
import { readFlags } from '../src/shell/kiosk.ts';

// P3：降级路径必须存在**且被测试过**。以前连续出错只打一行日志 ——
// 这些用例盯的就是"它真的一级一级往下走"，而不是"它说了一句自己降级了"。

test('degrade: 按 关后期 → 占位几何 → 重载 的顺序，一次一级', () => {
  resetDegrade();
  const reloads: number[] = [];
  setDegradeReloadAction(() => reloads.push(1));

  assert.deepEqual(DEGRADE_LADDER, ['post', 'placeholder', 'reload']);

  assert.equal(degrade('boom'), 'post');
  assert.equal(getDegradeState().nopost, true);
  assert.equal(getDegradeState().placeholder, false, '第 1 级不许顺手把第 2 级也做了');
  assert.equal(reloads.length, 0, '第 1 级绝不能重载 —— 现场黑场是最贵的动作，只能放最后');

  assert.equal(degrade('boom'), 'placeholder');
  assert.equal(getDegradeState().placeholder, true);
  assert.equal(reloads.length, 0);

  assert.equal(degrade('boom'), 'reload');
  assert.equal(reloads.length, 1, '第 3 级必须真的调重载，不是打日志');

  assert.equal(degrade('boom'), null, '走完了就返回 null，不许无限重载');
  assert.equal(getDegradeState().reason, 'boom');
});

test('degrade: 各级的动作由子系统注册，只有那一级会被打到', () => {
  resetDegrade();
  setDegradeReloadAction(() => {});
  const hit: string[] = [];
  registerDegradeHandler('post', () => hit.push('post'));
  registerDegradeHandler('placeholder', () => hit.push('placeholder'));

  degrade();
  assert.deepEqual(hit, ['post']);
  degrade();
  assert.deepEqual(hit, ['post', 'placeholder']);
});

test('degrade: 处理器自己抛异常不许把降级链打断', () => {
  resetDegrade();
  setDegradeReloadAction(() => {});
  registerDegradeHandler('post', () => { throw new Error('处理器炸了'); });
  assert.equal(degrade(), 'post');
  assert.equal(degrade(), 'placeholder', '前一级的处理器炸掉之后，阶梯还要能往下走');
});

test('degrade: 晚注册的子系统会被补执行 —— 不许活在降级前的世界里', () => {
  resetDegrade();
  setDegradeReloadAction(() => {});
  degrade();                              // 先降到 post
  let late = 0;
  registerDegradeHandler('post', () => { late++; });
  assert.equal(late, 1, '注册时已经处于该级，就该立刻补一次');
});

test('degrade: 第 1 级之后 readFlags().nopost 必须变真', () => {
  resetDegrade();
  assert.equal(readFlags('').nopost, false);
  degrade();
  assert.equal(readFlags('').nopost, true, '谁读 flags 谁就该看到降级后的世界，不用各记一份状态');
});
