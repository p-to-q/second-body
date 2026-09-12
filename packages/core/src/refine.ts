/**
 * 姿态精修（T-精度）。**默认关闭、纯函数、可单独度量。**
 *
 * 这个文件补的是流水线里真正缺的那一段：`main.ts` 现在是
 *   `raw → mediapipeToWorld → buildSkeleton → stabilizer`，
 * **中间没有任何时序滤波** —— `filter.ts` 的 One-Euro 和 `tuning.ts` 的 `FILTER`
 * 一个调用点都没有（2026-09-12 全仓 grep 结果）。骨长稳定化只锁**长度**，
 * 锁不住方向抖动；方向抖动正是"手在抖"的那一部分。
 *
 * 三件事，都在 **MediaPipe 原始坐标系**里做完（所以不碰坐标转换，不违反 P4）：
 *
 *  1. **分组 One-Euro**：躯干/肢体/末端三组用不同截止频率。
 *     手腕要跟手（高 beta），骨盆要稳（低 minCutoff）。一套参数同时满足两者是做不到的。
 *  2. **遮挡时序补全**：visibility 掉到门限以下的点不再把（不可信的）测量值喂进滤波器，
 *     改成保持最后一次可信位置，最多保持 `holdSeconds`；超时就放手，不假装知道它在哪。
 *     回来时用一个短斜坡淡回去，避免"啪"地一跳。
 *  3. **质量兜底**：追踪质量掉下去时整体压低截止频率（更平滑、更迟钝），
 *     而不是让身体抽搐。**抽搐比迟钝更毁体验**。
 *
 * 还有一件**故意不做**的事，见 §clampFold 的注释：真正的"肘膝不反折"约束需要知道
 * 屈曲轴的朝向，而 v1 没有 roll（docs/04 §5）。无符号夹角量不出反折，
 * 硬做只会得到一个看起来在工作、其实随机生效的约束。所以这里只做**最小折叠角**，
 * 并把限制写在脸上。
 *
 * ⚠️ 下面那些数字目前是**本文件的默认值**，不是 `tuning.ts` 里的现场旋钮。
 * 把它们提成旋钮需要改冻结契约 `tuning.ts` —— 见收尾报告里的"需要变更契约"。
 * 在那之前：调参只能通过 `/dev/accuracy.html` 的实验参数，不进现场。
 */
import type { Landmark, RawPose, Skeleton, Vec3 } from './types.ts';
import { oneEuro, type OneEuroParams, type Scalar1D } from './filter.ts';
import { CAPTURE , REFINE } from './tuning.ts';
import { dist } from './vec.ts';

/** 33 个 landmark 分三组。索引表见 docs/04 §2 */
export type JointGroup = 'torso' | 'limb' | 'extremity';

/**
 * 每个 MediaPipe 索引属于哪一组。
 * - `torso` 躯干与髋肩：慢、重、几乎不该抖
 * - `limb`  肘膝踝：中间档
 * - `extremity` 腕/手指/脚尖/头脸：动得最快，必须跟手
 */
export const LANDMARK_GROUP: readonly JointGroup[] = (() => {
  const g: JointGroup[] = new Array(33).fill('extremity');
  for (const i of [11, 12, 23, 24]) g[i] = 'torso';            // 肩 · 髋
  for (const i of [13, 14, 25, 26, 27, 28, 29, 30]) g[i] = 'limb';  // 肘 · 膝 · 踝 · 跟
  return g;
})();

export interface RefineParams {
  /** 三组各自的 One-Euro 参数 */
  groups: Record<JointGroup, Required<OneEuroParams>>;
  /** 低于这个 visibility 视为"这帧看不见"，走时序补全而不是照单全收 */
  occlusionVisibility: number;
  /** 最多补多少秒。超时就放手：`visibility` 归零，让下游自己决定（P2 不编数据） */
  holdSeconds: number;
  /** 遮挡结束后淡回测量值的时长（秒）。0 = 直接跳回去 */
  rejoinSeconds: number;
  /**
   * 质量兜底：整体 score 低于这个值时开始压低截止频率。
   * 到 `qualityFloor` 时压到 `slowdownFactor`。
   */
  qualityStart: number;
  qualityFloor: number;
  /** 最差情况下截止频率乘这个系数（越小越平滑越迟钝） */
  slowdownFactor: number;
  /** visibility 自身的低通系数（0..1，越小越平滑）。0 = 不平滑 */
  visibilityAlpha: number;
}

/**
 * 基线 = **MediaPipe 自己在产线上用的 world landmark 档位**：
 * `min_cutoff 0.1 / beta 40 / derivate_cutoff 1.0`
 * （`mediapipe/modules/pose_landmark/pose_landmark_filtering.pbtxt`，
 *   geaxgx/depthai_blazepose 的 `BlazeposeDepthai.py` 独立复刻了同一组数）。
 *
 * ⚠️ **这组数和 `tuning.ts` 的 `FILTER`（minCutoff 1.0 / beta 0.02）差了三个量级。**
 * 不是笔误：One-Euro 的 beta 乘的是速度，而速度的单位跟着信号走。
 * `FILTER` 那组是像素/归一化坐标的量级；world landmark 是**米**，
 * 手以 1 m/s 挥动时 beta=0.02 只把截止频率抬到 1.02 Hz —— 等于把手焊死。
 * 见 docs/24 §2。`FILTER` 目前在全仓没有任何调用点，所以这个错还没害到人。
 *
 * 分组（torso / limb / extremity）是**我们的加法，上游没有先例** ——
 * 上游分的是"屏幕坐标 / 世界坐标 / ROI"三路信号，不是按关节分。
 * 所以这三档必须靠 `/dev/accuracy.html` 量出来才算数，不能靠好听。
 */


/**
 * 旋钮住在 `tuning.ts` 的 `REFINE`（P0：现场要调的数集中一处），这里只做形状适配。
 */
export const DEFAULT_REFINE: RefineParams = {
  groups: REFINE.groups,
  occlusionVisibility: REFINE.occlusionVisibility,
  holdSeconds: REFINE.holdSeconds,
  rejoinSeconds: REFINE.rejoinSeconds,
  qualityStart: REFINE.qualityStart,
  qualityFloor: REFINE.qualityFloor,
  slowdownFactor: REFINE.slowdownFactor,
  visibilityAlpha: REFINE.visibilityAlpha,
};


/** 一次精修之后能说出口的东西。dev 页面拿它显示，运行时可以不看 */
export interface RefineStats {
  /** 这帧有几个点在"保持"（遮挡补全中） */
  held: number;
  /** 这帧有几个点已经超时放手 */
  dropped: number;
  /** 质量兜底的当前强度：1 = 没兜底，接近 slowdownFactor = 全力兜底 */
  cutoffScale: number;
}

export interface Refiner {
  /** 返回一个**新的** RawPose（同一坐标系）。输入不被改写 */
  apply(raw: RawPose, dt: number): RawPose;
  readonly stats: RefineStats;
  reset(): void;
}

interface Slot {
  fx: Scalar1D; fy: Scalar1D; fz: Scalar1D;
  last: Vec3 | null;
  /** 已经保持了多少秒 */
  heldFor: number;
  /** 回归斜坡剩余秒数 */
  rejoin: number;
  /** 低通之后的 visibility（见 DEFAULT_REFINE.visibilityAlpha）。null = 还没有第一帧 */
  vis: number | null;
}

export function createRefiner(over: Partial<RefineParams> = {}): Refiner {
  const p: RefineParams = { ...DEFAULT_REFINE, ...over, groups: { ...DEFAULT_REFINE.groups, ...over.groups } };
  const stats: RefineStats = { held: 0, dropped: 0, cutoffScale: 1 };
  let slots: Slot[] = [];
  let scale = 1;

  const makeSlot = (i: number): Slot => {
    const g = p.groups[LANDMARK_GROUP[i] ?? 'extremity'];
    return {
      fx: oneEuro(g), fy: oneEuro(g), fz: oneEuro(g),
      last: null, heldFor: 0, rejoin: 0, vis: null,
    };
  };

  /**
   * 截止频率不能直接改（One-Euro 的状态在闭包里），所以用**等效 dt** 来压：
   * alpha = 1/(1 + tau/dt)，把 dt 乘上 s 与把 cutoff 乘上 s 对 alpha 的作用完全一致。
   * 这是 One-Euro 的代数性质，不是近似 —— 这样兜底就不需要重建滤波器、不丢历史。
   */
  function apply(raw: RawPose, dtIn: number): RawPose {
    const dt = Number.isFinite(dtIn) && dtIn > 0 ? dtIn : 1 / CAPTURE.targetHz;
    const world: Landmark[] = Array.isArray(raw?.world) ? raw.world : [];
    const screen = Array.isArray(raw?.screen) ? raw.screen : undefined;
    if (slots.length !== world.length) slots = world.map((_, i) => makeSlot(i));

    // 质量兜底：目标系数一步到位算出来，再用一阶滞后跟过去（切换本身不能是跳变）
    const target = qualityScale(raw?.score ?? 0, p);
    scale += (target - scale) * Math.min(1, dt / 0.35);
    stats.cutoffScale = scale;

    const out: Landmark[] = new Array(world.length);
    let held = 0, dropped = 0;

    for (let i = 0; i < world.length; i++) {
      const lm = world[i];
      const slot = slots[i] ?? (slots[i] = makeSlot(i));
      // visibility 优先看 screen：worldLandmarks 在部分模型版本里恒为 0/缺失。
      // 低通之后再拿去比门限 —— 原始 visibility 会在门限上下颤（docs/24 §2）。
      const rawVis = confidenceOf(screen?.[i], lm);
      const a = clamp01(p.visibilityAlpha);
      slot.vis = slot.vis === null || a <= 0 ? rawVis : slot.vis + (rawVis - slot.vis) * a;
      const vis = slot.vis;
      const finite = !!lm && Number.isFinite(lm.x) && Number.isFinite(lm.y) && Number.isFinite(lm.z);
      /**
       * 门限用 **min(原始, 低通)** —— 这个不对称是故意的：
       * 掉下去立刻生效（原始值一帧就到底，遮挡那一帧的垃圾坐标绝不能被采信），
       * 回上来要等低通爬完（不然置信度在门限上颤一下，补全就一帧进一帧出）。
       * 纯低通做门限会把遮挡识别推迟 ~10 帧；纯原始值做门限则会颤。
       */
      const trusted = finite && Math.min(rawVis, vis) >= p.occlusionVisibility;

      if (trusted) {
        if (slot.heldFor > 0) slot.rejoin = p.rejoinSeconds;   // 刚回来：开一个淡回斜坡
        slot.heldFor = 0;
      } else if (slot.last && slot.heldFor < p.holdSeconds) {
        slot.heldFor += dt;
        held++;
      } else {
        // 放手：没有可信测量、也没得可保持。不编一个位置出来（P2）
        slot.heldFor = slot.last ? p.holdSeconds : 0;
        if (slot.last) dropped++;
      }

      const src: Vec3 = trusted
        ? [lm!.x, lm!.y, lm!.z]
        : (slot.last ?? (finite ? [lm!.x, lm!.y, lm!.z] : [0, 0, 0]));

      // 保持期间冻结滤波器（喂进去的是同一个值，等价于"不更新"）
      const eff = dt * scale;
      const v: Vec3 = [slot.fx(src[0], eff), slot.fy(src[1], eff), slot.fz(src[2], eff)];

      if (slot.rejoin > 0) slot.rejoin = Math.max(0, slot.rejoin - dt);
      slot.last = trusted ? [src[0], src[1], src[2]] : slot.last;

      // 输出的 visibility 说的是"这个数有多可信"，而不是"模型看见了没有"：
      // 保持中的点按剩余保持时间线性衰减，超时后归零。下游的置信度加权因此仍然成立。
      const outVis = trusted
        ? (slot.rejoin > 0 ? vis * (1 - slot.rejoin / Math.max(1e-6, p.rejoinSeconds)) : vis)
        : (slot.heldFor >= p.holdSeconds ? 0 : vis * (1 - slot.heldFor / Math.max(1e-6, p.holdSeconds)));

      out[i] = { x: v[0], y: v[1], z: v[2], visibility: clamp01(outVis) };
    }

    stats.held = held;
    stats.dropped = dropped;
    return { world: out, screen: raw?.screen, score: raw?.score ?? 0, t: raw?.t ?? 0 };
  }

  return {
    apply,
    get stats() { return stats; },
    reset() { slots = []; scale = 1; stats.held = stats.dropped = 0; stats.cutoffScale = 1; },
  };
}

/** 整体 score → 截止频率系数。qualityStart 以上 = 1，qualityFloor 以下 = slowdownFactor */
export function qualityScale(score: number, p: RefineParams = DEFAULT_REFINE): number {
  const s = Number.isFinite(score) ? score : 0;
  const hi = Math.max(p.qualityFloor, p.qualityStart);
  const lo = Math.min(p.qualityFloor, p.qualityStart);
  if (s >= hi) return 1;
  if (s <= lo) return p.slowdownFactor;
  const t = (s - lo) / Math.max(1e-6, hi - lo);
  return p.slowdownFactor + (1 - p.slowdownFactor) * t;
}

function confidenceOf(a: Landmark | undefined, b: Landmark | undefined): number {
  for (const l of [a, b]) {
    const v = l?.visibility;
    if (typeof v === 'number' && Number.isFinite(v)) return clamp01(v);
  }
  return l1(a) || l1(b) ? 1 : 0;   // 没有 visibility 字段 = 模型不给；有坐标就当 1（同 skeleton.ts）
}
const l1 = (l: Landmark | undefined): boolean =>
  !!l && Number.isFinite(l.x) && Number.isFinite(l.y) && Number.isFinite(l.z);
const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

// ── 关节角约束 ──────────────────────────────────────────────────────────────

/** 肘/膝的最小折叠角（弧度）。比这更折就是追踪崩了，不是人做得到的姿势 */
const MIN_FOLD = (18 * Math.PI) / 180;

/** [关节名, 近端, 远端]：在 `关节` 处，`近端`—`关节`—`远端` 的夹角不得小于 MIN_FOLD */
const FOLDS: readonly (readonly [string, string, string])[] = [
  ['elbowL', 'shoulderL', 'wristL'], ['elbowR', 'shoulderR', 'wristR'],
  ['kneeL', 'hipL', 'ankleL'], ['kneeR', 'hipR', 'ankleR'],
];

/**
 * **只做最小折叠角，不做"反折"。**
 *
 * 为什么不做反折：判断肘是不是朝错误方向弯，必须知道屈曲轴在世界系里指向哪 ——
 * 那需要前臂的 roll，而 v1 明确不做 roll（docs/04 §5）。
 * 无符号夹角对"正常弯 30°"和"反着弯 30°"给出同一个数，
 * 拿它当反折约束，得到的是一个**看起来在工作、实际随机生效**的东西。宁可不做。
 *
 * 最小折叠角能挡住的是另一类真实故障：低置信度的腕/踝被拉回到肩/髋附近，
 * 整条手臂折成一根针。这个 case 用无符号夹角就足够识别。
 *
 * 做法：把远端点绕关节旋转到最小角度上，**保持骨长**（长度是稳定化的产物，不能动）。
 * 返回被修正的关节数。骨头的 p0/p1 一并同步。
 */
export function clampFold(sk: Skeleton): number {
  const J = sk?.joints;
  if (!J) return 0;
  let fixed = 0;
  for (const [mid, prox, distal] of FOLDS) {
    const m = J[mid], a = J[prox], b = J[distal];
    if (!m || !a || !b) continue;
    const u = unit(a, m), v = unit(b, m);
    if (!u || !v) continue;
    const c = Math.min(1, Math.max(-1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]));
    const ang = Math.acos(c);
    if (!(ang < MIN_FOLD)) continue;

    // 在 (u, w) 平面里把 v 推到 MIN_FOLD：w = v 去掉 u 分量后的正交方向。
    // v 与 u 几乎共线时正交方向不存在 —— 那就任取一条与 u 垂直的轴，
    // 反正这一帧的方向本来就是垃圾，重点是别留下一根针、别产生 NaN。
    let w = orthogonal(v, u);
    if (!w) w = anyPerp(u);
    const len = dist(m, b);
    const s = Math.sin(MIN_FOLD), k = Math.cos(MIN_FOLD);
    J[distal] = [
      m[0] + (u[0] * k + w[0] * s) * len,
      m[1] + (u[1] * k + w[1] * s) * len,
      m[2] + (u[2] * k + w[2] * s) * len,
    ];
    fixed++;
  }
  if (fixed && Array.isArray(sk.bones)) {
    for (const b of sk.bones) {
      const a = ENDPOINTS[b.id];
      if (!a) continue;
      if (J[a[0]]) b.p0 = [J[a[0]][0], J[a[0]][1], J[a[0]][2]];
      if (J[a[1]]) b.p1 = [J[a[1]][0], J[a[1]][1], J[a[1]][2]];
      b.length = dist(b.p0, b.p1);
    }
  }
  return fixed;
}

/** 只需要被 clampFold 动到的那几根 —— 前臂与小腿 */
const ENDPOINTS: Readonly<Record<string, readonly [string, string]>> = {
  foreArmL: ['elbowL', 'wristL'], foreArmR: ['elbowR', 'wristR'],
  shinL: ['kneeL', 'ankleL'], shinR: ['kneeR', 'ankleR'],
  handL: ['wristL', 'handTipL'], handR: ['wristR', 'handTipR'],
  footL: ['ankleL', 'footIdxL'], footR: ['ankleR', 'footIdxR'],
};

function unit(from: Vec3, at: Vec3): Vec3 | null {
  const d: Vec3 = [from[0] - at[0], from[1] - at[1], from[2] - at[2]];
  const l = Math.hypot(d[0], d[1], d[2]);
  return l > 1e-9 ? [d[0] / l, d[1] / l, d[2] / l] : null;
}

function orthogonal(v: Vec3, u: Vec3): Vec3 | null {
  const d = v[0] * u[0] + v[1] * u[1] + v[2] * u[2];
  const w: Vec3 = [v[0] - u[0] * d, v[1] - u[1] * d, v[2] - u[2] * d];
  const l = Math.hypot(w[0], w[1], w[2]);
  return l > 1e-6 ? [w[0] / l, w[1] / l, w[2] / l] : null;
}

function anyPerp(u: Vec3): Vec3 {
  const a: Vec3 = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const c: Vec3 = [
    u[1] * a[2] - u[2] * a[1],
    u[2] * a[0] - u[0] * a[2],
    u[0] * a[1] - u[1] * a[0],
  ];
  const l = Math.hypot(c[0], c[1], c[2]) || 1;
  return [c[0] / l, c[1] / l, c[2] / l];
}
