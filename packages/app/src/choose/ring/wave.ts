/**
 * 举手滚动 —— 选择页唯一一条**不需要任何输入设备**的输入（docs/23 §S2、docs/10）。
 *
 * 现场没有鼠标、没有触控板、没有键盘。在这之前，一个人站在装置前面**没有任何办法
 * 翻看名单**：他只能等 30 秒，然后被随机塞一具身体。这个文件补的就是那一条。
 *
 * ## 这是纯函数（P1）
 *
 * 没有 DOM、没有时钟、没有随机、没有摄像头。进来的是**已经换算好的世界坐标**
 * （米，Y-up，已镜像 —— 换算只发生在 `core/skeleton.ts` 的 `mediapipeToWorld()`，P4），
 * 出去的是两个数：给环的角速度增量，和给观众看的"我醒了"强度。
 * 采样、帧循环、以及把它接到环上，全在 `wave-input.ts`。
 *
 * ## 为什么是"一只手举过肩 + 横向挥"
 *
 * 用的是 MediaPipe **PoseLandmarker**，不是 hand 模型 —— 一根手指都没有
 * （`core/skeleton.ts` 的 `LM` 表就是全部：鼻、耳、肩、肘、腕、髋、膝、踝、跟、脚尖，
 * 外加 pinky / index 两个**手掌上的粗点**，它们跟着手腕走，捏合张开一概看不见）。
 * 所以手势只能由**大关节的相对位置**构成，这一条是硬边界，不是选择。
 *
 * 剩下的判断是：**怎样才不会误触发**。一个会被路人走过就转起来的装置，
 * 比一个根本不会转的装置更糟 —— 后者只是少一个功能，前者是"它自己有主意"。
 * 三道闸，每一道挡的是一类具体的人：
 *
 *  1. **手腕高过同侧肩**（`raise` = 0.10 m）。挡的是「边说话边比划的人」：
 *     交谈手势几乎全部发生在胸口到腰之间，手腕越过肩线是一个**刻意**的姿势。
 *     0.10 m 不是拍脑袋 —— world landmark 的腕点噪声是厘米级，
 *     再加上肩点本身随呼吸起伏，阈值必须比这两者之和明显大。
 *  2. **连续保持 0.75 秒**。挡的是「走过去的路人」：走路时手臂在摆，
 *     单侧手腕能越过肩线的时刻是几十毫秒级的，撑不到 0.75 秒；
 *     而一个真想操作它的人，把手举起来停住这件事本来就要花这么久。
 *     再长（比如 1.5 秒）就会变成"我举着手它没反应"，那是另一种坏。
 *  3. **只能有一只手举着**。挡的是「伸懒腰 / 打哈欠 / 举双手拍照」：
 *     双手同时过肩是一个**姿势**，不是一个**操作**。这一条几乎不花钱，
 *     却把最常见的一类假阳性整类切掉。
 *
 * 松开那一侧留了迟滞：掉到肩线**以下** 0.02 m 才算放手（12 cm 的滞回带），
 * 再加 0.35 秒的宽限期（追踪闪断一帧不该把人踢下来 —— 和 `core/refine.ts`
 * 的遮挡保持是同一条道理）。没有迟滞的话，手停在肩线附近会以 30Hz 反复上下电。
 *
 * ## 为什么横向挥，而屏幕上的卡片是竖着走的
 *
 * 环大半在屏幕外、环心在左边一整个视口宽的地方（`RING.posX = -2`），
 * 所以正面那张卡的切线方向**是竖直的** —— 卡片在屏幕上是上下走的。
 * 按"跟着画面走"的直觉，手势该是上下挥。**但上下和第 1 道闸直接打架**：
 * 手往下挥就是放手，往上挥立刻碰到人的行程上限（肩到举直只有半米，
 * 而且是全程举着的，几秒就酸）。横向的可用行程是它的两倍，
 * 而且完全落在"手保持在肩线以上"这个条件的安全区里。
 *
 * 所以这里选了**横向**，并且把方向对齐到阅读顺序：**手往右 = 往后翻**
 * （等价于滚轮往下、等价于名单往前走一格）。屏幕上的运动方向和手的方向不一致，
 * 这件事由「软化跟着手走」补偿：手一举起来，环上就出现一团跟着手动的软化
 * （见 `charge` / `offset`），观众先看见"它认得我"，再去发现"它往哪边走"。
 *
 * ## 这些数该住在哪里
 *
 * ⚠️ 下面的 `WAVE` **应该在 `packages/core/src/tuning.ts` 里**（AGENTS.md：
 * 每个可调的数都住在那儿）。`tuning.ts` 是冻结契约，本条泳道不许动它 ——
 * 已在收尾报告里按「需要变更契约」上报，由契约所有者搬过去。
 * 在那之前它们是本文件的局部常量，和 `shell/idle.ts` 的 300s/10fps 同一个处境。
 */

/** 一只手这一帧的读数。坐标已经是世界系（米，Y-up，已镜像） */
export interface HandSample {
  /** 手腕 x。+X = 观众在**镜子里**往右 */
  x: number;
  /** 手腕 y */
  y: number;
  /** **同侧**肩的 y。用同侧而不是两肩平均：侧身站的人两肩高度差得很多 */
  shoulderY: number;
  /** 这一帧这只手可不可信（visibility / 有限性，由采样端判定） */
  ok: boolean;
}

export interface WaveInput {
  left: HandSample;
  right: HandSample;
}

export type WavePhase = 'idle' | 'arming' | 'armed';

export interface WaveOut {
  phase: WavePhase;
  /** 蓄势进度 0..1。**这就是"它醒了"的可见强度**，1 = 已经能滚 */
  charge: number;
  /** 交给环的角速度增量（弧度/秒 的增量，和滚轮喂的是同一种东西）。未武装时恒为 0 */
  spin: number;
  /** 手相对举起来那一刻的横向偏移，钳在 -1..1。给视觉信号定位用 */
  offset: number;
  /** 此刻是哪只手在开。null = 没人在开 */
  hand: 'left' | 'right' | null;
}

export const WAVE = {
  /** 手腕要高过同侧肩多少米才算"举起来"。挡交谈手势 */
  raise: 0.10,
  /** 掉到肩线以下多少米才算"放下"。和 raise 一起构成 12cm 的滞回带 */
  drop: 0.02,
  /** 举着不动多久才武装（秒） */
  holdSeconds: 0.75,
  /** 手丢了之后还认多久（秒）。追踪闪断不该把人踢下来 */
  releaseSeconds: 0.35,
  /**
   * 米 → 弧度。0.6 m 的一次挥手大约推进 4 个槽位：
   * 冲量总和 0.6×5 = 3 rad/s，按环的阻尼（`RING.damping` 0.94/帧 ⇒ 衰减 ≈ 3.7/s）
   * 滑行 3/3.7 ≈ 0.81 rad ≈ 29 张卡里的 3.7 个槽位。
   * 改卡片数不用改它 —— 改的是"一次挥手走几张"，那本来就该跟着名单长度变。
   */
  gain: 5,
  /** 低于这个速度（米/秒）当作没动。手举着不动时的抖动不该让名单慢慢漂 */
  minSpeed: 0.12,
  /** 一帧位移超过这个（米）判定为追踪跳变，丢掉。30Hz 下 0.2m = 6 m/s，人办不到 */
  maxStep: 0.20,
  /** 手腕 x 的平滑系数（每 60fps 帧朝测量值走的比例） */
  smooth: 0.35,
  /** 视觉信号的满行程：手横向偏移多少米算 offset = ±1 */
  reach: 0.55,
} as const;

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** 朝目标松弛的系数，按 60fps 写、按真实帧时间校正（和 `field.ts` 的 `chase` 同一条） */
const chase = (dt: number, rate: number): number => 1 - Math.pow(1 - rate, dt * 60);

/** 非有限的输入一律当作"这一帧没有这只手"（P2：外部输入全部不可信） */
const finite = (h: HandSample): boolean =>
  h.ok && Number.isFinite(h.x) && Number.isFinite(h.y) && Number.isFinite(h.shoulderY);

export interface WaveReader {
  /** 推进一帧。`input` 为 null = 这一帧没有人 / 分数太低 */
  update(input: WaveInput | null, dt: number): WaveOut;
  reset(): void;
}

const IDLE_OUT: WaveOut = { phase: 'idle', charge: 0, spin: 0, offset: 0, hand: null };

/**
 * 状态机 + 速度映射。整个手势逻辑就这一个工厂，外面只剩采样和接线。
 *
 * 状态只有三个，转移只有四条：
 * ```
 *   idle ──(一只手过肩)──> arming ──(连续 0.75s)──> armed
 *     ^                        |                      |
 *     └────(丢失 > 0.35s)──────┴──────────────────────┘
 * ```
 */
export function createWaveReader(params: typeof WAVE = WAVE): WaveReader {
  let phase: WavePhase = 'idle';
  let hand: 'left' | 'right' | null = null;
  /** 已经举了多久（秒）。charge = hold / holdSeconds */
  let hold = 0;
  /** 丢了多久（秒）。宽限期内 hold 冻住不动，不衰减 —— 见文件头 */
  let lost = 0;
  /** 平滑之后的手腕 x */
  let smoothX = 0;
  let prevX = 0;
  /** 举起来那一刻的 x，`offset` 从这里量 */
  let anchorX = 0;

  const out: WaveOut = { ...IDLE_OUT };

  function reset(): void {
    phase = 'idle';
    hand = null;
    hold = 0;
    lost = 0;
    smoothX = 0;
    prevX = 0;
    anchorX = 0;
    Object.assign(out, IDLE_OUT);
  }

  /** 这只手此刻算不算"举着"。已经在开的那只用较低的门槛（滞回） */
  function raised(h: HandSample, holding: boolean): boolean {
    if (!finite(h)) return false;
    return h.y > h.shoulderY + (holding ? -params.drop : params.raise);
  }

  return {
    reset,
    update(input, dt) {
      // 帧时间同样是不可信输入：后台标签页会给出好几秒，负数来自换了一次时钟
      const step = Number.isFinite(dt) ? clamp(dt, 0, 0.1) : 0;

      let pick: 'left' | 'right' | null = null;
      let sample: HandSample | null = null;
      if (input) {
        const holdingL = hand === 'left' && phase !== 'idle';
        const holdingR = hand === 'right' && phase !== 'idle';
        const up = {
          left: raised(input.left, holdingL),
          right: raised(input.right, holdingR),
        };
        // 双手都举着 = 伸懒腰 / 拍照 / 举双手欢呼，**不是操作**。整类切掉。
        if (up.left && up.right) pick = null;
        else if (up.left) pick = 'left';
        else if (up.right) pick = 'right';
        // 已经在开的那只手还举着就不换手 —— 换手要重新蓄势，
        // 否则一次擦汗就能把正在滚的名单交接给另一只手
        if (pick && hand && phase !== 'idle' && pick !== hand) pick = null;
        sample = pick ? input[pick] : null;
      }

      if (!sample) {
        lost += step;
        if (lost > params.releaseSeconds) {
          reset();
          return out;
        }
        // 宽限期内：状态和蓄势都冻住，但**一步都不滚**。
        // 视觉上的淡出交给环自己的 `cursor.amt` 松弛，这里不再自己做一条曲线。
        out.phase = phase;
        out.charge = phase === 'idle' ? 0 : clamp(hold / params.holdSeconds, 0, 1);
        out.spin = 0;
        out.hand = hand;
        return out;
      }

      lost = 0;
      if (hand !== pick) {
        // 新的一只手：从零开始蓄势，位置直接落位（不平滑），否则第一帧会读出一个
        // 从上一只手横扫过来的巨大位移
        hand = pick;
        hold = 0;
        smoothX = sample.x;
        prevX = sample.x;
        anchorX = sample.x;
        phase = 'arming';
      }

      hold += step;
      const charge = clamp(hold / params.holdSeconds, 0, 1);
      phase = charge >= 1 ? 'armed' : 'arming';

      smoothX += (sample.x - smoothX) * chase(step, params.smooth);
      let dx = smoothX - prevX;
      prevX = smoothX;

      // 追踪跳变（换人、闪断之后重新锁定）会给出一个巨大的一帧位移。
      // 它读起来和一次极快的挥手一模一样，所以只能靠"人办不到"来判 —— 见 maxStep。
      if (!Number.isFinite(dx) || Math.abs(dx) > params.maxStep) dx = 0;
      // 举着不动的手也在抖。没有这条死区，名单会自己慢慢漂 ——
      // 而"没人碰它它自己在动"是这一页最坏的一种表现。
      if (step > 0 && Math.abs(dx) / step < params.minSpeed) dx = 0;

      out.phase = phase;
      out.charge = charge;
      // 未武装时一步都不滚：蓄势那 0.75 秒里观众看到的是"它醒了"，不是"它动了"
      out.spin = phase === 'armed' ? dx * params.gain : 0;
      out.offset = clamp((smoothX - anchorX) / params.reach, -1, 1);
      out.hand = hand;
      return out;
    },
  };
}
