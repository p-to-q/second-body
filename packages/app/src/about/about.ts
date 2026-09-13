/**
 * `/about` —— 作品陈述页。
 *
 * ## 它为谁写
 *
 * 不为开发者。README 已经是给开发者的了。这一页面对的是**第一次听说这件作品的人**：
 * 一个观众、一个评委。判据只有一条 —— 看完之后他能说出「它是什么」和
 * 「它和 2019 年那件的区别在哪」。页面上每一段都要为这两句话服务，否则删掉。
 *
 * ## 三条纪律
 *
 * 1. **不写没做到的事。** `docs/25-COMPLETENESS.md` 的 A 表里带 ❌ / ❓ 的条目，
 *    要么不提，要么用 `about.spec`（规格）标出来。慢回路是这件作品概念上的核心，
 *    但它一行代码没写 —— 所以它在这一页上是「设计如此」，不是「已经做到」。
 *    这条比好看重要。
 * 2. **数字从 `parts.json` 现读。** 23 / 191 / 10 / 9 这些数写死在文案里，
 *    第一次改资产就会变成谎话。这一页要么读到真数据，要么不显示这一节。
 * 3. **所有面向观众的字来自 `COPY`。** 这里一个中文字面量都不该出现。
 *
 * 页面是**并置双语**（`src/ui/i18n.ts` 的文件头解释了为什么不做切换）。
 */
import type { PartLibraryIndex } from '../../../core/src/types.ts';
import { COPY, setBi, type BiText } from '../ui/i18n.ts';
import { PLAN_LABEL, orderThemes, planKind, speciesNumber } from '../ui/species.ts';
import { markNode } from '../ui/mark.ts';
import '../ui/type.css';
import '../ui/editorial.css';
import './about.css';

const REPO = 'https://github.com/p-to-q/second-body';
const REFERENCE_URL = 'https://www.universaleverything.com/media-art/future-you';

// ─────────────────────────── DOM 小工具 ───────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, className?: string, ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...kids);
  return node;
}

/** 双语块。中文为主、英文为辅 —— 排版规则在 type.css 的 `.sb-bi` */
function biEl<K extends keyof HTMLElementTagNameMap>(tag: K, t: BiText, className?: string) {
  const node = el(tag, className);
  setBi(node, t);   // setBi 自己会补上 .sb-bi
  return node;
}

/** 行内双语（中 | 英），给短标签用 */
function biInline(t: BiText, className?: string): HTMLSpanElement {
  const node = biEl('span', t);
  node.classList.add('sb-bi-inline');
  if (className) node.classList.add(className);
  return node;
}

/** 「规格」标记。已实现的东西**什么都不标** —— 默认停在诚实的那一侧 */
function specTag(): HTMLSpanElement {
  return biInline(COPY.about.spec, 'about-tag');
}

/**
 * 「现场限定」标记 —— 跑通了，但只在装置那台机器上活着。
 * 它和 specTag 是两回事，不要合并：合并之后无论用哪一个都在撒谎。
 */
function onsiteTag(): HTMLSpanElement {
  return biInline(COPY.about.onsite, 'about-tag');
}

/**
 * 左标签 / 右正文：这一页唯一的分节构型。
 * 左栏吸顶（`.ed-section__tag`）—— 长页面里"我在读哪一节"由版面自己回答，
 * 所以这一页不需要导航条。
 */
function section(title: BiText, ...body: Node[]): HTMLElement {
  return el('section', 'ed-section',
    biEl('h2', title, 'ed-section__tag'),
    el('div', 'ed-section__body', ...body));
}

/** 序号。两位，等宽对齐 —— 这一页的"档案感"一半来自数字能对齐（docs/23 §0） */
function ord(i: number): HTMLSpanElement {
  const n = el('span', 'sb-label sb-num');
  n.textContent = String(i + 1).padStart(2, '0');
  return n;
}

function num(n: number): HTMLSpanElement {
  const s = el('span', 'about-count-n sb-num');
  s.textContent = String(n);
  return s;
}

// ─────────────────────────── 各节 ───────────────────────────

/**
 * 首屏。整页只做**一个**断言：这件作品叫什么。
 * 别的全部推到折线以下 —— 一个只停留五秒的人带走的就是这一屏，
 * 所以这一屏上多一样东西，就少记住一样东西。
 */
function head(): HTMLElement {
  const back = el('a', 'sb-label');
  back.setAttribute('href', '/');
  setBi(back, COPY.about.back);
  back.classList.add('sb-bi-inline');

  const title = biEl('h1', COPY.title, 'sb-display ed-rise');
  // 中文和英文各自是一段揭示（--ed-i 是它们的先后）。分段而不是整块，
  // 是因为整块淡入读作"网页加载完了"，分段才读作"有人在把它揭开"
  title.querySelector('.sb-zh')?.setAttribute('style', '--ed-i:0');
  title.querySelector('.sb-en')?.setAttribute('style', '--ed-i:1');

  return el('header', 'ed-hero',
    el('div', 'ed-hero__meta', back, markNode('span')),
    el('hr', 'ed-rule ed-rule--heavy'),
    el('div', 'ed-hero__title', title),
    el('hr', 'ed-rule'),
    el('div', 'ed-hero__lede', biEl('p', COPY.subtitle, 'about-lede')),
  );
}

/**
 * 作品陈述 —— **这一页唯一不是我们写的那一节。**
 *
 * 为什么排在首屏之后、「它是什么」之前：展签的次序是"谁做的、他说了什么"，
 * 然后才轮到我们解释它怎么运作。把陈述压到页尾等于说它是附录。
 *
 * 三处排版决定，理由都在 `about.css` 的 `.about-statement`：
 * 中文立意句走楷书（叙事性中文），那一行英文原句走 grotesk 且**不配中文**，
 * 五个概念的中文注是**术语**不是叙事，所以留在 grotesk 里（`LXGWWenKai/NOTICE.md` 的边界）。
 */
function statementSection(): HTMLElement {
  const call = el('p', 'about-statement__call');
  call.lang = 'en';
  call.textContent = COPY.about.statementCall;

  const list = el('dl', 'about-concepts');
  for (const c of COPY.about.concepts) {
    const term = el('dt', 'about-concept__term');
    term.lang = 'en';
    term.textContent = c.term;
    list.append(el('div', 'about-concept', term, el('dd', 'about-concept__zh', c.zh)));
  }

  return section(COPY.about.statementTitle,
    biInline(COPY.about.statementSource, 'sb-label'),
    biEl('p', COPY.about.statementLead, 'about-lede about-statement__lead'),
    // 陈述里唯一的问句。它的正本在 `COPY.entry`（入口层先用它），这里**取同一个常量**，
    // 不抄第二份 —— 原文存两份，迟早有一份不再是原文
    biEl('p', COPY.entry.question, 'about-lede about-statement__lead'),
    call,
    biInline(COPY.about.conceptsTitle, 'sb-label'),
    list);
}

/** 它是什么：一句话 + 观众的 90 秒（`docs/PRD §2` 那张图，搬到 web 上） */
function whatSection(): HTMLElement {
  const steps: [BiText, BiText, boolean][] = [
    [COPY.about.steps.see, COPY.about.steps.seeNote, true],
    [COPY.about.steps.choose, COPY.about.steps.chooseNote, true],
    [COPY.about.steps.become, COPY.about.steps.becomeNote, true],
    [COPY.about.steps.discover, COPY.about.steps.discoverNote, true],
    // 留念（S7）的分支还没合并（docs/25 B1）—— 它在这一页上只能是规格
    [COPY.about.steps.leave, COPY.about.steps.leaveNote, false],
  ];

  const band = el('div', 'about-steps');
  steps.forEach(([name, note, built], i) => {
    const step = el('div', 'about-step', ord(i), biEl('h3', name), biEl('p', note));
    if (!built) step.append(specTag());
    band.append(step);
  });

  return section(COPY.about.whatTitle,
    biEl('p', COPY.about.whatLead, 'about-lede'),
    biInline(COPY.about.ninety, 'sb-label'),
    band,
    biEl('p', COPY.about.legend, 'about-note'),
  );
}

/** 为什么：对标 2019，以及**唯一**的区别 —— 这一节是整页的论点 */
function whySection(): HTMLElement {
  const ref = el('a', 'sb-bi sb-bi-inline');
  ref.setAttribute('href', REFERENCE_URL);
  ref.setAttribute('rel', 'noreferrer');
  setBi(ref, COPY.about.reference);
  ref.classList.add('sb-bi-inline');

  const fast = el('div', 'about-loop',
    el('div', 'about-loop-head', biEl('h3', COPY.about.fastLoop)),
    biEl('p', COPY.about.fastLoopNote));
  const slow = el('div', 'about-loop',
    el('div', 'about-loop-head', biEl('h3', COPY.about.slowLoop), onsiteTag()),
    biEl('p', COPY.about.slowLoopNote));

  return section(COPY.about.whyTitle,
    el('p', undefined, ref),
    biEl('p', COPY.about.whyRef),
    biEl('p', COPY.about.whyDiff, 'about-lede'),
    el('div', 'about-loops', fast, slow),
    biEl('p', COPY.about.slowLoopHonest, 'about-note'),
    biEl('p', COPY.about.slowLoopWhy),
  );
}

/** 底下是什么：三层 + 47,000 那条硬主张 */
function howSection(index: PartLibraryIndex | null): HTMLElement {
  const layers: [BiText, BiText][] = [
    [COPY.about.layers.pose, COPY.about.layers.poseNote],
    [COPY.about.layers.plan, COPY.about.layers.planNote],
    [COPY.about.layers.express, COPY.about.layers.expressNote],
  ];
  const list = el('ul', 'about-list');
  layers.forEach(([name, note], i) => {
    list.append(el('li', undefined, ord(i), el('div', undefined, biEl('h3', name), biEl('p', note))));
  });

  const body: Node[] = [list, biEl('h3', COPY.about.combTitle), biEl('p', COPY.about.combBody)];

  // 纪律 2：数字现读。读不到就整条不显示 —— 宁可少一节，也不要一个过期的数字
  if (index) {
    const slots = new Set(index.parts.map((p) => p.slot));
    const plans = new Set(index.themes.map(planKind));
    const counts: [BiText, number][] = [
      [COPY.about.counts.species, index.themes.length],
      [COPY.about.counts.plans, plans.size],
      [COPY.about.counts.parts, index.parts.length],
      [COPY.about.counts.slots, slots.size],
      [COPY.about.counts.materials, index.materials.length],
    ];
    const strip = el('div', 'about-counts');
    for (const [label, n] of counts) {
      strip.append(el('div', undefined, num(n), biInline(label, 'sb-label')));
    }
    body.push(strip);
  }

  return section(COPY.about.howTitle, ...body);
}

// ─────────────────────────── 物种谱系 ───────────────────────────

const SVG = 'http://www.w3.org/2000/svg';
function svg<K extends keyof SVGElementTagNameMap>(
  tag: K, attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/**
 * 标记的**形状**编码身体方案，位置编码形态空间坐标。
 * 为什么不用颜色区分：§0 的强调色是跟着当前物种走的，不是一套分类色板；
 * 而且形状在黑白印刷和投影上都活得下来，颜色不一定。
 */
function planMark(kind: string, x: number, y: number): SVGElement {
  switch (kind) {
    case 'quadruped':   // 横的、矮的 —— 和它在场上的剪影一致
      return svg('rect', { class: 'plot-mark', x: x - 7, y: y - 3.5, width: 14, height: 7, rx: 3.5 });
    case 'mass':        // 实心：团块没有槽位件，是一整坨
      return svg('circle', { class: 'plot-mark-fill', cx: x, cy: y, r: 5 });
    case 'stub':        // 方的、墩的
      return svg('rect', { class: 'plot-mark', x: x - 4.5, y: y - 4.5, width: 9, height: 9 });
    default:            // rig：空心圆
      return svg('circle', { class: 'plot-mark', cx: x, cy: y, r: 5 });
  }
}

function speciesSection(index: PartLibraryIndex): HTMLElement {
  const themes = orderThemes(index.themes);

  // 视窗比原来扁得多（1600×620）：这张图要横着占满一整幅，
  // 扁的画幅才读作"一条谱系"，方的画幅读作"一张插图"
  const W = 1600, H = 620, PAD = 72;
  const px = (v: number) => PAD + v * (W - PAD * 2);
  const py = (v: number) => H - PAD - v * (H - PAD * 2);

  const plot = svg('svg', {
    class: 'about-plot', viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': `${COPY.about.speciesTitle.zh} / ${COPY.about.speciesTitle.en}`,
  });
  plot.append(
    svg('line', { class: 'plot-axis', x1: PAD, y1: H - PAD, x2: W - PAD, y2: H - PAD }),
    svg('line', { class: 'plot-axis', x1: PAD, y1: PAD, x2: PAD, y2: H - PAD }),
  );

  // 轴名用现成的 COPY.choose.axes —— 轮播上写的是哪两根轴，这里就是哪两根
  const axisX = svg('text', { x: W - PAD, y: H - PAD + 26, 'text-anchor': 'end', 'font-size': 11 });
  axisX.textContent = `${COPY.choose.axes.humanLike.zh} / ${COPY.choose.axes.humanLike.en} →`;
  const axisY = svg('text', {
    x: 0, y: 0, 'text-anchor': 'end', 'font-size': 11,
    transform: `translate(${PAD - 14}, ${PAD}) rotate(-90)`,
  });
  axisY.textContent = `← ${COPY.choose.axes.lifeLike.zh} / ${COPY.choose.axes.lifeLike.en}`;
  plot.append(axisX, axisY);

  themes.forEach((t, i) => {
    const x = px(t.axes.humanLike);
    const y = py(t.axes.lifeLike);
    plot.append(planMark(planKind(t), x, y));
    const label = svg('text', { class: 'plot-n', x: x + 9, y: y + 3.5 });
    label.textContent = speciesNumber(i);
    plot.append(label);
  });

  // 图例：形状 → 身体方案。只列真正用到的那几种
  const used = [...new Set(themes.map(planKind))];
  const legend = el('div', 'about-legend');
  for (const kind of used) {
    const key = svg('svg', { width: 20, height: 14, viewBox: '0 0 20 14' });
    key.classList.add('about-plot');
    key.append(planMark(kind, 10, 7));
    const label = PLAN_LABEL[kind];
    legend.append(el('div', 'about-legend-item', key,
      label ? biInline(label, 'sb-label') : el('span', 'sb-label', kind)));
  }

  // 编号对照表 —— 散点上只有号，名字在这里。号码和 /dev/poster.html 上的是同一套
  const list = el('ul', 'about-species');
  themes.forEach((t, i) => {
    const n = el('span', 'sb-label sb-num');
    n.textContent = speciesNumber(i);
    const name = el('span');
    setBi(name, { zh: t.name, en: t.nameEn });
    list.append(el('li', undefined, n, name));
  });

  // 这一节**不走两栏**：散点图是这一页的关键视觉，它要横着占满一整幅。
  // 塞进右栏（7/12 幅）就退回成插图了，而插图是没人记得住的。
  const sec = section(COPY.about.speciesTitle, biEl('p', COPY.about.speciesLead));
  sec.classList.add('about-species-sec');
  const band = el('div', 'about-band', plot, legend, list);
  sec.append(band);
  return sec;
}

function privacySection(): HTMLElement {
  // 网页版必须在页面上有这一段（docs/13 §5）。放在署名之前，不折叠、不藏。
  return section(COPY.about.privacyTitle,
    biEl('p', COPY.privacy.short, 'about-lede'),
    biEl('p', COPY.privacy.long));
}

function creditsSection(): HTMLElement {
  // 顺序有意：carve5（真实机器几何）紧挨着 carve3（生成件），因为它们回答的是同一个问题 ——
  // 这具身体上的每一块是从哪里来的。放在最后的仍然是"这是一件装置"那一条。
  const carves = [COPY.about.carve1, COPY.about.carve2, COPY.about.carve3, COPY.about.carve5, COPY.about.carve4];
  const list = el('ul', 'about-list');
  carves.forEach((t, i) => {
    list.append(el('li', undefined, ord(i), el('div', undefined, biEl('p', t))));
  });

  const repo = el('a', 'sb-data');
  repo.setAttribute('href', REPO);
  repo.setAttribute('rel', 'noreferrer');
  repo.textContent = REPO;

  return section(COPY.about.creditsTitle,
    biEl('p', COPY.about.licence), list,
    el('p', 'about-foot', biInline(COPY.about.repo, 'sb-label'), repo));
}

// ─────────────────────────── 装配 ───────────────────────────

/**
 * `parts.json` 读不到不是错误 —— 和运行时一样（ADR-4）：少两节，页面照常打开。
 * 陈述页在一台断网的笔记本上也要能打开，那正是现场最可能发生的情况。
 */
async function loadIndex(): Promise<PartLibraryIndex | null> {
  try {
    const res = await fetch('/parts/parts.json');
    if (!res.ok) return null;
    const json = (await res.json()) as PartLibraryIndex;
    return Array.isArray(json?.themes) && Array.isArray(json?.parts) ? json : null;
  } catch { return null; }
}

export async function renderAbout(root: HTMLElement = document.body): Promise<void> {
  document.title = `${COPY.title.zh} · ${COPY.title.en}`;
  // index.html 为了体验页把 html/body 钉成了不滚动的一屏。陈述页是要读的，放开。
  document.documentElement.style.cssText = 'overflow:auto;height:auto';
  document.body.style.cssText = 'overflow:auto;height:auto';
  root.classList.add('ed');
  const page = el('main', 'about');
  page.append(head(), statementSection(), whatSection(), whySection());
  root.append(page);

  const index = await loadIndex();
  page.append(howSection(index));
  if (index) page.append(speciesSection(index));
  page.append(privacySection(), creditsSection());
}
