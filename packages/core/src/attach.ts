/**
 * 挂载数学 —— 项目的心脏。见 docs/04-SPEC-rig-and-attach.md §4。
 *
 * 不变式（有测试保证）：
 *   M · (0,0,0) = bone.p0
 *   M · (0,1,0) = bone.p1
 * 在任何输入下都不产生 NaN。
 */
import type { Bone, Mat4, Vec3 } from './types.ts';
import { compose, norm, quatFromAxisY, quatFromUnitVectors, quatMul, sane, sub } from './vec.ts';

const UP: Vec3 = [0, 1, 0];

export interface AttachOptions {
  /**
   * 'stretch'（默认）= 沿骨头方向拉到骨长，横向用 girth —— 四肢。
   * 'uniform'        = 三轴同比例缩放（= girth），完全忽略骨长 —— 头/躯干/手/脚/关节。
   *
   * 为什么需要这个分叉：头是"一个有固有比例的物体"，不是"一段可以被拉长的管子"。
   * 用 stretch 挂头，颈骨多长头就多高 —— 装配预览里它会变成一坨压扁的东西（实测踩过）。
   * 见 docs/04 §4。
   */
  mode?: 'stretch' | 'uniform';
  /** 缩放系数 = (SLOT_WIDTH[slot] × bodyScale) / part.localGirth */
  girth?: number;
  /** 左侧肢体镜像复用：X 轴取负。注意渲染端要同时翻转 face culling */
  mirror?: boolean;
  /** 沿骨头方向的额外缩放，用于 crossfade/组装动画（0..1） */
  lengthScale?: number;
}

export function attachMatrix(bone: Bone, out: Mat4, opt: AttachOptions = {}): Mat4 {
  const p0 = sane(bone.p0);
  const p1 = sane(bone.p1, [p0[0], p0[1] + 1e-3, p0[2]]);

  const d = sub(p1, p0);
  const rawLen = Math.hypot(d[0], d[1], d[2]);
  const length = Number.isFinite(bone.length) && bone.length > 1e-6 ? bone.length : Math.max(rawLen, 1e-4);
  const dir = norm(d);                       // norm() 在零向量时回退 +Y，不会 NaN

  let q = quatFromUnitVectors(UP, dir);
  if (bone.roll) q = quatMul(q, quatFromAxisY(bone.roll));

  const g = Number.isFinite(opt.girth) ? (opt.girth as number) : 1;
  const ls = Number.isFinite(opt.lengthScale) ? (opt.lengthScale as number) : 1;
  const sy = opt.mode === 'uniform' ? g * ls : length * ls;
  const sx = opt.mirror ? -g : g;

  return compose(p0, q, [sx, sy, g], out);
}

/** 关节盖片：只有位置和统一缩放，没有方向 */
export function jointMatrix(p: Vec3, radius: number, out: Mat4): Mat4 {
  const pp = sane(p);
  const r = Number.isFinite(radius) && radius > 0 ? radius : 1e-3;
  return compose(pp, [0, 0, 0, 1], [r, r, r], out);
}
