/**
 * 骨架构建（T-02）。规格：docs/04-SPEC §1 §2。
 *
 * 本文件是**唯一**允许做坐标转换的地方（P4）。镜像、Y/Z 翻转、落地平移都在这里，
 * 之后所有代码都活在已镜像的、Y-up、脚踩 y=0 的世界里。
 */
import type { Bone, BoneId, Landmark, RawPose, Skeleton, Vec3 } from './types.ts';
import { add, clone, dist, lerp, mid, sane, scale, sub } from './vec.ts';
import { CAPTURE, SKELETON } from './tuning.ts';

/** MediaPipe 33 点索引（docs/04 §2） */
export const LM = {
  NOSE: 0, L_EAR: 7, R_EAR: 8, L_SHOULDER: 11, R_SHOULDER: 12,
  L_ELBOW: 13, R_ELBOW: 14, L_WRIST: 15, R_WRIST: 16,
  L_PINKY: 17, R_PINKY: 18, L_INDEX: 19, R_INDEX: 20,
  L_HIP: 23, R_HIP: 24, L_KNEE: 25, R_KNEE: 26,
  L_ANKLE: 27, R_ANKLE: 28, L_HEEL: 29, R_HEEL: 30,
  L_FOOT: 31, R_FOOT: 32,
} as const;

/** 骨头定义表：[id, 起点关节, 终点关节]。顺序即数组顺序，不要重排（docs/04 §2） */
export const BONES = [
  ['spine', 'pelvis', 'chest'],
  ['neck', 'chest', 'neck'],
  ['head', 'neck', 'headCenter'],
  ['clavicleL', 'chest', 'shoulderL'],
  ['clavicleR', 'chest', 'shoulderR'],
  ['upperArmL', 'shoulderL', 'elbowL'],
  ['upperArmR', 'shoulderR', 'elbowR'],
  ['foreArmL', 'elbowL', 'wristL'],
  ['foreArmR', 'elbowR', 'wristR'],
  ['handL', 'wristL', 'handTipL'],
  ['handR', 'wristR', 'handTipR'],
  ['thighL', 'hipL', 'kneeL'],
  ['thighR', 'hipR', 'kneeR'],
  ['shinL', 'kneeL', 'ankleL'],
  ['shinR', 'kneeR', 'ankleR'],
  ['footL', 'ankleL', 'footIdxL'],
  ['footR', 'ankleR', 'footIdxR'],
] as const;

// ── docs/04 §1 的三条轴向约定，各给一个名字 ────────────────────────────────
// ⚠️ 轴向"待实测确认"（docs/04 §1 / docs/09 U1）。实测结论回来时**只改这三个数**，
//    然后更新 docs/04 §1 的表格。不要在下游打补丁，也不要在别处再镜像一次。
/** 镜子：画面左右翻转，观众抬右手 → 屏幕（+X 侧）的手抬起 */
export const MIRROR_X = -1;
/** MediaPipe 向下为正 → 世界 +Y 向上 */
export const FLIP_Y = -1;
/** 深度翻转，让人朝向 +Z 面对相机 */
export const FLIP_Z = -1;

// docs/04 §2 派生关节里出现的两个比例（拓扑定义，不是现场旋钮，故不进 tuning.ts）
/** neck = lerp(chest, headCenter, NECK_T) */
const NECK_T = 0.35;
/** handTip 回退：wrist + (wrist - elbow) × HAND_TIP_EXTEND */
const HAND_TIP_EXTEND = 0.3;

const ORIGIN: Vec3 = [0, 0, 0];

/** 关节名 → MediaPipe landmark 索引。只列"直接来自某个 landmark"的关节。 */
const DIRECT_JOINTS: Readonly<Record<string, number>> = {
  nose: LM.NOSE,
  earL: LM.L_EAR, earR: LM.R_EAR,
  shoulderL: LM.L_SHOULDER, shoulderR: LM.R_SHOULDER,
  elbowL: LM.L_ELBOW, elbowR: LM.R_ELBOW,
  wristL: LM.L_WRIST, wristR: LM.R_WRIST,
  pinkyL: LM.L_PINKY, pinkyR: LM.R_PINKY,
  indexL: LM.L_INDEX, indexR: LM.R_INDEX,
  hipL: LM.L_HIP, hipR: LM.R_HIP,
  kneeL: LM.L_KNEE, kneeR: LM.R_KNEE,
  ankleL: LM.L_ANKLE, ankleR: LM.R_ANKLE,
  heelL: LM.L_HEEL, heelR: LM.R_HEEL,
  footIdxL: LM.L_FOOT, footIdxR: LM.R_FOOT,
};

const DIRECT_NAMES = Object.keys(DIRECT_JOINTS);

/** 落地平移的候选脚点，按优先级分层。上一层全不可用才下沉到下一层。 */
const GROUND_TIERS: readonly (readonly string[])[] = [
  ['footIdxL', 'footIdxR'],
  ['ankleL', 'ankleR', 'heelL', 'heelR'],
];

/**
 * 一个 landmark 的可信度 0..1。
 * 缺失 / 任一分量非有限 → 0；没带 visibility 字段 → 1（worldLandmarks 常常不带）。
 */
export function landmarkConfidence(lm: Landmark | undefined): number {
  if (!lm) return 0;
  if (!Number.isFinite(lm.x) || !Number.isFinite(lm.y) || !Number.isFinite(lm.z)) return 0;
  if (lm.visibility === undefined) return 1;
  if (!Number.isFinite(lm.visibility)) return 0;
  return Math.min(1, Math.max(0, lm.visibility));
}

/** "这个点能不能用来做派生关节的选择"。只用于 §2 的回退判定，不用于丢几何。 */
const usable = (lm: Landmark | undefined): boolean =>
  landmarkConfidence(lm) >= CAPTURE.minJointConfidence;

/** 单点转换：三次取负。非有限分量按 P2 净化成 0（= 胯中点）。 */
function toWorld(lm: Landmark | undefined): Vec3 {
  if (!lm) return clone(ORIGIN);
  return sane([MIRROR_X * lm.x, FLIP_Y * lm.y, FLIP_Z * lm.z], ORIGIN);
}

/**
 * MediaPipe worldLandmarks → 本项目世界系（docs/04 §1）。
 * 契约：镜像（x 取负）、Y 翻转、Z 翻转、并把最低的脚平移到 y=0。
 * 返回的是"直接关节"字典；派生关节（pelvis/chest/neck/headCenter/handTip）在 buildSkeleton 里。
 */
export function mediapipeToWorld(raw: RawPose): Record<string, Vec3> {
  const lms: Landmark[] = raw && Array.isArray(raw.world) ? raw.world : [];
  const joints: Record<string, Vec3> = {};
  for (const name of DIRECT_NAMES) joints[name] = toWorld(lms[DIRECT_JOINTS[name]]);

  // 落地平移：整具骨架沿 Y 平移，使最低的脚 y = 0（docs/04 §1）
  const groundY = groundLevel(joints, lms);
  if (groundY !== 0) for (const name of DIRECT_NAMES) joints[name][1] -= groundY;
  return joints;
}

function groundLevel(joints: Record<string, Vec3>, lms: Landmark[]): number {
  for (const tier of GROUND_TIERS) {
    let lo = Infinity;
    for (const name of tier) {
      if (!usable(lms[DIRECT_JOINTS[name]])) continue;
      lo = Math.min(lo, joints[name][1]);
    }
    if (Number.isFinite(lo)) return lo;
  }
  // 一只脚都看不见：退而求其次，用最低的可见点当地面，至少不会陷进地板
  let lo = Infinity;
  for (const name of DIRECT_NAMES) lo = Math.min(lo, joints[name][1]);
  return Number.isFinite(lo) ? lo : 0;
}

/**
 * 关节字典 → 17 根骨头（docs/04 §2）。
 * 缺失 / 低置信度关节不得产生 NaN（P2）：几何一律净化，派生关节按 §2 的回退链取值。
 */
export function buildSkeleton(joints: Record<string, Vec3>, lm: Landmark[], t: number): Skeleton {
  const lms: Landmark[] = Array.isArray(lm) ? lm : [];
  const src = joints ?? {};
  const J: Record<string, Vec3> = {};
  const C: Record<string, number> = {};

  for (const name of DIRECT_NAMES) {
    J[name] = sane(src[name] ?? ORIGIN, ORIGIN);
    C[name] = landmarkConfidence(lms[DIRECT_JOINTS[name]]);
  }
  const at = (n: string): Vec3 => J[n] ?? clone(ORIGIN);
  const cf = (n: string): number => C[n] ?? 0;
  const ok = (n: string): boolean => usable(lms[DIRECT_JOINTS[n]]);

  // 脚尖看不见时退到脚跟，再退到脚踝（脚踝 = 零长 foot 骨，宁可没长度也不要飞到原点）
  for (const s of ['L', 'R']) {
    if (ok('footIdx' + s)) continue;
    const heel = ok('heel' + s);
    J['footIdx' + s] = clone(at(heel ? 'heel' + s : 'ankle' + s));
    C['footIdx' + s] = heel ? cf('heel' + s) : 0;
  }

  // ── docs/04 §2 派生关节 ────────────────────────────────────────────────
  J.pelvis = mid(at('hipL'), at('hipR'));
  C.pelvis = Math.min(cf('hipL'), cf('hipR'));
  J.chest = mid(at('shoulderL'), at('shoulderR'));
  C.chest = Math.min(cf('shoulderL'), cf('shoulderR'));

  // headCenter: mid(耳) → 缺失回退 NOSE → 连鼻子都没有就贴到 chest（头没有长度，但不会掉到原点）
  if (ok('earL') && ok('earR')) {
    J.headCenter = mid(at('earL'), at('earR'));
    C.headCenter = Math.min(cf('earL'), cf('earR'));
  } else if (ok('nose')) {
    J.headCenter = clone(at('nose'));
    C.headCenter = cf('nose');
  } else {
    J.headCenter = clone(J.chest);
    C.headCenter = 0;
  }

  J.neck = lerp(J.chest, J.headCenter, NECK_T);
  C.neck = Math.min(C.chest, C.headCenter);

  // handTip: mid(index, pinky)，缺失回退 wrist + (wrist - elbow) × 0.3
  for (const s of ['L', 'R']) {
    const tip = 'handTip' + s;
    const tips = ['index' + s, 'pinky' + s].filter(ok);
    if (tips.length === 2) {
      J[tip] = mid(at(tips[0]), at(tips[1]));
      C[tip] = Math.min(cf(tips[0]), cf(tips[1]));
    } else if (tips.length === 1) {
      J[tip] = clone(at(tips[0]));
      C[tip] = cf(tips[0]);
    } else {
      const wrist = at('wrist' + s);
      J[tip] = add(wrist, scale(sub(wrist, at('elbow' + s)), HAND_TIP_EXTEND));
      C[tip] = Math.min(cf('wrist' + s), cf('elbow' + s));
    }
  }

  // ── 17 根骨头 ──────────────────────────────────────────────────────────
  const bones: Bone[] = BONES.map(([id, a, b]): Bone => {
    const p0 = clone(at(a));
    const p1 = clone(at(b));
    return {
      id: id as BoneId,
      p0,
      p1,
      length: dist(p0, p1),      // 测量值；稳定化在 T-04（stabilize.ts）里覆盖
      roll: 0,                   // v1 恒为 0，见 docs/04 §5
      confidence: Math.min(cf(a), cf(b)),
    };
  });

  return {
    bones,
    joints: J,
    height: observedHeight(J),
    warmingUp: false,            // 由 stabilizer 负责翻转
    t: Number.isFinite(t) ? t : 0,
  };
}

/**
 * 观测身高 = 头顶到最低脚的 y 差（docs/04 §2）。
 * ⚠️ headCenter 是两耳中点（≈ 耳/眼高度），不是颅顶：真身高会被低估 ~0.1m。
 *    要补这一段需要在 tuning.ts 加一个"颅顶偏移"旋钮 —— 见收尾报告，不在本卡里自作主张。
 * 无法观测时退回 SKELETON.referenceHeight，保证下游除法不会炸（P2）。
 */
function observedHeight(J: Record<string, Vec3>): number {
  const footY = Math.min(
    J.footIdxL?.[1] ?? Infinity, J.footIdxR?.[1] ?? Infinity,
    J.ankleL?.[1] ?? Infinity, J.ankleR?.[1] ?? Infinity,
  );
  const h = (J.headCenter?.[1] ?? 0) - footY;
  return Number.isFinite(h) && h > 1e-3 ? h : SKELETON.referenceHeight;
}
