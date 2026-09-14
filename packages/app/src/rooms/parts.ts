/**
 * 侧室 `/parts` —— 部件档案。
 *
 * 它以前是一张调试用的接触表（正交相机 + 平铺网格），回答"哪件比例崩了"，
 * 住在 `/dev/parts.html`。现在它要多回答一个问题：**这件作品到现在为止长出了什么？**
 * 那个问题**观众也有**，所以它被展出：换了 URL（`/parts`，和 `/about` 平级，
 * 不再是后台的一条路），换了页头（`rooms/room.ts` 的横带，带一条回去的路），
 * 其余一个像素都没动 —— 它好看是因为它穷尽且不动声色，
 * 而不是因为有人给它配了一段说明。给它配一段解释"这张表为什么好看"的说明，
 * 恰恰会毁掉它。
 *
 * 它是一份可以直接给人看的档案：
 *
 *   左边一列目录  kind → 条目 → 槽位，点哪跳哪
 *   右边一份档案  每个条目一栏（anchor 图 / 名字 / tagline / 形态空间 / 身体方案 / 件数），
 *                 下面按槽位分组列出它的每一件部件
 *
 * ── 三条约束决定了它的形状 ──
 *
 * 1. **它要能在公网打开。** 所以数据只来自 `/parts/parts.json` 和 `/parts/curation.json`
 *    这两个会被 build 复制进 dist 的文件，不依赖任何 dev-only 中间件。
 *    评级写回（`POST /__curate`）在生产上不存在 —— 那里没有中间件，
 *    于是这一页**优雅降级成只读**：页头如实写「只读」，格子不再可点，
 *    不弹错、不报 404。能读的部分一点不少。
 *
 * 2. **不显示破图。** 没有 anchor 图的条目整列不占位（docs/23 §S2：
 *    「破图会立刻毁掉整个气质」）。缩略图那边同理，见 thumbs.ts。
 *
 * 3. **空状态是被设计的。** parts.json 缺失 / 解析不出来 / 一件都没有，
 *    这一页要显示一段说得通的话，而不是白屏或一行红色异常（docs/02 §craft）。
 *
 * ── `archive.css` 和 `thumbs.ts` 住在 `dev/`，但守卫看得见它们 ──
 *
 * 搬进 `src/rooms/` 的时候，那两个文件里有写死的十六进制色（策展的绿框红框、
 * socket 的红蓝两端），而十六进制守卫只扫 `src/` —— 于是第二处"颜色承担语义"
 * 隔着一条目录边界进了展出页，那个本来就是为拦它而存在的仪表看不见它。
 * 裁定（2026-09-14，作品负责人）：
 *   - 展出的这一页上，策展状态和 socket 两端**不用色相说**，用墨的浓淡、虚实、
 *     单双线、实心/空心来说（`ui/marks.ts` 的两支笔）。规则写在那两个文件里。
 *   - 策展模式（`can-curate`，只有 `/__curate` 在的时候才有）是我们的仪器，色相可以留，
 *     但只许挂在 `.sb-archive.can-curate` 底下。
 *   - 守卫不再按目录扫，而是**顺着每一张根目录展出页的 import 走**
 *     （`test/css-tokens.test.ts`），所以文件住在哪不再决定它被不被看见。
 *
 * ── 保留下来的东西 ──
 * 策展的三档外框、点一下循环 未评→keep→reject 的手势、可疑比例的标注 ——
 * 这一页原来的全部工作价值都在这三样里，一样没删；变的只是它们用什么说。
 */
import '../../dev/archive.css';
import { COPY, setBi } from '../ui/i18n.ts';
import { loadImage } from '../choose/cards.ts';
import { createThumb, createThumbObserver, thumbsUseGl } from '../../dev/thumbs.ts';
import { themeAnchor } from '../ui/species.ts';
import { mountRoom } from './room.ts';
import type { PartLibraryIndex, PartMeta, ThemeDef } from '../../../core/src/types.ts';

const PARTS_URL = '/parts/parts.json';
const PARTS_BASE = '/parts';
const REFS_BASE = '/refs';

/** 槽位的固定顺序：从头到脚。档案要能竖着读，不能按字母序 */
const SLOT_ORDER = [
  'head', 'neck', 'spine', 'clavicle', 'upperArm', 'foreArm', 'hand',
  'thigh', 'shin', 'foot', 'joint',
];

const KIND_ORDER: ThemeDef['kind'][] = ['archetype', 'character', 'guest'];
const KIND_LABEL: Record<string, string> = {
  archetype: '物种 ARCHETYPE',
  character: '角色 CHARACTER',
  guest: '嘉宾 GUEST',
};

type Verdict = 'keep' | 'reject';
interface CurationRow { verdict: Verdict | null; note?: string }

/**
 * `tension`（这个条目为什么存在）**还不在 parts.json 里** ——
 * 它只活在 `packages/factory/recipes/roster.ts`，而 `ThemeDef`（core/src/types.ts）
 * 是冻结契约，不能由这一页去加字段。
 * 所以这里按"可能有"处理：有就渲染，没有就整段不出现。
 * 哪天契约扩了、index 把它写出来了，这一页自己就会亮起来，不用再改一行。
 */
function tensionOf(theme: ThemeDef): string | null {
  const t = (theme as ThemeDef & { tension?: unknown }).tension;
  return typeof t === 'string' && t.trim() ? t : null;
}

/**
 * 取材行 —— 档案卡片上名字与 tagline 底下的那一行（docs/42 §5）。
 *
 * ```
 * 巡逻 · Patrol
 * 一个不该直立的东西直立了
 * ── 取材：Boston Dynamics Spot（几何：真实网格，BSD-3-Clause）
 * ```
 *
 * 为什么是这一行而不是改名：十五个条目"没说自己是哪台机器"，缺的是一行**显示**，
 * 不是一次改名 —— 名字是这件作品的第三处主张（`docs/26 §I` 只分了表面和拓扑）。
 * 而且 BSD-3 的非背书条款让"产品名当物种名"更危险不是更诚实：
 * 一张叫「Spot」的卡片读起来是品牌露出，一张叫「巡逻」、底下写着取材的卡片
 * 读起来是**注明出处**。同一份事实，后者才是署名（docs/42 §5 第 2 条）。
 *
 * 没有 `machine` = 这个条目是想象出来的（docs/26 §H 的「虚」），整行不出现 ——
 * 空着比写一句"无"诚实，那一档的意思本来就是"世界上没有可取的原件"。
 */
function machineLine(theme: ThemeDef): { zh: string; en: string } | null {
  const m = theme.machine;
  if (!m) return null;
  const who = m.name.startsWith(m.maker) ? m.name : `${m.maker} ${m.name}`;
  const real = m.geometry === 'real';
  // 授权缺席不是漏写，是第二档的那句话：真机存在，但没有一份可再分发的几何。
  const lic = m.license ? `，${m.license}` : '，没有可再分发的几何';
  const licEn = m.license ? `, ${m.license}` : ', no redistributable geometry';
  return {
    zh: `── 取材：${who}（几何：${real ? '真实网格' : '生成件'}${lic}）`
      + (m.note ? ` —— ${m.note}` : ''),
    en: `── Sourced from: ${who} (geometry: ${real ? 'real mesh' : 'generated'}${licEn})`,
  };
}

function bodyPlanOf(theme: ThemeDef): string {
  const plan = theme.bodyPlan;
  if (!plan) return 'rig';
  if (typeof plan === 'string') return plan;
  const kind = plan.kind ?? 'rig';
  const ratios = (['limb', 'torso', 'head', 'arm', 'leg'] as const)
    .filter((k) => typeof plan[k] === 'number')
    .map((k) => `${k} ${plan[k]!.toFixed(2)}`);
  return ratios.length ? `${kind} · ${ratios.join(' · ')}` : kind;
}

/** 和原来接触表同一条判据：比例离谱或面数过高的，标出来 */
const isOdd = (m: PartMeta): boolean => m.localGirth > 1.2 || m.localGirth < 0.08 || m.triCount > 5000;

// ── 数据 ────────────────────────────────────────────────────────────────────

async function readJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    // dev server 和 Vercel 都会把不存在的路径回成 index.html，别把一页 HTML 当 JSON 解析
    if ((r.headers.get('content-type') ?? '').includes('text/html')) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

/**
 * 评级写回还在不在。
 *
 * 探针是一个带 `?probe` 的空 POST。中间件在的时候回 204；中间件不在的时候
 * 静态托管回 404/405，或者直接把 index.html 回过来。
 * 204 = 有中间件，其余 = 只读。没有副作用，因为它什么都没写。
 * （原来靠没有 id 的 POST 换一个 400 —— 判断对，但每开一次页控制台就多一条红色的 400，
 * 从工作台点进来的人读到的是「坏了」。docs/47 导航审计）
 */
async function probeCurateWriteback(): Promise<boolean> {
  // 中间件只在 vite dev 上有。生产构建里这是常量 false，请求连同分支一起被摇掉 ——
  // 线上和 `vite preview` 不再每开一次页就换一条 404（docs/51 · C3）
  if (!import.meta.env.DEV) return false;
  try {
    const r = await fetch('/__curate?probe', { method: 'POST' });
    return r.status === 204;
  } catch {
    return false;
  }
}

// ── 页面 ────────────────────────────────────────────────────────────────────

const index = await readJson<PartLibraryIndex>(PARTS_URL);
const curation = (await readJson<Record<string, CurationRow>>('/parts/curation.json')) ?? {};
const canCurate = await probeCurateWriteback();

const themes = index?.themes ?? [];
const parts = index?.parts ?? [];

const R = COPY.rooms.parts;
const head = mountRoom({
  title: R.title,
  lede: R.lede,
  state: canCurate ? R.curatable : R.readOnly,
});

const root = document.createElement('div');
root.className = canCurate ? 'sb-archive can-curate' : 'sb-archive';
head.body.appendChild(root);

// parts.json 读不到 / 是空的：这一页仍然要说人话（docs/02 §craft）
if (!index || (!themes.length && !parts.length)) {
  root.classList.remove('sb-archive');
  const empty = document.createElement('div');
  empty.className = 'sb-empty';
  empty.style.padding = 'var(--sb-safe)';
  // 中英并置走 setBi（这一页现在是展出页，文案理由写在 `COPY.rooms.parts.emptyTitle` 上）。
  // 命令不进 COPY：它在两种语言里是同一串字，用 <code> 单独排。
  const title = document.createElement('h2');
  setBi(title, COPY.rooms.parts.emptyTitle);
  const why = document.createElement('p');
  setBi(why, COPY.rooms.parts.emptyWhy);
  const how = document.createElement('p');
  setBi(how, COPY.rooms.parts.emptyHow);
  const cmds = document.createElement('p');
  for (const c of ['npm run factory:generate', 'npm run factory:index']) {
    const code = document.createElement('code');
    code.textContent = c;
    cmds.append(code, ' ');
  }
  empty.append(title, why, how, cmds);
  root.appendChild(empty);
} else {
  buildArchive();
}

function buildArchive(): void {
  const observer = createThumbObserver();

  // theme id → 它的部件。family 就是 theme id（docs/03：两者是同一个概念）
  const byFamily = new Map<string, PartMeta[]>();
  for (const p of parts) {
    const list = byFamily.get(p.family) ?? [];
    list.push(p);
    byFamily.set(p.family, list);
  }

  // 库里有部件、但 themes[] 里没有对应条目的 family。
  // 档案不许默默吞掉数据 —— 造一个最小条目把它们摆出来。
  const orphanFamilies = [...byFamily.keys()].filter((f) => !themes.some((t) => t.id === f)).sort();
  const orphans: ThemeDef[] = orphanFamilies.map((id) => ({
    id, kind: 'archetype', name: id, nameEn: id,
    tagline: '库里有部件，但 parts.json 的 themes[] 里没有这个条目',
    palette: [], source: 'rodin', axes: { humanLike: 0.5, lifeLike: 0.5 }, coverage: 'light',
  }));

  const all = [...themes, ...orphans];
  const ordered = KIND_ORDER.flatMap((kind) => all.filter((t) => t.kind === kind))
    .concat(all.filter((t) => !KIND_ORDER.includes(t.kind)));

  const toc = document.createElement('nav');
  toc.className = 'sb-toc';
  const body = document.createElement('div');
  body.className = 'sb-body';
  root.append(toc, body);

  // ── 过滤条：只按 kind 过滤。再多一档就开始像后台系统了 ──────────────────
  const filter = document.createElement('div');
  filter.className = 'sb-filter';
  const counts = new Map<string, number>();
  for (const t of ordered) counts.set(t.kind, (counts.get(t.kind) ?? 0) + 1);

  const summary = document.createElement('div');
  summary.className = 'sb-data';
  filter.appendChild(summary);
  const paintSummary = () => {
    const k = Object.values(curation).filter((c) => c?.verdict === 'keep').length;
    const r = Object.values(curation).filter((c) => c?.verdict === 'reject').length;
    summary.textContent =
      `${ordered.length} 条目 · ${parts.length} 件 · keep ${k} · reject ${r} · 未评 ${parts.length - k - r}`;
  };
  paintSummary();

  let activeKind: string | null = null;
  const kindButtons: HTMLButtonElement[] = [];
  for (const kind of [null, ...KIND_ORDER] as (string | null)[]) {
    if (kind !== null && !counts.get(kind)) continue;
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = kind === null ? `全部 ${ordered.length}` : `${KIND_LABEL[kind] ?? kind} ${counts.get(kind)}`;
    b.classList.toggle('is-on', kind === activeKind);
    b.addEventListener('click', () => {
      activeKind = kind;
      for (const other of kindButtons) other.classList.toggle('is-on', other === b);
      applyFilter();
    });
    kindButtons.push(b);
    filter.appendChild(b);
  }
  body.appendChild(filter);

  const entryEls = new Map<string, HTMLElement>();
  const tocEntryEls = new Map<string, HTMLElement>();

  function applyFilter(): void {
    for (const t of ordered) {
      const hidden = activeKind !== null && t.kind !== activeKind;
      entryEls.get(t.id)?.toggleAttribute('hidden', hidden);
      const tocEl = tocEntryEls.get(t.id);
      if (tocEl) tocEl.hidden = hidden;
    }
  }

  // ── 目录 + 档案，一趟建完 ─────────────────────────────────────────────
  let currentKind: string | null = null;
  for (const theme of ordered) {
    if (theme.kind !== currentKind) {
      currentKind = theme.kind;
      const g = document.createElement('div');
      g.className = 'sb-label sb-toc__group';
      g.textContent = KIND_LABEL[currentKind] ?? currentKind;
      toc.appendChild(g);
    }
    const mine = (byFamily.get(theme.id) ?? []).slice()
      .sort((a, b) => slotRank(a.slot) - slotRank(b.slot) || a.id.localeCompare(b.id));

    toc.appendChild(buildTocEntry(theme, mine));
    body.appendChild(buildEntry(theme, mine, observer));
  }

  // 目录跟着滚动走。IntersectionObserver 比 scroll 事件省，而且它本来就在手边
  const spy = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const id = (e.target as HTMLElement).dataset.theme;
      for (const [tid, el] of tocEntryEls) {
        el.classList.toggle('is-open', tid === id);
        el.querySelector('a')?.classList.toggle('is-current', tid === id);
      }
    }
  }, { rootMargin: '-10% 0px -75% 0px' });
  for (const el of entryEls.values()) spy.observe(el);

  head.setState(canCurate
    ? (thumbsUseGl() ? R.curatable : R.curatableNoGl)
    : (thumbsUseGl() ? R.readOnly : R.readOnlyNoGl));

  // ── 目录条目 ────────────────────────────────────────────────────────────
  function buildTocEntry(theme: ThemeDef, mine: PartMeta[]): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'sb-toc__entry';
    const a = document.createElement('a');
    a.href = `#${themeAnchor(theme.id)}`;
    const label = document.createElement('span');
    label.textContent = theme.name === theme.id ? theme.id : `${theme.name} ${theme.nameEn}`;
    const n = document.createElement('span');
    n.textContent = String(mine.length);
    a.append(label, n);
    wrap.appendChild(a);

    const slots = document.createElement('div');
    slots.className = 'sb-toc__slots';
    for (const slot of slotsOf(mine)) {
      const sa = document.createElement('a');
      sa.href = `#s-${cssId(theme.id)}-${slot}`;
      const sl = document.createElement('span');
      sl.textContent = slot;
      const sn = document.createElement('span');
      sn.textContent = String(mine.filter((m) => m.slot === slot).length);
      sa.append(sl, sn);
      slots.appendChild(sa);
    }
    wrap.appendChild(slots);
    tocEntryEls.set(theme.id, wrap);
    return wrap;
  }

  // ── 档案条目 ────────────────────────────────────────────────────────────
  function buildEntry(theme: ThemeDef, mine: PartMeta[], obs: IntersectionObserver): HTMLElement {
    const section = document.createElement('section');
    section.className = 'sb-entry';
    section.id = themeAnchor(theme.id);
    section.dataset.theme = theme.id;
    entryEls.set(theme.id, section);

    const headRow = document.createElement('div');
    headRow.className = 'sb-entry__head no-anchor';   // 图到了再改回来
    section.appendChild(headRow);

    const figure = document.createElement('div');
    const info = document.createElement('div');
    headRow.appendChild(info);

    // anchor 图：先不挂，加载成功了才挂上去 —— 破图一次都不会出现
    if (theme.source !== 'procedural') {
      void loadImage(`${REFS_BASE}/${theme.id}/_anchor.png`).then((img) => {
        if (!img) return;
        img.className = 'sb-anchor';
        img.alt = `${theme.name} anchor`;
        figure.appendChild(img);
        headRow.prepend(figure);
        headRow.classList.remove('no-anchor');
      });
    }

    const h2 = document.createElement('h2');
    h2.className = 'sb-entry__name';
    h2.textContent = theme.name;
    if (theme.nameEn && theme.nameEn !== theme.name) {
      const en = document.createElement('span');
      en.className = 'sb-entry__en';
      en.textContent = theme.nameEn;
      h2.appendChild(en);
    }
    info.appendChild(h2);

    if (theme.tagline) {
      const tag = document.createElement('p');
      tag.className = 'sb-entry__tagline';
      tag.textContent = theme.tagline;
      info.appendChild(tag);
    }

    // 取材行走 `setBi`，不手搭 DOM：汉字那 0.045em 的左边距补偿由它按**内容**打，
    // 手搭一遍就会漏掉（/passport 上刚发现过同一个 bug）。
    const machine = machineLine(theme);
    if (machine) {
      const line = document.createElement('p');
      line.className = 'sb-entry__machine';
      setBi(line, machine);
      info.appendChild(line);
    }

    const tension = tensionOf(theme);
    if (tension) {
      const t = document.createElement('p');
      t.className = 'sb-entry__tension';
      t.textContent = tension;
      info.appendChild(t);
    }

    const kept = mine.filter((m) => curation[m.id]?.verdict === 'keep').length;
    const rejected = mine.filter((m) => curation[m.id]?.verdict === 'reject').length;

    const facts: Array<[string, string]> = [
      ['id', theme.id],
      ['kind / coverage', `${theme.kind} · ${theme.coverage}${theme.base ? ` · base ${theme.base}` : ''}`],
      ['形态空间', `humanLike ${theme.axes.humanLike.toFixed(2)} · lifeLike ${theme.axes.lifeLike.toFixed(2)}`],
      ['身体方案', bodyPlanOf(theme)],
      ['件数', `${mine.length}${mine.length ? ` · keep ${kept} · reject ${rejected}` : ''}`],
    ];
    if (theme.palette.length) facts.push(['palette', theme.palette.join(' · ')]);
    const dl = document.createElement('dl');
    dl.className = 'sb-facts';
    for (const [k, v] of facts) {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      dl.append(dt, dd);
    }
    info.appendChild(dl);

    if (!mine.length) {
      const none = document.createElement('p');
      none.className = 'sb-empty';
      none.textContent = theme.source === 'procedural'
        ? '程序化条目：它不用部件库，身体在运行时按规则长出来。'
        : '这个条目还没有部件 —— 它是一个空位，说明这个位置想要什么样的存在。';
      section.appendChild(none);
      return section;
    }

    for (const slot of slotsOf(mine)) {
      const group = mine.filter((m) => m.slot === slot);
      const sec = document.createElement('div');
      sec.className = 'sb-slot';
      sec.id = `s-${cssId(theme.id)}-${slot}`;

      const sh = document.createElement('div');
      sh.className = 'sb-slot__head';
      const name = document.createElement('span');
      name.className = 'sb-label';
      name.textContent = slot;
      const n = document.createElement('span');
      n.className = 'sb-data sb-num';
      n.textContent = `${group.length} 件`;
      sh.append(name, n);
      sec.appendChild(sh);

      const ul = document.createElement('ul');
      ul.className = 'sb-parts';
      for (const meta of group) ul.appendChild(buildPart(meta, obs));
      sec.appendChild(ul);
      section.appendChild(sec);
    }
    return section;
  }

  // ── 一件部件 ────────────────────────────────────────────────────────────
  function buildPart(meta: PartMeta, obs: IntersectionObserver): HTMLElement {
    const li = document.createElement('li');
    li.className = 'sb-part';
    li.dataset.verdict = curation[meta.id]?.verdict ?? '';

    const thumb = document.createElement('div');
    thumb.className = 'sb-part__thumb';
    thumb.appendChild(createThumb(meta, obs, PARTS_BASE));

    const info = document.createElement('div');
    info.className = 'sb-part__meta';
    const id = document.createElement('span');
    id.className = 'sb-part__id';
    id.textContent = meta.id;
    const nums = document.createElement('span');
    nums.className = 'sb-part__num sb-num';
    nums.textContent = `t${meta.tier} · girth ${meta.localGirth.toFixed(2)} · ${meta.triCount} tri`;
    if (isOdd(meta)) nums.classList.add('is-odd');
    info.append(id, nums);

    const note = curation[meta.id]?.note;
    if (note) {
      const n = document.createElement('span');
      n.className = 'sb-part__note';
      n.textContent = note;
      info.appendChild(n);
    }

    li.append(thumb, info);

    // 点一下循环 未评 → keep → reject → 未评（docs/14 §5：好素材必须显式保留）。
    // 只有中间件在的时候才挂这个监听 —— 只读时它就是一段静态文字，
    // 点了什么都不会发生，也不会有一个失败的请求飞出去。
    if (canCurate) {
      li.addEventListener('click', () => { void cycleVerdict(meta, li); });
    }
    return li;
  }

  async function cycleVerdict(meta: PartMeta, li: HTMLElement): Promise<void> {
    const cur = curation[meta.id]?.verdict ?? null;
    const next: Verdict | null = cur === null ? 'keep' : cur === 'keep' ? 'reject' : null;
    const before = curation[meta.id];
    if (next === null) delete curation[meta.id]; else curation[meta.id] = { verdict: next, note: before?.note };
    li.dataset.verdict = next ?? '';
    paintSummary();

    let ok = false;
    try {
      const r = await fetch('/__curate', { method: 'POST', body: JSON.stringify({ id: meta.id, verdict: next }) });
      ok = r.ok;
    } catch { /* 下面统一处理 */ }
    if (ok) return;

    // 写回没成功：把本地状态**放回去**，并且从此转成只读。
    // 显示一个和磁盘不一致的绿框，比不让评级糟得多 —— 那会让人以为自己评过了。
    if (before) curation[meta.id] = before; else delete curation[meta.id];
    li.dataset.verdict = before?.verdict ?? '';
    paintSummary();
    root.classList.remove('can-curate');
    head.setState(R.writeFailed);
    console.warn('[archive] /__curate 写回失败，转为只读');
  }
}

// ── 小工具 ──────────────────────────────────────────────────────────────────

// 这三个要写成函数声明而不是 const 箭头函数：`buildArchive()` 在模块顶层就被调用了，
// 那时文件尾部的 const 还在 TDZ 里 —— 写成箭头函数这一页会当场白屏。
function slotRank(slot: string): number {
  const i = SLOT_ORDER.indexOf(slot);
  return i < 0 ? SLOT_ORDER.length : i;
}

function slotsOf(metas: PartMeta[]): string[] {
  return [...new Set(metas.map((m) => m.slot))].sort((a, b) => slotRank(a) - slotRank(b));
}

/**
 * id 里有点（char.dumpling），直接当 CSS 选择器/锚点会炸。
 *
 * 「条目」那一个锚点的规则**搬到了 `ui/species.ts` 的 `themeAnchor()`** ——
 * `/about` 的编号对照表每一个号都链到 `/parts#t-<id>`，两边各写一份 replace
 * 的话，字符集只要有一天不一致，那些链接就会静静落空（见那个函数的注释）。
 * 槽位那一层（`s-<id>-<slot>`）只在这一页内部用，仍然留在这里。
 */
function cssId(id: string): string {
  return id.replace(/[^a-z0-9_-]/gi, '_');
}
