/**
 * 每一个发布的 HTML 都声明图标（docs/53 Q17）。
 *
 * 没有 `<link rel="icon">` 的页面，浏览器会自己去要 `/favicon.ico` —— 线上和 `vite preview` 都回 404，
 * 每开一页控制台就多一行红字（页面审计里每一页都量到过）。图标内联成 data URI：不多一个请求、不多一个要缓存的文件。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const pages = [
  ...readdirSync(root).filter((f) => f.endsWith('.html')).map((f) => `${root}/${f}`),
  ...readdirSync(`${root}/dev`).filter((f) => f.endsWith('.html')).map((f) => `${root}/dev/${f}`),
];

test('每一个 HTML 都声明图标，浏览器不再去要 /favicon.ico', () => {
  assert.ok(pages.length > 10, '没找到页面 —— 路径变了？');
  const missing = pages.filter((p) => !/<link[^>]+rel="icon"[^>]*>/.test(readFileSync(p, 'utf8')));
  assert.deepEqual(missing.map((p) => p.slice(root.length)), [], '这些页面没有 <link rel="icon">');
});

test('图标是内联的 SVG，不带写死的外部地址', () => {
  for (const p of pages) {
    const tag = readFileSync(p, 'utf8').match(/<link[^>]+rel="icon"[^>]*>/)?.[0] ?? '';
    assert.match(tag, /href="data:image\/svg\+xml,/, `${p.slice(root.length)} 的图标不是内联 SVG`);
  }
});
