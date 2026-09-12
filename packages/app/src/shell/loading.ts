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
 */
import { COPY, setBi, type BiText } from '../ui/i18n.ts';
import type { Flags } from './kiosk.ts';
import '../ui/type.css';
import './loading.css';

/** 这么快就好了的话，观众不该看见任何东西（见文件头第 3 条） */
const GRACE_MS = 600;

/** 出场动效 180ms（docs/23 §0），放完再从 DOM 里摘掉 */
const LEAVE_MS = 180;

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

  const inner = document.createElement('div');
  inner.className = 'sb-loading-inner';

  const head = document.createElement('div');
  head.className = 'sb-load-head';
  const work = document.createElement('span');
  work.className = 'sb-label';
  work.textContent = `${COPY.title.zh} · ${COPY.title.en}`;
  const pct = document.createElement('span');
  pct.className = 'sb-load-pct';
  pct.textContent = '0%';
  head.append(work, pct);

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

  inner.append(head, list, bar, note);
  layer.append(inner);
  document.body.append(layer);

  const t0 = performance.now();
  let shown = 0;          // §进度只许前进：已经念出口的百分比不许退回去
  let finished = false;
  let degraded = false;

  const graceTimer = window.setTimeout(() => layer.classList.add('is-on'), GRACE_MS);

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
      layer.classList.add('is-leaving');
      setTimeout(() => layer.remove(), LEAVE_MS);
    },
  };
}
