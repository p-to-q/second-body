/**
 * 分档跟着**忒修斯的排期**走，不跟着乐章序号走（docs/44 §6、§2；docs/40 §4）。
 *
 * 此前 `main.ts` 的档位下限是 `ArcState.tier`，也就是乐章序号：
 * 升档（整具 remorph）和 `stage.pulse` 恰好落在 39.6 / 84.6 / 135 秒那三条边上。
 * docs/44 §6 裁定四个乐章留名字、删边界 —— 一次全身换装加一下亮度脉冲，就是那条边本身。
 *
 * 第二件事是第 I 乐章那一次替换：档位下限是乐章序号，于是 20–40 秒整段都是 tier 0，
 * 台上站着的是开场那一团还没分化出零件的体（`creature/nascent.ts`）。
 * 替换照样发了、HUD 照样 1/18，但它换的是一具**没画出来**的刚体 —— 观众什么都看不见。
 *
 * 下面每一条都照着 `main.ts` 取档位下限的写法：`step.tier`（没有就是改之前那条 `arc.tier`）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createArc } from '../src/arc.ts';
import { createTheseus, movementOfEvent, type TheseusState } from '../src/theseus.ts';
import { ARC, NASCENT, THESEUS } from '../src/tuning.ts';
import type { Tier } from '../src/types.ts';

const DT = 1 / 60;
const knobs = THESEUS as typeof THESEUS & { tierLead?: number; edgeMargin?: number };
/** 升档离任何一条乐章边界至少这么远（秒） */
const MARGIN = knobs.edgeMargin ?? 2;
/** 开场那一团化开之后，至少隔这么久才碎第一件（秒） */
const LEAD = knobs.tierLead ?? 2;

interface Run {
  ups: { tier: number; at: number }[];
  fires: { at: number; index: number; tier: number }[];
  edges: number[];
  final: number;
}

function run(seed: number, opt: { rate?: number; overallEnergy?: number; seconds?: number } = {}): Run {
  const arc = createArc();
  const th = createTheseus({ seed, rate: opt.rate });
  const ups: Run['ups'] = [];
  const fires: Run['fires'] = [];
  let tier = 0;
  for (let i = 0; i < Math.round((opt.seconds ?? ARC.total) / DT); i++) {
    const a = arc.update(true, DT);
    const s = th.update({ elapsed: a.elapsed, present: true, overallEnergy: opt.overallEnergy ?? 0 }, DT);
    // `main.ts` 的档位下限（改之前是 `arcState.tier`）
    const floor = (s as TheseusState & { tier?: Tier }).tier ?? a.tier;
    if (floor > tier) { tier = floor; ups.push({ tier, at: a.elapsed }); }
    if (s.fired) fires.push({ at: s.fired.at, index: s.fired.index, tier });
  }
  return { ups, fires, edges: arc.bounds.slice(0, -1), final: tier };
}

const CASES = [
  { name: '站着不动', rate: 1, overallEnergy: 0 },
  { name: '一直在蹦', rate: 1, overallEnergy: 0.774 },
  { name: '?theseus=6', rate: 6, overallEnergy: 0 },
];

test('分档：升档不落在乐章边界上 —— 每一次都离三条边至少 edgeMargin 秒', () => {
  assert.ok(MARGIN >= 2, `edgeMargin ${MARGIN}s：一秒之内的"不在边上"耳朵和眼睛都分不出来`);
  for (const c of CASES) {
    for (let seed = 1; seed <= 60; seed++) {
      const r = run(seed, c);
      for (const up of r.ups) {
        const near = r.edges.map((b) => Math.abs(up.at - b));
        const d = Math.min(...near);
        assert.ok(d >= MARGIN - 1e-6,
          `${c.name} seed ${seed}: 升到 tier ${up.tier} 在 ${up.at.toFixed(2)}s，离乐章边界 ` +
          `${r.edges[near.indexOf(d)].toFixed(2)}s 只有 ${d.toFixed(2)}s`);
      }
    }
  }
});

test('分档：站着不动的人也走到 tier 3，一档一档地到 —— 时间仍然是主轴', () => {
  for (const c of CASES) {
    for (let seed = 1; seed <= 60; seed++) {
      const r = run(seed, c);
      assert.deepEqual(r.ups.map((u) => u.tier), [1, 2, 3], `${c.name} seed ${seed}: ${JSON.stringify(r.ups)}`);
    }
  }
});

test('分档：第一次替换落在一具已经长出零件的身体上 —— 不是开场那一团', () => {
  assert.ok(LEAD >= 3 * NASCENT.emerge, `tierLead ${LEAD}s 比团块化开（${NASCENT.emerge}s）长不了多少，零件还在往外顶`);
  for (const c of CASES) {
    for (let seed = 1; seed <= 200; seed++) {
      const r = run(seed, { ...c, seconds: 60 });
      const first = r.fires[0];
      assert.ok(first, `${c.name} seed ${seed}: 一分钟之内总该换过一件`);
      assert.ok(first.tier >= 1,
        `${c.name} seed ${seed}: 第一件在 ${first.at.toFixed(2)}s 碎开时档位还是 ${first.tier} —— 台上是团块，换的是一具没画出来的刚体`);
      const up = r.ups.find((u) => u.tier === 1)!;
      assert.ok(first.at - up.at >= LEAD - 1e-6,
        `${c.name} seed ${seed}: 团块在 ${up.at.toFixed(2)}s 化开，第一件 ${first.at.toFixed(2)}s 就碎了 —— 被开场那一下盖住`);
      // 开场那一团本身也是"那是我"的一部分：它不许比宽限更早化开
      assert.ok(up.at >= THESEUS.graceSeconds - 1e-6,
        `${c.name} seed ${seed}: 团块在 ${up.at.toFixed(2)}s 化开，早于 ${THESEUS.graceSeconds}s 的宽限`);
    }
  }
});

test('分档：升档和它那一段的第一件替换之间隔着 tierLead —— 全身换装不盖住那一件', () => {
  for (const c of CASES) {
    for (let seed = 1; seed <= 60; seed++) {
      const r = run(seed, c);
      for (const up of r.ups.filter((u) => u.tier >= 2)) {
        const anchor = r.fires.find((f) => movementOfEvent(f.index - 1) >= up.tier);
        assert.ok(anchor, `${c.name} seed ${seed}: tier ${up.tier} 那一段一件都没换`);
        assert.ok(anchor.at - up.at >= LEAD - 1e-6,
          `${c.name} seed ${seed}: tier ${up.tier} 在 ${up.at.toFixed(2)}s，它那一段第一件在 ${anchor.at.toFixed(2)}s`);
      }
    }
  }
});

test('分档：人一走档位归零 —— 下一个人从开场那一团开始', () => {
  const th = createTheseus({ seed: 5 });
  const arc = createArc();
  let s: TheseusState & { tier?: Tier } = th.state;
  for (let i = 0; i < Math.round(120 / DT); i++) {
    const a = arc.update(true, DT);
    s = th.update({ elapsed: a.elapsed, present: true }, DT);
  }
  assert.ok((s.tier ?? 0) >= 2, `两分钟之后档位是 ${s.tier}`);
  for (let i = 0; i < Math.round((ARC.resetAfter + 1) / DT); i++) {
    const a = arc.update(false, DT);
    s = th.update({ elapsed: a.elapsed, present: false }, DT);
  }
  assert.equal(s.tier, 0);
});
