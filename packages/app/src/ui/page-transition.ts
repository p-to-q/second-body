/**
 * 换页的那一半 DOM（docs/47）。表在 `ui/transitions.ts`，这里只把它接到平台上。
 *
 * ## 用的是平台，不是我们自己的动画
 *
 * 跨页：CSS 里一行 `@view-transition { navigation: auto }`（`type.css`；首页在 `index.html`
 * 行内，因为它的样式表是脚本带进来的，晚于第一帧）。浏览器在旧页最后一帧和新页第一帧之间
 * 自己做交叉淡化，时长取 `type.css` 那把尺子。这里多做三件事：
 *
 *  1. `pageswap` / `pagereveal` 上查表：这一对要不要过渡、哪几样东西是同一件（给它们起同一个
 *     `view-transition-name`，平台就会把它从旧位置挪到新位置）。表里没有的一对直接跳过。
 *  2. **看门狗。** 最迟 `SETTLE_MS` 之后强制收掉 —— 静止态不许等一个动画跑完。
 *  3. 预取 / 预渲染规则（Speculation Rules），悬停时把下一页备好。
 *
 * 原地（选择页 → 舞台）：`handOff()` 包一次 `document.startViewTransition`，
 * 由 `stageShown()` 决定什么时候交棒 —— 舞台画出第一帧，或者等满 `HANDOFF_WAIT_MS`。
 *
 * 不支持的浏览器上这些调用全部不存在，于是每一跳退回原来的一刀切。**没有一条路依赖它们。**
 */
import {
  HANDOFF_WAIT_MS, SETTLE_MS, SHARED_NAME, SHARED_SELECTOR, speculationRules, surfaceOf, transitionFor,
  type Shared, type Transition,
} from './transitions.ts';

interface ViewTransitionLike { finished: Promise<void>; skipTransition(): void }
type SwapEvent = Event & { viewTransition?: ViewTransitionLike | null; activation?: { entry?: { url?: string } } | null };
type RevealEvent = Event & { viewTransition?: ViewTransitionLike | null };

const reduced = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 看门狗。过渡正常结束就撤掉，不正常就到点收 */
function settle(vt: ViewTransitionLike): void {
  const timer = setTimeout(() => vt.skipTransition(), SETTLE_MS);
  vt.finished.finally(() => clearTimeout(timer)).catch(() => {});
}

const named: HTMLElement[] = [];
function nameShared(shared: readonly Shared[]): Shared[] {
  const done: Shared[] = [];
  for (const s of shared) {
    const el = document.querySelector<HTMLElement>(SHARED_SELECTOR[s]);
    if (!el) continue;                       // 这一页上没有它（比如展签的巨题还没挂上）：它就只是淡掉
    el.style.setProperty('view-transition-name', SHARED_NAME[s]);
    named.push(el);
    done.push(s);
  }
  return done;
}
/**
 * 旧页上满屏的 GPU 画布，在截图之前藏起来。
 *
 * 2026-09-14 无头 Chrome 实测：从舞台、`/dev/figure`、`/dev/lineup` 离开时，旧页那一张截图
 * 有时整张是纯白（亮度 255、离散度 0）—— 于是深底的舞台先闪一帧白纸再淡到下一页，比一刀切更糟。
 * 藏掉画布之后截到的是深底加角上的字，淡出的是它。画面本身在截图的那一刻就要走了，藏它不损失什么；
 * 从往返缓存回来时在 `pageshow` 里还原。
 */
const hidden: HTMLElement[] = [];
function hideGpuCanvases(): void {
  const area = innerWidth * innerHeight;
  for (const c of document.querySelectorAll<HTMLElement>('canvas, video')) {
    const r = c.getBoundingClientRect();
    // 摄像头那块小屏幕（`<video>`，带实时流）也截成过纯白，不论大小一起藏
    if ((c.tagName === 'CANVAS' && r.width * r.height < area * 0.25) || c.style.visibility === 'hidden') continue;
    c.style.visibility = 'hidden';
    hidden.push(c);
  }
}

/**
 * 摄像头开着的舞台。藏掉画面和小屏之后，无头 Chrome 仍然在 2/2 次里把这种页截成纯白
 * （docs/47 §4.3），而同一个舞台用回放驱动时 3/3 次截得对。原因没查到，所以不赌：
 * 摄像头开着就不过渡，退回原来的一刀切 —— 一刀切至少不会先白一下。
 */
function cameraLive(): boolean {
  return [...document.querySelectorAll('video')].some((v) => (v.srcObject as MediaStream | null)?.getVideoTracks?.().some((t) => t.readyState === 'live'));
}

function unname(): void {
  for (const c of hidden.splice(0)) c.style.visibility = '';
  for (const el of named.splice(0)) el.style.removeProperty('view-transition-name');
  document.documentElement.classList.remove('sb-vt-arrived');
}

const surfaceOfUrl = (url: string): ReturnType<typeof surfaceOf> => {
  const u = new URL(url, location.href);
  return surfaceOf(u.pathname, u.search);
};

let installed = false;

/**
 * 装上。幂等 —— 目录、横带、工作台出口三处都会叫它（一页上可能同时有两样）。
 * **现场（`?kiosk=1`）一处都不挂**，所以现场从不预取、也不查这张表。
 */
export function installPageTransitions(): void {
  if (installed || typeof window === 'undefined' || typeof document === 'undefined') return;
  installed = true;
  const here = () => surfaceOf(location.pathname, location.search);

  // 旧页：最后一帧被截下来之前
  addEventListener('pageswap', (event) => {
    const e = event as SwapEvent;
    const vt = e.viewTransition;
    if (!vt) return;
    const url = e.activation?.entry?.url;
    const t: Transition | null = url ? transitionFor(here(), surfaceOfUrl(url)) : null;
    if (!t || t.kind === 'none' || reduced() || cameraLive()) { vt.skipTransition(); return; }
    hideGpuCanvases();
    nameShared(t.shared);
  });

  // 新页：第一帧画出来之前
  addEventListener('pagereveal', (event) => {
    const vt = (event as RevealEvent).viewTransition;
    if (!vt) return;
    const from = (globalThis as { navigation?: { activation?: { from?: { url?: string } | null } } })
      .navigation?.activation?.from?.url;
    const t = from ? transitionFor(surfaceOfUrl(from), here()) : null;
    if (!t || t.kind === 'none' || reduced()) { vt.skipTransition(); return; }
    // 巨题从上一页挪过来的时候，这一页自己的「巨题升起」就不该再放一遍（editorial.css 的 ed-rise）
    if (nameShared(t.shared).includes('title')) document.documentElement.classList.add('sb-vt-arrived');
    settle(vt);
    vt.finished.finally(unname).catch(() => {});
  });

  // 从往返缓存里回来的旧页：名字还挂着，下一次过渡会拿到两个同名元素
  addEventListener('pageshow', (e) => { if ((e as PageTransitionEvent).persisted) unname(); });

  installSpeculation();
}

function installSpeculation(): void {
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
