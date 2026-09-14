/**
 * 页脚那枚标记（`ui/footer-mark.{ts,css,svg}`）—— 作品负责人 2026-09-14：
 * 「统一加在页面底部，有点像 AI 公司或产品公司在最下面放的一个 logo」。
 *
 * 它是负责人在海报上画的、SEE-ME SEE-U 的扩展示意图（self ↓ form ↓ other ↓ agency）。
 * 这几条钉住的是**它在哪几页出现、它怎么跟着页面的墨走、它不带一个写死的颜色**。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel: string): string => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/** 负责人点名的五页 + 同一族的三个侧室（它们共用 room.ts） */
const PAGES: Array<[string, string]> = [
  ['作品陈述 /about', '../src/about/about.ts'],
  ['谱系 /lineage', '../src/lineage/lineage.ts'],
  ['做的过程 /making', '../src/making/making.ts'],
  ['共生护照 /passport', '../src/passport/passport.ts'],
  ['工作台 /dev/', '../dev/index.ts'],
  ['侧室 /parts /roster /marks', '../src/rooms/room.ts'],
];

test('页脚标记挂在负责人点名的每一页（以及同族的侧室）', () => {
  const missing = PAGES.filter(([, file]) => !/mountFooterMark\(/.test(read(file))).map(([name]) => name);
  assert.deepEqual(missing, [], `这些页没有挂页脚标记：${missing.join('、')}`);
});

test('SVG 的 viewBox 贴着墨裁过，不带写死的像素尺寸', () => {
  const svg = read('../src/ui/footer-mark.svg');
  const head = svg.slice(0, svg.indexOf('>') + 1);
  const vb = head.match(/viewBox="([\d.\s-]+)"/)?.[1].trim().split(/\s+/).map(Number);
  assert.ok(vb && vb.length === 4, '没有 viewBox');
  // 实测墨的范围：x 2.05–632.73，y 3.25–98.27（scratch 里的 svg-bbox 量出来的）。四边各留约 1.5
  const [x, y, w, h] = vb!;
  const pads = [2.05 - x, 3.25 - y, x + w - 632.73, y + h - 98.27];
  for (const p of pads) assert.ok(p > 1 && p < 2.5, `四边留白不匀：${pads.map((n) => n.toFixed(2)).join(' / ')}`);
  assert.doesNotMatch(head, /\swidth="|\sheight="/, '根上还写着像素宽高 —— 尺寸应该由 CSS 定');
});

test('颜色跟着页面的墨走：蒙版 + 令牌，没有写死的颜色；不支持蒙版的浏览器不画一块实心方块', () => {
  const css = read('../src/ui/footer-mark.css');
  assert.match(css, /mask-image/, '不是用蒙版着色 —— 黑色的 SVG 在深底上会看不见');
  assert.match(css, /-webkit-mask-image/, 'Safari 还要带前缀');
  assert.match(css, /@supports/, '没有 @supports：不支持蒙版的浏览器会画出一整块实心矩形');
  assert.match(css, /var\(--sb-ink[-a-z]*\)/, '颜色没有取页面的墨令牌');
  assert.doesNotMatch(css, /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})(?![0-9a-fA-F])/, 'footer-mark.css 里写死了一个颜色');
  assert.match(css, /aspect-ratio/, '没有按 viewBox 的宽高比占位 —— 加载前后会跳');
});

test('标记对读屏说得出它是什么；重复挂载只挂一次', () => {
  const ts = read('../src/ui/footer-mark.ts');
  assert.match(ts, /role['"]?,\s*['"]img['"]|role="img"|setAttribute\('role', 'img'\)/, '没有 role=img');
  assert.match(ts, /aria-label/, '没有 aria-label');
  assert.match(ts, /querySelector(?:<[^>]+>)?\(['"`](?::scope\s*>\s*)?\.sb-footmark/, '没有防重复挂载');
});
