/**
 * 舞台渲染器的默认像素比上限（docs/48 §6，2026-09-14 维护者裁定）。
 *
 * 实测：Retina（DPR 3，原上限 2）站着不动时 p95 帧已是 62 ms；调速器要憋约 10 秒才降到像素比 1。
 * 这件作品的画面自带颗粒、辉光和描边，1.5 与 2 在一臂之外看不出差别，而像素数少 44%。
 * 所以上限只有一个数、住在 tuning.ts，渲染器开机和调速器恢复时读的是**同一个**。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GOVERNOR } from '../../core/src/tuning.ts';

const MAIN = readFileSync(fileURLToPath(new URL('../src/main.ts', import.meta.url)), 'utf8');

test('舞台像素比上限只有一个来源，而且是 1.5', () => {
  assert.equal((GOVERNOR as Record<string, unknown>).dprMax, 1.5, 'GOVERNOR.dprMax 不是 1.5');
  assert.doesNotMatch(MAIN, /Math\.min\(devicePixelRatio,\s*2\)/, 'main.ts 里还写死着像素比 2');
  const uses = MAIN.match(/GOVERNOR\.dprMax/g) ?? [];
  assert.ok(uses.length >= 2, '渲染器开机和调速器恢复没有都读 GOVERNOR.dprMax');
  assert.ok(GOVERNOR.dprShed <= 1.5, '降级那一级的像素比不低于默认上限，放下它等于没放');
});
