/**
 * 第 I 乐章的名字：跟随。原作《Future You》的行为。
 *
 * 它是 Director 的兜底，任何别的玩法出问题时都回落到这里。
 * docs/44 §6 之后它不再是一套自己的逻辑，是那条线（`acts/act.ts` 的 `playLine`）
 * 在第 I 个地名上的样子：三个数全是 0，输出就是观众的骨架本身。
 */
import type { Act } from './act.ts';
import { playLine } from './act.ts';

export const follow: Act = {
  id: 'follow',
  label: '跟随',
  kind: 'body',
  weight: 3,
  minSeconds: 25,
  update(w, dt, ctx) { playLine(w, dt, 0, ctx); },
};
