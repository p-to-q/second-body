/**
 * 开场选择页 —— 观众选自己要变成的那具身体（docs/12 §5、docs/14 §4）。
 *
 * 卡片骑在一条竖直螺旋上，远离的溶解成有序抖动。轮播本身是移植来的
 * （`../vendor/dither-carousel`，MIT，见那边的 LICENSE 与 README）；
 * 这个文件是它的外壳：数据、排布、选中、以及现场需要的那几条兜底。
 *
 * 三条不能忘的现场规则：
 *   1. **30 秒无操作自动选一个。** 装置不能停在菜单上。
 *   2. **`?theme=<id>` 直接跳过这一页。** 刷新可复现，也是现场的手动覆盖。
 *   3. **WebGL 起不来也要能选。** 掉到一个纯 DOM 的列表，键盘和自动选择照常工作。
 *      （AGENTS.md：每条降级路径必须存在且被跑过 —— `?gl=off` 就是用来跑它的。）
 *
 * 排布不是数组顺序，是**形态空间**：按 `axes.humanLike` / `axes.lifeLike` 绕
 * 质心排成一圈，滑动时观众是在穿越那张图（docs/14 §4）而不是翻列表。
 */
import { mulberry32 } from '../../../core/src/rng.ts';
import type { PartLibraryIndex, Rng, ThemeDef } from '../../../core/src/types.ts';
import { createCarousel, type CarouselHandle } from '../vendor/dither-carousel/scene.ts';
import { buildCard, loadImage, type BuiltCard } from './cards.ts';

export interface ChooseOptions {
  /** 选定了。id 已经写进 URL。 */
  onChoose: (id: string) => void;
  mount?: HTMLElement;
  partsUrl?: string;
  refsBase?: string;
  /** 无操作多久自动随机选。0 关掉（只该在调试时用）。 */
  idleMs?: number;
  /** 唯一一处非确定性入口。给了 seed 就完全可复现。 */
  seed?: number;
  /** 直接给条目，跳过 fetch（dev 页面 / 演示用）。 */
  themes?: ThemeDef[];
  /** 强制走无 WebGL 的降级路径。 */
  forceFallback?: boolean;
  /** 让 canvas 可读回（截图取证用）。现场不要开。 */
  capture?: boolean;
}

export interface ChooseHandle {
  dispose(): void;
  /** 现在停在哪个 id 上 */
  current(): string | null;
  /** 按 id 选中，走完整的退出动画 */
  choose(id: string): void;
  /** 这一页真正在用的条目，按形态空间排好序 */
  entries(): BuiltCard[];
  /** 走的是 GL 还是降级列表 */
  mode: 'gl' | 'fallback';
  /** 轮播本体，降级时为 null。调试用（replayEntry / step / internals）。 */
  gl: CarouselHandle | null;
}

const DEFAULT_IDLE_MS = 30_000;

// ── URL ─────────────────────────────────────────────────────────────────────

export function themeFromUrl(search: string = location.search): string | null {
  const value = new URLSearchParams(search).get('theme');
  return value && /^[a-z0-9._-]+$/i.test(value) ? value : null;
}

export function writeThemeToUrl(id: string): void {
  const url = new URL(location.href);
  url.searchParams.set('theme', id);
  history.replaceState(null, '', url);
}

// ── 形态空间排布 ─────────────────────────────────────────────────────────────

const axesOf = (t: ThemeDef): { humanLike: number; lifeLike: number } =>
  t.axes ?? { humanLike: 0.5, lifeLike: 0.5 };

/**
 * 二维形态空间 → 一维轮播。
 *
 * 轮播是一个**环**，所以用绕质心的角度排序：相邻的卡片在形态图上也相邻，
 * 滚满一圈正好是绕形态空间走一周。比"按 humanLike 排"好的地方是它不会把
 * lifeLike 那根轴压扁 —— 毛球和工业机不会因为都不像人就排到一起。
 *
 * 退化情况（旧的 parts.json 没有 axes 字段）：所有角度相等，sort 稳定，
 * 于是原样保留数组顺序。这正是我们要的降级行为。
 */
export function morphologyOrder(themes: ThemeDef[]): ThemeDef[] {
  if (themes.length < 3) return themes.slice();
  let cx = 0;
  let cy = 0;
  for (const t of themes) {
    cx += axesOf(t).humanLike;
    cy += axesOf(t).lifeLike;
  }
  cx /= themes.length;
  cy /= themes.length;
  const angle = (t: ThemeDef): number => {
    const a = axesOf(t);
    return Math.atan2(a.lifeLike - cy, a.humanLike - cx);
  };
  return themes.slice().sort((a, b) => angle(a) - angle(b));
}

// ── 数据 ────────────────────────────────────────────────────────────────────

/** parts.json 是旧版（没有 kind/axes）时补默认值，别让一页 UI 因为一个字段炸掉。 */
function normalize(raw: Partial<ThemeDef> & { id: string }): ThemeDef {
  return {
    id: raw.id,
    kind: raw.kind ?? 'archetype',
    name: raw.name ?? raw.id,
    nameEn: raw.nameEn ?? raw.id,
    tagline: raw.tagline ?? '',
    palette: raw.palette ?? [],
    source: raw.source ?? 'rodin',
    axes: raw.axes ?? { humanLike: 0.5, lifeLike: 0.5 },
    coverage: raw.coverage ?? 'light',
    base: raw.base,
  };
}

interface Library {
  themes: ThemeDef[];
  /** theme id → 库里有多少件部件 */
  partCount: Map<string, number>;
}

async function readLibrary(url: string): Promise<Library> {
  // parts.json 不存在时应用必须照常运行（AGENTS.md 不变量）。
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status}`);
    const index = (await res.json()) as PartLibraryIndex;
    const partCount = new Map<string, number>();
    for (const p of index.parts ?? []) {
      partCount.set(p.family, (partCount.get(p.family) ?? 0) + 1);
    }
    return { themes: (index.themes ?? []).map(normalize), partCount };
  } catch {
    return { themes: [], partCount: new Map() };
  }
}

// ── 挂载 ────────────────────────────────────────────────────────────────────

export async function mountChoose(options: ChooseOptions): Promise<ChooseHandle> {
  const {
    onChoose,
    mount = document.body,
    partsUrl = '/parts/parts.json',
    refsBase = '/refs',
    idleMs = DEFAULT_IDLE_MS,
    forceFallback = false,
    capture = false,
  } = options;
  // 非确定性只从这里进来一次，之后全程用这个 Rng。
  const rng: Rng = mulberry32(options.seed ?? (Date.now() >>> 0));

  const library = options.themes
    ? { themes: options.themes.map(normalize), partCount: new Map<string, number>() }
    : await readLibrary(partsUrl);

  // 先拿 anchor 图，再决定谁能上场。一张也不等太久（cards.ts 有超时）。
  const images = await Promise.all(
    library.themes.map((t) =>
      t.source === 'procedural' ? Promise.resolve(null) : loadImage(`${refsBase}/${t.id}/_anchor.png`),
    ),
  );

  // 能选的身体 = 程序化的 ∪ 有 anchor 图的 ∪ 库里真的有部件的。
  // 剩下的既可能是**空位**（docs/14 §2 那种"说明这个位置想要什么"的条目），
  // 也可能只是还没生成 —— 从 parts.json 看这两者没有区别，而它们此刻同样**穿不上**，
  // 所以都不进轮播。等 factory 把部件生出来，它们自己就会出现。
  //
  // 例外：条目是调用者直接给的（`themes`，dev/演示）时没有库可查，全部放行 ——
  // `/dev/choose.html?roster=1` 要的正是"把整张形态图铺开看，哪一片还是空的"。
  const cards: BuiltCard[] = [];
  morphologyOrder(library.themes).forEach((theme) => {
    const image = images[library.themes.indexOf(theme)] ?? null;
    const wearable = options.themes
      ? true
      : theme.source === 'procedural' || image !== null || (library.partCount.get(theme.id) ?? 0) > 0;
    if (!wearable) return;
    cards.push(buildCard(theme, image, rng));
  });

  const ui = buildDom(mount);
  let disposed = false;
  let committed = false;
  let carousel: CarouselHandle | null = null;
  let fallbackIndex = 0;
  let mode: 'gl' | 'fallback' = 'gl';

  const indexOfId = (id: string) => cards.findIndex((c) => c.theme.id === id);
  const activeIndex = () => (carousel ? carousel.activeIndex() : fallbackIndex);

  function showActive(index: number): void {
    const card = cards[index];
    if (!card) return;
    ui.name.textContent = card.theme.name;
    ui.nameEn.textContent = card.theme.nameEn;
    ui.tag.textContent = card.theme.tagline;
    ui.kind.textContent = card.theme.kind === 'archetype' ? '' : card.theme.kind;
    ui.root.querySelectorAll('.sb-row').forEach((row, i) => {
      row.classList.toggle('is-active', i === index);
    });
  }

  /** 选定。写 URL → 放退出动画 → 回调。任何一步坏了都不能卡住现场。 */
  function commit(index: number): void {
    const card = cards[index];
    if (!card || committed || disposed) return;
    committed = true;
    const id = card.theme.id;
    writeThemeToUrl(id);
    ui.idle.textContent = '';
    ui.root.classList.add('is-leaving');
    if (!carousel) {
      finish(id);
      return;
    }
    // 动画没跑完也要交差：定时兜底，onExitDone 先到就取消。
    const safety = setTimeout(() => finish(id), 2000);
    exitDone = (chosen) => {
      clearTimeout(safety);
      finish(chosen);
    };
    carousel.exit(index);
  }

  let finished = false;
  function finish(id: string): void {
    if (finished) return;
    finished = true;
    onChoose(id);
  }
  let exitDone: (id: string) => void = () => {};

  // ── 空闲自动选择 ──────────────────────────────────────────────────────────
  // 现场不能停在菜单上：30 秒没人动，自己挑一个进去。
  let idleAt = performance.now() + idleMs;
  const bump = (): void => {
    idleAt = performance.now() + idleMs;
  };
  const idleTick = window.setInterval(() => {
    if (committed || idleMs <= 0) return;
    const left = idleAt - performance.now();
    ui.idle.textContent = left <= 10_000 ? `${Math.max(0, Math.ceil(left / 1000))}s 后自动选择` : '';
    if (left <= 0) commit(rng.int(cards.length));
  }, 200);

  // ── 键盘 ─────────────────────────────────────────────────────────────────
  const onKeyDown = (e: KeyboardEvent): void => {
    bump();
    if (committed) return;
    if (/^[0-9]$/.test(e.key)) {
      // 现场遥控器/数字键直选。0 是第 10 张。
      const n = e.key === '0' ? 9 : Number(e.key) - 1;
      if (n < cards.length) commit(n);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      commit(activeIndex());
      return;
    }
    const delta = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1
      : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    if (carousel) {
      carousel.focus((activeIndex() + delta + cards.length) % cards.length);
    } else {
      fallbackIndex = (fallbackIndex + delta + cards.length) % cards.length;
      showActive(fallbackIndex);
    }
  };

  window.addEventListener('keydown', onKeyDown);
  for (const type of ['pointerdown', 'pointermove', 'wheel', 'touchstart'] as const) {
    window.addEventListener(type, bump, { passive: true });
  }

  // ── GL，以及它起不来的时候 ────────────────────────────────────────────────
  function toFallback(reason: unknown): void {
    if (mode === 'fallback') return;
    mode = 'fallback';
    carousel = null;
    ui.canvas.style.display = 'none';
    ui.list.hidden = false;
    console.warn('[choose] 轮播不可用，走 DOM 降级列表：', reason);
    cards.forEach((card, index) => {
      const row = document.createElement('button');
      row.className = 'sb-row';
      row.type = 'button';
      row.appendChild(card.canvas);
      const label = document.createElement('span');
      label.textContent = `${index + 1}. ${card.theme.name} · ${card.theme.nameEn}`;
      row.appendChild(label);
      row.addEventListener('click', () => commit(index));
      row.addEventListener('pointerenter', () => {
        fallbackIndex = index;
        showActive(index);
      });
      ui.list.appendChild(row);
    });
    showActive(fallbackIndex);
  }

  if (cards.length === 0) {
    ui.name.textContent = '没有可选的身体';
    ui.tag.textContent = 'parts.json 里没有条目，或者它们都还没有 anchor 图与部件。';
  } else if (forceFallback) {
    toFallback('forceFallback');
  } else {
    try {
      carousel = createCarousel(ui.canvas, {
        textures: cards.map((c) => c.texture),
        preserveDrawingBuffer: capture,
        random: () => rng.next(),
        onActiveChange: showActive,
        onPick: (index) => commit(index),
        onExitDone: (index) => exitDone(cards[index].theme.id),
        onError: (error) => {
          // 帧循环已经自己停了。掉到列表，别让观众对着一块黑屏。
          if (!committed) toFallback(error);
        },
      });
      showActive(carousel.activeIndex());
    } catch (error) {
      toFallback(error);
    }
  }

  return {
    // getter：降级可能发生在返回之后（帧循环里炸了），这里不能是一个快照
    get mode() { return mode; },
    get gl() { return carousel; },
    dispose() {
      disposed = true;
      clearInterval(idleTick);
      window.removeEventListener('keydown', onKeyDown);
      for (const type of ['pointerdown', 'pointermove', 'wheel', 'touchstart'] as const) {
        window.removeEventListener(type, bump);
      }
      carousel?.dispose();
      ui.root.remove();
    },
    current: () => cards[activeIndex()]?.theme.id ?? null,
    choose(id: string) {
      const index = indexOfId(id);
      if (index >= 0) commit(index);
    },
    entries: () => cards.slice(),
  };
}

/**
 * 入口：URL 里已经有合法 theme 就**直接跳过这一页**，否则挂上轮播。
 * 返回 null 表示跳过了。
 */
export async function chooseTheme(options: ChooseOptions): Promise<ChooseHandle | null> {
  const pre = themeFromUrl();
  if (pre) {
    // 条目表读不到（parts.json 缺失）时也认这个 id —— 手动覆盖优先于校验。
    const known = options.themes
      ? options.themes.some((t) => t.id === pre)
      : await readLibrary(options.partsUrl ?? '/parts/parts.json').then(
          (lib) => lib.themes.length === 0 || lib.themes.some((t) => t.id === pre),
        );
    if (known) {
      options.onChoose(pre);
      return null;
    }
  }
  return mountChoose(options);
}

// ── DOM 外壳 ────────────────────────────────────────────────────────────────

interface Ui {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  list: HTMLElement;
  name: HTMLElement;
  nameEn: HTMLElement;
  tag: HTMLElement;
  kind: HTMLElement;
  idle: HTMLElement;
}

const CSS = `
.sb-choose{position:fixed;inset:0;background:#000;color:#e8eaee;
  font:14px/1.5 system-ui,-apple-system,"PingFang SC","Noto Sans CJK SC",sans-serif;overflow:hidden}
.sb-choose canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.sb-hud{position:absolute;left:0;right:0;bottom:0;padding:28px 32px;pointer-events:none;
  background:linear-gradient(to top,rgba(0,0,0,.75),transparent)}
.sb-name{font-size:34px;font-weight:600;letter-spacing:.04em}
.sb-name .sb-en{font-size:15px;font-weight:400;letter-spacing:.18em;opacity:.55;margin-left:14px;
  text-transform:uppercase}
.sb-tag{opacity:.75;margin-top:4px}
.sb-kind{margin-top:6px;font:11px ui-monospace,monospace;letter-spacing:.22em;text-transform:uppercase;opacity:.5}
.sb-hint{position:absolute;right:32px;bottom:28px;text-align:right;font:12px ui-monospace,monospace;
  opacity:.4;line-height:1.9;white-space:pre}
.sb-idle{position:absolute;right:32px;top:24px;font:12px ui-monospace,monospace;opacity:.55;letter-spacing:.1em}
.sb-choose.is-leaving .sb-hud,.sb-choose.is-leaving .sb-hint,
.sb-choose.is-leaving .sb-idle{opacity:0;transition:opacity .5s}
.sb-list{position:absolute;inset:0;overflow-y:auto;padding:24px;display:grid;gap:14px;
  grid-template-columns:repeat(auto-fill,minmax(280px,1fr));align-content:start}
.sb-row{background:none;border:1px solid rgba(232,234,238,.18);color:inherit;padding:0;cursor:pointer;
  font:inherit;text-align:left;display:block}
.sb-row canvas{position:static;width:100%;height:auto}
.sb-row span{display:block;padding:8px 10px}
.sb-row.is-active{border-color:rgba(232,234,238,.8)}
`;

function buildDom(mount: HTMLElement): Ui {
  if (!document.getElementById('sb-choose-css')) {
    const style = document.createElement('style');
    style.id = 'sb-choose-css';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  const root = document.createElement('div');
  root.className = 'sb-choose';
  root.innerHTML = `
    <canvas></canvas>
    <div class="sb-list" hidden></div>
    <div class="sb-hud">
      <div class="sb-name"><span class="sb-cn"></span><span class="sb-en"></span></div>
      <div class="sb-tag"></div>
      <div class="sb-kind"></div>
    </div>
    <div class="sb-idle"></div>
    <div class="sb-hint">滚动 / 拖动 穿越形态空间\n数字键直选 · ↑↓ 移动 · Enter 确认\n点中间那张即确认</div>`;
  mount.appendChild(root);
  return {
    root,
    canvas: root.querySelector('canvas')!,
    list: root.querySelector<HTMLElement>('.sb-list')!,
    name: root.querySelector<HTMLElement>('.sb-cn')!,
    nameEn: root.querySelector<HTMLElement>('.sb-en')!,
    tag: root.querySelector<HTMLElement>('.sb-tag')!,
    kind: root.querySelector<HTMLElement>('.sb-kind')!,
    idle: root.querySelector<HTMLElement>('.sb-idle')!,
  };
}
