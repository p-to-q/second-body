/**
 * 控件条 —— 把**已经存在的能力**变成可以当场演示的。
 *
 * ## 它解决的那一个问题
 *
 * 这件作品做了五套场景、九种身体方案、跟随延迟、时域精化、四个玩法 ——
 * 而**观众和评委看不见其中任何一样**，因为它们全都只能用 URL 参数切。
 * 能力做了却没有入口，在现场就等于没做。
 *
 * 所以这个文件只有一条纪律：**只暴露真实存在的开关，一个都不编。**
 * 没有"即将支持"，没有灰掉的按钮；这一具身体上没有的项（团块上的描边）整项不出现。
 *
 * ## 这个文件现在只是视图 + 接线（2026-09-14）
 *
 * 每一个控件是什么、在哪一组、按什么键、怎么写回 URL、随机抽不抽它 ——
 * 全在 `ui/control-table.ts` 那一张表里。这里只把表画成面板、把键接到表上。
 * 状态只有一份，在 host 上（`values()`），面板每秒读一次，不抄。
 *
 * ## 默认开着什么、谁能改、在哪改（docs/23 §S4.1 的同一张表）
 *
 *   描边       物种自己声明（「线」开，其余关）   观众 · O      「看起来」
 *   跟随延迟   开                               观众 · D      「看起来」
 *   声音       开                               观众 · M      「看起来」
 *   时域精化   开                               对照 · R      「对照」（最底下）
 *   后期       开                               对照 · P      「对照」
 *   忒修斯换件 开                               ?theseus=off  不在面板上
 *   弧线       开，自己走完四段                  叠加 · A / F  「玩法」「形体」第一项
 *   读数       收起                             观众点开       左下角，不在面板上
 *
 * ## 四条设计决定
 *
 * 1. **没有一个按钮能锁住系统**（作品负责人 2026-09-14）。玩法和形体是弧线自己拥有的，
 *    按它们是**叠加**（`shell/intent.ts`）：弧线在底下照走，再点一次亮着的那一项就拿掉，
 *    第一项「跟着弧线」就是"什么都没叠"。其余每一项是一个变量的开 / 关或一个普通值。
 *    所以这个文件里碰不到导演、也按不住它 —— `test/controls-panel.test.ts` 钉住。
 *
 * 2. **和目录共用右上角，纵向排在它下面，而且两者互斥展开。**
 *    目录、设置、控件是**同一列里的三节**（`ui/corner.ts`）。上面一节展开，下面那节被推下去。
 *    面板的上限还要让开右下角那一列（`--sb-exits-h`，由 `ui/exits.ts` 写出来）。
 *
 * 3. **能热切的一律热切，必须重建的老实重载。** 只有两件事重载：换物种、进出 B 档身体
 *    （表里的 `reload`）。重载时把**当前全部状态**写回 URL（表里的 `stagePatch`），
 *    叠加只在开着的时候写 —— 以前这里写的是"弧线此刻在演哪一段"，重载一次弧线就被钉住了。
 *
 * 4. **每个控件旁边一句短说明，说的是"按下去会发生什么"。** 文案全部在 `ui/i18n.ts` 的
 *    `COPY.controls`，中英并置不切换。有一台仪器把这件事讲得更清楚的，组底下一条安静的链接，
 *    去程带着这一屏的回程（`ui/stage-url.ts`），工作台顶上那条出口把人送回同一屏。
 *
 * ## 为什么长成这样
 *
 * 没有卡片、阴影、圆角、图标（`docs/26 §F` 的反面清单）。分组题是全大写小标签，
 * 选项之间用细横线分区，键位用等宽字 —— 这是 `type.css` 已经立好的语言。
 * 它应该读起来像一台设备的面板，不像一个网页的设置弹窗。
 */
import type { ThemeDef } from '../../../core/src/types.ts';
import { randomPatch, SEED_MAX } from './random-url.ts';
import {
  CONTROLS, GROUPS, available, cycleNext, needsReload, optionsOf, rollSlots, stagePatch,
  type ControlDef, type ControlValues, type StageContext, type ValueId,
} from './control-table.ts';
import { workbenchHref } from './stage-url.ts';
import { COPY, setBi, type BiText } from './i18n.ts';
import type { Nav } from './nav.ts';
import './type.css';
import './section-head.css';
import './controls.css';

/** 和目录、`ui/page.ts` 同一个数：进场 4 秒后淡下去 */
const FADE_AFTER_MS = 4000;
/** 「刚按下」那一下有多长。只是一个类名的去留，没有过渡 —— 静止态不依赖它（controls.css 文件头） */
const FLASH_MS = 150;

type CopyPair = { name: BiText; note: BiText };
const C = COPY.controls;
/** 按表里的 id 取文案。表和文案的对应由 `test/control-table.test.ts` 钉住，这里缺了就跳过那一项 */
const copyBook = C as unknown as Record<string, Record<string, CopyPair | BiText> | undefined>;
const pairOf = (book: string, id: string): CopyPair | null => {
  const t = copyBook[book];
  return t && Object.prototype.hasOwnProperty.call(t, id) ? (t[id] as CopyPair) : null;
};
const textOf = (book: string, id: string): BiText | null => pairOf(book, id) as unknown as BiText | null;

export interface ControlsHost {
  /** 物种候选（`parts.json` 的 themes） */
  themes: readonly ThemeDef[];
  /** 开机就定了的事实：哪一种身体实现、物种自己的方案 */
  context: StageContext;
  /** 这一屏此刻的全部值。**只读 host，不抄** */
  values(): ControlValues;
  /** 写一个值。叠加传 `null` = 拿掉 */
  set<K extends ValueId>(id: K, value: ControlValues[K]): void;
  /** 叠加底下弧线此刻走到的那一项（玩法：导演演的那段；形体：身体此刻的方案） */
  arcValue(id: 'act' | 'form'): string | null;
  /** 会话种子：回舞台时回的必须是同一具身体 */
  seed(): number;
}

export interface ControlsOptions {
  /**
   * 挂不挂。调用方传 `readFlags().nav` —— 和目录同一个判断，
   * 所以现场（`?kiosk=1`）和 `?nav=0` 下这条一个像素都不会出现。
   */
  enabled?: boolean;
  host: ControlsHost;
  /** 右上角那条目录。传进来只为一件事：展开时互相让位 */
  nav?: Nav | null;
  mount?: HTMLElement;
  /**
   * 「随机」那一下的**熵**从哪来。默认 `crypto.getRandomValues` 抽一个 uint32。
   * 注入的是**那一个种子** —— 整条链上唯一一处非确定性（AGENTS.md：随机性经由注入到达）。
   */
  newSeed?: () => number;
}

export interface Controls {
  root: HTMLElement;
  dispose(): void;
}

/**
 * 把当前**全部**可表达状态写回 URL，再叠上 `patch`，然后重载。
 * 重载是为了重建身体，不是为了重置演示 —— 所以没变的也一起写（表里的 `stagePatch`）。
 */
function reloadWith(host: ControlsHost, patch: Record<string, string | null>): void {
  const q = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries({ ...stagePatch(host.values()), ...patch })) {
    if (v === null) q.delete(k);
    else q.set(k, v);
  }
  location.assign(`${location.pathname}?${q.toString()}`);
}

/** 一个选项按钮：中英并置的名字 + 一句短说明 + 右边一个状态词。没有图标，没有圆角 */
function option(copy: CopyPair, onPick: () => void): { el: HTMLButtonElement; state: HTMLSpanElement } {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'sb-ctl-opt';
  const name = document.createElement('span');
  name.className = 'sb-ctl-opt-name sb-bi-inline';
  setBi(name, copy.name);
  const note = document.createElement('span');
  note.className = 'sb-ctl-opt-note';
  setBi(note, copy.note);
  const state = document.createElement('span');
  state.className = 'sb-ctl-state';
  el.append(name, note, state);
  el.addEventListener('click', () => {
    el.classList.add('is-flash');
    setTimeout(() => el.classList.remove('is-flash'), FLASH_MS);
    onPick();
  });
  return { el, state };
}

function group(title: BiText, note: BiText, key: string | null): HTMLElement {
  const sec = document.createElement('section');
  sec.className = 'sb-ctl-group';
  const head = document.createElement('div');
  head.className = 'sb-ctl-head';
  const label = document.createElement('span');
  label.className = 'sb-label';
  label.textContent = `${title.zh} · ${title.en}`;
  head.append(label);
  if (key) head.append(keyCap(key));
  const sub = document.createElement('p');
  sub.className = 'sb-ctl-note';
  setBi(sub, note);
  sec.append(head, sub);
  return sec;
}

function keyCap(key: string): HTMLSpanElement {
  const k = document.createElement('span');
  k.className = 'sb-ctl-key';
  k.textContent = key;
  return k;
}

const stateText = (t: BiText | null): string => (t ? `${t.zh} · ${t.en}` : '');

export function mountControls(options: ControlsOptions): Controls | null {
  const {
    enabled = true, host, nav = null, mount = document.body,
    newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0]!,
  } = options;
  if (!enabled || typeof document === 'undefined') return null;

  const root = document.createElement('aside');
  root.className = 'sb-ctl';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'sb-ctl-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  setBi(toggle, C.title);
  /** 收起时节题后面那个小字：有叠加开着就写「叠加 N」—— 面板关着也看得出这一屏被人推过 */
  const overTag = document.createElement('span');
  overTag.className = 'sb-ctl-toggle-over';
  toggle.append(overTag);

  const panel = document.createElement('div');
  panel.className = 'sb-ctl-panel';
  panel.hidden = true;

  const themeIds = host.themes.map((t) => t.id);
  const here = CONTROLS.filter((c) => available(c, host.context));
  /** 每个控件各自登记一个"把高亮刷新到当前状态"的函数。状态只有一份，在 host 上 */
  const syncs: ((v: ControlValues) => void)[] = [];
  /** 已经在重开了：面板不再刷新、不再接按键，直到页面真的走了（「重开中」那一格要一直说下去） */
  let pending = false;
  const sync = (): void => {
    if (pending) return;
    const v = host.values();
    for (const f of syncs) f(v);
  };
  const mark = (el: HTMLElement, on: boolean): void => {
    el.classList.toggle('is-on', on);
    el.setAttribute('aria-pressed', String(on));
  };
  const valueOf = (c: ControlDef, v: ControlValues): unknown => (c.id === 'roll' ? null : v[c.id]);

  const status = document.createElement('p');
  status.className = 'sb-ctl-status';
  status.setAttribute('aria-live', 'polite');

  function markPending(from: HTMLElement | null): void {
    pending = true;
    root.classList.add('is-pending');
    panel.setAttribute('aria-busy', 'true');
    status.textContent = stateText(C.restarting);
    if (!from) return;
    from.classList.add('is-pending');
    const s = from.querySelector('.sb-ctl-state');
    if (s) s.textContent = stateText(C.restarting);
  }

  /** 一个控件换值：要重建身体的走重载，其余热切。`from` = 按下去的那一格（键盘触发时没有） */
  function apply(c: ControlDef, next: unknown, from: HTMLElement | null = null): void {
    if (pending || c.id === 'roll') return;
    if (needsReload(c, host.context, next)) {
      markPending(from);
      const w = c.url?.write(next);
      const patch: Record<string, string | null> = c.url && w !== undefined ? { [c.url.param]: w } : {};
      // 换物种时形体叠加不带过去：那是按在上一个物种身上的
      for (const k of c.reloadClears ?? []) patch[k] = null;
      reloadWith(host, patch);
      return;
    }
    host.set(c.id, next as never);
    sync();
  }

  /**
   * 重掷一次。**一次重载，不是六次热切**：它抽的里面有物种和形体，本来就必须重建。
   * 池子从表来（`rollSlots`），抽签是纯的（`ui/random-url.ts`）。`location.assign` 留下一条历史 ——
   * 浏览器的后退键就是这个按钮的撤销键。
   */
  function roll(from: HTMLElement | null = null): void {
    if (pending) return;
    markPending(from);
    reloadWith(host, randomPatch(newSeed() % SEED_MAX, rollSlots(themeIds)));
  }

  const renderOverlay = (c: ControlDef & { id: 'act' | 'form' }, sec: HTMLElement): void => {
    const row = document.createElement('div');
    row.className = 'sb-ctl-row';
    const choices: (string | null)[] = [null, ...optionsOf(c, themeIds)];
    const arcCopy = pairOf('arc', c.id);
    for (const choice of choices) {
      const copy = choice === null ? arcCopy : pairOf(c.id, choice);
      if (!copy) continue;
      // 点亮着的那一项 = 拿掉叠加；点「跟着弧线」= 拿掉叠加；点别的 = 换成它
      const o = option(copy, () => {
        const now = host.values()[c.id];
        apply(c, choice === null || choice === now ? null : choice, o.el);
      });
      const { el, state } = o;
      syncs.push((v) => {
        const now = v[c.id];
        // 叠加（你推的）和弧线此刻（它自己走到的）是两件事：落在不同格子上时两个记号同时在
        const over = choice !== null && choice === now;
        const atArc = choice !== null && choice === host.arcValue(c.id);
        mark(el, choice === now);
        el.classList.toggle('is-over', over);
        el.classList.toggle('is-now', atArc);
        if (atArc) el.setAttribute('aria-current', 'true');
        else el.removeAttribute('aria-current');
        // 叠加**不配文字**（作品负责人 2026-09-14：文字提示是累赘）—— 实线下划线和顶上那一行已经说了
        state.textContent = !over && atArc ? stateText(C.arcNow) : '';
      });
      row.append(el);
    }
    sec.append(row);
  };

  const renderChoice = (c: ControlDef, sec: HTMLElement): void => {
    const row = document.createElement('div');
    row.className = 'sb-ctl-row';
    for (const choice of optionsOf(c, themeIds)) {
      const copy = pairOf(c.id, choice);
      if (!copy) continue;
      const o = option(copy, () => apply(c, choice, o.el));
      const { el } = o;
      syncs.push((v) => mark(el, valueOf(c, v) === choice));
      row.append(el);
    }
    sec.append(row);
  };

  /** 物种：29 条不平铺，一个筛选框 + 一列可滚的名字。浏览行为，所以放在演示那几组后面 */
  const renderThemes = (c: ControlDef, sec: HTMLElement): void => {
    const filter = document.createElement('input');
    filter.type = 'search';
    filter.className = 'sb-ctl-filter';
    filter.placeholder = `${C.filter.zh} · ${C.filter.en}`;
    filter.setAttribute('aria-label', C.filter.zh);
    const list = document.createElement('div');
    list.className = 'sb-ctl-species';
    const rows: { el: HTMLElement; hay: string }[] = [];
    for (const t of host.themes) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sb-ctl-sp';
      const name = document.createElement('span');
      name.className = 'sb-ctl-opt-name sb-bi-inline';
      setBi(name, { zh: t.name, en: t.nameEn });
      const note = document.createElement('span');
      note.className = 'sb-ctl-opt-note';
      if (t.tagline) setBi(note, { zh: t.tagline, en: t.taglineEn ?? '' });
      b.append(name, note);
      b.addEventListener('click', () => apply(c, t.id, b));
      list.append(b);
      rows.push({ el: b, hay: `${t.id} ${t.name} ${t.nameEn} ${t.tagline ?? ''}`.toLowerCase() });
      syncs.push((v) => b.classList.toggle('is-on', valueOf(c, v) === t.id));
    }
    filter.addEventListener('input', () => {
      const q = filter.value.trim().toLowerCase();
      for (const r of rows) r.el.hidden = q !== '' && !r.hay.includes(q);
    });
    sec.append(filter, list);
  };

  /** 同一组里的开关排成一张两栏的表，每格右边写「开 / 关」，名字后面一个键帽 */
  const renderToggles = (cs: readonly ControlDef[], sec: HTMLElement): void => {
    const row = document.createElement('div');
    row.className = 'sb-ctl-row sb-ctl-row--toggles';
    for (const c of cs) {
      const copy = pairOf('render', c.id);
      if (!copy) continue;
      const o = option(copy, () => apply(c, !valueOf(c, host.values()), o.el));
      const { el, state } = o;
      if (c.key) el.querySelector('.sb-ctl-opt-name')?.append(keyCap(c.key));
      syncs.push((v) => {
        const on = Boolean(valueOf(c, v));
        mark(el, on);
        state.textContent = stateText(on ? C.on : C.off);
      });
      row.append(el);
    }
    sec.append(row);
  };

  /** 组底下那几条安静的链接。href 跟着这一屏走，点下去那一刻再写一次 */
  const renderLinks = (cs: readonly ControlDef[], sec: HTMLElement): void => {
    const links = cs.flatMap((c) => c.links ?? []);
    if (!links.length) return;
    const box = document.createElement('div');
    box.className = 'sb-ctl-links';
    for (const link of links) {
      const label = textOf('links', link.page.replace(/^\/dev\/|\.html$/g, ''));
      if (!label) continue;
      const a = document.createElement('a');
      a.className = 'sb-ctl-link';
      setBi(a, label);
      const refresh = (v: ControlValues): void => { a.href = workbenchHref(link, v, host.seed()); };
      a.addEventListener('click', () => refresh(host.values()));
      syncs.push(refresh);
      box.append(a);
    }
    sec.append(box);
  };

  // ── 面板：按组从表里筛出来，一组一节 ──────────────────────────────────────────
  const sections: HTMLElement[] = [];
  for (const g of GROUPS) {
    const cs = here.filter((c) => c.group === g);
    if (!cs.length) continue;
    // 一组只有一个带键的非开关控件时，键帽挂在组题上（开关的键帽挂在各自格子里）
    const headKey = cs.length === 1 && cs[0].kind !== 'toggle' ? cs[0].key : null;
    const sec = group(C.groups[g], C.groupNotes[g], headKey);
    if (g === 'ab') sec.classList.add('sb-ctl-group--ab');
    const toggles = cs.filter((c) => c.kind === 'toggle');
    if (toggles.length) renderToggles(toggles, sec);
    for (const c of cs) {
      if (c.kind === 'overlay') renderOverlay(c as ControlDef & { id: 'act' | 'form' }, sec);
      else if (c.kind === 'choice' && c.options === 'themes') renderThemes(c, sec);
      else if (c.kind === 'choice') renderChoice(c, sec);
      else if (c.kind === 'action') {
        const row = document.createElement('div');
        row.className = 'sb-ctl-row';
        const o = option(C.random.roll, () => roll(o.el));
        row.append(o.el);
        sec.append(row);
      }
    }
    renderLinks(cs, sec);
    sections.push(sec);
  }

  // ── Key 条：从表里推。一个没有写出来的快捷键等于不存在 ────────────────────────
  // **刻意避开 1–9 / ↑↓ / Enter / 空格**：选择页在用（docs/23 §S2），表的测试钉住
  const keys = document.createElement('footer');
  keys.className = 'sb-ctl-keys';
  const keyLabel = document.createElement('span');
  keyLabel.className = 'sb-label';
  keyLabel.textContent = `${C.keys.title.zh} · ${C.keys.title.en}`;
  keys.append(keyLabel);
  const keyRows: [string, BiText | null][] = [
    ['`', C.keys.toggle],
    ...here.flatMap((c): [string, BiText | null][] => (c.key ? [[c.key, textOf('keys', c.id)]] : [])),
  ];
  for (const [k, text] of keyRows) {
    if (!text) continue;
    const row = document.createElement('div');
    row.className = 'sb-ctl-keyrow';
    const what = document.createElement('span');
    what.className = 'sb-ctl-opt-note';
    setBi(what, text);
    row.append(keyCap(k), what);
    keys.append(row);
  }

  // ── 顶上那一行：弧线此刻在哪一段、叠了什么。不写秒数和乐章号（docs/40 §5 不给观众看进度） ──
  const nameOf = (book: string, id: string | null): string | null => {
    const p = id ? pairOf(book, id) : null;
    return p ? `${p.name.zh} ${p.name.en}` : null;
  };
  syncs.push((v) => {
    const now = nameOf('act', host.arcValue('act'));
    const over = [nameOf('act', v.act), nameOf('form', v.form)].filter((s): s is string => s !== null);
    status.textContent = [
      now && `${C.statusNow.zh} · ${C.statusNow.en}  ${now}`,
      over.length ? `${C.statusOver.zh} · ${C.statusOver.en}  ${over.join(' / ')}` : null,
    ].filter(Boolean).join('   ');
    overTag.textContent = over.length ? `${C.statusOver.zh} ${over.length}` : '';
  });

  panel.append(status, ...sections, keys);
  root.append(toggle, panel);
  mount.append(root);

  // ── 行为 ──────────────────────────────────────────────────────────────────
  /**
   * 面板顶在视口里的位置，写给 controls.css 的 max-height。它会挪：上面目录、设置两节展开收起，窗口变了。
   * 原来 CSS 里猜的是 3.4rem，无头 Chrome 实测面板底仍然压右下角那一列 8.28px —— 量出来，不猜。
   */
  const publishTop = (): void => {
    if (panel.hidden) return;
    panel.style.setProperty('--sb-ctl-top', `${Math.round(panel.getBoundingClientRect().top)}px`);
  };

  let open = false;
  const setOpen = (next: boolean): void => {
    open = next;
    panel.hidden = !next;
    toggle.setAttribute('aria-expanded', String(next));
    root.classList.toggle('is-open', next);
    root.classList.remove('is-faded');
    // 两条都在右上角：这一条展开，目录就收起来。不重叠不靠运气（见文件头第 2 条）
    if (next) nav?.close();
    if (next) { publishTop(); sync(); }
  };
  toggle.addEventListener('click', () => setOpen(!open));

  /** 整条显示 / 藏起来（`` ` `` 或 `h`）。藏起来之后快捷键照常生效 */
  let shown = true;
  const setShown = (next: boolean): void => {
    shown = next;
    root.hidden = !next;
    if (!next) setOpen(false);
  };

  const byKey = new Map(here.flatMap((c) => (c.key ? [[c.key.toLowerCase(), c] as const] : [])));
  const onKey = (e: KeyboardEvent): void => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // 正在筛物种的时候，`s` 是一个字母不是一个快捷键
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    const k = e.key.toLowerCase();
    if (k === 'escape' && open) { setOpen(false); return; }
    if (k === '`' || k === 'h') { setShown(!shown); return; }
    const c = byKey.get(k);
    if (!c) return;
    // 声音的 `m` 由 `sound/sound.ts` 自己绑着（docs/29）。两处都绑 = 按一下切两次 = 什么都没发生
    if (c.keyBoundElsewhere) { setTimeout(sync, 0); return; }
    if (pending) return;
    if (c.kind === 'action') { roll(); return; }
    apply(c, cycleNext(c, valueOf(c, host.values()), themeIds));
  };
  addEventListener('keydown', onKey);

  // 点别处收起面板。捕获阶段：面板压在 canvas 上，而 canvas 会吞掉 pointerdown
  const onAway = (e: Event): void => {
    if (open && !root.contains(e.target as Node)) setOpen(false);
  };
  addEventListener('pointerdown', onAway, true);

  // 每秒把高亮刷一次。理由都不是"保险起见"：
  //  1. 弧线会自己换段 —— 「弧线此刻」那个词要跟着走，没人点过任何按钮。
  //  2. 有些状态要过一帧才成立（`stage.setPost(true)` 要等下一次 render 才重建后期链）。
  const poll = setInterval(() => { sync(); publishTop(); }, 1000);
  addEventListener('resize', publishTop);
  sync();

  // 进场 4 秒后淡下去（docs/23 §S4「观众只需要知道一次」）。鼠标碰上去它自己回来，在 CSS 里。
  setTimeout(() => { if (!open) root.classList.add('is-faded'); }, FADE_AFTER_MS);

  return {
    root,
    dispose() {
      clearInterval(poll);
      removeEventListener('keydown', onKey);
      removeEventListener('pointerdown', onAway, true);
      removeEventListener('resize', publishTop);
      root.remove();
    },
  };
}
