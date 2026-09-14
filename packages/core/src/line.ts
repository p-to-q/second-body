/**
 * 一条线：四个乐章留名字、删边界（`docs/44-THESEUS.md` §6）。数值在 `tuning.ts` 的 `LINE` 块。
 *
 * ── 它替掉了什么 ────────────────────────────────────────────────────────────
 * 此前 `app/src/acts/` 有四套独立的映射（follow / echo / resist / facing），
 * 弧线按段挑一个，段与段之间靠 `ARC.crossfade` 4 秒淡过去。docs/44 §6 说：
 * 那个交叉淡入是一份口供 —— 一个需要被淡化的边界，本来就不该在那儿；
 * 而零件已经是一件一件连续换的，玩法再四段跳，观众能指认的那一刻只是搬了家。
 *
 * 所以这里只有**一条**映射，三个数都是 `arc.overall` 的连续函数（`lineAt`），
 * 四个玩法是这条线上的四个采样点（`pointOf`）。`?act=` 钉住的就是那个点。
 *
 * ── 永远不脱钩 ──────────────────────────────────────────────────────────────
 * 三个数里每一个都只改**怎么映射**，不改**从哪儿来**：延迟读的是观众过去的帧，
 * 重量追的是观众现在的帧，朝向翻的是观众现在的帧。站着别动，缓冲里全是同一帧、
 * 追踪收敛到同一帧 —— 输出也不动。
 * 朝向是唯一一个在静止时**不是恒等**的变换（抬着手站定，翻过去手就换了边），
 * 所以它的实际值只在观众动的时候才向曲线靠（`LINE.facingChase`）。
 *
 * 纯函数式：时间从 `t` / `dt` 进来，不读时钟、不碰 three（P1）。
 */
import { movementBounds, type MovementIndex } from './arc.ts';
import { ARC, LINE, MOTION } from './tuning.ts';
import type { Bone, Skeleton, Vec3 } from './types.ts';

/** 这条线在某一点上的三个数 */
export interface LineParams {
  /** 延迟（秒）：演的是观众多久之前的动作 */
  delay: number;
  /** 重量 0..1：0 = 原样，1 = 临界阻尼追踪（快动作跟不上） */
  weight: number;
  /** 朝向 0..1：0 = 镜像，1 = 镜像被抵消（一个面对你的人） */
  facing: number;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };

/**
 * 四个地名在 `overall` 上的位置：每一段的中点。
 * 180 秒下 = 20 / 62.5 / 110 / 157.5 秒。第 I 个正好落在 `THESEUS.graceSeconds` 上。
 */
export function linePoints(beats: readonly number[] = ARC.beats): number[] {
  const ends = movementBounds(1, beats);
  return ends.map((end, i) => ((i === 0 ? 0 : ends[i - 1]) + end) / 2);
}

const POINTS = linePoints();

/** 第 k 乐章那个玩法"是它自己"的那一点 */
export function pointOf(movement: MovementIndex): number {
  return POINTS[movement];
}

/** 一个数沿四个地名的插值：地名处取值精确、地名附近导数为 0、两端之外保持 */
function along(values: readonly number[], x: number, points: readonly number[] = POINTS): number {
  const n = Math.min(values.length, points.length);
  if (!(x > points[0])) return values[0];
  for (let i = 0; i < n - 1; i++) {
    if (x <= points[i + 1]) {
      const s = smooth((x - points[i]) / Math.max(1e-9, points[i + 1] - points[i]));
      return values[i] + (values[i + 1] - values[i]) * s;
    }
  }
  return values[n - 1];
}

/** 这条线在 `overall`（整条弧线 0..1）处的三个数 */
export function lineAt(overall: number): LineParams {
  const x = Number.isFinite(overall) ? clamp01(overall) : 0;
  return {
    delay: along(LINE.delay, x),
    weight: along(LINE.weight, x),
    facing: along(LINE.facing, x),
  };
}

/**
 * 物种自己的身体方案漂进来的进度 0..1（原来是 `ArcState.blend`，吃 `ARC.crossfade` 4 秒）。
 *
 * 从第 III 乐章开头漂到第 III 乐章的地名：docs/40 §1 说物种方案"推迟到第 III 乐章"，
 * 所以起点仍在那里；终点不再是一个秒数旋钮，是这条线上已有的那个点。
 * 180 秒下 = 85 → 110 秒，25 秒的"逐渐"，没有新数。
 */
export function speciesDrift(overall: number, beats: readonly number[] = ARC.beats): number {
  const ends = movementBounds(1, beats);
  const from = ends[1] ?? 0.5;
  const to = linePoints(beats)[2] ?? from;
  const x = Number.isFinite(overall) ? overall : 0;
  return x <= from ? 0 : x >= to ? 1 : smooth((x - from) / Math.max(1e-9, to - from));
}

// ─────────────────────────── 采样器：把三个数作用到一副骨架上 ───────────────────────────

const lerp3 = (a: Vec3, b: Vec3, u: number): Vec3 =>
  (u >= 1 ? [b[0], b[1], b[2]] : [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]);
const lerp = (a: number, b: number, u: number) => (u >= 1 ? b : a + (b - a) * u);
const measure = (p0: Vec3, p1: Vec3) => Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);

/** 左右互换名字：`shoulderL` ↔ `shoulderR`。不带左右的（`pelvis` / `spine`）原样 */
const side = (k: string): string =>
  (k.endsWith('L') ? `${k.slice(0, -1)}R` : k.endsWith('R') ? `${k.slice(0, -1)}L` : k);

/** 两副同构骨架之间插值。**构造新的**，不改任何一副（`w.skeleton` 是共享的） */
function blendSk(a: Skeleton, b: Skeleton, u: number): Skeleton {
  if (u <= 0) return a;
  const joints: Record<string, Vec3> = {};
  for (const k in a.joints) joints[k] = b.joints[k] ? lerp3(a.joints[k], b.joints[k], u) : a.joints[k];
  const byId = new Map(b.bones.map((x) => [x.id, x]));
  const bones: Bone[] = a.bones.map((x) => {
    const y = byId.get(x.id);
    return y ? { ...x, p0: lerp3(x.p0, y.p0, u), p1: lerp3(x.p1, y.p1, u), length: lerp(x.length, y.length, u) } : x;
  });
  return { ...a, joints, bones };
}

/**
 * 朝向 f 处的骨架。f = 1 是原 `facing.ts` 的 X 取负，**再把左右名字互换**。
 *
 * 为什么要互换名字（docs/44 §6 那张表里没写、落地时才撞上的一条）：
 * 反射的行列式是 −1，从恒等连续走到它，中间必然经过一个行列式为 0 的变换 ——
 * 直接对 X 取负做插值，f = 0.5 时整具身体会被压成一张没有宽度的纸。
 * 把左右名字一起换掉，`f = 1` 时的**关节位置集合**和原 `facing` 逐点相同，
 * 而对一个左右大致对称的姿态，f 从 0 到 1 的整一路上身体都保持原来的宽度：
 * 变的只是"哪根肢体答哪根" —— 这正是 docs/40 §1 那张表里「转移」那一格。
 * 代价：`f = 1` 时左槽位的零件画在左边（原来被翻到右边）。形状一样，零件左右对调。
 */
function faceSk(sk: Skeleton, f: number): Skeleton {
  if (f <= 0) return sk;
  const flip = (p: Vec3): Vec3 => [-p[0], p[1], p[2]];
  const joints: Record<string, Vec3> = {};
  for (const k in sk.joints) joints[k] = flip(sk.joints[side(k)] ?? sk.joints[k]);
  const byId = new Map(sk.bones.map((b) => [b.id as string, b]));
  const bones: Bone[] = sk.bones.map((b) => {
    const m = byId.get(side(b.id)) ?? b;
    return { ...b, p0: flip(m.p0), p1: flip(m.p1), length: m.length };
  });
  return blendSk(sk, { ...sk, joints, bones }, f);
}

export interface LineInput {
  /** 观众此刻的骨架 */
  skeleton: Skeleton;
  /** 会话时钟（秒），只拿来给缓冲打时间戳 */
  t: number;
  dt: number;
  /** `MotionFeatures.speed`（身高/秒）。重量和朝向的追赶都吃它 */
  speed: number;
  /** 曲线此刻给的三个数 */
  target: LineParams;
  /** true = 朝向直接跳到目标，不追（`?act=` 钉住、换人） */
  snap: boolean;
}

export interface LineSampler {
  apply(input: LineInput): Skeleton;
  /** 朝向此刻的**实际值**（追赶之后的），给测试和 HUD 看 */
  readonly facing: number;
  reset(): void;
}

/** 缓冲断了这么久（秒）就当是新的一段：别拿上一个人的帧当"刚才" */
const STALE_AFTER = 0.5;

interface Frame { t: number; sk: Skeleton; }

export function createLineSampler(): LineSampler {
  const maxDelay = Math.max(0, ...LINE.delay);
  let frames: Frame[] = [];
  let track: Record<string, Vec3> = {};
  let lastT = Number.NaN;
  let facing = 0;
  let fresh = true;

  function reset(): void {
    frames = []; track = {}; lastT = Number.NaN; fresh = true;
  }

  /** 观众 `delay` 秒之前的那一帧（两帧之间插值；缓冲不够长就取最老的那一帧） */
  function delayed(sk: Skeleton, t: number, delay: number): Skeleton {
    if (!(delay > 0) || frames.length === 0) return sk;
    const want = t - delay;
    if (want <= frames[0].t) return frames[0].sk;
    for (let i = frames.length - 1; i >= 0; i--) {
      if (frames[i].t <= want) {
        const a = frames[i], b = frames[i + 1];
        if (!b) return a.sk;
        return blendSk(a.sk, b.sk, (want - a.t) / Math.max(1e-9, b.t - a.t));
      }
    }
    return sk;
  }

  /** 临界阻尼追踪，一直在跑（所以重量从 0 爬上来的那一刻它已经是热的） */
  function weighted(sk: Skeleton, dt: number, speed: number, weight: number): Skeleton {
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 1 / 15) : 1 / 60;
    const tau = LINE.tauSlow + (LINE.tauFast - LINE.tauSlow) * Math.min(1, Math.max(0, speed) / LINE.speedRef);
    const a = 1 - Math.exp(-step / Math.max(1e-3, tau));
    const follow = (key: string, target: Vec3): Vec3 => {
      let cur = track[key];
      if (!cur) { cur = [target[0], target[1], target[2]]; track[key] = cur; return cur; }
      cur[0] += (target[0] - cur[0]) * a;
      cur[1] += (target[1] - cur[1]) * a;
      cur[2] += (target[2] - cur[2]) * a;
      return cur;
    };
    const joints: Record<string, Vec3> = {};
    for (const k in sk.joints) joints[k] = follow(k, sk.joints[k]);
    const bones = sk.bones.map((b) => {
      const p0 = follow(`${b.id}#0`, b.p0);
      const p1 = follow(`${b.id}#1`, b.p1);
      return { b, p0, p1 };
    });
    if (!(weight > 0)) return sk;
    const out: Record<string, Vec3> = {};
    for (const k in sk.joints) out[k] = lerp3(sk.joints[k], joints[k], weight);
    return {
      ...sk,
      joints: out,
      // 追踪出来的骨头**重新量长度**（原 `resist.ts` 同一条理由：否则阻尼让骨头忽长忽短）
      bones: bones.map(({ b, p0, p1 }) => {
        const q0 = lerp3(b.p0, p0, weight), q1 = lerp3(b.p1, p1, weight);
        return { ...b, p0: q0, p1: q1, length: lerp(b.length, measure(p0, p1), weight) };
      }),
    };
  }

  return {
    get facing() { return facing; },
    reset,
    apply({ skeleton: sk, t, dt, speed, target, snap }) {
      if (!(t >= lastT && t - lastT <= STALE_AFTER)) reset();
      lastT = t;

      frames.push({ t, sk });
      // 留够最长延迟再多一点，保证 `t - delay` 总有一帧在它前面
      while (frames.length > 2 && frames[1].t < t - maxDelay - 0.1) frames.shift();

      // 朝向：只在观众动的时候向曲线靠（见文件头）。刚开始 / 钉住 / 换人时直接到位
      if (snap || fresh) facing = clamp01(target.facing);
      else {
        const moving = Math.min(1, Math.max(0, Number.isFinite(speed) ? speed : 0) / MOTION.stillnessSpeedRef);
        const room = LINE.facingChase * moving * (Number.isFinite(dt) && dt > 0 ? Math.min(dt, 1 / 15) : 0);
        const gap = clamp01(target.facing) - facing;
        facing += Math.max(-room, Math.min(room, gap));
      }
      fresh = false;

      return weighted(faceSk(delayed(sk, t, target.delay), facing), dt, speed, target.weight);
    },
  };
}
