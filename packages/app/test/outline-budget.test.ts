/**
 * 描边把 draw call **翻倍**。这条测试守的就是那一倍。
 *
 * 实测（`char.line`，tier 2）：18 draw → 36 draw，而 `BUDGET.maxDrawCalls` 是 40。
 * 也就是说余量只剩 4 次提交 —— 下一个声明 `toon` 的物种只要多两个桶就越预算，
 * 而越预算的症状是"现场好像有点卡"，没有任何一处会说出来。
 * 所以这条测试是那句话的替身：**加一个描边物种时，先在这里红，不在现场红。**
 *
 * 桶的规则（部件 × 左右 × 材质）是**照着 `creature.ts` 重写一遍的，不是 import 的**。
 * 和 `ground.test.ts` 同一个理由：复用被测代码去验证它自己，改坏了两边一起变绿。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assemble } from '../src/creature/assemble.ts';
import { SHADING_OF_THEME } from '../src/creature/shading.ts';
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

/** 这一具身体会被分成多少个 InstancedMesh 桶 —— 也就是**不描边时**的 draw call */
function bucketCount(themeId: string, seed: number, tier: Tier): number {
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
  for (const i of instances) {
    // 左右分桶：左侧用的是另一块（预镜像）几何。对称件才会分，`symmetry:'none'` 不分
    const mirrored = IS_LEFT[i.slotKey as keyof typeof IS_LEFT] === true
      && metaSource(idx).metaOf(i.partId).symmetry === 'mirror';
    buckets.add(`${i.partId}|${mirrored ? 'm' : ''}|${i.materialRole}`);
  }
  return buckets.size;
}

const toonThemes = Object.entries(SHADING_OF_THEME)
  .filter(([, s]) => s === 'toon')
  .map(([id]) => id);

test('描边物种的 draw call 不越 BUDGET', { skip: !index }, () => {
  assert.ok(toonThemes.length, '一个描边物种都没有的话这条测试就没有守住任何东西');
  for (const themeId of toonThemes) {
    // 多跑几个 seed 与 tier：桶数随抽中的件变，只测一个组合等于只测了一次运气
    for (const tier of [1, 2, 3] as Tier[]) {
      for (const seed of [1, 12345, 99, 2026]) {
        const buckets = bucketCount(themeId, seed, tier);
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
 * 反过来也要守：**不描边的物种一个额外 draw 都不该多。**
 * 这条测的不是预算，是"别人没被碰到"—— 描边一旦悄悄变成默认，
 * 上面那条会照样绿，而现场会一次性多出二十几个物种的 draw。
 */
test('没有声明描边的物种不会被算成描边', { skip: !index }, () => {
  for (const t of index!.themes) {
    if (SHADING_OF_THEME[t.id]) continue;
    assert.equal(SHADING_OF_THEME[t.id], undefined, `${t.id} 不该在描边名单里`);
  }
  assert.deepEqual(toonThemes, ['char.line']);
});
