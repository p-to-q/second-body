/**
 * 降级阶梯（docs/02 P3：**降级路径必须存在且被测试过**）。
 *
 * 以前 `safe-frame.ts` 连续出错时只 `console.error` 一行"降级"，然后继续用同样的方式
 * 继续错下去 —— 那不是降级，那是记录自己在崩。这里把它变成真的三级阶梯：
 *
 *   1. `post`        关后期 / 关重特效 —— 最便宜、观众几乎看不出来
 *   2. `placeholder` 回落程序化占位几何 —— 丑，但一定画得出来（AGENTS 不变量）
 *   3. `reload`      重载页面 —— 最后一招，会有 2~3 秒黑场，所以放最后
 *
 * 每一级只在**上一级没救回来**时才走下一级：帧循环每再连续错 N 帧就调一次 `degrade()`，
 * 阶梯自己记着走到哪了。
 *
 * 机制在这里，**动作由各子系统注册**（`registerDegradeHandler`）：
 * 舞台知道怎么关它自己的后期，creature 知道怎么换回占位几何，shell 不该越俎代庖。
 * 没有人注册时这一级仍然是"真的发生了"——状态位翻转 + `sb:degrade` 事件 +
 * `<html data-sb-degrade>` ——只是没人响应；这条边界写在交付报告里。
 */

export type DegradeStage = 'post' | 'placeholder' | 'reload';

/** 阶梯顺序就是"代价从小到大" */
export const DEGRADE_LADDER: readonly DegradeStage[] = ['post', 'placeholder', 'reload'];

export interface DegradeState {
  /** 已经走到第几级（null = 还没降级） */
  stage: DegradeStage | null;
  /** 后期已被关掉。`readFlags().nopost` 会跟着变 true */
  nopost: boolean;
  /** 已经要求回落占位几何 */
  placeholder: boolean;
  /** 触发降级的原因（一般是那条异常消息） */
  reason: string | null;
  /** 已经走完的级数 */
  steps: number;
}

const state: DegradeState = { stage: null, nopost: false, placeholder: false, reason: null, steps: 0 };

const handlers = new Map<DegradeStage, Set<() => void>>();

/**
 * 重载在现场是会被看见的（黑场几秒），所以要防"重载循环"：
 * 一个会话里最多重载这么多次，之后宁可顶着一个坏画面继续跑，也不要每 3 秒黑一次。
 */
const MAX_RELOADS_PER_SESSION = 2;
const RELOAD_KEY = 'sb:degrade:reloads';

/** 默认动作 = 真的重载。测试里换掉它，免得把 test runner 重载了 */
let reloadAction: () => void = () => {
  if (typeof location !== 'undefined') location.reload();
};

/** 只给测试和 dev 页面用：证明第 3 级真的被执行到了，而不用真的重载 */
export function setDegradeReloadAction(fn: () => void): void {
  reloadAction = fn;
}

/** 子系统在这里认领"我知道这一级该做什么"。返回注销函数 */
export function registerDegradeHandler(stage: DegradeStage, fn: () => void): () => void {
  const set = handlers.get(stage) ?? new Set();
  set.add(fn);
  handlers.set(stage, set);
  // 已经降到这一级之后才注册的，立刻补执行一次 —— 否则晚加载的子系统会活在过期的世界里
  if (isDegradedTo(stage)) safely(stage, fn);
  return () => { handlers.get(stage)?.delete(fn); };
}

export function getDegradeState(): Readonly<DegradeState> { return state; }

function isDegradedTo(stage: DegradeStage): boolean {
  if (stage === 'post') return state.nopost;
  if (stage === 'placeholder') return state.placeholder;
  return false;   // reload 是一次性动作，没有"已处于"这回事
}

/**
 * 往下走一级。返回这次执行的那一级；阶梯已经走完（或重载次数用尽）时返回 null。
 * **绝不抛异常** —— 它的调用方是帧循环。
 */
export function degrade(reason: string | null = null): DegradeStage | null {
  const next = DEGRADE_LADDER[state.steps];
  if (!next) return null;

  if (next === 'reload' && reloadBudgetSpent()) {
    console.error('[degrade] 重载次数已用尽，保持现状继续跑（宁可画面坏，不要每几秒黑一次）');
    state.steps++;
    return null;
  }

  state.steps++;
  state.stage = next;
  state.reason = reason;
  if (next === 'post') state.nopost = true;
  if (next === 'placeholder') state.placeholder = true;

  console.error(`[degrade] 第 ${state.steps} 级：${label(next)}${reason ? ` · 起因：${reason}` : ''}`);

  // DOM 上留痕：现场截图 / 自动化验证都靠它看出"降级真的发生了"
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.sbDegrade = next;
    dispatchEvent(new CustomEvent('sb:degrade', { detail: { stage: next, reason } }));
  }

  for (const fn of handlers.get(next) ?? []) safely(next, fn);
  if (next === 'reload') safely(next, reloadAction);

  return next;
}

export function label(stage: DegradeStage): string {
  if (stage === 'post') return '关后期';
  if (stage === 'placeholder') return '回落占位几何';
  return '重载页面';
}

function safely(stage: DegradeStage, fn: () => void): void {
  try { fn(); } catch (e) { console.error(`[degrade] ${stage} 处理器自己炸了：`, e); }
}

function reloadBudgetSpent(): boolean {
  try {
    if (typeof sessionStorage === 'undefined') return false;
    const n = Number(sessionStorage.getItem(RELOAD_KEY) ?? '0') || 0;
    if (n >= MAX_RELOADS_PER_SESSION) return true;
    sessionStorage.setItem(RELOAD_KEY, String(n + 1));
    return false;
  } catch {
    return false;   // 隐私模式下 sessionStorage 会抛；那就别挡着重载
  }
}

/** stub（先红）：直接跳到某一级 */
export function degradeTo(_stage: DegradeStage, _reason: string | null = null): DegradeStage | null {
  return null;
}

/** stub（先红）：WebGPU device lost 之后怎么办 */
export function deviceLostAction(_info: { reason?: string | null } | null | undefined): 'reload' | 'ignore' {
  return 'ignore';
}

/** 测试用 */
export function resetDegrade(): void {
  state.stage = null; state.nopost = false; state.placeholder = false; state.reason = null; state.steps = 0;
  handlers.clear();
  if (typeof document !== 'undefined') delete document.documentElement.dataset.sbDegrade;
  try { sessionStorage?.removeItem(RELOAD_KEY); } catch { /* 没有就算了 */ }
}
