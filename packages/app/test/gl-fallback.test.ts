/**
 * `?gl=off` —— 无 WebGL 那条路的开关（docs/36 D2）。
 *
 * `choose/choose.ts` 的文件头一直写着「`?gl=off` 就是用来跑它的」，
 * 而 `readFlags()` 里**没有 `gl` 这个字段**、`main.ts` 也从来不传 `forceFallback`：
 * 唯一读 `?gl=` 的是 `/dev/choose.html`。于是那句注释说的是意图，不是现实 ——
 * 一个只在 dev 页上生效的开关，被当成了关于**正式程序**的结论。
 *
 * 这里两头都钉：flags 认不认这个参数，以及 `main.ts` 有没有把它接到选择页上。
 * 第二条是源码断言 —— 它问的正是那次审计用 grep 问的那个问题，
 * 因为 `main.ts` 是一个吃 WebGPU 的长 async，没有别的办法在 node 里问它。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isGlFlag, readFlags } from '../src/shell/kiosk.ts';

test('flags: gl 默认开，只有 ?gl=off 关得掉', () => {
  assert.equal(readFlags('').gl, true);
  assert.equal(readFlags('?gl=on').gl, true);
  assert.equal(readFlags('?gl=off').gl, false);
});

test('flags: ?gl= 认不出来的值按没写过处理 —— 规矩同 ?scene= / ?cam=', () => {
  // 手滑写 ?gl=0 不该被猜成 off：那样"我写了参数"和"参数没生效"就分不开了。
  // 而它的默认方向必须是**开**：猜错方向 = 现场白白掉进降级列表。
  assert.equal(readFlags('?gl=0').gl, true);
  assert.equal(readFlags('?gl=false').gl, true);
  assert.equal(readFlags('?gl=').gl, true);
  assert.ok(isGlFlag('on'));
  assert.ok(isGlFlag('off'));
  assert.ok(!isGlFlag('0'));
  assert.ok(!isGlFlag('OFF'));
  assert.ok(!isGlFlag(null));
});

test('main.ts 把 ?gl= 接到了选择页上 —— 不然它只是一个 dev 页开关', () => {
  const src = readFileSync(resolve(import.meta.dirname, '../src/main.ts'), 'utf8');
  assert.match(src, /forceFallback:\s*!flags\.gl/,
    'chooseTheme({ … }) 没有收到 forceFallback，`?gl=off` 在正式程序上什么都不做（docs/36 D2）');
});
