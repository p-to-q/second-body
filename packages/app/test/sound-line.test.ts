/**
 * 身体层的音色跟着**那条线**滑，不跟着乐章的名字跳（docs/44 §6、docs/40 顶上那段）。
 *
 * 此前 `graph.ts` 按 `actId` 挑音色：弧线在 40 秒把名字从 follow 换成 echo，
 * 回声那一路的增益当帧从 0 跳到 0.5 —— 画面上那条线没有断，耳朵里断了。
 * 那一跳就是一个观众能指认的"第二乐章开始了"，而 docs/44 §6 裁定的正是没有那一刻。
 *
 * 喂给音色的信号**照着 `main.ts` 的写法**造：名字来自弧线（导演没被按住时就是它），
 * 线来自 `lineFor()`（`acts/act.ts`，和身体吃的是同一个点）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createArc } from '../../core/src/arc.ts';
import { lineAt, pointOf } from '../../core/src/line.ts';
import { SOUND } from '../../core/src/tuning.ts';
import { timbreOf, type BodyTimbre } from '../src/sound/timbre.ts';
import type { SoundSignal } from '../src/sound/signal.ts';

const KEYS: (keyof BodyTimbre)[] = ['tilt', 'q', 'gain', 'tau', 'detune', 'echo'];
/** 每个分量在自己那一侧离基线最远是多少 —— 步长按它归一，六个量才在一把尺子上 */
const RANGE: BodyTimbre = {
  tilt: 1 - SOUND.acts.resist.tiltMul, q: SOUND.acts.facing.qMul - 1,
  gain: 1 - Math.min(SOUND.acts.resist.gainMul, SOUND.acts.facing.gainMul),
  tau: SOUND.acts.resist.tauMul - 1, detune: SOUND.acts.facing.detune, echo: SOUND.acts.echo.mix,
};

/** `main.ts` 递给 `sound.update` 的那一份（只取音色用得到的字段） */
const signalAt = (actId: string, overall: number, pinned = false) =>
  ({ actId, line: lineAt(pinned ? pointOf(['follow', 'echo', 'resist', 'facing'].indexOf(actId) as 0) : overall) }) as
    Pick<SoundSignal, 'actId'> & { line: ReturnType<typeof lineAt> };

test('音色：弧线走一整场，没有一帧跳 —— 乐章换名字的那一帧耳朵里也没有台阶', () => {
  const arc = createArc();
  const DT = 1 / 60;
  let prev: BodyTimbre | null = null;
  let worst = { step: 0, at: 0, key: '' };
  for (let i = 0; i < Math.round(arc.total / DT); i++) {
    const a = arc.update(true, DT);
    const t = timbreOf(signalAt(a.actId, a.overall));
    if (prev) {
      for (const k of KEYS) {
        const step = Math.abs(t[k] - prev[k]) / Math.max(1e-9, Math.abs(RANGE[k]));
        if (step > worst.step) worst = { step, at: a.elapsed, key: k };
      }
    }
    prev = t;
  }
  // 最陡的一段是两个地名之间的 smoothstep：II→III 47.5 秒走完整个范围，中点斜率 1.5/47.5 ≈ 3.2%/秒，
  // 一帧 0.05%。给 0.5% 一帧 = 十倍余量；一次跳变是 100%。
  assert.ok(worst.step < 0.005,
    `音色在 ${worst.at.toFixed(2)}s 一帧跳了 ${(worst.step * 100).toFixed(1)}%（${worst.key}）—— ` +
    `弧线边界是 ${arc.bounds.slice(0, 3).map((b) => b.toFixed(1)).join(' / ')}s`);
});

test('音色：四个地名上仍然是它们自己 —— 连续化不许把「回声就是回声」磨平', () => {
  const at = (actId: string, over: Partial<BodyTimbre>): void => {
    const want: BodyTimbre = { tilt: 1, q: 1, gain: 1, tau: 1, detune: 0, echo: 0, ...over };
    const got = timbreOf(signalAt(actId, 0, true));
    for (const k of KEYS) assert.ok(Math.abs(got[k] - want[k]) < 1e-9, `${actId}.${k}: ${got[k]} ≠ ${want[k]}`);
  };
  const a = SOUND.acts;
  at('follow', {});
  at('echo', { echo: a.echo.mix });
  at('resist', { tilt: a.resist.tiltMul, gain: a.resist.gainMul, tau: a.resist.tauMul });
  at('facing', { q: a.facing.qMul, gain: a.facing.gainMul, detune: a.facing.detune });
});

test('音色：`untether`（把身体还回去）没有线，走基线 —— 和改之前一样', () => {
  const t = timbreOf({ actId: 'untether', line: null } as unknown as Pick<SoundSignal, 'actId'>);
  assert.deepEqual(t, { tilt: 1, q: 1, gain: 1, tau: 1, detune: 0, echo: 0 });
});

test('音色：main.ts 真的把线递给了声音 —— 一个没人喂的字段等于没有这个功能', () => {
  const src = readFileSync(fileURLToPath(new URL('../src/main.ts', import.meta.url)), 'utf8');
  const call = src.slice(src.indexOf('sound.update({'), src.indexOf('}, dt);', src.indexOf('sound.update({')));
  assert.match(call, /line:\s*lineFor\(/, `sound.update 那一段没有递线：\n${call}`);
});
