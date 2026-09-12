/**
 * 《共生护照》—— 人机共创的两条过程性证明。
 *
 * ## 为什么做成签证页
 *
 * 提交模板是两栏表单：「AI 输出结果 / 拒绝原因」「AI 输出结果 / 保留原因」。
 * 照着填会得到一张表格。但"护照"这个词本身给了更准的读法 ——
 * **护照是通关记录：谁被拒绝入境，谁被放行。**
 *
 *   一、人类的判断 = 一次**拒入**。AI 的产物申请进入作品，被驳回。
 *   二、AI 意外结果 = 一次**准入**。没人申请，它自己来了，被允许留下。
 *
 * 于是这一页的形式和内容是同一件事，而不是给内容套一个好看的壳。
 *
 * ## 纪律
 *
 * **每一条都必须是真的，且能指到 commit 或文件。** 这一页的全部力量来自它是真的。
 * 编一条就全毁了 —— 而且评审要的正是过程性证明，不是作品说明。
 */
import '../ui/type.css';
import '../ui/pages.css';
import { COPY, bi, type BiText } from '../ui/i18n.ts';

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
    evidence: ['docs/07-HYPER3D-API.md §3', 'packages/factory/src/normalize.ts weldTolerant()', 'docs/09 U11'],
  },
];

// ─────────────────────────── 渲染 ───────────────────────────

const el = (tag: string, cls?: string, text?: string): HTMLElement => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

function biBlock(t: BiText, tag = 'div', cls = ''): HTMLElement {
  const wrap = el(tag, `sb-bi ${cls}`.trim());
  wrap.append(el('span', 'sb-zh', t.zh), el('span', 'sb-en', t.en));
  return wrap;
}

function stampBlock(s: Stamp): HTMLElement {
  const sec = el('section', `sb-stamp sb-${s.verdict}`);

  // 页眉：编号 · 裁定 · 日期 —— 像护照上那一行
  const head = el('div', 'sb-stamp-head');
  head.append(
    el('span', 'sb-stamp-no', s.no),
    biBlock(s.verdict === 'refused' ? bi('拒入', 'REFUSED') : bi('准入', 'ADMITTED'), 'span', 'sb-verdict'),
    el('span', 'sb-stamp-date sb-data sb-num', s.date),
  );
  sec.append(head, el('hr', 'sb-rule'));

  const row = (label: BiText, body: HTMLElement): HTMLElement => {
    const r = el('div', 'sb-row');
    r.append(biBlock(label, 'div', 'sb-label'), body);
    return r;
  };

  sec.append(row(bi('申请人', 'Applicant'), biBlock(s.subject)));

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

  return sec;
}

const root = document.getElementById('passport')!;

const header = el('header', 'sb-room-head');
header.append(el('span', 'sb-room-no', 'VII / 共生护照 · SYMBIOSIS PASSPORT'));
const h1 = el('h1');
h1.append(biBlock(bi('共生护照', 'Symbiosis Passport')));
header.append(h1);
header.append(biBlock(bi(
  '两条过程性证明。一次拒入，一次准入。',
  'Two records of process. One entry refused, one entry admitted.',
), 'p', 'sb-lede'));
header.append(biBlock(bi(
  `作品：${COPY.title.zh}`,
  `Work: ${COPY.title.en}`,
), 'p', 'sb-data'));
root.append(header, el('hr', 'sb-rule'));

for (const s of STAMPS) root.append(stampBlock(s));

const foot = el('footer', 'sb-foot');
foot.append(biBlock(bi(
  '本页每一条都可在仓库中核对。挖不到证据的事件没有被写进来。',
  'Every record on this page can be checked against the repository. Events without evidence were left out.',
), 'p'));
root.append(el('hr', 'sb-rule'), foot);
