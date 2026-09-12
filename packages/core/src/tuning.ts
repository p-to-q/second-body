/**
 * ⚙️ 全项目的旋钮，都在这一个文件里。
 *
 * 规则（P0 的延伸）：
 *  - 任何"现场要调的数"都必须住在这里，不许散落在各模块顶部。
 *  - 各模块 **import 这里的值**，不再自己声明常量表。
 *  - 改这里不需要读任何其它文件；改这里以外的地方要调参，就是放错位置了。
 *
 * 分组顺序 = 数据流顺序：采集 → 平滑 → 骨架 → 运动 → 演化 → 形态 → 渲染 → 慢回路。
 */
import type { Slot } from './types.ts';

// ── 0. 时间 ────────────────────────────────────────────────────────────────
export const TIME = {
  /** dt 钳位范围（秒）。切标签页回来会给出几秒的 dt，不钳会把所有状态机冲飞 */
  dtMin: 1 / 240,
  dtMax: 1 / 15,
};

// ── 1. 采集 ────────────────────────────────────────────────────────────────
export const CAPTURE = {
  /** 低于这个分数视为"没有人" */
  minScore: 0.5,
  /** 单个关节低于这个 visibility 就不参与运动统计 */
  minJointConfidence: 0.4,
  /** 目标推理频率（Hz）。渲染永远不等推理 */
  targetHz: 30,
  requestedVideo: { width: 1280, height: 720 },
};

// ── 2. 平滑 ────────────────────────────────────────────────────────────────
export const FILTER = {
  /** One-Euro：静止时的截止频率(Hz)。越小越稳越滞后 */
  minCutoff: 1.0,
  /** 速度增益。越大越跟手、越抖 */
  beta: 0.02,
  dCutoff: 1.0,
};

// ── 3. 骨架稳定化 ──────────────────────────────────────────────────────────
export const SKELETON = {
  /** 骨长滑动中位数的窗口（帧） */
  medianWindow: 90,
  /** 热身期：这么多帧内直接用测量值 */
  warmupFrames: 30,
  /** 标准身材身高（米）。bodyScale = 观测身高 / 这个数 */
  referenceHeight: 1.7,
  /**
   * 两耳中点到颅顶的距离（米）。
   * MediaPipe 给不出颅顶，headCenter 是两耳中点（≈耳/眼高度），
   * 不补这一段会把身高系统性低估 ~6%，下游整具身体跟着偏小。
   */
  craniumOffset: 0.11,
};

// ── 4. 运动特征（EMA 时间常数，秒） ────────────────────────────────────────
export const MOTION = {
  tauSpeed: 0.25,
  tauEnergy: 1.5,
  tauSymmetry: 1.0,
  tauJerk: 0.3,
  /** stillness = 1 - clamp(speed / this) */
  stillnessSpeedRef: 0.3,
};

// ── 5. 演化 ────────────────────────────────────────────────────────────────
export const EVOLUTION = {
  gain: 1.0,
  /** 完全静止时每秒掉多少 charge */
  decay: 0.08,
  thresholds: [0, 1.5, 5.0, 11.0],
  /** 降档滞回：低于 threshold×(1-hysteresis) 才降 */
  hysteresis: 0.25,
  /** 两次换装之间的最小间隔（秒） */
  cooldown: 2.0,
  chargeMax: 14.0,
};

// ── 6. 在场生命周期（秒） ──────────────────────────────────────────────────
export const PRESENCE = {
  enterDelay: 0.4,
  loseDelay: 1.0,
  enterAnim: 1.2,
  leaveAnim: 2.5,
};

// ── 7. 形态与装配 ──────────────────────────────────────────────────────────
export const MORPH = {
  /** 换装 crossfade 时长（秒） */
  crossfade: 1.2,
  /** 同时最多几个槽位在做换装动画，其余排队（避免"整个人炸开"） */
  maxConcurrentSwaps: 3,
  /** 组装动画：新部件从骨头轴向外这么远吸附回位（米） */
  assembleOffset: 0.15,
  /** 整具身体同 family 的概率 */
  sameFamilyChance: 0.8,
  /** tier 3 允许跨主题杂交的槽位数 */
  hybridSlotsAtTier3: 2,
  /** 关节盖片半径 = 相邻骨 girth × 这个系数 */
  jointCapScale: 0.75,
};

/**
 * 挂载模式：四肢是"可以被拉长的管子"→ stretch；
 * 头/躯干/手/脚/关节是"有固有比例的物体"→ uniform（docs/04 §4）。
 */
export const SLOT_FIT: Record<Slot, 'stretch' | 'uniform'> = {
  head: 'uniform', neck: 'uniform', spine: 'uniform', clavicle: 'stretch',
  upperArm: 'stretch', foreArm: 'stretch', hand: 'uniform',
  thigh: 'stretch', shin: 'stretch', foot: 'uniform',
  joint: 'uniform',
};

/**
 * 身体比例表（米，标准身材 1.7m）。**这是"身体长什么样"的唯一旋钮。**
 * stretch 槽位读作"横向宽度"，uniform 槽位读作"整体大小"。
 * 调它之前先开 /dev/figure.html，调完再开一次。
 */
export const SLOT_WIDTH: Record<Slot, number> = {
  head: 0.21, neck: 0.11, spine: 0.44, clavicle: 0.10,
  upperArm: 0.105, foreArm: 0.09, hand: 0.13,
  thigh: 0.145, shin: 0.115, foot: 0.21,
  joint: 0.11,
};

// ── 7b. 团块身体（mass / metaball，docs/18 B 档） ──────────────────────────
/**
 * 改这些数之前先开 `/dev/mass.html`，改完再开一次。
 * 放在这里而不是 mass.ts 里，是因为 P0：**所有现场要调的数集中一处**。
 */
export const MASS = {
  /** 体素分辨率。降它就是这个方案的降级路径 */
  res: 40,
  resMin: 16,
  resMax: 64,
  /** 沿骨轴每隔多少米撒一个球（米，标准身材）。全身骨长合计 ≈4.45m → ~85 个球 */
  ballSpacing: 0.055,
  /** 单根骨头最多几个球（免得某帧骨长被追踪冲飞时爆掉预算） */
  maxBallsPerBone: 10,
  /** 全身球数硬顶。超了丢弃，不是"以后再优化"（docs/02 P5） */
  maxBalls: 128,
  /**
   * 球半径 = SLOT_WIDTH[slot]/2 × bodyScale × 这个系数。
   * SLOT_WIDTH 是**宽度**（直径），所以先除以 2 —— 忘了这个 2 会得到一个土豆。
   * 系数比 1 小是因为相邻球的场会叠加，融出来的表面比单球半径胖一圈。
   */
  radiusScale: 0.85,
  /** 半径的体素下限：细过这个数的骨头会在体素网格里整根消失 */
  minRadiusVoxels: 1.15,
  /**
   * 少数槽位对 SLOT_WIDTH 的修正。**只有两条，而且都有理由：**
   * - `spine`：SLOT_WIDTH 0.44 说的是胸廓的**宽**，但球是球，直接拿它当直径会得到一个
   *   前后 44cm 的蛋，把头和肩全吞进去。契约里没有"厚度"这一项，只能在这里补。
   * - `head`：躯干收窄之后头要能从肩上探出来，否则整个人读作"戴了个兜帽"。
   * 其余槽位一律 1（不列在这里）。
   */
  slotScale: { spine: 0.72, head: 1.15 } as Partial<Record<string, number>>,
  /** 场盒半边长 = 身高 × 这个系数。盒子越小体素越细，但抬手会被切掉 */
  boxHalfOfHeight: 0.62,
  /** 等值面阈值。调高 = 团块变瘦、更容易断开 */
  isolation: 80,
  /**
   * addBall 的衰减项。它同时决定每个球要遍历多少体素：
   * 截断半径 / 表面半径 = sqrt((isolation+subtract)/subtract)。
   * 调小 → 融得更柔但更慢；调大 → 更快但球与球之间的过渡更硬。
   */
  subtract: 30,
  /** position/normal 缓冲区按这个开。res=64 的实测三角数远在它之下 */
  maxPolyCount: 60_000,
  /** 场盒中心跟随身体质心的 EMA 时间常数（秒）。0 = 硬跟随，会让整个团块抖 */
  centerTau: 0.10,
};

// ── 8. 渲染预算（docs/02 P5；超了就是 bug，不是"以后再优化"） ──────────────
export const BUDGET = {
  maxInstances: 64,
  maxTriangles: 250_000,
  maxDrawCalls: 40,
  maxCpuMsPerFrame: 4,
  maxPartTris: 5000,
  maxPartBytes: 1_500_000,
};

// ── 9. 慢回路 ──────────────────────────────────────────────────────────────
export const SLOW_LOOP = {
  /** 同一个人最多触发几次 */
  maxPerSession: 1,
  /** 进入 ALIVE 多久之后才允许触发（秒） */
  armAfter: 20,
  /** 前端轮询间隔与上限 */
  pollIntervalMs: 5000,
  maxPolls: 24,
  requestTimeoutMs: 12_000,
  /** 长到身上的目标槽位 */
  targetSlots: ['spine', 'head'] as Slot[],
};
