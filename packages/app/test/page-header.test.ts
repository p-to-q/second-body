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

/**
 * 侧室（docs/23 §S9）。它们**不在目录里**，所以进来的人屏幕上一条出去的路都没有 ——
 * 横带因此不是可选的，它是这几页唯一的出口。
 * 断言的形状和上面四页一样：**不许自己建**。只不过它们经手的是
 * `rooms/room.ts` 的 `mountRoom()`，而那一个才去调 `heroMeta()`。
 */
const ROOMS = ['rooms/parts.ts', 'rooms/roster.ts', 'rooms/marks.ts'];

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

test('四个侧室的横带都来自 mountRoom()，而只有 mountRoom 去调 heroMeta()', () => {
  for (const room of ROOMS) {
    const src = readFileSync(resolve(SRC, room), 'utf8');
    assert.match(
      src,
      /mountRoom\(/,
      `${room} 没有调用 mountRoom()。侧室不在目录里（docs/23 §S9），` +
        '横带是它唯一的出口 —— 没有它，从 /about 正文里点进来的人只剩后退键',
    );
    assert.doesNotMatch(
      src,
      /heroMeta\(|'ed-hero__meta'|"ed-hero__meta"|'ed-hero__back'|"ed-hero__back"/,
      `${room} 在自己建横带。建它的地方只能是 rooms/room.ts —— ` +
        '四个文档页正是因为各建一份而跑偏过三次',
    );
  }

  const src = readFileSync(resolve(SRC, 'rooms/room.ts'), 'utf8');
  assert.match(
    src,
    /heroMeta\('\/about'\)/,
    'rooms/room.ts 的「回到作品」必须指向 /about：门开在那一页的正文里，' +
      '把人送回首页等于把他送到一个他没去过的地方',
  );
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
