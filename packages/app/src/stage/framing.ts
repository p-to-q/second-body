/**
 * 取景：**身体有多大 → 画面框住多大一块世界**。纯函数，不 import three。
 *
 * 为什么它得单独成一个文件：docs/18 的身体方案落地之后，
 * 「一个站着的 1.7m 人」这个假设不成立了 —— `quadruped` 是横的矮的
 * （躯干沿 Z 展开 1.1m，整体高度 0.93m），`towering` 是 1.98m 高、1.58m 宽，
 * `inverted` 的重心在**地面以下**。用人形的相机参数去拍它们，身体会直接出画。
 *
 * ── 这里做的那个取舍（重要，PRD §3 第一条主张）──────────────────────────
 *
 * 「等身」是这件作品的第一条产品主张：屏幕上的身体是 1:1 的真人尺寸。
 * 完全按包围盒自适应（每个身体都填满画面）会**直接杀掉这条主张** ——
 * 那样一只狗和一个人在屏幕上一样大，尺度感就没了，所有身体都变成"模型预览"。
 *
 * 另一个极端（严格 1:1、相机纹丝不动）也不对：一只 0.93m 高的四足会缩在
 * 画面底部一小块，上面三分之二是空的。静帧发出去没人看得出那是什么。
 *
 * 所以这里做的是**有限插值**：
 *   - 观众的站位（相机距离 2.8m）**不动** —— 现场地面上是贴了位置线的，
 *     那是个物理事实，不该跟着物种变。
 *   - 画面框住的世界高度 = 身体骨架高度 × 常数，并**上下夹住**。
 *     常数取得让人形正好落回原来的 2.45m（1:1 一点没变），
 *     四足则被放大约 1.7 倍 —— 读起来是"一只跟真狗差不多大的机器兽"，
 *     而不是一个玩具，也不是一头和人一样大的怪物。
 *
 * 换句话说：**人形严格等身，非人形按同一条曲线连续地偏离，偏离量有上限。**
 */
import { remapSkeleton, type BodyPlan } from '../../../core/src/bodyplan.ts';
import { SKELETON , FRAMING as FRAMING_TUNING } from '../../../core/src/tuning.ts';
import type { Bone, BoneId, Skeleton, Vec3 } from '../../../core/src/types.ts';

/** 一具身体在世界里占的那个盒子。x 始终假设左右对称，所以只记宽度 */
export interface BodyBounds {
  /** 竖直中心（米）。`inverted` 会是负的 */
  centerY: number;
  /** 骨架高度（米，只算骨头端点，不含部件几何） */
  height: number;
  /** 左右宽度（米） */
  width: number;
  /** 前后进深（米）。四足的这一项最大 */
  depth: number;
}

/** 取景结果，直接喂给相机 */
export interface FrameFit {
  /** 画面要框住的世界高度（米） */
  frameHeight: number;
  /** 画面至少要框住的世界宽度（米）——竖屏时它会反过来决定高度 */
  frameWidth: number;
  /** 画面竖直中心在世界坐标的高度（米） */
  centerY: number;
  /** 灯与阴影相机瞄准的高度（米） */
  aimY: number;
}

export const FRAMING = FRAMING_TUNING;


// ── 参考站姿 ────────────────────────────────────────────────────────────────

/**
 * 标准 A-pose（身高 1.7m，面朝 +Z，关节名同 docs/04 §2）。
 * **它不参与渲染**，只有一个用途：在真人到达之前，把某个身体方案的取景先算出来。
 * 数值与 `/dev/figure.html` 的那副同源。
 */
const REFERENCE_JOINTS: Record<string, Vec3> = {
  pelvis: [0, 0.95, 0], chest: [0, 1.35, 0], neck: [0, 1.45, 0], headCenter: [0, 1.60, 0],
  shoulderL: [0.19, 1.38, 0], elbowL: [0.36, 1.10, 0.02], wristL: [0.47, 0.86, 0.04], handTipL: [0.51, 0.76, 0.05],
  shoulderR: [-0.19, 1.38, 0], elbowR: [-0.36, 1.10, 0.02], wristR: [-0.47, 0.86, 0.04], handTipR: [-0.51, 0.76, 0.05],
  hipL: [0.09, 0.93, 0], kneeL: [0.10, 0.51, 0.01], ankleL: [0.10, 0.09, 0], footIdxL: [0.10, 0.03, 0.16],
  hipR: [-0.09, 0.93, 0], kneeR: [-0.10, 0.51, 0.01], ankleR: [-0.10, 0.09, 0], footIdxR: [-0.10, 0.03, 0.16],
};

const REFERENCE_BONE_JOINTS: Record<BoneId, [string, string]> = {
  spine: ['pelvis', 'chest'], neck: ['chest', 'neck'], head: ['neck', 'headCenter'],
  clavicleL: ['chest', 'shoulderL'], clavicleR: ['chest', 'shoulderR'],
  upperArmL: ['shoulderL', 'elbowL'], upperArmR: ['shoulderR', 'elbowR'],
  foreArmL: ['elbowL', 'wristL'], foreArmR: ['elbowR', 'wristR'],
  handL: ['wristL', 'handTipL'], handR: ['wristR', 'handTipR'],
  thighL: ['hipL', 'kneeL'], thighR: ['hipR', 'kneeR'],
  shinL: ['kneeL', 'ankleL'], shinR: ['kneeR', 'ankleR'],
  footL: ['ankleL', 'footIdxL'], footR: ['ankleR', 'footIdxR'],
};

export const REFERENCE_POSE: Skeleton = {
  bones: (Object.keys(REFERENCE_BONE_JOINTS) as BoneId[]).map((id): Bone => {
    const [a, b] = REFERENCE_BONE_JOINTS[id];
    const p0 = REFERENCE_JOINTS[a], p1 = REFERENCE_JOINTS[b];
    return {
      id, p0, p1,
      length: Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]),
      roll: 0, confidence: 1,
    };
  }),
  joints: REFERENCE_JOINTS,
  height: SKELETON.referenceHeight,
  warmingUp: false,
  t: 0,
};

/**
 * 人形（`rig`）在标准站姿下的盒子 —— 一切拿不到身体时的退路。
 * **算出来的，不是写死的**：和 `boundsOfPlan('rig')` 必须是同一个数，
 * 否则"未知方案退回人形"会退到一个和人形差一点点的取景上（看起来就是相机轻微跳一下）。
 * 后面那个字面量只是 `remapSkeleton` 万一返回空时的最后兜底（P3：不许出 NaN）。
 */
export const DEFAULT_BOUNDS: BodyBounds =
  boundsOfSkeleton(remapSkeleton(REFERENCE_POSE, 'rig'))
  ?? { centerY: 0.815, height: 1.57, width: 1.02, depth: 0.16 };

/**
 * 某个身体方案在标准站姿下占的盒子：**直接把参考站姿重映射一遍再量**，
 * 不维护一张常数表。表会过期（`bodyplan.ts` 调一次比例就错），
 * 而且表也表达不了 `{ kind: 'quadruped', limb: 0.7 }` 这种带比例的 spec。
 *
 * 结果按 spec 缓存：换条目时才会调用，条目数是个位数。
 * 不认识的方案名一律当人形 —— 没有方案不是错误，是缺省（P3）。
 */
const planCache = new Map<string, BodyBounds>();

export function boundsOfPlan(plan: BodyPlan | null | undefined): BodyBounds {
  if (plan === null || plan === undefined) return DEFAULT_BOUNDS;
  const key = typeof plan === 'string' ? plan : JSON.stringify(plan);
  const hit = planCache.get(key);
  if (hit) return hit;
  const got = boundsOfSkeleton(remapSkeleton(REFERENCE_POSE, plan)) ?? DEFAULT_BOUNDS;
  planCache.set(key, got);
  return got;
}

/**
 * 从活骨架量包围盒。只看 17 根骨头的 34 个端点 —— 比 `Box3.setFromObject`
 * 便宜两个数量级，而且不受部件几何/换装动画的影响（换装中途的插值形态不该改变取景）。
 *
 * 拿不到有效骨架时返回 `null`，调用方保持原来的取景（**不要跳回默认值**：
 * 追踪抖一下就重新取景会让画面一直在呼吸，那是最难看的 bug）。
 */
export function boundsOfSkeleton(sk: Skeleton | null | undefined): BodyBounds | null {
  if (!sk || !sk.bones?.length) return null;
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  let seen = 0;
  for (const b of sk.bones) {
    for (const p of [b.p0, b.p1]) {
      if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !Number.isFinite(p[2])) continue;
      seen++;
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
      if (p[2] < minZ) minZ = p[2];
      if (p[2] > maxZ) maxZ = p[2];
    }
  }
  if (seen < 4) return null;                    // 只剩几根骨头的骨架量不出可信的盒子
  return {
    centerY: (minY + maxY) / 2,
    height: Math.max(0.05, maxY - minY),
    width: Math.max(0.05, maxX - minX),
    depth: Math.max(0.05, maxZ - minZ),
  };
}

/** 包围盒 → 取景。见文件头「有限插值」那一段 */
export function fitFrame(b: BodyBounds): FrameFit {
  const frameHeight = Math.min(
    FRAMING.maxFrameHeight,
    Math.max(FRAMING.minFrameHeight, b.height * FRAMING.heightFactor),
  );
  return {
    frameHeight,
    frameWidth: Math.max(FRAMING.minFrameWidth, b.width * FRAMING.widthMargin),
    centerY: b.centerY + b.height * FRAMING.centerLift,
    // 灯和阴影瞄准身体的几何中心：四足的"胸口"在 0.4m 高，照着 1m 打会把它留在暗部
    aimY: b.centerY,
  };
}

/** 两个包围盒之间插值。换条目时相机要平滑过渡（docs/23 §S3：进场必须无缝） */
export function lerpBounds(a: BodyBounds, b: BodyBounds, t: number): BodyBounds {
  const f = (x: number, y: number): number => x + (y - x) * t;
  return {
    centerY: f(a.centerY, b.centerY),
    height: f(a.height, b.height),
    width: f(a.width, b.width),
    depth: f(a.depth, b.depth),
  };
}
