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
import { COPY, type BiText } from './i18n.ts';

/** `bodyPlan` 可以是字符串、`{ kind }` 对象，或者没有（= 人形）。归一到一个字符串 */
export function planKind(t: ThemeDef): string {
  const bp = t.bodyPlan as unknown;
  if (typeof bp === 'string') return bp;
  if (bp && typeof bp === 'object') return String((bp as { kind?: string }).kind ?? 'rig');
  return 'rig';
}

export const PLAN_LABEL: Record<string, BiText> = {
  rig: COPY.plans.rig,
  quadruped: COPY.plans.quadruped,
  mass: COPY.plans.mass,
  stub: COPY.plans.stub,
  towering: COPY.plans.towering,
  inverted: COPY.plans.inverted,
};

export function orderThemes(themes: readonly ThemeDef[]): ThemeDef[] {
  return [...themes].sort(
    (a, b) => b.axes.humanLike - a.axes.humanLike || a.id.localeCompare(b.id),
  );
}

/** 两位编号。海报和陈述页上看到的是同一个字符串 */
export function speciesNumber(i: number): string {
  return String(i + 1).padStart(2, '0');
}
