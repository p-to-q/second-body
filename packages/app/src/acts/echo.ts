/**
 * 第 II 乐章的名字：回声。身体演的是你 1.2 秒之前的动作。
 *
 * 观众的反应几乎总是同一条曲线：先以为坏了 → 停下来 → 看见身体还在动 →
 * 意识到那是刚才的自己。**这一刻比"它跟着我动"强得多**。
 *
 * docs/44 §6 之后它是那条线（`acts/act.ts` 的 `playLine`）在第 II 个地名上的样子：
 * 延迟 = `LINE.delay[1]`。延迟从第 I 个地名开始连续地长上来，
 * 所以没有"它突然慢了半拍"的那一刻。
 */
import type { Act } from './act.ts';
import { playLine } from './act.ts';

export const echo: Act = {
  id: 'echo',
  label: '回声（延迟 1.2s）',
  kind: 'body',
  weight: 1,
  update(w, dt, ctx) { playLine(w, dt, 1, ctx); },
};
