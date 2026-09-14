/**
 * 工作台顶上的出口，**一份**。每一个 `dev/*.html` 都用
 * `<script type="module" src="./devnav.ts"></script>` 挂它，没有第二种写法
 * （`test/devnav.test.ts` 钉住）。
 *
 * ## 为什么需要
 *
 * 打开 `/dev/figure.html` 的人，屏幕上一条出去的路都没有，只剩浏览器的后退键 ——
 * 而后退键在一个直接粘贴进来的 URL 上什么都退不回去。
 *
 * ## 为什么住在 `dev/` 而不是 `src/ui/`
 *
 * `src/ui/` 是作品和展陈层的界面；这两条出路只属于工作台，展出的页面一条都不该有。
 * 放在 `dev/` 里，展出的页面就连 import 到它的可能都没有。
 * 它和 `ui/hero.ts` 的「回到作品」是同一家人（文字链接、中英并置、悬停只提亮），
 * 但**不是**同一个构件：那条横带是展出页的题头，这里是仪器边上的两行字，
 * 不假装工作台是一间展厅。
 *
 * ## 位置：右上角，仪表线（`--sb-safe × 0.5`）
 *
 * 左上角是浮层页头和 `.sb-hud-dev`；底边是 `.sb-foot-dev`；右上角在十五页里只有
 * `record.html` 的侧栏占着（那一页把侧栏的题往下让了一行）。`capture.html` 的量程统计
 * 在右边，但从 `+3.4em` 起算，比这一行低。
 *
 * `position: absolute` 而不是 `fixed`：满屏画布页不滚，两者一样；
 * 文档流页（目录、降级、声音…）往下读的时候它跟着页头一起走，不压在正文上。
 */
import './devnav.css';
import { setBi } from '../src/ui/i18n.ts';
import { installPageTransitions } from '../src/ui/page-transition.ts';
import { devNavActions, devNavLink, escapeTarget } from './devnav-state.ts';

function mountDevNav(): void {
  const q = new URLSearchParams(location.search);
  // 和站点目录同一个开关（docs/23 §S9）：海报、截图这种场合要一张干净的画面
  if (q.get('nav') === '0') return;
  installPageTransitions();

  const nav = document.createElement('nav');
  nav.className = 'sb-devnav';
  nav.setAttribute('aria-label', 'Workbench');

  // 地址和字都从 devnav-state 取：从正文里带着 `?from=` 进来的人，
  // 左边那条是「返回〈他来的那一页〉」而不是「返回工作台」（docs/23 §S9.1）
  for (const action of devNavActions(location.pathname, location.search)) {
    const link = devNavLink(action, location.search);
    const a = document.createElement('a');
    a.className = 'sb-devnav__link';
    a.setAttribute('href', link.href);
    setBi(a, link.label);
    nav.appendChild(a);
  }
  // prepend：它在屏幕右上角，Tab 也应当最先到它，而不是在整页控件之后
  document.body.prepend(nav);

  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    // 正在一个输入框里：Escape 在那里是"撤掉我刚才打的字"，不是"离开这一页"
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const to = escapeTarget(location.pathname, location.search);
    if (to) location.href = to;
  });
}

mountDevNav();
