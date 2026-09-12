/**
 * 身体方案 · A 档：**骨架重映射**。规格见 docs/18-BODY-PLANS.md §2。
 *
 * 输入永远是人体骨架（站在那里的确实是个人），输出还是 17 根骨头，
 * 交给现有的刚体渲染器 —— **一行渲染代码都不用改**。
 *
 * 全部是纯函数：同样的输入永远同样的输出，可以在 node 里秒级验证（P1）。
 */
import type { Bone, BoneId, Skeleton, Vec3 } from './types.ts';
import { add, dist, norm, scale, sub, sane } from './vec.ts';

export type BodyPlanId = 'rig' | 'quadruped' | 'towering' | 'stub' | 'inverted';

export const BODY_PLANS: readonly BodyPlanId[] = ['rig', 'quadruped', 'towering', 'stub', 'inverted'];

/**
 * 参数化身体方案。
 *
 * 为什么需要它：光有拓扑（人形 / 四足）还不够 —— 23 个条目如果共用同一张身材表，
 * 那它们仍然是"同一个身材换皮"。比例本身就是物种身份的一大半：
 * 球是"巨大躯干 + 退化四肢"，桌宠是"大头 + 短身"，移动机械臂是"长臂"。
 * 这些都不需要新素材，只需要几个数。
 *
 * `kind` 缺省 'rig' 时只改比例，不改拓扑；也可以和 'quadruped' 叠加。
 */
export interface BodyPlanSpec {
  /** 拓扑。用 string 而不是 BodyPlanId 是故意的：parts.json 是外部数据，
   *  里面可能出现我们还不认识的 plan —— 未知值按 'rig' 处理，不该让类型系统炸掉（P2）。 */
  kind?: string;
  /** 四肢整体缩放，1 = 不变 */
  limb?: number;
  /** 躯干缩放 */
  torso?: number;
  /** 头（neck→headCenter）缩放 */
  head?: number;
  /** 手臂额外缩放，叠在 limb 之上 */
  arm?: number;
  /** 腿额外缩放，叠在 limb 之上 */
  leg?: number;
}

export type BodyPlan = BodyPlanId | BodyPlanSpec | string;

// ── 工具 ────────────────────────────────────────────────────────────────────

const J = (sk: Skeleton, n: string): Vec3 | null => {
  const v = sk.joints?.[n];
  return v && v.every(Number.isFinite) ? v : null;
};

/** 一条骨链的总长（缺哪段就跳过哪段） */
function chainLength(sk: Skeleton, names: readonly string[]): number {
  let total = 0;
  for (let i = 0; i + 1 < names.length; i++) {
    const a = J(sk, names[i]), b = J(sk, names[i + 1]);
    if (a && b) total += dist(a, b);
  }
  return total;
}

/** 从 joints 重建 bones。BONE_JOINTS 是 docs/04 §2 的表 */
const BONE_JOINTS: Record<BoneId, [string, string]> = {
  spine: ['pelvis', 'chest'], neck: ['chest', 'neck'], head: ['neck', 'headCenter'],
  clavicleL: ['chest', 'shoulderL'], clavicleR: ['chest', 'shoulderR'],
  upperArmL: ['shoulderL', 'elbowL'], upperArmR: ['shoulderR', 'elbowR'],
  foreArmL: ['elbowL', 'wristL'], foreArmR: ['elbowR', 'wristR'],
  handL: ['wristL', 'handTipL'], handR: ['wristR', 'handTipR'],
  thighL: ['hipL', 'kneeL'], thighR: ['hipR', 'kneeR'],
  shinL: ['kneeL', 'ankleL'], shinR: ['kneeR', 'ankleR'],
  footL: ['ankleL', 'footIdxL'], footR: ['ankleR', 'footIdxR'],
};

function rebuild(sk: Skeleton, joints: Record<string, Vec3>): Skeleton {
  const conf = new Map(sk.bones.map((b) => [b.id, b.confidence]));
  const bones: Bone[] = [];
  for (const b of sk.bones) {
    const [a, c] = BONE_JOINTS[b.id];
    const p0 = sane(joints[a] ?? b.p0), p1 = sane(joints[c] ?? b.p1);
    bones.push({ id: b.id, p0, p1, length: dist(p0, p1), roll: 0, confidence: conf.get(b.id) ?? b.confidence });
  }
  // 落地：最低的脚回到 y=0（docs/04 §3.5 的同一条规矩，重映射之后必须再来一次）
  let lo = Infinity;
  for (const n of ['footIdxL', 'footIdxR', 'ankleL', 'ankleR']) {
    const y = joints[n]?.[1];
    if (Number.isFinite(y) && y < lo) lo = y;
  }
  if (lo !== Infinity && Math.abs(lo) > 1e-9) {
    for (const k in joints) joints[k] = [joints[k][0], joints[k][1] - lo, joints[k][2]];
    for (const b of bones) { b.p0 = [b.p0[0], b.p0[1] - lo, b.p0[2]]; b.p1 = [b.p1[0], b.p1[1] - lo, b.p1[2]]; }
  }
  const head = joints.headCenter?.[1] ?? sk.height;
  return { ...sk, bones, joints, height: Math.max(0.1, head - 0), warmingUp: sk.warmingUp };
}

/** 沿原骨链的世界方向，从新的起点重新长出来 */
function regrow(
  src: Skeleton, out: Record<string, Vec3>, start: string, chain: readonly string[],
): void {
  let cursor = out[start];
  for (let i = 0; i + 1 < chain.length; i++) {
    const a = J(src, chain[i]), b = J(src, chain[i + 1]);
    if (!a || !b || !cursor) { if (cursor) out[chain[i + 1]] = cursor; continue; }
    const d = sub(b, a);
    const len = Math.hypot(d[0], d[1], d[2]);
    cursor = add(cursor, scale(norm(d), len));
    out[chain[i + 1]] = cursor;
  }
}

// ── quadruped ───────────────────────────────────────────────────────────────

/** 四足躯干比人的躯干长 —— 不拉长的话读起来像"趴着的人"而不是兽 */
const TRUNK_STRETCH = 1.9;
/** 头从肩前伸出去的长度，相对躯干 */
const HEAD_REACH = 0.45;

/**
 * 人体 → 四足。
 *
 * 关键设计：**四肢的世界方向原样保留，只把插座（肩/胯）搬到水平躯干上。**
 * 于是"你抬手 → 它抬前腿"的因果链一点没断 —— 这是它比"换个模型"强的地方。
 * 前后高度分别取臂链长和腿链长，躯干自然带一点前低后高的斜度，很像真的四足机。
 */
function quadruped(sk: Skeleton): Skeleton {
  const armChain = chainLength(sk, ['shoulderL', 'elbowL', 'wristL', 'handTipL']);
  const legChain = chainLength(sk, ['hipL', 'kneeL', 'ankleL', 'footIdxL']);
  const trunk = Math.max(0.1, chainLength(sk, ['pelvis', 'chest'])) * TRUNK_STRETCH;

  const hipHalf = Math.max(0.04, Math.abs((J(sk, 'hipL')?.[0] ?? 0.09) - (J(sk, 'hipR')?.[0] ?? -0.09)) / 2);
  const shHalf = Math.max(0.04, Math.abs((J(sk, 'shoulderL')?.[0] ?? 0.19) - (J(sk, 'shoulderR')?.[0] ?? -0.19)) / 2);

  const rearY = Math.max(0.1, legChain);
  const frontY = Math.max(0.1, armChain);
  const rearZ = -trunk / 2, frontZ = trunk / 2;

  const out: Record<string, Vec3> = {};
  out.hipL = [hipHalf, rearY, rearZ];
  out.hipR = [-hipHalf, rearY, rearZ];
  out.shoulderL = [shHalf, frontY, frontZ];
  out.shoulderR = [-shHalf, frontY, frontZ];
  out.pelvis = [0, rearY, rearZ];
  out.chest = [0, frontY, frontZ];

  // 四肢：插座换了，方向不动
  regrow(sk, out, 'shoulderL', ['shoulderL', 'elbowL', 'wristL', 'handTipL']);
  regrow(sk, out, 'shoulderR', ['shoulderR', 'elbowR', 'wristR', 'handTipR']);
  regrow(sk, out, 'hipL', ['hipL', 'kneeL', 'ankleL', 'footIdxL']);
  regrow(sk, out, 'hipR', ['hipR', 'kneeR', 'ankleR', 'footIdxR']);

  // 头：人的"向上"在这里变成"向前"。观众低头 → 兽低头，方向感是对的
  const neckLen = Math.max(0.02, chainLength(sk, ['chest', 'neck']));
  const headLen = Math.max(0.02, chainLength(sk, ['neck', 'headCenter']));
  const hd = J(sk, 'neck') && J(sk, 'headCenter')
    ? norm(sub(J(sk, 'headCenter')!, J(sk, 'neck')!))
    : [0, 1, 0] as Vec3;
  const fwd: Vec3 = norm([hd[0], hd[2], hd[1]]);          // 把"上"折成"前"
  out.neck = add(out.chest, scale(fwd, neckLen + trunk * HEAD_REACH * 0.25));
  out.headCenter = add(out.neck, scale(fwd, headLen));

  return rebuild(sk, out);
}

// ── 纯比例类重映射 ──────────────────────────────────────────────────────────

/**
 * 按比例改造，绕 pelvis 做。
 *
 * 注意这里是**逐链**缩放而不是整体缩放：手臂链从肩开始缩，腿链从胯开始缩，
 * 头从颈开始缩。整体缩放会让四肢连着躯干一起飞出去，比例就不是比例了，是放大镜。
 */
function proportion(sk: Skeleton, spec: BodyPlanSpec): Skeleton {
  const root = J(sk, 'pelvis') ?? [0, 0, 0];
  const torso = spec.torso ?? 1;
  const limb = spec.limb ?? 1;
  const armK = limb * (spec.arm ?? 1);
  const legK = limb * (spec.leg ?? 1);
  const headK = spec.head ?? 1;

  const out: Record<string, Vec3> = {};
  // 1) 躯干骨架（含肩胯颈）绕 pelvis 缩放
  const TORSO = ['pelvis', 'chest', 'neck', 'shoulderL', 'shoulderR', 'hipL', 'hipR'];
  for (const k of TORSO) {
    const p = J(sk, k);
    if (p) out[k] = add(root, scale(sub(p, root), torso));
  }
  // 2) 头从 neck 出发单独缩
  const neck = J(sk, 'neck'), head = J(sk, 'headCenter');
  if (neck && head && out.neck) out.headCenter = add(out.neck, scale(sub(head, neck), headK));

  // 3) 四肢：从新的肩/胯出发，沿原方向按各自系数长出来
  const chains: [string, string[], number][] = [
    ['shoulderL', ['shoulderL', 'elbowL', 'wristL', 'handTipL'], armK],
    ['shoulderR', ['shoulderR', 'elbowR', 'wristR', 'handTipR'], armK],
    ['hipL', ['hipL', 'kneeL', 'ankleL', 'footIdxL'], legK],
    ['hipR', ['hipR', 'kneeR', 'ankleR', 'footIdxR'], legK],
  ];
  for (const [start, chain, k] of chains) {
    let cursor = out[start];
    for (let i = 0; i + 1 < chain.length; i++) {
      const a = J(sk, chain[i]), b = J(sk, chain[i + 1]);
      if (!a || !b || !cursor) { if (cursor) out[chain[i + 1]] = cursor; continue; }
      cursor = add(cursor, scale(sub(b, a), k));
      out[chain[i + 1]] = cursor;
    }
  }
  // 兜底：没被算到的关节原样搬过来（P2：宁可不动，不要留空）
  for (const kk in sk.joints ?? {}) if (!out[kk]) out[kk] = sane(sk.joints[kk]);
  return rebuild(sk, out);
}

/** 上下颠倒，手当脚 */
function inverted(sk: Skeleton): Skeleton {
  const root = J(sk, 'pelvis') ?? [0, 0, 0];
  const out: Record<string, Vec3> = {};
  for (const k in sk.joints ?? {}) {
    const p = sane(sk.joints[k]);
    out[k] = [p[0], root[1] - (p[1] - root[1]), p[2]];
  }
  return rebuild(sk, out);
}

// ── 入口 ────────────────────────────────────────────────────────────────────

/**
 * 把人体骨架翻译成某个物种的身体。永不抛异常，未知 plan 按 'rig' 处理（P2）。
 */
/** 预设：为了让常见的几种一句话能写出来 */
const PRESETS: Record<string, BodyPlanSpec> = {
  towering: { limb: 1.55, torso: 0.85 },
  stub: { limb: 0.55, torso: 1.25, head: 1.2 },
};

const isSpec = (p: unknown): p is BodyPlanSpec =>
  typeof p === 'object' && p !== null && !Array.isArray(p);

/** 这个 spec 会不会真的改变比例？全是 1 就别白跑一趟 */
const changesProportion = (s: BodyPlanSpec): boolean =>
  [s.limb, s.torso, s.head, s.arm, s.leg].some((v) => v !== undefined && v !== 1);

/**
 * 把人体骨架翻译成某个物种的身体。永不抛异常，未知 plan 按 'rig' 处理（P2）。
 *
 * 顺序是固定的：**先改拓扑，再改比例**。反过来的话比例会被拓扑重映射冲掉 ——
 * quadruped 会重新摆放所有插座，之前的缩放就白做了。
 */
export function remapSkeleton(sk: Skeleton, plan: BodyPlan = 'rig'): Skeleton {
  if (!sk || !Array.isArray(sk.bones) || !sk.bones.length) return sk;

  const spec: BodyPlanSpec = isSpec(plan) ? plan : (PRESETS[plan] ?? { kind: plan as BodyPlanId });
  const kind = spec.kind ?? (isSpec(plan) ? 'rig' : (PRESETS[plan] ? 'rig' : (plan as BodyPlanId)));

  let out = sk;
  switch (kind) {
    case 'quadruped': out = quadruped(sk); break;
    case 'inverted': out = inverted(sk); break;
    case 'towering': out = proportion(sk, PRESETS.towering); break;
    case 'stub': out = proportion(sk, PRESETS.stub); break;
    default: break;                            // 'rig' 与任何未知值 = 不改拓扑
  }
  if (changesProportion(spec) && kind !== 'towering' && kind !== 'stub') out = proportion(out, spec);
  return out;
}
