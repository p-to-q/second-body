/**
 * 策展（`GenomeOptions.rejected`）的护栏。
 *
 * 这里**不写**「seed 42 应该抽到 X」这种断言 —— 那种断言碰巧成立，
 * 也碰巧失效，它证明不了排除真的发生了（docs/02 P21：坏掉时仪表要变样）。
 * 全部断言都是穷举式的确定性命题：
 *   1. 扫遍所有 seed × tier × theme，reject 的 id 一次都不出现；
 *   2. 加不加 rejected，**可选物种名单一模一样** —— 没有物种会因为策展消失；
 *   3. 显式指定的 theme 永远被尊重，哪怕它的自有件被 reject 光了（wheelleg）；
 *   4. 没有自有件的空位条目（field / guest.founder 那一类）行为不变。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { makeGenome, themeIsUsable, PLACEHOLDER_PREFIX } from '../src/genome.ts';
import type { PartLibraryIndex, PartMeta, Slot, Tier } from '../src/types.ts';
import { ALL_BONE_IDS } from '../src/slots.ts';

const SLOTS: Slot[] = ['head', 'neck', 'spine', 'clavicle', 'upperArm', 'foreArm', 'hand', 'thigh', 'shin', 'foot', 'joint'];
const TIERS: Tier[] = [1, 2, 3];
const SEEDS = 400;

const part = (id: string, slot: Slot, family: string, tier = 1): PartMeta => ({
  id, slot, family, tier: tier as PartMeta['tier'],
  file: `${id}.glb`, localGirth: 0.3, triCount: 100,
  aabb: { min: [0, 0, 0], max: [1, 1, 1] }, symmetry: 'none',
});

/**
 * 一个最小索引，把仓库里真实存在的三种形状都造出来：
 *  - `donor`   有全套自有件（porcelain 的角色）
 *  - `onepart` 只有一件自有件，而且那件被 reject（wheelleg 的角色）
 *  - `holey`   自有件里有一件被 reject，其余还在（softwear / autonomous 的角色）
 *  - `empty`   从来没有自有件、也没有 base（field 的角色）
 *  - `borrow`  从来没有自有件，但有 base（guest.founder 的角色）
 */
function makeIndex(): PartLibraryIndex {
  const parts: PartMeta[] = [];
  for (const s of SLOTS) parts.push(part(`${s}.donor.a`, s, 'donor'));
  parts.push(part('spine.onepart.a', 'spine', 'onepart'));
  for (const s of SLOTS) parts.push(part(`${s}.holey.a`, s, 'holey'));
  return {
    version: 1,
    units: 'meters',
    convention: { axis: '+Y', socketA: [0, 0, 0], socketB: [0, 1, 0], length: 1 },
    themes: [
      { id: 'donor', kind: 'archetype', name: 'donor', nameEn: 'donor', tagline: '', palette: [], source: 'rodin', axes: { humanLike: 0.5, lifeLike: 0.5 }, coverage: 'full' },
      { id: 'onepart', base: 'donor', kind: 'archetype', name: 'onepart', nameEn: 'onepart', tagline: '', palette: [], source: 'rodin', axes: { humanLike: 0.5, lifeLike: 0.5 }, coverage: 'light' },
      { id: 'holey', base: 'donor', kind: 'archetype', name: 'holey', nameEn: 'holey', tagline: '', palette: [], source: 'rodin', axes: { humanLike: 0.5, lifeLike: 0.5 }, coverage: 'light' },
      { id: 'empty', kind: 'archetype', name: 'empty', nameEn: 'empty', tagline: '', palette: [], source: 'rodin', axes: { humanLike: 0.5, lifeLike: 0.5 }, coverage: 'light' },
      { id: 'borrow', base: 'donor', kind: 'guest', name: 'borrow', nameEn: 'borrow', tagline: '', palette: [], source: 'rodin', axes: { humanLike: 0.5, lifeLike: 0.5 }, coverage: 'light' },
    ],
    materials: [{ id: 'm.a', tier: 0, baseColor: [0.5, 0.5, 0.5], roughness: 1, metalness: 0 }],
    parts,
  };
}

const REJECTED = new Set(['spine.onepart.a', 'head.holey.a']);
const idsOf = (g: ReturnType<typeof makeGenome>) => Object.values(g.slots).map((s) => s.partId);

// ── 1. 排除真的发生（穷举，不靠运气）──────────────────────────────────────
test('reject 的 id 不出现在任何 genome 的任何槽位上', () => {
  const index = makeIndex();
  const themes = [...new Set(index.parts.map((p) => p.family)), 'empty', 'borrow', undefined];
  for (const tier of TIERS) for (const theme of themes) for (let seed = 0; seed < SEEDS; seed++) {
    const g = makeGenome(seed, tier, index, { theme, rejected: REJECTED });
    for (const id of idsOf(g)) assert.ok(!REJECTED.has(id), `seed=${seed} tier=${tier} theme=${theme} 抽到了 ${id}`);
  }
});

test('不传 rejected 时那些件仍然抽得到 —— 证明上一条不是因为它们本来就抽不到', () => {
  const index = makeIndex();
  let hit = 0;
  for (const tier of TIERS) for (let seed = 0; seed < SEEDS; seed++) {
    for (const id of idsOf(makeGenome(seed, tier, index, { theme: 'holey' }))) if (REJECTED.has(id)) hit++;
  }
  assert.ok(hit > 0, 'reject 的件在不过滤时一次都没被抽到，那第一条测试什么都没证明');
});

// ── 2. 没有物种因为策展消失 ────────────────────────────────────────────────
test('加不加 rejected，可选物种名单一模一样', () => {
  const index = makeIndex();
  for (const tier of TIERS) {
    const pick = (rejected?: ReadonlySet<string>) => {
      const s = new Set<string>();
      for (let seed = 0; seed < SEEDS; seed++) s.add(makeGenome(seed, tier, index, { rejected }).theme);
      return [...s].sort();
    };
    assert.deepEqual(pick(REJECTED), pick(undefined), `tier=${tier} 的物种名单被策展改变了`);
  }
});

test('themeIsUsable 不看策展 —— 它答的是「有没有自有件」，不是「这一件好不好」', () => {
  const index = makeIndex();
  // onepart 唯一那件被 reject 了，它仍然要留在名单里（dev 页 / 选择页靠这个过滤）
  assert.equal(themeIsUsable(index, 'onepart', 2), true);
  assert.equal(themeIsUsable(index, 'empty', 2), false);
  assert.equal(themeIsUsable(index, 'borrow', 2), false);
});

// ── 3. 显式 theme 被尊重，缺件沿 base 链借 ─────────────────────────────────
test('唯一自有件被 reject 的物种，显式指定时仍然是它自己，不会静默换种', () => {
  const index = makeIndex();
  for (const tier of TIERS) for (let seed = 0; seed < SEEDS; seed++) {
    const g = makeGenome(seed, tier, index, { theme: 'onepart', rejected: REJECTED });
    assert.equal(g.theme, 'onepart', `seed=${seed} tier=${tier} 被换成了 ${g.theme}`);
    // 它没有自有件可用了 → 每个槽位都从 base(donor) 借，而不是退回占位几何
    for (const id of idsOf(g)) assert.ok(!id.startsWith(PLACEHOLDER_PREFIX), `${id} 退回了占位几何`);
  }
});

test('自有件只少一件的物种，那一件换成 base 的，其余自有件照旧', () => {
  const index = makeIndex();
  const g = makeGenome(7, 2, index, { theme: 'holey', rejected: REJECTED });
  assert.equal(g.theme, 'holey');
  assert.equal(g.slots.head.partId, 'head.donor.a');       // 被 reject 的槽位沿 base 链借
  assert.equal(g.slots.spine.partId, 'spine.holey.a');     // 没被 reject 的自有件不受影响
});

// ── 4. 空位条目行为不变 ───────────────────────────────────────────────────
/**
 * 空位条目（自有件为 0）今天就是「落回按 seed 抽一个物种」，这次改动不碰这条路。
 *
 * 断言的是**落到哪个物种不变**，而不是整个 genome 逐字节相同：落到的那个物种
 * 如果自有件里有被 reject 的，那一件当然会换掉 —— 那正是这次要修的东西，
 * 要求它"完全一致"等于要求 bug 继续存在。
 */
test('从来没有自有件的空位条目，落回的物种不受策展影响', () => {
  const index = makeIndex();
  for (const theme of ['empty', 'borrow']) for (const tier of TIERS) for (let seed = 0; seed < SEEDS; seed++) {
    const withCuration = makeGenome(seed, tier, index, { theme, rejected: REJECTED });
    const without = makeGenome(seed, tier, index, { theme, rejected: new Set() });
    assert.equal(withCuration.theme, without.theme, `theme=${theme} seed=${seed} tier=${tier}`);
    assert.deepEqual(withCuration.materials, without.materials, `theme=${theme} seed=${seed} tier=${tier}`);
  }
});

// ── 5. 真索引上的同一组命题（有资产时才跑；ADR-4：没有资产也要能开发）────────
const PARTS = resolve(import.meta.dirname, '../../../assets/parts');
const hasAssets = existsSync(resolve(PARTS, 'parts.json')) && existsSync(resolve(PARTS, 'curation.json'));

test('真 parts.json × 真 curation.json：reject 的件不出现，且没有物种消失', { skip: !hasAssets }, () => {
  const index: PartLibraryIndex = JSON.parse(readFileSync(resolve(PARTS, 'parts.json'), 'utf8'));
  const cur: Record<string, { verdict?: string }> = JSON.parse(readFileSync(resolve(PARTS, 'curation.json'), 'utf8'));
  const rejected = new Set(Object.entries(cur).filter(([, e]) => e.verdict === 'reject').map(([id]) => id));
  assert.ok(rejected.size > 0, 'curation.json 里一条 reject 都没有，这条测试什么都没测');

  const themes = index.themes.map((t) => t.id);
  for (const tier of TIERS) {
    for (const theme of [...themes, undefined]) for (let seed = 0; seed < 60; seed++) {
      const g = makeGenome(seed, tier, index, { theme, rejected });
      for (const id of idsOf(g)) assert.ok(!rejected.has(id), `seed=${seed} tier=${tier} theme=${theme} 抽到了 ${id}`);
    }
    // 名单不变：这就是「除了 wheelleg 还有没有别的条目会消失」的可执行答案 —— 一个都没有
    const names = (r?: ReadonlySet<string>) => themes.filter((t) => themeIsUsable(index, t, tier)).join(',') + '|'
      + [...new Set(Array.from({ length: 200 }, (_, s) => makeGenome(s, tier, index, { rejected: r }).theme))].sort().join(',');
    assert.equal(names(rejected), names(undefined), `tier=${tier} 的物种名单被策展改变了`);
  }
});

test('真索引：wheelleg 显式指定时仍然是 wheelleg，且不含被 reject 的 spine', { skip: !hasAssets }, () => {
  const index: PartLibraryIndex = JSON.parse(readFileSync(resolve(PARTS, 'parts.json'), 'utf8'));
  if (!index.themes.some((t) => t.id === 'wheelleg')) return;
  const rejected = new Set(['spine.wheelleg.a']);
  for (const tier of TIERS) for (let seed = 0; seed < 200; seed++) {
    const g = makeGenome(seed, tier, index, { theme: 'wheelleg', rejected });
    assert.equal(g.theme, 'wheelleg', `seed=${seed} tier=${tier} 被换成了 ${g.theme}`);
    assert.notEqual(g.slots.spine.partId, 'spine.wheelleg.a');
    assert.ok(!g.slots.spine.partId.startsWith(PLACEHOLDER_PREFIX), '躯干退回了占位几何');
  }
  // 槽位齐全这条不变式顺手一起钉住
  assert.equal(Object.keys(makeGenome(1, 2, index, { theme: 'wheelleg', rejected }).slots).length, ALL_BONE_IDS.length + 1);
});
