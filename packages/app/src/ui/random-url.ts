/**
 * 「随机」那一下**挑出来的东西**——这一列里第二块不碰 DOM 也不碰 CSS 的。
 *
 * 单独占一个文件的理由和 `ui/exits-url.ts` 逐字相同：`ui/controls.ts` 要
 * `import './controls.css'`，而 node 的测试加载不了 .css，于是只要这段逻辑
 * 还留在那个文件里，它就永远没有仪表（docs/02 P21）。而这一块恰恰是
 * **坏了也看不出来**的那一类：随机永远能给出一个画面，一个少写了参数的随机
 * 只是"再按一次就不一样了"，没有任何一处会说它错了。
 *
 * ## 一条硬规矩：随机必须能被走回去
 *
 * 一个按下去就回不来的随机按钮是老虎机，不是乐器。所以这里的产物不是
 * "改一改当前状态"，而是**一整套写进 URL 的参数**：地址栏里那一行就是这一屏
 * 的全部配方，复制给别人、刷新、按浏览器的后退，拿到的都是同一具身体。
 *
 *  1. **`seed` 必须进 URL。** 它决定 `makeGenome` 抽中哪些件，不写进去的话
 *     下一次重载会**换一具身体**，而其余参数一模一样。
 *  2. **其余参数全部由这一个 seed 推出来**（`mulberry32(seed)`），所以 `?seed=` 这一个数
 *     就是整次抽签本身。
 *
 * ## 抽什么、不抽什么
 *
 * 池子不在这里：它从控件表（`ui/control-table.ts` 的 `rollSlots`）来，按抽签顺序排好。
 * 表里写着理由：四个开关一个都不抽（随机关掉延迟读作"坏了"），**玩法也不抽** ——
 * 弧线三分钟里自己会走完四段，抽一段写进 URL 就是把弧线藏起来（作品负责人 2026-09-14：
 * 按钮不许把东西锁住）。玩法那一格 `options: null`：照样消耗一次 rng，写成删除。
 */
import { mulberry32 } from '../../../core/src/rng.ts';

/** 抽签的一格。`options: null` = 只消耗、把这个参数写成删除；`[]` = 只消耗、不碰 */
export interface RollSlot {
  param: string;
  options: readonly string[] | null;
}

/**
 * 一次抽签的产物：交给 `reloadWith` 的那个 patch。
 * `null` 表示"把这个参数删掉"（和 `hallSearch` 里 `set(k, null)` 同一个约定）。
 */
export type RandomPatch = Record<string, string | null>;

/** 32 位无符号，和 `main.ts` 那一个会话种子同宽 —— 两边说的是同一个数 */
export const SEED_MAX = 0x1_0000_0000;

/**
 * 从一个种子推出一整套参数。**纯函数**：同一个 seed 永远给同一个 patch，
 * 这条性质就是"同一张图找得回来"的全部实现。
 *
 * **顺序即契约**：每一格都消耗一次 rng，哪怕那一池是空的或者这一格不写。
 * 顺序一变，同一个 seed 就指向另一具身体 —— 也就是把所有已经被人记下来的 URL 作废。
 */
export function randomPatch(seed: number, slots: readonly RollSlot[]): RandomPatch {
  const s = Math.abs(Math.trunc(seed)) % SEED_MAX;
  const rng = mulberry32(s);
  const patch: RandomPatch = { seed: String(s) };
  for (const { param, options } of slots) {
    const r = rng.next();
    if (options === null) { patch[param] = null; continue; }
    if (options.length) patch[param] = options[Math.min(options.length - 1, Math.floor(r * options.length))]!;
  }
  return patch;
}
