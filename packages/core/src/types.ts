/**
 * FROZEN CONTRACT — 见 docs/02-ENGINEERING-PRINCIPLES.md P0
 * 只允许新增可选字段。不要修改已有字段的名字/含义/单位。
 * 只使用可擦除的 TS 语法（无 enum / namespace / parameter properties），
 * 因为我们靠 Node 的 type stripping 直接跑 .ts，没有编译步骤。
 */

// 唯一的一条 import，而且是 `import type` —— 类型在 Node 的 type stripping 里
// 会被整条擦掉，所以它不产生运行时循环依赖（`bodyplan.ts` 反过来也只 import type）。
// 为什么不在这里另抄一份九个方案的联合类型：抄一份就有两份真相，
// 而这个字段存在的全部意义就是"声明必须等于运行时认得的那个集合"。
import type { BodyPlanId, BodyPlanSpec } from './bodyplan.ts';

export type Vec3 = [number, number, number];
/** 列主序 4x4，与 three.js Matrix4.elements 一致 */
export type Mat4 = number[];

// ─────────────────────────── Pose / Skeleton ───────────────────────────

/** MediaPipe PoseLandmarker 的一个 landmark（worldLandmarks，单位米） */
export interface Landmark {
  x: number; y: number; z: number;
  visibility?: number;
}

export interface RawPose {
  /** 33 个 world landmarks，MediaPipe 原始坐标系 */
  world: Landmark[];
  /** 33 个归一化图像坐标 0..1，用于抠图/调试叠加 */
  screen?: Landmark[];
  /** 整体置信度 0..1 */
  score: number;
  /** 采集时间戳，毫秒 */
  t: number;
}

export type BoneId =
  | 'spine' | 'neck' | 'head'
  | 'clavicleL' | 'clavicleR'
  | 'upperArmL' | 'upperArmR'
  | 'foreArmL' | 'foreArmR'
  | 'handL' | 'handR'
  | 'thighL' | 'thighR'
  | 'shinL' | 'shinR'
  | 'footL' | 'footR';

export interface Bone {
  id: BoneId;
  p0: Vec3;
  p1: Vec3;
  /** |p1-p0|，经骨长稳定化之后的值（米） */
  length: number;
  /** 绕主轴扭转，弧度。v1 恒为 0，见 docs/04 §5 */
  roll: number;
  /** 0..1，两端关节 visibility 的较小值 */
  confidence: number;
}

export interface Skeleton {
  bones: Bone[];
  /** 关节点（世界系，米），键见 docs/04 §2 */
  joints: Record<string, Vec3>;
  /** 观测身高（米），用于归一化所有运动特征 */
  height: number;
  /** 骨长中位数是否还在热身（前 ~30 帧） */
  warmingUp: boolean;
  t: number;
}

// ─────────────────────────── Motion / Evolution ───────────────────────────

export interface MotionFeatures {
  speed: number;          // 快 EMA，τ=0.25s
  energy: number;         // 慢 EMA，τ=1.5s
  expansiveness: number;  // 0.2..0.8
  verticality: number;    // 0..0.6
  symmetry: number;       // -1..1
  jerk: number;
  stillness: number;      // 0..1
}

export type Tier = 0 | 1 | 2 | 3;

export interface EvolutionState {
  charge: number;
  tier: Tier;
  /** 本帧是否发生了 tier 变化 */
  tierChanged: boolean;
  /** 距离下一档的进度 0..1，给 UI/音效用 */
  progress: number;
}

export type PresenceState = 'IDLE' | 'ENTERING' | 'ALIVE' | 'LEAVING';

export interface Presence {
  state: PresenceState;
  /** 当前状态已持续时间（秒） */
  elapsed: number;
  /** 进入/离开动画的 0..1 进度 */
  transition: number;
}

// ─────────────────────────── Parts / Genome ───────────────────────────

export type Slot =
  | 'head' | 'neck' | 'spine' | 'clavicle'
  | 'upperArm' | 'foreArm' | 'hand'
  | 'thigh' | 'shin' | 'foot'
  | 'joint';

export interface PartMeta {
  id: string;
  slot: Slot;
  tier: Tier;
  file: string;
  family: string;
  /** 归一化后横向最大尺寸 max(sizeX,sizeZ)（长度=1 时）。运行时用它反算横向缩放 */
  localGirth: number;
  triCount: number;
  aabb: { min: Vec3; max: Vec3 };
  symmetry: 'mirror' | 'none';
  capJoint?: boolean;
  source?: {
    provider: string;
    model?: string;
    taskUuid?: string;
    seed?: number;
    recipeId?: string;
  };
}

export interface MaterialDef {
  id: string;
  tier: Tier;
  baseColor: Vec3;
  roughness: number;
  metalness: number;
  clearcoat?: number;
  emissive?: Vec3;
}

/**
 * 一个"可以变成的身体"。观众在开场轮播里选的就是它。
 * 权威定义在 packages/factory/recipes/roster.ts，见 docs/14-SPEC-roster.md。
 */
export interface ThemeDef {
  id: string;
  /** archetype = 机器人物种；guest = 嘉宾；character = 角色 */
  kind: 'archetype' | 'guest' | 'character';
  name: string;      // 中文名
  nameEn: string;
  tagline: string;   // 轮播卡片上的一行（中文原文）
  taglineEn?: string; // 对照
  /** [primary, secondary, accent] 的 materialId */
  palette: string[];
  /** procedural 条目不依赖 parts.json 里的部件，运行时用程序化几何 */
  source: 'rodin' | 'procedural';
  /** 形态空间坐标，0..1。轮播据此排布 */
  axes: { humanLike: number; lifeLike: number };
  /** light = 只自己生成 6 个标志性槽位，其余向 base 借 */
  coverage: 'full' | 'light';
  base?: string;
  /**
   * 身体方案（docs/18-BODY-PLANS.md）。缺省 'rig' = 人形刚体挂载、标准比例。
   * 这是"物种真的不一样"与"同一具人体换皮"之间的那个字段。
   *
   * 字符串 = 拓扑或比例预设；对象 = 拓扑 + 比例，可叠加
   * （`{ kind: 'quadruped', limb: 0.7 }`）。合法值是 `BODY_PLANS` 那九个，
   * 不要在这里另抄一份名单 —— 抄一份就会有一天对不上。
   *
   * **这里原来是 `string`。** 于是 `bodyPlan: 'quadrupd'` 类型通过、测试全绿、
   * `remapSkeleton` 走 default，物种静默地按人形刚体装配出场 ——
   * 看起来是一具没毛病的身体，只是不是它声明的那一具，没有任何一处会变红。
   * 收紧成 `BodyPlanId` 让这种拼错在 `tsc` 就红；parts.json 这份**外部**数据
   * 由 `check-parts.ts` 判错兜住（运行时仍然宽容，未知值按 'rig'，P2）。
   */
  bodyPlan?: BodyPlanId | BodyPlanSpec;
  /**
   * 这个条目取材自哪台**真实存在的**机器。没有这个字段 = 它是想象出来的
   * （docs/26 §H 的「虚」：世界上没有可取的原件）。契约变更由维护者发起，
   * 裁定与理由在 docs/42 §5 / §7 第 3 条。
   *
   * **它存在是为了被检查。** 名字是诗意的、不可查的（「巡逻」不告诉任何人
   * 它是哪台机器）；这几个字段是可查的，于是 `check:parts` 能问一个名字问不了的
   * 问题：**声称取自某台机器的条目，索引里的件是不是真的来自那台机器。**
   * `patrol` 记录写 Spot、身上穿 ANYmal 的矛盾整整存在了一轮，因为没有任何仪表在看。
   *
   * `id` / `name` / `nameEn` 一个都不动：seed 码是观众带走的物理痕迹，
   * 改 id 会让已经发出去的码对不上（docs/26 §D、docs/39 §4.7）。
   */
  machine?: {
    name: string;          // 'Spot'
    maker: string;         // 'Boston Dynamics'
    /**
     * 取到网格的那个 URL，**钉到 commit SHA**。
     * 缺席是一个判断而不是漏写：这台机器真实存在，但世界上没有一份可以
     * 再分发的几何（docs/42 §0 第一条的第二档）。这样的条目仍然记着它是谁 ——
     * 第二档和「虚」的区别就在它敢不敢说自己是谁。
     */
    source?: string;
    license?: string;      // 'BSD-3-Clause'
    /** 几何是真的还是生成的。第三档就靠这一个字段说实话 */
    geometry: 'real' | 'generated';
    note?: string;         // 'DRC/v5 液压那一代，非 2025 电动版'
  };
}

export interface PartLibraryIndex {
  version: number;
  generatedAt?: string;
  units: 'meters';
  convention: { axis: '+Y'; socketA: Vec3; socketB: Vec3; length: 1 };
  themes: ThemeDef[];
  materials: MaterialDef[];
  parts: PartMeta[];
}

export type MaterialRole = 'primary' | 'secondary' | 'accent';

export interface SlotPick {
  partId: string;
  materialRole: MaterialRole;
}

/** SlotKey = BoneId | 'joint' —— 每根骨头一个部件，外加统一的关节盖片 */
export type SlotKey = BoneId | 'joint';

export interface Genome {
  seed: number;
  tier: Tier;
  /** 主题 id。等于被选中部件的 PartMeta.family —— 两者是同一个概念 */
  theme: string;
  slots: Record<SlotKey, SlotPick>;
  materials: Record<MaterialRole, string>;
}

// ─────────────────────────── Slow loop (Hyper3D) ───────────────────────────

export type SlowJobStatus = 'idle' | 'submitted' | 'generating' | 'ready' | 'failed';

export interface SlowJob {
  id: string;
  status: SlowJobStatus;
  /** 目标槽位，默认 'spine' */
  slot: Slot;
  /** 就绪后可直接 fetch 的 glb 地址（由 localhost 代理提供） */
  url?: string;
  meta?: PartMeta;
  error?: string;
  submittedAt: number;
  readyAt?: number;
}

// ─────────────────────────── Misc ───────────────────────────

export interface Rng {
  /** [0,1) */
  next(): number;
  int(maxExclusive: number): number;
  pick<T>(arr: readonly T[]): T;
  /** 按权重抽取；weights 与 arr 等长且非负 */
  weighted<T>(arr: readonly T[], weights: readonly number[]): T;
}
