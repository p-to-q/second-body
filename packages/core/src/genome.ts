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
import type { Genome, MaterialRole, PartLibraryIndex, PartMeta, SlotKey, Tier } from './types.ts';
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
  const theme = opt.theme && themes.includes(opt.theme)
    ? opt.theme
    : (themes.length ? rng.pick(themes) : (opt.theme ?? 'placeholder'));

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
