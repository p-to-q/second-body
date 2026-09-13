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

/**
 * 靠哪一边。**它说的是这个块落在哪个角，不是谁挂了它。**
 *
 * 原来这件事写成 `.sb-entry .sb-mark`（一条宿主选择器）。那条规则在
 * 2026-09-13 走查时已经**指不到任何东西** —— `.sb-entry` 里根本没有字标，
 * 而字标真正的第二个落点（选择页的左上角）来了之后，照那个写法只会再抄一条
 * `.sb-choose .sb-mark`，第三个角再抄第三条。对齐是**位置的属性**：
 * 右上角的块右对齐，左上角的块左对齐，和哪一页挂的它无关。
 */
export type MarkAlign = 'end' | 'start';

/**
 * 两行字标。`tag` 默认 `div`，需要参与某个 flex 行时调用方可以换成 `span`。
 * `align` 默认 `end`（右对齐，落在右上角）；落在左上角的那一份传 `start`。
 */
export function markNode(
  tag: keyof HTMLElementTagNameMap = 'div',
  align: MarkAlign = 'end',
): HTMLElement {
  const root = document.createElement(tag);
  root.className = align === 'start' ? 'sb-mark sb-mark--start' : 'sb-mark';
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
