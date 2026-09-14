/**
 * 回放上的"第二、第三个人" —— **只给演示和工作台用**（docs/50 §7 回放那一条）。纯函数。
 *
 * `assets/demo/` 的录制都是一个人，而且没有 `screen`（docs/49 §5.7 第 4 条）。多人跟踪只读 `screen`，
 * 于是回放上既演示不了多人、也取不到多人的帧时间证据。这里从**同一段录制**合成：
 *
 *  - 每个人错开几秒取帧（不是同一个动作的复印件）；
 *  - 奇数位的人左右镜像（x 取负，并交换左右成对的点，否则左手会长在右边）；
 *  - `screen` 从 `world` 按一个固定的"站在画面某处、有多大"折出来，每个人一个位置和大小。
 *
 * **合成的，不是录制**：这些人从来没有站在任何摄像头前面。`?people=` 在 `?demo=1` 上才走这里，
 * 取证页面上写明是合成的，不进 `assets/demo/`（`SOURCES.md` 的规矩）。
 */
import type { Landmark, RawPose } from '../../../core/src/types.ts';

/** 左右成对的点（docs/04 §2 的索引）。镜像时交换 */
const PAIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [17, 18], [19, 20], [21, 22],
  [23, 24], [25, 26], [27, 28], [29, 30], [31, 32],
];

/** 合成的人站在哪、多大：`cx` 胯中点横坐标，`s` 画面高度单位 / 米（0.5 ≈ 全身正好进画） */
export interface SynthSlot { cx: number; s: number; hy: number; mirror: boolean; lagFrames: number }

/** 三个位置：第 0 个在中间（主录制），另外两个左右、一个小一点（离得远 / 小孩） */
export const SYNTH_SLOTS: readonly SynthSlot[] = [
  { cx: 0.5, s: 0.42, hy: 0.55, mirror: false, lagFrames: 0 },
  { cx: 0.22, s: 0.36, hy: 0.52, mirror: true, lagFrames: 97 },
  { cx: 0.78, s: 0.30, hy: 0.5, mirror: false, lagFrames: 211 },
];

function mirrored(lms: readonly Landmark[]): Landmark[] {
  const out = lms.map((l) => ({ ...l, x: -l.x }));
  for (const [a, b] of PAIRS) {
    if (a < out.length && b < out.length) { const t = out[a]; out[a] = out[b]; out[b] = t; }
  }
  return out;
}

/**
 * 把一份（可能没有 `screen` 的）录制帧摆到画面里的某个位置。
 * MediaPipe 的 world 以胯为原点、y 向下、x 与画面同向，所以 `screen = 胯位置 + world × s`（x 再除以宽高比）。
 */
export function placeInFrame(f: RawPose, slot: SynthSlot, t: number, aspect = 16 / 9): RawPose {
  const world = slot.mirror ? mirrored(f.world) : f.world.map((l) => ({ ...l }));
  const screen = world.map((l) => ({
    x: slot.cx + (l.x * slot.s) / aspect,
    y: slot.hy + l.y * slot.s,
    z: l.z,
    visibility: l.visibility,
  }));
  return { world, screen, score: f.score, t };
}

/**
 * 第 `i` 帧上的 `n` 个人：第 0 个是录制本身（摆在中间），其余错开取帧、摆到两侧。
 * 帧数不够错开的时候照样取模 —— 短片段上两个人会做同一个动作，只是晚一点。
 */
export function synthPeople(frames: readonly RawPose[], i: number, n: number, t: number): RawPose[] {
  const out: RawPose[] = [];
  const len = frames.length;
  if (!len) return out;
  for (let k = 0; k < Math.min(n, SYNTH_SLOTS.length); k++) {
    const slot = SYNTH_SLOTS[k];
    const f = frames[(((i + slot.lagFrames) % len) + len) % len];
    if (!f?.world?.length) continue;
    out.push(placeInFrame(f, slot, t));
  }
  return out;
}
