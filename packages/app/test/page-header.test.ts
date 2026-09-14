/**
 * 四个文档页顶上那条横带只能有**一个**来源：`ui/hero.ts` 的 `heroMeta()`。
 *
 * ## 为什么这条测试盯的是"谁建的"，不是"建成什么样"
 *
 * 这条横带跑偏过三次（中间多一份作品名、中间多一个卷号 `VII`、
 * 「回到作品」多一个惰性类），三次都被当成排版 bug 修掉，于是第四次又来。
 * 查到根上是：**四个页面各自定义了私有的 `el()`，签名还互不兼容**
 * （`making.ts` 第三个参数是父节点，`about.ts` 是子节点）。
 * 四份手写结构各自演化，没有任何东西可以不漂。
 *
 * 所以断言不写成"横带里应该有两个孩子" —— 那样的话，只要有人再手写一份
 * 长得对的横带，测试就会放行，而下一次改版它又会各漂各的。
 * **断言写成"这一页不许自己建这条横带"**：结构只有一份，它就没有地方可漂。
 *
 * 字号、颜色、对齐归 `editorial.css` 管，不在这里。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const PAGES = ['about/about.ts', 'making/making.ts', 'passport/passport.ts', 'lineage/lineage.ts'];

test('四个文档页的页头横带都来自 heroMeta()，没有一页自己建', () => {
  for (const page of PAGES) {
    const src = readFileSync(resolve(SRC, page), 'utf8');
    assert.match(
      src,
      /heroMeta\(/,
      `${page} 没有调用 heroMeta()。这条横带只有一份（ui/hero.ts），` +
        '它已经因为四份手写结构各自演化而跑偏过三次',
    );
    assert.doesNotMatch(
      src,
      /'ed-hero__meta'|"ed-hero__meta"/,
      `${page} 在自己建 ed-hero__meta。建它的地方只能是 ui/hero.ts —— ` +
        '中间那一格是空的（docs/23 §S9），而一份手写的横带迟早会往里塞东西',
    );
    assert.doesNotMatch(
      src,
      /'ed-hero__back'|"ed-hero__back"/,
      `${page} 在自己建「回到作品」。它跟着横带一起住在 ui/hero.ts`,
    );
  }
});

test('heroMeta() 里只有「回到作品」和字标，中间什么都没有', () => {
  const src = readFileSync(resolve(SRC, 'ui/hero.ts'), 'utf8');
  const appended = src.match(/meta\.append\(([^;]*?)\);/s)?.[1] ?? '';
  const kids = appended.split(',').map((t) => t.trim()).filter(Boolean);
  assert.deepEqual(
    kids.map((k) => (k.startsWith('back') ? 'back' : k.startsWith('markNode') ? 'mark' : k)),
    ['back', 'mark'],
    `横带里是 ${JSON.stringify(kids)}。卷号、作品名、副标题都不进这条带子：` +
      '两端对齐的横带靠两端立住，往中间塞东西就把它变成了三栏工具条',
  );
});
