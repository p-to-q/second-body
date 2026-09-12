/**
 * 迟滞：身体跟随你，但**有重量**。
 *
 * 快动作被阻尼，慢动作 1:1。于是猛地挥手时它跟不上、缓缓抬手时它贴着你 ——
 * 观众会自发地开始**放慢**，去迁就那个身体。
 * 这是唯一一个反过来改变观众行为的玩法：不是它学你，是你学它。
 *
 * 实现是逐关节的临界阻尼追踪，不是简单 lerp：
 * lerp 的滞后量随帧率变化，而这里的 τ 是时间常数，掉帧也不会突然变跟手（P1 帧率无关）。
 */
import type { Bone, Skeleton, Vec3 } from '../../../core/src/types.ts';
import type { Act } from './act.ts';

/** 速度为 0 时的时间常数（秒）—— 越小越跟手 */
const TAU_SLOW = 0.06;
/** 速度很快时的时间常数 —— 明显拖后腿 */
const TAU_FAST = 0.42;
/** 归一化速度到达这个值时 τ 取到 TAU_FAST（单位：身高/秒） */
const SPEED_REF = 1.2;

let follow: Record<string, Vec3> = {};

export const resist: Act = {
  id: 'resist',
  label: '迟滞（它有重量）',
  kind: 'body',
  weight: 1,
  minSeconds: 22,
  maxSeconds: 50,

  canEnter: (w) => w.evolution.tier >= 1 && w.presence.state === 'ALIVE' && w.presence.elapsed > 12,

  enter(w) {
    // 从当前姿态起步，否则上场第一帧整个人会从原点飞过来
    follow = {};
    if (w.skeleton) for (const k in w.skeleton.joints) follow[k] = [...w.skeleton.joints[k]] as Vec3;
  },

  update(w, dt) {
    const sk = w.skeleton;
    if (!sk) return;
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 1 / 15) : 1 / 60;

    // 速度越大越拖 —— 这就是"重量"的全部来源
    const speed = Math.max(0, w.features?.speed ?? 0);
    const tau = TAU_SLOW + (TAU_FAST - TAU_SLOW) * Math.min(1, speed / SPEED_REF);
    const a = 1 - Math.exp(-step / Math.max(1e-3, tau));

    /** 对一个点做临界阻尼追踪，就地改 follow 里的那份 */
    const track = (key: string, target: Vec3): Vec3 => {
      let cur = follow[key];
      if (!cur) { cur = [target[0], target[1], target[2]]; follow[key] = cur; return cur; }
      cur[0] += (target[0] - cur[0]) * a;
      cur[1] += (target[1] - cur[1]) * a;
      cur[2] += (target[2] - cur[2]) * a;
      return cur;
    };

    const joints: Record<string, Vec3> = {};
    for (const k in sk.joints) joints[k] = track(k, sk.joints[k]);

    // 骨头端点单独追踪，并**重新量长度** —— 不重量的话阻尼会让骨头忽长忽短，
    // 挂载数学会照着拉伸部件，读起来像橡皮而不是重量。
    const bones: Bone[] = sk.bones.map((b) => {
      const p0 = track(`${b.id}#0`, b.p0);
      const p1 = track(`${b.id}#1`, b.p1);
      return { ...b, p0, p1, length: Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]) };
    });

    w.creature.pose({ ...sk, joints, bones }, w.presence, dt);
    w.note(speed > 0.6 ? '迟滞：它跟不上了' : '迟滞：它有重量');
  },

  exit() { follow = {}; },
};
