/**
 * 工作台顶上那一条出口（`dev/devnav.css`）的中英间距 —— 作品负责人 2026-09-14：
 * 「同一组的有一些页右上角的几个按钮，中文和英文离得太近了，旁边的间距也不好看」。
 *
 * 实测（无头 Chrome，1440 宽）：`返回工作台BACK TO THE WORKBENCH` 中英之间 **0px**，
 * 同一站上右上角「目录 CONTENTS」是 7.7px（0.35em × 22px）。原因：链接上的 `gap: 0.5em` 依赖它是
 * inline-flex，而 setBi 同时给它挂了 `.sb-bi`，type.css 里那条同权重的规则后加载、把它改回了块级 ——
 * gap 在非 flex 盒上不生效。所以间距改由英文自己的 margin-left 承担：不依赖父级是什么 display。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CSS = readFileSync(fileURLToPath(new URL('../dev/devnav.css', import.meta.url)), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

/** 取某个选择器（精确匹配）的最后一个声明块 */
function lastBlock(sel: string): string {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const all = [...CSS.matchAll(new RegExp(`(?:^|})\\s*${esc}\\s*\\{([^}]*)\\}`, 'g'))];
  return all.length ? all[all.length - 1][1] : '';
}

test('工作台出口：英文和中文之间有自己的间距，不靠父级的 flex gap', () => {
  const en = lastBlock('.sb-devnav .sb-en');
  const m = en.match(/margin-left:\s*([\d.]+)em/);
  assert.ok(m, '.sb-devnav .sb-en 没有 margin-left —— 中英会贴在一起（实测 0px）');
  assert.ok(Number(m![1]) >= 0.45 && Number(m![1]) <= 0.8, `中英间距 ${m![1]}em 不在 0.45–0.8em 之间`);
});

test('工作台出口：两个出口之间拉得开，至少是中英间距的三倍', () => {
  const bar = lastBlock('.sb-devnav');
  const gap = Number(bar.match(/gap:\s*([\d.]+)em/)?.[1]);
  const en = Number(lastBlock('.sb-devnav .sb-en').match(/margin-left:\s*([\d.]+)em/)?.[1]);
  assert.ok(Number.isFinite(gap), '.sb-devnav 没有以 em 写的 gap');
  // 英文是 micro 字号，间距按各自字号换算成同一单位再比：bar 的 em 是 small（13px），en 的 em 是 micro（11px）
  assert.ok(gap * 13 >= 3 * en * 11, `出口之间 ${gap}em 不到中英间距的三倍 —— 读起来分不清哪两个词是一组`);
});
