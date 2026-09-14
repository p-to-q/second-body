/**
 * 一次换页要付的那几笔**看不见的**钱（docs/47 §3）。
 *
 * 两样东西坏了画面上都一模一样，只是每一跳慢几十毫秒：
 *
 *  1. **一条指向 `.html` 的站内链接。** `vercel.json` 开着 `cleanUrls`，线上
 *     `/making.html` 回 308 → `/making`，每点一次多一个往返。目录里的三条曾经都是这样。
 *  2. **每一页都要拿、却每次都要重新验证的静态文件。** 平台缺省是
 *     `max-age=0, must-revalidate`：字体三件、离散接触音九件，每开一页 / 每重载一次舞台
 *     各发一次条件请求（2026-09-14 实测：舞台一次重载 39 个 304）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = fileURLToPath(new URL('../', import.meta.url));
const ROOT = join(APP, '../..');
const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')) as {
  cleanUrls?: boolean; headers: { source: string; headers: { key: string; value: string }[] }[];
};

function cacheFor(path: string): string {
  let value = 'public, max-age=0, must-revalidate';   // Vercel 的缺省
  for (const h of vercel.headers) {
    // 先按 `(.*)` 切开再转义点号 —— 反过来的话 `(.*)` 里那个点会先被转义成 `(\.*)`
    const re = new RegExp(`^${h.source.split('(.*)').map((s) => s.replace(/\./g, '\\.')).join('(.*)')}$`);
    if (!re.test(path)) continue;
    for (const kv of h.headers) if (kv.key.toLowerCase() === 'cache-control') value = kv.value;
  }
  return value;
}
const maxAge = (v: string): number => Number(/max-age=(\d+)/.exec(v)?.[1] ?? 0);

test('每一页都拿的静态文件至少缓存一天；带哈希的永久缓存；索引每次验证', () => {
  for (const p of [
    '/fonts/LXGWWenKai/LXGWWenKai-subset.woff', '/fonts/ZKMSerendipity/ZKMSerendipity-Regular.woff',
    '/sound/enter.webm', '/parts/head.porcelain.a.glb', '/refs/porcelain/_anchor.png',
  ]) {
    assert.ok(maxAge(cacheFor(p)) >= 86400, `${p} 的缓存是「${cacheFor(p)}」—— 每开一页都要重新验证一次`);
  }
  assert.match(cacheFor('/assets/main-abc123.js'), /immutable/, '/assets/ 是带哈希的文件名，应当永久缓存');
  // 这两个是**故意**每次验证的：它们一变，整间展厅的内容就变了（library.ts 用 cache:'no-cache' 取）
  assert.equal(maxAge(cacheFor('/parts/parts.json')), 0);
});

test('站内链接不写 `.html`（cleanUrls 下每一条都是一次 308）', () => {
  assert.equal(vercel.cleanUrls, true, '这条守卫的前提是 cleanUrls 开着');
  const roots = readdirSync(APP).filter((n) => n.endsWith('.html') && n !== 'index.html').map((n) => n.replace(/\.html$/, ''));
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p); else if (e.name.endsWith('.ts')) files.push(p);
    }
  };
  walk(join(APP, 'src'));
  const bad: string[] = [];
  const re = new RegExp(`(?<!===\\s*)['"\`]/(?:${roots.join('|')})\\.html`, 'g');
  for (const f of files) {
    // 注释里提到文件名不是链接
    const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    for (const m of src.matchAll(re)) bad.push(`${f.slice(APP.length)}: ${m[0]}`);
  }
  // 工作台里的仪器页（/dev/*.html）不在这条里：vite dev server 不认 /dev/figure 这种干净地址，
  // 那一跳的 308 是换"本机和线上同一个 URL"的代价，docs/47 记着
  assert.deepEqual(bad, [], `这些链接会先被 308 一次：\n${bad.join('\n')}`);
});
