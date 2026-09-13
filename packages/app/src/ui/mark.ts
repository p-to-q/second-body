/**
 * 字标 —— 两行，右对齐，`SEE-ME / SEE-U`。
 *
 * 短到可以放进任何一个角，读出来和巨题逐字相同。
 *
 * **用文字，不用 SVG。** 字标就是这个项目的字体排出来的两个词，
 * 没有任何一笔是画的。做成 SVG 之后它会和正文用的字体各自漂移，
 * 而且缩放、字色翻转、可选中、可被读屏念出来这几件事全都要重做一遍。
 *
 * 它替掉了原来那行「实时交互装置 · 2026」：那一行说的形式和年份，
 * 在展签的元数据里已经各有一行 —— 页眉上再说一遍是重复。
 *
 * 右对齐、两行。两行让它成为一个**块**而不是一条线 ——
 * 一条线只是页眉上的一句话，一个块才压得住一个角。
 * 右对齐是因为它落在右上角；两行的右边缘因此和安全区是同一条线。
 */
import './mark.css';

/** 两行字标。`tag` 默认 `div`，需要参与某个 flex 行时调用方可以换成 `span`。 */
export function markNode(tag: keyof HTMLElementTagNameMap = 'div'): HTMLElement {
  const root = document.createElement(tag);
  root.className = 'sb-mark';
  root.setAttribute('aria-label', 'SEE-ME SEE-U');
  for (const line of ['SEE-ME', 'SEE-U']) {
    const row = document.createElement('span');
    row.className = 'sb-mark-line';
    row.textContent = line;
    row.setAttribute('aria-hidden', 'true');
    root.append(row);
  }
  return root;
}
