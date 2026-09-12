/**
 * 材质库 —— 运行时统一覆盖所有部件（docs/03 §4）。
 * 数量刻意少：少量高质量材质 > 每件一套贴图，这是"像一个作品"的来源。
 */
import type { MaterialDef } from '../../core/src/types.ts';

export const MATERIALS: MaterialDef[] = [
  { id: 'proto.clay',    tier: 0, baseColor: [0.72, 0.71, 0.69], roughness: 0.95, metalness: 0.0 },
  { id: 'matte.bone',    tier: 1, baseColor: [0.93, 0.91, 0.87], roughness: 0.72, metalness: 0.0 },
  { id: 'matte.ash',     tier: 1, baseColor: [0.42, 0.43, 0.45], roughness: 0.78, metalness: 0.0 },
  { id: 'ceramic.pearl', tier: 2, baseColor: [0.96, 0.95, 0.93], roughness: 0.35, metalness: 0.0, clearcoat: 0.6 },
  { id: 'metal.graphite',tier: 2, baseColor: [0.26, 0.27, 0.29], roughness: 0.34, metalness: 0.9 },
  { id: 'metal.brass',   tier: 3, baseColor: [0.76, 0.62, 0.36], roughness: 0.28, metalness: 1.0 },
  { id: 'paint.hazard',  tier: 1, baseColor: [0.86, 0.68, 0.13], roughness: 0.62, metalness: 0.0 },
  { id: 'chitin.deep',   tier: 2, baseColor: [0.16, 0.19, 0.24], roughness: 0.42, metalness: 0.25, clearcoat: 0.45 },
  { id: 'glow.signal',   tier: 3, baseColor: [0.10, 0.11, 0.13], roughness: 0.5,  metalness: 0.2, emissive: [0.55, 0.72, 0.95] },
];
