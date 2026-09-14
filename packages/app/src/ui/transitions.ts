/**
 * 换页的那张表 —— 不碰 DOM、不碰 CSS 的那一半（docs/47）。
 *
 * ## 它解决的那一个问题
 *
 * 这个站是十几张各自独立的页面，加上首页里两次原地换景（展签 → 选择页 → 舞台）。
 * 2026-09-14 无头 Chrome 逐跳量过，最坏的几跳亮度一帧跳 226–240（满量程 255）：
 * 每一次重载 `/`，白纸出现之前先闪 600–700ms 深底（`index.html` 写死的那个底色）；
 * 选择页一刀切到深底的舞台，中间 450ms 一帧都没有。
 *
 * 这里定三件事：
 *
 *  1. **一把尺子**（`MOTION`）：出 180 / 进 240 毫秒，两条缓动 —— docs/23 §0 那一行。
 *     `type.css` 里的令牌必须和它逐字相同（测试钉住）。
 *  2. **第一帧落在什么底色上**（`groundFor`）：`index.html` 在任何脚本之前就要知道，
 *     所以它自己抄了一份几行的判断 —— 那一份由测试拿这里的函数逐条对。**这一条不靠任何过渡。**
 *  3. **每一跳怎么过**（`TRANSITIONS`）：逐对写着，没有规则替没人想过的一对给答案。
 *
 * ## 跨页过渡开着（2026-09-14 第二轮，docs/47 §4.3）
 *
 * 第一轮在**无头** Chrome 上量到跨页过渡第一帧整帧纯白，关掉过。第二轮在这台 Mac 的真窗口上
 * （有 GPU、有显示器）逐类跳各跑 ≥10 次，白帧的记录在 docs/47 §4.3 —— 那张表是开着的依据。
 * `scripts/transitions/` 里留着有头与无头两种跑法，改这张表之前重跑一遍。
 *
 * 表里每一对都有过渡；**不过渡的只有写了理由、并被测试钉住的那几对**（`NO_TRANSITION_REASONS`）。
 *
 * 单独一个文件的理由和 `ui/exits-url.ts` 一样：node 的测试加载不了 .css，
 * 而"每一对都有定义"恰恰是这里最该有仪表的那一块。
 */

/** 一把尺子。毫秒。docs/23 §0：进 240 / 出 180，出比进快 */
export const MOTION = {
  leaveMs: 180,
  enterMs: 240,
  /** 一件东西（字标、巨题、目录那个词）从上一页的位置挪到这一页。它走的是一段距离，不是一次出现 */
  moveMs: 420,
  easeEnter: 'cubic-bezier(.16, 1, .3, 1)',
  easeLeave: 'cubic-bezier(.4, 0, 1, 1)',
} as const;

/**
 * 看门狗：任何一次过渡最迟在这么久之后被强制收掉。
 *
 * `ui/controls.css` 记着那条教训：一台被占满的机器上（实测 1.7 fps）一次 180ms 的过渡
 * 停在 `running` 永远回不到静止态。过渡叠层盖在整页上面，它不收，整页就一直是一张旧截图。
 * 所以静止态不许等动画跑完 —— 等的是一个计时器。最长那一档的三倍（1260ms）。
 */
export const SETTLE_MS = MOTION.moveMs * 3;

/**
 * 选择页交棒给舞台时，最多等舞台这么久。等不到（起不来、慢机器）也照样交棒 ——
 * 交棒本身不许依赖舞台画出第一帧。
 */
export const HANDOFF_WAIT_MS = 5000;

/**
 * 舞台"画稳了"：连续这么多帧、每帧间隔都不超过 `STEADY_FRAME_MS`。
 *
 * 为什么不是"画出第一帧"就交棒（docs/47 §4.3）：舞台头几帧在编译着色器，一帧几百毫秒，
 * GPU 进程被占住，合成器跟着停 —— 240ms 的淡入在有头 Chrome 上一帧都没画出来，读作一刀切。
 * 等到帧间隔稳在 30fps 以内再交，卡片多停几百毫秒，换来的是淡入真的被画出来。
 */
export const STEADY_FRAMES = 3;
export const STEADY_FRAME_MS = 34;

/** 最近几帧的间隔（毫秒，按时间先后）够不够稳。纯函数 */
export function framesSteady(intervals: readonly number[]): boolean {
  if (intervals.length < STEADY_FRAMES) return false;
  return intervals.slice(-STEADY_FRAMES).every((dt) => dt > 0 && dt <= STEADY_FRAME_MS);
}

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

/** 两页上"是同一件东西"的元素 */
export type Shared = 'title' | 'mark' | 'nav' | 'devnav';

export interface Transition {
  /**
   * crossfade  两页交叉淡化（出 180 / 进 240），底色跟着淡，共享元素在 420 里挪位（跨页）
   * handoff    原地换景：旧的一景留在屏幕上，等新的一景画出第一帧再淡过去（同文档）
   * none       不过渡 —— 只许出现在 `NO_TRANSITION_REASONS` 里
   */
  kind: 'crossfade' | 'handoff' | 'none';
  shared: readonly Shared[];
}

/** `view-transition-name`。两页上同名的元素会被平台当成同一件东西挪过去 */
export const SHARED_NAME: Readonly<Record<Shared, string>> = {
  title: 'sb-title', mark: 'sb-mark', nav: 'sb-nav', devnav: 'sb-devnav',
};

/**
 * 页面上声明"我是那一件东西"用的属性（`page-transition.ts` 的 `declareShared`）。
 * 表只说哪一对要挪哪几件；**哪个元素是那一件，由建它的地方声明** —— 这张表不认任何选择器，
 * 页面改了 class 名也不会悄悄失去过渡。
 */
export const SHARED_ATTR = 'data-vt-shared';

const xfade = (...shared: Shared[]): Transition => ({ kind: 'crossfade', shared });
const NONE: Transition = { kind: 'none', shared: [] };
const HANDOFF: Transition = { kind: 'handoff', shared: [] };

type Pair = `${Surface}>${Surface}`;
const both = (a: Surface, b: Surface, t: Transition): [Pair, Transition][] =>
  (a === b ? [[`${a}>${b}` as Pair, t]] : [[`${a}>${b}` as Pair, t], [`${b}>${a}` as Pair, t]]);

/**
 * 不过渡的那几对，和理由。**加一行必须写理由**，`test/transitions.test.ts` 要求表里每一个 `none`
 * 在这里有一行、这里每一行在表里真的是 `none`。
 */
export const NO_TRANSITION_REASONS: Readonly<Partial<Record<Pair, string>>> = {
  'label>label': '展签 → 选择页是同一个文档里同一个场进入下一阶段（shell/entry.ts）；字标由 entry.ts 自己交棒，不走这张表',
};

/**
 * 每一对面之间怎么过。**写成清单，不写成规则**：规则会替没人想过的一对自动给出答案，
 * 而这张表存在的全部意义是"每一对都有人想过"。`test/transitions.test.ts` 从代码里
 * 把真实存在的每一条路找出来，连同后退的反方向，逐条要求这里有它。
 *
 * 共享元素只是**请求**：某一侧没有那个元素（展签的巨题要等脚本挂上、舞台上没有字标），
 * 它就只在有它的那一侧淡入或淡出。
 */
export const TRANSITIONS: ReadonlyMap<Pair, Transition> = new Map<Pair, Transition>([
  // 展签 / 选择页 ↔ 陈述页：巨题是同一行字；选择页左上的字标挪到横带右端；目录那个词不动
  ...both('label', 'doc', xfade('title', 'mark', 'nav')),
  // 文档页之间、文档页与侧室之间：右上角字标、目录那个词一动不动，其余交叉淡化 —— 墙上的展签不跟着人走
  ...both('doc', 'doc', xfade('mark', 'nav')),
  ...both('doc', 'room', xfade('mark', 'nav')),
  ...both('room', 'room', xfade('mark', 'nav')),
  ...both('missing', 'doc', xfade('mark', 'nav')),
  ...both('missing', 'label', xfade('mark', 'nav')),
  // 舞台 ↔ 其余：深底与纸之间是底色的交叉淡化；目录那个词在两边都有，它不动
  ...both('stage', 'label', xfade('nav')),          // 回到大厅
  ...both('stage', 'doc', xfade('nav')),
  ...both('stage', 'room', xfade('nav')),
  ...both('stage', 'stage', xfade('nav')),          // 换物种 / 随机：一次重载，淡过去
  ...both('stage', 'workbench', xfade()),
  // 工作台：右上角那条出口在工作台页之间不动；到侧室 / 文档页是一次短淡化
  ...both('workbench', 'workbench', xfade('devnav')),
  ...both('label', 'workbench', xfade()),
  ...both('doc', 'workbench', xfade()),
  ...both('room', 'workbench', xfade()),
  ...both('missing', 'workbench', xfade()),
  ...both('workbench', 'kiosk', xfade()),
  ...both('workbench', 'selftest', xfade()),
  ...both('selftest', 'kiosk', xfade()),
  ...both('selftest', 'label', xfade()),
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
 * 预取 / 预渲染（Speculation Rules）。悬停 200ms 左右开始（`moderate`）。它不是过渡，
 * 只让下一页早一点到 —— 预渲染好的页被激活时，跨页过渡照样发生。
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
