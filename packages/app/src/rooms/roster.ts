/**
 * 侧室 `/roster` —— 物种接触表。
 *
 * ## 它对一个没造过这件作品的人来说是关于什么的
 *
 * 选择页上观众一次只看得见环上的那一张卡；这个房间把**全部**摆在一版上。
 * 摄影的接触表就是这个东西：一整卷底片印在一张纸上，为的是让人**比较**，
 * 不是让人欣赏其中一张。所以这里等距、等大、一条基线，格子之间只有间距 ——
 * 没有边框、没有底、没有圆角（docs/26 §F）。
 *
 * ## 为什么不是把选择页改成"全部展开"
 *
 * 选择页那一屏有环、有糖浆、有举手滚动、有三十秒自动选择 —— 那是一次**选择**，
 * 它的每一样东西都在推着人往下走。接触表要的正好相反：停下来，横着看。
 * 两件事共用一张卡片图就够了，共用一整页会让两边都变形。
 *
 * ## 共用的是哪三样
 *
 *  1. **卡片图**：`choose/cards.ts` 的 `buildCard()` —— 和环上那张**逐像素相同**，
 *     包括没有 anchor 图时的「场」与「空盘子」。破图一张都不会出现。
 *  2. **编号与顺序**：`ui/species.ts` 的 `orderThemes` / `speciesNumber` ——
 *     和 `/about` 的散点、海报是同一套。对不上的话那些数字就都白标了。
 *  3. **身体方案的记号**：`ui/marks.ts`（见 `rooms/marks.ts` 的文件头里那条
 *     并行改动说明）。
 *
 * 随机数由 `mulberry32(hashSeed(id))` 注入，所以同一个物种的「场」卡片
 * 每次刷新都一模一样（AGENTS.md：所有随机都经过注入的 `Rng`）。
 */
import type { PartLibraryIndex, ThemeDef } from '../../../core/src/types.ts';
import { hashSeed, mulberry32 } from '../../../core/src/rng.ts';
import { buildCard, loadImage } from '../choose/cards.ts';
import { COPY, setBi } from '../ui/i18n.ts';
import { markShape, type MarkPart } from '../ui/marks.ts';
import { PLAN_LABEL, orderThemes, planKind, speciesNumber } from '../ui/species.ts';
import { mountRoom } from './room.ts';

const SVG = 'http://www.w3.org/2000/svg';
const BOX = 18;

function markNode(kind: string): SVGSVGElement {
  const root = document.createElementNS(SVG, 'svg');
  root.setAttribute('class', 'sb-plan-mark');
  root.setAttribute('width', String(BOX));
  root.setAttribute('height', String(BOX));
  root.setAttribute('viewBox', `${-BOX / 2} ${-BOX / 2} ${BOX} ${BOX}`);
  root.setAttribute('aria-hidden', 'true');
  for (const part of markShape(kind) as readonly MarkPart[]) {
    const node = document.createElementNS(SVG, part.tag);
    node.setAttribute('class', part.cls);
    for (const [k, v] of Object.entries(part.attrs)) node.setAttribute(k, String(v));
    root.append(node);
  }
  return root;
}

async function loadIndex(): Promise<PartLibraryIndex | null> {
  try {
    const res = await fetch('/parts/parts.json');
    if (!res.ok) return null;
    if ((res.headers.get('content-type') ?? '').includes('text/html')) return null;
    const json = (await res.json()) as PartLibraryIndex;
    return Array.isArray(json?.themes) && json.themes.length ? json : null;
  } catch { return null; }
}

const room = mountRoom({ title: COPY.rooms.roster.title, lede: COPY.rooms.roster.lede });

const index = await loadIndex();

if (!index) {
  const note = document.createElement('p');
  note.className = 'room-empty';
  setBi(note, COPY.rooms.empty);
  room.body.append(note);
} else {
  const themes = orderThemes(index.themes);
  const sheet = document.createElement('ul');
  sheet.className = 'room-sheet';
  room.body.append(sheet);

  themes.forEach((theme, i) => sheet.append(plate(theme, i)));
}

function plate(theme: ThemeDef, i: number): HTMLElement {
  const li = document.createElement('li');
  li.className = 'room-plate';

  // 格子先占位、图后到。**先挂一个空的 canvas 而不是等图**：
  // 二十多张图串行等下来，整版会一次性跳出来；一格一格落下来读作"正在印"。
  const slot = document.createElement('div');
  li.append(slot);

  void loadImage(`/refs/${theme.id}/_anchor.png`).then((img) => {
    const rng = mulberry32(hashSeed(theme.id));
    slot.append(buildCard(theme, img, rng).canvas);
  });

  const line = document.createElement('div');
  line.className = 'room-plate__line';

  const n = document.createElement('span');
  n.className = 'room-plate__n';
  n.textContent = speciesNumber(i);

  const name = document.createElement('span');
  name.className = 'room-plate__name';
  setBi(name, { zh: theme.name, en: theme.nameEn });

  const plan = document.createElement('span');
  plan.className = 'room-plate__plan';
  const kind = planKind(theme);
  const label = document.createElement('span');
  label.className = 'sb-bi-inline';
  const text = PLAN_LABEL[kind];
  if (text) setBi(label, text); else label.textContent = kind;
  plan.append(markNode(kind), label);

  line.append(n, name, plan);
  li.append(line);
  return li;
}
