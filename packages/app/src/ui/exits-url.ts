/**
 * 「回到大厅」那个 URL —— 这一列里唯一**不碰 DOM 也不碰 CSS** 的那一块。
 *
 * 它单独占一个文件，不是为了分层好看，是为了**能被测**：
 * `ui/exits.ts` 要 `import './exits.css'`，而 node 的测试跑起来加载不了 .css，
 * 于是只要那两行 import 还在同一个文件里，这段逻辑就永远没有仪表（docs/02 P21）。
 * 而它恰恰是这一列里最容易坏、坏了又最看不出来的一块：少带一个参数，
 * 屏幕上一切正常，只有演示到一半的人会发现刚调好的那一屏没了。
 */
import { stagePatch, type ControlValues } from './control-table.ts';

/**
 * 「把身体还回去」进的那个玩法的 id（`acts/untether.ts`）。
 * 写在这里而不是 import：这个文件是纯的，不该为了一个字符串把玩法层拖进测试。
 */
export const HANDED_BACK_ACT = 'untether';

/**
 * 「回到大厅」那个 URL 的 query 部分。**纯函数，没有 DOM、没有 location。**
 *
 * 写什么由控件表决定（`stagePatch`，和控件条重载是同一份）—— 以前这里抄了一份字段，
 * 于是"弧线此刻演到哪一段"被当成状态带回了大厅，下一个人的弧线被钉在那一段。
 * 现在玩法只在**叠加开着**时写，「还回去」那一场根本不是叠加，写不进来。
 *
 * 两件事同时成立才算对：
 *  - `theme` 和 `plan` 被**删掉** —— 留着 `theme` 会让重载直接跳过选择页
 *    （`main.ts` 里 `flags.theme ?? themeFromUrl()` 一命中就不建选择页了），
 *    那样这个按钮按下去什么都不会发生；`plan` 是这一个人按的形体叠加，
 *    带到下一个物种头上是错的（和控件条换物种时 `plan: null` 同一条）。
 *  - 其余"这一屏怎么演"的参数一条不少。
 *
 * 不在控件表里的参数（`kiosk` / `debug` / `demo` / `cam` / `exits` / `seed` …）
 * 原样留在 search 里：它们描述的是**这台机器怎么开机**，不是这一屏怎么演。
 */
export function hallSearch(search: string, v: ControlValues): string {
  const q = new URLSearchParams(search);
  for (const [k, val] of Object.entries(stagePatch(v))) {
    if (val === null) q.delete(k);
    else q.set(k, val);
  }
  // 这两条是这个函数存在的理由，放最后写，免得被上面任何一行覆盖回去
  q.delete('theme');
  q.delete('plan');
  // 大厅 = 选择页，不是展签（docs/47 §5）。没有它，重载回来的人得再按一次「开始」
  q.set('hall', '1');
  return q.toString();
}
