/**
 * 取景模式 —— 「只露上半身的笔记本观众」和「退后让我看全身的人」之间，**实时**怎么切。纯函数。
 *
 * 来路与裁定写在 `docs/49-AUTO-FRAMING.md` §落地。这里只放三件可证伪的东西：
 *
 *  1. **分类器** `createFramingClassifier()`：一帧 `RawPose` + `dt` → `full` / `upper` / `stepping-back`，
 *     带滞回、漏桶式的连续成立、切换冷却。**它不裁任何图**（docs/49 §3 用法 A 的反馈环），
 *     读的是 MediaPipe 在整幅画面上给出的可见度和位置。
 *  2. **跟随** `stepFollow()`：死区 + 二次过渡带 + 帧率无关的临界阻尼弹簧 + 夹住范围。
 *     舞台相机的中景跟随和小屏的数字裁切共用这一个。
 *  3. **小屏裁切** `stepCrop()`：只在上半身模式、一切正常时放大跟随；任何告警**当帧**退回整幅（诚实规则）。
 *
 * 三条硬规矩（出过事或被研究否掉过的）：
 *  - 模式只由**输出侧**消费：舞台相机的景别、腿要不要换成站姿、小屏的裁切、引导文案。
 *    采集端一个像素都不动。
 *  - 没有时钟、没有随机：时间全部从 `dt` 来（AGENTS.md 不变量）。
 *  - 结论要能读出来：每一次读数都带 `why` 和证据，HUD 与 `/dev/framing.html` 直接显示它。
 */
import type { Landmark, RawPose } from './types.ts';
import { AUTOFRAME, CAPTURE, PREVIEW, REFINE } from './tuning.ts';
import { qualityScale } from './refine.ts';

/** 分类器判出来的状态。`stepping-back` 是过渡态：人正在往后退，景别先给全景，腿先别急着放开 */
export type FramingMode = 'full' | 'upper' | 'stepping-back';
/** 操作员 / 观众选的策略。`auto` = 听分类器；另两个是**叠加**，不是锁（再选 auto 就回去） */
export type FramingPolicy = 'auto' | 'full' | 'upper';
export const FRAMING_POLICIES: readonly FramingPolicy[] = ['auto', 'full', 'upper'];
/** 舞台相机实际给的景别 */
export type Shot = 'full' | 'upper';

/** 为什么是这个模式。HUD 上原样显示，所以每个词都要能被一个现场的人读懂 */
export type FramingWhy =
  | 'start'           // 开机默认全身
  | 'legs-out'        // 膝踝持续不在画内 → 上半身
  | 'legs-appearing'  // 上半身时膝踝开始出现 → 退后中
  | 'shrinking'       // 上半身时肩宽和躯干同时在缩 → 退后中
  | 'legs-in'         // 腿真的进画了 → 全身
  | 'timeout'         // 退后中太久没结论
  | 'abnormal'        // 头 / 肩被切，或者肩根本不可信 → 全身
  | 'absent'          // 人走了 → 全身
  | 'forced';         // 策略不是 auto

// ── 证据 ────────────────────────────────────────────────────────────────────

const NOSE = 0;
const SHOULDER_L = 11, SHOULDER_R = 12;
const HIP_L = 23, HIP_R = 24;
/** 膝 · 踝。脚跟脚尖不算：它们在画面底边上最先被裁，也最先被桌子挡，是最不稳定的四个点 */
const LEG_POINTS = [25, 26, 27, 28] as const;
/** 头与肩（0–12）。这里面 ≥ `PREVIEW.outOfFramePoints` 个在画外 = 头被切了 */
const UPPER_LAST = 12;

/**
 * 一个点可不可信。**和 `ui/preview-state.ts` 是同一把尺子**（它从这里 import）：
 * 没有 visibility 字段 = 模型不给这个数，有坐标就当可信。
 */
export function trustedLandmark(l: Landmark | undefined): boolean {
  if (!l || !Number.isFinite(l.x) || !Number.isFinite(l.y)) return false;
  const v = l.visibility;
  return typeof v === 'number' && Number.isFinite(v) ? v >= REFINE.occlusionVisibility : true;
}

/** 在画内（带 `PREVIEW.edgeMargin` 余量）。和 `outOfFrame()` 同一条线 */
export function inFrame(l: Landmark): boolean {
  const m = PREVIEW.edgeMargin;
  return l.x >= -m && l.x <= 1 + m && l.y >= -m && l.y <= 1 + m;
}

/** 一帧里分类器看到的全部东西。HUD 和工作台页直接显示它 */
export interface FramingEvidence {
  /** 膝踝四点里可信且在画内的个数（没有 screen 时只看可信） */
  legs: number;
  /** 头与肩可信地在画里（肩两个都可信，且头肩点里在画外的不到门限） */
  upper: boolean;
  /** 头肩点（0–12）里可信但在画外的个数 */
  upperOut: number;
  /** 追踪质量够不够（`refine.ts` 的 `qualityScale`，和小屏同一把尺子）。不够 = 这一帧不作数 */
  quality: boolean;
  /** 肩宽（画面高度为单位，x 按宽高比折算）。NaN = 量不到 */
  shoulder: number;
  /** 躯干长（肩中点到胯中点）；胯不可信时退到颈长（鼻子到肩中点）。NaN = 量不到 */
  torso: number;
  /** 这一帧有没有 screen 坐标。回放录制通常没有：那时只有可见度，没有"在不在画内"，也没有尺度 */
  screen: boolean;
}

/**
 * 一帧 → 证据。`null` = 没有人（和 `main.ts` 的 `detected`、小屏的 `empty` 同一条线）。
 * @param aspect 摄像头画面宽 / 高。x 坐标乘它才和 y 同一个单位（1280×720 = 16/9）
 */
export function frameEvidence(pose: RawPose | null, aspect = 16 / 9): FramingEvidence | null {
  const score = Number.isFinite(pose?.score) ? pose!.score : 0;
  if (!pose || score <= CAPTURE.minScore) return null;
  const quality = qualityScale(score) >= 1;
  const screen = pose.screen?.length ? pose.screen : null;

  if (!screen) {
    // 回放：只有 world 的可见度。腿看不看得见照样有意义（录制里的人确实只露了上半身），
    // "在不在画内"和尺度没有 —— 少一条判据是事实，编一个"都在画内"不是。
    const w = pose.world ?? [];
    return {
      legs: LEG_POINTS.filter((i) => trustedLandmark(w[i]) && hasVisibility(w[i])).length,
      upper: trustedLandmark(w[SHOULDER_L]) && trustedLandmark(w[SHOULDER_R]),
      upperOut: 0, quality, shoulder: NaN, torso: NaN, screen: false,
    };
  }

  const legs = LEG_POINTS.filter((i) => trustedLandmark(screen[i]) && inFrame(screen[i])).length;
  let upperOut = 0;
  for (let i = 0; i <= UPPER_LAST; i++) {
    const l = screen[i];
    if (trustedLandmark(l) && !inFrame(l)) upperOut++;
  }
  const sL = screen[SHOULDER_L], sR = screen[SHOULDER_R];
  const shouldersOk = trustedLandmark(sL) && trustedLandmark(sR) && inFrame(sL) && inFrame(sR);
  // 头在不在：鼻子或任一只耳朵可信地在画内。**光数"画外的可信点"不够** ——
  // MediaPipe 给出了上边的头的可见度往往只有 0.1–0.3，于是它们根本不算可信点，
  // 一个头被整个切掉的人会被数成"画外 0 个"。合成时间线第一版就是这么漏的。
  const headIn = [NOSE, 7, 8].some((i) => trustedLandmark(screen[i]) && inFrame(screen[i]));
  const upper = shouldersOk && headIn && upperOut < PREVIEW.outOfFramePoints;

  const d = (a: Landmark, b: Landmark): number => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
  const mid = (a: Landmark, b: Landmark): Landmark => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: 0 });
  const shoulder = shouldersOk ? d(sL, sR) : NaN;
  let torso = NaN;
  if (shouldersOk) {
    const hL = screen[HIP_L], hR = screen[HIP_R], nose = screen[NOSE];
    if (trustedLandmark(hL) && trustedLandmark(hR)) torso = d(mid(sL, sR), mid(hL, hR));
    else if (trustedLandmark(nose)) torso = d(mid(sL, sR), nose) * TORSO_PER_NECK;
  }
  return { legs, upper, upperOut, quality, shoulder, torso, screen: true };
}

/**
 * 颈长（鼻子到肩中点）折成躯干长的系数。只用于**趋势**（比例），不用于绝对值 ——
 * 乘它是为了胯时有时无的时候，两种量法之间不跳一个台阶被当成"换了个人"。
 * 标准站姿里鼻子到肩中点 ≈ 0.20 身高单位、肩到胯 ≈ 0.45。
 */
const TORSO_PER_NECK = 2.25;

const hasVisibility = (l: Landmark | undefined): boolean =>
  typeof l?.visibility === 'number' && Number.isFinite(l.visibility);

// ── 分类器 ──────────────────────────────────────────────────────────────────

export interface FramingReading {
  mode: FramingMode;
  why: FramingWhy;
  /** 在当前模式里待了多少秒 */
  inMode: number;
  /** 这一帧的证据；没有人时是 null */
  evidence: FramingEvidence | null;
  /** 尺度趋势：此刻 / 窗口内最大值（肩宽与躯干取较大的那个 —— 两者都缩才算缩）。NaN = 没得比 */
  trend: number;
  /** 冷却还剩多少秒 */
  cooldown: number;
}

export interface FramingClassifier {
  update(pose: RawPose | null, dt: number): FramingReading;
  readonly current: FramingReading;
  reset(): void;
}

export interface ClassifierOptions {
  /** 现场：全身优先（`AUTOFRAME.enterUpperSecondsKiosk`），也没有"刚出现时快切"那一档 */
  kiosk?: boolean;
  aspect?: number;
}

/**
 * 漏桶：条件成立时加 dt，不成立时扣 2·dt，不低于 0。
 * 为什么不是"不成立就清零"：真实的腿会偶尔一帧冒一个点，清零会让"坐下来"永远憋不满。
 * 为什么不是"不成立就不动"：门限上 50/50 的颤动会慢慢攒满，最后跳一下 —— 那正是要防的。
 */
const leak = (held: number, on: boolean, dt: number): number => (on ? held + dt : Math.max(0, held - 2 * dt));

export function createFramingClassifier(opts: ClassifierOptions = {}): FramingClassifier {
  const T = AUTOFRAME;
  const aspect = opts.aspect ?? 16 / 9;
  let mode: FramingMode = 'full';
  let why: FramingWhy = 'start';
  let inMode = 0;
  let cooldown = 0;
  let present = 0;
  let absent = 0;
  let toUpper = 0, toStep = 0, toFull = 0, toAbnormal = 0;
  /** 尺度窗口：[还剩几秒过期, 肩宽, 躯干] */
  let windowS: Array<[number, number, number]> = [];
  let last: [number, number] | null = null;
  let current: FramingReading = { mode, why, inMode, evidence: null, trend: NaN, cooldown };

  function go(next: FramingMode, because: FramingWhy, cool = true): void {
    if (next === mode) return;
    mode = next;
    why = because;
    inMode = 0;
    if (cool) cooldown = T.cooldownSeconds;
    toUpper = toStep = toFull = toAbnormal = 0;
  }

  /** 喂一个尺度样本，返回 此刻 / 窗口最大（两个量里较大的那个比值）。换人时清空 */
  function trendOf(ev: FramingEvidence, dt: number): number {
    for (const s of windowS) s[0] -= dt;
    windowS = windowS.filter((s) => s[0] > 0);
    if (!ev.screen || !Number.isFinite(ev.shoulder) || !Number.isFinite(ev.torso)) { last = null; return NaN; }
    if (last) {
      const jump = Math.max(Math.abs(ev.shoulder / last[0] - 1), Math.abs(ev.torso / last[1] - 1));
      if (jump > T.identityJump) windowS = [];
    }
    last = [ev.shoulder, ev.torso];
    windowS.push([T.stepBackWindow, ev.shoulder, ev.torso]);
    let maxS = 0, maxT = 0;
    for (const [, s, t] of windowS) { maxS = Math.max(maxS, s); maxT = Math.max(maxT, t); }
    return Math.max(ev.shoulder / maxS, ev.torso / maxT);
  }

  function read(ev: FramingEvidence | null, trend: number): FramingReading {
    current = { mode, why, inMode, evidence: ev, trend, cooldown };
    return current;
  }

  return {
    update(pose, dtIn) {
      const dt = Number.isFinite(dtIn) && dtIn > 0 ? Math.min(dtIn, 0.25) : 0;
      inMode += dt;
      cooldown = Math.max(0, cooldown - dt);
      const ev = frameEvidence(pose, aspect);

      if (!ev) {
        absent += dt;
        present = 0;
        last = null;
        windowS = [];
        toUpper = toStep = toFull = toAbnormal = 0;
        if (absent >= T.absentResetSeconds && mode !== 'full') go('full', 'absent', false);
        return read(null, NaN);
      }
      absent = 0;
      present += dt;
      const trend = trendOf(ev, dt);

      // 光不够：这一帧的可见度不可信（腿的可见度会跟着一起塌，看起来像"只露上半身"）。
      // **保持当前模式**，桶只漏不加 —— 坏光不该把人判成坐下了。
      if (!ev.quality) {
        toUpper = leak(toUpper, false, dt); toStep = leak(toStep, false, dt);
        toFull = leak(toFull, false, dt); toAbnormal = leak(toAbnormal, false, dt);
        return read(ev, trend);
      }

      // 头 / 肩被切：不是一个上半身取景，是一个出了问题的取景 → 全景，诚实，不等冷却
      toAbnormal = leak(toAbnormal, !ev.upper, dt);
      if (!ev.upper) {
        if (toAbnormal >= T.abnormalSeconds && mode !== 'full') go('full', 'abnormal');
        return read(ev, trend);
      }

      const legsOut = ev.legs <= T.legsOutMax;
      const legsIn = ev.legs >= T.legsInMin;
      const shrinking = Number.isFinite(trend) && trend <= 1 - T.stepBackShrink;

      if (mode === 'full') {
        const need = opts.kiosk ? T.enterUpperSecondsKiosk
          : present <= T.firstWindowSeconds ? T.enterUpperFirstSeconds : T.enterUpperSeconds;
        toUpper = leak(toUpper, legsOut, dt);
        if (toUpper >= need && cooldown <= 0) go('upper', 'legs-out');
      } else if (mode === 'upper') {
        const appearing = !legsOut;
        toStep = leak(toStep, appearing || shrinking, dt);
        if (toStep >= T.stepBackConfirmSeconds && cooldown <= 0) go('stepping-back', appearing ? 'legs-appearing' : 'shrinking');
      } else {
        toFull = leak(toFull, legsIn, dt);
        // 退后完成不等冷却：人已经退到位了，再让他等一秒是在惩罚照做的人
        if (toFull >= T.enterFullSeconds) go('full', 'legs-in', false);
        else if (inMode >= T.stepBackTimeoutSeconds) go(legsOut ? 'upper' : 'full', 'timeout');
      }
      return read(ev, trend);
    },
    get current() { return current; },
    reset() {
      mode = 'full'; why = 'start'; inMode = 0; cooldown = 0; present = 0; absent = 0;
      toUpper = toStep = toFull = toAbnormal = 0; windowS = []; last = null;
      current = { mode, why, inMode, evidence: null, trend: NaN, cooldown };
    },
  };
}

/** 策略 × 分类器 → 这一帧输出侧该怎么做。**所有消费者只读这个**，不各自再判一次 */
export interface FramingDecision {
  policy: FramingPolicy;
  mode: FramingMode;
  /** 舞台相机的景别 */
  shot: Shot;
  /** 腿换成站姿（不被低可见度的腿点驱动） */
  holdLegs: boolean;
  /** 「上半身是一个正当的取景」：引导文案与 WRN12 不因为腿在画外而说话 */
  upperIsIntended: boolean;
}

export function decide(policy: FramingPolicy, r: Pick<FramingReading, 'mode'>): FramingDecision {
  if (policy === 'full') {
    // 强制全景只管景别。腿照样听分类器：选了全景的笔记本观众不该因此拿到一双坏腿
    return { policy, mode: r.mode, shot: 'full', holdLegs: r.mode !== 'full', upperIsIntended: false };
  }
  if (policy === 'upper') return { policy, mode: r.mode, shot: 'upper', holdLegs: true, upperIsIntended: true };
  return {
    policy, mode: r.mode,
    shot: r.mode === 'upper' ? 'upper' : 'full',
    // 退后中腿还没进画，先别放开；进画了才是 full
    holdLegs: r.mode !== 'full',
    upperIsIntended: r.mode === 'upper',
  };
}

/** `?framing=` 认的值。认不出来由 `shell/kiosk.ts` 喊一声 */
export const isFramingPolicy = (v: unknown): v is FramingPolicy =>
  typeof v === 'string' && (FRAMING_POLICIES as readonly string[]).includes(v);

// ── 跟随：死区 + 过渡带 + 临界阻尼弹簧 + 夹住 ────────────────────────────────

export interface Follow { x: number; v: number }

export interface FollowParams {
  deadZone: number;
  band: number;
  /** 角频率（1/秒）。临界阻尼：不过冲 */
  omega: number;
  /** |x| 的上限 */
  range: number;
}

/**
 * 误差过死区。`|e| ≤ d → 0`；`d < |e| < d+n → (|e|−d)²/2n`；之后线性（减去 d + n/2）。
 * 三段在接缝处值与斜率都连续 —— 死区边上没有一个"台阶"让画面一顿。
 */
export function deadZone(e: number, d: number, n: number): number {
  const a = Math.abs(e);
  if (!(a > d)) return 0;
  const band = Math.max(1e-9, n);
  const out = a < d + band ? ((a - d) * (a - d)) / (2 * band) : a - d - band / 2;
  return Math.sign(e) * out;
}

/**
 * 一步跟随。**闭式解**，不是欧拉积分：同一段时间切成 60 步和切成 20 步，落到同一个位置
 *（帧率无关 —— 降帧时镜头不会追得更慢或者更弹）。
 */
export function stepFollow(s: Follow, target: number, dt: number, p: FollowParams): Follow {
  const x0 = Number.isFinite(s.x) ? s.x : 0;
  const v0 = Number.isFinite(s.v) ? s.v : 0;
  const t = Number.isFinite(dt) && dt > 0 ? dt : 0;
  const goal = Number.isFinite(target) ? Math.max(-p.range, Math.min(p.range, target)) : x0;
  // 死区作用在"离目标多远"上：人在死区里晃，目标就是自己，弹簧只把余速耗掉
  const aim = x0 + deadZone(goal - x0, p.deadZone, p.band);
  const w = Math.max(1e-6, p.omega);
  const e0 = x0 - aim;
  const k = Math.exp(-w * t);
  const c = v0 + w * e0;
  let x = aim + (e0 + c * t) * k;
  let v = (v0 - w * c * t) * k;
  if (x > p.range) { x = p.range; v = Math.min(0, v); }
  if (x < -p.range) { x = -p.range; v = Math.max(0, v); }
  return { x, v };
}

/** 线性地朝 0 / 1 走，`seconds` 走完全程。景别和腿的混合都用它，外面再套 smoothstep */
export function stepToward(now: number, target: number, dt: number, seconds: number): number {
  const t = Number.isFinite(dt) && dt > 0 ? dt : 0;
  if (!(seconds > 0)) return target;
  const d = target - now;
  const step = t / seconds;
  return Math.abs(d) <= step ? target : now + Math.sign(d) * step;
}

export const smoothstep = (x: number): number => {
  const t = Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));
  return t * t * (3 - 2 * t);
};

// ── 景别：中景的混合 + 跟随 ──────────────────────────────────────────────────

export interface ShotState {
  /** 0 = 全景，1 = 中景（线性进度，用的时候套 smoothstep） */
  progress: number;
  fx: Follow;
  fy: Follow;
}

export const SHOT_REST: ShotState = { progress: 0, fx: { x: 0, v: 0 }, fy: { x: 0, v: 0 } };

export interface ShotInput {
  shot: Shot;
  /** 上半身相对静止站姿的偏移（米）：x = 胸口横向，y = 头的高度差。null = 这一帧没有骨架 */
  offset: { x: number; y: number } | null;
  /** `prefers-reduced-motion` */
  reduced: boolean;
  /**
   * 帧循环在降级 / 无人降帧（治理那条线在砍工作量）。**保持当前镜头，不做动画**：
   * 景别变化直接切到位，跟随冻结。画面不动永远比画面卡着动好。
   */
  hold: boolean;
}

/**
 * 一步景别。时间与状态驱动，**不依赖任何 CSS 过渡或动画结束事件**
 *（ui/controls.css、shell/notice.css 里写着的 1.7 fps 教训：静止态不许等一段动画走完才成立）。
 */
export function stepShot(s: ShotState, input: ShotInput, dt: number): ShotState {
  const target = input.shot === 'upper' ? 1 : 0;
  if (input.hold) return { progress: target, fx: { x: s.fx.x, v: 0 }, fy: { x: s.fy.x, v: 0 } };
  const secs = input.reduced ? AUTOFRAME.shotSecondsReduced : AUTOFRAME.shotSeconds;
  const progress = stepToward(s.progress, target, dt, secs);
  const T = AUTOFRAME;
  // 减少动态：中景不跟随，偏移收回 0（一个固定机位的中景）。全景同样收回 0 —— 等身机位是不动的
  const follow = target === 1 && !input.reduced && input.offset;
  const gx = follow ? input.offset!.x : 0;
  const gy = follow ? input.offset!.y : 0;
  if (input.reduced) return { progress, fx: { x: 0, v: 0 }, fy: { x: 0, v: 0 } };
  // 回全景时不要死区：死区会让偏移停在离 0 还有 4cm 的地方，下一次进中景就从一个旧偏移起步
  const base = follow
    ? { deadZone: T.followDeadZone, band: T.followBand, omega: T.followOmega }
    : { deadZone: 0, band: 1e-6, omega: T.followOmega };
  return {
    progress,
    fx: stepFollow(s.fx, gx, dt, { ...base, range: T.followRangeX }),
    fy: stepFollow(s.fy, gy, dt, { ...base, range: T.followRangeY }),
  };
}

// ── 小屏数字裁切 ────────────────────────────────────────────────────────────

export interface Crop {
  /** 放大倍数，1 = 整幅 */
  zoom: number;
  /** 窗口中心（画面归一化坐标） */
  cx: Follow;
  cy: Follow;
  z: Follow;
}

export const CROP_FULL: Crop = { zoom: 1, cx: { x: 0.5, v: 0 }, cy: { x: 0.5, v: 0 }, z: { x: 1, v: 0 } };

export interface CropInput {
  /** 上半身是正当取景（`FramingDecision.upperIsIntended`） */
  active: boolean;
  /**
   * 诚实规则：出画、退后中、任何告警（小屏的状态不是 `ok`）→ **当帧**退回整幅。
   * 让画框的边重新可见，那正是「往后退一点」的证据（docs/49 §3 用法 B）。
   */
  snap: boolean;
  /** 这一帧的 screen 坐标（原始，滤波之前 —— 和小屏同一份） */
  screen: readonly Landmark[] | undefined;
}

/** 上半身的中心：两肩中点和鼻子之间（可信点的平均）。量不到 = null */
export function upperCenter(screen: readonly Landmark[] | undefined): { x: number; y: number } | null {
  if (!screen?.length) return null;
  const pts = [NOSE, SHOULDER_L, SHOULDER_R].map((i) => screen[i]).filter((l): l is Landmark => trustedLandmark(l) && inFrame(l));
  if (pts.length < 2) return null;
  return {
    x: pts.reduce((a, l) => a + l.x, 0) / pts.length,
    // 往下挪一点：上半身取景要把胸口放在中心附近，而不是把鼻子放在正中
    y: pts.reduce((a, l) => a + l.y, 0) / pts.length + 0.08,
  };
}

export function stepCrop(c: Crop, input: CropInput, dt: number): Crop {
  if (input.snap) return CROP_FULL;
  const T = AUTOFRAME;
  const center = input.active ? upperCenter(input.screen) : null;
  const wantZoom = input.active && center ? T.previewZoom : 1;
  const z = stepFollow(
    { x: c.z.x - 1, v: c.z.v }, wantZoom - 1, dt,
    { deadZone: 0, band: 1e-6, omega: T.previewOmega, range: Math.max(0, T.previewZoom - 1) },
  );
  const zoom = 1 + z.x;
  // 窗口不许伸出画面：中心夹在 [0.5/zoom, 1 − 0.5/zoom]。用 range 表达成"离 0.5 最多多远"
  const range = Math.max(0, 0.5 - 0.5 / Math.max(1, T.previewZoom));
  const p = { deadZone: T.previewDeadZone, band: T.previewBand, omega: T.previewOmega, range };
  const gx = center ? center.x - 0.5 : 0;
  const gy = center ? center.y - 0.5 : 0;
  const fx = stepFollow({ x: c.cx.x - 0.5, v: c.cx.v }, gx, dt, p);
  const fy = stepFollow({ x: c.cy.x - 0.5, v: c.cy.v }, gy, dt, p);
  const lim = 0.5 - 0.5 / zoom;
  const clamp = (v: number): number => Math.max(-lim, Math.min(lim, v));
  return {
    zoom,
    cx: { x: 0.5 + clamp(fx.x), v: fx.v },
    cy: { x: 0.5 + clamp(fy.x), v: fy.v },
    z: { x: zoom, v: z.v },
  };
}
