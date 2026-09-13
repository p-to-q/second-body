/**
 * 把降级阶梯的前两级接到**真的会做事的那两条路**上（docs/36 D4）。
 *
 * `shell/degrade.ts` 的设计是对的：机制在 shell，动作由各子系统认领。
 * 问题是没有人认领 —— `registerDegradeHandler` 在 `packages/app/src` 里
 * **一个调用者都没有**，只有 `/dev/degrade.html` 注册了它自己的三条。
 * 于是那一页把三级全打绿了，而正式程序里的阶梯是：**空转 → 空转 → 重载**。
 * 那正是 P21 那条：仪表答对了它自己问的那个问题，而那不是我们要问的问题。
 *
 * 为什么单开一个文件而不是在 `main.ts` 里写两行：`main.ts` 里的那两行
 * 没有任何办法被测到（它是一个吃 WebGPU 的长 async）。这一层只吃两个回调，
 * 于是"第 1 级真的关了后期、第 2 级真的换了占位几何"是可执行的命题。
 *
 * 第 3 级（重载）不在这里 —— 它本来就是 `degrade.ts` 自己做的，一直是真的。
 */
import { registerDegradeHandler } from './degrade.ts';

export interface DegradeTargets {
  /**
   * 关后期。就是控件条「渲染」那一组按 `P` 走的同一条路（`stage.setPost`）——
   * **不是**翻 `flags.nopost`：那个位 `createStage()` 只在开机时读一次，
   * 运行中翻它后期不会关（docs/36 D4 第 1 级）。
   */
  setPost(on: boolean): void;
  /**
   * 整具换回占位几何。`creature.remorph(toPlaceholderGenome(genome))` ——
   * 库那侧的能力早就齐了（`placeholder:<slot>` → 程序化几何）。
   * 还没成型（`genome` 为 null）或者这一具是团块/点场时是 no-op。
   */
  toPlaceholder(): void;
}

/** 返回注销函数（测试与热重载用）。调用点在 `main.ts`，creature 建好之后。 */
export function wireDegrade(targets: DegradeTargets): () => void {
  const off = [
    registerDegradeHandler('post', () => targets.setPost(false)),
    registerDegradeHandler('placeholder', () => targets.toPlaceholder()),
  ];
  return () => { for (const f of off) f(); };
}
