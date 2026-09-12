/**
 * 纯装配：(genome, skeleton, library) → PartInstance[]。
 *
 * 这里**不碰 three、不碰 DOM、不持有状态**，只把 docs/04 §4 的挂载数学
 * （`core/attach.ts`，不重写）套到 genome 的每一个槽位上，外加 docs/05 §4 的关节盖片。
 * 渲染怎么画是 `creature.ts` 的事。
 *
 * 之所以要独立成文件：装配是"身体长什么样"的全部规则，
 * 它必须能在没有 GPU 的地方被读、被 diff、被单测。
 */
import { attachMatrix, jointMatrix } from '../../../core/src/attach.ts';
import { IS_LEFT, SLOT_OF_BONE } from '../../../core/src/slots.ts';
import { MORPH, SKELETON, SLOT_FIT, SLOT_WIDTH } from '../../../core/src/tuning.ts';
import { BONES } from '../../../core/src/skeleton.ts';
import type {
  Bone, BoneId, Genome, Mat4, MaterialRole, PartMeta, Skeleton, Slot, SlotKey, Vec3,
} from '../../../core/src/types.ts';

/** 一个要画的部件实例。渲染端只认这个结构 */
export interface PartInstance {
  /** 稳定的实例标识：骨头 id，或 `joint:<关节名>` */
  key: string;
  /** 这个实例的 genome 槽位（关节盖片全部是 'joint'） */
  slotKey: SlotKey;
  slot: Slot;
  partId: string;
  materialRole: MaterialRole;
  /** 用负 X 缩放实现的镜像 → 渲染端必须双面渲染或翻转正反面剔除（docs/04 §4） */
  mirrored: boolean;
  /** 列主序 4x4，与 three.js Matrix4.elements 一致 */
  matrix: Mat4;
}

/** 一个槽位这一帧要画成什么样。换装动画期间一个槽位会有两条（旧的缩小 / 新的长回来） */
export interface SlotRender {
  partId: string;
  materialRole: MaterialRole;
  /** 0..1 整体缩放，用于 crossfade */
  scale?: number;
  /** 沿骨头轴（关节盖片沿"离开骨盆"方向）外移多少米，用于组装动画 */
  offset?: number;
}

export interface AssembleOptions {
  /** 覆盖某些槽位的渲染内容；没给的槽位按 genome 原样画 */
  render?: Partial<Record<SlotKey, SlotRender[]>>;
  /** 实例总数上限（docs/02 P5）。超了就丢弃多余的，绝不越预算 */
  maxInstances?: number;
}

/** assemble 只需要"按 id 查 meta"这一件事 —— 传整个 PartLibrary 也行 */
export interface MetaSource {
  metaOf(partId: string): PartMeta;
}

/**
 * 关节盖片表（docs/05 §4）。
 * 相邻骨头从 `core/skeleton.ts` 的 `BONES` 推得出来，但 hipL/hipR 例外：
 * 骨盆→胯之间没有骨头，所以那两个关节没有"结束于此"的骨头，必须显式写出来。
 * `proximal` = 父部件（结束于该关节的那根骨）；它若 `capJoint: true` 就跳过盖片。
 */
export interface JointCap {
  joint: string;
  neighbors: BoneId[];
  proximal: BoneId | null;
}

export const JOINT_CAPS: JointCap[] = (() => {
  const ends = new Map<string, BoneId[]>();
  const starts = new Map<string, BoneId[]>();
  for (const [id, a, b] of BONES) {
    (starts.get(a) ?? starts.set(a, []).get(a)!).push(id as BoneId);
    (ends.get(b) ?? ends.set(b, []).get(b)!).push(id as BoneId);
  }
  const caps: JointCap[] = [];
  for (const joint of new Set([...starts.keys(), ...ends.keys()])) {
    const prox = ends.get(joint) ?? [];
    const dist = starts.get(joint) ?? [];
    // 'neck' 关节不盖：neck 这根骨头本身就挂了一个 joint 槽位的部件（SLOT_OF_BONE.neck === 'joint'）
    if (joint === 'neck') continue;
    if (prox.length + dist.length < 2) continue;    // 末端（headCenter / handTip / footIdx）不盖
    caps.push({ joint, neighbors: [...prox, ...dist], proximal: prox[0] ?? null });
  }
  // 胯：没有骨头结束在这里，父部件按 spine 算
  caps.push({ joint: 'hipL', neighbors: ['spine', 'thighL'], proximal: 'spine' });
  caps.push({ joint: 'hipR', neighbors: ['spine', 'thighR'], proximal: 'spine' });
  return caps;
})();

/**
 * 这根骨头在标准身材上的"横向宽度"（米）。
 * stretch 槽位的 SLOT_WIDTH 本来就是横向宽度；uniform 槽位的读作"整体大小"
 * （spine = 0.44 是整个躯干的尺寸，不是腰围），拿它当关节半径会得到一个巨大的球，
 * 所以 uniform 槽位一律退回 SLOT_WIDTH.joint。
 */
function boneGirthMeters(bone: BoneId): number {
  const slot = SLOT_OF_BONE[bone];
  return SLOT_FIT[slot] === 'stretch' ? SLOT_WIDTH[slot] : SLOT_WIDTH.joint;
}

const finite = (v: number, fallback: number) => (Number.isFinite(v) ? v : fallback);

function defaultRender(genome: Genome, key: SlotKey): SlotRender[] {
  const pick = genome.slots?.[key];
  if (!pick || typeof pick.partId !== 'string') return [];
  return [{ partId: pick.partId, materialRole: pick.materialRole ?? 'primary' }];
}

/** 单位方向 p0→p1，退化时回退 +Y */
function dirOf(p0: Vec3, p1: Vec3): Vec3 {
  const d: Vec3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const l = Math.hypot(d[0], d[1], d[2]);
  return l > 1e-9 ? [d[0] / l, d[1] / l, d[2] / l] : [0, 1, 0];
}

/** 列主序矩阵的平移列就是 m[12..14] —— 组装动画的外移直接加在这里 */
function translateInPlace(m: Mat4, dir: Vec3, dist: number): void {
  if (!dist) return;
  m[12] += dir[0] * dist;
  m[13] += dir[1] * dist;
  m[14] += dir[2] * dist;
}

export function assemble(
  genome: Genome,
  skeleton: Skeleton,
  lib: MetaSource,
  opt: AssembleOptions = {},
): PartInstance[] {
  const out: PartInstance[] = [];
  const cap = finite(opt.maxInstances ?? Infinity, Infinity);
  if (!genome || !skeleton || !Array.isArray(skeleton.bones)) return out;

  // bodyScale = 观测身高 / 标准身高（docs/04 §4）。身高是外部输入 → 必须钳位
  const height = finite(skeleton.height, SKELETON.referenceHeight);
  const bodyScale = Math.min(2.5, Math.max(0.4, height / SKELETON.referenceHeight));

  const byId = new Map<BoneId, Bone>();
  for (const b of skeleton.bones) if (b && b.id) byId.set(b.id, b);

  // ── 1. 骨头部件 ────────────────────────────────────────────────────────
  for (const bone of skeleton.bones) {
    if (out.length >= cap) return out;
    if (!bone || !bone.id) continue;
    const slot = SLOT_OF_BONE[bone.id];
    if (!slot) continue;

    const renders = opt.render?.[bone.id] ?? defaultRender(genome, bone.id);
    const mode = SLOT_FIT[slot];
    const dir = dirOf(bone.p0, bone.p1);

    for (const r of renders) {
      if (out.length >= cap) return out;
      const meta = lib.metaOf(r.partId);
      const s = Math.max(0, Math.min(1, finite(r.scale ?? 1, 1)));
      if (s <= 1e-3) continue;                       // 缩到看不见就别占实例位

      const girth = (SLOT_WIDTH[slot] * bodyScale) / Math.max(1e-4, meta.localGirth);
      const mirrored = IS_LEFT[bone.id] && meta.symmetry === 'mirror';

      const matrix: Mat4 = new Array(16).fill(0);
      attachMatrix(bone, matrix, {
        mode,
        girth: girth * s,
        mirror: mirrored,
        // uniform 模式的 sy 已经含 girth（= g·ls），再乘 s 会平方；stretch 的 sy = len·ls 才需要
        lengthScale: mode === 'stretch' ? s : 1,
      });
      translateInPlace(matrix, dir, finite(r.offset ?? 0, 0));

      out.push({
        key: bone.id,
        slotKey: bone.id,
        slot,
        partId: r.partId,
        materialRole: r.materialRole,
        mirrored,
        matrix,
      });
    }
  }

  // ── 2. 关节盖片（docs/05 §4） ──────────────────────────────────────────
  const joints = skeleton.joints ?? {};
  const pelvis = joints['pelvis'] ?? [0, 0, 0];
  const jointRenders = opt.render?.['joint'] ?? defaultRender(genome, 'joint');

  for (const capDef of JOINT_CAPS) {
    if (out.length >= cap) return out;
    const p = joints[capDef.joint];
    if (!p) continue;

    // 父部件自带盖片就不重复盖
    const parent = capDef.proximal ? byId.get(capDef.proximal) : undefined;
    if (parent) {
      const parentPick = genome.slots?.[parent.id];
      if (parentPick && lib.metaOf(parentPick.partId).capJoint) continue;
    }

    // 半径 = max(相邻两骨 girth) × MORPH.jointCapScale（旋钮住在 tuning.ts）
    let widest = 0;
    for (const n of capDef.neighbors) widest = Math.max(widest, boneGirthMeters(n));
    const radiusMeters = widest * bodyScale * MORPH.jointCapScale;
    const dir = dirOf(pelvis, p);

    for (const r of jointRenders) {
      if (out.length >= cap) return out;
      const meta = lib.metaOf(r.partId);
      const s = Math.max(0, Math.min(1, finite(r.scale ?? 1, 1)));
      if (s <= 1e-3) continue;

      const matrix: Mat4 = new Array(16).fill(0);
      jointMatrix(p, (radiusMeters * s) / Math.max(1e-4, meta.localGirth), matrix);
      translateInPlace(matrix, dir, finite(r.offset ?? 0, 0));

      out.push({
        key: `joint:${capDef.joint}`,
        slotKey: 'joint',
        slot: 'joint',
        partId: r.partId,
        materialRole: r.materialRole,
        mirrored: false,
        matrix,
      });
    }
  }

  return out;
}

/** 这个 genome 会用到哪些 partId —— 给 `library.preload()` 用 */
export function partIdsOf(genome: Genome): string[] {
  const ids = new Set<string>();
  for (const pick of Object.values(genome?.slots ?? {})) {
    if (pick && typeof pick.partId === 'string') ids.add(pick.partId);
  }
  return [...ids];
}
