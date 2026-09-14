/**
 * `?preview=` 认不出来的值当没写过，**并且喊一声** —— 和 `?readout=` 同一条。
 *
 * 它原来默默退回默认：写错了，小屏幕照常按默认挂或不挂，现场的人分不出
 * "参数没生效"和"参数本来就是这个意思"。同一套 on / off 词汇的两个开关，
 * 一个出错会说、一个不说，那本身就是一处不一致。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFlags } from '../src/shell/kiosk.ts';

test('?preview= 认不出来的值当没写过，并且喊一声；合法值不喊', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const said = (needle: string): boolean =>
    warn.mock.calls.some((c) => String(c.arguments[0]).includes(needle));

  assert.equal(readFlags('?preview=1').preview, null, '?preview=1 不该被猜成 on');
  assert.ok(said('?preview=1'), '写错了 ?preview= 却一声没吭');

  warn.mock.resetCalls();
  assert.equal(readFlags('?preview=on').preview, 'on');
  assert.equal(readFlags('?preview=off').preview, 'off');
  assert.equal(readFlags('').preview, null);
  assert.ok(!said('?preview='), '合法值或没写也喊了 —— 狼来了的警告会被人关掉');
});
