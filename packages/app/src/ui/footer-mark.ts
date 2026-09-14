/**
 * SEE-ME SEE-U 扩展示意图 —— 作品负责人在海报上画的那一张
 * （self ↓ ME · form ↓ _ · other ↓ SEE · agency ↓ U.，上面一行是 computational gazing / morphogenesis /
 * distributed agency / NOTME）。它在站里有两个落点：
 *
 * 1. **页脚**：陈述、谱系、做的过程、护照、工作台目录、三个侧室的最底下（负责人：「有点像 AI 公司或产品公司在最下面放的一个 logo」）。
 * 2. **`/about` 的巨题**：替掉原来那两行文字的 `SEE-ME SEE-U`，下面「看我看你」保留，进场动效照旧（负责人 2026-09-14）。
 *
 * 两处用的是**同一个节点工厂**（`diagramNode`），所以形状、着色、对齐的算法只有一份。
 *
 * ## 为什么是蒙版，不是 `<img>`
 *
 * 原图是写死的黑（`#000` / `#0e0f12`）。站里的底有深有浅，一张黑图在深底上直接看不见；
 * 按页面分两份图、或者用 `filter: invert()` 猜底色，都是在复制「底是什么颜色」这件事。
 * 蒙版只取这张图的**形状**，颜色由那一处自己的墨（`currentColor` ← `--sb-ink`）给 —— 和同一页的字永远是同一个墨。
 *
 * ## 为什么这枚图是一个独立的、带哈希的文件
 *
 * 137 KB（gzip 后约 20 KB），内联进 JS 会让每一页各背一份。走 `?url` 之后它是一个带哈希、immutable 缓存的资产，
 * 看过一页之后其余几页零字节。
 *
 * **不挂**：舞台和选择页（那是作品本身的画面）、工作台里的各台仪器（满屏画布）、404。
 */
import markUrl from './footer-mark.svg?url';
import './footer-mark.css';

/** 读屏读到的那一句。图里的字全是路径，读屏读不到，所以这里把结构说出来 */
export const FOOTER_MARK_LABEL =
  'SEE-ME SEE-U — self → ME, form → _, other → SEE, agency → U. · computational gazing · morphogenesis · distributed agency · NOTME';

/**
 * 裁过的 viewBox 里，墨的左边缘离 viewBox 左边缘多远（单位：viewBox 宽的比例）。
 * `footer-mark.svg` 的 viewBox 是 `0.5 1.7 633.8 98.1`，墨从 x = 2.05 开始 → (2.05 − 0.5) / 633.8。
 * 要让**图里的字**和旁边的文字左对齐（而不是让看不见的留白对齐），节点就往左挪这么多（见 `.sb-diagram--flush`）。
 */
export const DIAGRAM_INK_INSET = (2.05 - 0.5) / 633.8;

/**
 * 一枚着好色的示意图节点。尺寸由 CSS 给（宽度吃满父级，高度按 viewBox 比例）。
 * @param label 读屏的名字；传 `null` 表示它是装饰（旁边已经有同名的文字），读屏跳过。
 */
export function diagramNode(label: string | null = FOOTER_MARK_LABEL): HTMLElement {
  const mark = document.createElement('span');
  mark.className = 'sb-diagram';
  if (label === null) {
    mark.setAttribute('aria-hidden', 'true');
  } else {
    mark.setAttribute('role', 'img');
    mark.setAttribute('aria-label', label);
  }
  mark.style.setProperty('--sb-diagram-src', `url("${markUrl}")`);
  return mark;
}

/**
 * 在 `parent`（缺省 `document.body`）的末尾挂上页脚标记。
 *
 * **挂在 body 上，不挂在页面那一栏里**：负责人要它基本撑满整屏。各页的内容栏宽度、左右边距各不相同
 * （陈述页正文靠右、工作台目录满宽），挂进栏里就只能跟着那一栏的宽度走。body 上的最后一个元素
 * 永远在所有页面内容之后 —— 异步填进来的内容进的是各自的根节点，不会跑到它下面。
 *
 * **同一个 parent 只挂一次**：重复调用把已有的那一枚挪回最底下，不叠第二枚。返回挂好的那个元素。
 */
export function mountFooterMark(parent: Element = document.body): HTMLElement {
  const existing = parent.querySelector<HTMLElement>(':scope > .sb-footmark');
  if (existing) {
    parent.append(existing);
    return existing;
  }
  const footer = document.createElement('footer');
  footer.className = 'sb-footmark';
  footer.append(diagramNode());
  parent.append(footer);
  return footer;
}
