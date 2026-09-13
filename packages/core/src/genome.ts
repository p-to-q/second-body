/**
 * Genome 抽取。规格见 docs/05 §1。
 *
 * 不变式（有测试）：
 *  - 同样的 (seed, tier, index) 永远得到同样的 Genome —— 现场才可复现、二维码留念才有意义（P9）。
 *  - 任何输入都返回**槽位齐全**的 Genome；缺件用占位 id（`placeholder:<slot>`），
 *    运行时据此走程序化几何（ADR-4：没有资产也要能跑）。
 *  - 随机只来自传入 seed 派生的 Rng，绝无 Math.random（P1）。
 *  - `opt.rejected` 里的 id 绝不会出现在任何槽位上；但它**不改变可选物种名单** ——
 *    策展否掉的是「这一件」，不是「这个物种」。见下面两个池子 inTier / usable。
 */
import type { Genome, MaterialRole, PartLibraryIndex, PartMeta, Rng, SlotKey, Tier } from './types.ts';
import { mulberry32 } from './rng.ts';
import { ALL_BONE_IDS, SLOT_OF_BONE } from './slots.ts';
import { MORPH } from './tuning.ts';

export const PLACEHOLDER_PREFIX = 'placeholder:';

/** 躯干=primary，四肢=secondary，头/手/脚=accent（docs/05 §1） */
function roleOf(key: SlotKey): MaterialRole {
  if (key === 'spine' || key === 'neck' || key === 'clavicleL' || key === 'clavicleR') return 'primary';
  if (key === 'head' || key === 'handL' || key === 'handR' || key === 'footL' || key === 'footR') return 'accent';
  if (key === 'joint') return 'secondary';
  return 'secondary';
}

const slotOfKey = (key: SlotKey) => (key === 'joint' ? 'joint' : SLOT_OF_BONE[key]);

/**
 * 某个 theme 在该 tier 下**有没有自有件** —— 用来决定它出不出现在名单里。
 *
 * 注意它**故意不看策展**（`GenomeOptions.rejected`）：
 * 「这个 theme 有没有自有件」是名单问题，「这具身体的某个槽位该用哪件」是选件问题。
 * 把后者喂给前者，一个物种就会因为它唯一的那件被人否掉而整个消失
 * —— `wheelleg` 只有 `spine.wheelleg.a` 一件，而它已被标 reject。
 * 缺的件沿 `base` 链借（wheelleg → porcelain），物种本身留在名单上。
 */
export function themeIsUsable(index: PartLibraryIndex, theme: string, tier: Tier): boolean {
  return index.parts.some((p) => p.family === theme && p.tier <= tier);
}

export interface GenomeOptions {
  /** 观众选的主题。缺省时按 seed 抽一个可用的 */
  theme?: string;
  /**
   * 被人工判定为 reject 的部件 id，不进**选件**池（docs/14 素材策展）。
   * 不传 = 不做策展过滤（core 不读文件，集合由 app 层从 `/parts/curation.json` 取）。
   */
  rejected?: ReadonlySet<string>;
}

/** 同一个条目只喊一次 —— `makeGenome` 每次升档都会被调一遍 */
const warnedEmptyTheme = new Set<string>();
const warnedUnknownTheme = new Set<string>();

/**
 * 点名的那个物种，到底给谁。
 *
 * 以前这里只有一行 `themes.includes(opt.theme) ? opt.theme : rng.pick(themes)`，
 * 而 `themes` 是**部件的 family** 推出来的名单。于是一个一件自有件都没有的条目
 * （`char.diva` / `guest.keynote` / `guest.founder`）会落进 else 分支，
 * **静默变成另一个物种**：HUD 上的名字、配色、剪影全是别人的，没有任何一处说过话
 * （docs/39 §2.1）。缺素材本该表现为**借件** —— base 链就是为这件事存在的 ——
 * 而不是换物种。这两件事在画面上完全不同，在代码里以前是同一条路。
 *
 * 现在分成三种，每一种都有一个和别的不一样的读数（docs/02 P21）：
 *
 *   1. 点名的条目有自有件           → 就是它（绝大多数情况，一字未改）
 *   2. 点名的条目**声明过但没有件** → **仍然是它**：身份留着，槽位沿 base 链借，
 *                                     并喊一声。画面读作"零件还没长齐"，不是"换了个物种"
 *   3. 点名的是一个不存在的 id       → 只有这一种才回到随机，并且喊一声
 *
 * 随机那一支仍然只从**有自有件**的名单里抽 —— 自动挑身体时不该挑到一个空条目。
 */
function resolveTheme(
  want: string | undefined,
  themes: string[],
  declared: ReadonlySet<string>,
  rng: Rng,
): string {
  if (want && themes.includes(want)) return want;
  if (want && declared.has(want)) {
    if (!warnedEmptyTheme.has(want)) {
      warnedEmptyTheme.add(want);
      console.warn(`[genome] ${want}: 一件自有件都没有 —— 保留物种身份，全部槽位沿 base 链借件`);
    }
    return want;
  }
  if (want && !warnedUnknownTheme.has(want)) {
    warnedUnknownTheme.add(want);
    console.warn(`[genome] ${want}: 索引里没有这个条目 —— 随机挑一个有件的物种`);
  }
  return themes.length ? rng.pick(themes) : (want ?? 'placeholder');
}

/** 测试用：清掉"同一个条目只喊一次"的记忆 */
export function resetGenomeWarnings(): void {
  warnedEmptyTheme.clear();
  warnedUnknownTheme.clear();
}

export function makeGenome(
  seed: number,
  tier: Tier,
  index: PartLibraryIndex,
  opt: GenomeOptions = {},
): Genome {
  const rng = mulberry32((seed ^ (tier * 0x9e3779b9)) >>> 0);
  const rejected = opt.rejected;

  // 两个池子，刻意分开（这正是本次 bug 的要害）：
  //  - inTier：只过 tier 闸门。**名单**从它来 —— 有哪些物种，是策展管不着的事。
  //  - usable：再过一遍策展。**选件**从它来 —— 哪一件能上身，才是策展的事。
  // 合成一个池子的代价是具体的：`wheelleg` 只有 `spine.wheelleg.a` 一件且已被 reject，
  // 合并后它会整个从名单里消失，`{ theme: 'wheelleg' }` 会静默变成别的物种。
  // 一个物种不该因为它的某一件不好看就不存在；那一件不好看，借 base 链上的就是了。
  const inTier = (index.parts ?? []).filter((p) => p.tier <= tier);
  const usable = rejected ? inTier.filter((p) => !rejected.has(p.id)) : inTier;

  // 1. 主题（名单 = inTier，所以加不加 rejected，可选物种集合一模一样）
  const themes = [...new Set(inTier.map((p) => p.family))].sort();
  // 索引里**声明过**的条目 —— 包括一件自有件都没有的那些。
  // 名单（随机抽谁）和身份（点名要谁）是两件事，见下面 resolveTheme 的注释。
  const declared = new Set((index.themes ?? []).map((t) => t.id));
  const theme = resolveTheme(opt.theme, themes, declared, rng);

  // 2. 逐槽位抽件
  const keys: SlotKey[] = [...ALL_BONE_IDS, 'joint'];
  const slots = {} as Genome['slots'];
  const hybridBudget = tier >= 3 ? MORPH.hybridSlotsAtTier3 : 0;
  let hybridUsed = 0;

  // light 条目只自己生成 6 个标志性槽位，其余沿 base 链向上借
  // （docs/14 §3：物种数量本身是内容，所以加一个物种的成本必须低）
  const baseChain = (id: string): string[] => {
    const chain: string[] = [];
    let cur: string | undefined = id;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      chain.push(cur);
      cur = index.themes?.find((t) => t.id === cur)?.base;
    }
    return chain;
  };
  const chain = baseChain(theme);

  for (const key of keys) {
    const slot = slotOfKey(key);
    // 沿 base 链找第一个有货的层级
    let inTheme: PartMeta[] = [];
    for (const t of chain) {
      inTheme = usable.filter((p) => p.slot === slot && p.family === t);
      if (inTheme.length) break;
    }
    const outTheme = usable.filter((p) => p.slot === slot && !chain.includes(p.family));

    // tier 3 允许少量跨主题杂交；其余情况一律同主题
    const wantHybrid = hybridUsed < hybridBudget && outTheme.length > 0
      && rng.next() > MORPH.sameFamilyChance;
    let pool: PartMeta[] = wantHybrid ? outTheme : inTheme;
    if (!pool.length) pool = inTheme.length ? inTheme : outTheme;

    if (!pool.length) {
      slots[key] = { partId: PLACEHOLDER_PREFIX + slot, materialRole: roleOf(key) };
      continue;
    }
    if (wantHybrid && pool === outTheme) hybridUsed++;
    // 按 id 排序保证与 parts.json 的顺序无关 —— 同 seed 必须同结果
    const sorted = pool.slice().sort((a, b) => a.id.localeCompare(b.id));
    slots[key] = { partId: rng.pick(sorted).id, materialRole: roleOf(key) };
  }

  // 3. 材质：优先用主题自己的 palette，不足再从全局材质补
  const def = index.themes?.find((t) => t.id === theme);
  const available = (index.materials ?? []).filter((m) => m.tier <= tier).map((m) => m.id);
  const picked: string[] = [];
  for (const id of def?.palette ?? []) if (available.includes(id) && !picked.includes(id)) picked.push(id);
  const rest = available.filter((id) => !picked.includes(id));
  while (picked.length < 3 && rest.length) picked.push(rest.splice(rng.int(rest.length), 1)[0]);
  while (picked.length < 3) picked.push(picked[picked.length - 1] ?? 'placeholder');

  return {
    seed, tier, theme,
    slots,
    materials: { primary: picked[0], secondary: picked[1], accent: picked[2] },
  };
}

/**
 * 把一具已经成型的 Genome 整具换成占位几何 —— 降级阶梯第 2 级的那个动作（docs/36 D4）。
 *
 * 只换 `partId`，材质与 seed/tier/theme 一律留着：降级要的是"一定画得出来"，
 * 不是"变成另一具身体"。占位 id 走的是 `library.geometry()` 里已经存在的那条路
 * （`placeholder:<slot>` → 程序化几何），所以这一侧不需要任何新能力。
 */
export function toPlaceholderGenome(g: Genome): Genome {
  const slots = {} as Genome['slots'];
  for (const key of [...ALL_BONE_IDS, 'joint'] as SlotKey[]) {
    const prev = g.slots?.[key];
    slots[key] = {
      partId: PLACEHOLDER_PREFIX + slotOfKey(key),
      materialRole: prev?.materialRole ?? roleOf(key),
    };
  }
  return { ...g, slots };
}
