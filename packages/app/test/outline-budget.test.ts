/**
 * 描边把 draw call **翻倍**。这条测试守的就是那一倍。
 *
 * 实测：每一个物种都是 18 桶 → 36 draw，而 `BUDGET.maxDrawCalls` 是 40。
 * 也就是说余量只剩 4 次提交 —— 一个多两个桶的物种就越预算，
 * 而越预算的症状是"现场好像有点卡"，没有任何一处会说出来。
 * 所以这条测试是那句话的替身：**先在这里红，不在现场红。**
 *
 * **2026-09-13 起它测全部物种，不再只测已声明描边的那几个。**
 * 描边翻成了默认（`creature/shading.ts` 的 `DEFAULT_SHADING`），
 * 于是"哪些物种要付这笔钱"的答案从"名单里那几个"变成了"除例外之外全部"。
 * 原来那条只遍历名单的写法在翻默认之后会**照样绿**，而现场会一次性多出
 * 二十几个物种的 draw —— 也就是说它会在最需要它的那一次失灵。
 * 现在它按 `resolveShading()` 的真实答案遍历 `parts.json` 里的每一个物种。
 *
 * 桶的规则（部件 × 左右 × 材质）是**照着 `creature.ts` 重写一遍的，不是 import 的**。
 * 和 `ground.test.ts` 同一个理由：复用被测代码去验证它自己，改坏了两边一起变绿。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assemble } from '../src/creature/assemble.ts';
import { DEFAULT_SHADING, resolveShading, SHADING_OF_THEME } from '../src/creature/shading.ts';
import { REFERENCE_POSE } from '../src/stage/framing.ts';
import { remapSkeleton } from '../../core/src/bodyplan.ts';
import { makeGenome } from '../../core/src/genome.ts';
import { IS_LEFT } from '../../core/src/slots.ts';
import { BUDGET } from '../../core/src/tuning.ts';
import type { PartLibraryIndex, PartMeta, Tier } from '../../core/src/types.ts';

const PARTS = fileURLToPath(new URL('../../../assets/parts/parts.json', import.meta.url));

let index: PartLibraryIndex | null = null;
try {
  index = JSON.parse(readFileSync(PARTS, 'utf8')) as PartLibraryIndex;
} catch {
  index = null;          // parts.json 可以不存在（ADR-4）—— 那就跳过，不是失败
}

/** `assemble()` 只要"按 id 查 meta"这一件事 */
function metaSource(idx: PartLibraryIndex) {
  const byId = new Map(idx.parts.map((p) => [p.id, p]));
  return {
    metaOf(partId: string): PartMeta {
      const m = byId.get(partId);
      assert.ok(m, `parts.json 里没有 ${partId}`);
      return m;
    },
  };
}

/**
 * 这一具身体的桶数与面数 —— 也就是**不描边时**的 draw call 与三角数。
 * 描边把两个数都乘 2（`creature.ts` 那段分桶循环里，外壳的面和 draw 一起报）。
 */
function costOf(themeId: string, seed: number, tier: Tier): { buckets: number; tris: number } {
  const idx = index!;
  const def = idx.themes.find((t) => t.id === themeId);
  const genome = makeGenome(seed, tier, idx, { theme: themeId });
  const sk = remapSkeleton(REFERENCE_POSE, def?.bodyPlan ?? 'rig');
  const instances = assemble(
    genome,
    { ...REFERENCE_POSE, bones: sk.bones, joints: sk.joints },
    metaSource(idx),
    { maxInstances: BUDGET.maxInstances },
  );
  const buckets = new Set<string>();
  let tris = 0;
  for (const i of instances) {
    // 左右分桶：左侧用的是另一块（预镜像）几何。对称件才会分，`symmetry:'none'` 不分
    const meta = metaSource(idx).metaOf(i.partId);
    const mirrored = IS_LEFT[i.slotKey as keyof typeof IS_LEFT] === true
      && meta.symmetry === 'mirror';
    buckets.add(`${i.partId}|${mirrored ? 'm' : ''}|${i.materialRole}`);
    // 面数按**实例**算，不按桶算：一个桶里有几件就画几件
    tris += (meta as { triCount?: number }).triCount ?? 0;
  }
  return { buckets: buckets.size, tris };
}

/** 真正会被描边的物种 —— 问 `resolveShading()`，不要照着那张表自己推一遍 */
const toonThemes = (index?.themes ?? [])
  .map((t) => t.id)
  .filter((id) => resolveShading(id) === 'toon');

test('描边物种的 draw call 不越 BUDGET', { skip: !index }, () => {
  assert.ok(toonThemes.length, '一个描边物种都没有的话这条测试就没有守住任何东西');
  for (const themeId of toonThemes) {
    // 多跑几个 seed 与 tier：桶数随抽中的件变，只测一个组合等于只测了一次运气
    for (const tier of [1, 2, 3] as Tier[]) {
      for (const seed of [1, 12345, 99, 2026]) {
        const { buckets } = costOf(themeId, seed, tier);
        const draws = buckets * 2;          // 填充一次 + 外壳一次，见 creature.ts
        assert.ok(
          draws <= BUDGET.maxDrawCalls,
          `${themeId} seed=${seed} tier=${tier}：${buckets} 桶 → ${draws} draw，`
          + `超过 BUDGET.maxDrawCalls=${BUDGET.maxDrawCalls}。`
          + '描边物种的预算是不描边时的一半，不能按普通物种的余量想。',
        );
      }
    }
  }
});

/**
 * **描边同样把三角数翻倍，而那一项的余量比 draw call 还小。**
 *
 * 这一条是翻默认时补上的。原来只守 draw call 是够的 —— 名单上只有一个物种，
 * 而它恰好不是面数最大的那个。铺开到 29 个之后最贵的是 `char.dumpling`：
 * tier 3 下 116,258 面 → 描边后 **232,516**，而 `BUDGET.maxTriangles` 是 250,000。
 * 余量 7%，比 draw call 那一项的 10% 更紧 —— 也就是说**先顶到天花板的会是面数**。
 * 只守 draw call 的话，第一个越界的物种会安安静静地绿着过去。
 */
test('描边物种的三角数不越 BUDGET', { skip: !index }, () => {
  for (const themeId of toonThemes) {
    for (const tier of [1, 2, 3] as Tier[]) {
      for (const seed of [1, 12345, 99, 2026]) {
        const { tris } = costOf(themeId, seed, tier);
        const drawn = tris * 2;             // 填充一遍 + 外壳一遍，同一份几何
        assert.ok(
          drawn <= BUDGET.maxTriangles,
          `${themeId} seed=${seed} tier=${tier}：${tris} 面 → 描边后 ${drawn}，`
          + `超过 BUDGET.maxTriangles=${BUDGET.maxTriangles}。`
          + '这一项的余量比 draw call 小，先越界的通常是它。',
        );
      }
    }
  }
});

/**
 * 反过来也要守：**上面那条真的覆盖了每一个物种。**
 *
 * 这一条原来测的是"名单里只有 `char.line`"。默认翻过来之后那个断言就反了 ——
 * 但它守的那件事没变，只是换了形状：上一条的遍历范围必须等于**所有会被描边的
 * 物种**，不能因为有人给例外表加了一行、或者给 `resolveShading()` 加了一条分支，
 * 就悄悄有物种不被量到。所以这里直接对账：全部物种 = 描边的 + 例外的。
 */
test('每一个物种都被上面那条量到了，没有谁漏在预算之外', { skip: !index }, () => {
  const all = index!.themes.map((t) => t.id);
  const physical = all.filter((id) => resolveShading(id) === 'physical');
  assert.equal(
    toonThemes.length + physical.length, all.length,
    'resolveShading() 给出了第三种答案 —— 那一类没有人在量它的 draw',
  );
  // 走 physical 的只能是例外表点名过的。否则就是默认被人翻回去了，
  // 而那会让上面那条测试**照样绿**（它只遍历描边的那些）——
  // 正是这一条存在的理由。
  for (const id of physical) {
    assert.equal(
      SHADING_OF_THEME[id], 'physical',
      `${id} 不描边，但例外表里没有它 —— 是不是 DEFAULT_SHADING 被翻回 physical 了？`,
    );
  }
  assert.equal(DEFAULT_SHADING, 'toon', '默认一旦翻回去，这一批物种的描边就全没了');
});
