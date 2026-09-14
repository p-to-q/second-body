/**
 * 控件条（`ui/controls.ts`）只是**视图 + 接线**。node 加载不了它（它 import 了 .css），
 * 所以这里和 `readout.test.ts` 一样读源码守**决定**；像素在无头 Chrome 里量。
 *
 *  1. 面板里没有一处直接碰导演或弧线：按钮只增删叠加（`shell/intent.ts`），锁不住任何东西。
 *  2. 面板、快捷键、键位条都从控件表（`ui/control-table.ts`）推出来 —— 视图里不许再手写某一个控件。
 *  3. main.ts 里「人手按下的一律赢过弧线」那个 `planOverride` 没有了，形体到场读叠加。
 *  4. 面板滚到底不压右下角那一列。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string): string => readFileSync(resolve(APP, p), 'utf8');
const TS = read('src/ui/controls.ts');
const CSS = read('src/ui/controls.css');
const EXITS = read('src/ui/exits.ts');
const MAIN = read('src/main.ts');

test('控件条碰不到导演：没有 force、没有 setAct、没有 planOverride', () => {
  assert.doesNotMatch(TS, /director|\.force\(|setAct|setPlan/, 'controls.ts 在直接改导演 / 方案');
  assert.doesNotMatch(MAIN, /planOverride/, 'main.ts 里人手按下的形体仍然永远赢过弧线');
  assert.doesNotMatch(MAIN, /setAct:\s*\(id\)\s*=>\s*director\.force/, '控件条的玩法仍然走 director.force');
  assert.match(MAIN, /bodyAt\(intent, arcState\)/, '形体到场没有读叠加');
  // `?act=` 只剩「还回去」那一种走 force；弧线上的四个点从 URL 进来是叠加
  assert.match(MAIN, /intentFromFlags\(flags\)/);
});

test('面板、键、键位条都从控件表推出来', () => {
  assert.match(TS, /from '\.\/control-table\.ts'/);
  assert.match(TS, /CONTROLS\.filter\(/, '分组不是从表里筛出来的');
  assert.match(TS, /cycleNext\(/, '快捷键循环没走表');
  assert.match(TS, /stagePatch\(/, '重载写 URL 没走表');
  assert.match(TS, /rollSlots\(/, '随机的池子没走表');
  for (const id of ['vitality', 'refine', 'nopost', 'mute', 'shading', 'quadruped']) {
    assert.doesNotMatch(TS, new RegExp(`'${id}'`), `controls.ts 里手写了 '${id}' —— 这一项该在表里`);
  }
});

test('面板滚到底不压右下角那一列', () => {
  assert.match(EXITS, /'--sb-exits-h'/, 'exits.ts 没有把列高写出去');
  assert.match(EXITS, /new ResizeObserver\(/, '列高只量了一次：摄像头那一行换字之后就过期了');
  assert.match(EXITS, /removeProperty\(/, 'dispose 之后列高还挂在根上');
  const panel = CSS.match(/\.sb-ctl-panel\s*\{[^}]*\}/);
  assert.ok(panel);
  assert.match(panel![0], /max-height:[^;]*var\(--sb-exits-h,\s*0px\)/, '面板的上限没有减掉右下角那一列');
  // 只减列高还不够：上限原来假设面板从 3.4rem 处开始，而目录、设置两节压在上面时它更低。
  // 无头 Chrome 实测（1280×800，porcelain）：面板底 421.5px、那一列顶 413.3px —— 仍然压 8.28px。
  // 所以面板顶由 controls.ts 量出来写到 `--sb-ctl-top`，上限从那里算
  assert.match(panel![0], /max-height:[^;]*var\(--sb-ctl-top/, '面板的上限还在猜面板从哪儿开始');
  assert.doesNotMatch(panel![0], /3\.4rem/, '上限里还留着那个猜出来的 3.4rem');
  assert.match(TS, /'--sb-ctl-top'/, 'controls.ts 没有把面板顶写出去');
});
