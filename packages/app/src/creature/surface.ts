/**
 * 表面 —— 一具身体的物质**在这一分钟里是什么**。
 *
 * ## 它和旁边两个文件的分工
 *
 *   `core/palette.ts`   三个材质角色调成同一个物种（**空间**上的统一）
 *   `creature/shading.ts` 这具身体用哪条着色路径（PBR / 平涂，**一场演出只换几次**）
 *   这个文件            同一具身体的表面在弧线上怎么走（**时间**）
 *
 * 三者正交，所以这里**不换材质、不换管线、不加桶**：它只把已经调和好的那一份
 * 数（颜色 / 粗糙度 / 金属度 / 自发光）按 `ArcWeights` 重新算一遍。
 * draw call 因此一个都不多 —— 而 `char.line` 已经坐在 36/40 上（`test/outline-budget.test.ts`），
 * 这条线没有第二种花法。理由完整写在 `docs/41 §4`。
 *
 * ## 为什么是纯函数、为什么在 app 里
 *
 * 纯：同样的 `(role, base, w)` 永远同样的输出，能在 node 里秒级量住（P1），
 * 而"表面在第 90 秒是什么样"恰恰是最容易被"我在浏览器里看了一眼"糊弄过去的一类判断。
 * 在 app 而不在 core：它读 `stage/look.ts` 的 HSL 工具和那条**共用的**弧线曲线 ——
 * 灯和表面必须读同一条曲线，否则一条线会在中途分叉成两条。
 *
 * ## 一条不许破的线
 *
 * **`w` 全零时输出和输入逐位相同。** 没有人调 `setArc()` 的时候，
 * 这个文件等于不存在（`test/surface.test.ts` 第一条钉住它）。
 * 和 `SHADING_OF_THEME` 同一条纪律：新的表达是 opt-in 的，不是新的默认。
 */
import { MATERIAL } from '../../../core/src/tuning.ts';
import type { MaterialRole } from '../../../core/src/types.ts';
import { hslToRgb, rgbToHsl, type ArcWeights, type RGB } from '../stage/look.ts';

/** 一块材质上会被弧线改到的那几个数。颜色是 **sRGB** —— `MaterialDef.baseColor` 就是 sRGB */
export interface SurfaceSpec {
  baseColor: RGB;
  roughness: number;
  metalness: number;
  /** 自发光（sRGB）。没有就是黑 —— **黑也要给**，理由见 `creature.ts` 的 `materialFor` */
  emissive: RGB;
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * 三个角色在弧线上的**方向**。
 *
 * primary 是锚点：它一路不转色相、只被整体地推。这不是省事 ——
 * 主色一转，这具身体就不再是观众选的那个物种了，而第 III 乐章要说的是
 * 「与你相似、却并非你」，**相似那一半必须留着**。
 */
const splitOf = (role: MaterialRole): number =>
  role === 'secondary' ? 1 : role === 'accent' ? -1 : 0;

/** 粗糙度分开的方向：primary 往粗（皮/壳），accent 往细（角质/膜） */
const roughSplitOf = (role: MaterialRole): number =>
  role === 'primary' ? 0.35 : role === 'secondary' ? -0.45 : -1;

/**
 * 把弧线盖到一块调和好的材质上。
 *
 * @param role   这块材质在身上的角色（primary 是锚点）
 * @param base   `core/palette.ts` 调和之后的那一份，**永远从它算起**，不累加
 * @param w      四个乐章此刻的份量（`stage/look.ts` 的 `arcWeights`）
 * @param toneL  物种主色的 **HSL 明度**（和这里算 `l` 用的是同一把尺子，不要换成 Rec.709
 *               —— 两把尺子混用时"压向主色"会连带把身体整体压暗或提亮）
 *               —— 第 I 乐章要把三个角色的明度压向它
 */
export function surfaceFor(
  role: MaterialRole,
  base: SurfaceSpec,
  w: ArcWeights,
  toneL: number,
): SurfaceSpec {
  const q = clamp01(w.quote);
  const g = clamp01(w.grow);
  const d = clamp01(w.diverge);
  const o = clamp01(w.other);
  if (q <= 0 && g <= 0 && d <= 0 && o <= 0) return base;

  // ── 粗糙度 ──
  // I 拉向 0.94：没有高光 = 表面不再回答环境 = 只剩它自己的形（= 被引用的数据）
  let roughness = lerp(base.roughness, MATERIAL.quoteRoughness, MATERIAL.quoteRoughMix * q);
  // II 按角色分开：被造出来的东西整具一种表面，活的东西不是
  roughness += MATERIAL.growRoughSplit * g * roughSplitOf(role);
  // IV 落到一个确定的值：它有了自己的物质
  roughness = lerp(roughness, MATERIAL.otherRoughness, MATERIAL.otherRoughMix * o);

  // ── 金属度 ──
  // I 压掉（金属度是最强的"我在回答环境"），IV 起来（它开始映屋子，而不是被我们的灯描述）
  const metalness = base.metalness * (1 - MATERIAL.quoteMetal * q)
    + MATERIAL.otherMetal * o * (role === 'primary' ? 1 : 0.45);

  // ── 颜色 ──
  const hsl = rgbToHsl(base.baseColor);
  // III 色相离开主色。**只有次要色和点缀色会转** —— 反着做 core/palette.ts 的收敛
  let h = hsl.h + MATERIAL.hueSplit * d * splitOf(role);
  h -= Math.floor(h);
  // I 压彩度（被引用的东西不鲜艳）；IV 还回来一点（它有自己的颜色了）
  const s = clamp01(hsl.s * (1 - MATERIAL.quoteDesat * q) * (1 + MATERIAL.otherChroma * o));
  // I 把明度压向物种主色：三个角色摊成一块色块。III 再把差张开
  let l = lerp(hsl.l, clamp01(toneL), MATERIAL.quoteFlatten * q);
  l = clamp01(toneL + (l - toneL) * (1 + MATERIAL.valueSplit * d));
  const baseColor = hslToRgb(h, s, l);

  // ── 自发光 ──
  // II 的 zoe：**这块材质自己的颜色**在薄处透出来一点，不是新加一种颜色。
  // 加在原有自发光之上 —— `glow.signal` 那类是信号，不能被这里盖掉
  const k = MATERIAL.growEmissive * g;
  const emissive: RGB = [
    clamp01(base.emissive[0] + baseColor[0] * k),
    clamp01(base.emissive[1] + baseColor[1] * k),
    clamp01(base.emissive[2] + baseColor[2] * k),
  ];

  return { baseColor, roughness: clamp01(roughness), metalness: clamp01(metalness), emissive };
}
