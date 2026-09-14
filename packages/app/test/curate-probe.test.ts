/**
 * 部件档案页的评级写回探针只在 dev server 上发（docs/51 收口 · C3）。
 *
 * `/__curate` 是 vite dev 的中间件，生产上不存在。原来每开一次 `/parts`（线上和 `vite preview` 都是），
 * 探针都换回一条 404，控制台一行红字 —— 从工作台点进来的人读到的是「坏了」。
 * 构建产物里 `import.meta.env.DEV` 是常量 false，于是那次请求连同分支一起被摇掉。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = readFileSync(fileURLToPath(new URL('../src/rooms/parts.ts', import.meta.url)), 'utf8');

test('评级写回探针只在 dev 上发，生产构建里不请求 /__curate', () => {
  const start = SRC.indexOf('async function probeCurateWriteback');
  assert.ok(start >= 0, '找不到 probeCurateWriteback');
  const body = SRC.slice(start, SRC.indexOf('\n}\n', start));
  const gate = body.search(/if\s*\(\s*!import\.meta\.env\.DEV\s*\)\s*return false/);
  const fetchAt = body.indexOf("fetch('/__curate");
  assert.ok(gate >= 0, '探针没有按 import.meta.env.DEV 挡住 —— 线上每开一次 /parts 就多一条红色 404');
  assert.ok(gate < fetchAt, 'DEV 的判断在请求之后，挡不住');
});
