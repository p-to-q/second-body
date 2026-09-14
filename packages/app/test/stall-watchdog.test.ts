/**
 * 帧循环停摆的看门狗（`shell/stall.ts`）—— docs/48 §10.6。
 *
 * 实测：展签 → 选择页 → 舞台 → 按「摄像头」，约 2.3 秒后页面**不再出帧**（有窗口的 Chrome 也复现），
 * 而 JS 还活着（定时器照走）。调速器住在帧循环里，帧停了它也停 —— 应用里没有任何东西发现这件事。
 * 根因还没追到；这一层是**兜底**：用不依赖 rAF 的定时器判停摆，停摆就走已有的、有次数上限的重载（`degradeTo('reload')`）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isStalled, STALL_MS } from '../src/shell/stall.ts';

test('停摆判据：页面看得见、循环开跑过、超过门限没有一帧', () => {
  assert.ok(STALL_MS >= 3000 && STALL_MS <= 8000, `门限 ${STALL_MS}ms 不合理：太短会把一次长任务当停摆，太长观众早走了`);
  const base = { started: true, visible: true };
  assert.equal(isStalled({ ...base, lastFrameAt: 0, now: STALL_MS - 1 }), false, '没到门限就判了停摆');
  assert.equal(isStalled({ ...base, lastFrameAt: 0, now: STALL_MS + 1 }), true, '超过门限没判停摆');
  // 标签页在后台时浏览器本来就不出帧：那不是停摆
  assert.equal(isStalled({ started: true, visible: false, lastFrameAt: 0, now: STALL_MS * 10 }), false, '后台标签页被判成停摆');
  // 循环还没开始（加载中）不算
  assert.equal(isStalled({ started: false, visible: true, lastFrameAt: 0, now: STALL_MS * 10 }), false, '加载阶段被判成停摆');
  assert.equal(isStalled({ ...base, lastFrameAt: Number.NaN, now: STALL_MS * 10 }), false, 'NaN 时间戳被判成停摆');
});

test('main.ts 用不依赖 rAF 的定时器看门，停摆走有上限的重载', () => {
  const main = readFileSync(fileURLToPath(new URL('../src/main.ts', import.meta.url)), 'utf8');
  assert.match(main, /watchStall\(/, 'main.ts 没有挂停摆看门狗');
  const stall = readFileSync(fileURLToPath(new URL('../src/shell/stall.ts', import.meta.url)), 'utf8');
  assert.match(stall, /setInterval\(/, '看门狗不是定时器 —— 放在 rAF 里的话帧停了它也停');
  assert.doesNotMatch(stall, /requestAnimationFrame/, '看门狗依赖了 rAF');
  assert.match(main, /degradeTo\('reload'/, '停摆没有走 degradeTo 的重载（它有每会话两次的上限，不会重载成死循环）');
});
