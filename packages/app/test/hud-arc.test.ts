/**
 * `?debug=1` HUD 上 `arc` 那一行（`shell/hud.ts` 的 `formatArcRow`）。
 *
 * 这一行是 docs/40 §5 的第 2 条：**现场调时长的人靠它，不靠掐表**。
 * 所以它要说清三件事 —— 现在第几乐章、这一段走了多少、还有多久到下一段 ——
 * 并且在弧线**停着**的时候和照常走的时候长得不一样（P21：一个在坏掉时
 * 读数和正常时一样的仪表不是仪表）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatArcRow } from '../src/shell/hud.ts';
import { arcPresent, createArc } from '../../core/src/arc.ts';

const run = (arc: ReturnType<typeof createArc>, seconds: number, present = true) => {
  const dt = 1 / 60;
  for (let i = 0; i < Math.round(seconds / dt); i++) arc.update(present, dt);
  return arc.state;
};

test('hud/arc: 三个数都在 —— 第几乐章、走了多少、还有多久', () => {
  const arc = createArc();
  const row = formatArcRow(run(arc, 20));
  assert.match(row, /^I 跟随/, `实得：${row}`);
  assert.match(row, /5[01]%/, `段内进度应当在一半上下，实得：${row}`);
  assert.match(row, /→II \d+s/, `要写清下一段是谁、还有多久，实得：${row}`);
});

test('hud/arc: 走完之后写「保持」，不写一个永远到不了的倒计时', () => {
  const arc = createArc();
  const row = formatArcRow(run(arc, 200));
  assert.match(row, /^IV 朝向/);
  assert.match(row, /保持/);
  assert.ok(!row.includes('→'), `停住之后不该还有"下一段"，实得：${row}`);
});

test('hud/arc: 没人的时候这一行要**看起来不一样** —— 弧线停着表', () => {
  const arc = createArc();
  run(arc, 50);
  const row = formatArcRow(run(arc, 3, false));
  assert.match(row, /无人 \d\.\ds/, `停表必须写出来，否则读者会以为它照常在走：${row}`);
});

test('hud/arc: 被按住的时候标出来 —— 那时乐章照走，身体不听它的', () => {
  const arc = createArc();
  assert.ok(formatArcRow(run(arc, 10), true).includes('[按住]'));
  assert.ok(!formatArcRow(arc.state, false).includes('[按住]'));
});

test('hud/arc: 归零之后这一行回到第 I 乐章 0%', () => {
  const arc = createArc();
  run(arc, 100);
  const row = formatArcRow(run(arc, 20, false));
  assert.match(row, /^I 跟随\s+0%/, `实得：${row}`);
});

test('hud/arc: 在场判定和弧线用的是同一个 —— HUD 不许自己再折一次', () => {
  // 这条看起来多余，但它钉的是一类真实的错：HUD 自己判"有没有人"，
  // 和弧线判的不一致，于是现场的人按着一行在骗他的读数去调时长（P21）。
  assert.equal(arcPresent({ state: 'ALIVE', elapsed: 1, transition: 1 }), true);
  const arc = createArc();
  const s = arc.update(arcPresent({ state: 'LEAVING', elapsed: 0.1, transition: 0 }), 1 / 60);
  assert.equal(s.running, false);
  assert.match(formatArcRow(s), /无人/);
});
