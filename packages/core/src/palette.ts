/**
 * 材质统一 —— 把一具身体上的三个材质角色调成「同一个物种」。
 *
 * 为什么需要它：`genome` 抽件时已经把部件约束在同一个家族里了，但材质没有被约束 ——
 * 三个角色各自从主题 palette 里取一个全局材质，彼此之间没有任何关系。
 * 白瓷躯干 + 深蓝灰四肢 + 白手白脚，观众读到的是「装错了零件」，不是「一个物种」。
 *
 * 收敛的锚点是**这个物种自己的主色**，不是一个全局色。所以物种之间的差别一点没少 ——
 * 把所有物种调成同一个色调会毁掉 docs/PRD §5 第 3 条判据，那是全项目唯一确凿成立的一条。
 *
 * 纯函数、无依赖：同样的输入永远同样的输出，可以在 node 里秒级验证（P1）。
 */
import type { MaterialDef, MaterialRole, Vec3 } from './types.ts';
import { PALETTE } from './tuning.ts';

/** 感知亮度（Rec.709）。用它而不是平均值，否则黄色和蓝色会被当成一样亮 */
const luma = (c: Vec3): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * 把一个角色材质向物种主色收敛。`primary` 角色原样返回 —— 它就是锚点。
 *
 * 自发光材质也原样返回：`glow.signal` 那类是**信号**（升档、眼睛、状态灯），
 * 把它调和掉就等于把这个物种想说的话调和掉了。
 */
export function harmonize(def: MaterialDef, tone: MaterialDef, role: MaterialRole): MaterialDef {
  if (role === 'primary' || def.id === tone.id || def.emissive) return def;

  const t = role === 'accent' ? PALETTE.tint.accent : PALETTE.tint.secondary;
  const c = def.baseColor ?? [0.7, 0.7, 0.7];
  const anchor = tone.baseColor ?? c;

  // 1) 先整体靠拢：色相与彩度跟着主色走
  const tinted: Vec3 = [mix(c[0], anchor[0], t), mix(c[1], anchor[1], t), mix(c[2], anchor[2], t)];

  // 2) 再把明度差补回来一部分。只靠 1) 的话身体会摊平成一个色块 ——
  //    有明暗层次才看得出体积，这正是"统一"和"抹平"的分界线。
  const l0 = Math.max(1e-4, luma(c));
  const lAnchor = Math.max(1e-4, luma(anchor));
  const lTinted = Math.max(1e-4, luma(tinted));
  const want = lAnchor * Math.pow(l0 / lAnchor, PALETTE.valueKeep);
  const k = want / lTinted;

  return {
    ...def,
    baseColor: [clamp01(tinted[0] * k), clamp01(tinted[1] * k), clamp01(tinted[2] * k)],
    // 3) 同一种物质才会有同一种反光。粗糙度/金属度差太远时，再统一的颜色也救不回来
    roughness: mix(def.roughness ?? 0.7, tone.roughness ?? 0.7, PALETTE.surfaceMix),
    metalness: mix(def.metalness ?? 0.05, tone.metalness ?? 0.05, PALETTE.surfaceMix),
    clearcoat: mix(def.clearcoat ?? 0, tone.clearcoat ?? 0, PALETTE.surfaceMix),
  };
}
