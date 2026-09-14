/**
 * 忒修斯替换那一下**长什么样**（`docs/44-THESEUS.md` §7）。纯函数：不碰 three，只出 `SlotRender[]`。
 *
 *   1. 旧件碎开：几片墨屑（旧件自己的几何，缩小）从骨轴向外散、缩没；
 *   2. 新件装上：**原样**是 graft 的组装动画 —— `graftCurve()` 就是 `creature.ts` 里
 *      交叉淡入的那一半新件，这里不另画一条曲线；
 *   3. **描边不断**：旧件的"芯"保持原大，直到新件长到八成以上才让位。
 *      描边是每个实例自己的外壳，互相重叠的实例外壳彼此遮住，只剩并集的外沿 ——
 *      所以只要这一格在任何一刻都有一件足够大的实体，轮廓就是连续的。
 *      交叉淡入做不到这一点：中点两件各剩一半大，轮廓在那一刻塌成一个洞。
 *
 * 为什么是同一个桶里的实例而不是一个新网格：描边模式 36/40 draw call，
 * 墨屑用旧件的桶，新件本来就要一个桶 —— 这一下的 draw call 和交叉淡入完全一样。
 * 实例数会涨（关节盖片那一格涨得最多），上限写在 `THESEUS.shards` 的注释里。
 */
import { MORPH, THESEUS } from '../../../core/src/tuning.ts';
import type { SlotKey, SlotPick } from '../../../core/src/types.ts';
import type { SlotRender } from './assemble.ts';

/**
 * 替换那一下有多长（秒）。**就是 graft 的组装动画的长度**，不另立一个数；
 * 它必须 ≤ `THESEUS.minGap`，否则两次替换会叠在一起。
 */
export const REPLACE_SECONDS = MORPH.crossfade;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const smoothstep = (x: number): number => { const t = clamp01(x); return t * t * (3 - 2 * t); };

/** graft 的组装动画（`creature.ts` 交叉淡入里新件那一半）：从轴向外 `assembleOffset` 吸附回位 */
export function graftCurve(t: number): { scale: number; offset: number } {
  const u = smoothstep(t);
  return { scale: u, offset: (1 - u) * MORPH.assembleOffset };
}

/** 旧件的芯：前 `coreHold` 保持原大，之后缩没 */
export function coreScale(t: number, hold = THESEUS.coreHold): number {
  const h = clamp01(hold);
  return h >= 1 ? (t >= 1 ? 0 : 1) : 1 - smoothstep((t - h) / (1 - h));
}

/**
 * 这一格在 t 时刻"至少有多大的一件实体撑着轮廓"。测试钉的就是它的下界 ——
 * 墨屑不算：它们是往外散的，撑不住轮廓。
 */
export function envelope(t: number): number {
  return Math.max(coreScale(t), graftCurve(t).scale);
}

/** 一片墨屑在 t 时刻的大小与离轴距离（米） */
export function shardAt(t: number): { scale: number; lateral: number } {
  const life = Math.max(1e-3, THESEUS.shardLife);
  const tau = clamp01(t / life);
  const out = 1 - (1 - tau) * (1 - tau);                  // 先快后慢：碎开是"崩"的，不是"飘"的
  return {
    scale: clamp01(THESEUS.shardScale) * (1 - smoothstep(tau)),
    lateral: Math.max(0, THESEUS.shardSpread) * out,
  };
}

/** 一件骨头件碎几片；关节盖片每一处 1 片（实例上限，见 `THESEUS.shards`） */
export const shardCount = (key: SlotKey): number =>
  key === 'joint' ? 1 : Math.max(0, Math.floor(THESEUS.shards));

/** 黄金角：几片墨屑绕骨轴散开时互不重叠，而且不需要随机数（P1） */
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/**
 * t ∈ [0,1] 时这一格要画的全部实例。`pres` 是在场缩放（和交叉淡入同一个乘法）。
 * 顺序：芯、墨屑、新件。
 */
export function replaceRenders(
  key: SlotKey, from: SlotPick | null, to: SlotPick, t: number, pres = 1,
): SlotRender[] {
  const list: SlotRender[] = [];
  const tt = clamp01(t);
  if (from) {
    const core = coreScale(tt);
    if (core > 0) list.push({ partId: from.partId, materialRole: from.materialRole, scale: core * pres });
    const n = shardCount(key);
    const sh = shardAt(tt);
    if (sh.scale > 1e-3) {
      for (let k = 0; k < n; k++) {
        list.push({
          partId: from.partId, materialRole: from.materialRole,
          scale: sh.scale * pres,
          // 沿骨头均匀摆开：缩小后的件占 [0, scale] 那一段，起点落在剩下那一段里
          along: n > 1 ? ((k + 0.5) / n) * (1 - clamp01(THESEUS.shardScale)) : 0,
          lateral: sh.lateral,
          angle: k * GOLDEN,
        });
      }
    }
  }
  const g = graftCurve(tt);
  list.push({ partId: to.partId, materialRole: to.materialRole, scale: g.scale * pres, offset: g.offset });
  return list;
}
