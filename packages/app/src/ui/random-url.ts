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
 * 落到实现上是两件事：
 *
 *  1. **`seed` 必须进 URL。** 它是这一列里最容易漏的那一个 —— `reloadWith`
 *     一直没带它，因为平时换个场景确实不需要重新抽一具身体。但 `seed` 决定
 *     `makeGenome` 抽中哪些件（`main.ts`：`flags.seed ?? (Math.random()…)`），
 *     不写进去的话下一次重载会**换一具身体**，而上面五个参数一模一样 ——
 *     这正是"同一张图再也找不回来"的那个缺口。
 *  2. **其余参数全部由这一个 seed 推出来。** 用 `mulberry32(seed)`，
 *     所以 `?seed=` 这一个数就是整次抽签本身。参数照样逐条写进 URL
 *     （和 `reloadWith` 同一条纪律：重载是为了换身体，不是为了重置演示），
 *     但即使有人只抄走了 seed，这一屏也复现得出来。
 *
 * ## 它**不**抽什么，以及为什么
 *
 * 渲染那一组的四个开关（跟随延迟 / 时域精化 / 后期 / 声音）**一个都不抽**。
 * 它们不是"这具身体长什么样"，是"它为什么看起来像活的" —— 把跟随延迟随机
 * 关掉，观众看到的是一具反应生硬的身体，读作**坏了**，不读作"另一种可能"。
 * 一个会随机把作品弄坏的按钮，观众按第二次之前就已经不信它了。
 * 同理声音：静音是一个观众按下去才该发生的事，不该由骰子决定。
 *
 * 抽的是五样**改变画面本身**的：物种、形体、场景、玩法、描边。
 */
import { mulberry32 } from '../../../core/src/rng.ts';

/** 这一次可以从中抽的东西。全部由调用方给 —— 这个文件不认识任何一个 id */
export interface RandomPool {
  /** `parts.json` 的 themes。空数组 = 不抽物种（保持当前的那一个） */
  themes: readonly string[];
  /** `BODY_PLANS` + `mass`，和控件条第一组逐条对应 */
  forms: readonly string[];
  scenes: readonly string[];
  /** `acts/index.ts` 的 id，由 director 传进来 */
  acts: readonly string[];
  /** `creature/shading.ts` 的 `SHADING_IDS` */
  shadings: readonly string[];
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
 * 抽的顺序是固定的（物种 → 形体 → 场景 → 玩法 → 描边）。顺序一变，
 * 同一个 seed 就指向另一具身体 —— 也就是把所有已经被人记下来的 URL 作废。
 * 要加第六样，**加在末尾**。
 */
export function randomPatch(seed: number, pool: RandomPool): RandomPatch {
  const s = Math.abs(Math.trunc(seed)) % SEED_MAX;
  const rng = mulberry32(s);
  const pick = (xs: readonly string[]): string | null => {
    // **无论那一池空不空，都先抽一次**（见下面"顺序即契约"）
    const r = rng.next();
    return xs.length ? xs[Math.min(xs.length - 1, Math.floor(r * xs.length))]! : null;
  };

  // 顺序即契约 —— 每一行都要消耗一次 rng()，哪怕那一池是空的，
  // 否则"这一台没有玩法"和"那一台有玩法"会对同一个 seed 给出不同的形体。
  const theme = pick(pool.themes);
  const plan = pick(pool.forms);
  const scene = pick(pool.scenes);
  const act = pick(pool.acts);
  const shading = pick(pool.shadings);

  const patch: RandomPatch = { seed: String(s) };
  if (theme) patch.theme = theme;
  if (plan) patch.plan = plan;
  if (scene) patch.scene = scene;
  if (act) patch.act = act;
  // 描边**显式**写 `?shading=`。`reloadWith` 故意不带这个参数（它是物种自己的
  // 声明，带给下一个物种是错的）—— 而这里是一次显式覆盖，和手打 `?shading=`
  // 是同一件事，所以它该留在地址栏里。
  if (shading) patch.shading = shading;
  return patch;
}
