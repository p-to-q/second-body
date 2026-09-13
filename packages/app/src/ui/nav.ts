/**
 * 目录 —— 这个站的房间之间唯一的通路。
 *
 * ## 它解决的那一个问题
 *
 * 站点有六个可见面（`/`、`/about`、`/making.html`、`/passport.html`、`/dev/`、海报），
 * 而**首页上一个入口都没有**。一个评委打开首页，除非有人当面告诉他，
 * 否则永远不会知道 `/about` 和 `/making` 存在 —— 那两页承载了这件作品一半的表达。
 * 同样地，`/about` 读完之后也走不到 `/making`：这些页面之间此前一条链接都没有。
 *
 * ## 三条设计决定
 *
 * 1. **放右上角，不放左上角。** 两个位置都被提过。左上角已经被占了两次：
 *    `ui/page.ts` 的浮层页头在那里，`?debug=1` 的 HUD 也在那里。
 *    右上角在这件作品的所有页面上都是空的 —— 选择页的名牌在左下、提示在右下，
 *    共舞场景的物种名在左下。挑空的那个角，就不需要为了让位再动别人。
 *
 * 2. **观众模式下它必须能消失。** 装置现场的画面上不该挂着网站导航。
 *    `?kiosk=1` 下根本不挂（判断在 `readFlags().nav` 里，只有一处）；
 *    普通模式的满屏画布页上 4 秒后淡到 0.18 —— 这是 `ui/page.ts`
 *    已经立下的语言（docs/23 §S4「观众只需要知道一次」），照它做，不发明第二套。
 *
 * 3. **每条写"它能回答什么问题"，不写功能名。** `/dev/index.html` 已经这么做了，
 *    它有效的原因是人不是在找功能，是带着疑问来的。文案在 `ui/i18n.ts`，
 *    中英并置不切换（那是设计决定，见 i18n 的文件头）。
 */
import { COPY, setBi, type BiText } from './i18n.ts';
import { POOL_KINDS, readPool, setPool, type PoolKind } from './pool.ts';
import './type.css';
import './nav.css';

/** 和 `ui/page.ts` 的浮层页头同一个数：进场后 4 秒淡下去 */
const FADE_AFTER_MS = 4000;

interface NavItem {
  href: string;
  name: BiText;
  answers: BiText;
  /** 判断"就是这一页"用的路径。命中时这一条不可点，并且排版上退一档（nav.css 的 .is-here） */
  match: (path: string) => boolean;
}

const ITEMS: NavItem[] = [
  {
    href: '/', ...COPY.nav.items.work,
    match: (p) => p === '' || p === '/index.html',
  },
  {
    href: '/about', ...COPY.nav.items.about,
    match: (p) => p === '/about',
  },
  {
    href: '/lineage.html', ...COPY.nav.items.lineage,
    match: (p) => p === '/lineage' || p === '/lineage.html',
  },
  {
    href: '/making.html', ...COPY.nav.items.making,
    match: (p) => p === '/making' || p === '/making.html',
  },
  {
    href: '/passport.html', ...COPY.nav.items.passport,
    match: (p) => p === '/passport' || p === '/passport.html',
  },
  {
    href: '/dev/', ...COPY.nav.items.dev,
    match: (p) => p.startsWith('/dev'),
  },
];

export interface NavOptions {
  /**
   * 挂不挂。调用方传 `readFlags().nav` —— 现场与 `?nav=0` 走 false。
   * 参数而不是在这里自己读 URL：展陈层那几页不该为了一个导航去 import shell。
   */
  enabled?: boolean;
  /** 浮在 canvas 上（满屏画布页，4 秒后淡出）还是躺在文档流里（文字页，常驻） */
  overlay?: boolean;
  /**
   * 挂上来就是展开的。**只有作品那一页该传 true。**
   *
   * 展签的排版为它让出了右边一栏（`shell/entry.css` 的 `html.sb-has-nav` 那条），
   * 所以在那一页上它铺开来不挡任何东西，反而第一眼就把六个面摆出来了。
   * 文字页没有那一栏 —— 实测 `/about` 上展开的面板正压在作品陈述上，
   * 两段文字叠在一起，谁也读不成。那几页上它是**收起来的一个词**，要看再点。
   */
  startOpen?: boolean;
  mount?: HTMLElement;
  /**
   * 展开状态变了就叫一声。
   *
   * 它原来唯一的用处是让控件条让位 —— 那个需求已经不存在了：
   * 三节同在 `ui/corner.ts` 那一列里，上面展开下面自己往下走。
   * 回调留着是因为它是个**通用的**出口（比如以后要在展开时停掉某个动画），
   * 但**没有消费者的时候它就该没有消费者**，不要为了用它而用它。
   */
  onOpenChange?(open: boolean): void;
}

export interface Nav { root: HTMLElement; open(): void; close(): void; }

/** 挂上目录。`enabled` 为 false 时返回 null，调用点因此只有一行 */
export function mountNav(options: NavOptions = {}): Nav | null {
  const { enabled = true, overlay = false, startOpen = false, mount = document.body, onOpenChange } = options;
  if (!enabled || typeof document === 'undefined') return null;

  // `cleanUrls` 会把 /making.html 变成 /making，两种写法都要认得出"就是这一页"
  const path = location.pathname.replace(/\/+$/, '');

  const root = document.createElement('nav');
  root.className = overlay ? 'sb-nav sb-nav--overlay' : 'sb-nav';

  /**
   * 右上角这一列上有**两节**：目录和设置。它们是平级的。
   *
   * 上一版把设置塞在目录面板的底下，于是它成了"目录的一部分"——
   * 可是它回答的问题和那六条完全不是一类：那六条是"这个站里有什么"，
   * 它是"这一场里有谁"。层级摆错，读起来就是目录长了一条尾巴。
   *
   * 现在它们是一列里的两个标题：点开哪一个，哪一个往下撑，把下面那个推下去。
   * 用 flex 列 + 各自 hidden 的面板就够了 —— 不需要手风琴那套互斥逻辑，
   * 两个同时开着也是合法的（屏幕高的时候本来就该让人一眼看全）。
   */
  const section = (
    title: typeof COPY.nav.title,
    cls: string,
  ): { head: HTMLButtonElement; panel: HTMLDivElement } => {
    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'sb-nav-toggle';
    head.setAttribute('aria-expanded', 'false');
    setBi(head, title);
    const panel = document.createElement('div');
    panel.className = `sb-nav-panel ${cls}`;
    panel.hidden = true;
    return { head, panel };
  };

  const { head: toggle, panel } = section(COPY.nav.title, 'sb-nav-panel--menu');
  const pool = section(COPY.nav.pool.title, 'sb-nav-panel--pool');

  for (const item of ITEMS) {
    const here = item.match(path);
    // 当前这一页做成 <span> 而不是灰掉的 <a>：一条点了什么都不会发生的链接
    // 比没有链接更让人怀疑是不是坏了
    const row = document.createElement(here ? 'span' : 'a');
    row.className = here ? 'sb-nav-item is-here' : 'sb-nav-item';
    if (!here) (row as HTMLAnchorElement).href = item.href;

    const nameRow = document.createElement('div');
    nameRow.className = 'sb-nav-name';
    const name = document.createElement('span');
    setBi(name, item.name);
    nameRow.append(name);
    // 不写「在这里 · You are here」。当前页本来就**不可点**（下面渲染成 span 不是 a），
    // 那件事自己会说 —— 再配一个标签是把状态翻译成文字，读起来像网页教程。
    // 靠 `.is-here` 上的排版差别表达，见 nav.css。

    const answer = document.createElement('p');
    answer.className = 'sb-nav-answer';
    setBi(answer, item.answers);

    row.append(nameRow, answer);
    panel.append(row);
  }

  pool.panel.append(poolBlock());

  root.append(toggle, panel, pool.head, pool.panel);
  mount.append(root);
  // 告诉页面"右上角被占了"。没有这一条，题头右侧的房间号会和目录压在一起 ——
  // 实测 724px 视口下 `VII`(r=694) 正好撞进目录(l=613)。
  // 两条线各自都对：目录该在右上角，房间号也该在题头右端。冲突要在一处解决，
  // 而不是让每一页各自躲。
  document.documentElement.classList.add('sb-has-nav');

  let open = false;
  const setOpen = (next: boolean): void => {
    open = next;
    panel.hidden = !next;
    toggle.setAttribute('aria-expanded', String(next));
    root.classList.toggle('is-open', next);
    // 展开就不该还是半透明的：手伸过来了，别让他对着一团灰字找入口
    if (next) root.classList.remove('is-faded');
    onOpenChange?.(next);
  };

  toggle.addEventListener('click', () => setOpen(!open));

  // 设置那一节自己开关。它**不**参与 `onOpenChange` ——
  // 那个回调只为一件事存在：让右上角的控件条给目录让位（见 NavOptions 的注释）。
  // 设置在目录**下面**，它撑开推的是自己下面的空气，不会撞到控件条。
  let poolOpen = false;
  const setPoolOpen = (next: boolean): void => {
    poolOpen = next;
    pool.panel.hidden = !next;
    pool.head.setAttribute('aria-expanded', String(next));
    pool.head.classList.toggle('is-on', next);
    if (next) root.classList.remove('is-faded');
  };
  pool.head.addEventListener('click', () => setPoolOpen(!poolOpen));

  // 作品那一页挂上来就是展开的：只有六个面，一次摆出来，观众第一眼就知道这里有什么；
  // 一个要先点开才看得见的目录，等于赌观众会去点。
  // 但**点外面仍然收得掉** —— 他要看作品的时候，目录得让开。
  //
  // 文字页不展开，理由在 `startOpen` 的注释里：那几页上没有给它留的那一栏。
  if (startOpen) setOpen(true);

  // 点别处收起来。捕获阶段：展开的面板压在 canvas 上，
  // 而 canvas 自己会吞掉 pointerdown（选择页的拖动）
  const onAway = (e: Event): void => {
    if (root.contains(e.target as Node)) return;
    if (open) setOpen(false);
    if (poolOpen) setPoolOpen(false);
  };
  addEventListener('pointerdown', onAway, true);

  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    if (poolOpen) { setPoolOpen(false); pool.head.focus(); return; }
    if (open) { setOpen(false); toggle.focus(); }
  };
  addEventListener('keydown', onKey);

  // 展开着就不淡出（setOpen(true) 已经把 is-faded 摘掉了）。
  // 这个定时器只在观众自己收起来之后才有意义。
  if (overlay) {
    setTimeout(() => { if (!open && !poolOpen) root.classList.add('is-faded'); }, FADE_AFTER_MS);
  }

  return { root, open: () => setOpen(true), close: () => setOpen(false) };
}

/**
 * 目录底下那一小块：**这一场里哪几类身体可以被选**（`ui/pool.ts`）。
 *
 * 为什么它在目录里而不在右上角的控件条里：控件条管的是**正在放的这一场**
 * 怎么看（画面、渲染、特效），改完立刻看得见；这一块管的是**下一场有谁**，
 * 它在选择页搭起来之前生效。两种东西混在一条上，人会以为勾掉一类
 * 眼前这具就会消失 —— 而它不会。
 *
 * 三条勾是三种出身，不是三个功能开关，所以它们长得和目录的每一条一样：
 * 一个名字，一句"是什么"。唯一多出来的是左边那个方框。
 */
function poolBlock(): HTMLElement {
  const box = document.createElement('div');
  box.className = 'sb-nav-pool';

  // 标题已经是这一节自己的头了（`section()`），这里只剩那一句说明和一处回应位。
  const lede = document.createElement('p');
  lede.className = 'sb-nav-pool-lede';
  setBi(lede, COPY.nav.pool.lede);
  const hint = document.createElement('span');
  hint.className = 'sb-nav-pool-hint';
  box.append(lede, hint);

  const live = readPool();
  const boxes = new Map<PoolKind, HTMLInputElement>();

  /** 提示只说一次，两秒后自己收掉 —— 它是一次回应，不是一个状态 */
  let hintTimer = 0;
  const say = (text: BiText): void => {
    setBi(hint, text);
    hint.classList.add('is-on');
    clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => hint.classList.remove('is-on'), 2000);
  };

  for (const kind of POOL_KINDS) {
    const copy = COPY.nav.pool.kinds[kind];
    const row = document.createElement('label');
    row.className = 'sb-nav-pool-item';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = live.has(kind);
    boxes.set(kind, input);

    const text = document.createElement('span');
    const name = document.createElement('span');
    name.className = 'sb-nav-pool-name';
    setBi(name, copy.name);
    const note = document.createElement('span');
    note.className = 'sb-nav-pool-note';
    setBi(note, copy.note);
    text.append(name, note);

    input.addEventListener('change', () => {
      const next = POOL_KINDS.filter((k) => boxes.get(k)?.checked);
      // 拒绝全关。**把勾打回去**再说话 —— 让一个勾停在"关"上而名单没变，
      // 那是界面在撒谎（docs/02 P21 的同一条：仪表不能比事实好看）。
      if (!setPool(next)) {
        input.checked = true;
        say(COPY.nav.pool.last);
        return;
      }
      // 选择页已经搭好了就说清楚这一下什么时候生效，不偷偷重载
      if (document.querySelector('.sb-ring')) say(COPY.nav.pool.restart);
    });

    row.append(input, text);
    box.append(row);
  }

  return box;
}
