/**
 * 部件配方目录 —— 资产的唯一真相（P9）。
 * 结构：theme × slot × variant。theme 定义造型语言（themes.ts），slot 定义形状与比例。
 *
 * 改这里会改变 recipeHash 从而触发重新生成（花 credits），改之前想清楚。
 * 只影响规范化的字段（flip / partSymmetry）不参与哈希 —— 见 generate.ts 的 genHash。
 */
import type { Slot, Tier } from '../../core/src/types.ts';
import { GENERATED, SIGNATURE_SLOTS, STYLE_BASE, entryById } from './roster.ts';

export interface Recipe {
  id: string;                 // = partId，命名 <slot>.<theme>.<variant>
  slot: Slot;
  theme: string;
  tier: Tier;
  prompt: string;
  seed: number;
  bbox: [number, number, number];
  isSymmetric: 'symmetric' | 'balanced' | 'asymmetric' | 'unknown';
  partSymmetry: 'mirror' | 'none';
  qualityOverride: number;
  material: 'PBR' | 'None' | 'Shaded' | 'Hybrid' | 'All';
  /**
   * 规范化时是否把长轴上下翻转（让 socketA = 靠近躯干的一端）。
   * undefined = 用"粗端朝下"的自动启发式；true/false = 人工覆盖（看过 /dev/parts.html 之后填）。
   * 改这个字段不花 credits：只需重跑 factory:normalize。
   */
  flip?: boolean;
}

/** flip: 人工确认过的长轴朝向；undefined = 自动。见 Recipe.flip */
const SLOTS: Record<string, { slot: Slot; desc: string; bbox: [number, number, number]; sym: Recipe['isSymmetric']; partSym: 'mirror' | 'none'; flip?: boolean }> = {
  head:     { slot: 'head',     desc: 'a head unit for a humanoid robot with a single horizontal sensor band',  bbox: [260, 280, 300], sym: 'symmetric', partSym: 'none'   },
  spine:    { slot: 'spine',    desc: 'a torso carapace / chest shell for a humanoid robot, hollow shoulder openings', bbox: [420, 500, 260], sym: 'symmetric', partSym: 'none' },
  clavicle: { slot: 'clavicle', desc: 'a short shoulder yoke connector piece',                                  bbox: [120, 220, 120], sym: 'balanced',  partSym: 'mirror' },
  upperArm: { slot: 'upperArm', desc: 'an elongated tapered upper-arm segment',                                 bbox: [100, 320, 100], sym: 'symmetric', partSym: 'mirror' },
  foreArm:  { slot: 'foreArm',  desc: 'an elongated slightly tapered forearm segment',                          bbox: [ 90, 300,  90], sym: 'symmetric', partSym: 'mirror' },
  hand:     { slot: 'hand',     desc: 'a simplified three-finger manipulator hand',                             bbox: [160, 200, 320], sym: 'balanced',  partSym: 'mirror' },
  thigh:    { slot: 'thigh',    desc: 'a thick elongated thigh segment',                                        bbox: [130, 340, 130], sym: 'symmetric', partSym: 'mirror' },
  shin:     { slot: 'shin',     desc: 'an elongated tapered shin segment',                                      bbox: [110, 330, 110], sym: 'symmetric', partSym: 'mirror' },
  foot:     { slot: 'foot',     desc: 'a simplified foot, flat sole',                                           bbox: [160, 180, 340], sym: 'balanced',  partSym: 'mirror', flip: false },
  joint:    { slot: 'joint',    desc: 'a spherical mechanical joint ball with a thin collar ring',              bbox: [200, 200, 200], sym: 'symmetric', partSym: 'none'   },
};

const VARIANT_MOD: Record<string, string> = {
  a: '',
  b: 'more angular and faceted',
};

/** 稳定 hash → seed，保证同一个 id 永远拿到同一个 seed（P9） */
function seedOf(id: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h % 65536;
}

function make(slotKey: string, themeId: string, variant: string): Recipe {
  const s = SLOTS[slotKey];
  const t = entryById(themeId)!;
  const id = `${slotKey}.${themeId}.${variant}`;
  const mod = VARIANT_MOD[variant] ? `, ${VARIANT_MOD[variant]}` : '';
  return {
    id,
    slot: s.slot,
    theme: themeId,
    tier: t.tierOfVariant[variant] ?? 1,
    prompt: `${s.desc}, ${t.look}${mod}. ${STYLE_BASE}`,
    seed: seedOf(id),
    bbox: s.bbox,
    isSymmetric: s.sym,
    partSymmetry: s.partSym,
    qualityOverride: 3000,
    material: 'PBR',
    flip: s.flip,
  };
}

export const SLOT_KEYS = Object.keys(SLOTS);

/**
 * full 条目：10 槽位 × 2 变体 = 20 件
 * light 条目：6 个标志性槽位 × 1 变体 = 6 件，其余槽位运行时向 base 借
 *
 * 这条分级是故意的：物种的**数量**本身就是这件作品的内容，
 * 所以"再加一个物种"的成本必须低（3 credits），而不是 10。
 */
export const RECIPES: Recipe[] = GENERATED.flatMap((t) => {
  const slots = t.coverage === 'full' ? SLOT_KEYS : SIGNATURE_SLOTS;
  return slots.flatMap((s) => Object.keys(t.tierOfVariant).map((v) => make(s, t.id, v)));
});

export const recipesOfTheme = (themeId: string): Recipe[] => RECIPES.filter((r) => r.theme === themeId);

/** 试跑批：验证一个新主题的造型语言之前，先花 3 credits 看这 6 件（docs/09 U4-U6） */
export const pilotIds = (themeId: string): string[] =>
  ['spine', 'head', 'upperArm', 'foreArm', 'foot', 'joint'].map((s) => `${s}.${themeId}.a`);

export const PILOT_IDS = pilotIds('porcelain');

export function recipeById(id: string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
}
