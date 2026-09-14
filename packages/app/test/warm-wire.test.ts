/**
 * 调速器拨「后期」那一下只是切换（docs/48 §10）。`main.ts` / `stage.ts` 吃 WebGPU、测不到行为，
 * 这里核对接线 —— 和 `governor-wire.test.ts` 同一个写法。
 *
 * 实测（B-gov，强制 L4）：关后期那一帧 273ms、之后又一次 367ms。两处来路各守一条：
 *  1. 直出管线开机以来没用过 → 空闲里 `compileAsync` 先编好（`warm-plan.ts` 决定什么时候）；
 *  2. 关后期 = `post.dispose()`，拿回来时整条链重建 → 关后期只是不走它，链留着。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const STAGE = read('../src/stage/stage.ts');
const MAIN = read('../src/main.ts');

test('拨后期: 舞台关后期不拆链（拿回来不重建）', () => {
  const body = /setPost\(on\)\s*\{([\s\S]*?)\n\s{4}\},/.exec(STAGE)?.[1] ?? '';
  assert.ok(body, 'stage.ts 里找不到 setPost');
  assert.doesNotMatch(body, /dispose\(/, 'setPost(false) 还在 dispose 后期链');
});

test('拨后期: 舞台能在空闲里把直出那条路编一遍（compileAsync，不是 render）', () => {
  const body = /warmDirect\(r\)\s*\{([\s\S]*?)\n\s{4}\},/.exec(STAGE)?.[1] ?? '';
  assert.ok(body, 'stage.ts 里没有 warmDirect');
  assert.match(body, /compileAsync\(/, 'warmDirect 没有用 compileAsync');
  assert.match(STAGE, /warmDirect\(renderer: THREE\.Renderer\): Promise<boolean>/, 'Stage 接口上没有 warmDirect');
});

test('拨后期: 帧循环按 warm-plan 在空闲里调 warmDirect，而且失败不抛进帧循环', () => {
  assert.match(MAIN, /createWarmPlan\(\)/, 'main.ts 没有建 warm-plan');
  assert.match(MAIN, /warmPlan\.next\(/, 'main.ts 没有问 warm-plan');
  assert.match(MAIN, /stage\.warmDirect\(renderer\)[\s\S]{0,200}\.then\(/, 'warmDirect 的结果没有交回 warm-plan');
});
