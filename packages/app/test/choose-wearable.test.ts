/**
 * 选择页的上场判据（`choose/choose.ts` 的 `isWearable`）。
 *
 * 它回答的是一个承诺：**列在轮播里 = 观众点下去真的会变成它**。
 * 这个承诺以前有一处漏洞：判据里有「∪ 有 anchor 图的」一条，而 anchor 图是
 * 一张参考渲染，不是零件。零自有件的条目一旦被补上一张 anchor 图，
 * 它立刻上场，而 `makeGenome` 那边一件自有件都没有（docs/39 §2.1）。
 *
 * 这里连着两头一起钉：判据本身，以及**真 parts.json 上判据与 genome 的一致性** ——
 * 列出来的每一具，`makeGenome` 都必须装配成它自己，而不是别的物种。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isWearable } from '../src/choose/wearable.ts';
import { makeGenome, themeIsUsable } from '../../core/src/genome.ts';
import type { PartLibraryIndex, ThemeDef, Tier } from '../../core/src/types.ts';

const theme = (id: string, source: ThemeDef['source'] = 'rodin'): ThemeDef => ({
  id, kind: 'archetype', name: id, nameEn: id, tagline: '', taglineEn: '',
  palette: [], source, axes: { humanLike: 0.5, lifeLike: 0.5 }, coverage: 'light',
});

const lib = (counts: Record<string, number>) => ({ partCount: new Map(Object.entries(counts)) });

test('有件的上场，零件的不上场', () => {
  const library = lib({ porcelain: 20 });
  assert.equal(isWearable(theme('porcelain'), library), true);
  assert.equal(isWearable(theme('char.diva'), library), false);
});

test('程序化条目不需要任何零件 —— 「场」靠的是这一条', () => {
  assert.equal(isWearable(theme('field', 'procedural'), lib({})), true);
});

test('anchor 图不算数：一张参考渲染不是一件可以穿的零件', () => {
  // 这正是被拿掉的那一条。判据里不再有任何一个参数代表"有没有图" ——
  // 有图而没有件的条目，和没图没件的条目，在这里必须是同一个答案。
  assert.equal(isWearable(theme('guest.keynote'), lib({ guest_keynote_anchor_exists: 1 })), false);
  assert.equal(isWearable(theme('guest.keynote'), lib({})), false);
});

test('调用者自带条目表（dev 页）时全部放行 —— 那时没有库可查', () => {
  assert.equal(isWearable(theme('char.diva'), lib({}), true), true);
});

// ── 真索引上的那条一致性命题 ───────────────────────────────────────────────
const PARTS = resolve(import.meta.dirname, '../../../assets/parts/parts.json');

test('真 parts.json：列出来的每一具，makeGenome 都装配成它自己', { skip: !existsSync(PARTS) }, () => {
  const index: PartLibraryIndex = JSON.parse(readFileSync(PARTS, 'utf8'));
  const partCount = new Map<string, number>();
  for (const p of index.parts) partCount.set(p.family, (partCount.get(p.family) ?? 0) + 1);
  const library = { partCount };

  const offered = index.themes.filter((t) => isWearable(t, library));
  assert.ok(offered.length > 3, '一个条目都没上场，这条测试什么都没测');

  for (const t of offered) {
    if (t.source === 'procedural') continue;
    assert.ok(themeIsUsable(index, t.id, 3), `${t.id} 上了场却一件自有件都没有`);
    for (const tier of [1, 2, 3] as Tier[]) {
      assert.equal(makeGenome(7, tier, index, { theme: t.id }).theme, t.id,
        `${t.id} 被装配成了别的物种`);
    }
  }

  // 反方向：零自有件的条目必须**不在**轮播里。
  // 这一条从索引推出来，不钉死某几个 id —— 一个条目一旦真的生成了自有件
  // （`char.diva` / `guest.keynote` 2026-09-13 就是这样上场的），它上场是对的，
  // 该失败的是「有件却不上场」和「没件却上场」，不是「名单变了」。
  for (const t of index.themes) {
    if (t.source === 'procedural') continue;
    if (!partCount.get(t.id)) assert.equal(isWearable(t, library), false, `${t.id} 零自有件却还在轮播里`);
  }
});

test('真 parts.json：guest.founder 被 clearance 挡在条目表之外（docs/14 §2）',
  { skip: !existsSync(PARTS) }, () => {
    const index: PartLibraryIndex = JSON.parse(readFileSync(PARTS, 'utf8'));
    assert.equal(index.themes.some((t) => t.id === 'guest.founder'), false,
      'guest.founder 是一个故意的空位，它应当看得见地缺席，而不是静默变成别的物种');
  });
