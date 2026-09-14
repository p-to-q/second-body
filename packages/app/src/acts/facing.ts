/**
 * 第 IV 乐章的名字：面对面。身体不再是你的镜像，而是**一个面对着你的人**。
 *
 * 整个作品的默认设定是镜子（docs/04 §1：镜像只在 mediapipeToWorld 里发生一次）。
 * 到这一点，镜像被抵消 —— 你抬右手，它抬的是**你对面那个人**会抬的手。
 *
 * docs/44 §6 之后它是那条线（`acts/act.ts` 的 `playLine`）在第 IV 个地名上的样子：
 * 朝向 = `LINE.facing[3]` = 1。朝向是一路**转移**过去的（哪根肢体答哪根），
 * 不是一次 X 取负；而且只在观众动的时候才往前走 —— 站着别动，它也不转
 *（为什么这样做，见 `core/src/line.ts` 的 `faceSk` 与 `LINE.facingChase`）。
 */
import type { Act } from './act.ts';
import { playLine } from './act.ts';

export const facing: Act = {
  id: 'facing',
  label: '面对面（镜像被抵消）',
  kind: 'body',
  weight: 1,
  update(w, dt, ctx) { playLine(w, dt, 3, ctx); },
};
