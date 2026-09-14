/**
 * 两处"看得见 / 对得齐"的回归守卫（作品负责人 2026-09-14）。
 *
 * 1. 工作台满屏画布页的浮层页头：墨跟场景走（`--sb-on-stage`），淡出后仍读得出。
 *    原来固定浅墨 + 淡到 0.18，/dev/stage.html 的浅灰场景上基本看不见。
 * 2. /marks 的九枚记号：竖直对齐右边标题的第一行，而不是被行基线抬高。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

test('浮层页头：墨取场景墨，说明不再叠透明，淡出后不低于 0.4', () => {
  const chrome = css('../src/ui/chrome.css');
  assert.match(chrome, /\.sb-head--overlay\s*\{\s*color:\s*var\(--sb-on-stage\)/, '浮层页头没有跟场景墨走');
  const note = chrome.match(/\.sb-head--overlay \.sb-head__note\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(note, /var\(--sb-on-stage-dim\)/, '说明没有用场景暗墨');
  assert.doesNotMatch(note, /opacity/, '说明又叠了一层透明');
  const faded = Number(chrome.match(/\.sb-head--faded\s*\{\s*opacity:\s*([\d.]+)/)?.[1]);
  assert.ok(faded >= 0.4, `淡出后的不透明度 ${faded} 太低，背景上读不出`);
});

test('/marks 记号贴行顶、高度等于标题行盒，不按基线对齐', () => {
  const room = css('../src/rooms/room.css');
  const mark = room.match(/\.room-specimen__mark\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(mark, /align-self:\s*start/, '记号格子还在跟着行基线走 —— 会比标题高出一截');
  assert.match(mark, /height:\s*calc\(var\(--sb-size-h2\)\s*\*\s*var\(--sb-lh-h2\)\)/, '记号格子的高度不是标题那一行的行盒');
});
