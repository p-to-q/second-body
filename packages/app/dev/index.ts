/**
 * 目录 —— `/dev/`。
 *
 * 这件作品的可见面散在十几个 URL 里，谁都记不住。这一页就是它们的目录：
 * **每一条只有一句话，说清楚它能回答什么问题。** 不是"这个页面有什么功能"，
 * 而是"我有哪个疑问的时候该打开它"。
 *
 * 为什么值得存在（docs/02 §craft：每多一个 UI 元素都要论证）：
 * 没有它，一个第一次接手的人只能靠 grep 找页面；而这些页面恰恰是
 * 这个项目最贵的部分 —— 每一页都是一条被证明过的降级路径或一次判断的留痕。
 *
 * 分三组，用细横线分区：
 *   作品     观众会看见的那几个 URL
 *   侧室     已经展出、但**不在目录里**的那几个房间（docs/23 §S9）
 *   工作台   我们自己用的验收台，现场不出现
 *
 * 「侧室」那一组以前叫「档案」，里面是 `/dev/parts.html` 和
 * `/dev/choose.html?roster=1`。那两条其实在说"这两页可以直接给人看" ——
 * 现在它们真的给人看了，于是它们搬到了根目录的真 URL 上，这一组也跟着改名。
 * 剩下的 14 页留在工作台：它们是仪器，被展出只会变成"排版好一点的后台"。
 */
import './archive.css';
import './index.css';
import { mountPageHead } from '../src/ui/page.ts';
import { withFrom } from '../src/ui/return-to.ts';
import { mountFooterMark } from '../src/ui/footer-mark.ts';
import { markNode } from '../src/ui/mark.ts';

interface Item {
  href: string;
  name: string;
  /** 它能回答什么问题。一句话，以问号或句号结束 */
  answers: string;
  /** 需要 dev server（有中间件 / 有原始资产）才完整的，标出来 */
  devOnly?: boolean;
}

interface Group { title: string; note: string; items: Item[] }

const GROUPS: Group[] = [
  {
    title: '作品',
    note: '观众会看见的那几个 URL。参数全部写在 docs/06 §6。',
    items: [
      { href: '/', name: '正式运行', answers: '这件作品现在跑起来是什么样？' },
      { href: '/?demo=1&debug=1', name: '回放兜底', answers: '没有摄像头 / 没人敢上台的时候演什么？' },
      { href: '/?kiosk=1', name: '现场模式', answers: '投影上全屏、无光标的那一份长什么样？' },
      { href: '/?selftest=1', name: '开场自检', answers: '今天能不能开场？哪一条坏了？' },
    ],
  },
  {
    title: '侧室',
    note:
      // 原来这句带着 markdown 的 ** —— 这里是纯文本，星号原样印在了页面上（负责人线上看到的）。
      // 它说的「不在目录里」也已经不成立：三个侧室在 docs/47 之后进了目录（收起的那一组）
      '已经展出的房间。观众从 /about 的正文和右上角目录都走得到（docs/23 §S9）；'
      + '这里列出来，是因为这一页是后台的地图，给我们自己看。',
    items: [
      { href: '/parts', name: '部件档案', answers: '这件作品到现在为止长出了什么？谁是谁？哪些被留下了？' },
      { href: '/roster', name: '物种接触表', answers: '可以变成的身体一共有哪些？一版摆完。' },
      { href: '/marks', name: '九枚记号', answers: '九种身体方案凭什么算九种？它们各自是什么形状？' },
      // 最早那张灯箱式对照表（负责人 2026-09-14 要回来展示）：行 = 槽位、列 = 物种，外框就是评级
      { href: '/dev/sheet.html', name: '部件读片', answers: '所有部件排成一面灯箱，哪几件被判不合格（红框）、哪几件留下（绿框）？点一格就能改一档。' },
    ],
  },
  {
    title: '工作台',
    note: '我们自己的验收台，现场不出现。每一页只回答一个很窄的问题 —— 越窄越早发现是谁的锅。',
    items: [
      { href: '/dev/stage.html', name: '舞台', answers: '这一帧像不像一件作品？灯光、地面、影子、取景对不对？' },
      { href: '/dev/figure.html', name: '装配', answers: '部件挂到骨架上，比例和朝向对不对？' },
      { href: '/dev/mass.html', name: '团块身体', answers: '不走刚体挂载的那种身体（mass）长什么样？' },
      // 这两页从 /about 正文里有链接（docs/23 §S9.2），工作台自己的地图却一直没列它们 ——
      // 一个从外面进得来、从后台地图上找不到的页面，下一个维护的人会以为它不存在。
      { href: '/dev/lineup.html', name: '身体方案并排', answers: '同一副骨架重映射成九种形体，放在一排里看，差别在哪？' },
      { href: '/dev/vitality.html', name: '生命力 A/B', answers: '一堆刚体凭什么看起来是活的？延迟只落在末端，骨盆真的实时吗？' },
      { href: '/dev/sound.html', name: '声音', answers: '四层声音各自在响吗？它们真的跟着信号走吗？' },
      { href: '/dev/choose.html', name: '选择页', answers: '观众在这一屏选的是"变成什么"，还是"点哪一个"？' },
      { href: '/dev/capture.html', name: '采集', answers: '摄像头认到人了吗？坐标和量程对不对？' },
      { href: '/dev/framing.html', name: '取景模式', answers: '它现在判的是上半身还是全身？为什么？离另一个判断还差多少？' },
      { href: '/dev/people.html', name: '多人入镜', answers: '画面里几个人，谁是谁？交叉走过、被挡住、第四个人路过时，谁的身体换了？' },
      { href: '/dev/degrade.html', name: '降级阶梯', answers: '帧循环炸了会不会一级一级降下去？无人时真的掉到 10fps 吗？' },
      { href: '/dev/record.html', name: 'Pose 录制', answers: '没有真人站在这里的时候，这件作品靠什么活着？', devOnly: true },
      { href: '/dev/anchor.html', name: 'Anchor 渲染', answers: '一个物种的风格是从哪一张图定下来的？', devOnly: true },
    ],
  },
];

mountPageHead({
  title: '目录',
  titleEn: 'Contents',
  note: '这件作品的每一个可见面，以及它各自能回答的那个问题。',
});

// 页头左上那一行 12px 的 `SEE-ME SEE-U` 标签换成站里通用的两行字标（`ui/mark.ts`），印到 h1 那一档。
// 负责人线上看到：这一页的 logo 没有放大、也不是那枚特殊字体 —— 其余文档页和侧室顶上都是这枚字标，唯独工作台目录是一行小字
const mark = markNode('div', 'start');
mark.style.setProperty('--sb-mark-size', 'var(--sb-size-h1)');
mark.style.marginBottom = 'calc(var(--sb-gutter) * 1.25)';
document.querySelector('.sb-head__work')?.replaceWith(mark);

const page = document.createElement('div');
page.className = 'sb-page';
// 页头那条线和第一组「作品」之间原来是 0，题几乎压在线上（负责人：「整页比较紧，和作品离得太近」）
page.style.paddingTop = 'calc(var(--sb-gutter) * 2.5)';
document.body.appendChild(page);

for (const group of GROUPS) {
  const section = document.createElement('section');
  section.style.marginBottom = 'calc(var(--sb-gutter) * 2)';

  const h2 = document.createElement('h2');
  h2.textContent = group.title;
  const note = document.createElement('p');
  note.textContent = group.note;
  const rule = document.createElement('hr');
  rule.className = 'sb-rule';
  section.append(h2, note, rule);

  for (const item of group.items) {
    const row = document.createElement('a');
    // 不在工作台里、也不是舞台（`/`、`/?…`）的目标带上来处：侧室和文档页的横带据此指回这一页。
    // 舞台不读 from，工作台里的仪器页有 devnav，二者都不带
    row.href = item.href.startsWith('/dev/') || item.href === '/' || item.href.startsWith('/?')
      ? item.href : withFrom(item.href, location.pathname);
    // 一行一条：左边名字 + 路径，右边那句话。行与行之间只有一条细线。
    // 样式在 dev/index.css：内联样式写不了 :hover，原来悬停上去一个字都不变
    row.className = 'sb-dev-row';

    const left = document.createElement('span');
    const name = document.createElement('span');
    name.className = 'sb-dev-row__name';
    name.textContent = item.name;
    const path = document.createElement('span');
    path.className = 'sb-data sb-dev-row__path';
    path.textContent = item.href + (item.devOnly ? '   仅 dev server' : '');
    left.append(name, path);

    const answers = document.createElement('span');
    answers.className = 'sb-dev-row__answers';
    answers.textContent = item.answers;

    row.append(left, answers);
    section.appendChild(row);
  }
  page.appendChild(section);
}

// 页脚：这一页自己也该说清楚它不是什么
const foot = document.createElement('p');
foot.className = 'sb-data';
foot.style.marginTop = 'calc(var(--sb-gutter) * 2)';
foot.textContent =
  '排版系统 packages/app/src/ui/type.css · 场景规格 docs/23-SPEC-ui.md · ' +
  '「什么真的跑通了」以 docs/10-SURFACES.md 为准';
page.appendChild(foot);
mountFooterMark(page);
