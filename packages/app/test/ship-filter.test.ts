/**
 * 观众剪影原图和装置本机存档**绝不进 dist**（`build/ship-filter.ts`）。
 *
 * 线上从仓库构建时这两样本来就是空的，所以这条测试防的不是线上，是**装置那台机器上
 * 跑的一次 `npm run build`** —— 那一次会把 `assets/parts/lineage/_raw/` 里的剪影原样复制进网站。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { shouldShip } from '../build/ship-filter.ts';

const A = '/repo/assets';

test('观众剪影原图不进 dist', () => {
  assert.equal(shouldShip(`${A}/parts/lineage/_raw`), false, '整个 _raw 目录都不许复制');
  assert.equal(shouldShip(`${A}/parts/lineage/_raw/silhouette-0001.png`), false);
  assert.equal(shouldShip('C:\\repo\\assets\\parts\\lineage\\_raw\\s.png'), false, 'Windows 路径也得挡住');
});

test('装置本机的存档文件不进 dist', () => {
  assert.equal(shouldShip(`${A}/parts/lineage/visits.jsonl`), false);
});

test('运行时要读的东西照常复制', () => {
  for (const ok of [`${A}/parts/parts.json`, `${A}/parts/head.porcelain.a.glb`, `${A}/parts/lineage/spine.x.glb`, `${A}/fonts/a.woff2`]) {
    assert.equal(shouldShip(ok), true, `${ok} 被挡掉了 —— 网站会缺东西`);
  }
});

test('vite.config.ts 真的在用这道闸，而不是自己再写一份', () => {
  const cfg = readFileSync(fileURLToPath(new URL('../vite.config.ts', import.meta.url)), 'utf8');
  assert.match(cfg, /filter:\s*shouldShip/, 'shipAssets 没有用 shouldShip —— 这道闸形同虚设');
});
