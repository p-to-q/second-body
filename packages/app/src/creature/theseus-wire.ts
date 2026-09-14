/**
 * 把排期器（`core/src/theseus.ts`）接到身体上。**这里没有第二套换装机制**——
 * docs/44 §1 说得很直白：升档那套（`remorph`、三件并发上限、冷却）一行都不浪费，
 * 这一版只是把它的粒度从"一次提交一批"改成"一次提交一件"。
 * 所以下面 `swapOneSlot()` 做的全部事情，就是**把当前 genome 抄一份、改掉一个槽位**；
 * 换上去的那一下由 `creature.replace()` 演（docs/44 §7：碎开、装上、描边不断）。
 *
 * 拆成独立文件而不是写进 `main.ts`，是为了这两个函数能被单测直接钉住：
 * `?theseus=off` 之后一台机器都不建（§10 第 7 条），以及"换的确实只有一件"。
 */
import { createTheseus, type TheseusMachine } from '../../../core/src/theseus.ts';
import { borrowPart, type BorrowChoice } from '../../../core/src/borrow.ts';
import type { Genome, PartLibraryIndex, PartMeta, SlotKey, Tier } from '../../../core/src/types.ts';
import { makeAdmit } from './swap-budget.ts';
import type { Flags } from '../shell/kiosk.ts';

/**
 * `?theseus=off` 时返回 null —— **不是建一台然后不用它**。
 * 现场的 plan B 必须是真的：关掉之后这条线上一个对象都不存在，
 * 身体退回这一版之前那条"四档跳"的路。
 */
export function makeTheseus(
  flags: Pick<Flags, 'theseus'>,
  seed: number,
  total: number,
): TheseusMachine | null {
  if (!flags.theseus.on) return null;
  return createTheseus({ seed, total, rate: flags.theseus.rate });
}

export interface BorrowOptions {
  tier: Tier;
  index: PartLibraryIndex;
  rejected?: ReadonlySet<string>;
  /** 弧线进度 0..1（`ArcState.overall`）—— 借件距离按它张开（docs/44 §4）。缺省 0 = 只借本物种 */
  overall?: number;
  /** 慢回路为这个观众生成、已经到货的件（d4）。缺省 = 没到货，d4 退回 d3 */
  grown?: readonly PartMeta[];
  /** 借到了哪一圈 —— HUD / 取证用，不影响结果 */
  onChoice?: (choice: BorrowChoice) => void;
}

/**
 * 抄一份 genome，只改掉 `slot` 那一格：那一格的件按**借件距离**从别处借来
 * （`core/src/borrow.ts`：d0 本物种 → d1 base 链 → d2 同 kind → d3 别的 kind → d4 观众自己的剪影）。
 *
 * 借不到（五个圈里都没有可用的件）就返回 null：**这一件就是不发生**，
 * 不抛、不等、不退化成"换了个一模一样的"（P3）。
 */
export function swapOneSlot(
  g: Genome | null,
  slot: SlotKey,
  borrowSeed: number,
  opt: BorrowOptions,
): Genome | null {
  if (!g?.slots) return null;
  const choice = borrowPart({
    slot, genome: g, tier: opt.tier, index: opt.index, rejected: opt.rejected,
    overall: opt.overall ?? 0, seed: borrowSeed >>> 0, grown: opt.grown,
    // 预算门：换上之后最坏那一帧（稳态 + 一件替换 + 同时交叉淡入）放不下的件不借（`swap-budget.ts`）
    admit: makeAdmit({ genome: g, index: opt.index, slot, rejected: opt.rejected }),
  });
  if (!choice || choice.pick.partId === g.slots[slot]?.partId) return null;
  opt.onChoice?.(choice);
  return { ...g, slots: { ...g.slots, [slot]: choice.pick } };
}
