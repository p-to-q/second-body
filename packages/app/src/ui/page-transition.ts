/**
 * 换页的那一半 DOM（docs/47）。表在 `ui/transitions.ts`，这里只把它接到平台上。
 *
 * ## 三件事，全部同步
 *
 *  1. **谁是"同一件东西"由页面声明**：`declareShared(el, 'mark')`。这里不认任何选择器 ——
 *     字标、巨题、目录那个词、工作台出口各自在建它的地方声明一次，表决定哪一对要挪它。
 *  2. **GPU 画布先冻成一张图。** WebGPU 画布出了绘制它的那个任务就读不到（`stage/ink-sampler.ts`
 *     记着同一件事）；平台给旧页截图时它是透明的，透出来的是叠层的底 —— 无头 Chrome 上是白，
 *     叠层底改成令牌之后是新页的底色，也就是一刀切。所以画面的主人登记一个 `render()`
 *     （`registerFreezable`），截图之前在同一个任务里画一帧、拷进一块 2D 画布、盖在原处。
 *  3. **看门狗**：新页上最迟 `SETTLE_MS` 收掉过渡。静止态不许等一个动画跑完。
 *
 * `pageswap` / `pagereveal` 里没有任何异步工作：截图就在它们之后。
 *
 * 首页的看门狗另有一份写在 `index.html` 行内（模块到达之前这一页就可能被揭开）。
 * 不支持的浏览器上这些调用全不存在，每一跳退回一刀切 —— 第一帧的底色仍然是对的。
 */
import {
  HANDOFF_WAIT_MS, SETTLE_MS, SHARED_ATTR, SHARED_NAME, framesSteady, speculationRules, surfaceOf, transitionFor,
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

// ── 1. 共享元素 ──────────────────────────────────────────────────────────────

/** 页面声明：这个元素是"那一件东西"。建它的地方调一次，没有第二种写法 */
export function declareShared<T extends HTMLElement>(el: T, kind: Shared): T {
  el.setAttribute(SHARED_ATTR, kind);
  return el;
}

const find = (kind: Shared): HTMLElement | null => document.querySelector<HTMLElement>(`[${SHARED_ATTR}="${kind}"]`);

/** 看得见才挪：一件滚出视口的东西从视口外飞进来，比它淡出去难看得多；这一侧退成普通淡化 */
function onScreen(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
}

const named: HTMLElement[] = [];
function nameShared(shared: readonly Shared[]): Shared[] {
  const done: Shared[] = [];
  for (const s of shared) {
    const el = find(s);
    if (!el || !onScreen(el)) continue;     // 这一侧没有它 / 看不见：只在另一侧淡入或淡出
    el.style.setProperty('view-transition-name', SHARED_NAME[s]);
    named.push(el);
    done.push(s);
  }
  return done;
}
function unname(): void {
  for (const el of named.splice(0)) el.style.removeProperty('view-transition-name');
  document.documentElement.classList.remove('sb-vt-arrived');
}

// ── 2. 冻住 GPU 画布 ─────────────────────────────────────────────────────────

export interface Freezable {
  canvas: HTMLCanvasElement;
  /** 在调用它的这个任务里画一帧。之后紧跟着的 `drawImage` 读得到这一帧 */
  render(): void;
}
const freezables = new Set<Freezable>();

/** 画面的主人登记一次（舞台、选择页的环）。返回撤销 —— 画布被拆掉时调 */
export function registerFreezable(f: Freezable): () => void {
  freezables.add(f);
  return () => { freezables.delete(f); };
}

/** 读回的上限倍率。过渡只有 180ms；1.5 和舞台渲染器的像素比上限同一个数 */
const FREEZE_DPR = 1.5;

const frozen: Array<[HTMLCanvasElement, HTMLCanvasElement]> = [];

/**
 * 画一帧、拷进一块 2D 画布、盖在原画布的位置上，原画布藏起来。返回那块图（没法冻就是 null）。
 * 图带着原画布的 class，所以原来那几条 CSS（`.sb-ring.is-gone` 之类）照样作用在它身上。
 */
export function freezeCanvas(f: Freezable): HTMLCanvasElement | null {
  const src = f.canvas;
  if (!src.isConnected || src.style.visibility === 'hidden') return null;
  const box = src.getBoundingClientRect();
  if (box.width < 1 || box.height < 1) return null;
  const k = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, FREEZE_DPR);
  const img = document.createElement('canvas');
  img.width = Math.round(box.width * k);
  img.height = Math.round(box.height * k);
  const ctx = img.getContext('2d');
  if (!ctx) return null;
  try {
    f.render();
    ctx.drawImage(src, 0, 0, img.width, img.height);
  } catch {
    return null;            // 画不出来就不冻：退回平台自己的截图（最坏是一刀切，不是一次异常）
  }
  img.className = src.className;
  const cs = getComputedStyle(src);
  const fixed = cs.position === 'fixed';
  Object.assign(img.style, {
    position: fixed ? 'fixed' : 'absolute',
    inset: 'auto',
    left: `${box.left + (fixed ? 0 : scrollX)}px`,
    top: `${box.top + (fixed ? 0 : scrollY)}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    zIndex: cs.zIndex,
    pointerEvents: 'none',
  });
  src.after(img);
  src.style.visibility = 'hidden';
  frozen.push([src, img]);
  return img;
}
function thaw(): void {
  for (const [src, img] of frozen.splice(0)) { img.remove(); src.style.visibility = ''; }
}

// ── 3. 装上 ──────────────────────────────────────────────────────────────────

const surfaceOfUrl = (url: string): ReturnType<typeof surfaceOf> => {
  const u = new URL(url, location.href);
  return surfaceOf(u.pathname, u.search);
};

/** 取证用：这一跳按表走了哪一对、挪了哪几件。`scripts/transitions/measure.mjs` 读它 */
function stamp(side: 'swap' | 'reveal', pair: string, names: readonly string[]): void {
  const v = `${pair}:${names.join(',')}`;
  document.documentElement.dataset[side === 'swap' ? 'vtSwap' : 'vtReveal'] = v;
  // 离开那一侧的记录活不过这一页：放进这个标签页的 sessionStorage，下一页读得到
  if (side === 'swap') try { sessionStorage.setItem('sb-vt-swap', v); } catch { /* 少一条取证而已 */ }
}

let installed = false;

/**
 * 装上跨页过渡（两侧）与悬停预取。幂等 —— 目录、横带、工作台出口三处都会叫它。
 * **现场一处都不挂**：现场没有目录，现场的离开只有重载，平台本来就不给重载过渡。
 */
export function installPageTransitions(): void {
  if (installed || typeof window === 'undefined' || typeof document === 'undefined') return;
  installed = true;
  const here = () => surfaceOf(location.pathname, location.search);

  // 旧页：截图之前
  addEventListener('pageswap', (event) => {
    const e = event as SwapEvent;
    const vt = e.viewTransition;
    if (!vt) return;
    const url = e.activation?.entry?.url;
    const from = here();
    const to = url ? surfaceOfUrl(url) : null;
    const t: Transition | null = to ? transitionFor(from, to) : null;
    if (!t || t.kind !== 'crossfade' || reduced()) { vt.skipTransition(); return; }
    for (const f of freezables) freezeCanvas(f);
    stamp('swap', `${from}>${to}`, nameShared(t.shared));
  });

  // 新页：第一帧之前
  addEventListener('pagereveal', (event) => {
    const vt = (event as RevealEvent).viewTransition;
    if (!vt) return;
    const fromUrl = (globalThis as { navigation?: { activation?: { from?: { url?: string } | null } } })
      .navigation?.activation?.from?.url;
    const from = fromUrl ? surfaceOfUrl(fromUrl) : null;
    const t = from ? transitionFor(from, here()) : null;
    if (!t || t.kind !== 'crossfade' || reduced()) { vt.skipTransition(); return; }
    const names = nameShared(t.shared);
    // 巨题从上一页挪过来：这一页自己的「巨题升起」不再放第二遍（editorial.css 的 ed-rise）
    if (names.includes('title')) document.documentElement.classList.add('sb-vt-arrived');
    stamp('reveal', `${from}>${here()}`, names);
    settle(vt);
    vt.finished.finally(unname).catch(() => {});
  });

  // 从往返缓存回来的旧页：冻住的图和名字还挂着 —— 画面要重新活过来，下一次过渡也不能拿到两个同名元素
  addEventListener('pageshow', (e) => { if ((e as PageTransitionEvent).persisted) { thaw(); unname(); } });

  installPrefetch();
}

let prefetchInstalled = false;

/** 悬停预取（Speculation Rules）。幂等。现场一处都不挂，所以现场从不预取 */
export function installPrefetch(): void {
  if (prefetchInstalled || typeof document === 'undefined') return;
  prefetchInstalled = true;
  const supports = (HTMLScriptElement as { supports?: (t: string) => boolean }).supports;
  if (!supports?.('speculationrules')) return;
  if ((navigator as { connection?: { saveData?: boolean } }).connection?.saveData) return;
  const s = document.createElement('script');
  s.type = 'speculationrules';
  s.textContent = JSON.stringify(speculationRules());
  document.head.append(s);
}

// ── 原地 ─────────────────────────────────────────────────────────────────────

/** 这台浏览器此刻会不会做同文档过渡（有 API，且没开「减少动态效果」） */
export function canTransition(): boolean {
  return typeof document !== 'undefined'
    && typeof (document as { startViewTransition?: unknown }).startViewTransition === 'function' && !reduced();
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

/**
 * 同文档里把一件东西挪成另一件：`from` 先起名，`update` 之后声明为 `to` 的那一件起同一个名字。
 * 返回 `false` 时什么都没做，调用方走原来那条路。
 */
export function morph(from: HTMLElement, to: Shared, update: () => void): boolean {
  const name = SHARED_NAME[to];
  if (!onScreen(from)) return false;
  from.style.setProperty('view-transition-name', name);
  let target: HTMLElement | null = null;
  const ok = handOff(() => {
    from.style.removeProperty('view-transition-name');
    update();
    target = find(to);
    target?.style.setProperty('view-transition-name', name);
  });
  if (!ok) { from.style.removeProperty('view-transition-name'); return false; }
  // 过渡结束后名字不留在页面上：下一次跨页过渡还要按表给它起名
  setTimeout(() => { (target as HTMLElement | null)?.style.removeProperty('view-transition-name'); }, SETTLE_MS);
  return true;
}

/**
 * 这一页的跨页过渡落定了（或者根本没有）。`index.html` 行内那几行在第一帧之前就开始记；
 * 别的页没有那几行，当场落定。**只推迟 GPU 那一类重活**，DOM 照常建 —— 它本来就在过渡底下长出来。
 */
export function revealSettled(): Promise<void> {
  return (globalThis as { sbRevealSettled?: Promise<void> }).sbRevealSettled ?? Promise.resolve();
}

let shownResolve: () => void = () => {};
const shown = new Promise<void>((resolve) => { shownResolve = resolve; });

/**
 * 舞台的帧循环已经开跑：从这里看帧间隔，稳住了（`framesSteady`）才算"画出来了"。
 * 只**看**帧，不参与帧循环 —— 一个并排的 rAF，稳住或数满 `STEADY_GIVE_UP` 帧就停。
 */
const STEADY_GIVE_UP = 240;
export function announceStageShown(): void {
  if (typeof requestAnimationFrame !== 'function') { shownResolve(); return; }
  const dts: number[] = [];
  let last = -1;
  const tick = (now: number): void => {
    if (last >= 0) dts.push(now - last);
    last = now;
    if (framesSteady(dts) || dts.length >= STEADY_GIVE_UP) { shownResolve(); return; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** 舞台画出来了，或者等满 `capMs` —— 先到哪个算哪个。交棒不许依赖舞台起得来 */
export function stageShown(capMs = HANDOFF_WAIT_MS): Promise<void> {
  return Promise.race([shown, new Promise<void>((resolve) => { setTimeout(resolve, capMs); })]);
}

let brandResolve: () => void = () => {};
const brand = new Promise<void>((resolve) => { brandResolve = resolve; });
/** 选择页左上角的字标挂上了（`choose.ts`） */
export function announceBrand(): void { brandResolve(); }
/** 字标挂上了，或者等满 `capMs` */
export function brandShown(capMs = HANDOFF_WAIT_MS): Promise<void> {
  return Promise.race([brand, new Promise<void>((resolve) => { setTimeout(resolve, capMs); })]);
}
