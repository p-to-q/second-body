/**
 * 工作台目录 `/dev/` 每一行的悬停反馈（作品负责人 2026-09-14：「hover 到标题上颜色稍微变一下，才确定在 hover 上」）。
 *
 * 原来一行是一个整行的 <a>，样式全写在内联 style 里 —— 内联样式写不了 :hover，于是鼠标移上去什么都不变，
 * 只有全局 `a:hover` 那条底线换色，而这一行的底线又被内联 border-bottom 盖住了。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel: string): string => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

test('/dev 目录：右上出口和页头同一个框（顶齐字标、右端齐横线），且权重压得过 devnav.css；部件读片列在侧室', () => {
  const css = read('../dev/index.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const block = css.match(/html \.sb-devnav\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(block, /top:\s*var\(--sb-safe\)/, '出口的顶没有和左边字标一样在一个安全区');
  assert.match(block, /right:\s*var\(--sb-safe\)/, '出口的右端没有和页头横线一样在一个安全区');
  const ts = read('../dev/index.ts');
  const rooms = ts.slice(ts.indexOf("title: '侧室'"), ts.indexOf("title: '工作台'"));
  assert.match(rooms, /\/dev\/sheet\.html/, '部件读片没有列在侧室那一组');
});

test('/dev 目录的每一行有类名，悬停 / 键盘焦点时名字和那句话提亮，不只靠颜色也不靠位移', () => {
  const ts = read('../dev/index.ts');
  assert.match(ts, /import '\.\/index\.css'/, 'dev/index.ts 没有引它自己的样式');
  assert.match(ts, /className = 'sb-dev-row'/, '行没有类名 —— 内联样式写不了 :hover');
  const css = read('../dev/index.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /\.sb-dev-row:hover[^{]*,[^{]*\.sb-dev-row:focus-visible[^{]*\{/, '悬停和键盘焦点不是同一个记号');
  assert.match(css, /\.sb-dev-row__name[^}]*color:\s*var\(--sb-ink-strong\)/s, '悬停时名字没有提到最强墨');
  assert.match(css, /border-bottom-color:\s*var\(--sb-ink/, '悬停时行底线没有变 —— 只靠字色，色弱的人分不出');
  assert.doesNotMatch(css, /transform|translate/, '悬停不许位移（整页是档案，不是按钮墙）');
  assert.doesNotMatch(css, /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})(?![0-9a-fA-F])/, 'dev/index.css 里写死了颜色');
});
