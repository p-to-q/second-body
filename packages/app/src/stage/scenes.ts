/**
 * 场景：四套**完整的视觉世界**（天幕 / 地面 / 布光 / 雾 / 后期 / 粒子一整组）。
 * 纯函数、不 import three，和 `look.ts` 一样能被单元测试量住。
 *
 * ── 为什么不放进 `core/tuning.ts` ─────────────────────────────────────────
 * P0 说"现场要调的数集中一处"，所以第一直觉是放 tuning。但场景不是一组数，
 * 它是**一个作用在 `LookProfile` 上的函数**：它要知道 `RGB` 是线性的、要知道
 * `keyIntensity` 和 `bloomStrength` 是什么关系。而 `packages/core` 被明令
 * 不许知道渲染（AGENTS.md 不变量第 3 条）。把它塞进 core 只能退化成一张裸数字表，
 * 那样"这套场景服务于哪种物种"就没地方写了 —— 而那句话才是这个文件的价值。
 * 真正**现场会转的旋钮**（雾密度上限、接触阴影半径这类）仍然在 `tuning.ts`。
 *
 * ── 为什么场景要覆盖在 look 之上，而不是取代它 ────────────────────────────
 * `look.ts` 回答的是"这个**物种**是什么颜色"（palette → 灯的色相与冷暖）；
 * 场景回答的是"这具身体站在**什么地方**"。两者正交：同一个 xeno 放进白展厅和
 * 放进深空，身体的固有色不该变，变的是它周围的世界。
 * 所以这里只覆盖世界那一半，灯的**颜色**仍然由主题说了算，场景只改**强度和几何**。
 *
 * ── 过渡 ──────────────────────────────────────────────────────────────────
 * 所有场景字段都是 number 或 RGB，而 `lerpLook` 已经按字段类型插值 ——
 * 于是换场景直接复用换主题那条 0.7s 的交叉淡入，不需要第二套过渡机制。
 * 这就是为什么这些字段住在 `LookProfile` 里而不是另起一个结构。
 */
import type { LookProfile, RGB } from './look.ts';
import { luminance } from './look.ts';
import type { ThemeDef } from '../../../core/src/types.ts';

export type SceneId = 'gallery' | 'void' | 'tide' | 'backlit';

export interface SceneDef {
  id: SceneId;
  name: string;
  nameEn: string;
  /** 它服务于哪种物种、哪种情绪。**这一句是这个文件存在的理由**，不许省 */
  serves: string;

  // ── 天幕（屏幕空间，不是几何体）──
  /** 天顶色与"身体背后那团晕"的色，都会被主题色温轻微染一下 */
  skyTop: RGB;
  skyGlow: RGB;
  /**
   * 晕心相对身体中心抬多少（× 身体高度）、半径（× 画面高度）、软硬。
   *
   * ⚠️ `glowLift` 有一条**几何下限**，第一轮踩过：相机在眼高 1.58m 水平看出去，
   * 于是**地平线以下都是地面**——画面里"天"只有最上面那 25%。
   * 晕心如果落在胸口（lift ≈ 0.2 → 世界 1.16m），它整团都被地面挡住，
   * 观众一点都看不到。要让晕真的出现在身体背后，晕心必须高过眼高：
   * `centerY + lift × height > 1.58`，对 1.57m 的人形就是 `lift > 0.49`。
   */
  glowLift: number;
  glowRadius: number;
  glowSoft: number;
  /** 天幕跟随主题色相的程度。1 = 完全跟着物种走，0 = 场景说了算 */
  tint: number;

  // ── 大气与地面 ──
  fogDensity: number;
  /** 地面固有色相对主题 groundNear 的倍率 */
  ground: number;
  /** 0 = 彻底不做反射。见 docs/28 §4 —— 不做中间态 */
  groundReflect: number;
  /** 倒影的涟漪幅度。一张不动的镜面读作"抛光地板"，动起来才读作"水" */
  groundRipple: number;
  /**
   * 地面粗糙度（近端/远端）。**别调低。** 低粗糙度不会让地面"像水"，
   * 它只会让三盏平行光在地上各炸出一个镜面斑 —— `wip-tide.png` 左下那团白斑
   * 就是轮廓光的镜面反射，它既不跟身体走也不跟天幕走，纯属噪音。
   * 让地面读作"湿"的是**映出来的那张图**（`groundReflect` 映天幕），不是高光点。
   */
  groundGlossNear: number;
  groundGlossFar: number;

  // ── 灯（颜色仍由主题决定，这里只给强度倍率与方向）──
  key: number;
  fill: number;
  rim: number;
  hemi: number;
  exposure: number;
  keyDir: RGB;
  fillDir: RGB;
  rimDir: RGB;
  /** 投影阴影强度倍率；接触阴影分"大而淡的一摊"和"脚下紧的一圈"两项 */
  shadow: number;
  contact: number;
  contactCore: number;
  contactCoreRadius: number;

  // ── 后期与粒子 ──
  bloom: number;
  ao: number;
  vignette: number;
  grain: number;
  particle: number;
  particleDrift: number;
  /**
   * 粒子尺寸倍率。两个方向都会翻车：1.0（原值）在 1600×900 上一颗只有 ~7px，
   * 乘上 0.35 的基础不透明度后**存不进 8bit**，等于没有；
   * 调到 1.9 又会变成一片圆点，读作"下雪"而不是"地上有一团东西在呼吸"。
   */
  particleSize: number;

  /** 构图：画面中心相对身体再抬多少（× 身体高度） */
  frameLift: number;
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const mul = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const mix = (a: RGB, b: RGB, t: number): RGB =>
  [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * 把一个中性的场景色**染上主题的色相**，但不改它的亮度。
 * 和 `look.ts` 的 `hueFilter` 同一条规矩：颜色是乘上去的，
 * 否则"给天幕一点蓝"会顺手把天幕提亮，现场就没法单独调其中一个了。
 */
function tinted(base: RGB, ref: RGB, w: number): RGB {
  if (w <= 0) return base;
  const lb = Math.max(1e-4, luminance(base));
  const lr = Math.max(1e-4, luminance(ref));
  const norm: RGB = [ref[0] / lr * lb, ref[1] / lr * lb, ref[2] / lr * lb];
  return mix(base, norm, clamp01(w));
}

// ── 四套场景 ────────────────────────────────────────────────────────────────
// 数值的来路写在 docs/28。这里只写"它为什么长这样"。

export const SCENES: Record<SceneId, SceneDef> = {
  /**
   * 白展厅。影棚的无缝背景纸（cyclorama）搬进来：没有地平线、没有角，
   * 光从四面漫过来，**身体唯一的边界是它自己的接触阴影**。
   * 这是四套里唯一敢让画面亮起来的 —— 亮底上一具深色身体的剪影读数最强。
   */
  gallery: {
    id: 'gallery', name: '白展厅', nameEn: 'Gallery',
    serves: '亮而无彩的物种（porcelain / coral / field）。情绪：被展出的标本，'
      + '临床的、无处躲藏的注视 —— 观众和作品之间没有气氛替他们缓冲。',
    skyTop: [0.50, 0.52, 0.56], skyGlow: [0.78, 0.79, 0.81],
    glowLift: 0.72, glowRadius: 1.15, glowSoft: 0.75, tint: 0.25,
    // 白展厅要的是"干净"，但雾不能省：地面盘子的边在 48m，
    // 密度 0.021 时那里只雾掉 64%，剩下 36% 的受光地面就是一条新的地平线。
    // 要让 30m 处就雾到 ~99%（(d·30)² ≈ 5），密度至少 0.074。
    fogDensity: 0.078,
    ground: 5.2, groundReflect: 0, groundRipple: 0, groundGlossNear: 0.96, groundGlossFar: 1.0,
    key: 1.05, fill: 1.5, rim: 0.55, hemi: 2.6, exposure: 0.92,
    // 主光压高：45° 的主光会拖出一条和身高一样长的影子，那正是"人在飘"的来源之一
    keyDir: [1.1, 3.6, 1.5], fillDir: [-2.4, 1.5, 1.9], rimDir: [-0.6, 2.4, -2.2],
    shadow: 0.70, contact: 0.55, contactCore: 0.62, contactCoreRadius: 0.26,
    bloom: 0.5, ao: 1.35, vignette: 1.7, grain: 0.8,
    // 加性混合的粒子在亮底上等于不存在 —— 与其给一个看不见的值，不如明说这套没有粒子
    particle: 0.0, particleDrift: 1, particleSize: 1,
    frameLift: 0.02,
  },

  /**
   * 深空虚无。一束顶光，一圈光池，剩下全是黑。
   * 这是最接近 Universal Everything 那条语言的一套：纯色虚空 + 一个发光体，
   * 没有任何东西和身体争夺注意力。也是暗色物种的默认。
   */
  void: {
    id: 'void', name: '深空', nameEn: 'Void',
    serves: '深色甲壳与工业物种（xeno / industrial / patrol）。情绪：孤立的样本，'
      + '四周没有房间也没有出口 —— 你只能看它，它也只能被看。',
    skyTop: [0.004, 0.005, 0.008], skyGlow: [0.055, 0.062, 0.082],
    // 晕很紧、抬到肩上：它是身体背后的一团光，不是一条地平线
    glowLift: 0.64, glowRadius: 0.62, glowSoft: 1.9, tint: 0.55,
    fogDensity: 0.105,
    ground: 0.30, groundReflect: 0, groundRipple: 0, groundGlossNear: 0.94, groundGlossFar: 1.0,
    key: 1.20, fill: 0.45, rim: 1.55, hemi: 0.22, exposure: 1.06,
    keyDir: [0.9, 4.2, 1.2], fillDir: [-2.4, 1.1, 1.6], rimDir: [-0.9, 1.9, -2.8],
    shadow: 1.0, contact: 0.9, contactCore: 0.95, contactCoreRadius: 0.24,
    bloom: 1.5, ao: 1.2, vignette: 1.5, grain: 1.0,
    particle: 1.9, particleDrift: 0.8, particleSize: 1.5,
    frameLift: 0.0,
  },

  /**
   * 夜色水面。地面是湿的，天幕的晕映在脚下拉出一道亮柱。
   * **这是四套里唯一做地面反射的一套**，而且反射的是天幕不是身体 ——
   * 真的平面反射要再渲一遍场景（draw 17 → ~35，BUDGET 只有 40），
   * 那是 P5 说的"超了就是 bug"。理由与取舍写在 docs/28 §4。
   */
  tide: {
    id: 'tide', name: '夜潮', nameEn: 'Tide',
    serves: '会发光、会流动的物种（coral / glow 类，以及 mass 团块身体）。'
      + '情绪：夜里独自站在没到脚踝的水里 —— 身体第一次有了倒影，也就第一次有了重量。',
    skyTop: [0.004, 0.008, 0.016], skyGlow: [0.52, 0.60, 0.72],
    glowLift: 0.66, glowRadius: 0.40, glowSoft: 1.8, tint: 0.65,
    fogDensity: 0.120,
    ground: 0.22, groundReflect: 0.95, groundRipple: 0.010, groundGlossNear: 0.72, groundGlossFar: 0.92,
    key: 1.0, fill: 0.5, rim: 1.60, hemi: 0.28, exposure: 1.08,
    keyDir: [1.2, 3.8, 1.4], fillDir: [-2.2, 1.0, 1.5], rimDir: [-0.7, 1.4, -2.9],
    // 湿地面上真阴影本来就淡（光被反射走了），但接触那一圈更黑更紧
    shadow: 0.7, contact: 0.7, contactCore: 1.15, contactCoreRadius: 0.20,
    bloom: 1.25, ao: 1.0, vignette: 1.25, grain: 0.9,
    particle: 1.5, particleDrift: 0.55, particleSize: 1.45,
    frameLift: 0.05,
  },

  /**
   * 逆光剪影。身后一块巨大的亮盘，主光几乎关掉，身体只剩一圈轮廓光。
   * 粒子在这一套里第一次真的"有体积"—— 逆光是唯一能让尘埃被看见的布光。
   */
  backlit: {
    id: 'backlit', name: '逆光', nameEn: 'Backlit',
    serves: '机械感强、轮廓好看的物种（humanLike 低的那些：autonomous / wheelleg / patrol）。'
      + '情绪：门开了，那个东西正从光里走出来 —— 你还看不清它是什么。',
    skyTop: [0.010, 0.011, 0.014], skyGlow: [0.62, 0.60, 0.58],
    glowLift: 0.58, glowRadius: 0.56, glowSoft: 2.2, tint: 0.35,
    fogDensity: 0.130,
    ground: 0.30, groundReflect: 0.55, groundRipple: 0, groundGlossNear: 0.85, groundGlossFar: 0.95,
    // key 压到很低是这套的全部：看得见的光几乎都来自身后
    key: 0.28, fill: 0.20, rim: 3.2, hemi: 0.22, exposure: 0.98,
    keyDir: [1.6, 3.4, 1.1], fillDir: [-2.0, 1.2, 1.4], rimDir: [-0.25, 1.15, -3.4],
    shadow: 1.0, contact: 1.0, contactCore: 1.0, contactCoreRadius: 0.26,
    bloom: 1.8, ao: 1.15, vignette: 1.05, grain: 1.0,
    particle: 2.3, particleDrift: 0.7, particleSize: 1.8,
    frameLift: 0.03,
  },
};

export const SCENE_IDS = Object.keys(SCENES) as SceneId[];

export const isSceneId = (x: string | null | undefined): x is SceneId =>
  x !== null && x !== undefined && Object.prototype.hasOwnProperty.call(SCENES, x);

/**
 * 没人指定 `?scene=` 时，按物种挑一套。
 *
 * 规则只有三条，和 `look.ts` 的推导同一套判据（palette 的亮度 + `axes`）——
 * 23 个 roster 条目不可能有 23 个 if，而且现场加一个条目不该回来改这里。
 *
 * @param look 已经从主题推导出来的 look（要的是它算好的 `luma` / `humanLike` 侧写）
 */
export function pickScene(theme: ThemeDef | null | undefined, look: LookProfile): SceneId {
  // 亮而无彩的物种放进深空会直接消失在自己的高光里 —— 它们要亮底
  if (look.luma > 0.30) return 'gallery';
  const humanLike = clamp01(theme?.axes?.humanLike ?? 0.5);
  const lifeLike = clamp01(theme?.axes?.lifeLike ?? 0.5);
  // 像机器 → 逆光（轮廓是它最好看的地方）；像活物 → 夜潮（倒影给它重量）
  if (humanLike < 0.35) return 'backlit';
  if (lifeLike > 0.62) return 'tide';
  return 'void';
}

/**
 * 把一套场景盖到 look 上。**纯函数**：同样的输入永远同样的输出，能被测。
 * 只动"世界"那一半，灯的颜色（= 物种的固有色）原样留着。
 */
export function applyScene(look: LookProfile, scene: SceneDef): LookProfile {
  // 天幕跟着主题的 key 灯染色 —— 用 key 而不是 palette，因为 key 已经是
  // "这个物种被打上光之后的颜色"，天幕跟它走才不会和身体打架
  const skyTop = tinted(scene.skyTop, look.key, scene.tint);
  const skyGlow = tinted(scene.skyGlow, look.key, scene.tint);
  return {
    ...look,
    skyTop,
    skyGlow,
    // 背景布/兜底色仍然要给：渲染不到天幕的那一帧（首帧、建链失败）不能是纯黑
    bgTop: skyTop,
    bgBottom: skyGlow,
    groundNear: mul(look.groundNear, scene.ground),
    groundFar: skyGlow,

    glowLift: scene.glowLift,
    glowRadius: scene.glowRadius,
    glowSoft: scene.glowSoft,
    fogDensity: scene.fogDensity,
    groundReflect: scene.groundReflect,
    groundRipple: scene.groundRipple,
    groundGlossNear: scene.groundGlossNear,
    groundGlossFar: scene.groundGlossFar,

    keyIntensity: look.keyIntensity * scene.key,
    fillIntensity: look.fillIntensity * scene.fill,
    rimIntensity: look.rimIntensity * scene.rim,
    hemiIntensity: look.hemiIntensity * scene.hemi,
    exposure: look.exposure * scene.exposure,
    keyDir: scene.keyDir,
    fillDir: scene.fillDir,
    rimDir: scene.rimDir,

    shadowIntensity: clamp01(look.shadowIntensity * scene.shadow),
    contactStrength: clamp01(look.contactStrength * scene.contact),
    contactCore: clamp01(scene.contactCore),
    contactCoreRadius: scene.contactCoreRadius,

    /**
     * bloom 有硬顶。`look.ts` 的注释写着"上限 0.30"，那是**只有主题没有场景**时的数：
     * 暗主题本来就是 0.25，再乘上逆光那套的 1.8 就到 0.45。
     * 逆光确实需要更多辉光（身后一块亮盘不发晕才奇怪），但再往上就从"被拍下来"
     * 变成"加了滤镜"。0.45 是这条线，`test/scenes.test.ts` 钉住。
     */
    bloomStrength: Math.min(0.45, look.bloomStrength * scene.bloom),
    aoStrength: look.aoStrength * scene.ao,
    vignette: look.vignette * scene.vignette,
    grain: look.grain * scene.grain,
    particleGain: look.particleGain * scene.particle,
    particleDrift: look.particleDrift * scene.particleDrift,
    particleSize: scene.particleSize,
    frameLift: scene.frameLift,
  };
}
