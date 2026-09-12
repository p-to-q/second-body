/**
 * FROZEN CONTRACT — 见 docs/02-ENGINEERING-PRINCIPLES.md P0
 * 只允许新增可选字段。不要修改已有字段的名字/含义/单位。
 * 只使用可擦除的 TS 语法（无 enum / namespace / parameter properties），
 * 因为我们靠 Node 的 type stripping 直接跑 .ts，没有编译步骤。
 */

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

/** 主题 = 观众在开场轮播里选的那个"世界"。见 docs/12-SPEC-themes.md */
export interface ThemeDef {
  id: string;
  name: string;      // 中文名
  nameEn: string;
  tagline: string;   // 轮播卡片上的一行
  /** [primary, secondary, accent] 的 materialId */
  palette: string[];
  /** procedural 主题不依赖 parts.json 里的部件，运行时用程序化几何 */
  source: 'rodin' | 'procedural';
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
