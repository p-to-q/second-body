/**
 * 帧循环里**没有一件事挂在乐章边界上**（docs/44 §6：四个乐章留名字、删边界）。
 *
 * 档位下限从哪儿来、升档那一下的时机，由 `core/test/theseus-tier.test.ts` 在 node 里逐帧钉住。
 * 这一条只问 `main.ts` 有没有真的用它 —— `main.ts` 会拉起 three / WebGPU / DOM，
 * 在 node 里跑不起来，而要问的本来就是"那一行写在哪儿"（和 `theseus-flag.test.ts` 同一个做法）。
 *
 * `?theseus=off` 是例外：现场的 plan B 必须和这一版之前逐字相同，那条路上乐章边界照旧是事件。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MAIN_SRC = readFileSync(fileURLToPath(new URL('../src/main.ts', import.meta.url)), 'utf8');
const TIER_BLOCK = MAIN_SRC.slice(MAIN_SRC.indexOf('── 分档'), MAIN_SRC.indexOf('director.update(world'));

test('乐章边界：档位下限在忒修斯开着时取排期给的 `step.tier`，不取乐章序号', () => {
  assert.ok(TIER_BLOCK.length > 0, '找不到分档那一段');
  const want = TIER_BLOCK.split('\n').find((l) => /const want = /.test(l)) ?? '';
  assert.match(want, /step\.tier/, `档位下限还是乐章序号：${want.trim()}`);
  // 乐章序号只许出现在 `?theseus=off` 那条 plan B 上
  assert.match(want, /theseus \? step\.tier : arcState\.tier|!theseus \? arcState\.tier : step\.tier/,
    `乐章序号那一半必须被 theseus 开关挡住：${want.trim()}`);
});

test('乐章边界：`movementChanged` 那一下（stage.pulse）只在 ?theseus=off 时发生', () => {
  const lines = TIER_BLOCK.split('\n');
  const at = lines.findIndex((l) => l.includes('arcState.movementChanged'));
  assert.ok(at >= 0, '乐章交接那一支不见了 —— plan B 需要它');
  assert.match(lines[at], /!theseus && arcState\.movementChanged/,
    `乐章交接那一下没有被 theseus 开关挡住：${lines[at].trim()}`);
});
