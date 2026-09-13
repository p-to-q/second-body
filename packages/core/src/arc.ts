/**
 * 会话弧线状态机。规格见 `docs/40-SESSION-ARC.md`，数值在 `tuning.ts` 的 `ARC` 块。
 *
 * ── 它是什么 ────────────────────────────────────────────────────────────────
 * 一条时间轴，四个乐章，对齐作品陈述的前四句：
 *
 *   SEE ME → SEE U → NOT ME → BUT U
 *   follow   echo    resist   facing
 *
 * 进：时间 + 在不在场。出：第几乐章、段内进度、该演哪个玩法、还有多久到下一段。
 * **纯函数式**：dt 从外面递进来，不读时钟、不摇骰子、不碰 three、不碰 DOM，
 * 所以整条弧线可以在 `node --test` 里几毫秒走完三分钟（P1）。
 *
 * ── 时间是主轴，动作是加速项 ────────────────────────────────────────────────
 * 这个文件里**一个运动量都不读**，这是故意的：一个站着不动的人也在经历这条弧线，
 * 只是零件换得慢一点。运动量那一半留在 `evolution.ts`，由收口的人取两者的较大值 ——
 * 动得多的人可以**提前**升档，但没有人可以因为不动而被卡在 tier 0（docs/40 §4）。
 *
 * ── 归零 ────────────────────────────────────────────────────────────────────
 * 「人一走就归零」是这条线上最容易坏的地方（docs/40 §3）：不归零的话第二个观众
 * 站上去看到的是一具从第一秒就不跟随他的身体 —— 那不是艺术效果，那是坏了，
 * 而且是看不出来的那种坏。判定"人走了"用**已有的** `Presence`（`arcPresent()`
 * 把它折成一个布尔），这里不发明第二套检测。
 */
import { ARC as ARC_TUNING, TIME } from './tuning.ts';
import type { Presence, Tier } from './types.ts';

export { ARC_TUNING };

/**
 * 四个乐章各自的玩法 id，**顺序就是 docs/40 §1 那张表的顺序**。
 *
 * `untether`（把身体还回去）**不在这里，永远不会在这里**：它是唯一一个由观众按出来的
 * 玩法，`canEnter` 恒为 false，只由右下角那一行和 `?act=` 进来（docs/16 §7）。
 * 弧线排不到它 —— 这条由 `arc.test.ts` 钉住。
 */
export const ARC_ACTS = ['follow', 'echo', 'resist', 'facing'] as const;
export type ArcActId = (typeof ARC_ACTS)[number];

/** 0 = 第 I 乐章跟随，3 = 第 IV 乐章朝向 */
export type MovementIndex = 0 | 1 | 2 | 3;

/** 乐章的罗马数字，给 HUD 看。`I` 比 `0` 少一次心算 */
export const MOVEMENT_NUMERALS = ['I', 'II', 'III', 'IV'] as const;

/**
 * 四个乐章的名字。**取自作品陈述那句话，不是我另起的**（docs/40 §1）：
 * SEE ME · SEE U · NOT ME · BUT U —— 五个短句的前四句。
 * 只出现在 `?debug=1` 的 HUD 上：观众那一侧不该看见任何一段的名字，
 * 更不该看见进度（docs/40 §5 / docs/26 §F 的反面清单）。
 */
export const MOVEMENT_LABELS = ['跟随', '回声', '抵抗', '朝向'] as const;

export interface ArcState {
  /** 第几乐章，0..3 */
  movement: MovementIndex;
  /** 这一乐章该演哪个玩法 */
  actId: ArcActId;
  /** 本乐章内的进度 0..1 */
  progress: number;
  /** 整条弧线的进度 0..1 */
  overall: number;
  /** 这一场走了多少秒（人不在时停表，见 `running`） */
  elapsed: number;
  /** 还有多久到下一乐章（秒）。已经在最后一段并且保持时为 Infinity */
  timeToNext: number;
  /** 刚换过段的那一帧为 true —— 上层据此接升档音与形态事件 */
  movementChanged: boolean;
  /**
   * 交接的交叉淡入 0..1：进入本段头 `ARC.crossfade` 秒内从 0 爬到 1。
   * 第 I 乐章恒为 1 —— 它没有上一段可以淡出，给 0 会让开场凭空多一次淡入。
   */
  blend: number;
  /** 走完了，停住（`ARC.holdAtEnd`）。不循环也不继续升级 */
  held: boolean;
  /** 这一帧弧线在不在走。人不在 = 停表，不是倒退 */
  running: boolean;
  /**
   * 弧线给出的档位：**等于乐章序号**。
   * 第 I 乐章 tier 0（还没分化出零件的那一具），第 IV 乐章 tier 3。
   * 它是**下限**不是定值 —— 运动量可以把它推高，见文件头。
   */
  tier: Tier;
  /** 人离开了多少秒。到 `ARC.resetAfter` 的那一帧归零 */
  away: number;
  /** 这一帧归零了：上一场结束，下一个人从 0:00 开始 */
  justReset: boolean;
}

export interface ArcMachine {
  update(present: boolean, dt: number): ArcState;
  readonly state: ArcState;
  /** 整条弧线用多少秒（`?arc=` 覆盖之后就是那个数） */
  readonly total: number;
  /** 四段各自的结束时刻（秒，累计）。HUD 与测试用 */
  readonly bounds: readonly number[];
  reset(): void;
}

/**
 * 把 `Presence` 折成"这一刻有没有人"。
 *
 * `ENTERING` 算有人：那两秒观众已经站在那儿了，只是身体还在长出来 ——
 * 让弧线在这时候还停着表，等于把开场的一秒半送给了上一个人。
 * `LEAVING` 算没人：它是"检测已经丢了"之后的那段离场动画，宽限由
 * `ARC.resetAfter` 统一负责，不在这里再加一层。
 */
export function arcPresent(p: Presence | null | undefined): boolean {
  return p?.state === 'ALIVE' || p?.state === 'ENTERING';
}

/**
 * 四段的结束时刻（累计秒）。`beats` 是比例不是秒数，所以这里做一次归一化 ——
 * 比例之和不是 1 也照样工作，改 `total` 一个数四段一起缩放。
 */
export function movementBounds(
  total: number = ARC_TUNING.total,
  beats: readonly number[] = ARC_TUNING.beats,
): number[] {
  const safe = beats.map((b) => (Number.isFinite(b) && b > 0 ? b : 0));
  const sum = safe.reduce((a, b) => a + b, 0);
  // 四段全填了 0 / NaN：退回等分，而不是让整条弧线除以零（P2）
  const use = sum > 0 ? safe : safe.map(() => 1);
  const denom = sum > 0 ? sum : safe.length || 1;
  const out: number[] = [];
  let acc = 0;
  for (const b of use) { acc += (b / denom) * total; out.push(acc); }
  // 浮点累加的尾巴会让最后一段永远差 1e-13 秒走不完
  if (out.length) out[out.length - 1] = total;
  return out;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export interface ArcOptions {
  /** 覆盖 `ARC.total`（`?arc=<秒>`）。非法值按没写过处理 */
  total?: number | null;
}

export function createArc(opt: ArcOptions = {}): ArcMachine {
  const total = Number.isFinite(opt.total) && (opt.total as number) > 0
    ? (opt.total as number)
    : ARC_TUNING.total;
  const bounds = movementBounds(total, ARC_TUNING.beats);
  const last = (bounds.length - 1) as MovementIndex;

  let elapsed = 0;
  let away = 0;
  let movement: MovementIndex = 0;
  let movementChanged = false;
  let justReset = false;
  let running = false;

  function movementAt(t: number): MovementIndex {
    for (let i = 0; i < bounds.length; i++) if (t < bounds[i]) return i as MovementIndex;
    return last;
  }

  function snapshot(): ArcState {
    const start = movement === 0 ? 0 : bounds[movement - 1];
    const end = bounds[movement];
    const span = Math.max(1e-6, end - start);
    const held = ARC_TUNING.holdAtEnd && elapsed >= total;
    const inMovement = elapsed - start;
    return {
      movement,
      actId: ARC_ACTS[movement],
      progress: clamp01(inMovement / span),
      overall: clamp01(elapsed / Math.max(1e-6, total)),
      elapsed,
      timeToNext: movement === last ? (held ? Infinity : Math.max(0, total - elapsed))
        : Math.max(0, end - elapsed),
      movementChanged,
      blend: movement === 0 ? 1 : clamp01(inMovement / Math.max(1e-6, ARC_TUNING.crossfade)),
      held,
      running,
      tier: movement as Tier,
      away,
      justReset,
    };
  }

  function hardReset(): void {
    elapsed = 0; away = 0; movement = 0;
  }

  return {
    get total() { return total; },
    get bounds() { return bounds; },
    update(present, dt) {
      dt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, TIME.dtMax) : 1 / 60;
      movementChanged = false;
      justReset = false;

      if (present) {
        away = 0;
        running = true;
        elapsed += dt;
        if (elapsed >= total) {
          // 走完之后停住。`holdAtEnd:false` 只有调试会想要 —— 那时从头再来，
          // 而不是无限升级（弧线之外没有第五个乐章）
          if (ARC_TUNING.holdAtEnd) { elapsed = total; running = false; }
          else elapsed -= total;
        }
      } else {
        running = false;
        away += dt;
        // 宽限用完：这一场结束了。**不是把时钟往回调，是把这一场丢掉** ——
        // 收口的人看见 justReset 会连种子、演化、缓冲一起换掉（docs/40 §3）
        if (away >= ARC_TUNING.resetAfter && (elapsed > 0 || movement !== 0)) {
          hardReset();
          justReset = true;
        }
      }

      const want = movementAt(elapsed);
      if (want !== movement) { movement = want; movementChanged = true; }
      return snapshot();
    },
    get state() { return snapshot(); },
    reset() { hardReset(); running = false; movementChanged = false; justReset = false; },
  };
}
