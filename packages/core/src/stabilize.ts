/**
 * 骨长稳定化（T-04）。规格：docs/04-SPEC §3。
 * 方向来自模型，长度来自统计：90 帧滑动中位数 + 前向运动学重建。
 * 没有这一步，角色会以 ±15% 的幅度"呼吸"。
 */
import type { Bone, BoneId, Skeleton, Vec3 } from './types.ts';
import { add, clone, dist, norm, sane, scale, sub } from './vec.ts';
import { rollingMedian } from './filter.ts';
import { ALL_BONE_IDS } from './slots.ts';
import { BONES } from './skeleton.ts';
import { SKELETON } from './tuning.ts';

export interface Stabilizer {
  apply(sk: Skeleton, dt: number): Skeleton;
  reset(): void;
}

/** 小于这个长度就当"这根骨头这帧没有方向"，不编一个出来 */
const DEGENERATE = 1e-9;

export function createStabilizer(
  windowFrames = SKELETON.medianWindow,
  warmupFrames = SKELETON.warmupFrames,
): Stabilizer {
  const size = Math.max(1, Math.floor(Number.isFinite(windowFrames) ? windowFrames : SKELETON.medianWindow));
  const warmup = Math.max(0, Math.floor(Number.isFinite(warmupFrames) ? warmupFrames : SKELETON.warmupFrames));
  const medians = new Map<BoneId, ReturnType<typeof rollingMedian>>();
  for (const id of ALL_BONE_IDS) medians.set(id, rollingMedian(size));
  let frames = 0;

  /**
   * dt 故意不参与：热身与窗口都按**帧**计（docs/04 §3），
   * 而且掉帧/切标签页并不代表"换了个人"，不该清空中位数。
   */
  function apply(sk: Skeleton, _dt: number): Skeleton {
    const src: Bone[] = sk && Array.isArray(sk.bones) ? sk.bones : [];
    frames++;
    const warmingUp = frames <= warmup;

    const byId = new Map<BoneId, Bone>();
    const measured = new Map<BoneId, { p0: Vec3; p1: Vec3; len: number }>();
    const stable = new Map<BoneId, number>();

    // 1) 每帧测量 17 个骨长，推进各自的滑动中位数
    for (const b of src) {
      if (!b) continue;
      const p0 = sane(b.p0);
      const p1 = sane(b.p1, p0);
      const len = dist(p0, p1);
      byId.set(b.id, b);
      measured.set(b.id, { p0, p1, len });

      const m = medians.get(b.id);
      if (!m) { stable.set(b.id, len); continue; }
      // 零长 = 关节这帧缺失，不是一次长度测量 —— 不让它污染中位数
      const med = len > DEGENERATE ? m.push(len) : (m.count ? m.push(Number.NaN) : len);
      stable.set(b.id, Number.isFinite(med) && med > 0 ? med : len);
    }

    // 2) 热身期（前 warmup 帧）直接透传测量值
    if (warmingUp) {
      const bones = src.map((b): Bone => {
        const mm = measured.get(b.id);
        return mm
          ? { ...b, p0: clone(mm.p0), p1: clone(mm.p1), length: mm.len }
          : { ...b };
      });
      return { ...sk, bones, joints: { ...(sk.joints ?? {}) }, warmingUp: true };
    }

    // 3) 从 pelvis 出发做前向运动学重建：方向取当帧测得的，长度取中位数。
    //    BONES 的顺序已经是拓扑序（父关节总是先被算出来），照着走一遍即可。
    //    根关节（pelvis / hipL / hipR，没有任何骨头指向它们）保持测量位置。
    const joints: Record<string, Vec3> = {};
    for (const k in sk.joints ?? {}) joints[k] = sane(sk.joints[k]);

    const bones: Bone[] = [];
    for (const [id, aName, bName] of BONES) {
      const b = byId.get(id);
      const mm = measured.get(id);
      if (!b || !mm) continue;                       // 骨头缺失：跳过，不要凭空造（P2）
      const p0 = clone(joints[aName] ?? mm.p0);      // 父关节：已重建的值
      const d = sub(mm.p1, mm.p0);
      let p1: Vec3;
      if (mm.len > DEGENERATE) {
        p1 = add(p0, scale(norm(d), stable.get(id) ?? mm.len));
      } else {
        p1 = clone(p0);                              // 方向未知：只保证不产生 NaN，不编方向
      }
      joints[bName] = clone(p1);
      bones.push({ ...b, p0, p1, length: dist(p0, p1) });
    }

    return { ...sk, bones, joints, warmingUp: false };
  }

  return {
    apply,
    reset() {
      frames = 0;
      for (const m of medians.values()) m.reset();
    },
  };
}
