/**
 * 《共生护照》—— 人机共创的四条过程性证明。
 *
 * ## 为什么做成签证页
 *
 * 提交模板是两栏表单：「AI 输出结果 / 拒绝原因」「AI 输出结果 / 保留原因」。
 * 照着填会得到一张表格。但"护照"这个词本身给了更准的读法 ——
 * **护照是通关记录：谁被拒绝入境，谁被放行。**
 *
 *   一、人类的判断 = 一次**拒入**。AI 的产物申请进入作品，被驳回。
 *   二、AI 意外结果 = 一次**准入**。没人申请，它自己来了，被允许留下。
 *   三、**代理驳回代理** = 又一次拒入（2026-09-13 加）。
 *   四、**一个还没有人申请的位置** = 提前发出的拒入（2026-09-14 加）。
 *
 * 于是这一页的形式和内容是同一件事，而不是给内容套一个好看的壳。
 *
 * 第三枚章为什么值得单开一枚，而不是并进第一枚：前两枚里做判断的分别是
 * **人**和**流水线**，它们合起来说的仍然是"人审 AI"。第三枚里签字的是
 * 另一个代理 —— 它把一个物种和它自己的说明书对了一遍，然后驳回的不是一件产物，
 * 是"再给它配一套更好的零件"这个方案。`docs/26 §B` 说这份人机协作档案是
 * 这个项目最被低估的资产；那一栏成立与否，正取决于这类事有没有被展示出来。
 *
 * ## 第四枚章：为什么一个**空位**属于这一页
 *
 * `guest.founder` 是花名册上一个故意留的空位（`docs/14 §2`）。它已经**缺席**了 ——
 * `buildIndex()` 按 `clearance` 把它挡在 `parts.json` 之外，轮播和 `makeGenome`
 * 因此都看不到它。但 `docs/39` 要的是它「应当**看得见地**缺席」，
 * 而在这一枚章之前，观众在任何一个页面上都遇不到那个缺口：它只是不在。
 *
 * 为什么是这一页，不是选择页、也不是 `/about` 的散点图：
 *
 *   - 轮播上的一张卡是一句承诺 ——「点下去你会变成它」（`choose/wearable.ts`）。
 *     放一张点不动的卡进去，说的是"你没有权限"，而不是"我们没有去拿"，
 *     意思正好反过来。那条承诺刚在 `docs/39 §2.1` 被修好，不该在这里重新破。
 *   - 散点图上多一个标记 = 把它画**进**谱系里。一个被画出来的空位就不再是空位。
 *   - 这一页收的是**裁定**，而一个空位正是一次裁定。而且是四枚里唯一一枚
 *     仍然在执行的：前三枚记的是发生过一次的事，这一枚每次跑 `factory:index`
 *     都重新盖一遍（那条 `clearance:` 日志就是盖章的声音）。
 *
 * `docs/26 §G` 的那三处诚实（`docs/25`、立场海报、`/about` 的状态标记）**不包括这里，
 * 这一枚也不是第四处**。§G 管的是"我们还差什么"那一类页尾自白；这一枚记的是
 * 一个**做过并且还在执行**的决定，和它旁边三枚同一个语气、同一套字段、同一种证据。
 * 没有道德句，没有"但是我们还没有"。
 *
 * ## 纪律
 *
 * **每一条都必须是真的，且能指到 commit 或文件。** 这一页的全部力量来自它是真的。
 * 编一条就全毁了 —— 而且评审要的正是过程性证明，不是作品说明。
 */
import '../ui/type.css';
import '../ui/pages.css';
import '../ui/editorial.css';
import './passport.css';
import { COPY, bi, type BiText, setBi } from '../ui/i18n.ts';
import { markNode } from '../ui/mark.ts';
import { mountNav } from '../ui/nav.ts';
import { heroMeta } from '../ui/hero.ts';

interface Stamp {
  /** 准入 / 拒入 */
  verdict: 'admitted' | 'refused';
  no: string;
  date: string;
  /** 裁定人 —— 谁做的这个决定 */
  officer: BiText;
  /** 申请进入作品的那个产物 */
  subject: BiText;
  /** 它当时的样子，用数字说话 */
  facts: { k: BiText; v: string }[];
  /** 裁定依据。人类的原话优先于转述 */
  reason: BiText;
  /** 引用的原话（可选）—— 原话比转述有力 */
  quote?: BiText;
  /** 后果：这次裁定改变了什么 */
  consequence: BiText;
  /** 证据：commit / 文件 */
  evidence: string[];
  /**
   * 一条**故意留空**的字段：给一个标签，正文是一条空线（`.pp-blank`）。
   *
   * 只有第四枚章用它。为什么是一条空线而不是一句"未取得授权"：
   * 一句话是**我们**在替那个位置说话，而这一页正在说的就是我们不能替他说话。
   * 一条签字线是表格自己的语汇 —— 它不说话，它等一个人来签，
   * 而那个人一直没有来。留白在这里是内容，不是没内容（`docs/26 §F` 末条）。
   *
   * 它也是这一枚章和另外三枚**唯一**的外形差别。没有灰掉、没有锁、
   * 没有第二种语义色（§F：全站只有"裁定"配用颜色，拒入就是警示色）——
   * 灰掉的东西读作"你没有权限"，而这里的意思是"我们没有去拿"。
   */
  blank?: BiText;
}

const STAMPS: Stamp[] = [
  {
    verdict: 'refused',
    no: 'I',
    date: '2026-09-12',
    officer: bi('人类', 'The human'),
    subject: bi(
      '一整批素材：23 个物种、100 件部件，全部通过契约检查',
      'A full batch: 23 species, 100 parts, every contract check green',
    ),
    facts: [
      { k: bi('部件', 'Parts'), v: '100' },
      { k: bi('契约错误', 'Contract errors'), v: '0' },
      { k: bi('测试', 'Tests'), v: 'all passing' },
      { k: bi('消耗', 'Credits spent'), v: '50' },
    ],
    quote: bi(
      '现在做的每一款机器人都有些雷同，而且形体上没有真正跟其他不一样的。在我们骨架下面 unit 起来的都是人形的，没有新意。',
      'Every robot looks more or less the same, and none of them is genuinely different in form. Everything assembled on our skeleton is humanoid. There is no idea in it.',
    ),
    reason: bi(
      '工程指标全绿，作品不成立。被驳回的不是某一件素材，是整批产物背后的那个前提 —— 只有一种表达方式，于是每个物种都只是同一具人体换了一层皮。',
      'Every engineering metric was green and the work still did not hold. What was refused was not any single asset but the premise behind all of them: there was only one mode of expression, so every species was the same human body in a different skin.',
    ),
    consequence: bi(
      '没有重新生成素材 —— 重做了架构。身体方案成为可插拔的：人形 / 四足 / 团块 / 矮壮，加上每个物种自己的比例。',
      'No assets were regenerated. The architecture was rebuilt instead: body plans became pluggable — humanoid, quadruped, mass, stub — each species with its own proportions.',
    ),
    evidence: ['docs/18-BODY-PLANS.md', '19880ae feat(rig): A 档身体方案', '4860281 feat(rig): 参数化身体方案'],
  },
  {
    verdict: 'admitted',
    no: 'II',
    date: '2026-09-12',
    officer: bi('流水线', 'The pipeline'),
    subject: bi(
      '两次没人要的产物：生成模型无视了面数上限，交回完全未焊接的网格',
      'Two outputs nobody asked for: the model ignored the polygon cap and returned entirely unwelded meshes',
    ),
    facts: [
      { k: bi('请求面数', 'Requested'), v: '3,000' },
      { k: bi('实得', 'Received'), v: '1,515,338 / 439,286' },
      { k: bi('顶点焊接', 'Welded'), v: '0' },
      { k: bi('文件', 'File size'), v: '66 MB' },
    ],
    reason: bi(
      '按规格这是故障。但减面工具对未焊接网格无能为力这件事，逼出了一个没人计划过的能力：按空间网格容差焊接，再逐级放宽误差减面。1,515,338 面收到 4,884 面，文件从 66 MB 到 148 KB。',
      'By spec this was a failure. But the fact that the simplifier cannot move an unwelded mesh forced a capability nobody had planned: tolerance welding on a spatial grid, then simplification with a progressively widened error budget. 1,515,338 triangles down to 4,884; 66 MB down to 148 KB.',
    ),
    consequence: bi(
      '被留下的不是那两件东西 —— 它们后来随一次重构被归档了。留下的是那个能力：它现在是流水线的必需品，不是优化项。意外没有留下产物，留下了器官。',
      'What was kept is not those two objects — they were archived in a later restructure. What was kept is the capability: it is now a requirement of the pipeline, not an optimisation. The accident left no artefact. It left an organ.',
    ),
    evidence: ['docs/07-HYPER3D-API.md §3.3', 'packages/factory/src/normalize.ts weldTolerant()', 'docs/09 U11'],
  },
  {
    verdict: 'refused',
    no: 'III',
    date: '2026-09-13',
    officer: bi('自查那条线（另一个代理）', 'The audit — another agent'),
    subject: bi(
      '花名册上一个叫「场」的物种，和它自己的那一行说明',
      'A species on the roster called Field, and the single line that describes it',
    ),
    facts: [
      { k: bi('自有部件', 'Parts of its own'), v: '0' },
      { k: bi('借来的槽位', 'Slots borrowed'), v: '10' },
      { k: bi('逐条复核的物种', 'Species re-checked'), v: '29' },
      { k: bi('现在的点数', 'Points now'), v: '1,400' },
    ],
    quote: bi(
      '身体消失，只剩运动。',
      'The body disappears; only the movement is left.',
    ),
    reason: bi(
      '它没有自己的身体方案，于是走默认的刚体装配，向别的物种借了一整套四肢 —— 画面上它是一具机器人，而机器人正是那句话说它已经不是的东西。坏的不是素材，是一个条目和它自己的说明书矛盾，而且矛盾了很久没有人看。',
      'It had no body plan of its own, so it fell through to the default rigid assembly and wore a full set of limbs borrowed from other species — on screen, a robot, which is precisely the thing that line says it is no longer. Nothing was wrong with the assets: an entry contradicted its own description, and had done so for a long time with nobody looking.',
    ),
    consequence: bi(
      '被驳回的是「再给它配一套更好的零件」—— 有零件这件事本身就是那个矛盾。它改成 1400 个点跟着活骨架走，每个点停在过去自己的那一刻，一件槽位件都不实例化。随后其余 28 条也被逐条渲染复核了一遍，因为在此之前没有人看过它们。',
      'What was refused was “give it a better set of parts” — having parts at all was the contradiction. It became 1,400 points locked to the live skeleton, each sitting at its own moment in the past, instantiating no slot parts whatsoever. The other 28 entries were then rendered and checked one by one, because until then nobody had looked at them either.',
    ),
    evidence: ['docs/39-SPECIES-AUDIT.md', 'b6e6ee6 feat(render): 「场」不再借别人的四肢', 'packages/app/src/creature/swarm.ts'],
  },
  {
    verdict: 'refused',
    no: 'IV',
    // 空位本身比这个日期早得多（花名册上一直写着）。这里记的是它**拿到执行者**
    // 的那一天 —— 在那之前它只是一句话，之后它是一道每次构建都跑的门。
    date: '2026-09-13',
    officer: bi('clearance 门 —— 每次构建都跑一遍', 'The clearance gate — it runs on every build'),
    subject: bi(
      '花名册上一个没有身体的位置：「创始人」',
      'A position on the roster with no body of its own: “The Founder”',
    ),
    facts: [
      { k: bi('自有部件', 'Parts of its own'), v: '0' },
      { k: bi('参考图', 'Reference images'), v: '0' },
      { k: bi('已消耗', 'Credits spent'), v: '0' },
      { k: bi('生成它要花', 'What generating it would cost'), v: '3' },
    ],
    // 条目自己的那一行。它已经把这件事说完了，再写一句只会更弱 ——
    // 第三枚章引的也是条目自己的 tagline，同一个做法。
    quote: bi(
      '（空位）把一个真实的人穿在身上',
      '(vacant) Wear a real person',
    ),
    // 第二句划的是 `machine.geometry` 那条线（roster.ts 的三档）：
    // 「真机有件」和「真机没有可再分发的件」都是**等一份文件**，
    // 哪天厂商放出来就升一档。这一条等的不是文件。两者混成一句"缺素材"，
    // 这枚章立刻变成一条待办事项 —— 而它不是待办事项。
    reason: bi(
      '机制是通的：填一段造型、放一张参考图，它就能生成、能选、能穿。差的不是预算也不是办法，是那个人的同意。花名册记「缺一具身体」只有两种记法，两种都在等一份文件；这一条等的是一个人，而只有那个人自己能把这一格填上。',
      'The mechanism works: write a look, add one reference image, and it can be generated, chosen and worn. What is missing is neither budget nor means. It is that person’s consent. The roster has two ways of recording a missing body and both of them wait on a file; this one waits on a person, and only they can fill it in.',
    ),
    consequence: bi(
      '空位留在花名册上，门把它挡在公开构建之外：它不在 parts.json 的条目表里，不在轮播里，自动挑身体也永远挑不到它。点名要它的那条链接被送到这一枚章上 —— 这个位置在场上唯一的样子，就是它不在场。',
      'The vacancy stays on the roster and the gate keeps it out of the public build: not in the entry table of parts.json, not in the carousel, never picked when a body is chosen for you. A link that asks for it by name lands on this stamp — the only form this position takes on stage is not being there.',
    ),
    evidence: [
      'packages/factory/recipes/roster.ts guest.founder',
      'packages/factory/src/index-parts.ts ROSTER.filter(isPublic)',
      'packages/app/src/shell/vacancy.ts',
      'packages/app/test/vacancy.test.ts',
      'docs/14-SPEC-roster.md §2',
    ],
    blank: bi('本人授权签字', 'Consent, signed'),
  },
];

// ─────────────────────────── 渲染 ───────────────────────────

const el = (tag: string, cls?: string, text?: string): HTMLElement => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

/**
 * 双语块。**一律走 `setBi`，不自己拼那两个 span。**
 *
 * 这里原来是手搭的：`el('span','sb-zh',t.zh)` + `el('span','sb-en',t.en)`。
 * 类名是对的，所以它看起来没问题 —— 漏掉的是 `sb-cjk`。`setBi` 现在**按字**
 * 决定补不补那 0.06em 的左边距（`i18n.ts` 的 `cjkClass`，不按槽位），
 * 而手搭的这一条从来没算过它：整页的汉字因此比它左边的线凸出去半格，
 * 而且越是大字号越明显。和选择页名牌那个自造 class 的 bug 是同一类。
 */
function biBlock(t: BiText, tag = 'div', cls = ''): HTMLElement {
  const wrap = el(tag, cls);
  setBi(wrap, t);   // setBi 自己会补上 .sb-bi 和 .sb-cjk
  return wrap;
}

/**
 * 一枚章。
 *
 * 这一页叫护照，可它之前长得像一张表格 —— "章"只是一个小号罗马数字。
 * 现在它真的是一枚章：一个粗框的方块、一串全大写的裁定、一个编号和日期，
 * 整个略微歪着。歪是关键 —— 印章是**手按上去的**，正得分毫不差的框读作 UI 控件，
 * 歪三度才读作一次盖章动作。
 *
 * 这是全站唯一一处出现"图形"而不是纯排版的地方（docs/23 §0 的禁止清单
 * 禁的是卡片、阴影、圆角、图标）。这枚章没有阴影、没有圆角、不是卡片：
 * 它是这一页的内容本身 —— 形式和内容是同一件事，不是给内容套壳。
 */
function stampMark(s: Stamp): HTMLElement {
  const mark = el('div', `pp-mark pp-mark--${s.verdict}`);
  mark.append(
    el('span', 'pp-mark__no', s.no),
    biBlock(s.verdict === 'refused' ? bi('拒入', 'REFUSED') : bi('准入', 'ADMITTED'), 'div', 'pp-mark__verdict'),
    el('span', 'pp-mark__date sb-num', s.date),
  );
  return mark;
}

function stampBlock(s: Stamp): HTMLElement {
  const sec = el('section', `sb-stamp pp-stamp sb-${s.verdict}`);
  // 每一枚章都能被单独指到。第四枚是有人点名要它的那一个：
  // `?theme=guest.founder` 会被 `shell/vacancy.ts` 送到 `#stamp-iv`。
  sec.id = `stamp-${s.no.toLowerCase()}`;

  // 章头：左边是那枚章，右边是申请人。两栏，和 .ed-section 同一套比例
  const head = el('div', 'pp-stamp__head');
  const left = el('div', 'pp-stamp__mark');
  left.append(stampMark(s));
  const right = el('div', 'pp-stamp__subject');
  right.append(
    biBlock(bi('申请人', 'Applicant'), 'div', 'sb-label'),
    biBlock(s.subject, 'div', 'pp-subject-text'),
    biBlock(s.officer, 'div', 'pp-officer sb-label'),
  );
  head.append(left, right);
  sec.append(head);

  const row = (label: BiText, body: HTMLElement): HTMLElement => {
    const r = el('div', 'pp-row');
    r.append(biBlock(label, 'div', 'sb-label'), el('div', 'pp-row__body'));
    r.lastElementChild!.append(body);
    return r;
  };

  const facts = el('dl', 'sb-facts sb-data');
  for (const f of s.facts) {
    facts.append(biBlock(f.k, 'dt', 'sb-label'), el('dd', 'sb-num', f.v));
  }
  sec.append(row(bi('当时的样子', 'On record'), facts));

  if (s.quote) {
    const q = el('blockquote', 'sb-quote');
    q.append(biBlock(s.quote));
    sec.append(row(bi('原话', 'Verbatim'), q));
  }

  sec.append(row(s.verdict === 'refused' ? bi('拒绝原因', 'Grounds for refusal')
                                         : bi('保留原因', 'Grounds for admission'), biBlock(s.reason)));
  sec.append(row(bi('后果', 'Consequence'), biBlock(s.consequence)));

  const ev = el('ul', 'sb-evidence sb-data');
  for (const e of s.evidence) ev.append(el('li', '', e));
  sec.append(row(bi('存证', 'On file'), ev));

  // 空的那一行排在**最后**：读完裁定、读完存证，最后落在一条没有人签的线上。
  // 排在中间它会读成"这一栏还没填"，排在末尾它就是这枚章说完的那句话。
  if (s.blank) sec.append(row(s.blank, el('div', 'pp-blank')));

  return sec;
}

const root = document.getElementById('passport')!;

const header = el('header', 'ed-hero');

const meta = heroMeta('/about');
header.append(meta, el('hr', 'ed-rule ed-rule--heavy'));

const titleBox = el('div', 'ed-hero__title');
const h1 = el('h1', 'sb-display ed-rise');
setBi(h1, COPY.passport.title);
h1.querySelector('.sb-zh')!.setAttribute('style', '--ed-i:0');
h1.querySelector('.sb-en')!.setAttribute('style', '--ed-i:1');
titleBox.append(h1);
header.append(titleBox, el('hr', 'ed-rule'));

const lede = el('div', 'ed-hero__lede');
const ledeCol = el('div');
ledeCol.append(
  biBlock(COPY.passport.lede, 'p', 'sb-lede'),
  // 两行都用名字本身：COPY.title 是全站唯一倒置的一对（.zh 存的是英文名），
  // 直接取 .en 会在英文行印出中文说明。
  biBlock(bi(`${COPY.passport.work.zh}：${COPY.title.zh}`,
             `${COPY.passport.work.en}: ${COPY.title.zh}`), 'p', 'pp-work sb-data'),
);
lede.append(ledeCol);
header.append(lede);
root.append(header);

for (const s of STAMPS) root.append(stampBlock(s));

const foot = el('footer', 'sb-foot');
foot.append(biBlock(COPY.passport.foot, 'p'));
root.append(el('hr', 'sb-rule'), foot);

// 这一页原本是条死路：读完之后走不回作品，也走不到别的房间
mountNav();

/**
 * 锚点要自己滚一次。
 *
 * 这一页的正文是脚本现搭的：浏览器处理 URL 里那个 fragment 的那一刻，
 * `#stamp-iv` 指的那个 `<section>` 还不存在，于是它什么都不做 ——
 * 而一条点名空位的链接（`shell/vacancy.ts` 把 `?theme=guest.founder` 送到这里）
 * 会落在页首，读起来像是这条链接没生效。
 */
if (location.hash.length > 1) {
  document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
}
