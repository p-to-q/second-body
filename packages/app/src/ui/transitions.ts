/**
 * 换页的那张表 —— 不碰 DOM、不碰 CSS 的那一半（docs/47）。
 *
 * ## 它解决的那一个问题
 *
 * 这个站是十几张各自独立的页面，加上首页里两次原地换景（展签 → 选择页 → 舞台）。
 * 每一跳原来都是一刀切：深底的舞台一刀切到白纸的展签，白纸的选择页一刀切到深底的舞台，
 * 而且每一次重载 `/`，白纸出现之前先闪一块深底（`index.html` 写死的那个底色）。
 * 2026-09-14 无头 Chrome 逐跳量过，最坏的四跳亮度一帧跳 226–240（满量程 255）。
 *
 * 所以这里定三件事，其余交给平台（View Transitions API）：
 *
 *  1. **一把尺子**（`MOTION`）：出 180 / 进 240 / 移 420 毫秒，两条缓动 —— docs/23 §0 那一行，
 *     加一个"共享元素挪位置"用的第三档。`type.css` 里的令牌必须和它逐字相同（测试钉住）。
 *  2. **每一跳落在什么底色上**（`groundFor`）：`index.html` 在第一帧之前就要知道，
 *     所以它自己抄了一份几行的判断 —— 那一份也由测试拿这里的函数逐条对。
 *  3. **每一跳怎么过**（`TRANSITIONS`）：交叉淡化、交棒（原地换景要等下一景真的画出来）、
 *     或者不过渡；以及哪几样东西是**同一件东西**，应该从这一页挪到下一页（巨题、字标）。
 *     表里没有的一对就不过渡 —— 宁可一刀切，也不许一次没人设计过的过渡。
 *
 * 单独一个文件的理由和 `ui/exits-url.ts` 一样：node 的测试加载不了 .css，
 * 而"每一对都有定义"恰恰是这里最该有仪表的那一块。
 */

/** 一把尺子。毫秒。docs/23 §0：进 240 / 出 180，出比进快 */
export const MOTION = {
  leaveMs: 180,
  enterMs: 240,
  /** 共享元素（巨题、字标）从上一页的位置挪到这一页。比进场长：它走的是一段距离，不是一次出现 */
  moveMs: 420,
  easeEnter: 'cubic-bezier(.16, 1, .3, 1)',
  easeLeave: 'cubic-bezier(.4, 0, 1, 1)',
} as const;

/**
 * 看门狗：任何一次过渡最迟在这么久之后被强制收掉。
 *
 * `ui/controls.css` 记着那条教训：一台被占满的机器上（实测 1.7 fps）一次 180ms 的过渡
 * 停在 `running` 永远回不到静止态。过渡叠层盖在整页上面，它不收，整页就一直是一张旧截图。
 * 所以静止态不许等动画跑完 —— 等的是一个计时器。最长那一档的三倍。
 */
export const SETTLE_MS = MOTION.moveMs * 3;

/**
 * 选择页交棒给舞台时，最多等舞台这么久。等不到（起不来、慢机器）也照样交棒 ——
 * 交棒本身不许依赖舞台画出第一帧。
 */
export const HANDOFF_WAIT_MS = 5000;

/**
 * 站里的几种面。`label` 包括展签和选择页（同一个文档里的两个阶段，底色都是纸），
 * `kiosk` 是现场模式下的选择页，`stage` 是舞台（URL 里有 `theme`）。
 */
export type Surface = 'label' | 'kiosk' | 'stage' | 'doc' | 'room' | 'workbench' | 'selftest' | 'missing';

export type Ground = 'paper' | 'dark';

const DOCS = ['/about', '/making', '/passport', '/lineage'];
const ROOMS = ['/parts', '/roster', '/marks'];

function canonical(pathname: string): string {
  const p = pathname.replace(/\/index(\.html)?$/, '/').replace(/\.html$/, '');
  return p.length > 1 ? p.replace(/\/+$/, '') : '/';
}

/** 这个地址是哪一种面 */
export function surfaceOf(pathname: string, search = ''): Surface {
  const p = canonical(pathname);
  if (p === '/' || p === '') {
    const q = new URLSearchParams(search);
    if (q.get('selftest') === '1') return 'selftest';
    if (q.get('theme')) return 'stage';
    return q.get('kiosk') === '1' ? 'kiosk' : 'label';
  }
  if (DOCS.includes(p)) return 'doc';
  if (ROOMS.includes(p)) return 'room';
  if (p === '/dev' || p.startsWith('/dev/')) return 'workbench';
  return 'missing';
}

/**
 * 这一面的底色。只有首屏那一段是纸（`choose/ring/first-screen.css` 的文件头：全站唯一的例外）。
 *
 * 判据只看 URL，因为 `index.html` 要在任何脚本和样式表到达之前用它：
 * 没有 `theme` 就会进展签或选择页。`?theme=` 拼错时也判成深底 —— 那一次会先深后纸，
 * 这是换"第一帧之前不跑任何模块"的代价，拼错的深链本来就不是一条观众会走的路。
 */
export function groundOf(surface: Surface): Ground {
  return surface === 'label' || surface === 'kiosk' ? 'paper' : 'dark';
}
export const groundFor = (pathname: string, search = ''): Ground => groundOf(surfaceOf(pathname, search));

/** 一跳是怎么发生的 */
export type Via = 'document' | 'traverse' | 'in-page';

/** 两页上"是同一件东西"的元素 */
export type Shared = 'title' | 'mark';

export interface Transition {
  /**
   * crossfade  两页交叉淡化（出 180 / 进 240），共享元素在 420 里挪位
   * handoff    原地换景：旧的一景留在屏幕上，等新的一景画出第一帧再淡过去
   * none       不过渡
   */
  kind: 'crossfade' | 'handoff' | 'none';
  shared: readonly Shared[];
}

/** `view-transition-name`。两页上同名的元素会被平台当成同一件东西挪过去 */
export const SHARED_NAME: Readonly<Record<Shared, string>> = { title: 'sb-title', mark: 'sb-mark' };

/**
 * 在页面上找到那件东西。**只有文字真的相同才算同一件**：
 * 展签的巨题和 `/about` 的巨题都是 `SEE-ME SEE-U`；`/making` 的题是「做的过程」，不是它。
 */
export const SHARED_SELECTOR: Readonly<Record<Shared, string>> = {
  title: '.sb-entry-title, .about .ed-hero__title h1',
  mark: '.ed-hero__meta .sb-mark, .sb-brand .sb-mark',
};

const xfade = (...shared: Shared[]): Transition => ({ kind: 'crossfade', shared });
const NONE: Transition = { kind: 'none', shared: [] };
const HANDOFF: Transition = { kind: 'handoff', shared: [] };

type Pair = `${Surface}>${Surface}`;
const both = (a: Surface, b: Surface, t: Transition): [Pair, Transition][] =>
  (a === b ? [[`${a}>${b}` as Pair, t]] : [[`${a}>${b}` as Pair, t], [`${b}>${a}` as Pair, t]]);

/**
 * 每一对面之间怎么过。**写成清单，不写成规则**：规则会替没人想过的一对自动给出答案，
 * 而这张表存在的全部意义是"每一对都有人想过"。`test/transitions.test.ts` 从代码里
 * 把真实存在的每一条路找出来，逐条要求这里有它。
 */
export const TRANSITIONS: ReadonlyMap<Pair, Transition> = new Map<Pair, Transition>([
  // 展签 ↔ 作品陈述：两页的巨题是同一行字，它从左下挪到页首；字标在陈述页上等着
  ...both('label', 'doc', xfade('title', 'mark')),
  // 文档页之间、文档页与侧室之间：右上角那个字标一动不动，其余交叉淡化 —— 墙上的展签不跟着人走
  ...both('doc', 'doc', xfade('mark')),
  ...both('doc', 'room', xfade('mark')),
  ...both('room', 'room', xfade('mark')),
  // 深底 ↔ 纸、深底 ↔ 深底：只交叉淡化。舞台上没有可以带走的东西（它的字标在选择页上，已经拆了）
  ...both('stage', 'label', xfade()),
  ...both('stage', 'doc', xfade()),
  ...both('stage', 'room', xfade()),
  ...both('stage', 'workbench', xfade()),
  ...both('stage', 'stage', xfade()),          // 换物种 / 随机 / 从工作台带着状态回来：都是一次重载
  ...both('label', 'workbench', xfade()),
  ...both('doc', 'workbench', xfade()),
  ...both('room', 'workbench', xfade()),
  ...both('workbench', 'workbench', xfade()),
  ...both('workbench', 'kiosk', xfade()),
  ...both('workbench', 'selftest', xfade()),
  ...both('selftest', 'kiosk', xfade()),
  ...both('selftest', 'label', xfade()),
  // 404 那一页（HTTP 404 回来的文档）离开时，无头 Chrome 截到过整张纯白的旧页（docs/47 §4.3）。
  // 一个没人会停留的页不值得冒一帧白闪的险：不过渡
  ...both('missing', 'label', NONE),
  ...both('missing', 'doc', NONE),
  ...both('missing', 'workbench', NONE),
  // 原地：展签 → 选择页是同一个场进入下一阶段（shell/entry.ts 的文件头），不需要平台再叠一层
  ['label>label', NONE],
  // 原地：选择页 → 舞台。卡片涨满屏幕之后，等舞台画出第一帧，再淡过去
  ['label>stage', HANDOFF],
  ['kiosk>stage', HANDOFF],
]);

/** 这一跳怎么过。表里没有的一对返回 `null` —— 调用方据此不过渡 */
export function transitionFor(from: Surface, to: Surface): Transition | null {
  return TRANSITIONS.get(`${from}>${to}`) ?? null;
}

/**
 * 预取 / 预渲染（Speculation Rules）。悬停 200ms 左右开始（`moderate`）。
 *
 * - **预渲染只给四张文字页。** 它们没有 WebGPU、没有摄像头、没有声音 ——
 *   预渲染一页 = 在背后把它完整跑一遍，这几页跑一遍几乎不要钱，点下去就是现成的。
 * - **其余同源页只预取 HTML。** 侧室有几百个缩略图画布，工作台页大多起 WebGPU；
 *   在背后替一次悬停把它们全跑起来，代价远大于省下的那一两百毫秒。
 * - **舞台（`/`）和 `/api/` 连预取都不做。** 预取 `/` 等于替人按了「开始」前的那一次加载；
 *   `/api/` 是写存档的地方，一次悬停不许碰它。
 */
export const PRERENDER_PATHS: readonly string[] = DOCS;
export function speculationRules(): object {
  const not = (patterns: readonly string[]): object => ({ not: { or: patterns.map((p) => ({ href_matches: p })) } });
  return {
    prerender: [{
      source: 'document',
      where: { or: PRERENDER_PATHS.map((p) => ({ href_matches: p })) },
      eagerness: 'moderate',
    }],
    prefetch: [{
      source: 'document',
      where: { and: [{ href_matches: '/*' }, not([...PRERENDER_PATHS, '/', '/api/*'])] },
      eagerness: 'moderate',
    }],
  };
}
