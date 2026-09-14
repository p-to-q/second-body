/**
 * HUD 的 people 那几行（`shell/hud.ts` 的 `formatPeopleRows`，docs/50）。
 * 现场调门限的人靠它：每条轨迹是主 / 伴 / 无、为什么没有身体、这一帧配对代价是多少。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPeopleTracker } from '../../core/src/people.ts';
import { person } from '../../core/test/framing-people.ts';
import { formatPeopleRows } from '../src/shell/hud.ts';

test('people 行：人数 / 上限 / 预算；每条轨迹一行，主 / 伴 / 无 与没有身体的理由', () => {
  const tr = createPeopleTracker({ cap: 2 });
  let f = tr.current;
  for (let k = 0; k < 60; k++) f = tr.update([person({ cx: 0.2 }), person({ cx: 0.5 }), person({ cx: 0.8, s: 0.3 })], 1 / 30);
  const rows = formatPeopleRows({ frame: f, cap: 3, bodies: 2, outlineYields: true, shed: false });
  assert.match(rows[0], /^2\/3 人 · 身体上限 2（预算） · 描边让位$/);
  assert.equal(rows.length, 1 + f.tracks.length);
  assert.ok(rows.some((r) => / 主 /.test(r)), rows.join('\n'));
  assert.ok(rows.some((r) => / 伴 /.test(r)));
  assert.ok(rows.some((r) => / 无 .*满员/.test(r)), '上限到了的那个人要说"满员"，不是一行空白');
  assert.ok(rows.filter((r) => /cost \d/.test(r)).length >= 2, '被看见的轨迹带配对代价');

  const shed = formatPeopleRows({ frame: f, cap: 2, bodies: 2, outlineYields: false, shed: true });
  assert.match(shed[0], /调速器：只留主身体/);
  assert.ok(!/（预算）/.test(shed[0]), '预算放得下时不说预算');
});
