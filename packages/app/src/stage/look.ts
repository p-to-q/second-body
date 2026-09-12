/**
 * 主题 → 一套灯光 / 背景 / 后期数值（docs/12 §6「每个主题一套微调」）。
 *
 * **这个文件不 import three，是纯函数。** 故意的：23 个 roster 条目的气质得能被
 * 单元测试量住（`packages/app/test/look.test.ts`），而不是靠"我在浏览器里看了一眼"。
 *
 * 推导规则只有两条 —— 23 个 if 不可维护，也没人记得住第 17 条为什么长那样：
 *
 *   1. **色温跟着颜料的蓝黄轴走。** 量的是 `b - (r+g)/2`：偏黄的颜料配暖灯
 *      （patrol 的危险黄 → 工业暖黄），偏蓝的配冷灯（xeno 的深甲壳 → 冷蓝）。
 *      用蓝黄轴而不是 HSL 彩度，是因为 HSL 的 s 在**暗色**上会塌掉：
 *      xeno 那身深蓝灰的 s 只有 0.13，跟中性灰分不开，但它的蓝黄轴是明确的正值。
 *   2. **亮而无彩的颜料，灯给冷白。** 这是影棚里真实发生的事：
 *      白瓷在影棚白光下永远偏冷（porcelain），中间调的灰铁在同一盏灯下是中性的
 *      （industrial / field）。判据是「线性亮度高 且 蓝黄轴接近 0」。
 *
 * 色相（不只是色温）只在颜料确实够彩的时候才进灯里，权重 `hueWeight`；
 * 这样 patrol 是"黄"而不只是"暖"，而 industrial 不会被一点点棕味带跑。
 *
 * 其余旋钮（rim 强度、阴影软硬、粒子活跃度）由 `axes` 推：
 *   - `humanLike` 低 = 更像机器 → 更硬更强的轮廓光；
 *   - `lifeLike` 高 = 更像活物 → 更软的主光、更活跃的粒子。
 */
import type { MaterialDef, ThemeDef } from '../../../core/src/types.ts';

/** 线性空间 RGB，0..1（three 的 Color 内部也是线性的） */
export type RGB = [number, number, number];

export interface LookProfile {
  /** 三点光 + 半球光的颜色（线性） */
  key: RGB;
  fill: RGB;
  rim: RGB;
  sky: RGB;
  bounce: RGB;
  /** 地面与背景（线性）。groundFar === bgBottom 是地面无缝接进背景的前提 */
  groundNear: RGB;
  groundFar: RGB;
  bgTop: RGB;
  bgBottom: RGB;
  particle: RGB;
  /** 强度 */
  keyIntensity: number;
  fillIntensity: number;
  rimIntensity: number;
  hemiIntensity: number;
  /** 渲染器曝光 */
  exposure: number;
  /** 后期。轻是关键词：bloom 上限 0.30，AO 上限 0.7 */
  bloomStrength: number;
  bloomThreshold: number;
  aoStrength: number;
  /** 阴影：0=没有，1=全黑；softness 决定 VSM 模糊半径 */
  shadowIntensity: number;
  shadowSoftness: number;
  /** 地面接触阴影（着色器里那团，和真影子叠加）：强度与半径（米） */
  contactStrength: number;
  contactRadius: number;
  /** 粒子：整体亮度与漂移速度 */
  particleGain: number;
  particleDrift: number;

  // ── 以下由 `scenes.ts` 覆盖（**只增不改**：不带场景时这些值等于 T-09 的老行为）──
  // 它们住在 LookProfile 里而不是另起一个结构，只为了一件事：
  // `lerpLook` 已经会按字段类型插值，**场景切换的平滑过渡因此是白送的**，
  // 不用第二套过渡机制，也不会出现"灯已经换了但地面还没换"的半截画面。
  /** 天幕顶色（线性）。天幕是屏幕空间的，不是一个几何体 —— 见 stage.ts 的 skyNode */
  skyTop: RGB;
  /** 身体背后那团晕的颜色（线性）。它取代了原来的"地平线" */
  skyGlow: RGB;
  /** 晕心相对身体中心的高度偏移（× 身体高度）。0 = 身体中心，+0.5 = 头顶 */
  glowLift: number;
  /** 晕的半径（× 画面高度）与软硬（指数，大 = 更集中） */
  glowRadius: number;
  glowSoft: number;
  /** 距离雾密度。地面就是靠它化进天幕的 —— 不再靠"两个材质的颜色正好相等" */
  fogDensity: number;
  /**
   * 地面镜射天幕的强度。**0 = 彻底不做反射**（docs/28 §4：不要中间态）。
   * 反射的是天幕不是身体：天幕的晕正好在身体背后，映在地上就是身体脚下那道亮柱。
   */
  groundReflect: number;
  /** 倒影的涟漪幅度（屏幕空间）。0 = 不动的镜面；只有"夜潮"非零 */
  groundRipple: number;
  /** 地面粗糙度（近/远）。湿地面近端很低，哑光地面近远都接近 1 */
  groundGlossNear: number;
  groundGlossFar: number;
  /** 脚下那一圈紧的接触阴影：强度与半径（米）。**这是"人不再浮着"的那一项** */
  contactCore: number;
  contactCoreRadius: number;
  /** 三盏灯的方向。场景决定布光的几何，主题只决定颜色 */
  keyDir: RGB;
  fillDir: RGB;
  rimDir: RGB;
  /** 后期的暗角与颗粒（原来写死在 POST 里，现在场景可以各要各的） */
  vignette: number;
  grain: number;
  /** 粒子尺寸倍率。原来的 0.016 在 1600×900 上只有 ~7px，远看等于没有 */
  particleSize: number;
  /** 构图：画面中心相对身体再抬多少（× 身体高度），叠加在 FRAMING.centerLift 之上 */
  frameLift: number;
  /** 诊断值 —— 给测试和 HUD 用，不参与渲染 */
  luma: number;
  chroma: number;
  hue: number;
  /** 颜料的蓝黄轴，+1 = 极暖（黄），-1 = 极冷（蓝） */
  temperature: number;
  /** 主光最终的色温位置（含冷白修正） */
  keyTemp: number;
  coolBias: number;
  hueWeight: number;
}

// ── 小工具（没有依赖，别往这里加 three） ────────────────────────────────────

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const mixRgb = (a: RGB, b: RGB, t: number): RGB => [
  lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t),
];

const scaleRgb = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

/** sRGB 0..1 → 线性 0..1（`MaterialDef.baseColor` 是 sRGB，creature.ts 也是这么读的） */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** 相对亮度（线性空间，Rec.709） */
export function luminance(c: RGB): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** sRGB → HSL。色相/彩度在 sRGB 里算更接近"人觉得它有多彩" */
export function rgbToHsl(c: RGB): { h: number; s: number; l: number } {
  const [r, g, b] = c;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 1e-6) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  if (s < 1e-6) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number): number => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

// ── 常量：色温轴的两个极点 ─────────────────────────────────────────────────

/** 冷端（线性）≈ 6500K 以上的天光 */
const COOL: RGB = [0.66, 0.82, 1.0];
/** 暖端（线性）≈ 3200K 的钨丝灯 */
const WARM: RGB = [1.0, 0.87, 0.68];
/** 中性白 */
const NEUTRAL: RGB = [1.0, 1.0, 1.0];

const DEFAULT_ALBEDO: RGB = [0.6, 0.6, 0.6];

/** t ∈ [-1,1] → 一盏灯的颜色。-1 冷 / 0 中性 / +1 暖。**所有灯色都从这里出来。** */
function tempColor(t: number): RGB {
  const x = t < -1 ? -1 : t > 1 ? 1 : t;
  return x >= 0 ? mixRgb(NEUTRAL, WARM, x) : mixRgb(NEUTRAL, COOL, -x);
}

const mulRgb = (a: RGB, b: RGB): RGB => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];

/**
 * 把一个色相做成**滤色片**：亮度归一化之后再按 w 混向白。
 * 色相是乘上去的、不是混上去的 —— 否则给地面上个黄色就把地面提亮了，
 * 亮度和颜色两个旋钮会绞在一起，现场没法单独调其中一个。
 */
function hueFilter(tint: RGB, w: number): RGB {
  const l = Math.max(1e-3, luminance(tint));
  return [
    lerp(1, tint[0] / l, w),
    lerp(1, tint[1] / l, w),
    lerp(1, tint[2] / l, w),
  ];
}

/** palette 里一个 materialId → 它的 sRGB baseColor */
function albedoOf(id: string | undefined, materials: readonly MaterialDef[]): RGB {
  if (!id) return DEFAULT_ALBEDO;
  const m = materials.find((x) => x.id === id);
  if (!m || !Array.isArray(m.baseColor) || m.baseColor.length < 3) return DEFAULT_ALBEDO;
  const c = m.baseColor;
  return [clamp01(c[0]), clamp01(c[1]), clamp01(c[2])];
}

/**
 * palette（primary/secondary/accent）+ axes → 一套 look。
 *
 * 权重 0.5 / 0.3 / 0.2 = 这三种材质在一具身体上的大致覆盖面积
 * （躯干 primary、四肢 secondary、头手脚 accent，见 docs/05 §1）。
 * 所以"身体整体给人的颜色印象"就是这个加权平均 —— 灯是照着它调的。
 */
export function deriveLook(
  theme: ThemeDef | null | undefined,
  materials: readonly MaterialDef[] = [],
): LookProfile {
  const palette = theme?.palette ?? [];
  const weights = [0.5, 0.3, 0.2];
  const mixSrgb: RGB = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const a = albedoOf(palette[i] ?? palette[palette.length - 1], materials);
    mixSrgb[0] += a[0] * weights[i];
    mixSrgb[1] += a[1] * weights[i];
    mixSrgb[2] += a[2] * weights[i];
  }

  const hsl = rgbToHsl(mixSrgb);
  const mixLinear: RGB = [srgbToLinear(mixSrgb[0]), srgbToLinear(mixSrgb[1]), srgbToLinear(mixSrgb[2])];
  const luma = luminance(mixLinear);
  const chroma = hsl.s;

  // 规则 1：蓝黄轴 → 色温。**两侧不对称**，这是故意的：
  // 眼睛对"偏蓝"比对"偏黄"敏感得多，而且轻微偏黄的灰在观感上就是中性灰
  // （industrial 的石墨+黄铜正好落在这里）。所以暖侧增益更低、死区更宽。
  const blueYellow = mixSrgb[2] - (mixSrgb[0] + mixSrgb[1]) / 2;
  const raw = -blueYellow;                                   // + = 偏黄
  const gained = raw >= 0 ? clamp01(raw / 0.16) : -clamp01(-raw / 0.09);
  const dead = gained >= 0 ? 0.30 : 0.15;
  const temperature = Math.sign(gained) * Math.max(0, Math.abs(gained) - dead) / (1 - dead);
  // 规则 2：亮且无彩 → 冷白。暗主题（xeno/industrial/field）完全不吃这一条
  const coolBias = clamp01((luma - 0.22) / 0.38) * (1 - clamp01(Math.abs(temperature) * 1.6));
  // 色相只在颜料确实够彩时才进灯里 —— 不然 industrial 那点棕味会被放大成暖光
  const hueWeight = clamp01((chroma - 0.06) / 0.18);

  const keyTemp = temperature * 0.55 - coolBias * 0.5;
  // 轮廓光永远站在主光的反面，再整体偏冷一档（暖 key + 冷 rim 是影棚的默认答案）
  const rimTemp = Math.max(-1, Math.min(1, -keyTemp * 0.9 - 0.22));

  // 颜料色相拉成一盏"有颜色的灯"（不是把颜料本身当灯色 —— 深甲壳当灯色会黑掉）
  const tint = hslToRgb(hsl.h, 0.62, 0.56);

  const humanLike = clamp01(theme?.axes?.humanLike ?? 0.5);
  const lifeLike = clamp01(theme?.axes?.lifeLike ?? 0.5);

  const key = mulRgb(tempColor(keyTemp), hueFilter(tint, hueWeight * 0.26));
  const rim = mulRgb(tempColor(rimTemp), hueFilter(tint, hueWeight * 0.08));
  // 补光：最中性的一盏，只负责把暗部从纯黑里抬出来，永远比 key 冷一点
  const fill = tempColor(keyTemp * 0.35 - 0.18);
  // 半球光的"天空"始终是冷的天光
  const sky = tempColor(-0.35);

  // 地面与背景的明度：跟着颜料明度走，但压得很低（影棚的黑卡纸，不是白背景）
  const base = 0.016 + 0.070 * luma;
  const bgBottom = mulRgb(scaleRgb(tempColor(keyTemp * 0.6), base), hueFilter(tint, hueWeight * 0.28));
  const bgTop = scaleRgb(bgBottom, 0.42);
  const groundNear = mulRgb(scaleRgb(bgBottom, 1.85), hueFilter(tint, hueWeight * 0.16));
  // 地面远端必须**正好**等于背景地平线色，否则圆盘边缘会出现一条地平线（见 stage.ts 的说明）
  const groundFar: RGB = [bgBottom[0], bgBottom[1], bgBottom[2]];
  const bounce = scaleRgb(groundNear, 1.1);

  const particle = mulRgb(tempColor(rimTemp * 0.8), hueFilter(tint, hueWeight * 0.30));

  return {
    key, fill, rim, sky, bounce,
    groundNear, groundFar, bgTop, bgBottom, particle,

    // 暗颜料需要更多光才站得住；亮颜料给太多就糊成一片白
    keyIntensity: 2.15 + 1.05 * (1 - luma),
    fillIntensity: 0.42 + 0.22 * lifeLike,
    // 越像机器，轮廓越要被切出来
    rimIntensity: 1.05 + 0.95 * (1 - humanLike),
    hemiIntensity: 0.30 + 0.30 * luma,

    // 亮主题压一点曝光，免得 porcelain 的高光糊掉
    exposure: 1.06 - 0.22 * luma,

    // 轻。bloom 只在暗主题上稍微多一点（glow.signal 那类自发光件靠它）
    bloomStrength: 0.10 + 0.16 * (1 - luma),
    bloomThreshold: 0.72 + 0.16 * luma,
    aoStrength: 0.45 + 0.20 * (1 - humanLike),

    shadowIntensity: 0.72 + 0.16 * (1 - lifeLike),
    shadowSoftness: 1.6 + 2.4 * lifeLike,

    contactStrength: 0.55 + 0.15 * (1 - lifeLike),
    contactRadius: 0.62,

    particleGain: 0.75 + 0.45 * lifeLike,
    particleDrift: 0.6 + 0.8 * lifeLike,

    // ── 场景字段的缺省值 = T-09 的老行为 ──
    // 故意这么给：`scenes.ts` 万一没被调用（或某个场景 id 打错），画面退回到
    // "还是能看的那一版"，而不是一片黑（P3：观众永远不该看见"出错了"）。
    skyTop: bgTop,
    skyGlow: bgBottom,
    glowLift: 0,
    glowRadius: 0.9,
    glowSoft: 1,
    fogDensity: 0,
    groundReflect: 0,
    groundRipple: 0,
    groundGlossNear: 0.58,
    groundGlossFar: 0.96,
    contactCore: 0,
    contactCoreRadius: 0.2,
    keyDir: [1.5, 2.35, 1.85],
    fillDir: [-2.3, 1.25, 1.7],
    rimDir: [-0.85, 2.1, -2.5],
    vignette: 0.34,
    grain: 0.016,
    particleSize: 1,
    frameLift: 0,

    luma, chroma, hue: hsl.h, temperature, keyTemp, coolBias, hueWeight,
  };
}

/** 没有主题时的兜底（开场选择页之前、parts.json 缺失时）——中性影棚 */
export const NEUTRAL_LOOK: LookProfile = deriveLook(null, []);

/**
 * 两套 look 之间插值。换主题不该是一次跳变（现场遥控器按数字键直选会很刺眼）。
 * 按字段类型自动处理，新增字段不用回来改这里。
 */
export function lerpLook(a: LookProfile, b: LookProfile, t: number): LookProfile {
  const out = { ...b } as unknown as Record<string, unknown>;
  const from = a as unknown as Record<string, unknown>;
  for (const k of Object.keys(b)) {
    const va = from[k];
    const vb = out[k];
    if (typeof va === 'number' && typeof vb === 'number') out[k] = lerp(va, vb, t);
    else if (Array.isArray(va) && Array.isArray(vb)) out[k] = mixRgb(va as RGB, vb as RGB, t);
  }
  return out as unknown as LookProfile;
}
