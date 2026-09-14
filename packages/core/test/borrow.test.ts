/**
 * 借件（`core/src/borrow.ts` + `docs/44-THESEUS.md` §4）。
 *
 * §10 第 6 条「借件距离单调不减」原来只钉在 HUD 上那个**数**上（`theseus.test.ts`）。
 * 数对了、换上去的件不对，观众看到的仍然是"晚期借回了自己的件"——
 * 所以这里钉的是**真正被选中的那一件从哪一圈来**。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { borrowMix, borrowPart, borrowPools, borrowReach, type BorrowRing } from '../src/borrow.ts';
import { makeGenome } from '../src/genome.ts';
import { THESEUS } from '../src/tuning.ts';
import type { Genome, PartLibraryIndex, PartMeta, Slot, ThemeDef } from '../src/types.ts';

const SLOTS: Slot[] = ['head', 'neck', 'spine', 'clavicle', 'upperArm', 'foreArm', 'hand', 'thigh', 'shin', 'foot', 'joint'];

function part(id: string, slot: Slot, family: string, tier = 1): PartMeta {
  return {
    id, slot, family, tier: tier as PartMeta['tier'], file: `${id}.glb`, localGirth: 0.3, triCount: 100,
    aabb: { min: [-0.15, 0, -0.15], max: [0.15, 1, 0.15] }, symmetry: 'mirror',
  };
}
function theme(id: string, kind: ThemeDef['kind'], base?: string): ThemeDef {
  return {
    id, kind, base, name: id, nameEn: id, tagline: '', palette: [], source: 'rodin',
    axes: { humanLike: 0.5, lifeLike: 0.5 }, coverage: 'full',
  };
}

/**
 * 一个每一圈都有货的小索引：
 *   own(archetype) ← child(archetype, base=own) 是被借的那一个物种
 *   cousin(archetype) 同 kind、不在链上
 *   char(character)  别的 kind
 *   withheld         有件、但**条目表里没有**（clearance 挡掉的那一类）
 */
function fixture(): PartLibraryIndex {
  const parts: PartMeta[] = [];
  for (const s of SLOTS) {
    for (const fam of ['child', 'own', 'cousin', 'char', 'withheld']) {
      parts.push(part(`${s}.${fam}.a`, s, fam));
      parts.push(part(`${s}.${fam}.b`, s, fam));
    }
    parts.push(part(`${s}.cousin.rejected`, s, 'cousin'));
  }
  return {
    version: 1, units: 'meters',
    convention: { axis: '+Y', socketA: [0, 0, 0], socketB: [0, 1, 0], length: 1 },
    themes: [theme('own', 'archetype'), theme('child', 'archetype', 'own'), theme('cousin', 'archetype'), theme('char', 'character')],
    materials: [], parts,
  };
}
const REJECTED = new Set(SLOTS.map((s) => `${s}.cousin.rejected`));
const genomeOf = (idx: PartLibraryIndex): Genome => makeGenome(1, 1, idx, { theme: 'child', rejected: REJECTED });

test('borrow: 圈的划分 —— 本物种 / base 链 / 同 kind / 别的 kind 各在自己那一圈', () => {
  const idx = fixture();
  const g = genomeOf(idx);
  const pools = borrowPools({ slot: 'thighL', genome: g, tier: 1, index: idx, rejected: REJECTED });
  const fams = pools.map((p) => [...new Set(p.map((m) => m.family))].sort());
  assert.deepEqual(fams, [['child'], ['own'], ['cousin'], ['char'], []]);
  assert.ok(!pools[0].some((m) => m.id === g.slots.thighL.partId), 'd0 里不许有这一格现在那一件');
});

// ── 确定性（P1）──────────────────────────────────────────────────────────────
test('borrow: 同一个种子 → 同一件；换种子 → 会借到不同的件', () => {
  const idx = fixture();
  const g = genomeOf(idx);
  const seen = new Set<string>();
  for (let seed = 0; seed < 64; seed++) {
    for (const overall of [0.05, 0.3, 0.55, 0.8, 1]) {
      const req = { slot: 'foreArmR' as const, genome: g, tier: 1 as const, index: idx, rejected: REJECTED, overall, seed };
      const a = borrowPart(req);
      const b = borrowPart({ ...req, genome: structuredClone(g), index: structuredClone(idx) });
      assert.deepEqual(a, b, `seed=${seed} overall=${overall} 两次借到的不一样 —— 有一处随机不是从种子来的`);
      if (a) seen.add(a.pick.partId);
    }
  }
  assert.ok(seen.size >= 5, `64 个种子只借到 ${seen.size} 种件 —— 种子没有真的进到抽签里`);
});

// ── 策展与 clearance ─────────────────────────────────────────────────────────
test('borrow: 策展否掉的件、条目表之外的家族，一件都不借', () => {
  const idx = fixture();
  const g = genomeOf(idx);
  for (let seed = 0; seed < 400; seed++) {
    for (const slot of ['head', 'spine', 'handL', 'joint'] as const) {
      const c = borrowPart({ slot, genome: g, tier: 1, index: idx, rejected: REJECTED, overall: (seed % 11) / 10, seed });
      assert.ok(c, `seed=${seed} ${slot} 借不到 —— 这个索引每一圈都有货`);
      assert.ok(!REJECTED.has(c.pick.partId), `借到了策展否掉的 ${c.pick.partId}`);
      assert.notEqual(c.meta.family, 'withheld', `借到了条目表之外的 ${c.pick.partId}（clearance 挡掉的家族）`);
    }
  }
});

// ── girth 区间（docs/26 §H）──────────────────────────────────────────────────
test('borrow: girth 越界的件只留给自己的物种，不借给别人', () => {
  const idx = fixture();
  // 每个 spine 件 girth 0.3；给 cousin 和 own 各塞一件 0.6（中位数的 2×，越界）
  idx.parts.push({ ...part('spine.cousin.fat', 'spine', 'cousin'), localGirth: 0.6 });
  idx.parts.push({ ...part('spine.child.fat', 'spine', 'child'), localGirth: 0.6 });
  const g = genomeOf(idx);
  const pools = borrowPools({ slot: 'spine', genome: g, tier: 1, index: idx, rejected: REJECTED });
  assert.ok(pools[0].some((p) => p.id === 'spine.child.fat'), '越界件被从它自己物种的 d0 里拿掉了 —— 这是借件规矩，不是策展');
  for (let d = 1; d <= 4; d++) {
    assert.ok(!pools[d].some((p) => p.id === 'spine.cousin.fat'), `越界件 spine.cousin.fat 出现在 d${d} 里`);
  }
  const fatGrown = [{ ...part('slow.visitor.spine', 'spine', 'slow'), localGirth: 0.6 }];
  const withGrown = borrowPools({ slot: 'spine', genome: g, tier: 1, index: idx, grown: fatGrown });
  assert.equal(withGrown[4].length, 0, '越界的慢回路件照样被借了');
});

// ── d4 到货才用，没到货退回 d3 ────────────────────────────────────────────────
test('borrow: d4 没到货就并进 d3 —— 不等、不卡、不报错', () => {
  const idx = fixture();
  const g = genomeOf(idx);
  const late = borrowMix(1, false);
  assert.equal(late[4], 0, 'd4 没到货，权重却还留在 d4 上');
  assert.ok(Math.abs(late[3] - 1) < 1e-9, `d4 那一份没并进 d3：${late}`);
  for (let seed = 0; seed < 200; seed++) {
    const c = borrowPart({ slot: 'spine', genome: g, tier: 1, index: idx, rejected: REJECTED, overall: 1, seed, grown: [] });
    assert.ok(c, `seed=${seed} 走到头、慢回路没到货时这一件不发生了 —— 应当退回 d3`);
    assert.equal(c.ring, 3);
  }
  // 到货了但**是别的槽位的**：对这一格来说仍然是没到货
  const grownHead = [part('slow.visitor.head', 'head', 'slow')];
  const c = borrowPart({ slot: 'spine', genome: g, tier: 1, index: idx, overall: 1, seed: 3, grown: grownHead });
  assert.equal(c?.ring, 3);
});

test('borrow: d4 到货了，走到头就会借到它 —— 而且它照样认策展', () => {
  const idx = fixture();
  const g = genomeOf(idx);
  const grown = [part('slow.visitor.spine', 'spine', 'slow')];
  let d4 = 0;
  for (let seed = 0; seed < 200; seed++) {
    const c = borrowPart({ slot: 'spine', genome: g, tier: 1, index: idx, overall: 1, seed, grown });
    if (c?.ring === 4) { d4++; assert.equal(c.pick.partId, 'slow.visitor.spine'); }
  }
  assert.ok(d4 > 150, `overall=1 时 d4 只出现 ${d4}/200 次`);
  const vetoed = borrowPart({
    slot: 'spine', genome: g, tier: 1, index: idx, overall: 1, seed: 1, grown,
    rejected: new Set(['slow.visitor.spine']),
  });
  assert.notEqual(vetoed?.pick.partId, 'slow.visitor.spine', '策展否掉的慢回路件还是被借了');
});

// ── §10 第 6 条的"件"版本 ────────────────────────────────────────────────────
test('borrow: 真正借到的那一圈不会往回退 —— 晚期不借回自己的件', () => {
  const idx = fixture();
  const g = genomeOf(idx);
  const curve = THESEUS.borrowCurve;
  const bands = [0, curve[0], curve[1], curve[2], curve[3], 1.0001];
  const means: number[] = [];
  for (let b = 0; b + 1 < bands.length; b++) {
    let sum = 0;
    let n = 0;
    for (let seed = 0; seed < 300; seed++) {
      const overall = bands[b] + ((seed + 0.5) / 300) * (bands[b + 1] - bands[b]);
      const c = borrowPart({ slot: 'thighR', genome: g, tier: 1, index: idx, rejected: REJECTED, overall: Math.min(1, overall), seed });
      assert.ok(c);
      // 抽签只在相邻两圈之间混：比"已经伸到的那一圈"再往里一圈都不许
      assert.ok(c.ring >= Math.floor(borrowReach(overall)),
        `overall=${overall.toFixed(3)} 借到了 d${c.ring}，而这一刻已经伸到 d${Math.floor(borrowReach(overall))}`);
      if (overall >= curve[1]) assert.notEqual(c.ring, 0, `overall=${overall.toFixed(3)} 借回了自己的件`);
      sum += c.ring;
      n++;
    }
    means.push(sum / n);
  }
  for (let i = 1; i < means.length; i++) {
    assert.ok(means[i] >= means[i - 1], `借件距离的均值往回走了：${means.map((m) => m.toFixed(2)).join(' → ')}`);
  }
  assert.ok(means[0] < 0.5, `开场那一段均值 ${means[0].toFixed(2)} —— 早期应当几乎总是 d0`);
  assert.ok(means[means.length - 1] > 2.9, `末段均值 ${means.at(-1)!.toFixed(2)} —— 晚期应当几乎总是 d3`);
});

test('borrow: 自己那一圈空了往外退；外面全空才往里退，而且不退回 d0', () => {
  const idx = fixture();
  // 把 char（d3）整个拿掉：晚期抽中 d3 的那一件只能往里退到 d2，不能退到 d0
  idx.parts = idx.parts.filter((p) => p.family !== 'char');
  const g = genomeOf(idx);
  for (let seed = 0; seed < 100; seed++) {
    const c = borrowPart({ slot: 'spine', genome: g, tier: 1, index: idx, rejected: REJECTED, overall: 1, seed });
    assert.ok(c);
    assert.ok((c.ring as BorrowRing) >= 1, `d3 空了，退到了 d${c.ring}`);
  }
  // 只剩自己的件：晚期宁可不发生，也不借回自己的
  const own = fixture();
  own.parts = own.parts.filter((p) => p.family === 'child');
  const g2 = genomeOf(own);
  assert.equal(borrowPart({ slot: 'spine', genome: g2, tier: 1, index: own, overall: 1, seed: 5 }), null);
});
