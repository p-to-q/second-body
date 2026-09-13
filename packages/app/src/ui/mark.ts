/**
 * 字标 —— 两行，右对齐，`SEE-ME / SEE-U`。
 *
 * `SEE ME` / `SEE U` 的紧凑写法。
 * 短到可以放进任何一个角，读出来和巨题逐字相同。
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
