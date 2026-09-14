/**
 * 姿态 worker 里的 MediaPipe 陷阱（docs/48 §3，2026-09-14 无头 Chrome 当场撞到）。
 *
 * MediaPipe 每建一个任务就把 `self.ModuleFactory` 清掉（`self.ModuleFactory = self.Module = void 0`），
 * 下一次 `createFromOptions` 再加载一次胶水层把它装回来。主线程上那是一个新的 `<script>`，会重新执行；
 * **module worker 里是 `import()`，模块被缓存、不再执行**，于是第二个任务一律
 * `ModuleFactory not set` —— 抠图起不来，GPU 失败之后回落 CPU 那一条也一样起不来。
 *
 * 这里没法在 node 里跑 MediaPipe，所以守的是写法：worker 里每一处 `createFromOptions(`
 * 之前，同一段代码里必须先把工厂装回去（`await restoreFactory(`）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(fileURLToPath(new URL('../src/capture/pose-worker.ts', import.meta.url)), 'utf8');

test('pose worker: 每一次 createFromOptions 之前都先把 ModuleFactory 装回去', () => {
  const lines = src.split('\n');
  const creates = lines.map((l, i) => [l, i] as const).filter(([l]) => /createFromOptions\(/.test(l) && !/^\s*(\/\/|\*)/.test(l));
  assert.ok(creates.length >= 3, `应当有 GPU / CPU / 抠图三处创建，实际 ${creates.length}`);
  for (const [, i] of creates) {
    const before = lines.slice(Math.max(0, i - 4), i + 1).join('\n');
    assert.match(before, /await restoreFactory\(/, `第 ${i + 1} 行的 createFromOptions 前面没有 restoreFactory：\n${before}`);
  }
});
