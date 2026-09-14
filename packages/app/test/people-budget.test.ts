/**
 * 台上 N 具身体不越 `BUDGET`（docs/50 §5）。接着 `outline-budget.test.ts`（稳态一具）和
 * `swap-budget.test.ts`（交接那几帧一具）往下守：**两三具身体同时在场**。
 *
 * 三条：
 *  1. draw call：N 具共用同一组桶。这里照着 `creature.ts` 的分桶规则（部件 × 左右 × 材质）**重写一遍**，
 *     把 N 具身体的实例放进同一个集合里数桶 —— 必须和一具时一样多（差异色走 instanceColor，不开桶）。
 *  2. 面数：对 parts.json 里每一个刚体物种 × 忒修斯开 / 关 × 想要 1..hardMax 人，
 *     `planPeople` 给出的结论（几具、描边留不留）按规则**重新求和**，不越 250k。
 *  3. 忒修斯开着时两具一定放得下（借件门保证一具 ≤ 125k），并且伴随身体进场时描边一定让位 ——
 *     这是 docs/50 §5.3 写给作品负责人的那句结论，改了 tuning 让它不成立时这里先红。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assemble } from '../src/creature/assemble.ts';
import { resolveShading } from '../src/creature/shading.ts';
import { bodyFill, planPeople } from '../src/creature/people-budget.ts';
import { REFERENCE_POSE } from '../src/stage/framing.ts';
import { PLANS_WITHOUT_PARTS, remapSkeleton, type BodyPlanId } from '../../core/src/bodyplan.ts';
import { makeGenome } from '../../core/src/genome.ts';
import { IS_LEFT } from '../../core/src/slots.ts';
import { BUDGET, PEOPLE } from '../../core/src/tuning.ts';
import type { PartLibraryIndex, PartMeta, Skeleton, ThemeDef, Tier } from '../../core/src/types.ts';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
let index: PartLibraryIndex | null = null;
try { index = JSON.parse(read('../../../assets/parts/parts.json')) as PartLibraryIndex; } catch { index = null; }

const planOf = (t: ThemeDef): string => {
  const p = (t as { bodyPlan?: unknown }).bodyPlan;
  return p == null ? 'rig' : typeof p === 'string' ? p : ((p as { kind?: string }).kind ?? 'rig');
};
const partBuilt = (index?.themes ?? []).filter((t) => !PLANS_WITHOUT_PARTS.includes(planOf(t) as BodyPlanId));

/** 把一副骨架整体挪 dx 米（伴随身体的站位）。挪的是输入，不是矩阵：和 main.ts 喂给 creature 的是同一件事 */
function shifted(sk: Skeleton, dx: number): Skeleton {
  const joints: Record<string, [number, number, number]> = {};
  for (const [k, v] of Object.entries(sk.joints)) joints[k] = [v[0] + dx, v[1], v[2]];
  return {
    ...sk, joints,
    bones: sk.bones.map((b) => ({ ...b, p0: [b.p0[0] + dx, b.p0[1], b.p0[2]], p1: [b.p1[0] + dx, b.p1[1], b.p1[2]] })),
  };
}

test('N 具身体共用同一组桶：draw call 和一具时一样多', { skip: !index }, () => {
  const idx = index!;
  const byId = new Map(idx.parts.map((p) => [p.id, p]));
  const meta = { metaOf: (id: string) => byId.get(id) as PartMeta };
  for (const t of partBuilt.slice(0, 8)) {
    const g = makeGenome(7, 3 as Tier, idx, { theme: t.id });
    const base = remapSkeleton(REFERENCE_POSE, 'rig');
    const sk = { ...REFERENCE_POSE, bones: base.bones, joints: base.joints } as Skeleton;
    const bucketsOf = (bodies: number): number => {
      const keys = new Set<string>();
      for (let b = 0; b < bodies; b++) {
        for (const i of assemble(g, shifted(sk, b * PEOPLE.minGap), meta, { maxInstances: BUDGET.maxInstances })) {
          const m = byId.get(i.partId)!;
          const mirrored = IS_LEFT[i.slotKey as keyof typeof IS_LEFT] === true && m.symmetry === 'mirror';
          // 桶键里没有"第几具身体"—— 那正是共用桶的全部意思
          keys.add(`${i.partId}|${mirrored ? 'm' : ''}|${i.materialRole}`);
        }
      }
      return keys.size;
    };
    const one = bucketsOf(1);
    for (let n = 2; n <= PEOPLE.hardMax; n++) assert.equal(bucketsOf(n), one, `${t.id}：${n} 具身体开了新桶`);
  }
});

test('每一个刚体物种 × 忒修斯开 / 关 × 想要 1..hardMax 人：planPeople 的结论不越面数预算', { skip: !index }, () => {
  assert.ok(partBuilt.length > 10, '物种表读空了，这条测试没有守住任何东西');
  for (const t of partBuilt) {
    const shading = resolveShading(t.id);
    for (const theseus of [true, false]) {
      const fill = bodyFill(index!, t.id, shading, theseus);
      for (let want = 1; want <= PEOPLE.hardMax; want++) {
        const p = planPeople(want, fill, shading);
        assert.ok(p.bodies >= 1 && p.bodies <= want, `${t.id} want=${want} → ${p.bodies} 具`);
        // 规则重写一遍：主身体（描边时两遍，除非有伴随身体时让位）+ 每具伴随身体一遍
        const primaryPasses = shading === 'toon' && (p.bodies === 1 || p.outlineWithCompanions) ? 2 : 1;
        const tris = fill * primaryPasses + (p.bodies - 1) * fill;
        assert.ok(tris <= BUDGET.maxTriangles,
          `${t.id} theseus=${theseus} want=${want}：${p.bodies} 具 × ${Math.round(fill)} 面`
          + `（描边${p.outlineWithCompanions ? '留' : '让位'}）= ${Math.round(tris)} > ${BUDGET.maxTriangles}`);
      }
    }
  }
});

test('忒修斯开着：两具一定放得下，伴随身体进场时描边一定让位；单人时描边照旧', { skip: !index }, () => {
  for (const t of partBuilt) {
    const shading = resolveShading(t.id);
    const fill = bodyFill(index!, t.id, shading, true);
    const two = planPeople(2, fill, shading);
    assert.equal(two.bodies, 2, `${t.id}：两个人只放得下 ${two.bodies} 具`);
    if (shading === 'toon') assert.equal(two.outlineWithCompanions, false, `${t.id}：两具时还留着描边 = 375k 面`);
    const one = planPeople(1, fill, shading);
    assert.equal(one.bodies, 1);
    assert.equal(one.outlineWithCompanions, shading === 'toon', '单人：描边照物种声明，一个字都不变');
  }
});

test('planPeople：坏输入不 throw，退回单人', () => {
  assert.equal(planPeople(Number.NaN, Number.NaN, 'toon').bodies, 1);
  assert.equal(planPeople(0, 1e9, 'physical').bodies, 1);
  assert.equal(planPeople(3, 1, 'physical').bodies, 3, '极轻的身体三具都放得下');
});
