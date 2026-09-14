/**
 * 把排期器（`core/src/theseus.ts`）接到身体上。**这里没有第二套换装机制**——
 * docs/44 §1 说得很直白：升档那套（`remorph`、三件并发上限、冷却）一行都不浪费，
 * 这一版只是把它的粒度从"一次提交一批"改成"一次提交一件"。
 * 所以下面 `swapOneSlot()` 做的全部事情，就是**把当前 genome 抄一份、改掉一个槽位**，
 * 然后照旧交给 `creature.remorph()` —— 它自己会 diff 出"只有这一个槽位变了"。
 *
 * 拆成独立文件而不是写进 `main.ts`，是为了这两个函数能被单测直接钉住：
 * `?theseus=off` 之后一台机器都不建（§10 第 7 条），以及"换的确实只有一件"。
 */
import { createTheseus, type TheseusMachine } from '../../../core/src/theseus.ts';
import { makeGenome } from '../../../core/src/genome.ts';
import type { Genome, PartLibraryIndex, SlotKey, Tier } from '../../../core/src/types.ts';
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
}

/**
 * 抄一份 genome，只改掉 `slot` 那一格：那一格的件从**另一个种子**抽出来的身体上取。
 *
 * 借件距离（docs/44 §4：d0 本物种 → d4 观众自己的剪影）是另一条线，
 * 这里只做"不是原来那一件"——刻意不给 `theme`，于是借来的那一件很可能来自别的物种。
 * §4 落地时替换的是**这一个函数的内部**，签名和调用点都不用动。
 *
 * 借不到（索引里那个槽位没有别的件）就返回 null：**这一件就是不发生**，
 * 不抛、不等、不退化成"换了个一模一样的"（P3）。
 */
export function swapOneSlot(
  g: Genome | null,
  slot: SlotKey,
  borrowSeed: number,
  opt: BorrowOptions,
): Genome | null {
  if (!g?.slots) return null;
  const donor = makeGenome(borrowSeed >>> 0, opt.tier, opt.index, { rejected: opt.rejected });
  const pick = donor.slots?.[slot];
  if (!pick || pick.partId === g.slots[slot]?.partId) return null;
  return { ...g, slots: { ...g.slots, [slot]: pick } };
}
