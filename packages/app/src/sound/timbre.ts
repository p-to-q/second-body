/**
 * 身体层的**音色修正**：共振往哪儿压、Q 收多窄、跟得多慢、失谐多少、回声多少。
 * 纯函数，不碰 Web Audio —— 于是它能在 node 里被逐帧扫一遍（`test/sound-line.test.ts`）。
 *
 * ── 跟着线走，不跟着名字走（docs/44 §6）──────────────────────────────────────
 * 此前这里按 `actId` 挑一套：弧线在 40 秒把名字从 follow 换成 echo，回声那一路当帧从 0 跳到 0.5。
 * 画面上那条线没有断，耳朵里断了 —— 观众能指认的"第二乐章开始了"就从画面搬进了声音。
 *
 * 现在音色吃的是身体吃的**同一组三个数**（`core/src/line.ts` 的 `LineParams`）：
 *   延迟 → 回声有多少，重量 → 有多闷多慢，朝向 → 收多窄、失谐多少。
 * 每一个修正都在基线 1 和 `SOUND.acts` 里那个端点之间按它那个数插值，
 * 所以在四个地名上音色**逐位等于**原来那四套（`test/sound-line.test.ts` 第 2 条），
 * 地名之间跟着 smoothstep 滑过去。`SOUND.acts` 那张表因此一个数都不用改。
 *
 * 没有线（`line: null`）= 基线：`untether`（把身体还回去）不在这条线上，它原来也没有条目。
 */
import { LINE, SOUND } from '../../../core/src/tuning.ts';
import type { SoundSignal } from './signal.ts';

export interface BodyTimbre {
  tilt: number; q: number; gain: number; tau: number; detune: number; echo: number;
}

const clamp01 = (x: number): number => (Number.isFinite(x) ? (x < 0 ? 0 : x > 1 ? 1 : x) : 0);
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
/** 延迟那一路按这条线上最长的延迟归一：`LINE.delay` 的峰就是 echo 的地名 */
const MAX_DELAY = Math.max(0, ...LINE.delay);

/** 这条线此刻对身体层音色的修正 */
export function timbreOf(s: Pick<SoundSignal, 'line'>): BodyTimbre {
  const l = s.line;
  if (!l) return { tilt: 1, q: 1, gain: 1, tau: 1, detune: 0, echo: 0 };
  const a = SOUND.acts;
  const echo = MAX_DELAY > 0 ? clamp01(l.delay / MAX_DELAY) : 0;
  const weight = clamp01(l.weight);
  const facing = clamp01(l.facing);
  return {
    tilt: mix(1, a.resist.tiltMul, weight),
    q: mix(1, a.facing.qMul, facing),
    gain: mix(1, a.resist.gainMul, weight) * mix(1, a.facing.gainMul, facing),
    tau: mix(1, a.resist.tauMul, weight),
    detune: a.facing.detune * facing,
    echo: a.echo.mix * echo,
  };
}
