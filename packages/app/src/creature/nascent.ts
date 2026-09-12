/**
 * NascentBody —— 「开场那一具身体」。`docs/18 §2` 两种表达的**接缝**在这里。
 *
 * ── 它解决的问题 ────────────────────────────────────────────────────────────
 * `assets/parts/parts.json` 里 tier 0 的部件数是 **0**（198 件全在 tier 1/2），
 * 而演化从 tier 0 起步（`EVOLUTION.thresholds[0] === 0`）。于是观众看到的**第一具
 * 身体**每个槽位都退到 `library.ts` 的兜底几何：方块躯干、胶囊四肢、球头、楔形手脚。
 *
 * 那套兜底几何的职责是"资产没到货时也别崩"（ADR-4 / docs/02 P3）。**它不是一个形态，
 * 它是一个 catch 块。** 参照作品确实"从原始形态开始"，但那个原始形态是被设计出来的；
 * 我们这个是没东西可用时剩下的。按 `docs/26 §E` 的判据（陌生人五秒内会不会说"那是我"），
 * 一个方块躯干说的是"它坏了"，不是"它还没认出你" —— 这两句话差着整件作品。
 *
 * ── 做法 ────────────────────────────────────────────────────────────────────
 * tier 0 **不实例化任何部件**，整具身体是一个 metaball 团块（`mass.ts`，B 档方案），
 * 而且比常规团块更融（`NASCENT.radiusScale` 远大于 `MASS.radiusScale`）——
 * 四肢不是四条管子，是一个还没分化出零件的连续的体。
 * tier ≥ 1 才切到刚体件（`creature.ts`）。
 *
 * 三条硬要求，逐条对应：
 *
 *  1. **读作"未成形"而不是"加载失败"。** 兜底几何之所以读作故障，是因为它是
 *     *三种不同的原始体拼起来的*（盒 + 胶囊 + 球 + 楔），接缝、比例、材质全都在喊
 *     "这是临时的"。团块反过来：**一个** 网格、**一条** 连续表面、**一个** draw call，
 *     没有接缝可以露馅。"没有零件"在这里是一个陈述，不是一个缺口。
 *  2. **它已经在跟着人动。** 球撒在同样的 17 根骨头上，`pose()` 每帧重撒 ——
 *     抬手，那一条就跟着抬。它不是一团雾，它是这具骨架的体积。
 *  3. **升档是"长出来"不是"换了一个"。** 见下面 `emerge` 的注释。
 *
 * ── 为什么不是别的几条路 ────────────────────────────────────────────────────
 * 都试过在纸上推，都推不到"五秒"那一条：
 *  - *只换材质（极端收敛成近单色）*：方块还是方块。颜色统一之后它变成"一个统一的
 *    方块"，故障感一点没少。颜色解决不了形状的问题。
 *  - *改 `PLACEHOLDER_SHAPE` / `buildPlaceholder` 的那张表*：无论换成什么原始体，
 *    只要还是"每根骨头挂一个独立的块"，接缝就还在，读起来还是零件没到货。
 *    而且那张表是**故障路径**的兜底，把它调成一个艺术形态等于让故障变得好看 ——
 *    下次真的加载失败时就没人发现了。这条是主动否掉的，不是没想到。
 *  - *合并成几段连续的体（少几个部件）*：方向对，但"连续的体"用刚体件做就是在
 *    重新发明 metaball，而 `mass.ts` 已经在了。
 *
 * ── ⚠️ 这个模块现在是关着的（`NASCENT.enabled = false`）─────────────────────
 * 形态这一半做完了，也取过证（`scratch/evidence/tier0-*.png`）。**卡住它的是帧率。**
 *
 * 选团块时我引用的是 `docs/18` 那句"res40 是 1.85ms / 2,484 面 / 1 draw"——
 * 那个数是真的，但它**只说了 CPU 那一半**。实测同一台机器、同一分钟：
 * 开场走兜底刚体件 76–100 fps，走团块 **12 fps**，而团块的面数和 draw 都少一个量级。
 * CPU 采样显示主线程 93% 空闲 —— 每帧的时间花在 GPU 提交那边，不在 JS 里。
 *
 * 这条不是本次写坏的：`/dev/mass.html?res=36` 和主程序 `?plan=mass` 都一样
 * （16 fps / 10 fps），而那两条路本次一行没动。详见 `docs/18` 与 `NASCENT.enabled`。
 *
 * 所以上面"自己再造一套只会更贵"这句话，**在 CPU 上成立，在 GPU 上还没被验证**。
 * 如果那次停顿修不掉，"合并成几段连续的刚体"就重新变成一条值得走的路 ——
 * 它跑在已经证明能做到 100 fps 的那条管线上。
 */
import * as THREE from 'three/webgpu';
import { NASCENT } from '../../../core/src/tuning.ts';
import type { Presence, PresenceState, Skeleton } from '../../../core/src/types.ts';
import type { PartLibrary } from '../assets/library.ts';
import type { BodyInstance, BodyStats } from './body.ts';
import type { Creature } from './creature.ts';
import { createMassBody, type MassBody } from './mass.ts';

export interface NascentStats extends BodyStats {
  /** 刚体实例数（团块阶段是 0）。HUD 读它 */
  instances: number;
  /** 0 = 完全是团块，1 = 完全是刚体。中间是升档那 0.6 秒 */
  emergence: number;
}

export interface NascentBody extends BodyInstance {
  /**
   * 演化档位变了就调它。tier 0 → 团块，tier ≥ 1 → 刚体。
   * **第一次调用是瞬时的**（`?tier=2` 深链要直接是 tier 2，不能从一团开始长）。
   */
  setTier(tier: number): void;
  /** 转给团块的运动能量（驱动表面"沸腾"）。tier ≥ 1 之后它自然不再有可见影响 */
  setEnergy(v: number): void;
  readonly stats: NascentStats;
}

export interface NascentOptions {
  /** 已经建好的刚体渲染器。本模块不创建它 —— 它的所有权仍在 main.ts */
  creature: Creature;
  library: PartLibrary;
  /** 条目 id。团块的颜色取它的 `palette[0]`，于是开场就已经是**这个物种**的颜色 */
  theme?: string;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * 把 `Presence` 折成一个 0..1 的标量，**和 `creature.ts` / `mass.ts` 内部那段一模一样**。
 * 复制一份是故意的：这里要拿它和 emergence 相乘，而那两个模块只接受 `Presence` 对象。
 */
function aliveOf(p: Presence | null | undefined): number {
  if (!p) return 1;
  if (p.state === 'ENTERING') return clamp01(p.transition);
  if (p.state === 'LEAVING') return 1 - clamp01(p.transition);
  if (p.state === 'IDLE') return 0;
  return 1;
}

export function createNascent(opt: NascentOptions): NascentBody {
  const creature = opt.creature;

  const object = new THREE.Group();
  object.name = 'nascent';

  // 团块用**更融**的参数：这一个数就是"未分化"的全部（见 NASCENT.radiusScale）
  const mass: MassBody = createMassBody({
    library: opt.library,
    theme: opt.theme,
    res: NASCENT.res,
    radiusScale: NASCENT.radiusScale,
    slotScale: NASCENT.slotScale,
  });
  object.add(mass.object);
  object.add(creature.object);

  const stats: NascentStats = { triangles: 0, drawCalls: 0, instances: 0, emergence: 0 };

  /** 0 = 团块，1 = 刚体。每帧朝 target 走 */
  let emergence = 0;
  let target = 0;
  /** 还没收到过 setTier —— 第一次不许有动画 */
  let seeded = false;

  /**
   * 两个身体各自的在场强度。**它不是把 `Presence` 传下去就完事**：
   * 团块和刚体在升档那 0.6 秒里同时活着，各自的可见度是
   * 「真实在场 × 自己那一份 emergence」。所以这里把标量算好，
   * 再合成一个**假的 Presence** 递下去 —— 两个模块的契约都只认 Presence 对象，
   * 我不想为了这件事去改它们（creature.ts 至今一行未动，那是有价值的）。
   *
   * 代价是 smoothstep 被套了两层（这里一层、模块内部一层）。它仍然是 0→1 单调的，
   * 只是缓入更陡一点 —— 在 0.6 秒的尺度上看不出来，而换来的是零侵入。
   */
  // 两个身体各持一个，**不共用一个可变对象**：省下的那点分配不值得留一个
  // "谁先读谁后写"的坑给后来的人。两个都是常驻的，帧循环里仍然零分配（P2）。
  const massPresence: Presence = { state: 'ALIVE', elapsed: 0, transition: 1 };
  const rigidPresence: Presence = { state: 'ALIVE', elapsed: 0, transition: 1 };
  function presenceOf(out: Presence, scalar: number, src: Presence | null | undefined): Presence {
    const s = clamp01(scalar);
    // 完全不可见时给 IDLE：两个模块都会在 IDLE 上提前返回（团块直接 visible=false），
    // 于是"没露面的那一半"真的不花钱，而不是画一堆 scale 0 的实例。
    out.state = (s <= 0.001 ? 'IDLE' : s >= 0.999 ? 'ALIVE' : 'ENTERING') as PresenceState;
    out.elapsed = src?.elapsed ?? 0;
    out.transition = s;
    return out;
  }

  const body: NascentBody = {
    get object() { return object; },
    get stats() { return stats; },

    setTier(tier) {
      target = Number.isFinite(tier) && tier >= 1 ? 1 : 0;
      // 深链 `?tier=2` 必须直接是 tier 2 —— 从一团开始长是"演化"，
      // 而深链不是演化，它是 look dev 要的那个不动的靶子。
      if (!seeded) { emergence = target; seeded = true; }
    },

    setEnergy(v) { mass.setEnergy(v); },

    pose(sk, presence, dt) {
      const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 1 / 15) : 1 / 60;

      // 1. 推进 emergence。速率由 NASCENT.emerge 定，它**等于** STAGE.pulseDuration ——
      //    升档的亮度脉冲和形态的变化必须是同一拍，否则读成两件事。
      if (emergence !== target) {
        const d = step / Math.max(1e-3, NASCENT.emerge);
        emergence = target > emergence ? Math.min(target, emergence + d) : Math.max(target, emergence - d);
      }
      stats.emergence = emergence;

      const alive = aliveOf(presence);

      // 2. 刚体件**先**冒头，团块**后**退去（NASCENT.leadIn）。
      //    刚体在 e ∈ [0, 1-leadIn] 长满；团块在 e ∈ [leadIn, 1] 才退去。
      //    于是 e ∈ [leadIn, 1-leadIn] 这一段里**零件已经长到一半、团块还是满的** ——
      //    那几帧看到的是零件从团里顶出来。两条曲线如果同起同止（把 leadIn 设成 0），
      //    读到的就只是交叉淡入淡出，也就是"换了一个"。
      //    零件是在**同一批骨头**上长的，所以剪影自始至终连续 —— 没有"跳"。
      const span = Math.max(0.05, 1 - NASCENT.leadIn);
      const rigidT = clamp01(emergence / span);
      const massT = clamp01((1 - emergence) / span);

      // 3. 各画各的。隐藏而不是画 scale 0：团块阶段刚体一个 draw call 都不该有。
      const massVis = alive * massT;
      const rigidVis = alive * rigidT;

      mass.object.visible = massVis > 0.001;
      if (mass.object.visible) mass.pose(sk, presenceOf(massPresence, massVis, presence), step);

      // genome 还没定下来时 creature.pose 自己会提前返回，但它的旧网格还挂在场上 ——
      // 所以可见性必须由这里管，不能指望它。
      creature.object.visible = rigidVis > 0.001;
      if (creature.object.visible) creature.pose(sk, presenceOf(rigidPresence, rigidVis, presence), step);

      // 4. 合账。预算是按**这一帧真的提交了什么**算的，两边都在场时就是两边之和。
      const m = mass.object.visible ? mass.stats : null;
      const c = creature.object.visible ? creature.stats : null;
      stats.triangles = (m?.triangles ?? 0) + (c?.triangles ?? 0);
      stats.drawCalls = (m?.drawCalls ?? 0) + (c?.drawCalls ?? 0);
      stats.instances = c?.instances ?? 0;
    },

    dispose() {
      mass.dispose();
      creature.dispose();
      object.clear();
    },
  };

  return body;
}
