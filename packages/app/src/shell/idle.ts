/**
 * 无人降帧（docs/09 §C「电脑过热降频」那一行的前半段）。
 *
 * 装置一开就是一整天，其中大部分时间前面没有人。满帧渲染一个没人看的画面
 * 只会换来一件事：机器烧热 → 降频 → **等真有人站上来时反而卡**。
 * 所以：没人超过 `IDLE.afterSeconds` 就把渲染降到 `IDLE.fps`，有人/有操作立刻满血。
 *
 * 谁来喂信号：
 *  - `notePresence()` 由两个 Capture 实现调用 —— "有没有人"这件事只有采集端知道，
 *    所以让它顺手上报，调用方（main.ts）一行都不用改。
 *  - `noteActivity()` 由 kiosk 的指针/键盘监听调用 —— 现场调试的人一动鼠标就该恢复满帧。
 *
 * 谁来用：`safe-frame.ts` 的帧循环（跳帧发生在那里，不在这里）。
 *
 * ⚠️ 阈值是本模块的局部常量，**没有**进 `core/tuning.ts`。
 * 理由是任务卡明确要求"要加旋钮就停下来报告"（见交付报告的 Risks）。
 * 它确实属于"现场要调的数"，等收口的人点头再搬过去。
 */

export const IDLE = {
  /** 没人这么久就降帧（秒） */
  afterSeconds: 300,
  /** 降帧后的目标帧率。10fps 足够让 IDLE 呼吸动画还是"活的"，但 GPU 基本在歇着 */
  fps: 10,
};

let lastAlive = 0;
/** 还没收到过任何信号时不降帧：宁可多烧一会儿，也不要在没接线的页面上莫名其妙变慢 */
let armed = false;

/** 采集端每次拿到（或确认没有）姿态时调用 */
export function notePresence(personVisible: boolean, now = performance.now()): void {
  armed = true;
  if (personVisible) lastAlive = now;
}

/**
 * 有人碰了鼠标/键盘 —— 现场调试时立刻恢复满帧。
 * 故意**不**设 `armed`：一个只有鼠标、没有采集的页面（dev 工具）不该因为"很久没人动鼠标"
 * 就自己变慢。武装降帧的权力只在采集端。
 */
export function noteActivity(now = performance.now()): void {
  lastAlive = now;
}

export interface IdleState {
  /** 是否正在降帧 */
  throttled: boolean;
  /** 已经多久没人了（秒） */
  seconds: number;
  /** 降帧时的目标帧率 */
  fps: number;
}

export function idleState(now = performance.now()): IdleState {
  if (!armed) return { throttled: false, seconds: 0, fps: IDLE.fps };
  const seconds = (now - lastAlive) / 1000;
  return { throttled: seconds >= IDLE.afterSeconds, seconds, fps: IDLE.fps };
}

/** 测试用：把计时器摆回初始状态 */
export function resetIdle(): void {
  lastAlive = 0;
  armed = false;
}
