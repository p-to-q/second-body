/**
 * 控件条 —— 把**已经存在的能力**变成可以当场演示的。
 *
 * ## 它解决的那一个问题
 *
 * 这件作品做了四套场景、八种身体方案、跟随延迟、时域精化、四个玩法、
 * 真实网格与生成件两条来路 —— 而**观众和评委看不见其中任何一样**，
 * 因为它们全都只能用 URL 参数切。一个站在屏幕前的人没有地址栏，
 * 一个打开页面的评委不会去读 `docs/06 §6`。能力做了却没有入口，
 * 在现场就等于没做。
 *
 * 所以这个文件只有一条纪律：**只暴露真实存在的开关，一个都不编。**
 * 每一项都能在 `shell/kiosk.ts` 的 `readFlags()` 里找到对应的 URL 参数
 * （`?scene=` `?plan=` `?act=` `?vitality=` `?refine=` `?nopost=` `?mute=` `?theme=` `?shading=`）。
 * 没有"即将支持"，没有灰掉的按钮。
 *
 * ## 三条设计决定
 *
 * 1. **和目录共用右上角，纵向排在它下面，而且两者互斥展开。**
 *    四个角只有右上角能长期占用：左上是 `?debug=1` 的 HUD，左下是 §S4 的物种名，
 *    右下是「用我的摄像头」和 §S0 的降级提示。而右上角已经被目录立了规矩
 *    （`ui/nav.ts`，`pages.css` 也已经按 `sb-has-nav` 为它留位）——
 *    再开第二个控制角，等于告诉观众这块画面上有两个地方可以按。
 *    不重叠靠的不是眼睛，也不再靠互相躲：目录、设置、控件是**同一列里的三节**
 *    （`ui/corner.ts`）。上面一节展开，下面那节自己被推下去 —— 浏览器免费给的。
 *    原来那套（控件条按 3.2rem 下偏、目录一展开就把它整条藏掉）已经删掉：
 *    它每一条都对，但它们全是在为"两个 fixed 抢同一个角"打补丁。
 *
 * 2. **能热切的一律热切，必须重建的老实重载。**
 *    场景（`stage.setScene`）、玩法（`director.force`）、跟随延迟、时域精化、
 *    后期、声音 —— 全部当场生效，因为它们要么是每帧读一次的开关，要么舞台自己
 *    有交叉淡入。形体在七种骨架之间也热切，因为 `remapSkeleton` 是纯函数、
 *    每帧调用一次。**只有两件事必须重载**：换物种（要重新预取零件、重建基因组）
 *    和进出「团块」（`createMassBody` 是开机时决定的一条完全不同的表达路径）。
 *    重载时把**当前全部状态写回 URL**，不只是那一个变化的参数 ——
 *    否则演示到一半换个物种，刚调好的场景和玩法全没了。
 *
 * 3. **每个控件旁边一句短说明，说的是"按下去会发生什么"。**
 *    一个写着「逆光」的按钮只说得出它叫什么。说明必须短：它是刻在面板上的丝印，
 *    不是帮助文档。文案全部在 `ui/i18n.ts` 的 `COPY.controls`，中英并置不切换。
 *
 * ## 为什么长成这样
 *
 * 没有卡片、阴影、圆角、图标（`docs/26 §F` 的反面清单）。分组题是全大写小标签，
 * 选项之间用细横线分区，键位用等宽字 —— 这是 `type.css` 已经立好的语言。
 * 它应该读起来像一台设备的面板，不像一个网页的设置弹窗。
 */
import { BODY_PLANS } from '../../../core/src/bodyplan.ts';
import type { ShadingId } from '../creature/shading.ts';
import type { ThemeDef } from '../../../core/src/types.ts';
import { SCENE_IDS } from '../stage/scenes.ts';
import { COPY, setBi, type BiText } from './i18n.ts';
import type { Nav } from './nav.ts';
import './type.css';
import './controls.css';

/** 和目录、`ui/page.ts` 同一个数：进场 4 秒后淡下去 */
const FADE_AFTER_MS = 4000;

/**
 * 「团块」不在 `BODY_PLANS` 里，这是对的 —— 它不是一种骨架重映射，
 * 而是另一条身体实现（`creature/mass.ts`）。但它**是** `?plan=` 的合法值
 * （`main.ts` 用 `planKind === 'mass'` 判断），所以面板上要有它，
 * 而且要标成"必须重载"的那一类。
 */
const MASS = 'mass';
const FORM_IDS: readonly string[] = [...BODY_PLANS, MASS];

/** 玩法。id 来自 `acts/index.ts` 的 `ACTS`，顺序照抄，不在这里另排 */
type CopyPair = { name: BiText; note: BiText };
const pick = <T extends Record<string, CopyPair>>(t: T, id: string): CopyPair | null =>
  (Object.prototype.hasOwnProperty.call(t, id) ? t[id] : null);

export interface ControlsHost {
  /** 当前物种 id 与全部候选（`parts.json` 的 themes） */
  themeId: string | null;
  themes: readonly ThemeDef[];

  /** 形体。`setPlan` 只在**两边都不是团块**时被调用，其余走重载 */
  planId(): string;
  setPlan(id: string): void;

  sceneId(): string;
  setScene(id: string): void;

  actId(): string | null;
  actIds: readonly string[];
  setAct(id: string): boolean;

  vitality(): boolean;
  setVitality(on: boolean): void;
  refine(): boolean;
  setRefine(on: boolean): void;
  post(): boolean;
  setPost(on: boolean): void;
  /** 返回切换之后是不是静音（`sound.toggleMute()` 的返回值原样传过来） */
  toggleMute(): boolean;
  muted(): boolean;
  /**
   * 描边 / 平涂（`creature/shading.ts`）。**团块身体上这一对是 `null`** ——
   * 它没有部件，也就没有可以套外壳的网格，那时这一项整个不出现。
   * 不给一个按了没反应的按钮，是这个文件唯一的那条纪律。
   */
  shading?: (() => ShadingId) | null;
  setShading?: ((id: ShadingId) => void) | null;
}

export interface ControlsOptions {
  /**
   * 挂不挂。调用方传 `readFlags().nav` —— 和目录同一个判断，
   * 所以现场（`?kiosk=1`）和 `?nav=0` 下这条一个像素都不会出现。
   * 装置画面上不该有控制台，这一点不给第二个开关去分歧。
   */
  enabled?: boolean;
  host: ControlsHost;
  /** 右上角那条目录。传进来只为一件事：展开时互相让位 */
  nav?: Nav | null;
  mount?: HTMLElement;
}

export interface Controls {
  root: HTMLElement;
  /**
   * 目录展开 / 收起了。控件条据此整条让位 —— 见文件头第 1 条。
   * 由 `main.ts` 把 `mountNav({ onOpenChange })` 接到这里：目录先挂、控件条后挂，
   * 所以这条线只能是"后者提供一个方法，前者回头调它"。
   */
  dispose(): void;
}

/**
 * 把当前**全部**可表达状态写回 URL，再换一个参数，然后重载。
 *
 * 为什么要连没变的一起写：重载是为了重建身体，不是为了重置演示。
 * 只带上 `?plan=mass` 的话，刚切到「夜潮 + 抵抗 + 关掉跟随延迟」的那一屏
 * 会在重载之后变回默认 —— 现场演示到这里就断了。
 */
function reloadWith(host: ControlsHost, patch: Record<string, string | null>): void {
  const q = new URLSearchParams(location.search);
  const set = (k: string, v: string | null): void => {
    if (v === null) q.delete(k);
    else q.set(k, v);
  };
  // 当前状态。物种必须带上，否则重载会掉回选择页 —— 那是另一段体验，不是"换个身体"
  if (host.themeId) set('theme', host.themeId);
  set('plan', host.planId());
  set('scene', host.sceneId());
  const act = host.actId();
  if (act) set('act', act);
  set('vitality', host.vitality() ? '1' : '0');
  set('refine', host.refine() ? '1' : '0');
  set('nopost', host.post() ? null : '1');
  set('mute', host.muted() ? '1' : null);
  // 描边**故意不带走**。它和上面几项不一样：那些是"这一屏怎么演"，
  // 而描边是**物种自己的声明**（`creature/shading.ts` 的那张表）——
  // 把它带过去等于把「线」的身份套到下一个物种头上。`?shading=` 照常管用，那是显式的。
  for (const [k, v] of Object.entries(patch)) set(k, v);
  location.assign(`${location.pathname}?${q.toString()}`);
}

/** 一个选项按钮：中英并置的名字 + 一句短说明。没有图标，没有圆角 */
function option(copy: CopyPair, onPick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'sb-ctl-opt';
  const name = document.createElement('span');
  name.className = 'sb-ctl-opt-name sb-bi-inline';
  setBi(name, copy.name);
  const note = document.createElement('span');
  note.className = 'sb-ctl-opt-note';
  setBi(note, copy.note);
  b.append(name, note);
  b.addEventListener('click', onPick);
  return b;
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
  if (key) {
    const k = document.createElement('span');
    k.className = 'sb-ctl-key';
    k.textContent = key;
    head.append(k);
  }
  const sub = document.createElement('p');
  sub.className = 'sb-ctl-note';
  setBi(sub, note);
  sec.append(head, sub);
  return sec;
}

export function mountControls(options: ControlsOptions): Controls | null {
  const { enabled = true, host, nav = null, mount = document.body } = options;
  if (!enabled || typeof document === 'undefined') return null;

  const C = COPY.controls;
  const root = document.createElement('aside');
  root.className = 'sb-ctl';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'sb-ctl-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  setBi(toggle, C.title);

  const panel = document.createElement('div');
  panel.className = 'sb-ctl-panel';
  panel.hidden = true;

  /** 每一组各自登记一个"把高亮刷新到当前状态"的函数。状态只有一份，在 host 上 */
  const syncs: (() => void)[] = [];
  const markCurrent = (row: HTMLElement, isOn: (i: number) => boolean): void => {
    syncs.push(() => {
      const kids = Array.from(row.children) as HTMLElement[];
      kids.forEach((el, i) => {
        const on = isOn(i);
        el.classList.toggle('is-on', on);
        el.setAttribute('aria-pressed', String(on));
      });
    });
  };
  const sync = (): void => { for (const f of syncs) f(); };

  const addRow = (sec: HTMLElement, cls = ''): HTMLElement => {
    const row = document.createElement('div');
    row.className = `sb-ctl-row${cls ? ` ${cls}` : ''}`;
    sec.append(row);
    return row;
  };

  // ── 1. 形体 ───────────────────────────────────────────────────────────────
  // **放第一组是刻意的。** 一个评委只按一个控件的话，应该是这一个：
  // 他站在原地不动，按下「四足」，自己的手臂变成前腿 —— 那一下同时说完了
  // "它用你的身体活过来"和"它不是你"。场景只改变它在哪，玩法要看几秒才读得出来，
  // 而形体在一帧之内就把这件作品的命题演示完了。
  const formSec = group(C.groups.form, C.groupNotes.form, 'F');
  const formRow = addRow(formSec);
  for (const id of FORM_IDS) {
    const copy = pick(C.form, id);
    if (!copy) continue;
    formRow.append(option(copy, () => setForm(id)));
  }
  markCurrent(formRow, (i) => FORM_IDS[i] === host.planId());

  // ── 2. 画面 ───────────────────────────────────────────────────────────────
  const sceneSec = group(C.groups.scene, C.groupNotes.scene, 'S');
  const sceneRow = addRow(sceneSec);
  for (const id of SCENE_IDS) {
    const copy = pick(C.scene, id);
    if (!copy) continue;
    sceneRow.append(option(copy, () => { host.setScene(id); sync(); }));
  }
  markCurrent(sceneRow, (i) => SCENE_IDS[i] === host.sceneId());

  // ── 3. 玩法 ───────────────────────────────────────────────────────────────
  // id 从 director 那边传进来，不在这里重排：加一个玩法只该改 `acts/index.ts` 一处。
  const actSec = group(C.groups.act, C.groupNotes.act, 'A');
  const actRow = addRow(actSec);
  const actIds = host.actIds.filter((id) => pick(C.act, id));
  for (const id of actIds) {
    const copy = pick(C.act, id)!;
    actRow.append(option(copy, () => { host.setAct(id); sync(); }));
  }
  markCurrent(actRow, (i) => actIds[i] === host.actId());

  // ── 4. 渲染 ───────────────────────────────────────────────────────────────
  // 四个开关形状一样：读一个 boolean，写一个 boolean，右边写「开 / 关」。
  const renderSec = group(C.groups.render, C.groupNotes.render, null);
  const renderRow = addRow(renderSec, 'sb-ctl-row--toggles');
  const toggles: { copy: CopyPair; key: string; get(): boolean; flip(): void }[] = [
    { copy: C.render.vitality, key: 'D', get: () => host.vitality(), flip: () => host.setVitality(!host.vitality()) },
    { copy: C.render.refine, key: 'R', get: () => host.refine(), flip: () => host.setRefine(!host.refine()) },
    { copy: C.render.post, key: 'P', get: () => host.post(), flip: () => host.setPost(!host.post()) },
    { copy: C.render.mute, key: 'M', get: () => !host.muted(), flip: () => { host.toggleMute(); } },
  ];
  // 描边只在"这具身体有网格可套"时才出现（见 ControlsHost.shading）。
  // 它放在最后：前四项说的都是"它为什么像活的"，这一项说的是"它是被画出来的"。
  const readShading = host.shading;
  const writeShading = host.setShading;
  if (readShading && writeShading) {
    toggles.push({
      copy: C.render.outline,
      key: 'O',
      get: () => readShading() === 'toon',
      flip: () => { writeShading(readShading() === 'toon' ? 'physical' : 'toon'); },
    });
  }
  for (const t of toggles) {
    const b = option(t.copy, () => { t.flip(); sync(); });
    const state = document.createElement('span');
    state.className = 'sb-ctl-state';
    b.append(state);
    const k = document.createElement('span');
    k.className = 'sb-ctl-key';
    k.textContent = t.key;
    b.querySelector('.sb-ctl-opt-name')?.append(k);
    syncs.push(() => {
      const on = t.get();
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
      const s = on ? COPY.controls.on : COPY.controls.off;
      state.textContent = `${s.zh} · ${s.en}`;
    });
    renderRow.append(b);
  }

  // ── 5. 身体（物种）──────────────────────────────────────────────────────────
  // 29 条不平铺：一个筛选框 + 一列可滚的名字。这一组放最后，因为它是**浏览**行为
  // 而不是演示行为 —— 而且它是唯一一个会重开一次的组，前面四组全部当场生效。
  const spSec = group(C.groups.species, C.groupNotes.species, null);
  const filter = document.createElement('input');
  filter.type = 'search';
  filter.className = 'sb-ctl-filter';
  filter.placeholder = `${C.filter.zh} · ${C.filter.en}`;
  filter.setAttribute('aria-label', C.filter.zh);
  const spList = document.createElement('div');
  spList.className = 'sb-ctl-species';
  const spRows: { el: HTMLElement; hay: string }[] = [];
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
    b.addEventListener('click', () => reloadWith(host, { theme: t.id, plan: null }));
    spList.append(b);
    spRows.push({ el: b, hay: `${t.id} ${t.name} ${t.nameEn} ${t.tagline ?? ''}`.toLowerCase() });
    syncs.push(() => b.classList.toggle('is-on', t.id === host.themeId));
  }
  filter.addEventListener('input', () => {
    const q = filter.value.trim().toLowerCase();
    for (const r of spRows) r.el.hidden = q !== '' && !r.hay.includes(q);
  });
  spSec.append(filter, spList);

  // ── Key 条 ────────────────────────────────────────────────────────────────
  // 现场和演示时手比鼠标快。每个键都要在这里看得见 —— 一个没有写出来的快捷键
  // 等于不存在。**刻意避开 1–9 / ↑↓ / Enter / 空格**：选择页在用（docs/23 §S2）。
  const keys = document.createElement('footer');
  keys.className = 'sb-ctl-keys';
  const keyLabel = document.createElement('span');
  keyLabel.className = 'sb-label';
  keyLabel.textContent = `${C.keys.title.zh} · ${C.keys.title.en}`;
  keys.append(keyLabel);
  const KEY_ROWS: [string, BiText][] = [
    ['`', C.keys.toggle],
    ['F', C.keys.form],
    ['S', C.keys.scene],
    ['A', C.keys.act],
    ['D', C.keys.vitality],
    ['R', C.keys.refine],
    ['P', C.keys.post],
    ['M', C.keys.mute],
    ...(readShading && writeShading ? [['O', C.keys.outline] as [string, BiText]] : []),
  ];
  for (const [k, text] of KEY_ROWS) {
    const row = document.createElement('div');
    row.className = 'sb-ctl-keyrow';
    const cap = document.createElement('span');
    cap.className = 'sb-ctl-key';
    cap.textContent = k;
    const what = document.createElement('span');
    what.className = 'sb-ctl-opt-note';
    setBi(what, text);
    row.append(cap, what);
    keys.append(row);
  }

  panel.append(formSec, sceneSec, actSec, renderSec, spSec, keys);
  root.append(toggle, panel);
  mount.append(root);

  // ── 行为 ──────────────────────────────────────────────────────────────────

  /** 形体：七种骨架之间热切；进出「团块」是另一条身体实现，必须重建 */
  function setForm(id: string): void {
    const now = host.planId();
    if (id === now) return;
    if (id === MASS || now === MASS) { reloadWith(host, { plan: id }); return; }
    host.setPlan(id);
    sync();
  }

  const cycle = (ids: readonly string[], now: string | null, use: (id: string) => void): void => {
    if (!ids.length) return;
    const i = Math.max(0, ids.indexOf(now ?? ''));
    use(ids[(i + 1) % ids.length]!);
  };

  let open = false;
  const setOpen = (next: boolean): void => {
    open = next;
    panel.hidden = !next;
    toggle.setAttribute('aria-expanded', String(next));
    root.classList.toggle('is-open', next);
    root.classList.remove('is-faded');
    // 两条都在右上角：这一条展开，目录就收起来。不重叠不靠运气（见文件头第 1 条）
    if (next) nav?.close();
    if (next) sync();
  };
  toggle.addEventListener('click', () => setOpen(!open));

  /** 整条显示 / 藏起来（`` ` `` 或 `h`）。藏起来之后快捷键照常生效 */
  let shown = true;
  const setShown = (next: boolean): void => {
    shown = next;
    root.hidden = !next;
    if (!next) setOpen(false);
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // 正在筛物种的时候，`s` 是一个字母不是一个快捷键
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    const k = e.key.toLowerCase();
    if (k === 'escape' && open) { setOpen(false); return; }
    if (k === '`' || k === 'h') { setShown(!shown); return; }
    if (k === 'f') { cycle(FORM_IDS, host.planId(), setForm); return; }
    if (k === 's') { cycle(SCENE_IDS, host.sceneId(), (id) => { host.setScene(id); sync(); }); return; }
    if (k === 'a') { cycle(actIds, host.actId(), (id) => { host.setAct(id); sync(); }); return; }
    if (k === 'd') { host.setVitality(!host.vitality()); sync(); return; }
    if (k === 'r') { host.setRefine(!host.refine()); sync(); return; }
    if (k === 'p') { host.setPost(!host.post()); sync(); return; }
    if (k === 'o' && readShading && writeShading) {
      writeShading(readShading() === 'toon' ? 'physical' : 'toon');
      sync();
      return;
    }
    // `m` 不在这里处理：`sound/sound.ts` 自己已经绑了它（docs/29）。
    // 两处都绑的结果是按一下切两次，也就是什么都没发生 —— 这里只负责把状态刷新出来。
    if (k === 'm') { setTimeout(sync, 0); return; }
  };
  addEventListener('keydown', onKey);

  // 点别处收起面板。捕获阶段：面板压在 canvas 上，而 canvas 会吞掉 pointerdown
  const onAway = (e: Event): void => {
    if (open && !root.contains(e.target as Node)) setOpen(false);
  };
  addEventListener('pointerdown', onAway, true);

  // 每秒把高亮刷一次。两条理由，都不是"保险起见"：
  //  1. 玩法会自己换 —— 导演按 weight 随机选角，没人点过任何按钮。
  //  2. 有些状态要过一帧才成立。`stage.setPost(true)` 只是把开关翻过来，
  //     后期链要等下一次 `render()` 才重建，`stage.post` 在那之前仍然是 false ——
  //     点击当下读到的是"关"，一秒后这一次轮询把它纠正过来。
  // 1 秒足够：它是一个状态指示，不是一个动画。
  const poll = setInterval(sync, 1000);
  sync();

  // 进场 4 秒后淡下去，和目录、和 `ui/page.ts` 的浮层页头同一个数、同一条规矩
  // （docs/23 §S4「观众只需要知道一次」）。鼠标碰上去它自己回来，在 CSS 里。
  setTimeout(() => { if (!open) root.classList.add('is-faded'); }, FADE_AFTER_MS);

  return {
    root,
    dispose() {
      clearInterval(poll);
      removeEventListener('keydown', onKey);
      removeEventListener('pointerdown', onAway, true);
      root.remove();
    },
  };
}
