/**
 * 按下「摄像头」之后的那几秒（docs/48 §2：基线冷缓存 32.6 秒，暖缓存 1.2 秒）。
 *
 * 此前这一段里右下角那一行只是变灰（`disabled`），字还写着「关着」——
 * 观众读到的是"没反应"，于是再按一次，或者走开。这一组守的是：
 *  1. 那一行在启动期间说「正在打开」，中英都有；
 *  2. 它是**一个状态词**，不是一段动画 —— 字就是最终的状态，没有一个藏在过渡后面的静止态；
 *  3. 摄像头中途断了（拔线、被别的程序占走），有一句话告诉观众，而不是身体悄悄换成录像。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { COPY } from '../src/ui/i18n.ts';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const C = COPY.exits as Record<string, { zh: string; en: string } | undefined>;

test('摄像头启动中: 那一行有「正在打开」这一个状态词，中英都有', () => {
  const s = C.cameraStarting;
  assert.ok(s?.zh && s.en, 'COPY.exits.cameraStarting 缺');
  assert.notEqual(s!.zh, C.cameraOff?.zh, '不能和「关着」是同一句');
});

test('摄像头启动中: exits 向 host 问"是不是在启动"，并据此写状态词', () => {
  const src = read('../src/ui/exits.ts');
  assert.match(src, /cameraStarting\?\(\)/, 'ExitsHost 要有可选的 cameraStarting()');
  assert.match(src, /C\.cameraStarting/, '启动中要写 cameraStarting 那一句');
});

test('摄像头启动中: 状态是字，不是动画 —— exits.css 不给启动态挂 animation/transition', () => {
  const css = read('../src/ui/exits.css');
  const rules = css.match(/[^{}]*is-starting[^{}]*\{[^}]*\}/g) ?? [];
  for (const r of rules) assert.doesNotMatch(r, /animation|transition/, `启动态不许藏在动画后面：${r.trim()}`);
});

test('摄像头断了: 有一句话，中英都有', () => {
  const s = C.cameraLost;
  assert.ok(s?.zh && s.en, 'COPY.exits.cameraLost 缺');
});
