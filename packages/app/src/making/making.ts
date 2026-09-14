/**
 * `/making` —— 人机共创过程档案页。
 *
 * ## 这一页是什么
 *
 * 不是技术文档，是作品的一部分。它展示的是这件作品**怎么被做出来的**：
 * 人和代理怎么一起做决定、怎么互相纠正、怎么在不确定的时候停下来问。
 *
 * ## 三条自我约束
 *
 * 1. **每一条都能指到一个 commit。** 时间线、纠正案例、原则背后的事故 ——
 *    全部来自 `git log`，hash 和时间直接印在页面上，读者可以自己去核。
 *    挖不到证据的事不写，写进「这一页没有写的」那一节留着空着。
 * 2. **文案全部来自 `ui/i18n.ts` 的 `COPY.making`。** 这一页一个字符串都不自带 ——
 *    否则中英对照永远会有几句漏掉（见 i18n.ts 的纪律那一节）。
 * 3. **视觉是档案，不是仪表盘。** 用 `type.css` 的细横线分区：没有卡片、没有图标、
 *    没有进度条、没有百分比环。数据一律等宽 + `tabular-nums`。
 *    仪表盘的语言会把「这里发生过一次判断」读成「这里有个指标」。
 *
 * ## 版式
 *
 * 一条固定宽度的左栏放**元数据**（commit hash / 时间 / 编号 / 数值），
 * 右栏放**内容**。这是档案的基本构型：坐标在左，事情在右，扫一眼左栏就是一份索引。
 * 窄屏下左栏塌到内容上方（见 making.html 的 media query），顺序不变。
 */
import { COPY, setBi, type BiText } from '../ui/i18n.ts';
import { markNode } from '../ui/mark.ts';
import { mountNav } from '../ui/nav.ts';
import { heroMeta } from '../ui/hero.ts';

const M = COPY.making;

// ── 小工具 ──────────────────────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, className?: string, parent?: Element,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  parent?.append(node);
  return node;
}

/** 双语块。文案一律走 setBi —— 这一页不自己拼中英文 */
function biBlock(parent: Element, t: BiText, className?: string): HTMLElement {
  const node = el('div', className, parent);
  setBi(node, t);
  return node;
}

/** 元数据（左栏）+ 内容（右栏）。全页只有这一种行构型 */
function row(parent: Element, meta: string[], className = ''): HTMLElement {
  const r = el('div', `mk-row ${className}`.trim(), parent);
  const m = el('div', 'mk-meta sb-data sb-num', r);
  for (const line of meta) el('div', 'mk-meta-line', m).textContent = line;
  return el('div', 'mk-body', r);
}

function section(root: Element, id: string, heading: BiText, note?: BiText): HTMLElement {
  const s = el('section', 'mk-section', root);
  s.id = id;
  el('hr', 'sb-rule', s);
  const head = el('div', 'mk-row mk-head', s);
  const h = el('h2', '', el('div', 'mk-meta', head));
  setBi(h, heading);
  const body = el('div', 'mk-body', head);
  if (note) biBlock(body, note, 'mk-note');
  return s;
}

// ── 题头 ────────────────────────────────────────────────────────────────────

/**
 * 开场。这一页底下是一份很密的档案 —— 密度是对的，但密度自己撑不住一页：
 * 一上来就是 commit hash，读者不知道自己在读什么。所以前面先放一次
 * 巨大的断言（题 + 论点），把整份档案挂在它下面。
 */
function renderHeader(root: Element): void {
  const head = el('header', 'ed-hero', root);

  head.append(heroMeta('/about'));

  el('hr', 'ed-rule ed-rule--heavy', head);

  const titleBox = el('div', 'ed-hero__title', head);
  const h1 = el('h1', 'sb-display ed-rise', titleBox);
  setBi(h1, M.title);
  h1.querySelector('.sb-zh')?.setAttribute('style', '--ed-i:0');
  h1.querySelector('.sb-en')?.setAttribute('style', '--ed-i:1');

  el('hr', 'ed-rule', head);

  // 论点靠右栏，左边那一半是空的 —— 空得明显，才读作"这里只有一句话"
  const lede = el('div', 'ed-hero__lede', head);
  const col = el('div', '', lede);
  biBlock(col, M.thesis, 'mk-thesis');
  biBlock(col, M.lede, 'mk-lede');
}

// ── 数字 ────────────────────────────────────────────────────────────────────

function renderNumbers(root: Element): void {
  const s = section(root, 'numbers', M.sec.numbers, M.numbersNote);
  const list = el('div', 'mk-list', s);
  for (const n of M.numbers) {
    const body = row(list, [n.value], 'mk-number');
    biBlock(body, n.label, 'mk-number-label');
    biBlock(body, n.note, 'mk-note');
  }
}

// ── 时间线 ──────────────────────────────────────────────────────────────────

function renderTimeline(root: Element): void {
  const s = section(root, 'timeline', M.sec.timeline, M.timelineNote);
  const list = el('div', 'mk-list', s);
  for (const t of M.timeline) {
    // 左栏三行：hash / 日期 / 时刻。日期是第二天的条目进来之后加的 ——
    // 整条线只在一天里的时候，一个光秃秃的 14:24 不会有歧义；两天之后它会。
    const body = row(list, [t.hash, t.day, t.time]);
    biBlock(body, t.text);
  }
}

// ── 互相纠正 ────────────────────────────────────────────────────────────────

function renderCorrections(root: Element): void {
  const s = section(root, 'corrections', M.sec.corrections, M.correctionsNote);
  const list = el('div', 'mk-list', s);
  for (const c of M.corrections) {
    const item = el('article', 'mk-case', list);

    const head = row(item, [c.no], 'mk-case-head');
    const h3 = el('h3', '', head);
    setBi(h3, c.title);
    el('div', 'mk-refs sb-data sb-num', head).textContent = c.refs.join('  ·  ');

    // 四段式。每一件都用同一个结构展开，所以它们可以被并排读
    const turns: ReadonlyArray<readonly [BiText, BiText]> = [
      [M.turn.said, c.said],
      [M.turn.against, c.against],
      [M.turn.because, c.because],
      [M.turn.result, c.result],
    ];
    for (const [label, text] of turns) {
      const turn = el('div', 'mk-row mk-turn', item);
      const labelCell = el('div', 'mk-meta', turn);
      biBlock(labelCell, label, 'mk-turn-label sb-label');
      biBlock(el('div', 'mk-body', turn), text);
    }
  }
}

// ── P11–P21 ─────────────────────────────────────────────────────────────────

function renderPrinciples(root: Element): void {
  const s = section(root, 'principles', M.sec.principles, M.principlesNote);
  const list = el('div', 'mk-list', s);
  for (const p of M.principles) {
    const body = row(list, [p.id], 'mk-principle');
    const h3 = el('h3', '', body);
    setBi(h3, p.title);
    biBlock(body, p.story, 'mk-story');
    biBlock(body, p.rule, 'mk-rule');
  }
}

// ── 这一页没有写的 ──────────────────────────────────────────────────────────

function renderGaps(root: Element): void {
  const s = section(root, 'gaps', M.sec.gaps, M.gapsLede);
  const list = el('div', 'mk-list', s);
  for (const g of M.gaps) biBlock(row(list, ['—']), g);
}

// ── 收口 ────────────────────────────────────────────────────────────────────

function renderFooter(root: Element): void {
  el('hr', 'sb-rule', root);
  const foot = el('footer', 'mk-footer', root);
  biBlock(foot, M.footer, 'mk-note');
}

export function renderMaking(root: Element): void {
  renderHeader(root);
  renderNumbers(root);
  renderTimeline(root);
  renderCorrections(root);
  renderPrinciples(root);
  renderGaps(root);
  renderFooter(root);
}

const mount = document.querySelector('#mk');
if (mount) renderMaking(mount);
mountNav();
