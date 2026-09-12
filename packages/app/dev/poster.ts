/**
 * `/dev/poster.html` —— 静帧海报。
 *
 * ## 它要回答的那一条判据
 *
 * `docs/PRD §5` 第 3、4 条：三个物种并排，对方能说出它们**形体**上的区别；
 * 随手一张静帧发出去，对方问的是"这是什么作品"而不是"你在做什么项目"。
 * 所以这一页不是一个网页，是一块**标本板**：并排、编号、等距、一条基线。
 *
 * ## 三个决定
 *
 * 1. **编号和 `/about` 是同一套**（`src/ui/species.ts` 的 `orderThemes`）。
 *    观众拿着海报要能对上页面上的散点图，对不上的话那两个数字都白标了。
 *    所以编号按全部 23 个物种排，缺图的位置就**留出空号** —— 空号是对的，
 *    它说明那个物种存在、只是没有标本图，而不是编号乱了。
 * 2. **图用 `_anchor.png` 反相。** 那些图是在浅底上渲染的（assets/refs/README.md），
 *    反相后底色正好落到近黑，和这套视觉语言对得上，不需要重新出图。
 * 3. **固定 1600×1000 的画布**，缩放去适配视口。截图出来永远是同一个比例，
 *    这才叫"能直接用"。
 *
 * 它放在 `dev/` 是因为不进生产包（vite 只打 index.html），但它面向的是观众，
 * 所以文案一律走 `COPY` —— 和陈述页同一套中英对照。
 */
import type { PartLibraryIndex, ThemeDef } from '../../core/src/types.ts';
import { COPY, setBi, type BiText } from '../src/ui/i18n.ts';
import { PLAN_LABEL, orderThemes, planKind, speciesNumber } from '../src/ui/species.ts';
import '../src/ui/type.css';
import './poster.css';

const POSTER_W = 1600;
const POSTER_H = 1000;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, className?: string, ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...kids);
  return node;
}

function biEl<K extends keyof HTMLElementTagNameMap>(tag: K, t: BiText, className?: string) {
  const node = el(tag, className);
  setBi(node, t);
  return node;
}

function plate(theme: ThemeDef, i: number): HTMLElement {
  const img = el('img', 'plate-img');
  img.src = `/refs/${theme.id}/_anchor.png`;
  img.alt = `${theme.name} / ${theme.nameEn}`;
  img.loading = 'eager';

  const n = el('span', 'plate-n sb-label sb-num');
  n.textContent = speciesNumber(i);

  const name = el('div', 'plate-name');
  setBi(name, { zh: theme.name, en: theme.nameEn });

  const planLabel = PLAN_LABEL[planKind(theme)];
  const plan = el('div', 'plate-plan sb-label');
  if (planLabel) setBi(plan, planLabel);
  else plan.textContent = planKind(theme);
  plan.classList.add('sb-bi-inline');

  const node = el('figure', 'plate', img, n, name, plan);
  node.style.margin = '0';
  // 没有标本图的物种（field / 嘉宾）整格撤掉 —— 空图框比空号难看得多
  img.addEventListener('error', () => node.remove());
  return node;
}

function counts(index: PartLibraryIndex): HTMLElement {
  const plans = new Set(index.themes.map(planKind));
  const slots = new Set(index.parts.map((p) => p.slot));
  const rows: [BiText, number][] = [
    [COPY.about.counts.species, index.themes.length],
    [COPY.about.counts.plans, plans.size],
    [COPY.about.counts.parts, index.parts.length],
    [COPY.about.counts.slots, slots.size],
    [COPY.about.counts.materials, index.materials.length],
  ];
  const strip = el('div', 'poster-counts');
  for (const [label, n] of rows) {
    const b = el('b');
    b.classList.add('sb-num');
    b.textContent = String(n);
    const cell = el('div', 'poster-count', b, biEl('div', label, 'sb-label'));
    strip.append(cell);
  }
  return strip;
}

/** 视口多大都给同一张图：等比缩放，不裁不拉 */
function fitToViewport(poster: HTMLElement): void {
  const apply = () => {
    const s = Math.min(innerWidth / POSTER_W, innerHeight / POSTER_H);
    poster.style.transform = `scale(${s})`;
  };
  apply();
  addEventListener('resize', apply);
}

async function main(): Promise<void> {
  const mount = document.getElementById('fit');
  if (!mount) return;

  const res = await fetch('/parts/parts.json');
  const index = (await res.json()) as PartLibraryIndex;

  const poster = el('div', 'poster');

  const head = el('div', 'poster-head',
    el('div', undefined, biEl('h1', COPY.title), biEl('p', COPY.subtitle, 'poster-lede')),
    el('div', 'poster-meta', biEl('div', COPY.about.credit, 'sb-label')),
  );

  const grid = el('div', 'poster-grid');
  orderThemes(index.themes).forEach((t, i) => grid.append(plate(t, i)));

  const foot = el('div', 'poster-foot',
    counts(index),
    biEl('p', COPY.about.combTitle, 'poster-claim'),
  );

  poster.append(head, el('hr', 'poster-rule'), grid, el('hr', 'poster-rule'), foot);
  mount.append(poster);
  fitToViewport(poster);
}

void main();
