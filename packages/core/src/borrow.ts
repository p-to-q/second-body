/**
 * 忒修斯之船的**借件**：被换掉的那一格，换成谁的件。规格见 `docs/44-THESEUS.md` §4。
 *
 * ── 五个圈 ──────────────────────────────────────────────────────────────────
 *   d0  本物种自己的件（`family === theme`）
 *   d1  `base` 链上的近邻（不含自己）
 *   d2  同一个 `kind`、但不在自己链上的物种
 *   d3  不同 `kind` 的物种 —— "索引里的任何一件"里**离自己最远**的那一圈
 *   d4  慢回路从**这个观众自己的剪影**生成、并且已经到货的那一件
 *
 * 圈是**互斥**的：d3 不含自己的件，否则"晚期几乎总是 d3"里就藏着一条借回自己的路，
 * §10 第 6 条那句"晚期不会突然借回自己的件"就只对 HUD 上的数成立，对真正换上去的件不成立。
 * 索引里只有一种 kind 时 d3 是空的 —— 那时它向内退到 d2（见 `borrowPart` 的退路顺序）。
 *
 * ── 连续，不是四个开关 ──────────────────────────────────────────────────────
 * `borrowMix(overall)` 给出 d0..d4 五个权重。`borrowCurve` 的第 k 个门槛是 dk **开始出现**
 * 的地方，下一个门槛是它**占满**的地方；两个门槛之间，相邻两圈按线性插值混着抽。
 * 于是任何一刻最多只有两圈在混，期望距离随 `overall` 单调不减 ——
 * 而"看不出它什么时候开始变"正是这段混合区给的（§4）。
 *
 * ── 不许借的 ────────────────────────────────────────────────────────────────
 *  - 策展否掉的（`rejected`，app 层从 `curation.json` 取 —— 和 `makeGenome` 同一个集合）；
 *  - 家族不在 `index.themes` 里的：`buildIndex()` 按 clearance 把条目挡在索引之外
 *    （`guest.founder`，docs/14 §2），这里再认一次条目表 —— 件漏进了 `parts`、
 *    条目没漏进 `themes` 的时候，**借件这条路不能是那个缺口**；
 *  - 占位件、和这一格现在那一件相同的件。
 *
 * 纯的：不碰 three、不读时钟、不摇裸骰子（P1），随机只来自调用方递进来的 seed。
 */
import { THESEUS as T } from './tuning.ts';
import { mulberry32 } from './rng.ts';
import { SLOT_OF_BONE } from './slots.ts';
import { PLACEHOLDER_PREFIX } from './genome.ts';
import type { Genome, PartLibraryIndex, PartMeta, Slot, SlotKey, SlotPick, Tier } from './types.ts';

export type BorrowRing = 0 | 1 | 2 | 3 | 4;
export const BORROW_RINGS: readonly BorrowRing[] = [0, 1, 2, 3, 4];

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const fin = (x: unknown, fallback = 0): number => (Number.isFinite(x) ? (x as number) : fallback);

/**
 * 连续的"伸出去多远"，0..4。第 k 个门槛处 = k−1（dk 刚开始出现），
 * 第 k+1 个门槛处 = k（dk 占满）。最后一个门槛之后朝 `overall = 1` 线性走到 4。
 * 门槛被写成不单调的也按"不许回头"读（和 `theseus.ts` 的 `borrowDistance` 同一条）。
 */
export function borrowReach(overall: number, curve: readonly number[] = T.borrowCurve): number {
  const p = clamp01(fin(overall));
  const gates: number[] = [];
  let g = 0;
  for (const th of curve) { g = Math.max(g, clamp01(fin(th, 1))); gates.push(g); }
  if (!gates.length || p < gates[0]) return 0;
  for (let k = 0; k < gates.length; k++) {
    const lo = gates[k];
    const hi = k + 1 < gates.length ? gates[k + 1] : 1;
    if (p < hi || k === gates.length - 1) {
      const span = hi - lo;
      return Math.min(gates.length, k + (span > 1e-9 ? clamp01((p - lo) / span) : 1));
    }
  }
  return gates.length;
}

/**
 * d0..d4 的抽签权重，和为 1。`grown = false`（慢回路那一件没到货）时 d4 的份额**并进 d3** ——
 * 不等、不卡、不报错（§4 / P3）。
 */
export function borrowMix(overall: number, grown: boolean, curve: readonly number[] = T.borrowCurve): number[] {
  const r = borrowReach(overall, curve);
  const w = [0, 0, 0, 0, 0];
  const lo = Math.min(4, Math.floor(r));
  const frac = r - lo;
  w[lo] += 1 - frac;
  if (frac > 0) w[Math.min(4, lo + 1)] += frac;
  if (!grown) { w[3] += w[4]; w[4] = 0; }
  return w;
}

export interface BorrowRequest {
  /** 被换掉的那一格 */
  slot: SlotKey;
  /** 这具身体此刻的 genome —— 物种（`theme`）从它读，"不是现在这一件"也从它读 */
  genome: Genome;
  tier: Tier;
  index: PartLibraryIndex;
  /** 策展否掉的 id（`library.rejected`） */
  rejected?: ReadonlySet<string>;
  /** 弧线进度 0..1（`ArcState.overall`） */
  overall: number;
  /** 这一次借件的种子。同一个种子 → 同一件 */
  seed: number;
  /** 慢回路为这个观众生成、已经到货的件（d4 池）。空 = d4 退回 d3 */
  grown?: readonly PartMeta[];
  curve?: readonly number[];
}

export interface BorrowChoice {
  pick: SlotPick;
  meta: PartMeta;
  /** 实际借到的那一圈 */
  ring: BorrowRing;
  /** 抽签抽中的那一圈（池子空时 `ring` 会从这里往外退） */
  wanted: BorrowRing;
}

const slotOf = (key: SlotKey): Slot => (key === 'joint' ? 'joint' : SLOT_OF_BONE[key]);

/** 这个物种的五个圈各有哪些件。纯函数，测试直接读它 */
export function borrowPools(req: Omit<BorrowRequest, 'overall' | 'seed' | 'curve'>): PartMeta[][] {
  const { index, genome, tier, rejected } = req;
  const slot = slotOf(req.slot);
  const current = genome.slots?.[req.slot]?.partId;
  const themes = index.themes ?? [];
  const declared = new Map(themes.map((t) => [t.id, t]));
  const theme = genome.theme;

  const chain = new Set<string>();
  for (let cur: string | undefined = theme; cur && !chain.has(cur); cur = declared.get(cur)?.base) chain.add(cur);
  const kind = declared.get(theme)?.kind;

  const ok = (p: PartMeta): boolean =>
    !!p && typeof p.id === 'string' && p.slot === slot && fin(p.tier, 99) <= tier
    && !p.id.startsWith(PLACEHOLDER_PREFIX) && p.id !== current && !rejected?.has(p.id);

  const pools: PartMeta[][] = [[], [], [], [], []];
  for (const p of index.parts ?? []) {
    if (!ok(p)) continue;
    const def = declared.get(p.family);
    // clearance：条目表里没有的家族一件都不借。条目表整个缺席（占位索引）时不设这道门 ——
    // 那时 `parts` 里只有占位件，上面的 `ok()` 已经把它们全挡掉了
    if (themes.length && !def) continue;
    if (p.family === theme) pools[0].push(p);
    else if (chain.has(p.family)) pools[1].push(p);
    else if (kind !== undefined && def?.kind === kind) pools[2].push(p);
    else pools[3].push(p);
  }
  for (const p of req.grown ?? []) {
    // d4 不认条目表（它是这个观众自己的，不是某个物种的），但照样认策展和槽位
    if (ok({ ...p, tier: 0 as Tier })) pools[4].push(p);
  }
  for (const pool of pools) pool.sort((a, b) => a.id.localeCompare(b.id));
  return pools;
}

/**
 * 借一件。借不到 = null（这一件就是不发生，P3）。
 *
 * 退路顺序：抽中的那一圈空了，**先往外**（dk → dk+1 → … → d4），
 * 外面也全空才往里退，而且只要抽中的不是 d0，**往里最多退到 d1** ——
 * 晚期宁可这一件不发生，也不借回自己的件。
 */
export function borrowPart(req: BorrowRequest): BorrowChoice | null {
  if (!req?.genome?.slots || !req.index) return null;
  const pools = borrowPools(req);
  const rng = mulberry32(fin(req.seed) >>> 0);
  const w = borrowMix(req.overall, pools[4].length > 0, req.curve);
  // 不用 `rng.weighted`：它在 next() 恰好为 0 时会落在权重为 0 的第一项上 ——
  // 对别处无所谓，对这里就是"晚期借回自己的件"那 1/2³² 的一次
  let r = rng.next();
  let wanted: BorrowRing = 0;
  for (const d of BORROW_RINGS) {
    if (w[d] <= 0) continue;
    wanted = d;
    r -= w[d];
    if (r < 0) break;
  }

  const order: BorrowRing[] = [];
  for (let d = wanted; d <= 4; d++) order.push(d as BorrowRing);
  const floor = wanted === 0 ? 0 : 1;
  for (let d = wanted - 1; d >= floor; d--) order.push(d as BorrowRing);

  for (const ring of order) {
    const pool = pools[ring];
    if (!pool.length) continue;
    const meta = rng.pick(pool);
    const role = req.genome.slots[req.slot]?.materialRole ?? 'secondary';
    return { pick: { partId: meta.id, materialRole: role }, meta, ring, wanted };
  }
  return null;
}
