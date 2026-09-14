/**
 * 开场选择页 —— 观众选自己要变成的那具身体（docs/12 §5、docs/14 §4）。
 *
 * 卡片骑在一个**大半在屏幕外**的环上，靠近时融在一起，分开时拉出越来越细的丝，
 * 直到断掉。环本身是 `ring/`（一个全屏片元着色器里的距离场，一个 draw call），
 * 数学移植自 Viscose-carousel（MIT，授权判定与逐条差异见 `docs/35-VISCOSE.md`）；
 * 这个文件是它的外壳：数据、排布、选中、以及现场需要的那几条兜底。
 *
 * **开屏和这一页是同一个场的两个阶段**（见 `ring/field.ts` 的文件头）：
 * 展签还立着时种子已经出生、在背后缓慢地转，按下「开始」之后卡片才一张张剥出来。
 * 所以这里拿到的环**可能已经在跑了** —— `acquireRingField()` 返回的是同一个实例。
 *
 * 三条不能忘的现场规则：
 *   1. **30 秒无操作自动选一个。** 装置不能停在菜单上。
 *   2. **`?theme=<id>` 直接跳过这一页。** 刷新可复现，也是现场的手动覆盖。
 *   3. **WebGL 起不来也要能选。** 掉到一个纯 DOM 的列表，键盘和自动选择照常工作。
 *      （AGENTS.md：每条降级路径必须存在且被跑过 —— `?gl=off` 就是用来跑它的。）
 *      这句话在 2026-09-13 之前是**假的**：`?gl=` 只接在 `/dev/choose.html` 上，
 *      正式程序的 `readFlags()` 里根本没有这个字段，`/?gl=off` 什么都不做
 *      （docs/36 D2）。现在它是真的：`shell/kiosk.ts` 认这个参数，
 *      `main.ts` 把 `forceFallback: !flags.gl` 传进来。
 *
 * 排布不是数组顺序，是**形态空间**：按 `axes.humanLike` / `axes.lifeLike` 绕
 * 质心排成一圈，滑动时观众是在穿越那张图（docs/14 §4）而不是翻列表。
 */
// 排版系统是硬约束：这一页的 CSS 全靠 --sb-*，所以它必须自己把 type.css 带上 ——
// 不能指望每个宿主 HTML 都记得 <link> 它（主程序的 index.html 就没有）。
import '../ui/type.css';
import { mulberry32 } from '../../../core/src/rng.ts';
import { cjkClass, COPY, setBi } from '../ui/i18n.ts';
import { markNode } from '../ui/mark.ts';
import type { PartLibraryIndex, RawPose, Rng, ThemeDef } from '../../../core/src/types.ts';
import { acquireRingField, type RingField } from './ring/field.ts';
import { holdFirstScreen } from './ring/first-screen.ts';
import { buildCard, loadImage, type BuiltCard } from './cards.ts';
import { startWaveInput, type WaveDriver } from './ring/wave-input.ts';
import { isWearable } from './wearable.ts';

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
  /**
   * 让 canvas 可读回（截图取证用）。现场不要开。
   *
   * ⚠️ 换到 WebGPU 之后这个开关**是个空档**：WebGPU 的画布不需要
   * `preserveDrawingBuffer` 这类设置，`canvas.toDataURL()` 本来就拿得到画面。
   * 留着它是因为它在 `ChooseOptions` 上、dev 页和别处的调用还在传 ——
   * 删一个参数的收益不值得那次连锁。
   */
  capture?: boolean;
  /**
   * 中心卡换了一张（滚动 / 拖动 / 键盘 / 降级列表上划过一行都算）。
   * 挂上来的第一张**不算** —— 那不是"经过"，那是页面刚打开。
   * 不传时这一页的行为逐字不变。
   */
  onPass?: () => void;
  /**
   * 选定了。`onChoose` 之外**另开一个**，是因为这两件事问的不是同一个问题：
   * `onChoose` 问"选了谁"，这里问"**是谁选的**"——
   * `how` 只有 30 秒无操作那一条是 `'idle'`，其余六条入口全是 `'manual'`。
   * 声音需要这个区分（观众得听得出这一下不是自己碰出来的），别的消费者可以不看。
   */
  onCommit?: (id: string, how: 'manual' | 'idle') => void;
  /**
   * 卡片图的到货进度（`done / total`）。**只是上报，不影响这一页的任何表现。**
   *
   * 为什么加在这里：这一页真正的等待在 `mountChoose` 返回**之前** ——
   * 23 张 anchor 图要先拉齐才排得出螺旋，慢网上那是几秒黑屏，
   * 而外面拿不到任何信号（`chooseTheme` 一次性 resolve）。
   * 加载态（`shell/loading.ts`）靠它显示真实进度。
   */
  onProgress?: (done: number, total: number) => void;
  /**
   * 最近一帧姿态。给了才有**举手滚动**（`ring/wave.ts`）。
   *
   * **不传 = 这一页逐字和以前一样。** 所以所有的降级都在调用方那一侧收口，
   * 用"传不传这个函数"表达，而不是在这里再判一次摄像头状态：
   *   没摄像头 / 没授权 → `latest()` 恒为 null，手势永远武装不了；
   *   `?demo=1`（回放）→ **根本不传**。让一段录像去操作名单，
   *     观众会看见名单自己在动而现场没有人举手 —— 那是"它坏了"，不是降级。
   *   `?wave=off` → 不传。
   */
  pose?: () => RawPose | null;
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
  /** 环本体，降级时为 null。调试用（fps / step / exit）。 */
  gl: RingField | null;
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
    taglineEn: raw.taglineEn ?? '',
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
    // 不传 = 一个什么都不做的函数。这样下面的调用点不需要每处写 `?.()`，
    // 「不传时行为逐字不变」也就只有这一处需要保证
    onPass = () => {},
    onCommit = () => {},
  } = options;
  // 非确定性只从这里进来一次，之后全程用这个 Rng。
  const rng: Rng = mulberry32(options.seed ?? (Date.now() >>> 0));

  const library = options.themes
    ? { themes: options.themes.map(normalize), partCount: new Map<string, number>() }
    : await readLibrary(partsUrl);

  // 先拿 anchor 图，再决定谁能上场。一张也不等太久（cards.ts 有超时）。
  // 每张到货就报一次，好让外面的加载态往前走一格 —— 顺序无关，报的是"到齐了几张"。
  let loadedImages = 0;
  const total = library.themes.length;
  options.onProgress?.(0, total);
  const images = await Promise.all(
    library.themes.map((t) =>
      (t.source === 'procedural' ? Promise.resolve(null) : loadImage(`${refsBase}/${t.id}/_anchor.png`))
        .then((img) => { options.onProgress?.(++loadedImages, total); return img; }),
    ),
  );

  // 能选的身体 = **程序化的** ∪ **库里真的有自有件的**。就这两条。
  //
  // 这里以前还有第三条「∪ 有 anchor 图的」，而 anchor 图是一张**参考渲染**，
  // 不是一件可以穿的零件（`/dev/anchor.html` 画出来的，docs/09 U12）。
  // 两者同时为真是常态，所以那一条长期不改变任何结果 —— 它只在最坏的那一刻生效：
  // 谁给一个零自有件的条目补了一张 anchor 图，它立刻进轮播，观众点得到，
  // 而 `makeGenome` 那边一件自有件都没有（docs/39 §2.1）。
  // 一个"看起来能选"的条目和一个"真的穿得上"的条目必须是同一批，
  // 所以判据只留下「穿不穿得上」这一个问题（docs/02 P21）。
  //
  // 剩下的既可能是**空位**（docs/14 §2 那种"说明这个位置想要什么"的条目），
  // 也可能只是还没生成 —— 从 parts.json 看这两者没有区别，而它们此刻同样**穿不上**，
  // 所以都不进轮播。等 factory 把部件生出来，它们自己就会出现。
  //
  // 例外：条目是调用者直接给的（`themes`，dev/演示）时没有库可查，全部放行 ——
  // `/dev/choose.html?roster=1` 要的正是"把整张形态图铺开看，哪一片还是空的"。
  const cards: BuiltCard[] = [];
  morphologyOrder(library.themes).forEach((theme) => {
    const image = images[library.themes.indexOf(theme)] ?? null;
    if (!isWearable(theme, library, options.themes !== undefined)) return;
    cards.push(buildCard(theme, image, rng));
  });

  // 首屏配色由这一页也 hold 一份：环起不来（`?gl=off` / 没有 WebGPU）时
  // 降级列表**就是**首屏，它同样得是白底黑字，不能因为环没起来就翻回深色。
  const releaseFirstScreen = holdFirstScreen();
  const ui = buildDom(mount);
  let disposed = false;
  let committed = false;
  let carousel: RingField | null = null;
  /** 举手滚动的帧循环。没传 `pose` / 降级到列表时永远是 null */
  let wave: WaveDriver | null = null;
  let fallbackIndex = 0;
  let mode: 'gl' | 'fallback' = 'gl';

  const indexOfId = (id: string) => cards.findIndex((c) => c.theme.id === id);
  const activeIndex = () => (carousel ? carousel.activeIndex() : fallbackIndex);

  /**
   * 上一次真正显示过的那一张。**初值 -1 而不是 0**：
   * 挂上来的第一次 showActive 不是"经过"，它是页面打开 ——
   * 给它配一声就等于每次进这一页都先"咔"一下，那是提示音不是反馈。
   */
  let shown = -1;

  function showActive(index: number): void {
    const card = cards[index];
    if (!card) return;
    if (shown >= 0 && index !== shown) onPass();
    shown = index;
    // 补偿按**字**打不按槽位打（i18n.ts 的 cjkClass）：物种名大多是汉字，
    // 但名单里也有本来就是拉丁的（`guest.*` 一类），不能一律补。
    ui.name.textContent = card.theme.name;
    ui.name.className = `sb-zh${cjkClass(card.theme.name)}`;
    ui.nameEn.textContent = card.theme.nameEn;
    ui.nameEn.className = `sb-en${cjkClass(card.theme.nameEn)}`;
    // 中英并置，不切换（ui/i18n.ts 的设计说明）—— 名字那一行早就是并置的，
    // tagline 原来只有中文，是漏的那一半
    setBi(ui.tag, { zh: card.theme.tagline, en: card.theme.taglineEn ?? '' });
    ui.kind.textContent = card.theme.kind === 'archetype' ? '' : card.theme.kind;
    ui.root.querySelectorAll('.sb-row').forEach((row, i) => {
      row.classList.toggle('is-active', i === index);
    });
  }

  /**
   * 选定。写 URL → 放退出动画 → 回调。任何一步坏了都不能卡住现场。
   *
   * `how` 默认 `'manual'`：六条入口（键盘数字、回车、降级列表点击、GL onPick、
   * 外部 `choose()`、以及 idle 超时）里**只有 idle 那一条**要显式传 `'idle'`，
   * 其余全是观众自己动的手。默认值选 manual 是因为漏传一处的代价不对称 ——
   * 把手动读成自动只是少了点区分，把自动读成手动会让观众以为是自己碰的。
   */
  function commit(index: number, how: 'manual' | 'idle' = 'manual'): void {
    const card = cards[index];
    if (!card || committed || disposed) return;
    committed = true;
    const id = card.theme.id;
    // 在退出动画之前叫：声音是"这一下发生了"的回执，不是动画的收尾音
    onCommit(id, how);
    writeThemeToUrl(id);
    ui.idle.classList.remove('is-on');   // 选定了，倒计时那条线立刻收起来
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
    handOver();
    onChoose(id);
  }

  /**
   * 交棒给 S3。
   *
   * **必须拆掉那块画布。** 环是不透明的（底色合成在着色器里，见 ring/sdf.ts），
   * 留着它就等于把接下来出现的身体挡在后面 —— 而 `main.ts` 从来不调
   * `handle.dispose()`（选完主题它就往下走了），所以这件事只能由这一页自己做。
   *
   * 180ms 是 §0 的出场时长。此刻整个屏幕已经被选中的那张卡涨满，
   * 淡掉的是一张满屏的图，不是一个正在动的东西 —— 所以这一下读作交接，不读作消失。
   */
  function handOver(): void {
    releaseFirstScreen();
    // 环要拆了，喂它的那条循环必须先停 —— 不然它会对着一个已经 dispose 的场调用
    wave?.stop();
    wave = null;
    const field = carousel;
    carousel = null;
    field?.canvas.classList.add('is-gone');
    setTimeout(() => {
      field?.dispose();
      ui.root.remove();
    }, 180);
  }
  let exitDone: (id: string) => void = () => {};

  // ── 空闲自动选择 ──────────────────────────────────────────────────────────
  // 现场不能停在菜单上：30 秒没人动，自己挑一个进去。
  //
  // docs/23 §S2 对这件事的表现有明确规定：**最后 5 秒**，中心卡下方出现
  // **一条极细的进度线**，走完自动选中。理由是"没有倒计时的话，突然跳转会吓到人"。
  // 所以它必须可见；同时 §0 又禁止进度条百分比 —— 一条正在走完的 1px 横线
  // 同时满足这两条：它说得出"还有一会儿"，但说不出"62%"。
  const COUNTDOWN_MS = 5000;
  let idleAt = performance.now() + idleMs;
  const bump = (): void => {
    idleAt = performance.now() + idleMs;
  };
  // 60ms 而不是 200ms：200ms 一跳的线肉眼能看出台阶，那会读成"卡了"
  const idleTick = window.setInterval(() => {
    if (committed || idleMs <= 0) return;
    const left = idleAt - performance.now();
    const showing = left <= COUNTDOWN_MS;
    ui.idle.classList.toggle('is-on', showing);
    // 线从 0 走到满 = 剩余时间从 5 秒走到 0
    ui.idleFill.style.width = showing
      ? `${Math.min(100, Math.max(0, (1 - left / COUNTDOWN_MS) * 100))}%`
      : '0';
    if (left <= 0) commit(rng.int(cards.length), 'idle');
  }, 60);

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
    // 环归这一页处置：它没有别的用户了（展签那一层这时已经不在）
    wave?.stop();
    wave = null;
    carousel?.dispose();
    carousel = null;
    ui.list.hidden = false;
    ui.root.classList.add('is-fallback');
    // 提示语必须跟着降级路径一起变：没有环可以"穿越"，
    // 一条教人做不到的事的提示比没有提示更糟
    setBi(ui.hint, COPY.choose.hintList);
    // 条目太少是**设计好的**退化，不是故障 —— 别在控制台吼它，
    // 否则真正的 GL 失败会淹没在噪音里（P14：测量工具本身会骗人）
    if (reason === 'cards < 3') console.info('[choose] 条目 < 3，环退化成横向一排（docs/23 §S2）');
    else console.warn('[choose] 环不可用，走 DOM 降级列表：', reason);
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
    // 观众看见的话里不许出现 parts.json。它说的是**会发生什么**：零件还在长。
    setBi(ui.name, COPY.choose.emptyTitle);
    setBi(ui.tag, COPY.choose.emptyNote);
  } else if (forceFallback) {
    toFallback('forceFallback');
  } else if (cards.length < 3) {
    // docs/23 §S2：「可选条目 < 3 个 → 退化成横向一排」。
    // 理由写在规格里：3 个以下的环看起来像坏了 —— 卡片绕不满一圈，
    // 观众看到的是一个转不动的轮子，而不是一条可以穿越的形态空间。
    // 而且丝也失去了意义：一条只连着两张卡的丝读作一根杠，不读作正在断的糖浆。
    // 走的是同一条 DOM 路径（键盘、自动选择全部照常），只是排成一排。
    toFallback('cards < 3');
    ui.list.classList.add('is-row');
    ui.list.style.setProperty('--sb-row-n', String(cards.length));
  } else {
    try {
      // 可能已经在跑了（展签那一层先拿过它）。拿到的是同一个实例，
      // 这里只是把 handler 换成这一页的，然后把卡片交给它。
      const field = acquireRingField({
        onActiveChange: showActive,
        onPick: (index) => commit(index),
        onExitDone: (index) => exitDone(cards[index].theme.id),
        onError: (error) => {
          // 帧循环已经自己停了。掉到列表，别让观众对着一块黑屏。
          if (!committed) toFallback(error);
        },
      });
      carousel = field;
      // 举手滚动。**只在环真的起来了之后挂**：降级列表是一条鼠标/键盘的路，
      // 上面既没有环也没有惯性，硬给它接一条手势等于第二套实现（见 wave.ts 文件头）。
      // 传了 `pose` 才有这一条 —— 没摄像头 / `?demo=1` / `?wave=off` 的收口都在调用方。
      if (options.pose) {
        const drive = options.pose;
        void field.ready.then((ok) => {
          if (!ok || committed || disposed) return;
          wave = startWaveInput({
            field,
            pose: drive,
            // 手势滚动和滚轮 / 指针**同一条待遇**：它就是一次操作，
            // 所以它续那 30 秒。只有真的滚动了才续 —— 站着不动的人不该
            // 把装置永远钉在菜单上（这条规则的本意是"没有操作"，不是"没有人"）。
            onScroll: bump,
          });
        });
      }
      field.setCards(cards.map((c) => c.canvas));
      // 展签在场时这一下已经按过了（幂等）；深链和现场没有展签，这一下就是入场。
      field.play();
      showActive(field.activeIndex());
      // WebGPU 起不来（旧浏览器、禁用了硬件加速）——**这是最常见的那条降级**，
      // 而且它是异步的：canvas 已经挂上去了，几百毫秒之后才知道不行。
      void field.ready.then((ok) => {
        if (!ok && !committed && !disposed) toFallback('WebGPU 不可用');
      });
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
      releaseFirstScreen();
      clearInterval(idleTick);
      wave?.stop();
      wave = null;
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
  list: HTMLElement;
  name: HTMLElement;
  nameEn: HTMLElement;
  tag: HTMLElement;
  kind: HTMLElement;
  /** 倒计时那条极细横线的容器 */
  idle: HTMLElement;
  /** 线里正在变长的那一段 */
  idleFill: HTMLElement;
  /** 右下角那几行操作提示。降级到列表时要改写 */
  hint: HTMLElement;
}

/**
 * 这一页的皮肤。**度量和颜色一律来自 `ui/type.css` 的 `--sb-*`，这里一个写死的
 * 字号/颜色都不许有**（docs/23 §0）—— 排版系统是全场景的硬约束，不是"文字页专用"。
 *
 * 原来这里是一套自己的字体栈和一串 px 值，于是选择页和其它页面差了半档：
 * 同一个作品名在两页里不是同一个字。改成变量之后，换字体只用改 type.css 一行。
 */
const CSS = `
/* 这一层是叠在环上面的字，不是一块底。底色由环那块画布自己出
   （ring/field.ts 把 --sb-paper 合成进着色器），所以这里必须是透明的，
   而且必须让指针穿过去 —— 滚动、拖动、悬停全是环在收。 */
.sb-choose{position:fixed;inset:0;z-index:2;pointer-events:none;color:var(--sb-ink);
  font-family:var(--sb-grotesk);font-size:var(--sb-size-body);line-height:var(--sb-lh-body);overflow:hidden}
/* 降级到列表时反过来：没有环，这一层就是这一页的全部 */
.sb-choose.is-fallback{pointer-events:auto;background:var(--sb-paper)}
/* 字标（ui/mark.ts）。**左上角，贴安全区。**

   ⚠️ 这一段在一个模板字符串里面。**反引号会就地把字符串结束掉**，
   后面整块 CSS 会被当成 TypeScript 解析（Vite 报的是 choose.ts 上一个
   莫名其妙的 "Expected a semicolon"）。同一个坑这个文件已经绊倒过两个人 ——
   所以这里的文件名一律裸写，不加反引号。

   这一页的左上角此前是空的 —— 2026-09-13 在 514×869 上逐个量过这一层的
   每一件东西：名牌 y=652、提示 y=721、按键条 y=805、倒计时线 y=743，
   全都在下三分之一；右上角是目录（x=360，z=11）。y<300 这一带一个元素都没有。
   摄像头小屏幕（ui/preview.css 的 .sb-see，同样占左上角）在这一页上
   **不存在**：它挂在观众选完物种之后（main.ts 的第 4b 节，理由是"开始之前
   一次权限都不问"），量的时候 document.querySelector('.sb-see') 是 null。
   所以这两块从来不同框，不需要为对方让位 —— 它们是同一个角上**先后**的两件东西。
   也因此这里不写任何跟着小屏幕尺寸走的偏移：那个高度现在是 --sb-see-h
   （clamp，会随视口变），而一条为不同框的邻居留的位置，量的时候就是错的。
   颜色走 --sb-on-stage：首屏把它翻成深色（ring/first-screen.css 里那条
   注释点名了字标），所以白底上它自己就是黑的。 */
/* 字标取和物种名同一档（--sb-size-h1）。这一屏讲的是两件事：这是什么作品、
   你在看哪一个物种 —— 一个是容器一个是条目，同字号让它们读成一副构图的两极
   （都压在左边那条 --sb-safe 线上，一上一下）。再大就开始和入口屏抢，
   再小就是现在这样：作品的名字比它目录里的一条还轻。 */
.sb-brand{position:absolute;left:var(--sb-safe);top:var(--sb-safe);pointer-events:none;--sb-mark-size:var(--sb-size-h1)}
.sb-hud{position:absolute;left:0;right:0;bottom:0;padding:var(--sb-safe);pointer-events:none;
  background:linear-gradient(to top,color-mix(in srgb,var(--sb-paper) 82%,transparent),transparent)}
.sb-name{font-size:var(--sb-size-h1);font-weight:var(--sb-weight-head);
  line-height:var(--sb-lh-h1);letter-spacing:var(--sb-tracking-h1)}
/* 这里**没有 margin-left**。原来有 0.8em —— 那是中英还在**同一行**时写的，
   是两个词之间的间距。改成上下两行之后它原地变成了一个纯缩进：
   实测英文那一行比其余三行右移 12.2px，正好是 0.8em 在这个字号下的值。
   一条规则活过了它所描述的那个版式，这是本仓库反复犯的同一类错。 */
.sb-name .sb-en{font-size:var(--sb-size-small);font-weight:var(--sb-weight-body);
  letter-spacing:var(--sb-tracking-label);color:var(--sb-ink-dim);text-transform:uppercase}
.sb-tag{color:var(--sb-ink-dim);margin-top:0.25em}
/* 物种的出身（character / guest）。只有一部分条目有，所以它**必须常占位**：
   这一块是底部锚定的（.sb-hud 贴着 bottom），多出一行会把上面整块顶上去，
   于是名字和介绍的位置随着"这一个恰好是不是角色"上下跳。
   上面那三行的位置是固定的 —— 那是名牌，不是列表。min-height 就是那句话的实现。 */
.sb-kind{margin-top:0.4em;min-height:1.4em;font-family:var(--sb-mono);font-size:var(--sb-size-small);
  letter-spacing:var(--sb-tracking-label);text-transform:uppercase;color:var(--sb-ink-dim);opacity:.7}
/* 一句话。正文字体 —— 它是说给人听的，不是标注 */
.sb-hint{position:absolute;right:var(--sb-safe);bottom:calc(var(--sb-safe) + 2.2em);text-align:right;
  color:var(--sb-ink-dim);max-width:min(24rem,44vw)}
.sb-hint .sb-en{color:var(--sb-ink-dim);opacity:.7}
/* 按键图例。等宽、极小号、压暗 —— 档案的语言，不是说明文字 */
.sb-keys{position:absolute;right:var(--sb-safe);bottom:var(--sb-safe);text-align:right;
  font-family:var(--sb-mono);font-size:var(--sb-size-micro);letter-spacing:var(--sb-tracking-label);
  color:var(--sb-ink-dim);opacity:.55}

.sb-choose.is-leaving .sb-hud,.sb-choose.is-leaving .sb-hint,
.sb-choose.is-leaving .sb-keys,.sb-choose.is-leaving .sb-idle,
.sb-choose.is-leaving .sb-brand{opacity:0;transition:opacity .5s}

/* 自动选择的倒计时（docs/23 §S2）：最后 5 秒，中心卡下方**一条极细的线**走完。
   规格明确不要百分比、不要数字 —— 一条正在走完的线已经说清楚"还有一会儿"，
   而一个跳动的秒数会把人的注意力从卡片上拽走。 */
.sb-idle{position:absolute;left:50%;bottom:calc(var(--sb-safe) * 2.6);transform:translateX(-50%);
  width:min(22rem,40vw);height:1px;background:var(--sb-rule);opacity:0;
  transition:opacity 240ms cubic-bezier(.16,1,.3,1);pointer-events:none}
.sb-idle.is-on{opacity:1}
.sb-idle i{display:block;height:1px;width:0;background:var(--sb-ink-dim)}

/* 无 WebGL 的降级列表。**同样的排版语言**（等宽字、同底色、卡片图）——
   docs/23 §S2：「降级路径也是作品的一部分」，不是丑陋兜底。 */
/* ⚠️ 下面那条 display:grid 会盖过 [hidden] 的 UA 规则（作者规则胜过 UA 规则）——
   于是这块 inset:0 的列表在 GL 模式下**看不见却仍然盖住整屏**，
   滚轮和指针全被它吃掉，环一动不动。滚动是这一页的主要输入，这一条必须在。 */
.sb-list[hidden]{display:none}
.sb-list{position:absolute;inset:0;overflow-y:auto;pointer-events:auto;padding:var(--sb-safe);display:grid;
  gap:var(--sb-gutter);grid-template-columns:repeat(auto-fill,minmax(18rem,1fr));align-content:start}
.sb-row{background:none;border:1px solid var(--sb-rule);color:inherit;padding:0;cursor:pointer;
  font:inherit;text-align:left;display:block}
.sb-row canvas{position:static;width:100%;height:auto}
.sb-row span{display:block;padding:0.5em 0.7em;font-family:var(--sb-mono);
  font-size:var(--sb-size-small);color:var(--sb-ink-dim)}
.sb-row.is-active{border-color:var(--sb-ink-dim)}
.sb-row.is-active span{color:var(--sb-ink)}

/* 列表模式下每一行自己带名字，底部那块常驻的名牌就成了重复信息 ——
   而且它会压在正在滚动的卡片上。删掉（§0：每多一个元素都要论证它不该被删） */
.sb-choose.is-fallback .sb-hud{display:none}

/* 可选条目 < 3：螺旋退化成横向一排（docs/23 §S2）。
   三个以下的螺旋看起来像坏了 —— 所以那一档根本不进螺旋。 */
.sb-list.is-row{grid-template-columns:repeat(var(--sb-row-n,2),minmax(0,1fr));
  align-content:center;height:100%;align-items:center}
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
    <div class="sb-brand"></div>
    <div class="sb-list" hidden></div>
    <div class="sb-hud">
      <div class="sb-name sb-bi"><span class="sb-zh"></span><span class="sb-en"></span></div>
      <div class="sb-tag"></div>
      <div class="sb-kind"></div>
    </div>
    <div class="sb-idle"><i></i></div>
    <div class="sb-hint"></div>
    <div class="sb-keys"></div>`;
  mount.appendChild(root);
  // 左对齐的那一份：`start` 说的是它落在左上角，不是"选择页的字标长这样"
  root.querySelector<HTMLElement>('.sb-brand')!.append(markNode('div', 'start'));
  const hint = root.querySelector<HTMLElement>('.sb-hint')!;
  setBi(hint, COPY.choose.hint);
  root.querySelector<HTMLElement>('.sb-keys')!.textContent = COPY.choose.keys;
  return {
    root,
    list: root.querySelector<HTMLElement>('.sb-list')!,
    // 名字这一行**必须走并置系统的类名**（sb-bi / sb-zh / sb-en）。
    // 原来它用的是 sb-cn，一个全站别处都不存在的类 —— 于是 type.css 里那条
    // 给汉字补 0.06em 左边距的规则对它不生效，而它正下方的 tagline 走 setBi、
    // 补到了。结果是同一块名牌里**两行中文自己都不对齐**，英文看起来像缩进半格。
    // 类名不一致不是风格问题，是排版规则的漏网。
    name: root.querySelector<HTMLElement>('.sb-name > .sb-zh')!,
    nameEn: root.querySelector<HTMLElement>('.sb-name > .sb-en')!,
    tag: root.querySelector<HTMLElement>('.sb-tag')!,
    kind: root.querySelector<HTMLElement>('.sb-kind')!,
    idle: root.querySelector<HTMLElement>('.sb-idle')!,
    idleFill: root.querySelector<HTMLElement>('.sb-idle i')!,
    hint,
  };
}
