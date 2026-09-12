/**
 * 玩法登记处。**加一个新玩法就在这里加一行，没有别的步骤**（docs/16 §6）。
 * 数组顺序不影响选择（选择按 weight 随机），只影响可读性。
 */
import type { Act } from './act.ts';
import { follow } from './follow.ts';
import { echo } from './echo.ts';

export const ACTS: readonly Act[] = [
  follow,   // 兜底，canEnter 永远为真
  echo,     // 延迟 1.2s 的自己
];

export type { Act, World, Director } from './act.ts';
export { createDirector } from './act.ts';
