/**
 * 字标 —— 两行，右对齐，`CME / CU`。
 *
 * ## 它是什么
 *
 * `SEE ME` / `SEE U` 的口语写法：字母 C 念出来就是 see。
 * 所以它不是缩写，是**同一句话的另一种写法** —— 短到可以放进任何一个角，
 * 而读出来和巨题逐字相同。
 *
 * ## 三条决定
 *
 * 1. **用文字，不用 SVG。** 字标就是这个项目的字体排出来的两个词，
 *    没有任何一笔是画的。做成 SVG 之后它会和正文用的字体各自漂移，
 *    而且缩放、字色翻转、可选中、可被读屏念出来这几件事全都要重做一遍。
 *
 * 2. **右对齐、两行。** 两行让它成为一个**块**而不是一条线 ——
 *    一条线只是页眉上的一句话，一个块才压得住一个角。
 *    右对齐是因为它落在右上角；两行的右边缘因此和安全区是同一条线。
 *
 * 3. **它替掉了原来那行「实时交互装置 · 2026」。** 那一行说的是形式和年份，
 *    而形式和年份在展签的元数据里已经各有一行 —— 页眉上再说一遍是重复，
 *    重复的东西在极简的版面上读起来就是乱。
 */
import { setBi } from './i18n.ts';
import './mark.css';

/** 两行字标。`tag` 默认 `div`，需要参与某个 flex 行时调用方可以换成 `span`。 */
export function markNode(tag: keyof HTMLElementTagNameMap = 'div'): HTMLElement {
  const root = document.createElement(tag);
  root.className = 'sb-mark';
  // 语义上它是这件作品的名字，所以给读屏一个完整的名字，不要让它念 "C-M-E C-U"
  root.setAttribute('aria-label', 'SEE-ME SEE-U');
  for (const line of ['CME', 'CU']) {
    const row = document.createElement('span');
    row.className = 'sb-mark-line';
    row.textContent = line;
    row.setAttribute('aria-hidden', 'true');
    root.append(row);
  }
  return root;
}

/** 需要中英并置的场合（目前没有用到，留给页脚）。保持和 `markNode` 同一个类名。 */
export function markWithCaption(caption: Parameters<typeof setBi>[1]): HTMLElement {
  const root = markNode();
  const cap = document.createElement('span');
  cap.className = 'sb-mark-caption';
  setBi(cap, caption);
  root.append(cap);
  return root;
}
