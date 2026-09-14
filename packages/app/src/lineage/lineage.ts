/**
 * `/lineage` —— 谱系页。
 *
 * ## 它回答的那一个问题
 *
 * **一个观众站在装置前，怎么知道"我身上这块是别人留下的"。**
 *
 * 机制早就在了（`docs/17 §5`：血统池跨会话持久，前人留下的件进下一个人的候选池），
 * 但 `docs/26 §C3` 立了一条判据：**后果不可见 = 后果不存在**。
 * 在这一页之前，"制造关系"和"留下后果"这两个角色在代码里成立、在观众眼里不存在。
 * 所以这一页不是锦上添花，它是那两条成立与否的剩余条件。
 *
 * ## 四条决定，四条都是有取舍的
 *
 * 1. **人的序号，不是时间戳。** session 是匿名随机串（`anon-xxxxxxxx`），
 *    印出来既没有意义又像泄漏了什么。「第 137 位」有意义，因为它说的是
 *    **谁在谁之后** —— 而这正是"留下后果"的形状。时间退到最暗的一栏。
 *
 * 2. **沉积，不是列表。** 池子只增不减（`lineageMaxParts` 到顶后丢索引，
 *    但不回退、不删文件）。列表回答"有哪些"，回答不了"有多厚"，
 *    而这一页真正要让人感觉到的是厚度。所以正文之前先有一叠剖面（`renderStrata`）。
 *
 * 3. **那件东西要能被看见。** 每条记录都指向一个真 glb。缩略图直接复用
 *    `dev/thumbs.ts` —— 共享 renderer + IntersectionObserver 懒渲 + 画进 2D canvas，
 *    无 WebGL 时退到按 aabb 的比例剪影。那个文件已经把三个坑都踩完了
 *    （191 个 WebGL 上下文、失败不许影响别件、没有 GL 也要好看），不重造一份。
 *
 * 4. **空池和 404 是两种正常状态，不是错误。** 装置每次开机池子都是空的；
 *    线上 Web 版没有这条回路（`/__slow` 是 `apply:'serve'` 的中间件，生产构建里
 *    根本不存在）。两种都用和正文一样的排版说一句有分量的话 —— 一旦配上居中小字
 *    或者叹号，观众读到的就是"这一页坏了"。
 *
 * 文案一个字符串都不在这里，全部在 `ui/i18n.ts` 的 `COPY.lineage`（中英并置）。
 */
import type { PartLibraryIndex, PartMeta, ThemeDef } from '../../../core/src/types.ts';
import { COPY, setBi, type BiText } from '../ui/i18n.ts';
import { markNode } from '../ui/mark.ts';
import { mountNav } from '../ui/nav.ts';
// 缩略图方案只有一份。它住在 dev/ 是因为 `/dev/parts.html` 先用上它，
// 但它本身没有任何 dev-only 的东西：一个纯模块，照用。
import { createThumb, createThumbObserver } from '../../dev/thumbs.ts';
import '../ui/type.css';
import '../ui/editorial.css';
import './lineage.css';

const L = COPY.lineage;

/** glb 的取件根。dev 下 `assets/` 是静态根，件在 `/parts/lineage/<id>.glb` */
const PARTS_BASE = '/parts';

/** 服务端 `GET /__slow/lineage` 的那一半（`docs/17 §3`）。只取这一页用得上的字段 */
interface LineageTrace {
  id: string;
  session: string;
  createdAt: string;
  species: string;
  slot: string;
  provider: string;
}
interface LineagePayload {
  chance: number;
  total: number;
  parts: PartMeta[];
  entries: LineageTrace[];
}

/**
 * 第二个数据源：`GET /api/visits`（`docs/43 §8`）。
 *
 * 一条 A 档记录只有三样东西 —— 序号、物种、粗到天的日期。
 * 字段清单和它为什么只能是这三个，写在 `packages/archive/src/visit.ts`。
 */
interface VisitRow { n: number; species: string; at: string }
interface VisitsPayload { total: number; entries: VisitRow[] }

// ─────────────────────────── DOM 小工具 ───────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, className?: string, ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...kids);
  return node;
}

function biEl<K extends keyof HTMLElementTagNameMap>(tag: K, t: BiText, className?: string) {
  const node = el(tag, className);
  setBi(node, t);   // setBi 自己会补上 .sb-bi
  return node;
}

// ─────────────────────────── 读数据 ───────────────────────────

/**
 * 拿血统池。**404 是正常答案**（`docs/17 §8` 第 2 条）：线上 Web 版本来就没有这条回路。
 * 所以这里把"没有回路"和"回路出错"归成同一个 `null` —— 对观众来说它们是同一件事，
 * 而这一页对这件事有一句准备好的话要说（`renderOffline`）。
 */
async function loadLineage(): Promise<LineagePayload | null> {
  try {
    const res = await fetch('/__slow/lineage');
    if (!res.ok) return null;
    const j = (await res.json()) as Partial<LineagePayload>;
    if (!Array.isArray(j.parts) || !Array.isArray(j.entries)) return null;
    return {
      chance: typeof j.chance === 'number' ? j.chance : 0,
      total: typeof j.total === 'number' ? j.total : j.entries.length,
      parts: j.parts,
      entries: j.entries,
    };
  } catch { return null; }
}

/**
 * 拿存档（`docs/43 §8`）。**先问它，再问血统池** —— §8 第 4 条。
 *
 * 返回形状是照抄 `GET /__slow/lineage` 的（`{ok, total, entries}`），
 * 所以这里和上面那个函数长得几乎一样，那是故意的。
 *
 * **总数为 0 也当作"没有"**：装置那台机器上两条回路都在，存档默认是内存实现、
 * 每次开机从头数，而血统池是盘上的。空的存档如果算数，它会把那台机器上
 * 真正有内容的那一半挡在后面。空和缺席在这一页上本来就是同一句话
 * （`renderState` 那两句是两个构型、同一个位置），所以这里合并没有代价。
 */
async function loadVisits(): Promise<VisitsPayload | null> {
  try {
    const res = await fetch('/api/visits');
    if (!res.ok) return null;
    const j = (await res.json()) as Partial<VisitsPayload>;
    if (!Array.isArray(j.entries) || typeof j.total !== 'number' || j.total <= 0) return null;
    return { total: j.total, entries: j.entries };
  } catch { return null; }
}

/**
 * 物种的中文名。`species` 是 `PartMeta.family`（`porcelain`），
 * 观众该读到的是「瓷」。读不到 `parts.json` 就退回 id —— 少一个名字，不少一行。
 */
async function loadThemeNames(): Promise<Map<string, BiText>> {
  const names = new Map<string, BiText>();
  try {
    const res = await fetch('/parts/parts.json');
    if (!res.ok) return names;
    const j = (await res.json()) as PartLibraryIndex;
    for (const t of (j.themes ?? []) as ThemeDef[]) {
      if (t?.id) names.set(t.id, { zh: t.name ?? t.id, en: t.nameEn ?? t.id });
    }
  } catch { /* 断网的笔记本上也要能打开这一页 */ }
  return names;
}

// ─────────────────────────── 序号与时间 ───────────────────────────

/**
 * 每条记录对应的**人的位次**。
 *
 * 服务端吐回的是整池最后 `lineageServeLimit` 条、**最新在前**（`docs/17 §5`），
 * 外加整池的 `total`。于是窗口里第 i 条在整池中的位次（1 起）就是 `total - i`。
 *
 * 位次算在**人**身上而不是件身上：同一个人留下两件，两件同号。
 * 取那个 session 最早一条的位次 —— 数组是最新在前，所以后出现的 i 更早、位次更小，
 * 一路覆盖下去自然落在最小值上。
 *
 * 一个已知的边界：如果某个人更早的那几件已经掉出窗口，这里算出来的会偏大。
 * `SLOW_LOOP.maxPerSession` 是 1，所以现场不会发生；写在这里是因为改那个旋钮的人该知道。
 */
function visitorNumbers(entries: LineageTrace[], total: number): number[] {
  const bySession = new Map<string, number>();
  entries.forEach((e, i) => bySession.set(e.session, total - i));
  return entries.map((e) => bySession.get(e.session) ?? total);
}

/** 多久以前。时间在这一页上只需要粗到"今天/昨天/几天前" —— 精确到秒没有人要 */
function whenText(createdAt: string): { label: BiText; n: string } | null {
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return null;
  const day = (ms: number) => Math.floor(ms / 86_400_000);
  const days = day(Date.now()) - day(t);
  if (days <= 0) return { label: L.today, n: '' };
  if (days === 1) return { label: L.yesterday, n: '' };
  return { label: L.daysAgo, n: String(days) };
}

// ─────────────────────────── 各块 ───────────────────────────

function renderHeader(root: Element): void {
  const head = el('header', 'ed-hero');

  const meta = el('div', 'ed-hero__meta');
  const back = el('a', 'ed-hero__back');
  back.href = '/about';
  setBi(back, COPY.about.back);
  const work = el('span', 'sb-label sb-bi-inline');
  setBi(work, COPY.title);
  // 字标**最后** append：这一条横带靠 `justify-content: space-between` 分两端，
  // 顺序就是左右。先前多写了一次 `meta.append(back, …)`，那会把 back
  // 从原位**移到**末尾（append 移动已有节点，不是复制），于是字标跑到了左边。
  meta.append(back, work, markNode('span'));

  head.append(meta, el('hr', 'ed-rule ed-rule--heavy'));

  const titleBox = el('div', 'ed-hero__title');
  const h1 = biEl('h1', L.title, 'sb-display ed-rise');
  h1.querySelector('.sb-zh')?.setAttribute('style', '--ed-i:0');
  h1.querySelector('.sb-en')?.setAttribute('style', '--ed-i:1');
  titleBox.append(h1);
  head.append(titleBox, el('hr', 'ed-rule'));

  const lede = el('div', 'ed-hero__lede');
  lede.append(el('div', undefined, biEl('p', L.thesis), biEl('p', L.lede, 'ln-lede')));
  head.append(lede);

  root.append(head);
}

/** 两个巨大的数。数字自己是句子，右边只是把它读出来 */
function renderCounts(root: Element, data: LineagePayload): void {
  const box = el('div', 'ln-counts');
  const count = (n: string, label: BiText): HTMLElement =>
    el('div', 'ln-count', el('div', 'ln-count__n', n), biEl('div', label, 'ln-count__label'));

  box.append(count(String(data.total), L.countParts));
  box.append(count(`${Math.round(data.chance * 100)}%`, L.countChance));
  root.append(box);
}

/**
 * 沉积剖面。一件一条线，最新在顶、最早在底 —— 沉积就是这个方向。
 * 线的**宽度**是那件的横向粗细（`localGirth`，归一化后长度恒为 1），
 * 所以这一叠不是装饰性条纹，它是一排真实的剖面。
 *
 * 窗口取不回来的更早那一段照样画，只是画得暗：不知道不等于不存在，
 * 而这一页的全部意义就是让"厚度"说话 —— 少画的那几十层会把厚度说小。
 */
interface StrataOpts {
  total: number;
  /** 每一层的剖面。存档那一边是空的 —— 一条 A 档记录没有一个可以量的东西 */
  parts: PartMeta[];
  note: BiText;
  /**
   * 每一层都是**已知**的吗。
   *
   * 血统池那一边，窗口取不回来的更早那一段画得暗（不知道不等于不存在）。
   * 存档那一边不一样：每一层都确实是一个走完过弧线的人，只是没有厚度可量。
   * 把它们画成"更早的、取不回来的"会说错一件事，所以给一个恒定宽度、不加暗。
   */
  uniform?: number;
}

function renderStrata(root: Element, data: StrataOpts): void {
  const box = el('div', 'ln-strata');
  const stack = el('div', 'ln-strata__stack');

  // 层数多了就把层收细，否则 240 件会把整页撑成一根柱子
  const dense = data.total > 60;
  stack.style.setProperty('--ln-bar', dense ? '2px' : '3px');
  stack.style.setProperty('--ln-gap', dense ? '1px' : '2px');

  for (let i = 0; i < data.total; i++) {
    const meta = data.parts[i] as PartMeta | undefined;
    const layer = el('div', 'ln-layer');
    if (data.uniform !== undefined) {
      layer.style.setProperty('--w', `${Math.round(data.uniform * 100)}%`);
      if (i === 0) layer.classList.add('ln-layer--newest');
    } else if (meta) {
      // localGirth ∈ (0,1]，映到 22%–100%：最细的那件也要看得见是一层
      const w = Math.max(0.22, Math.min(1, meta.localGirth || 0.3));
      layer.style.setProperty('--w', `${Math.round(w * 100)}%`);
      if (i === 0) layer.classList.add('ln-layer--newest');
    } else {
      layer.classList.add('ln-layer--older');
      layer.style.setProperty('--w', '34%');
    }
    stack.append(layer);
  }

  box.append(stack, biEl('p', data.note, 'ln-note'));
  if (data.uniform === undefined && data.total > data.parts.length) {
    box.append(biEl('p', L.strataOlder, 'ln-note'));
  }
  root.append(box);
}

/** 一件一行：人的位次 / 那件东西 / 它是什么、长在哪、多久以前 */
function renderRow(
  trace: LineageTrace,
  meta: PartMeta | undefined,
  no: number,
  names: Map<string, BiText>,
  observer: IntersectionObserver,
): HTMLElement {
  const row = el('div', 'ln-row');

  row.append(el('div', 'ln-row__no sb-num', String(no)));

  // 缩略图：拿得到 meta 就渲真件（滚进视口才渲），拿不到就留一个同尺寸的空框 ——
  // 空框比一张破图诚实，而且不会让这一行的高度跳一下
  const thumbCell = el('div', 'ln-row__thumb');
  if (meta) {
    const canvas = createThumb(meta, observer, PARTS_BASE);
    canvas.classList.add('ln-row__canvas');
    thumbCell.append(canvas);
  }
  row.append(thumbCell);

  const body = el('div', 'ln-row__body');
  body.append(biEl('div', names.get(trace.species) ?? { zh: trace.species, en: trace.species },
                   'ln-row__species'));

  const facts = el('dl', 'ln-facts sb-data');
  const fact = (label: BiText, value: BiText, cls?: string): HTMLElement => {
    const pair = el('div', cls);
    pair.append(biEl('dt', label, 'sb-label'), biEl('dd', value));
    return pair;
  };

  const slotName = (L.slots as Record<string, BiText | undefined>)[trace.slot]
    ?? { zh: trace.slot, en: trace.slot };
  facts.append(fact(L.where, slotName));

  const when = whenText(trace.createdAt);
  if (when) {
    facts.append(fact(L.when, when.n
      ? { zh: `${when.n} ${when.label.zh}`, en: `${when.n} ${when.label.en}` }
      : when.label, 'ln-when'));
  }
  body.append(facts);

  // provider 不是 hyper3d 的，说清楚它不是生成模型造的。这一页靠"它是真的"活着
  if (trace.provider !== 'hyper3d') {
    body.append(biEl('p', L.rehearsal, 'sb-label'));
  }

  row.append(body);
  return row;
}

function renderList(root: Element, data: LineagePayload, names: Map<string, BiText>): void {
  root.append(el('hr', 'ed-rule'));
  const sec = el('section', 'ed-section');
  sec.append(biEl('h2', L.sec, 'ed-section__tag'));

  const bodyCol = el('div', 'ed-section__body');
  bodyCol.append(biEl('p', L.secNote, 'ln-note'));

  const list = el('div', 'ln-list');
  const observer = createThumbObserver();
  const numbers = visitorNumbers(data.entries, data.total);
  data.entries.forEach((trace, i) => {
    list.append(renderRow(trace, data.parts[i], numbers[i], names, observer));
  });
  bodyCol.append(list);

  sec.append(bodyCol);
  root.append(sec);
}

/**
 * 存档那一边的整页（`docs/43 §8`）。
 *
 * **只有两块：一个数，和那一叠沉积。** 没有逐条列表 —— 这不是省事，
 * 是 `§2.1` 自己写的：A 档买到的是「有多少人来过」和「`/lineage` 的那叠沉积剖面，
 * 第一次对网页版成立」。一条 A 档记录没有件可以看，把它排成一行一行、
 * 每行一个空的缩略图框，画出来的正是这一页的代码注释里点名不许出现的那种"破图"。
 *
 * 血统池那一边一行都没动 —— 版面不许改（`§8` 末尾的不做清单）。
 */
function renderVisits(root: Element, data: VisitsPayload, names: Map<string, BiText>): void {
  const box = el('div', 'ln-counts');
  box.append(el('div', 'ln-count',
    el('div', 'ln-count__n', String(data.total)),
    biEl('div', L.countVisits, 'ln-count__label')));
  root.append(box);

  renderStrata(root, { total: data.total, parts: [], note: L.strataVisits, uniform: 0.34 });

  root.append(el('hr', 'ed-rule'));
  const sec = el('section', 'ed-section');
  sec.append(biEl('h2', L.sec, 'ed-section__tag'));
  const bodyCol = el('div', 'ed-section__body');
  bodyCol.append(biEl('p', L.visitsNote, 'ln-note'));

  // 物种那一栏。存下来却不显示，等于没存 —— 这一页的论点就是
  // `docs/26 §C3`「后果不可见 = 后果不存在」，它对自己也适用。
  // 用已有的 `ln-facts` 语域（一行一对），不新造版面。
  const tally = new Map<string, number>();
  for (const row of data.entries) tally.set(row.species, (tally.get(row.species) ?? 0) + 1);
  if (tally.size) {
    const facts = el('dl', 'ln-facts sb-data');
    for (const [species, n] of [...tally].sort((a, b) => b[1] - a[1])) {
      const pair = el('div');
      pair.append(biEl('dt', names.get(species) ?? { zh: species, en: species }, 'sb-label'));
      pair.append(el('dd', 'sb-num', String(n)));
      facts.append(pair);
    }
    bodyCol.append(facts);
  }

  // `docs/43 §9.8` 的那一句。位置在画面之外、和这一页其它文字同一列，不做角标
  bodyCol.append(biEl('p', L.replay, 'ln-note'));
  sec.append(bodyCol);
  root.append(sec);
}

/** 空池 / 生产构建下的 404 —— 同一个构型，两句不同的话 */
function renderState(root: Element, title: BiText, body: BiText): void {
  const box = el('div', 'ln-state');
  box.append(biEl('div', title, 'ln-state__title'), biEl('div', body, 'ln-state__body'));
  root.append(el('hr', 'ed-rule'), box);
}

// ─────────────────────────── 装配 ───────────────────────────

async function render(root: HTMLElement): Promise<void> {
  // COPY.title 是全站唯一倒置的一对：.zh 存的是作品名（英文），.en 存中文说明
  document.title = `${L.title.zh} · ${L.title.en} — ${COPY.title.zh}`;
  renderHeader(root);

  // **两个数据源，先问存档再问血统池**（`docs/43 §8` 第 4 条）。
  // 在这之前，线上的 `useeme.ptoq.io/lineage` 永远是那句 404 的话 ——
  // 机制在，但线上的观众一次都看不到。
  const visits = await loadVisits();
  if (visits) {
    renderVisits(root, visits, await loadThemeNames());
    return;
  }

  const data = await loadLineage();

  // 两条回路都不在。如实说它在哪，然后停
  if (!data) return renderState(root, L.offTitle, L.offBody);

  // 装置刚开机。不是错误，是这件作品每一次的起点
  if (!data.total) return renderState(root, L.emptyTitle, L.emptyBody);

  renderCounts(root, data);
  renderStrata(root, { total: data.total, parts: data.parts, note: L.strata });
  renderList(root, data, await loadThemeNames());

  root.append(el('hr', 'ed-rule'), biEl('footer', L.foot, 'ln-foot'));
}

const mount = document.querySelector<HTMLElement>('#lineage');
if (mount) void render(mount);
mountNav();
