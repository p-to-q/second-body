/**
 * 「回到大厅」那个 URL —— 这一列里唯一**不碰 DOM 也不碰 CSS** 的那一块。
 *
 * 它单独占一个文件，不是为了分层好看，是为了**能被测**：
 * `ui/exits.ts` 要 `import './exits.css'`，而 node 的测试跑起来加载不了 .css，
 * 于是只要那两行 import 还在同一个文件里，这段逻辑就永远没有仪表（docs/02 P21）。
 * 而它恰恰是这一列里最容易坏、坏了又最看不出来的一块：少带一个参数，
 * 屏幕上一切正常，只有演示到一半的人会发现刚调好的那一屏没了。
 */
/**
 * 「把身体还回去」进的那个玩法的 id（`acts/untether.ts`）。
 * 写在这里而不是 import：这个文件是纯的，不该为了一个字符串把玩法层拖进测试。
 */
export const HANDED_BACK_ACT = 'untether';

/** 一次重载要带走的全部状态。字段与 `ui/controls.ts` 的 `reloadWith` 逐条对应 */
export interface StageState {
  themeId: string | null;
  planId: string;
  sceneId: string;
  actId: string | null;
  vitality: boolean;
  refine: boolean;
  post: boolean;
  muted: boolean;
}

/**
 * 「回到大厅」那个 URL 的 query 部分。**纯函数，没有 DOM、没有 location。**
 *
 * 两件事同时成立才算对：
 *  - `theme` 和 `plan` 被**删掉** —— 留着 `theme` 会让重载直接跳过选择页
 *    （`main.ts` 里 `flags.theme ?? themeFromUrl()` 一命中就不建选择页了），
 *    那样这个按钮按下去什么都不会发生；`plan` 是**那个物种**的身材，
 *    带到下一个物种头上是错的（和 controls.ts 换物种时 `plan: null` 同一条）。
 *  - 其余"这一屏怎么演"的参数一条不少 —— 见文件头第 1 条。
 *
 * 不在这份名单里的参数（`kiosk` / `debug` / `demo` / `cam` / `exits` …）
 * 原样留在 search 里：它们描述的是**这台机器怎么开机**，不是这一屏怎么演。
 */
export function hallSearch(search: string, s: StageState): string {
  const q = new URLSearchParams(search);
  const set = (k: string, v: string | null): void => {
    if (v === null) q.delete(k);
    else q.set(k, v);
  };
  set('scene', s.sceneId);
  // 玩法照常带走，**除了「归还」**：那一场是这一个观众按出来的，不是这一屏的演法。
  // 带着 `?act=untether` 回大厅，下一个人选完物种之后身体**根本不会跟他**——
  // 他会以为这件作品坏了。实测过一次：回大厅之后 URL 里确实躺着 act=untether。
  set('act', s.actId && s.actId !== HANDED_BACK_ACT ? s.actId : null);
  set('vitality', s.vitality ? '1' : '0');
  set('refine', s.refine ? '1' : '0');
  set('nopost', s.post ? null : '1');
  set('mute', s.muted ? '1' : null);
  // 这两条是这个函数存在的理由，放最后写，免得被上面任何一行覆盖回去
  set('theme', null);
  set('plan', null);
  return q.toString();
}
