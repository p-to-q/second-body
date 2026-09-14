/**
 * 页脚那枚标记 —— 作品负责人在海报上画的 SEE-ME SEE-U 扩展示意图
 * （self ↓ ME · form ↓ _ · other ↓ SEE · agency ↓ U.，上面一行是 computational gazing / morphogenesis /
 * distributed agency / NOTME）。2026-09-14 负责人：「统一加在页面底部，有点像 AI 公司或产品公司在最下面放的一个 logo」。
 *
 * ## 为什么是蒙版，不是 `<img>`
 *
 * 原图是写死的黑（`#000` / `#0e0f12`）。站里有深底的页（工作台）也有纸底的页（陈述、侧室），
 * 一张黑图在深底上直接看不见；按页面分两份图、或者用 `filter: invert()` 猜底色，都是在复制「底是什么颜色」这件事。
 * 蒙版只取这张图的**形状**，颜色由那一页自己的墨令牌（`--sb-ink`）给 —— 于是它和同一页上的正文永远是同一个墨，
 * 以后换主题、换底色都不用碰它。
 *
 * ## 为什么这枚图是一个独立的、带哈希的文件
 *
 * 137 KB（gzip 后约 20 KB），内联进 JS 会让五页各背一份。走 `?url` 之后它是一个带哈希、immutable 缓存的资产，
 * 看过一页之后其余几页零字节。它只出现在要往下读的页面底部，不在任何首屏路径上。
 *
 * ## 挂在哪
 *
 * 负责人点名的五页（作品陈述、谱系、做的过程、共生护照、工作台目录）+ 同一族的三个侧室（部件档案、物种接触表、九枚记号，共用 `rooms/room.ts`）。
 * **不挂**：舞台和选择页（那是作品本身的画面，底部没有"页面"）、工作台里的各台仪器（满屏画布，底部是仪器不是页）、404。
 */
import markUrl from './footer-mark.svg?url';
import './footer-mark.css';

/** 读屏读到的那一句。图里的字全是路径，读屏读不到，所以这里把结构说出来 */
export const FOOTER_MARK_LABEL =
  'SEE-ME SEE-U — self → ME, form → _, other → SEE, agency → U. · computational gazing · morphogenesis · distributed agency · NOTME';

/**
 * 在 `parent` 的末尾挂上页脚标记。**同一个 parent 只挂一次**：异步渲染的页面（陈述、谱系）
 * 可能在数据回来之后再调一次，重复调用不会叠出第二枚。返回挂好的那个元素。
 */
export function mountFooterMark(parent: Element): HTMLElement {
  const existing = parent.querySelector<HTMLElement>(':scope > .sb-footmark');
  if (existing) {
    // 异步内容可能在它后面又追加了东西：挪回最底下
    parent.append(existing);
    return existing;
  }
  const footer = document.createElement('footer');
  footer.className = 'sb-footmark';
  const mark = document.createElement('div');
  mark.className = 'sb-footmark__mark';
  mark.setAttribute('role', 'img');
  mark.setAttribute('aria-label', FOOTER_MARK_LABEL);
  mark.style.setProperty('--sb-footmark-src', `url("${markUrl}")`);
  footer.append(mark);
  parent.append(footer);
  return footer;
}
