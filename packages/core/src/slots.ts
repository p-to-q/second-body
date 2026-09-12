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
/**
 * 每个槽位用哪种挂载模式（docs/04 §4）。
 * 四肢是"一段可以被拉长的管子"→ stretch；
 * 头/躯干/手/脚/关节是"有固有比例的物体"→ uniform，按 SLOT_WIDTH 定尺寸，不随骨长变形。
 */
export const SLOT_FIT: Record<Slot, 'stretch' | 'uniform'> = {
  head: 'uniform', neck: 'uniform', spine: 'uniform', clavicle: 'stretch',
  upperArm: 'stretch', foreArm: 'stretch', hand: 'uniform',
  thigh: 'stretch', shin: 'stretch', foot: 'uniform',
  joint: 'uniform',
};

/**
 * uniform 槽位：这个尺寸是**整体大小**（米，标准身材）。
 * stretch 槽位：这个尺寸是**横向宽度**（米）。
 */
export const SLOT_WIDTH: Record<Slot, number> = {
  head: 0.21, neck: 0.11, spine: 0.44, clavicle: 0.10,
  upperArm: 0.105, foreArm: 0.09, hand: 0.13,
  thigh: 0.145, shin: 0.115, foot: 0.21,
  joint: 0.11,
};
// 这些数是在 /dev/figure.html 上按标准身材 1.7m 目测调出来的（T-13）。
// 改之前先开那个页面，改完再开一次 —— 这张表是"身体比例"的唯一旋钮。
