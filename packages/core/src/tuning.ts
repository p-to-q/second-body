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
  /**
   * ⚠️ 2026-09-12 改过量级。原值 `minCutoff 1.0 / beta 0.02` 是错的：
   * **beta 乘的是速度**，而 world landmark 是**米制**信号 ——
   * 手以 1 m/s 挥动时只把截止频率从 1.0 抬到 1.02 Hz，等于把手焊死。
   *
   * 现值取自 MediaPipe 自己的产线配置
   * （`mediapipe/modules/pose_landmark/pose_landmark_filtering.pbtxt`，
   * `geaxgx/depthai_blazepose` 有独立复刻）：world landmark 用
   * `min_cutoff 0.1 / beta 40 / disable_value_scaling: true`。
   *
   * 这组值偏"跟手"不偏"稳"。装置要的可能相反 —— 但那要等真人输入才能定（docs/09 U14）。
   */
  minCutoff: 0.1,
  beta: 40,
  dCutoff: 1.0,
};

/**
 * 姿态精修（`core/refine.ts`）。**这是现场逆光把追踪打崩时唯一能救场的一组旋钮**，
 * 所以它必须在这里找得到，而不是埋在 refine.ts 里（P0）。
 *
 * 分组的理由：躯干抖起来整具身体都在晃，所以少跟随多稳定；
 * 手腕是观众唯一会盯着看的东西，宁可抖一点也不能滞后。
 * ⚠️ 分组档位是自创的，上游没有先例，且在合成输入上测不出收益 —— 它可能是对的，
 * 但**现在没有证据**（docs/24）。
 */
export const REFINE = {
  /** 总开关。接进运行时后由 `?refine=0` 关掉做 A/B */
  enabled: true,
  groups: {
    torso: { minCutoff: 0.1, beta: 20, dCutoff: 1.0 },
    limb: { minCutoff: 0.1, beta: 40, dCutoff: 1.0 },
    extremity: { minCutoff: 0.1, beta: 60, dCutoff: 1.0 },
  },
  /** 低于这个 visibility 视为被遮挡 */
  occlusionVisibility: 0.4,
  /**
   * 遮挡时最多保持多少秒。上限来自 Pose2Sim 的 `interp_if_gap_smaller_than = 20` 帧 ——
   * 比这更长的缺口它不插值，因为再补就是在编。超时**放手**把 visibility 归零，
   * 而不是无限保持一个越来越假的位置。
   */
  holdSeconds: 20 / 30,
  /** 关节回来之后用多少秒爬回真实位置（不爬会"啪"地一下） */
  rejoinSeconds: 0.25,
  /** 追踪质量从这里开始降级，到这里触底 */
  qualityStart: 0.65,
  qualityFloor: 0.5,
  /** 触底时截止频率乘这个数 —— 更平滑更迟钝。**抽搐比迟钝更毁体验** */
  slowdownFactor: 0.25,
  /** visibility 自己的低通。不做的话置信度会在门限上下颤，遮挡补全一帧进一帧出 */
  visibilityAlpha: 0.1,
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

  /**
   * 表面语言 —— 让团块**像物质**而不是像塑料。
   *
   * mass 那条线交回来时自己指出的缺口：「原作读起来像物质，
   * 部分是因为那个物质在动」。三层叠加，各管一件事：
   *  - breathe 全局慢呼吸：让静止时的身体不死
   *  - flow 沿骨链的行波：物质在**流过**肢体，这是"流过身体的物质"最直接的落点
   *  - boil 运动能量驱动的高频起伏：动得越猛，表面越沸
   *
   * 幅度都很小是故意的。三个波频率不同、相位不同，很少同时到峰值，
   * 实际合成幅度约 `sqrt(ΣA²) ≈ 0.17`（算术和 0.285 是不会发生的最坏情况）。
   * 真正的护栏是下面的 `mulMin/mulMax` 硬夹 —— **破了它剪影就散了**，
   * 那时读到的不是"材质在动"而是"模型在抖"。
   */
  surface: {
    breatheAmp: 0.055,
    breatheHz: 0.19,
    flowAmp: 0.10,
    flowHz: 0.42,
    /** 一根骨头上容纳多少个波。小于 1 看不出流动，大于 3 变成噪点 */
    flowWaves: 1.6,
    boilAmp: 0.13,
    boilHz: 2.7,
    /** 半径乘数的硬夹。破了它剪影就散了 */
    mulMin: 0.62,
    mulMax: 1.45,
    /** 能量输入的平滑时间常数（秒） */
    energyTau: 0.35,
  }
};

// ── 7c. 舞台：灯光 / 取景 / 后期（现场调参的大头） ─────────────────────────
/**
 * 这三块原本散在 stage.ts / post.ts / framing.ts 三个文件里。
 * 它们恰恰是**到了现场最想改、而且改完不该重新构建**的那些数（P0）。
 */
export const STAGE = {
  // ── 等身（docs/00 §6）：观众站在 2.5–3m 外，眼高 1.58m ──
  /** 相机到身体的距离（米） */
  viewDistance: 2.8,
  /** 机位高度 = 观众眼高（米） */
  eyeHeight: 1.58,
  /**
   * 换条目时相机重新取景的时间常数（秒）。
   * 取景**必须**是渐变的：docs/23 §S3 要求进场无缝，而遥控器数字键直选是一下一个物种。
   */
  framingTau: 0.45,
  near: 0.08,
  /** 远裁剪面必须比背景布还远，否则背景布被裁掉、露出 scene.background 那条路径 */
  far: 260,
  /** 极缓慢的机位呼吸（米）。只为了让静帧之外的画面不像贴图，别调大 */
  sway: 0.012,

  // ── 灯 ──
  /** 三盏灯的方向（会被归一化后放到 lightDistance 上），面朝 +Z 的身体 */
  keyDir: [1.5, 2.35, 1.85] as const,
  fillDir: [-2.3, 1.25, 1.7] as const,
  rimDir: [-0.85, 2.1, -2.5] as const,
  lightDistance: 5.0,
  /** 灯瞄准的高度（米）：胸口略下，阴影和高光都落在最该看的地方 */
  aimHeight: 0.98,
  /** IDLE 时灯保留的比例。**不是 0** —— 黑屏会让观众以为坏了（docs/05 §5） */
  idleFloor: 0.40,

  // ── 阴影 ──
  shadowMapSize: 2048,
  /** 阴影正交相机的半宽/半高（米） */
  shadowExtent: 1.9,
  shadowBias: -0.0009,
  shadowNormalBias: 0.022,

  // ── 地面 ──
  /**
   * 地面圆盘的半径（米）。**很大是故意的**：盘子的边缘必须落在地平线上，
   * 否则画面里会出现一条弧 —— 观众一眼就看出这是一张摆在虚空里的圆盘。
   * 18m 的时候那条弧清清楚楚（第一轮取证图里就是）。
   */
  groundRadius: 48,
  /** 地面开始淡进背景色的半径（米） */
  groundFadeStart: 3.0,
  groundFadeEnd: 16.0,
  groundRoughNear: 0.58,
  groundRoughFar: 0.96,
  /** 背景布（朝内的圆筒）的半径与高度（米）。必须比地面盘子更远 */
  backdropRadius: 62,
  backdropHeight: 140,

  // ── 粒子 ──
  particleCount: 760,
  particleSeed: 0x5EC0D1,
  /**
   * 雾团半径（米）。1.75m 时它会铺满整个下半屏，读起来是"到处都是灰"而不是
   * "地上有一团东西在呼吸"——空场那一帧要能看出是**一个**东西。
   */
  particleRadius: 1.2,

  // ── 升档脉冲（docs/23 §S5：600ms / 亮度 +8% / 0.15s 内 dt×0.4）──
  // 这三个数是**规格**，不是口味。docs/23 写死了它们，改之前先改那份文档。
  /** 整个事件的时长（秒） */
  pulseDuration: 0.60,
  /** 起落时间（秒）：这么快亮起来，剩下的时间落回去 */
  pulseAttack: 0.09,
  /** 峰值时全身亮多少。+8%，**再多一点就成了闪光灯** */
  pulseGain: 0.08,
  /** 时间停滞：脉冲瞬间 dt 缩到这个倍率 */
  stasisScale: 0.40,
  /** 停滞恢复到 1 的时长（秒） */
  stasisRecover: 0.15,

  // ── 场景（`app/src/stage/scenes.ts`，只增不改：不带 `?scene=` 时按物种自动挑）──
  // 这里只放**现场真的会转**的那几个数；一整套场景长什么样是审美，写在 scenes.ts。
  /**
   * 换场景的交叉淡入时长（秒）。和换主题共用同一条通道（`lerpLook`），
   * 但比 0.7s 长：换主题只是灯变了，换场景是**整个世界**变了，太快会像切台。
   */
  sceneFade: 1.6,
  /**
   * 雾密度硬顶。雾是"地面化进天幕"的唯一机制，密度失控会把身体也一起吃掉 ——
   * 身体在 2.8m 处，密度 0.30 时它已经损失 ~35% 对比度。
   */
  fogDensityMax: 0.16,
  /**
   * 接触阴影"紧的那一圈"的半径上限（米）。超过这个数就不再读作"脚踩在地上"，
   * 而是读作"地上有一摊污渍"—— 第一轮那个 0.62m 的大圆斑正是这个失败。
   */
  contactCoreRadiusMax: 0.34,
  /**
   * 脚抬多高就不再画接触阴影（米）。接触阴影的全部意义是"它**碰到**地面了"，
   * 抬起的脚还带着一摊黑影，比没有接触阴影更假。
   */
  contactLiftRange: 0.22,
  /** 同时参与接触阴影的落地点数量。2 足 / 4 足都够用，再多着色器就不划算了 */
  contactPoints: 4,
  /** 粒子基础尺寸（米，公告牌半宽）。场景用 `particleSize` 在它上面乘 */
  particleSize: 0.016,
};

export const POST = {
  focusDistance: 2.8,
  bloomRadius: 0.62,
  focalLength: 1.35,
  bokehScale: 1.1,
  vignette: 0.34,
  grain: 0.016,
  aoSamples: 8,
  aoRadius: 0.35,
  aoResolutionScale: 0.5,
};

export const FRAMING = {
  /**
   * 画面高度 / 骨架高度。这个数**不是口味**：它由「人形必须保持原样」定死 ——
   * 标准站姿的人形骨架盒高 1.57m，原来的画面高度是 2.45m，2.45 / 1.57 = 1.56。
   */
  heightFactor: 1.56,
  /** 夹住插值的两端：再矮的身体也不会被放大到超过这个程度，再高的也不会被推出去 */
  minFrameHeight: 1.35,
  maxFrameHeight: 3.20,
  /** 竖屏时至少框住这么宽（米），免得手臂/前腿被切掉 */
  minFrameWidth: 1.45,
  /** 宽度余量：身体两侧各留一点，不要贴着画面边 */
  widthMargin: 1.25,
  /**
   * 身体中心相对画面中心往上抬多少（× 身体高度）。
   * 人看一个站着的人，头顶留白比脚下多一点点才自然；同一条规则对四足也成立。
   */
  centerLift: 0.07,
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

  // ── 预算闸门（服务端硬上限，docs/17 §4）────────────────────────────────
  // 前端的 maxPerSession 是礼貌，这几条是钱。前端可以被改、被绕过、被多开标签页，
  // 所以真正的上限必须在 Node 侧、且超了要**明确拒绝**而不是静默退化。
  /** Gen-2.5-Low 基础生成的单价（docs/07 §2）。提交时按它预扣，完成后按实际 consumed 对账 */
  creditsPerJob: 0.5,
  maxCreditsPerJob: 1,
  maxCreditsPerSession: 1,
  maxCreditsPerDay: 20,
  /** 余额低于「预扣 + 这个缓冲」就不提交。与 generate.ts 的批量闸门同一条规矩 */
  balanceReserve: 5,
  /**
   * 服务端单个任务的墙钟上限。超了强制 failed。
   * 为什么不只靠 rodin.ts 的 8 分钟轮询超时：下载、规范化、写盘都在它之外，
   * 任何一步卡住都会把任务永远钉在 generating —— 而前端只会一直转圈。
   */
  jobTimeoutMs: 4 * 60_000,

  // ── 血统池（docs/17 §5）────────────────────────────────────────────────
  /** 相对 assets/parts/ 的子目录。**不与主库混放**：主库是策展过的，血统池是现场长出来的 */
  lineageDir: 'lineage',
  /** 下一个观众的 genome 抽到前人留下件的概率（前端消费，服务端只负责给候选） */
  lineageChance: 0.35,
  /** 索引里最多留多少件（超出按时间丢最旧的条目，glb 文件不删） */
  lineageMaxParts: 240,
  /** 一次 GET /__slow/lineage 最多吐多少件，防止一年后的索引把开场拖住 */
  lineageServeLimit: 64,
};
