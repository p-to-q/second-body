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
 * ## 跨页过渡整个关着
 *
 * 平台的跨页 View Transition 在无头 Chrome 上四轮完整跑，**每一类**量过的跳都出现过整帧纯白
 * （亮度 255、离散度 0）再淡开，连文档页之间也是（08 about → making 在第二对里白了一次，第一对 0 白）。
 * 两次归因都被下一轮推翻：藏掉 GPU 画布与摄像头小屏之后照白；给过渡叠层不透明的底之后照白。
 * 原因没查到，真 GPU 上会不会白这里验证不了（docs/47 §4.3）。一刀切在四轮里 0 白 ——
 * 所以跨页全是 `none`。开回某一对只改一行，但**先在真显示器上量**，再改 `test/transitions.test.ts`。
 *
 * 同文档的交棒（选择页 → 舞台，`handoff`）不走跨页快照，03 / 20 两跳六轮 0 白，开着。
 *
 * 单独一个文件的理由和 `ui/exits-url.ts` 一样：node 的测试加载不了 .css，
 * 而"每一对都有定义"恰恰是这里最该有仪表的那一块。
 */

/**
 * 一把尺子。毫秒。docs/23 §0：进 240 / 出 180，出比进快。
 * 曾经有第三档「移 420」给跨页的共享元素用；跨页过渡关掉之后它没有消费者，删了 ——
 * 一个没人取用的令牌只会让下一个人以为某处在用它。
 */
export const MOTION = {
  leaveMs: 180,
  enterMs: 240,
  easeEnter: 'cubic-bezier(.16, 1, .3, 1)',
  easeLeave: 'cubic-bezier(.4, 0, 1, 1)',
} as const;

/**
 * 看门狗：任何一次过渡最迟在这么久之后被强制收掉。
 *
 * `ui/controls.css` 记着那条教训：一台被占满的机器上（实测 1.7 fps）一次 180ms 的过渡
 * 停在 `running` 永远回不到静止态。过渡叠层盖在整页上面，它不收，整页就一直是一张旧截图。
 * 所以静止态不许等动画跑完 —— 等的是一个计时器。一出一进加起来的三倍（1260ms）。
 */
export const SETTLE_MS = (MOTION.leaveMs + MOTION.enterMs) * 3;

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

export interface Transition {
  /**
   * handoff    原地换景：旧的一景留在屏幕上，等新的一景画出第一帧再淡过去（同文档）
   * none       不过渡（跨页一律如此，见文件头）
   */
  kind: 'handoff' | 'none';
}

const NONE: Transition = { kind: 'none' };
const HANDOFF: Transition = { kind: 'handoff' };

type Pair = `${Surface}>${Surface}`;
const both = (a: Surface, b: Surface, t: Transition): [Pair, Transition][] =>
  (a === b ? [[`${a}>${b}` as Pair, t]] : [[`${a}>${b}` as Pair, t], [`${b}>${a}` as Pair, t]]);

/**
 * 每一对面之间怎么过。**写成清单，不写成规则**：规则会替没人想过的一对自动给出答案，
 * 而这张表存在的全部意义是"每一对都有人想过"。`test/transitions.test.ts` 从代码里
 * 把真实存在的每一条路找出来，连同后退的反方向，逐条要求这里有它。
 */
export const TRANSITIONS: ReadonlyMap<Pair, Transition> = new Map<Pair, Transition>([
  // 跨页：全部 none（文件头「跨页过渡整个关着」）。一对一行，开回哪一对就改哪一行
  ...both('label', 'doc', NONE),
  ...both('doc', 'doc', NONE),
  ...both('doc', 'room', NONE),
  ...both('room', 'room', NONE),
  ...both('stage', 'label', NONE),
  ...both('stage', 'doc', NONE),
  ...both('stage', 'room', NONE),
  ...both('stage', 'workbench', NONE),
  ...both('stage', 'stage', NONE),          // 换物种 / 随机 / 从工作台带着状态回来：都是一次重载
  ...both('label', 'workbench', NONE),
  ...both('doc', 'workbench', NONE),
  ...both('room', 'workbench', NONE),
  ...both('workbench', 'workbench', NONE),
  ...both('workbench', 'kiosk', NONE),
  ...both('workbench', 'selftest', NONE),
  ...both('selftest', 'kiosk', NONE),
  ...both('selftest', 'label', NONE),
  ...both('missing', 'label', NONE),
  ...both('missing', 'doc', NONE),
  ...both('missing', 'workbench', NONE),
  // 原地：展签 → 选择页是同一个场进入下一阶段（shell/entry.ts 的文件头），不需要平台再叠一层
  ['label>label', NONE],
  // 原地：选择页 → 舞台。卡片涨满屏幕之后，等舞台画出第一帧，再淡过去（同文档，六轮 0 白）
  ['label>stage', HANDOFF],
  ['kiosk>stage', HANDOFF],
]);

/** 这一跳怎么过。表里没有的一对返回 `null` —— 调用方据此不过渡 */
export function transitionFor(from: Surface, to: Surface): Transition | null {
  return TRANSITIONS.get(`${from}>${to}`) ?? null;
}

/**
 * 预取 / 预渲染（Speculation Rules）。悬停 200ms 左右开始（`moderate`）。**不是过渡**：
 * 它只让下一页早一点到，页面之间照旧一刀切。
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
