/**
 * 右上角那一列。
 *
 * ## 它解决的那一个问题
 *
 * 右上角先后住进了三样东西：目录、设置、控件条。前两个是一列里的两节
 * （`ui/nav.ts`），控件条是**另一个组件**，各自 `position: fixed` 到同一个角。
 *
 * 两个 fixed 的东西抢同一个角，只能靠互相躲：控件条原来要往下偏
 * `--below-nav` 3.2rem，还要在目录一展开时整条 `visibility: hidden` 藏起来
 * （`mountNav` 的 `onOpenChange` → `controls.setNavOpen`）。
 * 那套机制**每一条都对**，但它们全都是在为同一件事打补丁：
 * 两块内容不在同一个布局流里，所以谁也不知道对方有多高。
 *
 * 把它们放进同一列，问题就不存在了 —— 上面一节展开，下面那节自己被推下去，
 * 这是浏览器免费给的。于是可以删掉偏移量、删掉互斥、删掉那个回调。
 *
 * ## 为什么是懒建的单例
 *
 * 文字页只挂目录（`about/page.ts` 一行 `mountNav()`），装置现场三样都不挂
 * （`?kiosk=1`）。所以这一列不能在模块加载时就建 —— 建了就会在那些页面上
 * 留下一个空的 fixed 元素，而空的 fixed 元素会吃掉指针事件。
 */
import './corner.css';

let column: HTMLElement | null = null;

/**
 * 拿到右上角那一列，没有就建一个。
 *
 * 调用方把自己 append 进去即可；**顺序即视觉顺序**（先 append 的在上面）。
 * 目录 → 设置 → 控件条，从"这个站里有什么"到"这一场里有谁"再到
 * "眼前这一场怎么看"，由远及近。
 */
export function cornerColumn(mount: HTMLElement = document.body): HTMLElement {
  if (column?.isConnected) return column;
  column = document.createElement('div');
  column.className = 'sb-corner';
  mount.append(column);
  return column;
}

/** 测试和热重载用。生产代码里不需要。 */
export function resetCornerColumn(): void {
  column?.remove();
  column = null;
}
