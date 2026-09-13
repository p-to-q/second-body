/**
 * 选择页的上场判据。**一个条目列在轮播里，就是在承诺观众点下去会变成它。**
 *
 * 单开一个文件有两个理由，都不是洁癖：
 *  1. `choose.ts` 第一行 `import '../ui/type.css'` —— 它在 node 里根本 import 不进来，
 *     于是这条判据以前没有任何办法被单测钉住。
 *  2. 这是一条**数据判据**，不是 UI：它要和 `makeGenome` 那一侧对得上。
 *
 * 判据只有两条：程序化的，或者库里真的有自有件的。
 *
 * 这里曾经还有第三条「∪ 有 anchor 图的」。anchor 图是 `/dev/anchor.html` 画出来的
 * 一张**参考渲染**（docs/09 U12），不是一件可以穿的零件。两者同时为真是常态，
 * 所以那一条长期不改变任何结果 —— 它只在最坏的那一刻生效：谁给一个零自有件的
 * 条目补了一张图，它立刻进轮播，而 `makeGenome` 那边一件自有件都没有，
 * 观众选的身体和他看到的身体不是同一个（docs/39 §2.1）。
 * 一个只在出事那天才起作用的分支，不是宽容，是一颗定时的谎。
 */
import type { ThemeDef } from '../../../core/src/types.ts';

export interface WearableLibrary {
  /** theme id → 库里有多少件**自有**部件 */
  partCount: Map<string, number>;
}

export function isWearable(
  theme: ThemeDef,
  library: WearableLibrary,
  callerSuppliedThemes = false,
): boolean {
  // dev 页（`/dev/choose.html?roster=1`）直接给条目表，没有库可查：全部放行 ——
  // 那一页要的正是"把整张形态图铺开看，哪一片还是空的"。
  if (callerSuppliedThemes) return true;
  // 「场」这一类：一件零件都不实例化，它的身体就是那 1400 个点。
  if (theme.source === 'procedural') return true;
  return (library.partCount.get(theme.id) ?? 0) > 0;
}
