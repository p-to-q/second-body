/**
 * 左上角常驻的作品标识：**巨大的字标 + 一条线 + 一句话**。
 *
 * 为什么要大：这件作品的画面绝大多数时候是空的 —— 一具身体站在一片虚无里。
 * 一个礼貌的小 logo 会被那片空吞掉；一个巨大的字标反而把空**变成构图**，
 * 让那片空读作留白而不是没内容。张力来自这个反差，不来自加装饰。
 *
 * **直接用字体排，不用 SVG。** 字标的三个数（字距 −0.055em、行距 0.94、字重 600）
 * 写在 `.sb-wordmark-mark` 这一个选择器里，不进 `type.css` 的级差 ——
 * 污染的风险由作用域挡住，不需要靠换一种资产来挡。
 * 好处是少一次网络请求、可选中可搜索、颜色直接跟着 `--sb-on-stage`。
 *
 * `?kiosk=1` 下它**留着**：装置前面该有一块说明牌，那正是它。
 * 但它会和别的浮层一样在 4 秒后淡下去（`docs/23 §S4`：观众只需要知道一次）。
 */
import { bi, biHtml } from './i18n.ts';
import './wordmark.css';

export interface WordmarkOptions {
  mount?: HTMLElement;
  /** 满屏画布页：4 秒后淡下去。文档页：常亮 */
  fade?: boolean;
}

/**
 * 字标下面那一句。
 *
 * **不写"一次关于 X 与 Y 的生成实验"那一类。** 那种句子换个主语放到任何作品下面
 * 都成立，所以它等于没说。这一句要让一个不认识这件作品的人**知道自己该做什么**，
 * 并且知道会发生什么 —— 它在装置前面起的是说明牌的作用，不是海报标语。
 */
const LINE = bi(
  '站到镜头前，选一个物种。它会用你的骨架站起来。',
  'Step into frame and pick a species. It stands up on your skeleton.',
);

export function mountWordmark(opt: WordmarkOptions = {}): { dispose(): void } | null {
  const mount = opt.mount ?? document.body;
  const root = document.createElement('div');
  root.className = 'sb-wordmark';

  const a = document.createElement('a');
  a.href = '/about';
  a.className = 'sb-wordmark-link';
  a.setAttribute('aria-label', 'SEE-ME SEE-U');

  // 两行分开成两个 span：行距要压到 0.94，靠 <br> 做不到逐行控制
  const mark = document.createElement('span');
  mark.className = 'sb-wordmark-mark';
  for (const t of ['SEE-ME', 'SEE-U']) {
    const row = document.createElement('span');
    row.textContent = t;
    mark.append(row);
  }
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
