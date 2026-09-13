/**
 * 生命力 —— 让一串刚体看起来像活的。
 *
 * ## 为什么需要它
 *
 * 参照作品（Universal Everything, *Future You*）里那具身体被描述为
 * "wiggles, shifts, and **bends**"，而它的创作者 Matt Pyke 把自己的方法论
 * 概括成一句 "technology that has a soul in it"。
 *
 * 我们的身体做不到"bend"，因为它按设计就是**刚体挂载、不做蒙皮**（docs/04）。
 * 每个零件的矩阵直接来自骨骼，于是全身每一帧完美同步 ——
 * 那读起来是提线木偶，不是生物。这是项目负责人说"人做得不好看"时，
 * 除了材质之外的另一半原因，而且是更根本的那一半。
 *
 * ## 解法：跟随与重叠动作（follow-through / overlapping action）
 *
 * 动画里最老的一条原理：**末端比根部慢半拍**。
 * 一串各自延迟不同的刚体，整条链看起来就是软的、会弯的 —— 不需要蒙皮。
 *
 * 做法分两步，第二步是关键：
 *
 * 1. 每个关节按它在链上的**深度**做临界阻尼跟随：骨盆几乎实时，指尖最慢。
 * 2. **严格复原骨长**：从根往外走一遍，每根骨头只保留延迟带来的**方向**偏差，
 *    长度强制回到原值。
 *
 * 没有第二步这个东西就是错的：骨长是稳定器辛苦算出来的（滚动中位数），
 * 而下游的 `attachMatrix` 拿 `bone.length` 当缩放。让骨长跟着弹簧漂，
 * 结果是零件一帧胖一帧瘦 —— 那不是生命力，那是故障。
 *
 * ## 它在哪一层
 *
 * 在 `remapSkeleton` **之后**、`body.pose()` **之前**。
 * 放这里有两个理由：
 * - 它对**所有**身体方案都生效，包括团块（`mass`）—— 它只认 Skeleton，不认渲染器；
 * - 四足/矮壮那些方案已经把插座搬过位置了，延迟应该发生在**那具身体**的链上，
 *   而不是人的链上。顺序反了，四足的前腿会带着人类肩膀的延迟。
 *
 * 代价是：它必须知道自己手上这具身体**是哪个方案**。因为末尾那次落地要按方案换基准
 * （`apply()` 的 `plan` 参数 → `groundsByLowestJoint`）。不知道的话，没有脚的方案
 * （`radial` / `inverted`）会被按着一组长在身体顶上的关节往下拽。
 */
import { VITALITY } from './tuning.ts';
import { BONES } from './skeleton.ts';
import { groundsByLowestJoint, type BodyPlan } from './bodyplan.ts';
import type { Bone, MotionFeatures, Skeleton, Vec3 } from './types.ts';

/** 关节在链上的深度。根 = 0，越往末端越大 —— 延迟量就按它分配 */
const DEPTH: Record<string, number> = (() => {
  const d: Record<string, number> = { pelvis: 0, hipL: 1, hipR: 1 };
  // BONES 已经是从根往外排的，所以一趟扫下来就够，不需要建树
  for (const [, a, b] of BONES) if (d[b] === undefined) d[b] = (d[a] ?? 0) + 1;
  return d;
})();

/** 最深的那一级，用来把深度归一化成 0..1 */
const MAX_DEPTH = Math.max(...Object.values(DEPTH));

const finite = (v: Vec3 | undefined): v is Vec3 =>
  !!v && Number.isFinite(v[0]) && Number.isFinite(v[1]) && Number.isFinite(v[2]);

export interface Vitality {
  /**
   * 返回一个**新的** Skeleton；输入不被改写。
   * 骨长与 `height` 逐字保持；只有关节的**方向**会有延迟。
   *
   * `plan` 是**这具身体已经被重映射成的那个方案**（`remapSkeleton` 的第二个参数，
   * 原样传进来）。它只有一个用处：决定末尾那次落地拿谁当基准。
   * 不传 = 按 `'rig'` 处理，也就是拿脚 —— 对人形是对的（P2：未知值走保守分支）。
   */
  apply(sk: Skeleton, features: MotionFeatures | null, dt: number, plan?: BodyPlan): Skeleton;
  reset(): void;
}

export function createVitality(): Vitality {
  /** 每个关节的当前跟随位置。null = 还没有第一帧，直接落到目标上（不要从原点飞过去） */
  let state: Record<string, Vec3> | null = null;
  let breath = 0;

  function reset(): void { state = null; breath = 0; }

  function apply(sk: Skeleton, features: MotionFeatures | null, dt: number, plan: BodyPlan = 'rig'): Skeleton {
    if (!VITALITY.enabled || !sk?.joints) return sk;
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 1 / 60;

    const src = sk.joints;
    if (!state) { state = {}; for (const k in src) if (finite(src[k])) state[k] = [...src[k]] as Vec3; }

    // ── 1. 按深度跟随 ────────────────────────────────────────────────────
    for (const k in src) {
      const target = src[k];
      if (!finite(target)) continue;
      const cur = state[k];
      if (!finite(cur)) { state[k] = [...target] as Vec3; continue; }

      const depth = DEPTH[k] ?? MAX_DEPTH;
      const norm = MAX_DEPTH > 0 ? depth / MAX_DEPTH : 0;
      // 根部时间常数 0（实时），末端到 lagSeconds。中间按 curve 次幂分配 ——
      // 线性分配会让肩膀就明显拖，看起来像整个人在水里；指数分配把延迟压到末端，
      // 这才是"甩鞭子"的形状。
      const tau = VITALITY.lagSeconds * Math.pow(norm, VITALITY.lagCurve);
      // 临界阻尼的一阶近似：tau 越大跟得越慢。tau=0 时 a=1，完全实时。
      const a = tau > 1e-4 ? 1 - Math.exp(-step / tau) : 1;
      cur[0] += (target[0] - cur[0]) * a;
      cur[1] += (target[1] - cur[1]) * a;
      cur[2] += (target[2] - cur[2]) * a;
    }

    // ── 2. 呼吸 ──────────────────────────────────────────────────────────
    // 人站着不动时，身体也不该完全静止。没有这一层，观众一停下来画面就"死"了 ——
    // 而在场判定还说他在。能量越低呼吸越明显：动起来的时候它让位给真实动作。
    breath = (breath + step * VITALITY.breathHz * Math.PI * 2) % (Math.PI * 2);
    const calm = 1 - Math.min(1, (features?.energy ?? 0) / Math.max(1e-6, VITALITY.breathFadeEnergy));
    const lift = Math.sin(breath) * VITALITY.breathAmplitude * calm * (sk.height || 1.7);
    for (const k in state) {
      const depth = DEPTH[k] ?? MAX_DEPTH;
      if (depth === 0) continue;                       // 骨盆不动：呼吸是从躯干往上长的
      state[k][1] += lift * Math.min(1, depth / 2);
    }

    // ── 3. 严格复原骨长（没有这一步，上面全是错的）────────────────────────
    const out: Record<string, Vec3> = {};
    for (const k in src) out[k] = finite(state[k]) ? ([...state[k]] as Vec3) : ([...src[k]] as Vec3);

    const byId = new Map(sk.bones?.map((b) => [b.id, b]) ?? []);
    for (const [id, a, b] of BONES) {
      const bone = byId.get(id as Bone['id']);
      const pa = out[a], pb = out[b];
      if (!bone || !finite(pa) || !finite(pb)) continue;
      const dx = pb[0] - pa[0], dy = pb[1] - pa[1], dz = pb[2] - pa[2];
      const len = Math.hypot(dx, dy, dz);
      // 两点重合时方向没有意义。退回原始骨架的方向 —— 宁可这一帧不延迟，
      // 也不要产生一个随机朝向的零件（P2）。
      if (!(len > 1e-6)) {
        const sa = src[a], sb = src[b];
        if (finite(sa) && finite(sb)) {
          const sl = Math.hypot(sb[0] - sa[0], sb[1] - sa[1], sb[2] - sa[2]);
          if (sl > 1e-6) {
            out[b] = [pa[0] + ((sb[0] - sa[0]) / sl) * bone.length,
                      pa[1] + ((sb[1] - sa[1]) / sl) * bone.length,
                      pa[2] + ((sb[2] - sa[2]) / sl) * bone.length];
          }
        }
        continue;
      }
      const s = bone.length / len;
      out[b] = [pa[0] + dx * s, pa[1] + dy * s, pa[2] + dz * s];
    }

    // ── 4. 重建骨头并重新贴地 ────────────────────────────────────────────
    // 延迟和呼吸都会让脚离开地面。稳定器的输出契约是"永远贴地"，
    // 这一层改了关节就有义务把它恢复 —— 否则影子会飘（这个坑踩过一次）。
    const bones: Bone[] = (sk.bones ?? []).map((b) => {
      const pair = BONES.find(([id]) => id === b.id);
      if (!pair) return b;
      const p0 = out[pair[1]], p1 = out[pair[2]];
      return finite(p0) && finite(p1) ? { ...b, p0: [...p0] as Vec3, p1: [...p1] as Vec3 } : b;
    });

    // 拿谁当基准由**身体方案**决定，不是拿脚就完事：`radial` 把四肢拆成了绕核心的弧，
    // `inverted` 整个翻了过来、脚在最上面（`PLANS_WITHOUT_FEET`）。对这两种方案
    // 按脚落地 = 拿一组长在身体顶上的关节往下拽，实测能把整具骨架埋进地里一米多。
    // 症状看不见，因为网格落地（`ground.ts`）会把递给它的东西原样抬回来 ——
    // 但**读关节的那些人**（接触阴影 `framing.ts`、取景、截图）读到的是这具沉下去的骨架。
    // 判据就是 `bodyplan.ts` 里那条注释写下的定义：没有脚的身体，"贴地"= 整具骨架的
    // 最低关节回到 y=0。谓词只有 `groundsByLowestJoint` 一个，不在这里另建一张表（P15）。
    let lo = Infinity;
    if (groundsByLowestJoint(plan)) {
      for (const k in out) {
        const y = out[k]?.[1];
        if (Number.isFinite(y) && y < lo) lo = y;
      }
    } else for (const n of ['footIdxL', 'footIdxR', 'ankleL', 'ankleR']) {
      const y = out[n]?.[1];
      if (Number.isFinite(y) && y < lo) lo = y;
      if (n === 'footIdxR' && lo !== Infinity) break;   // 有脚尖就不看踝
    }
    if (lo !== Infinity && Math.abs(lo) > 1e-12) {
      for (const k in out) out[k][1] -= lo;
      for (const b of bones) { b.p0 = [b.p0[0], b.p0[1] - lo, b.p0[2]]; b.p1 = [b.p1[0], b.p1[1] - lo, b.p1[2]]; }
    }

    return { bones, joints: out, height: sk.height, warmingUp: sk.warmingUp, t: sk.t };
  }

  return { apply, reset };
}
