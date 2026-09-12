/**
 * Genome 抽取。规格见 docs/05 §1。
 *
 * 不变式（有测试）：
 *  - 同样的 (seed, tier, index) 永远得到同样的 Genome —— 现场才可复现、二维码留念才有意义（P9）。
 *  - 任何输入都返回**槽位齐全**的 Genome；缺件用占位 id（`placeholder:<slot>`），
 *    运行时据此走程序化几何（ADR-4：没有资产也要能跑）。
 *  - 随机只来自传入 seed 派生的 Rng，绝无 Math.random（P1）。
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

/** 某个 theme 在该 tier 下有没有可用部件 —— 用来决定 theme 是否可选 */
export function themeIsUsable(index: PartLibraryIndex, theme: string, tier: Tier): boolean {
  return index.parts.some((p) => p.family === theme && p.tier <= tier);
}

export interface GenomeOptions {
  /** 观众选的主题。缺省时按 seed 抽一个可用的 */
  theme?: string;
  /** 被人工判定为 reject 的部件 id，不进候选池（docs/14 素材策展） */
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

  const usable = (index.parts ?? []).filter(
    (p) => p.tier <= tier && !(rejected?.has(p.id) ?? false),
  );

  // 1. 主题
  const themes = [...new Set(usable.map((p) => p.family))].sort();
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
