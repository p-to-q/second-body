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
 * 九枚记号的数据表是**另一条线的产物**（`/about` 的图例那条），
 * 作品负责人已经逐枚看过。这一页照着 `BODY_PLANS` 逐条渲，形状一律查那张表 ——
 * 三处画同一套记号（散点、图例、这一页）就必须只有一处画得出它们，
 * 否则散点上的「四足」和标本行里的「四足」迟早不是同一个形状，
 * 而这件事**没有任何仪表会报**：两边各自看都对，只有把两页并排放才看得出来。
 *
 * 画成 DOM 的那一步在 `rooms/room.ts` 的 `markNode()`（`/roster` 共用）：
 * `ui/marks.ts` 刻意不碰 DOM、不 import CSS，是为了能在 node 里被测
 * （见它的文件头），所以画笔归用它的人。
 */
import { BODY_PLANS } from '../../../core/src/bodyplan.ts';
import type { PartLibraryIndex } from '../../../core/src/types.ts';
import { COPY, setBi } from '../ui/i18n.ts';
import { PLAN_LABEL, orderThemes, planKind, speciesNumber } from '../ui/species.ts';
import { markNode, mountRoom } from './room.ts';

/**
 * 屏幕上一枚记号多大。散点图上它是一个数据点，图例上它是一枚小样；
 * 这一页上它是**标本本身** —— 这九笔就是这个房间的全部内容，
 * 按数据点那一档印出来，观众得凑到屏幕前才分得清「放射」和「点场」。
 */
const SHOWN = 44;

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
  mark.append(markNode(plan, SHOWN));

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
