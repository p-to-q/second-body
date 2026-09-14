/**
 * 帧循环停摆的看门狗 —— docs/48 §10.6 的兜底。
 *
 * 实测（2026-09-14）：展签 → 选择页 → 舞台 → 按「摄像头」，约 2.3 秒后页面不再出帧（无头与有窗口的 Chrome 都复现），
 * 而 JS 还活着：定时器照走、`Debugger.pause` 有应答，只是新的 rAF 永远不回调。调速器住在帧循环里，
 * 帧停了它也停 —— 应用里没有任何东西发现这件事，观众看到的是一张冻住的画面。
 *
 * 根因没追到（线索写在 docs/48 §10.6）。这一层**不修根因**，只保证冻住的画面不会一直冻着：
 * 用**不依赖 rAF 的定时器**判停摆，停摆就交给 `degradeTo('reload')` —— 它有每会话两次的上限，
 * 不会重载成死循环；用完之后保持现状。
 */

/** 页面看得见、却这么久没有一帧，就算停摆。长到一次真实的长任务（实测最坏约 1 秒）不会被误判 */
export const STALL_MS = 4000;

/** 多久看一次。看门狗自己不该变成负担 */
const CHECK_MS = 1000;

export interface StallInput {
  /** 帧循环开跑过（加载阶段本来就没有帧，不算停摆） */
  started: boolean;
  /** 页面看得见。后台标签页浏览器本来就不出帧 */
  visible: boolean;
  /** 最后一帧的时刻（`performance.now()` 毫秒） */
  lastFrameAt: number;
  now: number;
}

/** 纯函数：此刻算不算停摆 */
export function isStalled(s: StallInput): boolean {
  if (!s.started || !s.visible) return false;
  if (!Number.isFinite(s.lastFrameAt) || !Number.isFinite(s.now)) return false;
  return s.now - s.lastFrameAt > STALL_MS;
}

export interface StallWatch {
  /** 帧循环每帧调一次 */
  frame(nowMs: number): void;
  dispose(): void;
}

/**
 * 挂上看门狗。`onStall` 只会被调一次（之后看门狗自己停），由调用方决定怎么恢复。
 * 切回前台时把"最后一帧"重置成此刻：后台期间没有帧不是停摆，回来的第一秒也不该被当成停摆。
 */
export function watchStall(onStall: (sinceMs: number) => void): StallWatch {
  let last = Number.NaN;
  let fired = false;
  const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const visible = (): boolean => typeof document === 'undefined' || document.visibilityState === 'visible';
  const onVisibility = (): void => { if (visible() && Number.isFinite(last)) last = now(); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
  const timer = setInterval(() => {
    const t = now();
    if (fired || !isStalled({ started: Number.isFinite(last), visible: visible(), lastFrameAt: last, now: t })) return;
    fired = true;
    clearInterval(timer);
    onStall(t - last);
  }, CHECK_MS);
  return {
    frame(nowMs) { last = nowMs; },
    dispose() {
      clearInterval(timer);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
