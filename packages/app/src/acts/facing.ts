/**
 * 面对面：身体不再是你的镜像，而是**一个面对着你的人**。
 *
 * 整个作品的默认设定是镜子（docs/04 §1：镜像只在 mediapipeToWorld 里发生一次）。
 * 这个玩法把 X 再取一次负 —— 镜像被抵消，于是你抬右手，它抬的是**你对面那个人**
 * 会抬的手。观众几乎立刻会察觉不对，但往往说不出哪里不对，然后才反应过来：
 * 它不再是我，它在看着我。
 *
 * 这是这件作品里最便宜也最狠的一个转折：一行取负。
 */
import type { Bone, Skeleton, Vec3 } from '../../../core/src/types.ts';
import type { Act } from './act.ts';

const flipX = (p: Vec3): Vec3 => [-p[0], p[1], p[2]];

/** 不改输入 —— World.skeleton 是共享的，就地改会污染别的消费者 */
function unmirror(sk: Skeleton): Skeleton {
  const joints: Record<string, Vec3> = {};
  for (const k in sk.joints) joints[k] = flipX(sk.joints[k]);
  const bones: Bone[] = sk.bones.map((b) => ({ ...b, p0: flipX(b.p0), p1: flipX(b.p1) }));
  return { ...sk, joints, bones };
}

export const facing: Act = {
  id: 'facing',
  label: '面对面（镜像被抵消）',
  kind: 'body',
  weight: 1,
  minSeconds: 18,
  maxSeconds: 40,

  // 要等观众先建立"这是我的镜子"这个预期，破坏才有意义。
  // 太早出现只会被当成坐标写反了。
  canEnter: (w) => w.evolution.tier >= 1 && w.presence.state === 'ALIVE' && w.presence.elapsed > 18,

  update(w, dt) {
    if (!w.skeleton) return;
    w.creature.pose(unmirror(w.skeleton), w.presence, dt);
    w.note('面对面：它不再是你的镜像');
  },
};
