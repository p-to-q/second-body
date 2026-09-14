/**
 * 第 III 乐章的名字：迟滞。身体跟随你，但**有重量**。
 *
 * 快动作被阻尼，慢动作 1:1。于是猛地挥手时它跟不上、缓缓抬手时它贴着你 ——
 * 观众会自发地开始**放慢**，去迁就那个身体。
 *
 * docs/44 §6 之后它是那条线（`acts/act.ts` 的 `playLine`）在第 III 个地名上的样子：
 * 重量 = `LINE.weight[2]` = 1，即原来那个逐关节临界阻尼追踪（τ 随速度在
 * `LINE.tauSlow`..`LINE.tauFast` 之间）。追踪一直在后台跑，重量只决定输出混进去多少。
 */
import type { Act } from './act.ts';
import { playLine } from './act.ts';

export const resist: Act = {
  id: 'resist',
  label: '迟滞（它有重量）',
  kind: 'body',
  weight: 1,
  update(w, dt, ctx) { playLine(w, dt, 2, ctx); },
};
