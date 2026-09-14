/**
 * 调速器 → 已经存在的开关。stub（先红）。
 */
import type { GovernorStep } from './governor.ts';

export type GovernorTargets = Record<GovernorStep, (shed: boolean) => void>;

export const GOVERNOR_SWITCHES: Record<GovernorStep, string> = {
  ink: '', swaps: '', inference: '', post: '', dpr: '', ui: '',
};

export function wireGovernor(_targets: GovernorTargets): (level: number) => void {
  return () => {};
}
