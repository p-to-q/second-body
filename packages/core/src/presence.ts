/**
 * 在场状态机。见 docs/05 §5。
 * 全部时间常数在这里，现场调参只改这一块。
 */
import type { Presence, PresenceState } from './types.ts';

export const PRESENCE_TUNING = {
  enterDelay: 0.4,     // 连续检测到多久才算"来了"
  loseDelay: 1.0,      // 连续丢失多久才算"走了"
  enterAnim: 1.2,      // 出生动画时长
  leaveAnim: 2.5,      // 溶解时长
};

export interface PresenceMachine {
  update(detected: boolean, dt: number): Presence;
  readonly current: Presence;
  /** 回到 IDLE 的那一帧为 true —— 上层据此换 seed、清零 charge */
  readonly justReset: boolean;
  reset(): void;
}

export function createPresence(): PresenceMachine {
  let state: PresenceState = 'IDLE';
  let elapsed = 0;
  let hold = 0;          // 连续检测到/丢失的时长
  let justReset = false;

  const machine: PresenceMachine = {
    update(detected, dt) {
      if (!Number.isFinite(dt) || dt <= 0) dt = 1 / 60;
      elapsed += dt;
      justReset = false;
      hold = detected ? Math.max(0, hold) + dt : Math.min(0, hold) - dt;

      const go = (s: PresenceState) => { state = s; elapsed = 0; };

      switch (state) {
        case 'IDLE':
          if (detected && hold >= PRESENCE_TUNING.enterDelay) go('ENTERING');
          break;
        case 'ENTERING':
          if (!detected && -hold >= PRESENCE_TUNING.loseDelay) go('LEAVING');
          else if (elapsed >= PRESENCE_TUNING.enterAnim) go('ALIVE');
          break;
        case 'ALIVE':
          if (!detected && -hold >= PRESENCE_TUNING.loseDelay) go('LEAVING');
          break;
        case 'LEAVING':
          if (detected && hold >= PRESENCE_TUNING.enterDelay) go('ALIVE');   // 短暂走出画面又回来：不清零
          else if (elapsed >= PRESENCE_TUNING.leaveAnim) { go('IDLE'); justReset = true; }
          break;
      }

      const dur = state === 'ENTERING' ? PRESENCE_TUNING.enterAnim
        : state === 'LEAVING' ? PRESENCE_TUNING.leaveAnim : 1;
      const transition = Math.min(1, elapsed / dur);
      return { state, elapsed, transition };
    },
    get current() { return { state, elapsed, transition: 0 }; },
    get justReset() { return justReset; },
    reset() { state = 'IDLE'; elapsed = 0; hold = 0; justReset = false; },
  };
  return machine;
}
