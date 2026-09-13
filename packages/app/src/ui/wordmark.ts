/**
 * 左上角常驻的作品标识：**巨大的字标 + 一条线 + 一句话**。
 *
 * 为什么要大：这件作品的画面绝大多数时候是空的 —— 一具身体站在一片虚无里。
 * 一个礼貌的小 logo 会被那片空吞掉；一个巨大的字标反而把空**变成构图**，
 * 让那片空读作留白而不是没内容。张力来自这个反差，不来自加装饰。
 *
 * 为什么用 SVG 而不是排文字：字标的字距是 −0.055em、行距 0.94em
 * （`assets/brand/logo/README.md`），这两个数只在字标上成立，
 * 不该污染 `type.css` 的级差。而且 SVG 是轮廓，任何机器上都一样。
 * `fill="currentColor"` 让它跟着 `--sb-on-stage` 走 —— 白展厅下自动变深。
 *
 * `?kiosk=1` 下它**留着**：装置前面该有一块说明牌，那正是它。
 * 但它会和别的浮层一样在 4 秒后淡下去（`docs/23 §S4`：观众只需要知道一次）。
 */
import { bi, biHtml } from './i18n.ts';
import './wordmark.css';

const LOGO = '/logo/logo-currentcolor.svg';

export interface WordmarkOptions {
  mount?: HTMLElement;
  /** 满屏画布页：4 秒后淡下去。文档页：常亮 */
  fade?: boolean;
}

/** 字标下面那一句。取自作品陈述的第一句 —— 它是这件事最短的完整说法 */
const LINE = bi(
  '一次关于身体、观看与对抗的生成实验',
  'A generative experiment on body, seeing and resistance',
);

export function mountWordmark(opt: WordmarkOptions = {}): { dispose(): void } | null {
  const mount = opt.mount ?? document.body;
  const root = document.createElement('div');
  root.className = 'sb-wordmark';

  const a = document.createElement('a');
  a.href = '/about';
  a.className = 'sb-wordmark-link';
  a.setAttribute('aria-label', 'SEE-ME SEE-U');

  // <img> 而不是内联 SVG：它是一个**标识**不是一段内容，
  // 内联进来只会让每一页的 DOM 里多 13 条路径数据。
  // currentColor 在 <img> 里不生效，所以用 mask 让它取 CSS 颜色（见 wordmark.css）。
  const mark = document.createElement('span');
  mark.className = 'sb-wordmark-mark';
  mark.style.setProperty('--mark', `url("${LOGO}")`);
  a.append(mark);

  const line = document.createElement('p');
  line.className = 'sb-wordmark-line';
  line.innerHTML = biHtml(LINE);

  root.append(a, line);
  mount.append(root);

  let timer = 0;
  if (opt.fade) {
    timer = window.setTimeout(() => root.classList.add('is-faded'), 4000);
  }
  return {
    dispose() {
      clearTimeout(timer);
      root.remove();
    },
  };
}
