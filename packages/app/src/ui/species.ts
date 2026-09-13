/**
 * 物种的**展示**顺序与标注 —— 陈述页和海报页共用这一份。
 *
 * 为什么单独拎出来：`/about` 的散点图上只有编号，名字在下面的对照表里；
 * `/dev/poster.html` 上也是编号。两处必须是**同一套编号**，否则观众拿着海报
 * 对不上页面，那两个数字就都白标了。共用一个排序函数是唯一能保证这件事的办法。
 *
 * 排序按「像人的程度」从高到低 —— 一条从人走到非人的线，本身就是这件作品的论点。
 * 并列时按 id 兜底，保证任何一次渲染都给出同样的编号。
 */
import type { ThemeDef } from '../../../core/src/types.ts';
import { BODY_PLANS } from '../../../core/src/bodyplan.ts';
import { COPY, type BiText } from './i18n.ts';

/** `bodyPlan` 可以是字符串、`{ kind }` 对象，或者没有（= 人形）。归一到一个字符串 */
export function planKind(t: ThemeDef): string {
  const bp = t.bodyPlan as unknown;
  if (typeof bp === 'string') return bp;
  if (bp && typeof bp === 'object') return String((bp as { kind?: string }).kind ?? 'rig');
  return 'rig';
}

/**
 * 方案 → 名字。**从 `BODY_PLANS` 生成，不手抄**。
 *
 * 手抄的那一版漏了 radial / column / swarm 三个（九个里的三个），
 * `/about` 的图例因此把英文 id 原样印给中文观众。漏一条的代价是"看起来还行"，
 * 所以它藏得住 —— 现在多一个方案而 `COPY.plans` 没跟上，`tsc` 就红，
 * 因为下面这个索引要求 `COPY.plans` 覆盖 `BodyPlanId` 的每一个成员。
 */
export const PLAN_LABEL: Record<string, BiText> =
  Object.fromEntries(BODY_PLANS.map((id) => [id, COPY.plans[id]]));

export function orderThemes(themes: readonly ThemeDef[]): ThemeDef[] {
  return [...themes].sort(
    (a, b) => b.axes.humanLike - a.axes.humanLike || a.id.localeCompare(b.id),
  );
}

/** 两位编号。海报和陈述页上看到的是同一个字符串 */
export function speciesNumber(i: number): string {
  return String(i + 1).padStart(2, '0');
}
