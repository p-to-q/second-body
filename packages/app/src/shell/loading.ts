/**
 * 加载态 —— 观众在「打开 URL」和「身体出现」之间看见的那一屏。
 *
 * ## 它解决的那一个问题
 *
 * 在这之前，这段时间里观众看到的是**一块黑屏**。主程序要下 MediaPipe 的
 * wasm + 模型、部件 glb、选择页的 anchor 图，几 MB 起步；慢网上是十几秒。
 * 十几秒的黑屏和「坏了」在观众眼里没有区别 —— 这是整条路径上最容易流失人的一刻，
 * 而它流失人的原因不是"久"，是"不知道它是不是还活着"。
 *
 * ## 三条设计决定
 *
 * 1. **分阶段，不是一个笼统的百分比。** 一个数字只能说还要多久，说不出在等什么。
 *    「正在认识你的身体」这一行回答的是「它在干嘛」，而那才是观众真正的疑问。
 *
 * 2. **进度必须是真的。** 每一档都接在一个真实信号上：渲染器 init 是二值的，
 *    零件档读 `library.stats` 与 anchor 图的到货数，身体档读采集端的启动里程碑。
 *    没有真信号的地方**宁可停在那个数字上不动**，也不许用定时器往上爬 ——
 *    一条骗人的进度条比没有进度条更糟：它第一次骗过你，第二次你就再也不信它了。
 *
 * 3. **快的时候它根本不出现。** 宽限期 `GRACE_MS` 之内加载完就一帧都不画。
 *    `docs/23 §S0` 原本写「WebGPU 首次编译卡顿时不显示任何文字，有文字反而强调在等」——
 *    那条判断在 0.5–2 秒的尺度上是对的，所以保留成宽限期；它在十几秒的尺度上是错的，
 *    所以超过宽限期之后改成说话。两条都成立，分界就是这个常数。
 *
 * ## 和降级的衔接
 *
 * `shell/degrade.ts` 降级时会打 `sb:degrade` 事件，这里接住它，把那一行换成
 * 「画面会简单一点，它照样会动起来」—— 观众读到的是**结果**，不是"降级"这个词。
 * 启动彻底失败走 `boot-error.ts`，那一屏会先把这一层摘掉（两块浮层不许叠在一起）。
 *
 * ## 字标先到，其余后到（作品负责人 2026-09-15 裁定）
 *
 * 左上角挂的是 `ui/mark.ts` 那两行字（选择页左上角、`/about` 页头同一份组件），
 * 不是另起一个 logo：它一出现就该和后面选择页上那一份读起来是**同一件东西**，
 * 差一笔都不许。它跟着这一层的淡入一起出现，不再等三档进度——先有名字，
 * 再有细节，是这个屏该有的顺序。
 *
 * 细节（百分比、三档、总进度线）晚 `DETAIL_DELAY_MS` 才展开：字标先站稳，
 * 剩下的东西再铺开，两次出现不挤成一下。
 *
 * 缓存命中时这一层可能一闪而过——字标刚出现就被摘掉，观众根本没读到。
 * 所以只要它露过面（过了宽限期），就至少露 `MIN_SHOW_MS`：这是一段**刻意的
 * 停留**，不是没找到信号硬凑的等待，`finish()` 因此在最少展示时长上会晚收，
 * 不会晚开始（不阻塞后面的舞台/摄像头）。
 */
import { COPY, setBi, type BiText } from '../ui/i18n.ts';
import { markNode } from '../ui/mark.ts';
import type { Flags } from './kiosk.ts';
import '../ui/type.css';
import './loading.css';

/** 这么快就好了的话，观众不该看见任何东西（见文件头第 3 条） */
const GRACE_MS = 600;

/**
 * 露过面就至少露这么久：字标一闪就摘等于没出现过。
 * 只在真的到了 `is-on`（过了 `GRACE_MS`）之后才计时——瞬间加载的路径完全不受影响。
 */
const MIN_SHOW_MS = 900;

/**
 * 三档**真的**到齐（`finish()` 被调用）之后，再停这么久才走（作品负责人 2026-09-15 追加要求）。
 *
 * 和 `MIN_SHOW_MS` 管的是两件不同的事：`MIN_SHOW_MS` 保证"这一层至少露了多久"，
 * 冷启动这种早就超过它的加载不会再被它拖住——三档真的到 100% 的那一刻，`finish()` 几乎立刻
 * 就走，观众看见的是数字刚跳到 100% 画面就换了，读起来像"卡了一下就切走"，不像"到了"。
 * 这一条管的是**到齐那一刻本身**：不管加载花了 300ms 还是 30 秒，真到 100% 之后都停这么久，
 * 让百分比和三个"已就绪"有机会被看清楚，再往下走。
 *
 * 没有编造任何进度——三档还是只在真信号到齐时才到 100%（见文件头第 2 条），
 * 这一条只管"到了之后别立刻走"，不改到达那一刻本身。
 */
const DONE_HOLD_MS = 1000;

/** 字标先站稳，细节再展开的那一拍。和 `type.css` 的 `--sb-dur-move`（420ms）同一个数——这也是一次"挪到位" */
const DETAIL_DELAY_MS = 420;

/** 慢到这里开始说人话。8 秒这个数来自 docs/23 §S0 的「冷启动 > 8 秒（慢网）」 */
const SLOW_MS = 8_000;
/** 还在等：换第二句，告诉他这是一次性的 */
const SLOWER_MS = 20_000;

export type LoadStageId = 'render' | 'parts' | 'body';

/**
 * 权重 = 这一档在**观众感觉里**占多久，不是它下载多少字节。
 * 零件最重：它是唯一一档真的按文件数往前走的，也是慢网上最久的那一档。
 */
const STAGES: { id: LoadStageId; label: BiText; weight: number }[] = [
  { id: 'render', label: COPY.loading.render, weight: 0.15 },
  { id: 'parts', label: COPY.loading.parts, weight: 0.55 },
  { id: 'body', label: COPY.loading.body, weight: 0.30 },
];

export interface Loading {
  /** 这一档开始等了 */
  begin(id: LoadStageId): void;
  /** 0..1 的真实进度。倒退的值会被忽略（见 §进度只许前进） */
  progress(id: LoadStageId, value: number): void;
  /** 这一档到齐了 */
  done(id: LoadStageId): void;
  /** 全部结束：淡出并摘掉。重复调用无害 */
  finish(): void;
}

/** 什么都不做的那一个。`?loading=0` 和现场深链走这条路，调用点因此不用写 if */
const NOOP: Loading = { begin() {}, progress() {}, done() {}, finish() {} };

interface Row {
  root: HTMLElement;
  state: HTMLElement;
  value: number;
  started: boolean;
}

/**
 * 挂上加载态。`?loading=0` 时返回一个空实现 —— 拿不准这一层会不会打扰画面时，
 * 现场可以用它一键关掉，而不需要改代码或回滚（硬约束里写明了这条退路）。
 */
export function mountLoading(flags: Flags): Loading {
  if (typeof document === 'undefined' || !flags.loading) return NOOP;

  const layer = document.createElement('div');
  layer.className = 'sb-loading';
  // 它是一块"正在发生的状态"，读屏器该被告知，但不该打断观众正在读的东西
  layer.setAttribute('role', 'status');
  layer.setAttribute('aria-live', 'polite');

  // 字标：和选择页左上角、`/about` 页头同一个组件。它是这一屏第一件、也是
  // 最先站稳的东西，不跟着 `is-detailed` 走——见文件头「字标先到，其余后到」
  const mark = markNode('div', 'start');
  mark.classList.add('sb-loading-mark');
  layer.append(mark);

  const inner = document.createElement('div');
  inner.className = 'sb-loading-inner';

  // 细节：百分比 + 三档 + 总进度线，晚 `DETAIL_DELAY_MS` 才展开（`is-detailed`）。
  // 作品名已经是左上角那一份字标在说，这里不再说第二遍（entry.ts 同一条规矩：
  // 同一个名字在一屏上说两遍，读起来是版面在结巴）
  const details = document.createElement('div');
  details.className = 'sb-loading-details';

  const head = document.createElement('div');
  head.className = 'sb-load-head';
  const pct = document.createElement('span');
  pct.className = 'sb-load-pct';
  pct.textContent = '0%';
  head.append(pct);

  const rows = new Map<LoadStageId, Row>();
  const list = document.createElement('div');
  for (const stage of STAGES) {
    const root = document.createElement('div');
    root.className = 'sb-load-stage is-waiting';
    const name = document.createElement('div');
    setBi(name, stage.label);
    const state = document.createElement('div');
    state.className = 'sb-load-state';
    state.textContent = COPY.loading.waiting.zh;
    root.append(name, state);
    list.append(root);
    rows.set(stage.id, { root, state, value: 0, started: false });
  }

  const bar = document.createElement('div');
  bar.className = 'sb-load-bar';
  const fill = document.createElement('i');
  bar.append(fill);

  const note = document.createElement('p');
  note.className = 'sb-load-note';

  details.append(head, list, bar, note);
  inner.append(details);
  layer.append(inner);
  document.body.append(layer);

  const t0 = performance.now();
  let shown = 0;          // §进度只许前进：已经念出口的百分比不许退回去
  let finished = false;
  let degraded = false;
  /** 这一层真的露出来的那一刻（`is-on` 落地时）。没露过面就还是 -1 —— 见 `finish()` 的快路径 */
  let shownAt = -1;

  let detailTimer: number | undefined;
  const graceTimer = window.setTimeout(() => {
    layer.classList.add('is-on');
    shownAt = performance.now();
    detailTimer = window.setTimeout(() => layer.classList.add('is-detailed'), DETAIL_DELAY_MS);
  }, GRACE_MS);

  /** 慢网那两句。降级的那句优先级更高 —— 它解释的是画面本身会变 */
  const noteTimers = [
    window.setTimeout(() => { if (!degraded) setBi(note, COPY.loading.slow); }, SLOW_MS),
    window.setTimeout(() => { if (!degraded) setBi(note, COPY.loading.slower); }, SLOWER_MS),
  ];

  const onDegrade = (): void => {
    degraded = true;
    setBi(note, COPY.loading.degraded);
  };
  addEventListener('sb:degrade', onDegrade);

  function render(): void {
    let sum = 0;
    for (const stage of STAGES) sum += stage.weight * (rows.get(stage.id)?.value ?? 0);
    shown = Math.max(shown, Math.min(1, sum));
    // 99% 停一下比冲到 100% 再等着好：到 100 还没进去才真的像坏了
    const n = Math.min(99, Math.floor(shown * 100));
    pct.textContent = `${n}%`;
    fill.style.width = `${shown * 100}%`;
    for (const stage of STAGES) {
      const row = rows.get(stage.id);
      if (!row) continue;
      const done = row.value >= 1;
      row.root.classList.toggle('is-waiting', !row.started && !done);
      row.root.classList.toggle('is-active', row.started && !done);
      row.root.classList.toggle('is-done', done);
      // 已经开跑、但还没有任何可测的进度 → 三个点，不是 "0%"。
      // "0%" 是一个**数字**，数字不动就读成卡住了；三个点只说"在动"，
      // 而这恰好是此刻唯一为真的事（见文件头第 2 条：没有真信号的地方不许编）。
      row.state.textContent = done
        ? COPY.loading.ready.zh
        : !row.started ? COPY.loading.waiting.zh
        : row.value > 0 ? `${Math.floor(row.value * 100)}%` : '···';
    }
  }

  render();

  function cleanup(): void {
    clearTimeout(graceTimer);
    clearTimeout(detailTimer);
    for (const t of noteTimers) clearTimeout(t);
    removeEventListener('sb:degrade', onDegrade);
  }

  return {
    begin(id) {
      const row = rows.get(id);
      if (!row || finished) return;
      row.started = true;
      render();
    },
    progress(id, value) {
      const row = rows.get(id);
      if (!row || finished) return;
      row.started = true;
      // 只许前进：零件档的分母会随着预取排队变大，让它往回跳等于自己承认在瞎猜
      row.value = Math.max(row.value, Math.min(1, Math.max(0, value)));
      render();
    },
    done(id) {
      const row = rows.get(id);
      if (!row || finished) return;
      row.started = true;
      row.value = 1;
      render();
    },
    finish() {
      if (finished) return;
      finished = true;
      cleanup();
      console.info(`[loading] 加载完成，耗时 ${Math.round(performance.now() - t0)}ms`);
      // 宽限期内就结束的：一帧都没画过，直接摘掉，不要放一次没人看见的淡出
      if (!layer.classList.contains('is-on')) { layer.remove(); return; }
      // 真的到齐了，不再是"99% 假装还没到"——见 render() 里那条注释，那条只管中途
      pct.textContent = '100%';
      fill.style.width = '100%';
      // **直接摘掉，不做淡出**（作品负责人 2026-09-15 追加要求）。
      //
      // 原来这里有一步 180ms 的透明度淡出（`is-leaving`），本意是"出比进快"（docs/23 §0）。
      // 但选择页在这一刻早就已经在这一层底下了——`chooseTheme(...).then()`
      // 先叫 `loading.finish()`，选择页才第一次真正露面（main.ts 那段注释：
      // "选择页已经在屏幕上了"）。这一层的底是不透明的 `--sb-paper`，淡出的那 180ms 里
      // 底下已经站稳的选择页（连同它左上角同一份字标）就会跟这一层的字标短暂叠在一起——
      // 两份视觉上一样的东西压在同一个位置，读作"重叠"，不是过渡。
      // 直接摘掉没有这个问题：这一层消失的那一帧，底下本来就有的东西照样在，
      // 字标那个位置因此**没有变化**，读作"一直都在"，不是"先叠后收"。
      const leave = (): void => { layer.remove(); };
      // 两条下限取更大的那个：MIN_SHOW_MS 保证"这一层至少露了多久"（缓存命中时管用）；
      // DONE_HOLD_MS 保证"真到 100% 之后至少停这么久"（冷启动早就过了 MIN_SHOW_MS，
      // 不加这一条的话数字刚跳到 100% 画面就换了）。都只晚收，不晚开始——
      // 舞台、摄像头照常往下走，等的只有这一层自己摘掉
      const wait = Math.max(MIN_SHOW_MS - (performance.now() - shownAt), DONE_HOLD_MS);
      setTimeout(leave, wait);
    },
  };
}
