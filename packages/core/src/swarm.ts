/**
 * 点场（swarm）的**纯几何**那一半 —— 点怎么撒、点云的底在哪里。
 *
 * 为什么在 core：它不碰 three、不碰 window，而且是这条身体方案里**唯一
 * 能被单测钉住**的部分。渲染那一半（公告牌、顶点着色器、运动历史环）住在
 * `app/src/stage/particles.ts` 与 `app/src/creature/swarm.ts`。
 *
 * ── 这个方案要表达什么（`docs/18 §2` B 档的 `swarm` 那一行）──────────────
 * 「场」的 tagline 是「身体消失，只剩运动」。在这之前它没有 `bodyPlan`，
 * 于是走默认的刚体装配，**借别的物种的四肢拼成一具普通机器人** ——
 * 这个物种在画面上说的话和它自己写的话正好相反。
 *
 * ── 两个判断，都写在这里，因为它们是"点场"和"点描的人"之间的分界 ────────
 *
 * 1. **点锁在骨头上，但各自落后不同的时间。**
 *    锁死在骨线上（零延迟）得到的是一具点描的人 —— 形还在，只是换了笔触。
 *    全体统一延迟得到的是一具慢半拍的点描的人 —— 还是形。
 *    只有当**同一根骨头上的点分布在一整段过去**时，静止的那一刻它们会叠回同一个
 *    位置（形短暂地出现），一动起来就沿轨迹拉开（形被运动吃掉）。
 *    延迟的分布是 `rand^SWARM.lagCurve`：多数点贴着"现在"，少数拖在后面。
 *    次幂给 1（均匀）会得到一条等厚的糊带，那读作"运动模糊"，不是"只剩运动"。
 *
 * 2. **延迟不沿骨链分配。** 仓库里有 `vitality.ts`（末端比根部慢半拍），
 *    而它作用在**骨架**上、在这一层之前就跑过了。这里再按 root→tip 排一次延迟，
 *    就是把同一件事做两遍：手会拖出比脚长一倍的尾巴，读作"手很重"。
 *    这一层分配的是**另一个轴** —— 同一根骨头内部的时间厚度。
 *    两个轴叠起来才是"这具身体在动"而不是"这只手在动"。
 */
import { mulberry32 } from './rng.ts';
import { ALL_BONE_IDS, SLOT_OF_BONE } from './slots.ts';
import { SLOT_WIDTH, SWARM } from './tuning.ts';
import type { Bone, Vec3 } from './types.ts';

/**
 * 一个点的**全部静态属性**。每一项都在构造时定死，帧循环里一个字段都不写 ——
 * 每帧变的只有"骨架历史环"那几个 uniform（见 `particles.ts`）。
 */
export interface SwarmPoint {
  /** 落在第几根骨头（`ALL_BONE_IDS` 的下标） */
  bone: number;
  /** 沿骨轴的位置，0 = socketA 端，1 = socketB 端 */
  t: number;
  /** 相对骨轴的固定偏移（米，标准身材 1.7m；运行时乘 bodyScale） */
  jitter: Vec3;
  /** 自己落后多久，0 = 现在，1 = 环的最远端 */
  lag: number;
  /** 呼吸/亮度的相位，0..1 */
  phase: number;
  /** 公告牌尺寸的个体差异，约 0.55..1.45 */
  size: number;
}

const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

/**
 * 这根骨头上的点该散多开（米，标准身材）。
 * 直接读 `SLOT_WIDTH`（和 `mass.ts` 的球半径同源）—— 不另立一张表，
 * 因为"这根骨头有多粗"这件事全项目只该有一个答案。
 */
export function jitterRadiusOf(boneIndex: number): number {
  const id = ALL_BONE_IDS[boneIndex];
  const slot = id ? SLOT_OF_BONE[id] : undefined;
  return (slot ? SLOT_WIDTH[slot] : 0.12) * 0.5 * SWARM.jitterScale;
}

/**
 * 把 `count` 个点撒到 17 根骨头上。
 *
 * **按骨长加权**，不是每根骨头等分：等分会把四分之一的点堆在 11cm 的脖子上，
 * 而脖子在画面上只占一小块 —— 结果是一颗亮球顶着一片稀疏的身体。
 * 这和 `particles.ts` 里 `LIMBS` 那段按长度加权是同一条理由。
 *
 * `lengths` 由调用方给（标准站姿的骨长），而不是在这里再写一张常数表：
 * 表会和 `framing.ts` 的 `REFERENCE_POSE` 漂开，而漂开的那天没有人会发现。
 *
 * 纯函数 + 注入的 seed ⇒ 同一个 seed 每次给出同一片点（P1，截图可复现）。
 */
export function placeSwarmPoints(
  count: number,
  lengths: readonly number[],
  seed: number = SWARM.seed,
): SwarmPoint[] {
  const n = Math.max(0, Math.floor(count));
  const rng = mulberry32(seed >>> 0);
  const out: SwarmPoint[] = [];
  if (!n) return out;

  // 权重表。骨长缺失/为负（外部数据，P2 默认不可信）一律当 0 —— 那根骨头就不撒点，
  // 而不是让 NaN 顺着 weighted() 传下去。
  const w: number[] = [];
  let total = 0;
  for (let i = 0; i < ALL_BONE_IDS.length; i++) {
    const L = lengths[i];
    const v = Number.isFinite(L) && L > 0 ? L : 0;
    w.push(v);
    total += v;
  }
  // 一根都量不出来 → 退回等权。没有骨长不是错误，是"还没热身完"（P3）。
  if (total <= 0) { for (let i = 0; i < w.length; i++) w[i] = 1; total = w.length; }

  for (let i = 0; i < n; i++) {
    let pick = rng.next() * total;
    let bone = 0;
    while (bone < w.length - 1 && pick > w[bone]) { pick -= w[bone]; bone++; }

    const r = jitterRadiusOf(bone);
    const t = rng.next();
    // 横向两轴散满，沿骨轴那一轴收窄（SWARM.jitterAlong）。抖动是在骨头的**局部**
    // 坐标里给的，但我们不建局部基 —— 沿轴方向由 t 已经覆盖，这里只需要一个
    // 各向同性的小球再压扁一点点，压哪一轴在统计上无所谓。
    const jx = (rng.next() * 2 - 1) * r;
    const jy = (rng.next() * 2 - 1) * r * SWARM.jitterAlong;
    const jz = (rng.next() * 2 - 1) * r;

    out.push({
      bone,
      t,
      jitter: [jx, jy, jz],
      // 见文件头判断 1：多数点贴着"现在"，少数拖在后面
      lag: clamp(Math.pow(rng.next(), SWARM.lagCurve) * SWARM.lagSpan, 0, 1),
      phase: rng.next(),
      size: 0.55 + rng.next() * 0.9,
    });
  }
  return out;
}

/**
 * 这片点云在世界坐标里最低的那一点（米）。量不出来时返回 `null`
 * （**不是 0** —— 0 是一个合法高度，拿它当"没量到"会把身体钉在地面上。
 * 这条和 `ground.ts` 的 `lowestPointOf` 是同一条规矩）。
 *
 * ── 为什么点云需要自己落地 ────────────────────────────────────────────────
 * 骨架那一层只保证最低的**关节**在 y=0（`core/skeleton.ts`），而点是撒在骨头
 * **周围**的：踝在 y=0，脚那一段的点就有一半在地板下面。团块身体踩过同一个坑
 * （`mass.ts` 第 6 步，站姿实测 -0.062m），这里是同一类 bug 的第三次。
 *
 * ── 为什么量每一个点，而不是"骨头最低点 - 抖动半径" ──────────────────────
 * 后者是这片云的**包络下界**，不是这片云。1400 个点里真正落在包络角上的可能
 * 一个都没有，按包络落地会让看得见的那片点**浮在空中**一层抖动半径。
 * 每帧 1400 次乘加对 `BUDGET.maxCpuMsPerFrame`（4ms）是噪声（实测 < 0.02ms），
 * 而"量成品"和"估成品"的差别是 P21。
 *
 * @param points    静态点表
 * @param bones     这一帧的骨架（下标与 `ALL_BONE_IDS` 一致的那份）
 * @param bodyScale 观测身高 / 标准身高；抖动是按标准身材写的，要跟着缩
 */
export function lowestSwarmY(
  points: readonly SwarmPoint[],
  bones: readonly Bone[],
  bodyScale = 1,
): number | null {
  if (!points?.length || !bones?.length) return null;
  const s = Number.isFinite(bodyScale) && bodyScale > 0 ? bodyScale : 1;
  let lo = Infinity;
  for (const p of points) {
    const b = bones[p.bone];
    if (!b) continue;
    const y0 = b.p0?.[1], y1 = b.p1?.[1];
    if (!Number.isFinite(y0) || !Number.isFinite(y1)) continue;   // 追踪冲飞的那根骨头跳过，不是整片消失（P2）
    const y = y0 + (y1 - y0) * p.t + p.jitter[1] * s;
    if (y < lo) lo = y;                                            // NaN 比不过任何数，自然被跳过
  }
  return Number.isFinite(lo) ? lo : null;
}
