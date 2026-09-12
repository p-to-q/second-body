/**
 * TODO(T-02) —— 见 docs/11-TASKS.md。实现前只需读 docs/04-SPEC §1 §2。
 *
 * 本文件是**唯一**允许做坐标转换的地方（P4）。镜像、Y/Z 翻转、落地平移都在这里，
 * 之后所有代码都活在已镜像的、Y-up、脚踩 y=0 的世界里。
 */
import type { Landmark, RawPose, Skeleton, Vec3 } from './types.ts';

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

/**
 * MediaPipe worldLandmarks → 本项目世界系。
 * 契约：镜像（x 取负）、Y 翻转、Z 翻转、并把最低的脚平移到 y=0。
 * ⚠️ 轴向尚未实测确认，见 docs/09 U1 —— 实测后改这里并更新 docs/04 §1 的表。
 */
export function mediapipeToWorld(_raw: RawPose): Record<string, Vec3> {
  throw new Error('not implemented — docs/11-TASKS.md T-02');
}

/** 关节字典 → 17 根骨头。缺失/低置信度关节不得产生 NaN（P2）。 */
export function buildSkeleton(_joints: Record<string, Vec3>, _lm: Landmark[], _t: number): Skeleton {
  throw new Error('not implemented — docs/11-TASKS.md T-02');
}
