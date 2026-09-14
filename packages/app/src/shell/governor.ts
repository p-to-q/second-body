/**
 * 帧调速器 —— stub：先把接口立住，让守卫先红（docs/15 §6.8）。
 */
export type GovernorStep = 'ink' | 'swaps' | 'inference' | 'post' | 'dpr' | 'ui';

export const GOVERNOR_LADDER: readonly GovernorStep[] = ['ink', 'swaps', 'inference', 'post', 'dpr', 'ui'];

export interface GovernorSample {
  now: number;
  frameMs: number;
  visible: boolean;
  longTasks?: number;
}

export interface GovernorDecision {
  level: number;
  changed: -1 | 0 | 1;
  step: GovernorStep | null;
}

export interface Governor {
  sample(s: GovernorSample): GovernorDecision;
  readonly level: number;
  sheds(step: GovernorStep): boolean;
  readonly refreshMs: number;
  readonly jank: number;
  reset(): void;
}

export function createGovernor(): Governor {
  return {
    sample() { return { level: 0, changed: 0, step: null }; },
    get level() { return 0; },
    sheds() { return false; },
    get refreshMs() { return 0; },
    get jank() { return 0; },
    reset() {},
  };
}
