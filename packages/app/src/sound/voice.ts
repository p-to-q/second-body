/**
 * 物种音色 = 从 `ThemeDef.axes` 推出来的三个数。
 *
 * 为什么推而不查表：`stage/look.ts` 已经证明过这条路子行得通 —— 那边从
 * palette + axes 推出 23 个条目的灯光，没有一个 if。同一个理由在这里更强：
 * 名册还在长（docs/14），每加一个物种就要有人记得回来补一行音色表，
 * 那一行迟早会漏。推导漏不了。
 *
 * 两条映射，各自有听觉上的理由：
 *  - `lifeLike` 高 → 共振低、Q 低。有机的东西（绒毛、肉）共振宽而钝；
 *    无机的（瓷、金属）共振窄而高 —— 敲一下能听出是哪种。
 *  - `humanLike` 高 → 基频抬高一点，靠近人声区。
 *
 * 纯函数，不碰 AudioContext —— 所以它能在 node 里被测（test/sound-voice.test.ts）。
 */
import { SOUND } from '../../../core/src/tuning.ts';
import type { ThemeDef } from '../../../core/src/types.ts';

export interface Voice {
  /** 身体层共振带通的中心频率（Hz） */
  reson: number;
  /** 共振 Q */
  q: number;
  /** 事件层的基频（Hz） */
  root: number;
}

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5);
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * 拿不到条目（URL 直接 `?theme=` 一个不存在的 id、parts.json 缺席）时落在轴的中点：
 * 一个中性的音色，而不是静音。**没有音色比没有声音好**（P3 的听觉版）。
 */
export function voiceOf(theme: ThemeDef | null | undefined): Voice {
  const life = clamp01(theme?.axes?.lifeLike ?? 0.5);
  const human = clamp01(theme?.axes?.humanLike ?? 0.5);
  const v = SOUND.voice;
  return {
    reson: mix(v.resonLoLife, v.resonHiLife, life),
    q: mix(v.qLoLife, v.qHiLife, life),
    root: mix(v.rootLoHuman, v.rootHiHuman, human),
  };
}
