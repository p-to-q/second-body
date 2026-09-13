/**
 * 那一个场 —— 开屏和选择页共用的同一块画布、同一套距离场、同一条时间线。
 *
 * ## 为什么是"一个场的两个阶段"而不是两套东西
 *
 * 原来开屏（`shell/entry.ts`）是纯 DOM 的一块展签，选择页是另一个渲染器里的轮播；
 * 观众按下「开始」看到的是一层淡出、另一层淡入 —— **两件事**。
 * 参考作品的入场是"每张卡都从前一张里剥出来"，它成立的前提正是
 * **在剥离之前，所有卡片本来就已经在那里了**（叠在同一颗种子里）。
 * 所以这里把两段接成一条：
 *
 * ```
 *   展签在场   种子已经出生，在展签背后缓慢地转（attract）
 *   ↓ 「开始」
 *   剥离       卡片一张张从前一张里剥出来，拉出越来越细的丝（play）
 *   ↓
 *   稳态       环停在左侧，可滚动 / 拖动 / 悬停（interactive）
 *   ↓ 选定
 *   坍缩       其余卡片被选中的那张吸回去、融成一团、涨出画面（exit）
 * ```
 *
 * 这条时间线没有一处淡入淡出。
 *
 * ## 谁拥有它
 *
 * 一个进程里只该有一个（`acquire()`）：`entry.ts` 先拿到它，
 * `choose.ts` 之后**接管同一个实例**而不是再建一个。
 * 两边都没拿到（现场 / 深链没有展签）时，选择页自己建，剥离就是它的入场。
 *
 * ## 帧循环的两条硬规矩
 *
 *  - **不许抛异常**（docs/02 P2）：`tick()` 整个包在 try/catch 里，出事自己停下来，
 *    通过 `onError` 交回上层，由选择页切到 DOM 降级列表。
 *  - **不许在帧里 new**（P5）：所有向量、数组都在建的时候分配好，每帧原地改。
 *
 * 数学（环的排布、剥离的时序、丝的四个属性、吸附、玻璃唇）移植自
 * Viscose-carousel（MIT）。逐条差异写在 `docs/35-VISCOSE.md`。
 */
import * as THREE from 'three/webgpu';
import { RING } from '../../../../core/src/tuning.ts';
import { CELL_ASPECT, createAtlas } from './atlas.ts';
import { holdFirstScreen } from './first-screen.ts';
import { MAX_LINKS, MAX_PLANES, createRingMaterial, createRingUniforms } from './sdf.ts';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const HALF_PI = Math.PI / 2;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOutCubic = (x: number): number => 1 - Math.pow(1 - x, 3);
const easeInOutCubic = (x: number): number =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const power2Out = (x: number): number => 1 - (1 - x) * (1 - x);
const power2InOut = (x: number): number =>
  x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;

const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/**
 * 卡片 i 在环上的槽位。扇面从种子往两边交替张开：0, +1, −1, +2, −2…
 * 所以**相邻的下标在环上是分居种子两侧的** —— 任何从下标推位置的地方都要记得这件事
 * （上游为此踩过一次：按下标发图会让每隔一张的项目并排）。
 */
const signedOffset = (i: number): number => (i === 0 ? 0 : i % 2 === 1 ? (i + 1) / 2 : -i / 2);

/** 朝目标松弛的系数。速率按 60fps 写，再按真实帧时间校正，于是任何刷新率下手感一致 */
const chase = (dt: number, rate: number): number => 1 - Math.pow(1 - rate, dt * 60);

/** 扇面第一代开始之前留的那一点 */
const FAN_START = 0.06;

/** 选中之后坍缩 + 涨出画面用多久（毫秒） */
const EXIT_MS = 1100;

/** 时间线驱动的五个数。`layout()` 只读它们，不写 —— 写的只有时间线和输入 */
export interface RingState {
  /** 种子那一张的出生 0..1 */
  progress: number;
  /** 种子从中心骑着半径走出去 0..1 */
  launch: number;
  /** 扇面张开 0..1。**丝的全部戏都在这一段** */
  spread: number;
  /** 环转了多少弧度。入场由时间线开，之后归输入 */
  spin: number;
  /** 舞台位移：环往左挪并放大 0..1 */
  shift: number;
}

export interface FieldOptions {
  /** 唯一的非确定性入口。不给就是不需要随机（这一页目前也确实不需要） */
  random?: () => number;
  /** 中心卡换了一张 */
  onActiveChange?: (index: number) => void;
  /** 点了已经在中间的那张 = "就它" */
  onPick?: (index: number) => void;
  /** 坍缩演完了 */
  onExitDone?: (index: number) => void;
  /** 帧循环死了。它已经自己停了，上层该换一条路 */
  onError?: (error: unknown) => void;
}

export interface RingField {
  /** WebGPU 起来了没有。false = 上层必须降级 */
  readonly ready: Promise<boolean>;
  /** 把卡片交给它。可以在任何阶段调用 —— 剥离之前调等于"剥出来的是这些" */
  setCards(cards: HTMLCanvasElement[]): void;
  /** 展签阶段：种子出生，然后在原地缓慢地转 */
  attract(): void;
  /** 剥离。幂等 */
  play(): void;
  /** 剥离整个跳过，直接到稳态（`prefers-reduced-motion`、以及深链回来的人） */
  skipEntry(): void;
  activeIndex(): number;
  focus(index: number): void;
  step(delta: number): void;
  /**
   * 环此刻收不收输入（= 稳态，入场演完了、还没开始坍缩）。
   *
   * 有它是为了让外部输入（`wave-input.ts` 的举手滚动）在该闭嘴的时候闭嘴，
   * 而不用每帧调 `debug()` —— 后者每次都新建一个对象，那是**帧里 new**（P5）。
   */
  accepting(): boolean;
  /**
   * 外部输入：把一个角速度增量喂进来。**和滚轮走的是同一条路** ——
   * 惯性、阻尼、槽位吸附全部原样复用（`spinStep()`）。
   * 正在拖动 / 正在转场 / 已经坍缩时无效，不会打断它们。
   */
  nudge(delta: number): void;
  /**
   * 外部指针：不是鼠标的那种"有人在摸它"。`amount` 0 = 不在场，1 = 满。
   *
   * 用途只有一个：举手滚动需要一个**在这件作品的语言里**的"我武装了"，
   * 而这一页本来就有那句话 —— 光标处的软化。于是它借用同一套 uniform，
   * 不新增任何可见元素（docs/26 §F）。
   * **真实鼠标永远优先**：手上来了也不会把鼠标顶掉（第 4 条：不许挡住既有输入）。
   */
  reach(x: number, y: number, amount: number): void;
  /** 选中：其余卡片被它吸回去，融成一团，涨出画面。幂等 */
  exit(index: number): void;
  /** 实测帧率（rAF 计数，不是毫秒 —— docs/02 P21） */
  fps(): number;
  /**
   * 冻住时间线。**冻住 = 一步都不走**，不是"走一个很小的步"。
   * 只给取证用；现场永远不调。
   */
  freeze(on: boolean): void;
  /** 按固定步长（1/60 秒）把时间线往前推这么多秒，然后画一帧。取证用 */
  advance(seconds: number): void;
  /**
   * 调参和取证用的读数。**只读**。
   * 有它是因为这个场的每一个可见问题（环跑到屏幕外、卡片比例不对、入场卡在某一段）
   * 在画面上长得一模一样：一片底色。没有这几个数就只能靠猜。
   */
  debug(): {
    phase: 'birth' | 'attract' | 'entry' | 'live' | 'exit';
    fps: number;
    count: number;
    fit: number;
    band: 'wide' | 'narrow' | 'tight';
    /** 卡片长边 / 短边，屏幕 px */
    card: [number, number];
    /** 环半径与环心（屏幕 px，原点在屏幕中心） */
    ring: { r: number; cx: number; cy: number };
    /** 静止间距：两张相邻卡的面之间还剩多少 px。**丝的全部量程就是它** */
    gap: number;
    /** 正面那张卡此刻**交给着色器的那几个数** —— 排查"它明明该在屏幕中央却看不见" */
    front: { plane: number; cell: number; x: number; y: number; sx: number; sy: number };
    state: RingState;
  };
  /**
   * 里面那几个 three 对象。**只给排查用**（上游那个移植版也留了同名的口子）：
   * 这个场没有"半对"的状态 —— 它要么画对，要么画出一片底色，
   * 而一片底色可能是几何、uniform、着色器里的任何一处。有它才能把
   * `renderer.debug.getShaderAsync()` 生成的 WGSL 拉出来对着读。
   */
  readonly internals: {
    renderer: THREE.WebGPURenderer | null;
    scene: THREE.Scene;
    camera: THREE.OrthographicCamera;
    mesh: THREE.Mesh;
    uniforms: ReturnType<typeof createRingUniforms>['u'];
  };
  /** 这一页真正在用的 handler，choose.ts 挂上来 */
  on(options: FieldOptions): void;
  dispose(): void;
  readonly canvas: HTMLCanvasElement;
}

let singleton: RingField | null = null;

/**
 * 拿到那一个场。已经有了就返回同一个 —— **这正是开屏和选择页共用它的方式**。
 * 返回的 handle 立刻可用，WebGPU 的初始化在背后跑，结果在 `ready` 上。
 */
export function acquireRingField(options: FieldOptions = {}): RingField {
  if (!singleton) singleton = createRingField(options);
  else singleton.on(options);
  return singleton;
}

/** 场还在不在（`entry.ts` 判断展签要不要透明底用这个） */
export function ringFieldAlive(): boolean {
  return singleton !== null;
}



function createRingField(initial: FieldOptions): RingField {
  // 要在读颜色之前 hold —— 下面 readVar() 读的就是它翻过来之后的值
  const releaseFirstScreen = holdFirstScreen();

  const canvas = document.createElement('canvas');
  canvas.className = 'sb-ring';
  document.body.appendChild(canvas);

  let hooks: FieldOptions = { ...initial };
  let disposed = false;

  // ── 尺寸与适配 ────────────────────────────────────────────────────────────
  let viewW = Math.max(1, innerWidth);
  let viewH = Math.max(1, innerHeight);
  let fit = 1;
  let planeK = 1;
  let radiusK = 1;
  let narrowNow = false;
  let tightNow = false;

  const refit = (): void => {
    const s = viewW / Math.max(1, RING.refWidth);
    fit = Math.max(RING.minScale, Math.min(RING.maxScale, s));
    narrowNow = viewW <= RING.narrowAt;
    tightNow = viewW <= RING.tightAt;
    // 窄屏不是"整体缩小"，是**重新配比**：卡片长得比弧快，否则缝先合死
    planeK = narrowNow ? RING.narrowPlane : 1;
    radiusK = (narrowNow ? RING.narrowRadius : 1) * (tightNow ? RING.tightRadius : 1);
  };
  refit();

  // ── three ────────────────────────────────────────────────────────────────
  const { u, pos, rot, scale, linkA, linkB, linkPar } = createRingUniforms();
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 100);
  // 图集在卡片到货之前就已经开好（空的）：贴图必须从第一帧起就绑在节点树上，
  // 否则卡片到货时材质要重建 = 重新编译管线 = 展签背后那一团当场卡一下。
  const paperCss = getComputedStyle(document.documentElement)
    .getPropertyValue('--sb-paper').trim() || '#fafafa';
  const atlas = createAtlas(MAX_PLANES, paperCss);
  (u.grid.value as THREE.Vector2).copy(atlas.grid);
  const cardAspect = CELL_ASPECT;
  const material = createRingMaterial(u, atlas.texture);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  let renderer: THREE.WebGPURenderer | null = null;

  /**
   * 颜色从 CSS 变量读，**不在这里写死**（docs/23 §0：度量和颜色一律来自 type.css）。
   * `THREE.Color.setStyle` 顺手把 sRGB 转成线性 —— 着色器在线性空间里算，
   * 渲染器再编码回 sRGB。这是这条链上唯一一次颜色转换。
   */
  const scratch = new THREE.Color();
  const readVar = (name: string, fallback: string, into: THREE.Vector3): void => {
    const css = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    scratch.setStyle(css || fallback);
    into.set(scratch.r, scratch.g, scratch.b);
  };
  readVar('--sb-paper', '#fafafa', u.page.value);
  // 无图阶段（展签背后那一团）用的颜色 = 字色。**一团暗的东西压在浅底上** ——
  // 这正是参考作品关掉贴图时的样子（它的 uColor 是 #0a0a0a），
  // 也是这一段唯一要说的话：这里有一个有重量的东西。
  //
  // 但**展签那一段不能真按满墨画**：上游那一屏上除了这个场什么都没有，
  // 我们这一屏上还压着一个巨题和一整列目录。满墨的一团横在版心上，
  // 就成了页面上对比度最高的东西 —— 实测就是这样，它从目录里横穿过去。
  // 所以墨色留在 `inkFull` 里，每帧按 `launch` 把它掺进纸色（见 layout()）。
  const inkFull = new THREE.Vector3();
  readVar('--sb-ink', '#0a0a0a', inkFull);
  u.color.value.copy(inkFull);

  const resize = (): void => {
    viewW = Math.max(1, innerWidth);
    viewH = Math.max(1, innerHeight);
    refit();
    renderer?.setSize(viewW, viewH);
    camera.left = -viewW / 2;
    camera.right = viewW / 2;
    camera.top = viewH / 2;
    camera.bottom = -viewH / 2;
    camera.updateProjectionMatrix();
    mesh.scale.set(viewW, viewH, 1);
    (u.resolution.value as THREE.Vector2).set(viewW, viewH);
  };
  resize();
  addEventListener('resize', resize);

  // ── 状态 ─────────────────────────────────────────────────────────────────
  const state: RingState = { progress: 0, launch: 0, spread: 0, spin: 0, shift: 0 };
  /** layout 每帧算出来的几何，只给 debug() 读 */
  const info = { W: 0, H: 0, R: 0, cx: 0, cy: 0, gap: 0 };
  /** 出生（种子那一张）。展签一挂上来就跑，不等任何人 */
  let birth = 0;
  /** 剥离的播放头，秒。< 0 = 还没按「开始」 */
  let entryT = -1;
  /** 展签那一段里种子自己转过的角度。见 tick 里的注释 */
  let attractTurn = 0;
  let interactive = false;
  /** 坍缩：被选中的下标，以及 0..1 的进度 */
  let exitIndex = -1;
  let exitT = 0;

  /**
   * 上场几张卡。**初值是 1，不是 0**：卡片还没到货的时候（展签那一段）
   * 上场的正是那一颗种子 —— 它此刻没有图，按 `u.color` 画成一团暗的东西。
   * 给 0 的话 `layout()` 直接返回，展签背后是一片空白，
   * 「同一个场的两个阶段」当场垮掉一半。
   */
  let count = 1;

  // ── 输入 ────────────────────────────────────────────────────────────────
  const ringCentre = { x: 0, y: 0 };
  let frontAngle = 0;
  let spinVel = 0;
  let dragging = false;
  let dragPrevAngle = 0;
  let dragPrevTime = 0;
  let settling = false;
  let snapTo = 0;
  let snapCap = 0;
  /** 点一张非中心卡 → 把环转过去。这期间惯性整个让位，两者不能同时驱动 spin */
  let picking = false;
  let pickFrom = 0;
  let pickTo = 0;
  let pickT = 0;
  let pickDur = 0;
  let pointerTravel = 0;
  let travelX = 0;
  let travelY = 0;

  const pointer = { x: 0, y: 0, inside: false, seeded: false };
  /** 非鼠标的那只"手"（`reach()`）。amt = 0 时整条不存在 */
  const ghost = { x: 0, y: 0, amt: 0, seeded: false };
  const cursor = { x: 0, y: 0, amt: 0, wake: 0 };
  let coarse = false;

  // ── 每卡状态（全部预分配）───────────────────────────────────────────────
  const travel = new Float32Array(MAX_PLANES);
  const cum = new Float32Array(MAX_PLANES);
  const order: number[] = [];
  /** 没有光标时每张卡会在哪。**丝是从这里量的**，所以悬停不会反过来喂给糖浆 */
  const rest = Array.from({ length: MAX_PLANES }, () => new THREE.Vector2());
  const hoverF = new Float32Array(MAX_PLANES);
  const leanX = new Float32Array(MAX_PLANES);
  const leanY = new Float32Array(MAX_PLANES);
  const sideF = new Float32Array(MAX_PLANES);
  const webF = new Float32Array(MAX_LINKS);
  const focusPos = new THREE.Vector2();

  /**
   * 谁穿哪一张图。**按环上的槽位发牌，不是按卡片的下标发。**
   *
   * 卡片是按扇面顺序编号的（0, +1, −1, +2, −2…），所以按下标发牌会把
   * 形态空间里每隔一个的物种排到一起，转一格跳两个名字 —— 而这一页排序的
   * 全部意义正是"相邻的卡在形态图上也相邻"（见 choose.ts 的 morphologyOrder）。
   * 上游为这件事踩过一次坑，把理由写在了 Carousel.jsx 里；这里照它改。
   *
   * 两张表互为反函数：面向观众的一切（中心是谁、键盘选谁、选中了谁）说的都是
   * **卡片下标**，环内部说的都是**平面下标**，翻译只发生在这两张表上。
   */
  const cellOfPlane = new Int32Array(MAX_PLANES);
  const planeOfCell = new Int32Array(MAX_PLANES);
  function deal(): void {
    for (let i = 0; i < count; i++) {
      const slot = signedOffset(i);
      // 取负：环往前转时，正面的槽位是往回走的
      const cell = (((-slot) % count) + count) % count;
      cellOfPlane[i] = cell;
      planeOfCell[cell] = i;
    }
  }

  /** 中心那张的**卡片下标** */
  let shown = -1;
  /** 同一张的平面下标。坍缩要的是它 */
  let shownPlane = -1;
  /**
   * 已经报出去的那一张。和 `shown` 分开，是因为**入场期间不算"经过"**：
   * 时间线自己要把环转一整圈，全报出去的话观众会听到一串根本不是自己碰出来的声音
   *（`ChooseOptions.onPass` 接的就是那一记）。所以只在交互接管之后才报，
   * 接管的那一帧补报一次当前这张。
   */
  let announced = -1;
  let over = -1;

  const swellOf = (i: number): number =>
    Math.max(0.05, 1 + RING.swell * hoverF[i] - RING.sideScale * sideF[i]);

  // ── 剥离时间线 ───────────────────────────────────────────────────────────
  // GSAP 换成六行算术。段与段之间用绝对时间对齐（和上游一样），
  // 因为"舞台位移从展开的七成开始"这种话只有绝对时间说得清。
  const spreadStart = RING.launchTime - 0.15;
  const stageStart = spreadStart + RING.stageAt * RING.spreadTime;
  const entryEnd = Math.max(
    spreadStart + RING.spreadTime,
    stageStart + RING.spinTime,
    stageStart + RING.moveDelay + RING.moveTime,
  );

  const seg = (t: number, at: number, dur: number): number => clamp01((t - at) / Math.max(0.001, dur));

  function advanceEntry(dt: number): void {
    if (entryT < 0) return;
    entryT += dt;
    state.launch = power2InOut(seg(entryT, 0, RING.launchTime));
    state.spread = power2Out(seg(entryT, spreadStart, RING.spreadTime));
    state.shift = power2InOut(seg(entryT, stageStart + RING.moveDelay, RING.moveTime));
    if (!interactive) {
      // 入场期间 spin 由时间线开（一整圈），交互接管之后就再也不碰它
      state.spin = power2InOut(seg(entryT, stageStart, RING.spinTime)) * RING.spinTurns * TAU;
      if (entryT >= entryEnd) interactive = true;
    }
  }

  // ── 排布：每帧一次，把 CPU 端的状态写进 uniform ───────────────────────────
  function layout(dt: number): void {
    u.count.value = count;
    if (count === 0) return;

    const step = TAU / count;
    const spread = clamp01(state.spread);

    const endScale = narrowNow ? RING.narrowEndScale : RING.endScale;
    const posX = tightNow ? RING.tightPosX : narrowNow ? RING.narrowPosX : RING.posX;

    // 舞台变换。所有以"卡片 px"计的量都过 g，所以窗口适配只在这一处
    const shift = clamp01(state.shift);
    const g = (1 + (endScale - 1) * shift) * fit;
    const cx = posX * viewW * 0.5 * shift;
    const cy = RING.posY * viewH * 0.5 * shift;

    ringCentre.x = viewW * 0.5 + cx;
    ringCentre.y = viewH * 0.5 - cy;
    // 环心、这张卡、屏幕中心三点一线时这张卡朝向正面。
    // 舞台还没移动时没有"正面"，用三点钟顶上。
    frontAngle = cx !== 0 || cy !== 0 ? Math.atan2(-cy, -cx) : 0;

    // 凡是以"卡片长边"为单位的量（悬停半径、丝的半径、让路的衰减）都从 W 来，
    // 于是窄屏那一档的加成自动惠及它们
    const W = RING.planeSize * planeK * g;
    const H = W / cardAspect;
    (u.size.value as THREE.Vector2).set(W, H);
    // 跟着卡片走，不跟着窗口：圆角一样大而卡片大了一圈，那是另一种形状的卡
    u.radius.value = RING.radius * planeK * g;

    // 长边朝外，所以一张卡伸向邻居的是短轴，对着邻居的是长边
    const sepExtent = H;
    const faceEdge = W;

    const R = RING.ringRadius * radiusK * g;
    const restingGap = 2 * R * Math.sin(step / 2) - sepExtent;
    const finalSep = Math.max(1, restingGap);
    info.W = Math.round(W);
    info.H = Math.round(H);
    info.R = Math.round(R);
    info.cx = Math.round(cx);
    info.cy = Math.round(cy);
    info.gap = Math.round(restingGap);

    // 每一代都在飞，只差一个小相位 —— 这是一次连续的剥离，不是一队各自弹出的卡
    const maxN = Math.max(1, Math.abs(signedOffset(count - 1)));
    const dur = Math.max(0.1, 1 - FAN_START - RING.stagger);
    cum[0] = 0;
    for (let n = 1; n <= maxN; n++) {
      const start = FAN_START + ((n - 1) / maxN) * RING.stagger;
      const t = clamp01((spread - start) / dur);
      const e = t * t * (3 - 2 * t);
      travel[n] = e;
      // 累加：还没出生的卡精确地叠在它的母卡上，然后一个槽位一个槽位地被剥出来
      cum[n] = cum[n - 1] + e;
    }

    const seedAngle = RING.seed * DEG;
    // 种子在中心平着出生，然后骑着半径走出去。写成半径而不是给卡片 0 加一个偏移，
    // 是为了让时间线来回擦洗时保持一致 —— 反正未出生的卡是叠在种子上的。
    const launch = easeInOutCubic(clamp01(state.launch));
    const Rnow = R * launch;
    /** 1 = 还在展签那一段，0 = 已经在剥离了 */
    const attractWeight = 1 - launch;

    order.length = 0;

    const track = cursor.amt > 0.001;
    const reach = Math.max(1, RING.reach * W);
    const sideReach = Math.max(1, RING.sideReach * W);
    // 不对称是**故意的**：拿起来快、放下去慢。两个速率相等读作机械跟随，
    // 它们之间的差才读作有什么粘稠的东西被拖着走。
    const kRise = chase(dt, RING.grab);
    const kFall = chase(dt, RING.release);

    let frontI = -1;
    let frontD = 1e9;

    const probe = pointer.inside && pointer.seeded && interactive && exitIndex < 0;
    let overI = -1;
    const focusI = track ? over : -1;

    // 坍缩：其余卡片被选中的那张吸回去。**复用的是同一套融合**——
    // 位置一靠近，smin 自己就把它们焊成一团，丝也自己变短变粗。
    const collapse = exitIndex >= 0 ? easeOutCubic(clamp01(exitT / 0.75)) : 0;
    const swallow = exitIndex >= 0 ? clamp01((exitT - 0.55) / 0.45) : 0;

    for (let i = 0; i < count; i++) {
      const sIdx = signedOffset(i);
      const n = Math.abs(sIdx);
      const uu = i === 0 ? clamp01(state.progress) : travel[n];

      const angle = seedAngle + Math.sign(sIdx) * step * cum[n] + state.spin;
      let px = Math.cos(angle) * Rnow + cx;
      let py = Math.sin(angle) * Rnow + cy;
      rest[i].set(px, py);

      const da = angle - frontAngle;
      const toFront = Math.abs(Math.atan2(Math.sin(da), Math.cos(da)));
      if (toFront < frontD) {
        frontD = toFront;
        frontI = i;
      }

      // 朝光标倾斜。乘 uu 让还没出生的卡别掺和：它们叠在母卡上，
      // 不乘的话整摞会一起倾，把种子从环上拽下来。
      let f = 0;
      let toX = 0;
      let toY = 0;
      if (track) {
        const dx = cursor.x - px;
        const dy = cursor.y - py;
        const dist = Math.hypot(dx, dy);
        f = smoothstep(reach, reach * 0.22, dist) * cursor.amt * uu;
        if (f > 0.0001 && dist > 0.0001) {
          const lean = (RING.pull * fit * f) / dist;
          toX = dx * lean;
          toY = dy * lean;
        }
      }
      const kk = f > hoverF[i] ? kRise : kFall;
      hoverF[i] += (f - hoverF[i]) * kk;
      leanX[i] += (toX - leanX[i]) * kk;
      leanY[i] += (toY - leanY[i]) * kk;

      // 让路。从**被悬停的那张卡**量，不是从光标量，
      // 这样光标在那张卡里面移动时，周围的反应是稳的。
      let sf = 0;
      if (focusI >= 0 && i !== focusI) {
        const dd = Math.hypot(focusPos.x - px, focusPos.y - py);
        sf = smoothstep(sideReach, sideReach * 0.2, dd) * uu;
      }
      sideF[i] += (sf - sideF[i]) * (sf > sideF[i] ? kRise : kFall);

      let pushX = 0;
      let pushY = 0;
      if (sideF[i] > 0.0001) {
        const dx = px - focusPos.x;
        const dy = py - focusPos.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.0001) {
          const away = (RING.sidePush * fit * sideF[i]) / dist;
          pushX = dx * away;
          pushY = dy * away;
        }
      }

      // 坍缩把每张卡拉向被选中的那张的静止位置
      if (collapse > 0 && exitIndex >= 0 && i !== exitIndex) {
        px += (rest[exitIndex].x - px) * collapse;
        py += (rest[exitIndex].y - py) * collapse;
      }

      pos[i].set(px + leanX[i] + pushX, py + leanY[i] + pushY);
      // launch 一起来，展签那段的自转就让位给"长边朝外"
      rot[i] = angle * launch + attractTurn * attractWeight;

      // 种子在整个出生过程中长大；其余的早就在母卡里成形了，
      // 所以很早就到全尺寸，剩下的行程全用来往外扯。
      const sx = i === 0 ? easeOutCubic(clamp01(uu / 0.7)) : easeOutCubic(clamp01(uu / 0.34));
      const sy = i === 0
        ? easeOutCubic(clamp01((uu - 0.18) / 0.74))
        : easeOutCubic(clamp01((uu - 0.06) / 0.36));
      const sw = swellOf(i);

      // 被选中的那张最后涨出画面；其余的在同一段时间里暗下去 ——
      // 不是"淡出"，是被吞掉：它们的形还在，只是没有光了。
      const eat = i === exitIndex
        ? 1 + swallow * (Math.max(viewW, viewH) * 1.6) / Math.max(1, W)
        : 1;
      const dim = (1 - RING.sideDim * sideF[i]) * (i === exitIndex ? 1 : 1 - swallow);

      // 展签那一段把长边收到和短边一样长。**只有这一段**：`attractWeight` 一旦
      // 归零，`squash` 就是 1，这一行逐字等于原来的 `sx`，卡片恢复它自己的 2:1。
      //
      // 理由和上面那个 `u.round` 是同一条 —— 卡是 2:1，光把圆角推满只能得到一枚
      // 胶囊，而胶囊仍然读作"一个横躺的物件"。要读成"一团"，长短边得先一样长。
      // 收的倍数是 `H / W`（就是 1/cardAspect），不是一个手调的数：
      // 换了卡片比例它自动还是正方，不需要有人记得回来改。
      const squash = 1 + (H / W - 1) * attractWeight;
      scale[i].set(sx * squash * sw * eat, sy * sw * eat, dim, cellOfPlane[i]);

      // 和着色器画的是同一个盒，在卡片自己的坐标系里测 —— 于是它回答的是
      // 这张卡**此刻真实的样子**：转过的、倾过的、胀过的。
      // 环一旦成形卡片就不会重叠，所以第一次命中就是唯一一次。
      if (probe && overI < 0) {
        const qx = cursor.x - pos[i].x;
        const qy = cursor.y - pos[i].y;
        const cr = Math.cos(rot[i]);
        const sr = Math.sin(rot[i]);
        if (
          Math.abs(qx * cr + qy * sr) <= W * 0.5 * sx * sw &&
          Math.abs(-qx * sr + qy * cr) <= H * 0.5 * sy * sw
        ) {
          overI = i;
        }
      }

      order.push(i);
    }

    for (let i = count; i < MAX_PLANES; i++) {
      scale[i].set(0, 0, 1, 0);
      hoverF[i] = 0;
      leanX[i] = 0;
      leanY[i] = 0;
      sideF[i] = 0;
    }

    over = overI;
    if (over >= 0) focusPos.copy(rest[over]);

    // 只记下来，不在这里上报 —— 上报的门槛在 tick 里（见 `announced`）。
    // 记的是**卡片下标**：外面（HUD、声音、选中）问的从来不是"第几个平面"。
    if (frontI >= 0) { shownPlane = frontI; shown = cellOfPlane[frontI]; }

    // ── 糖浆 ────────────────────────────────────────────────────────────
    // 一对母子一条丝，按环上的顺序。扇面还在张开的时候**故意不连成圈**：
    // 首尾那两张从来没有融在一起过，它们之间没有东西可拉。
    order.sort((a, b) => signedOffset(a) - signedOffset(b));

    const edgeHalf = faceEdge * 0.5 * RING.thread;
    const closed = spread > 0.995 && count > 2;
    const linkCount = Math.min(closed ? count : count - 1, MAX_LINKS);

    for (let l = 0; l < linkCount; l++) {
      const ia = order[l];
      const ib = order[(l + 1) % count];
      const ca = pos[ia];
      const cb = pos[ib];

      // 从**静止**中心和出生缩放量，不用悬停之后的。剥离对分离度的反应陡得吓人 ——
      // 差几个百分点就已经是一块板 —— 放倾斜和胀大进来，一次悬停会把接缝变成拼图。
      const shrinkA = scale[ia].y / swellOf(ia);
      const shrinkB = scale[ib].y / swellOf(ib);
      const sep = rest[ia].distanceTo(rest[ib]) - sepExtent * 0.5 * (shrinkA + shrinkB);
      // 0 = 两个面还贴着，1 = 落到静止间距
      const v = clamp01(sep / finalSep) * (1 - collapse);

      // 悬停挂的是**自己那条曲线上**的丝，所以能调成一根细丝，
      // 而不是继承剥离那一块板。取在缝的中点：最强的拉扯正该落在两张卡之间。
      let fl = 0;
      if (track && RING.web > 0.0001) {
        const mx = (ca.x + cb.x) * 0.5;
        const my = (ca.y + cb.y) * 0.5;
        const webReach = Math.max(1, RING.webReach * W);
        const dd = Math.hypot(cursor.x - mx, cursor.y - my);
        fl = smoothstep(webReach, webReach * 0.15, dd) * cursor.amt;
      }
      webF[l] += (fl - webF[l]) * (fl > webF[l] ? kRise : kFall);

      const w = Math.max(Math.pow(1 - v, RING.thin), RING.web * webF[l]);
      const rEnd = edgeHalf * w - RING.dissolve;
      const rMid = rEnd * (1 - (1 - RING.pinch) * smoothstep(0, 0.7, v));

      linkA[l].copy(ca);
      linkB[l].copy(cb);
      linkPar[l].set(
        rEnd,
        rMid,
        RING.sag * g * Math.pow(v, 1.5),
        // 每条丝各算各的：几代同时在飞，它们的阶段都不一样。永远不比它要圆的那个颈还宽。
        Math.min(RING.fillet * g * smoothstep(0, 0.35, v), Math.max(rMid, 0) * 1.5),
      );
    }
    for (let l = linkCount; l < MAX_LINKS; l++) linkPar[l].set(-100, -100, 0, 0);
    u.linkCount.value = linkCount;

    // 两个都是距离场里的 px，所以必须跟着环一起缩放，
    // 否则换个窗口大小，融合读起来就是另一种材料了
    u.k.value = RING.goo * planeK * fit * (1 + collapse * 3);
    // 出生时的表面张力抖动；展签那一段留一点，让那团东西自己**呼吸**
    //（上游没有这一段 —— 它在这里等图的时候是完全静止的一颗种子）
    u.wobble.value = RING.wobble * fit * Math.max(
      1 - smoothstep(0.2, 0.95, state.progress),
      attractWeight * 0.6,
    );
    // 展签那一段：形状按回圆、颜色掺淡。两个量都由 `launch` 一路交还给卡片，
    // 所以「开始」按下去之后**同一个动作里**那团东西一边硬成卡一边吃满墨。
    // 两条线共用 `attractWeight` 而不是各配一个时间轴：它们说的是同一件事。
    u.round.value = RING.attractRound * attractWeight;
    const ink = RING.attractInk + (1 - RING.attractInk) * launch;
    u.color.value.set(
      u.page.value.x + (inkFull.x - u.page.value.x) * ink,
      u.page.value.y + (inkFull.y - u.page.value.y) * ink,
      u.page.value.z + (inkFull.z - u.page.value.z) * ink,
    );
    u.textured.value = atlasReady ? 1 : 0;
    u.blend.value = Math.max(0.5, RING.blend * planeK * g);

    (u.glass.value as THREE.Vector4).set(RING.refract, RING.squeeze, RING.ripple, RING.rippleFreq);
    u.bandTop.value = RING.bandTop * viewH;
    u.bandBottom.value = RING.bandBottom * viewH;
    u.fringe.value = RING.fringe;
    u.sheen.value = RING.sheen;
  }

  function updatePointer(dt: number): void {
    // 入场没演完之前不让光标动手：时间线还在画这个环
    const mouseLive = pointer.inside && pointer.seeded && interactive && exitIndex < 0;
    // 手（`reach()`）只在鼠标不在场时说话 —— **真实指针永远优先**。
    // 反过来的话，一个凑近看的人会把正在用鼠标的人的软化抢走。
    const handLive = !mouseLive && ghost.amt > 0.001 && interactive && exitIndex < 0;
    const want = mouseLive ? 1 : handLive ? ghost.amt : 0;
    cursor.amt += (want - cursor.amt) * chase(dt, 0.12);

    // 没有手的时候**逐字还是原来那行**（追 `pointer`，不管 live 与否）：
    // 入场那几秒 `interactive` 还是 false，但光标必须一直在追指针 ——
    // 否则交互一接管，软化会从屏幕另一头横扫过整个环（`pointer.seeded` 挡的就是这个）。
    const toX = handLive ? ghost.x : pointer.x;
    const toY = handLive ? ghost.y : pointer.y;
    const k = chase(dt, RING.lag);
    cursor.x += (toX - cursor.x) * k;
    cursor.y += (toY - cursor.y) * k;

    // 它落在真实指针后面多远，就是"多快"的替身。起得猛、落得慢，
    // 于是尾波比制造它的那个动作活得更久。
    const trail = Math.hypot(toX - cursor.x, toY - cursor.y);
    cursor.wake = Math.max(
      cursor.wake * Math.pow(0.94, dt * 60),
      clamp01(trail / (Math.max(dt, 0.001) * 2600)),
    );

    (u.mouse.value as THREE.Vector4).set(cursor.x, cursor.y, cursor.amt, RING.melt * fit);
    (u.melt.value as THREE.Vector4).set(
      RING.meltReach * fit,
      RING.wave * fit * cursor.wake * cursor.amt,
      RING.waveFreq,
      RING.waveSpeed,
    );
  }

  // ── 惯性与吸附 ───────────────────────────────────────────────────────────
  function spinStep(dt: number): void {
    if (!interactive || dragging || picking || exitIndex >= 0) return;
    state.spin += spinVel * dt;
    spinVel *= Math.pow(RING.damping, dt * 60);

    let off = 0;
    const slot = TAU / Math.max(1, count);
    const decay = Math.max(0.01, -Math.log(RING.damping) * 60);
    // 甩出去的那一下先不管，快停了才接管。接管的门槛不能低于"还剩半个槽位滑行"
    // 的那个速度：高于它，要去的槽位还在前面，收尾只会继续向前；
    // 晚于它就得往回倒，而往回倒是唯一一种看起来坏掉的收尾。
    const engage = Math.max(RING.snapFrom, decay * slot * 0.5);
    const rate = 4.8 / Math.max(0.05, RING.snapTime);

    if (!settling && Math.abs(spinVel) < engage) {
      const coast = state.spin + spinVel / decay;
      const phase = RING.seed * DEG - frontAngle;
      snapTo = Math.round((coast + phase) / slot) * slot - phase;
      snapCap = Math.max(Math.abs(spinVel), slot * 0.5 * rate);
      settling = true;
    }
    if (settling) {
      off = snapTo - state.spin;
      // 速度正比于剩下的距离：指数收尾，正好停死在槽位上。
      // 把速度绑在距离上就不可能过冲，而过冲会读成"咔"一下而不是滑进去。
      const aim = Math.max(-snapCap, Math.min(snapCap, off * rate));
      spinVel += (aim - spinVel) * clamp01(rate * dt);
    }

    // 停稳。不收的话最后那百分之一度会永远爬下去
    if (Math.abs(spinVel) < 0.0015 && Math.abs(off) < 0.0008) {
      spinVel = 0;
      state.spin += off;
    }
  }

  function pickStep(dt: number): void {
    if (!picking) return;
    pickT += dt;
    const t = clamp01(pickT / pickDur);
    state.spin = pickFrom + (pickTo - pickFrom) * easeInOutCubic(t);
    if (t >= 1) picking = false;
  }

  /** 把环转到**平面** index 面向正面 */
  function goToPlane(index: number): void {
    if (count === 0) return;
    const slot = TAU / count;
    const base = frontAngle - RING.seed * DEG - signedOffset(index) * slot;
    // 最近的等价绕数，走近路而不是把整圈解开
    const target = base + Math.round((state.spin - base) / TAU) * TAU;
    const slots = Math.abs(target - state.spin) / slot;
    if (slots < 0.01) return;
    spinVel = 0;
    settling = false;
    picking = true;
    pickFrom = state.spin;
    pickTo = target;
    pickT = 0;
    // 开方而不是线性：隔了八个槽位的卡该比邻居久，但不该久八倍
    pickDur = RING.pickTime * Math.sqrt(Math.max(1, slots));
  }

  // ── 指针事件 ─────────────────────────────────────────────────────────────
  const trackPointer = (e: PointerEvent): void => {
    coarse = e.pointerType === 'touch';
    pointer.x = e.clientX - viewW * 0.5;
    pointer.y = viewH * 0.5 - e.clientY;
    pointer.inside = true;
    // 不这么做的话，第一次移动会把软化从光标上次停的地方一路扫过整个环
    if (!pointer.seeded) {
      pointer.seeded = true;
      cursor.x = pointer.x;
      cursor.y = pointer.y;
    }
  };
  const pointerAngle = (e: PointerEvent): number =>
    Math.atan2(-(e.clientY - ringCentre.y), e.clientX - ringCentre.x);

  /**
   * 所有"推一把"的输入都从这里进：滚轮、触控板、以及举手滚动（`wave-input.ts`）。
   * 一条路而不是两条，是为了让惯性 / 阻尼 / 吸附对它们**一模一样**。
   *
   * 拖动**不**在这里挡：滚轮原来就不挡它（拖动每帧会把 spinVel 直接覆盖掉，
   * 所以那是一次无害的加法）。把手势挡在拖动之外的是 `accepting()`。
   */
  const nudge = (delta: number): void => {
    if (!interactive || exitIndex >= 0) return;
    if (!Number.isFinite(delta) || delta === 0) return;
    picking = false;
    settling = false;
    spinVel += delta;
    spinVel = Math.max(-RING.maxSpeed, Math.min(RING.maxSpeed, spinVel));
  };

  const onWheel = (e: WheelEvent): void => {
    if (!interactive || exitIndex >= 0) return;
    e.preventDefault();
    // 触控板也会给横向的量，取占优的那一个
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    nudge(d * RING.scrollSpeed);
  };
  const onPointerDown = (e: PointerEvent): void => {
    pointerTravel = 0;
    travelX = e.clientX;
    travelY = e.clientY;
    trackPointer(e);
    if (!interactive || exitIndex >= 0) return;
    picking = false;
    dragging = true;
    settling = false;
    spinVel = 0;
    dragPrevAngle = pointerAngle(e);
    dragPrevTime = performance.now();
    canvas.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent): void => {
    trackPointer(e);
    // 用坐标算而不是 movementX/Y：后者在 Safari 的触摸事件里恒为 0，
    // 于是每一次滑动都会被读成一次点击
    pointerTravel += Math.abs(e.clientX - travelX) + Math.abs(e.clientY - travelY);
    travelX = e.clientX;
    travelY = e.clientY;
    if (!dragging) return;
    const a = pointerAngle(e);
    let delta = a - dragPrevAngle;
    if (delta > Math.PI) delta -= TAU;
    if (delta < -Math.PI) delta += TAU;
    const turn = delta * RING.dragSpeed;
    state.spin += turn;
    const now = performance.now();
    spinVel = turn / (Math.max(8, now - dragPrevTime) / 1000);
    dragPrevAngle = a;
    dragPrevTime = now;
  };
  const onPointerUp = (e: PointerEvent): void => {
    trackPointer(e);
    if (!dragging) return;
    dragging = false;
    canvas.releasePointerCapture?.(e.pointerId);
  };
  const onPointerLeave = (): void => { pointer.inside = false; };
  const onClick = (): void => {
    if (!interactive || pointerTravel >= 5 || over < 0 || exitIndex >= 0) return;
    // 点中间那张 = 确认；点别的 = 把它转到中间。
    // 现场单击任意卡就确认太容易误触（这条是我们的，不是上游的）。
    if (over === shownPlane) hooks.onPick?.(cellOfPlane[over]);
    else goToPlane(over);
  };

  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('click', onClick);

  // ── 帧 ──────────────────────────────────────────────────────────────────
  let atlasReady = false;
  /** 有人按过「开始」了。真正开剥还要等卡片（见 tick） */
  let playWanted = false;
  let waitingForCards = 0;
  let prevT = performance.now();
  /** 时间线自己的秒表。**不读墙钟** —— 见 `simulate()` */
  let clock = 0;
  let frozen = false;
  /** rAF 计数的实测帧率。**不是毫秒**（docs/02 P21） */
  let fpsFrames = 0;
  let fpsSince = prevT;
  let fpsValue = 0;
  let exitDoneSent = false;

  /**
   * 推进一步。**只算，不画** —— 画在 `tick()` 和 `advance()` 里各自收口。
   * 分出来是为了 `advance()`：取证截图必须能按固定步长把时间线走到一个
   * **说得出名字的时刻**，而不是"等 1.4 秒然后希望它在那儿"
   *（docs/02 P21：一个悄悄推进的暂停键比没有暂停键更糟）。
   */
  function simulate(dt: number): void {
      clock += dt;
      u.time.value = clock;

      if (birth < 1) birth = clamp01(birth + dt / 1.2);
      state.progress = power2Out(birth);

      // 剥离的闸门：**卡片到齐的那一帧才开始剥**（上游那条"计数器就是闸门"）。
      // 没到齐就剥，剥出来的是一圈空白卡 —— 那比多等一秒难看得多。
      // 但也不能无限等：4 秒还没来就照剥，无图的剪影本身也是成立的一种样子。
      if (playWanted && entryT < 0 && birth >= 1) {
        waitingForCards += dt;
        if (atlasReady || waitingForCards > 4) entryT = 0;
      }

      // 展签阶段：那一团绕着自己慢慢转。**很慢** —— 它说的是"活的"，不是"来玩我"。
      // 转的是 `attractTurn` 而不是 `state.spin`：后者归入场时间线管，
      // 剥离一开始就会被 tween 覆盖，那一下会看成"啪"地跳回去。
      // 这一个量只增不减，由 `launch` 把它的权重淡掉，于是交接是连续的。
      if (entryT < 0 && birth >= 1) attractTurn += RING.attractSpin * dt;
      advanceEntry(dt);
      spinStep(dt);
      pickStep(dt);

      if (exitIndex >= 0) {
        exitT = clamp01(exitT + (dt * 1000) / EXIT_MS);
        if (exitT >= 1 && !exitDoneSent) {
          exitDoneSent = true;
          hooks.onExitDone?.(cellOfPlane[exitIndex]);
        }
      }

      updatePointer(dt);
      layout(dt);

      // 中心卡换了 —— 只有交互接管之后才算数，见 `announced`
      if (interactive && shown >= 0 && shown !== announced) {
        announced = shown;
        hooks.onActiveChange?.(shown);
      }
  }

  function tick(): void {
    if (disposed || !renderer) return;
    try {
      const now = performance.now();
      // 钳住：切回一个后台标签页会给出好几秒的 dt
      const dt = Math.min(0.05, (now - prevT) / 1000);
      prevT = now;

      fpsFrames++;
      if (now - fpsSince >= 500) {
        fpsValue = (fpsFrames * 1000) / (now - fpsSince);
        fpsFrames = 0;
        fpsSince = now;
      }

      // frozen 时**一步都不走**（不是走一个很小的步）。P21 里那条踩过的坑
      // 就是"暂停"其实每帧还在推进 1/240 秒，于是截出来的"中间帧"是终态。
      simulate(frozen ? 0 : dt);
      renderer.render(scene, camera);
    } catch (error) {
      // 帧循环不许抛（docs/02 P2）。自己停下来，把事交回上层。
      renderer.setAnimationLoop(null);
      disposed = true;
      hooks.onError?.(error);
    }
  }

  const ready = (async (): Promise<boolean> => {
    try {
      const r = new THREE.WebGPURenderer({ antialias: true, canvas });
      r.setPixelRatio(Math.min(devicePixelRatio, 2));
      r.setSize(viewW, viewH);
      await r.init();
      if (disposed) { r.dispose(); return false; }
      renderer = r;
      resize();
      r.setAnimationLoop(tick);
      return true;
    } catch (error) {
      hooks.onError?.(error);
      return false;
    }
  })();

  const handle: RingField = {
    ready,
    canvas,
    setCards(cards) {
      if (cards.length === 0) return;
      // 同一张贴图重画，不换对象 —— 见 atlas.ts 的文件头
      atlas.paint(cards);
      count = Math.min(cards.length, MAX_PLANES);
      deal();
      atlasReady = true;
    },
    attract() {
      entryT = -1;
      playWanted = false;
      interactive = false;
    },
    play() {
      playWanted = true;
    },
    skipEntry() {
      playWanted = true;
      entryT = entryEnd;
      birth = 1;
      state.progress = 1;
      interactive = true;
    },
    activeIndex: () => (shown >= 0 ? shown : 0),
    focus(index) { goToPlane(planeOfCell[((index % Math.max(1, count)) + count) % Math.max(1, count)]); },
    step(delta) {
      const next = ((shown >= 0 ? shown : 0) + delta + count) % Math.max(1, count);
      goToPlane(planeOfCell[next]);
    },
    // 拖动中也算"不收"：手和鼠标同时在动时，鼠标说了算（第 4 条）
    accepting: () => interactive && exitIndex < 0 && !dragging,
    nudge,
    reach(x, y, amount) {
      const a = Number.isFinite(amount) ? clamp01(amount) : 0;
      if (a <= 0) {
        ghost.amt = 0;
        ghost.seeded = false;
        return;
      }
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      // 和 `pointer.seeded` 同一个理由：第一帧直接落位，否则软化会从上一个位置
      // （可能是屏幕另一头的鼠标）一路横扫过整个环
      if (!ghost.seeded) {
        ghost.seeded = true;
        if (!pointer.seeded) {
          cursor.x = x;
          cursor.y = y;
        }
      }
      ghost.x = x;
      ghost.y = y;
      ghost.amt = a;
    },
    exit(index) {
      if (exitIndex >= 0) return;
      exitIndex = planeOfCell[((index % Math.max(1, count)) + count) % Math.max(1, count)];
      exitT = 0;
      interactive = false;
    },
    fps: () => fpsValue,
    get internals() { return { renderer, scene, camera, mesh, uniforms: u }; },
    freeze(on) { frozen = on; },
    advance(seconds) {
      const step = 1 / 60;
      let left = Math.max(0, seconds);
      // 上限挡住手滑：advance(1e9) 会把页面锁死，而它读起来像"跳到最后"
      let guard = 60 * 120;
      while (left > 1e-6 && guard-- > 0) {
        const dt = Math.min(step, left);
        simulate(dt);
        left -= dt;
      }
      renderer?.render(scene, camera);
    },
    debug: () => ({
      phase: exitIndex >= 0 ? 'exit'
        : interactive ? 'live'
        : entryT >= 0 ? 'entry'
        : birth < 1 ? 'birth' : 'attract',
      fps: fpsValue,
      count,
      fit,
      band: tightNow ? 'tight' : narrowNow ? 'narrow' : 'wide',
      card: [info.W, info.H],
      ring: { r: info.R, cx: info.cx, cy: info.cy },
      gap: info.gap,
      front: {
        plane: shownPlane,
        cell: shown,
        x: Math.round(pos[Math.max(0, shownPlane)].x),
        y: Math.round(pos[Math.max(0, shownPlane)].y),
        sx: Number(scale[Math.max(0, shownPlane)].x.toFixed(3)),
        sy: Number(scale[Math.max(0, shownPlane)].y.toFixed(3)),
      },
      state: { ...state },
    }),
    on(options) { hooks = { ...hooks, ...options }; },
    dispose() {
      if (disposed) return;
      disposed = true;
      renderer?.setAnimationLoop(null);
      removeEventListener('resize', resize);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('click', onClick);
      releaseFirstScreen();
      mesh.geometry.dispose();
      material.dispose();
      atlas.dispose();
      renderer?.dispose();
      canvas.remove();
      if (singleton === handle) singleton = null;
    },
  };

  return handle;
}
