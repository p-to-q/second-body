/**
 * 侧室 `/marks` —— 九枚记号。
 *
 * ## 它对一个没造过这件作品的人来说是关于什么的
 *
 * 「物种靠整体剪影辨识，不靠涂装」（docs/26 §F）是这件作品的一条硬主张。
 * 这个房间是那句话的**字母表**：九种身体方案，九个形状，两两不同。
 * 一枚记号旁边写着它是哪一具身体、以及现在有哪几个物种走这个方案 ——
 * 后面那半是这一页唯一"活"的部分，它从 `parts.json` 现读，
 * 所以一个方案还没有任何物种在用的时候，这里会如实说出来，而不是留白。
 *
 * ## 记号从哪来：`ui/marks.ts`，一份，不画第二遍
 *
 * ⚠️ `src/ui/marks.ts`（九枚记号的数据表）是**另一条线的产物**，作品负责人
 * 已经逐枚看过。写这一页的时候它还没有合进 `main`，所以这个文件是
 * 从 `worktree-agent-a0d21ec94b6bf12ad` 逐字取来的同一份 ——
 * **不是照着重画的一份**。两条线合流时它是同一个文件、同样的内容，干净合并。
 *
 * 同一时刻 `/about` 的散点与图例仍然走 `about.ts` 里那个四分支的老 `switch`
 * （六个方案共用一个空心圆）。那是**那条线的活**，不是这一页的 ——
 * 这里不去替它改。于是在它落地之前，这个房间和 `/about` 的图例会不一致：
 * 不一致的那一侧是 `/about`，这一页显示的是真的。
 *
 * 这一页只做一件 `ui/marks.ts` 刻意不做的事：**把那张数据表画成 DOM**。
 * 那个模块不碰 DOM、不 import CSS，是为了能在 node 里被测（见它的文件头）；
 * 画笔因此留在这里。
 */
import { BODY_PLANS } from '../../../core/src/bodyplan.ts';
import type { PartLibraryIndex } from '../../../core/src/types.ts';
import { markShape, type MarkPart } from '../ui/marks.ts';
import { COPY, setBi } from '../ui/i18n.ts';
import { PLAN_LABEL, orderThemes, planKind, speciesNumber } from '../ui/species.ts';
import { mountRoom } from './room.ts';

const SVG = 'http://www.w3.org/2000/svg';

/** 记号的画幅。`ui/marks.ts` 的坐标以中心为原点、尺度按散点图上 ~10px 那一档定 */
const BOX = 22;

/**
 * 一枚独立的记号。
 *
 * `aria-hidden`：记号右边永远写着这个方案的名字（`COPY.plans`），
 * 读屏把形状再念一遍只会把同一件事说两次。
 */
function markNode(kind: string): SVGSVGElement {
  const root = document.createElementNS(SVG, 'svg');
  root.setAttribute('class', 'sb-plan-mark');
  root.setAttribute('width', String(BOX));
  root.setAttribute('height', String(BOX));
  root.setAttribute('viewBox', `${-BOX / 2} ${-BOX / 2} ${BOX} ${BOX}`);
  root.setAttribute('aria-hidden', 'true');
  for (const part of markShape(kind)) root.append(partNode(part));
  return root;
}

function partNode(part: MarkPart): SVGElement {
  const node = document.createElementNS(SVG, part.tag);
  node.setAttribute('class', part.cls);
  for (const [k, v] of Object.entries(part.attrs)) node.setAttribute(k, String(v));
  return node;
}

async function loadIndex(): Promise<PartLibraryIndex | null> {
  try {
    const res = await fetch('/parts/parts.json');
    if (!res.ok) return null;
    // dev server 与静态托管都会把不存在的路径回成 index.html，别把一页 HTML 当 JSON 解析
    if ((res.headers.get('content-type') ?? '').includes('text/html')) return null;
    const json = (await res.json()) as PartLibraryIndex;
    return Array.isArray(json?.themes) ? json : null;
  } catch { return null; }
}

const room = mountRoom({ title: COPY.rooms.marks.title, lede: COPY.rooms.marks.lede });

const index = await loadIndex();
// 编号和 `/about`、海报、接触表是同一套（`ui/species.ts` 的 orderThemes）。
// 对不上的话这几页上的数字就都白标了。
const themes = index ? orderThemes(index.themes) : [];

const list = document.createElement('ul');
list.className = 'room-specimens';

BODY_PLANS.forEach((plan) => {
  const row = document.createElement('li');
  row.className = 'room-specimen';

  const id = document.createElement('span');
  id.className = 'room-specimen__id';
  id.textContent = plan;

  const mark = document.createElement('span');
  mark.className = 'room-specimen__mark';
  mark.append(markNode(plan));

  const text = document.createElement('div');
  const name = document.createElement('div');
  name.className = 'room-specimen__name';
  setBi(name, PLAN_LABEL[plan]);
  text.append(name);

  // 走这个方案的物种。**没有就说没有** —— 一行空白读起来像渲染失败
  const mine = themes.filter((t) => planKind(t) === plan);
  const who = document.createElement('p');
  who.className = 'room-specimen__who';
  if (!index) {
    who.hidden = true;
  } else if (!mine.length) {
    setBi(who, COPY.rooms.marks.usedByNone);
  } else {
    const label = document.createElement('span');
    label.className = 'sb-bi-inline';
    setBi(label, COPY.rooms.marks.usedBy);
    who.append(label, document.createTextNode('　'));
    mine.forEach((t, i) => {
      if (i) who.append(document.createTextNode(' · '));
      const n = document.createElement('span');
      n.className = 'sb-num';
      n.textContent = speciesNumber(themes.indexOf(t));
      who.append(n, document.createTextNode(` ${t.name}`));
    });
  }
  text.append(who);

  row.append(id, mark, text);
  list.append(row);
});

room.body.append(list);

if (!index) {
  const note = document.createElement('p');
  note.className = 'room-empty';
  setBi(note, COPY.rooms.empty);
  room.body.append(note);
}
