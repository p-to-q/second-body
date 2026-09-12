/**
 * BoneId → Slot 的唯一映射。任何地方需要"这根骨头该挂哪类部件"都用这里，
 * 不要在 genome / creature 里各写一份（这是最容易产生分歧的那种小表）。
 */
import type { BoneId, Slot, SlotKey } from './types.ts';

export const SLOT_OF_BONE: Record<BoneId, Slot> = {
  spine: 'spine',
  neck: 'joint',        // 脖子用关节件（颈环/球），不单独做 neck 槽位 —— 见 docs/05 §1
  head: 'head',
  clavicleL: 'clavicle', clavicleR: 'clavicle',
  upperArmL: 'upperArm', upperArmR: 'upperArm',
  foreArmL: 'foreArm',   foreArmR: 'foreArm',
  handL: 'hand',         handR: 'hand',
  thighL: 'thigh',       thighR: 'thigh',
  shinL: 'shin',         shinR: 'shin',
  footL: 'foot',         footR: 'foot',
};

/** 左侧肢体：genome 与 creature 都据此决定要不要做 X 镜像 */
export const IS_LEFT: Record<BoneId, boolean> = {
  spine: false, neck: false, head: false,
  clavicleL: true, clavicleR: false,
  upperArmL: true, upperArmR: false,
  foreArmL: true, foreArmR: false,
  handL: true, handR: false,
  thighL: true, thighR: false,
  shinL: true, shinR: false,
  footL: true, footR: false,
};

export const ALL_BONE_IDS = Object.keys(SLOT_OF_BONE) as BoneId[];
export const ALL_SLOT_KEYS: SlotKey[] = [...ALL_BONE_IDS, 'joint'];

/**
 * 每个槽位在标准身材（身高 1.7m）上应该有多宽，单位米。docs/04 §4 的 SLOT_WIDTH。
 * 运行时：g = (SLOT_WIDTH[slot] * bodyScale) / part.localGirth
 */
// SLOT_FIT（挂载模式）与 SLOT_WIDTH（身体比例）住在 tuning.ts —— 所有旋钮集中一处。
// 需要它们就 `import { SLOT_FIT, SLOT_WIDTH } from './tuning.ts'`，本文件不再转手。
