/**
 * 上场名单 —— 这一场里，哪几类身体可以被选。
 *
 * ## 它解决的那一个问题
 *
 * 名单里现在有三种出身完全不同的东西：真实机器（Atlas、G1、Spot……，
 * 网格是从 MuJoCo Menagerie 引进来的）、嘉宾、以及角色（大白、初音、Chiikawa……）。
 * 它们在一张形态图上是平等的，但**在一次具体的展出里往往不是** ——
 * 一个机器人主题的场合不想要初音，一个动漫场合不想要工业机器狗。
 * 在此之前，改这件事的唯一办法是改 `parts.json` 或者删素材。
 *
 * ## 三条设计决定
 *
 * 1. **分组用 `ThemeDef.kind`，不新发明一个维度。** 那个字段本来就在数据里，
 *    而且它记的正好是出身。再加一个 `group` 字段就有了两个真相来源，
 *    早晚会有人只改其中一个。
 *
 * 2. **URL 是权威，localStorage 只是记忆。** `?kinds=archetype,character`
 *    可复现、可写进现场的启动脚本、也可以直接发给别人；
 *    没有这个参数时才回落到上一次的选择。全站的开关都是这个规矩（docs/23）。
 *
 * 3. **不许全关。** 一个空的选择页 = 装置停在菜单上，而现场没有人负责把它救回来。
 *    最后一类被关掉时这里直接拒绝，由调用方给出反馈。
 */
import type { ThemeDef } from '../../../core/src/types.ts';

export type PoolKind = ThemeDef['kind'];

/** 顺序即呈现顺序：先机器，再人，再画出来的东西 —— 和形态图从左到右同向 */
export const POOL_KINDS: readonly PoolKind[] = ['archetype', 'guest', 'character'] as const;

const STORAGE_KEY = 'sb.pool.kinds';
const PARAM = 'kinds';

const listeners = new Set<(kinds: Set<PoolKind>) => void>();

function parse(raw: string | null): Set<PoolKind> | null {
  if (!raw) return null;
  const wanted = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const kinds = new Set<PoolKind>();
  for (const w of wanted) {
    if ((POOL_KINDS as readonly string[]).includes(w)) kinds.add(w as PoolKind);
  }
  // 写了参数但一个都没认出来 = 写错了。**当成没写**，而不是当成"全关" ——
  // 一个拼错的参数不该让装置黑屏。
  return kinds.size > 0 ? kinds : null;
}

/**
 * 这一场的名单。URL > 上次的选择 > 全开。
 *
 * 每次调用都重新读，不缓存：URL 可能被 `replaceState` 改过（见 `setPool`），
 * 而缓存住的那一份是这类开关最常见的一种失灵。
 */
export function readPool(): Set<PoolKind> {
  if (typeof location === 'undefined') return new Set(POOL_KINDS);
  const fromUrl = parse(new URLSearchParams(location.search).get(PARAM));
  if (fromUrl) return fromUrl;
  let stored: string | null = null;
  try { stored = localStorage.getItem(STORAGE_KEY); } catch { stored = null; }
  return parse(stored) ?? new Set(POOL_KINDS);
}

/**
 * 改名单。**全关会被拒绝**（返回 false），调用方据此不要去动那个勾。
 *
 * 改完不刷新页面：这是**建场时的设置**，它在下一次搭选择页时生效。
 * 选择页已经在屏幕上的时候由调用方决定要不要重载 —— 那是一个可见的动作，
 * 不该由一个写 localStorage 的函数偷偷替人做。
 */
export function setPool(kinds: Iterable<PoolKind>): boolean {
  const next = new Set([...kinds].filter((k) => (POOL_KINDS as readonly string[]).includes(k)));
  if (next.size === 0) return false;
  const value = POOL_KINDS.filter((k) => next.has(k)).join(',');
  try { localStorage.setItem(STORAGE_KEY, value); } catch { /* 无痕模式：这一场不记就是了 */ }
  if (typeof history !== 'undefined' && typeof location !== 'undefined') {
    const url = new URL(location.href);
    // 全开时把参数拿掉，地址栏回到干净的样子 —— 默认态不该在 URL 里留痕
    if (next.size === POOL_KINDS.length) url.searchParams.delete(PARAM);
    else url.searchParams.set(PARAM, value);
    history.replaceState(null, '', url);
  }
  for (const fn of listeners) fn(new Set(next));
  return true;
}

/** 名单变了就叫一声。返回退订函数。 */
export function onPoolChange(fn: (kinds: Set<PoolKind>) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/**
 * 按名单筛。**名单筛空了就原样放行** —— 数据里一个 archetype 都没有的时候，
 * 一个只勾了 archetype 的名单不该把选择页变成空的。
 * 宁可多给，不可给不出（AGENTS.md：每条降级路径都要能走）。
 */
export function applyPool<T extends { kind: PoolKind }>(themes: T[], kinds = readPool()): T[] {
  const kept = themes.filter((t) => kinds.has(t.kind));
  return kept.length > 0 ? kept : themes;
}
