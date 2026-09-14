/**
 * 第 I 乐章那一次替换**真的换掉了一件画在身上的零件**（docs/44 §2「第一次替换必须发生在 40 秒里」）。
 *
 * docs/44 §10.5 第 10 条记过：第 I 乐章的档位是 0，台上是开场那一团（`creature/nascent.ts`），
 * `creature.genome` 还是 null —— 排期器照样发件、HUD 照样 1/18，`swapOneSlot` 拿到 null，
 * 这一件不发生。于是大多数人待的那 40 秒里，忒修斯之船一次都没有被看见。
 *
 * 这里照着 `main.ts` 的帧路径走一遍（真 `parts.json` + 真 `curation.json`）：
 * 档位下限取 `step.tier`（改之前是 `arc.tier`），档位 ≥ 1 才有刚体 genome，
 * 第一件发件那一帧用同一个 `swapOneSlot` 去借 —— 必须借到、必须换的是另一件。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { swapOneSlot } from '../src/creature/theseus-wire.ts';
import { PLANS_WITHOUT_PARTS, type BodyPlanId } from '../../core/src/bodyplan.ts';
import { makeGenome } from '../../core/src/genome.ts';
import { createTheseus, type TheseusState } from '../../core/src/theseus.ts';
import { createArc } from '../../core/src/arc.ts';
import { PLACEHOLDER_PREFIX } from '../../core/src/genome.ts';
import type { Genome, PartLibraryIndex, ThemeDef, Tier } from '../../core/src/types.ts';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
let index: PartLibraryIndex | null = null;
let rejected = new Set<string>();
try {
  index = JSON.parse(read('../../../assets/parts/parts.json')) as PartLibraryIndex;
  const cur = JSON.parse(read('../../../assets/parts/curation.json')) as Record<string, { verdict: string }>;
  rejected = new Set(Object.entries(cur).filter(([, v]) => v.verdict === 'reject').map(([k]) => k));
} catch { index = null; }

const planOf = (t: ThemeDef): string => {
  const p = (t as { bodyPlan?: unknown }).bodyPlan;
  return p == null ? 'rig' : typeof p === 'string' ? p : ((p as { kind?: string }).kind ?? 'rig');
};

test('第一次替换换掉的是画在身上的一件 —— 每个刚体物种、每一场', { skip: !index }, () => {
  const rigid = index!.themes.filter((t) => !PLANS_WITHOUT_PARTS.includes(planOf(t) as BodyPlanId));
  assert.ok(rigid.length > 10, `只有 ${rigid.length} 个刚体物种`);
  const DT = 1 / 10;
  const missed: string[] = [];
  let sessions = 0;
  for (const t of rigid) {
    for (const seed of [1, 7, 99, 2024]) {
      const arc = createArc();
      const th = createTheseus({ seed });
      let genome: Genome | null = null;   // tier 0 = 开场团块，刚体还没成型（`main.ts` 的 `morph`）
      let tier = 0;
      for (let i = 0; i < Math.round(60 / DT); i++) {
        const a = arc.update(true, DT);
        const st = th.update({ elapsed: a.elapsed, present: true }, DT);
        const floor = (st as TheseusState & { tier?: Tier }).tier ?? a.tier;
        if (floor > tier) {
          tier = floor;
          genome = makeGenome(seed, tier as Tier, index!, { theme: t.id, rejected });
        }
        if (!st.fired) continue;
        sessions++;
        const next = swapOneSlot(genome, st.fired.slot, (seed ^ Math.imul(st.fired.index, 0x9e3779b9)) >>> 0, {
          tier: tier as Tier, index: index!, rejected, overall: a.overall,
        });
        const to = next?.slots[st.fired.slot]?.partId;
        if (!next || !to || to.startsWith(PLACEHOLDER_PREFIX)) {
          missed.push(`${t.id} seed=${seed}: 第一件 ${st.fired.slot} 在 ${a.elapsed.toFixed(1)}s，tier ${tier}，` +
            (genome ? '借不到' : '身体还是团块（genome = null）'));
        }
        break;
      }
    }
  }
  assert.equal(sessions, rigid.length * 4, '有的场次一分钟之内一件都没发 —— 下面那条什么都没证明');
  assert.equal(missed.length, 0, `第一次替换没有换掉任何看得见的件（${missed.length} / ${sessions}，前 5 条）：\n  ${missed.slice(0, 5).join('\n  ')}`);
});
