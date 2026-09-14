/**
 * 换页的那一半 DOM（docs/47）。表在 `ui/transitions.ts`。
 *
 * 这里只剩两件事：
 *
 *  1. **原地交棒**（选择页 → 舞台）：`handOff()` 包一次同文档的 `document.startViewTransition`，
 *     由 `stageShown()` 决定什么时候交 —— 舞台画出第一帧，或者等满 `HANDOFF_WAIT_MS`。
 *     有看门狗：最迟 `SETTLE_MS` 之后强制收掉，静止态不许等一个动画跑完。
 *  2. **悬停预取**（Speculation Rules），把下一页早一点备好。它不是过渡。
 *
 * **跨页过渡整个关着**（`transitions.ts` 的文件头，docs/47 §4.3）：跨页快照在无头 Chrome 上
 * 每一类跳都量出过整帧纯白，原因没查到。所以这里没有跨页过渡的钩子 ——
 * 没有跨页过渡，它们永远等不到一个 `viewTransition`，留着就是永远不会跑的代码。
 *
 * 不支持的浏览器上 `startViewTransition` 不存在，交棒退回原来那条 180ms 淡出。**没有一条路依赖它。**
 */
import { HANDOFF_WAIT_MS, SETTLE_MS, speculationRules } from './transitions.ts';

interface ViewTransitionLike { finished: Promise<void>; skipTransition(): void }

const reduced = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 看门狗。过渡正常结束就撤掉，不正常就到点收 */
function settle(vt: ViewTransitionLike): void {
  const timer = setTimeout(() => vt.skipTransition(), SETTLE_MS);
  vt.finished.finally(() => clearTimeout(timer)).catch(() => {});
}

let installed = false;

/**
 * 装上悬停预取。幂等 —— 目录、横带、工作台出口三处都会叫它（一页上可能同时有两样）。
 * **现场（`?kiosk=1`）一处都不挂**，所以现场从不预取。
 */
export function installPrefetch(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const supports = (HTMLScriptElement as { supports?: (t: string) => boolean }).supports;
  if (!supports?.('speculationrules')) return;
  // 省流量模式下不替人预取
  if ((navigator as { connection?: { saveData?: boolean } }).connection?.saveData) return;
  const s = document.createElement('script');
  s.type = 'speculationrules';
  s.textContent = JSON.stringify(speculationRules());
  document.head.append(s);
}

/**
 * 原地换景的交棒。有平台支持且没开「减少动态效果」时，`update` 在一次同文档过渡里跑：
 * 旧的一景截图、`update` 改 DOM、平台交叉淡化到新的一景。返回 `false` = 没有过渡，
 * `update` **没有**被调用 —— 调用方走自己原来那条路。
 */
export function handOff(update: () => void): boolean {
  const start = (document as { startViewTransition?: (cb: () => void) => ViewTransitionLike }).startViewTransition;
  if (typeof start !== 'function' || reduced()) return false;
  settle(start.call(document, update));
  return true;
}

let shownResolve: () => void = () => {};
const shown = new Promise<void>((resolve) => { shownResolve = resolve; });

/** 舞台的帧循环已经开跑：再过两帧（第一帧真的交到屏幕上）就算"画出来了" */
export function announceStageShown(): void {
  if (typeof requestAnimationFrame !== 'function') { shownResolve(); return; }
  requestAnimationFrame(() => requestAnimationFrame(() => shownResolve()));
}

/** 舞台画出来了，或者等满 `capMs` —— 先到哪个算哪个。交棒不许依赖舞台起得来 */
export function stageShown(capMs = HANDOFF_WAIT_MS): Promise<void> {
  return Promise.race([shown, new Promise<void>((resolve) => { setTimeout(resolve, capMs); })]);
}
