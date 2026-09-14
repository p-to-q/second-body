/**
 * 侧室的那条横带 —— 四个侧室共用**一份**。
 *
 * ## 侧室是什么
 *
 * 四个房间：`/parts`（部件档案）、`/roster`（物种接触表）、`/marks`（九枚记号）、
 * `/lag`（慢半拍）。它们原本是我们自己的仪器，回答的是工程问题；
 * 现在它们被展出，因为它们各自回答的那个问题，**观众也有**：
 * 这件作品到底长出了什么、它一共能变成哪些身体、那九种身体凭什么算九种、
 * 一堆刚体凭什么看起来是活的。
 *
 * **不进目录**（docs/23 §S9）。它们不是这个站的第八到第十一个面 ——
 * 目录列的是"面"，而侧室是某一面上的某一句话被说到底的样子。
 * 门开在 `/about` 的正文里，由 `ui/clue.ts` 开（那个文件解释了为什么）。
 *
 * ## 为什么侧室也戴这条横带
 *
 * `docs/23 §S9` 的表说的是目录；横带是另一回事，它回答的是「我怎么出去」。
 * 一个从正文里一个数字点进来的人，屏幕上此刻**一条通往任何地方的路都没有**——
 * 他只有后退键。所以横带必须在，而且「回到作品」只能指向 `/about`：
 * 那正是他刚才站的地方，不是首页。
 *
 * 结构和四个文档页逐字相同（`ui/hero.ts` 的 `heroMeta`）：
 * 左边「回到作品」，右边字标，**中间什么都没有**。房间名不进这条带子 ——
 * 它在下面那条重线底下自己有一行。
 *
 * ## 目录**不挂**
 *
 * 挂上目录，房间就会看着像一个"没被列进去的页面"：七条里没有它。
 * 一张写着"这里有七个房间"的地图，挂在第八个房间的墙上，
 * 只会让人觉得自己走错了。出口由横带给，地图在 `/about` 上等着。
 */
import { COPY, setBi, type BiText } from '../ui/i18n.ts';
import { markShape } from '../ui/marks.ts';
import { heroMeta } from '../ui/hero.ts';
import { fromSearch } from '../ui/return-to.ts';
import { setBiLinked, type AsidePhrase } from '../ui/aside.ts';
import '../ui/type.css';
import '../ui/editorial.css';
import './room.css';

export interface RoomOptions {
  /** 房间叫什么 */
  title: BiText;
  /** 一行框定：**这个房间对一个没有造过它的人来说是关于什么的。** 一句，不解释画面 */
  lede: BiText;
  /** 框定那一句里通向目录外页面的短语（`ui/asides.ts`）。省略就是一句普通的话 */
  ledeAsides?: readonly AsidePhrase[];
  /** 右上那一行状态字（例如「只读」）。省略就没有 */
  state?: BiText | null;
  mount?: HTMLElement;
}

export interface Room {
  /** 内容挂这里。房间自己的东西全部进这一格 */
  body: HTMLElement;
  setState(text: BiText | null): void;
}

export function mountRoom(options: RoomOptions): Room {
  const { title, lede, ledeAsides = [], state = null, mount = document.body } = options;

  // 文档页那几页在 index.html 里被钉成不滚动的一屏；侧室是要读的，放开。
  document.documentElement.style.cssText = 'overflow:auto;height:auto';
  document.body.style.cssText = 'overflow:auto;height:auto';
  document.title = `${title.zh} · ${COPY.title.zh}`;
  mount.classList.add('ed');

  const page = document.createElement('main');
  page.className = 'room';

  const head = document.createElement('header');
  head.className = 'ed-hero room-hero';

  const rule = document.createElement('hr');
  rule.className = 'ed-rule ed-rule--heavy';

  const titleBox = document.createElement('div');
  titleBox.className = 'ed-hero__title room-hero__title';
  const h1 = document.createElement('h1');
  setBi(h1, title);
  titleBox.append(h1);

  const foot = document.createElement('div');
  foot.className = 'room-hero__foot';
  const ledeEl = document.createElement('p');
  ledeEl.className = 'room-lede';
  setBiLinked(ledeEl, lede, ledeAsides);
  const stateEl = document.createElement('p');
  stateEl.className = 'room-state sb-label';
  foot.append(ledeEl, stateEl);

  const rule2 = document.createElement('hr');
  rule2.className = 'ed-rule';

  // 默认回 `/about`（门开在那一页的正文里）；带着合法 `?from=` 进来的回它来的那一页
  head.append(heroMeta('/about', fromSearch(location.search)), rule, titleBox, foot, rule2);

  const body = document.createElement('div');
  body.className = 'room-body';

  page.append(head, body);
  mount.append(page);

  const setStateImpl = (text: BiText | null): void => {
    if (!text) { stateEl.textContent = ''; stateEl.hidden = true; return; }
    stateEl.hidden = false;
    setBi(stateEl, text);
  };
  setStateImpl(state);

  return { body, setState: setStateImpl };
}

// ── 身体方案的记号 ──────────────────────────────────────────────────────────

/**
 * 一枚独立画幅的记号。`/marks` 和 `/roster` 共用这一个。
 *
 * **形状不在这里**，在 `ui/marks.ts` 的 `PLAN_MARKS` —— 那份表是作品负责人
 * 逐枚看过的九枚，`/about` 的散点与图例走的也是它。这里只负责把它画成 DOM：
 * 那个模块刻意不碰 DOM、不 import CSS，是为了能在 node 里被测（见它的文件头），
 * 所以画笔和画幅留给用它的人。
 *
 * `/about` 那边另有一个几行的 builder（`about.ts` 的 `planMark`），因为散点上
 * 记号要落在**数据点的坐标**上，而这里永远落在画幅中心。
 * 两者共用的是形状，不共用摆放 —— 摆放本来就是两件事。
 */
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 记号自己的坐标系：以中心为原点，尺度按散点图上 ~10px 那一档定 */
export const MARK_BOX = 22;

/**
 * @param shown 屏幕上的边长。**放大的是画幅不是笔** —— `stroke-width` 跟着
 *   viewBox 一起缩放，所以线条的相对粗细和散点图上逐字相同，
 *   `/marks` 上那九枚不是另一套记号，只是同一套印大了。
 */
export function markNode(kind: string, shown = MARK_BOX): SVGSVGElement {
  const root = document.createElementNS(SVG_NS, 'svg');
  root.setAttribute('class', 'sb-plan-mark');
  root.setAttribute('width', String(shown));
  root.setAttribute('height', String(shown));
  root.setAttribute('viewBox', `${-MARK_BOX / 2} ${-MARK_BOX / 2} ${MARK_BOX} ${MARK_BOX}`);
  // 记号旁边永远写着这个方案的名字（`COPY.plans`）。读屏再念一遍形状
  // 只会把同一件事说两次
  root.setAttribute('aria-hidden', 'true');
  for (const part of markShape(kind)) {
    const node = document.createElementNS(SVG_NS, part.tag);
    node.setAttribute('class', part.cls);
    for (const [k, v] of Object.entries(part.attrs)) node.setAttribute(k, String(v));
    root.append(node);
  }
  return root;
}
