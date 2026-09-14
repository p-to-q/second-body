/**
 * 身体层的**音色修正**：共振往哪儿压、Q 收多窄、跟得多慢、失谐多少、回声多少。
 * 纯函数，不碰 Web Audio —— 于是它能在 node 里被逐帧扫一遍（`test/sound-line.test.ts`）。
 *
 * `follow` 是基线，所以它没有条目（tuning 里也没有）。
 */
import { SOUND } from '../../../core/src/tuning.ts';
import type { SoundSignal } from './signal.ts';

export interface BodyTimbre {
  tilt: number; q: number; gain: number; tau: number; detune: number; echo: number;
}

/** 当前玩法对身体层音色的修正 */
export function timbreOf(s: Pick<SoundSignal, 'actId'>): BodyTimbre {
  const a = SOUND.acts;
  const actId = s.actId;
  if (actId === 'resist') {
    return { tilt: a.resist.tiltMul, q: 1, gain: a.resist.gainMul, tau: a.resist.tauMul, detune: 0, echo: 0 };
  }
  if (actId === 'facing') {
    return { tilt: 1, q: a.facing.qMul, gain: a.facing.gainMul, tau: 1, detune: a.facing.detune, echo: 0 };
  }
  if (actId === 'echo') {
    return { tilt: 1, q: 1, gain: 1, tau: 1, detune: 0, echo: a.echo.mix };
  }
  return { tilt: 1, q: 1, gain: 1, tau: 1, detune: 0, echo: 0 };
}
