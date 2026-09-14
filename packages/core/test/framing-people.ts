/**
 * 合成的"画面里的人"：33 个 `screen` 点，给取景模式的测试和工作台页用。
 *
 * **不是真人录制**（`assets/demo/SOURCES.md` 的规矩：合成数据不进 `assets/demo/`）。
 * 它只保证几何关系是一个站着的人：头在肩上、肩在胯上、膝踝在胯下，
 * 比例取自 `stage/framing.ts` 的标准站姿（1.7m）。画外的点按 MediaPipe 的习惯给低可见度。
 */
import type { Landmark, RawPose } from '../src/types.ts';

/** 一个 1.7m 的人，以胯中点为原点，y 向下（米）。索引见 docs/04 §2 */
const BODY: ReadonlyArray<readonly [number, number]> = [
  [0, -0.65],                                                   // 0 鼻
  [0.03, -0.68], [0.04, -0.68], [0.05, -0.68],                  // 1–3 左眼
  [-0.03, -0.68], [-0.04, -0.68], [-0.05, -0.68],               // 4–6 右眼
  [0.08, -0.66], [-0.08, -0.66],                                // 7–8 耳
  [0.03, -0.60], [-0.03, -0.60],                                // 9–10 嘴
  [0.19, -0.45], [-0.19, -0.45],                                // 11–12 肩
  [0.33, -0.20], [-0.33, -0.20],                                // 13–14 肘
  [0.44, 0.02], [-0.44, 0.02],                                  // 15–16 腕
  [0.47, 0.10], [-0.47, 0.10], [0.48, 0.10], [-0.48, 0.10], [0.46, 0.08], [-0.46, 0.08], // 17–22 手
  [0.09, 0], [-0.09, 0],                                        // 23–24 胯
  [0.10, 0.42], [-0.10, 0.42],                                  // 25–26 膝
  [0.10, 0.84], [-0.10, 0.84],                                  // 27–28 踝
  [0.10, 0.88], [-0.10, 0.88],                                  // 29–30 跟
  [0.10, 0.90], [-0.10, 0.90],                                  // 31–32 脚尖
];

export interface PersonSpec {
  /** 胯中点在画面里的横坐标（0..1） */
  cx?: number;
  /** 胯中点在画面里的纵坐标（0..1，可以 > 1：胯在画面下方） */
  hy?: number;
  /** 画面高度单位 / 米。1.0 = 离笔记本很近；0.5 = 全身正好进画 */
  s?: number;
  /** 肩宽的额外倍数（转身 < 1，前倾 > 1） */
  width?: number;
  /** 胯以上的竖直倍数（前倾时躯干透视变短 < 1） */
  torso?: number;
  /** 画内点的可见度 */
  vis?: number;
  /** 画外点的可见度（MediaPipe 对画外点常给 0.1–0.3） */
  visOut?: number;
  /** 膝踝脚的可见度（被桌子挡住时）。缺省 = 按画内 / 画外给 */
  legVis?: number;
  score?: number;
  aspect?: number;
}

export function person(p: PersonSpec = {}): RawPose {
  const cx = p.cx ?? 0.5, hy = p.hy ?? 0.55, s = p.s ?? 0.5;
  const aspect = p.aspect ?? 16 / 9;
  const screen: Landmark[] = BODY.map(([x, y], i) => {
    const up = y < 0 ? (p.torso ?? 1) : 1;
    const wide = i >= 11 && i <= 22 ? (p.width ?? 1) : 1;
    const l = { x: cx + (x * s * wide) / aspect, y: hy + y * s * up, z: 0 };
    const out = l.x < 0 || l.x > 1 || l.y < 0 || l.y > 1;
    const leg = i >= 25;
    const visibility = leg && p.legVis !== undefined ? p.legVis : out ? (p.visOut ?? 0.2) : (p.vis ?? 0.95);
    return { ...l, visibility };
  });
  return { world: screen.map((l) => ({ x: 0, y: 0, z: 0, visibility: l.visibility })), screen, score: p.score ?? 0.95, t: 0 };
}

/** 两个 spec 之间线性插值（数值字段） */
export function between(a: PersonSpec, b: PersonSpec, t: number): PersonSpec {
  const out: PersonSpec = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof PersonSpec>) {
    const x = a[k] as number | undefined, y = b[k] as number | undefined;
    out[k] = x === undefined ? y : y === undefined ? x : x + (y - x) * t;
  }
  return out;
}

/** 常用的几种人 */
export const SEATED: PersonSpec = { s: 1.0, hy: 0.95 };           // 笔记本前坐着：头肩胯，膝踝在画外
export const WHOLE: PersonSpec = { s: 0.5, hy: 0.52 };            // 退后到整个人进画
export const STOOD_UP_CLOSE: PersonSpec = { s: 1.0, hy: 0.5 };    // 在笔记本跟前站起来：头出了上边

// ── 合成的时间线（工作台 `/dev/framing.html` 与取证脚本 `scripts/framing/` 共用，docs/49 §6.6）──

/** 一段：`seconds` 秒里人从 `from` 走到 `to`（null = 画里没人）。其余字段叠在上面 */
export interface Segment {
  seconds: number;
  from: PersonSpec | null;
  to?: PersonSpec | null;
  /** 左右晃：胯中点 x 加上 amp·sin(2π·hz·t) */
  swayAmp?: number;
  swayHz?: number;
  /** 每 `altEvery` 秒换成另一个人（`numPoses = 1` 时 MediaPipe 在两个人之间跳） */
  alt?: PersonSpec;
  altEvery?: number;
  /** 这一段里的取景策略与降级 hold（工作台模拟控件条和调速器） */
  policy?: 'auto' | 'full' | 'upper';
  hold?: boolean;
}

/**
 * 几段有名字的时间线。"左 / 右"一律是**观众自己的**：往自己左边走 = 画面 x 变大、越过画面右边（docs/49 §6.3 二的镜像那一行）。
 */
export const SCRIPTS: Record<string, Segment[]> = {
  /** 画内慢慢左右走（0.25Hz），再快速晃（2Hz） */
  sway: [
    { seconds: 1.5, from: WHOLE },
    { seconds: 8, from: WHOLE, swayAmp: 0.2, swayHz: 0.25 },
    { seconds: 4, from: WHOLE, swayAmp: 0.05, swayHz: 2 },
    { seconds: 1.5, from: WHOLE },
  ],
  /** 往自己左边走出画、停一会、走回来 */
  'out-left': [
    { seconds: 1.5, from: WHOLE },
    { seconds: 2.5, from: WHOLE, to: { ...WHOLE, cx: 1.08 } },
    { seconds: 2.5, from: { ...WHOLE, cx: 1.08 } },
    { seconds: 2.5, from: { ...WHOLE, cx: 1.08 }, to: WHOLE },
    { seconds: 2, from: WHOLE },
  ],
  /** 往自己右边走出画、停一会、走回来 */
  'out-right': [
    { seconds: 1.5, from: WHOLE },
    { seconds: 2.5, from: WHOLE, to: { ...WHOLE, cx: -0.08 } },
    { seconds: 2.5, from: { ...WHOLE, cx: -0.08 } },
    { seconds: 2.5, from: { ...WHOLE, cx: -0.08 }, to: WHOLE },
    { seconds: 2, from: WHOLE },
  ],
  /** 站在一边、整个人出画（跟丢）三秒、从另一边回来 */
  reentry: [
    { seconds: 2.5, from: { ...WHOLE, cx: 0.3 } },
    { seconds: 3, from: null },
    { seconds: 1, from: { ...WHOLE, cx: 0.95 }, to: { ...WHOLE, cx: 0.7 } },
    { seconds: 3, from: { ...WHOLE, cx: 0.7 } },
  ],
  /** 坐近 → 站起来（头出上边）→ 退后 → 再坐近；中途控件条换一次策略、调速器砍一次工作量 */
  sitstand: [
    { seconds: 3, from: SEATED },
    { seconds: 0.4, from: SEATED, to: STOOD_UP_CLOSE }, { seconds: 1.6, from: STOOD_UP_CLOSE },
    { seconds: 1.2, from: STOOD_UP_CLOSE, to: WHOLE, hold: true }, { seconds: 2.8, from: WHOLE, hold: true },
    { seconds: 1.0, from: WHOLE, to: SEATED }, { seconds: 2, from: SEATED },
    { seconds: 1.5, from: SEATED, policy: 'full' }, { seconds: 2.5, from: SEATED },
  ],
  /** 画里两个人一左一右，`numPoses = 1` 的 MediaPipe 在两人之间来回跳 */
  two: [
    { seconds: 2, from: { ...WHOLE, cx: 0.2 } },
    { seconds: 5, from: { ...WHOLE, cx: 0.2 }, alt: { ...WHOLE, cx: 0.8, s: 0.45 }, altEvery: 0.27 },
    { seconds: 2, from: { ...WHOLE, cx: 0.2 } },
  ],
};

export const scriptSeconds = (segs: readonly Segment[]): number => segs.reduce((a, s) => a + s.seconds, 0);

/** 时间线上第 `t` 秒的样子（`t` 超过总长时按循环取） */
export function scriptAt(segs: readonly Segment[], t: number): { pose: RawPose | null; policy: 'auto' | 'full' | 'upper'; hold: boolean } {
  const total = scriptSeconds(segs);
  let u = total > 0 ? ((t % total) + total) % total : 0;
  for (const seg of segs) {
    if (u < seg.seconds || seg === segs[segs.length - 1]) {
      const k = Math.min(1, u / Math.max(1e-9, seg.seconds));
      const policy = seg.policy ?? 'auto';
      const hold = seg.hold ?? false;
      if (!seg.from) return { pose: null, policy, hold };
      let spec = seg.to ? between(seg.from, seg.to, k) : { ...seg.from };
      if (seg.alt && seg.altEvery && Math.floor(u / seg.altEvery) % 2 === 1) spec = { ...seg.alt };
      if (seg.swayAmp) spec = { ...spec, cx: (spec.cx ?? 0.5) + seg.swayAmp * Math.sin(2 * Math.PI * (seg.swayHz ?? 0) * u) };
      return { pose: person(spec), policy, hold };
    }
    u -= seg.seconds;
  }
  return { pose: null, policy: 'auto', hold: false };
}
