/**
 * 基线玩法：身体跟随你。原作《Future You》的行为。
 *
 * 它的 `canEnter` 永远为真 —— 它是 Director 的兜底，任何别的玩法出问题时都回落到这里。
 * 所以这个文件要**尽可能无聊**：没有条件、没有状态、没有花招。
 */
import type { Act } from './act.ts';

export const follow: Act = {
  id: 'follow',
  label: '跟随',
  kind: 'body',
  weight: 3,
  minSeconds: 25,
  update(w, dt) {
    if (w.skeleton) w.creature.pose(w.skeleton, w.presence, dt);
  },
};
