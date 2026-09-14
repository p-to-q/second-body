/**
 * 忒修斯之船的排期器（`core/src/theseus.ts` + `docs/44-THESEUS.md`）。
 *
 * 这里钉的是 docs/44 §10 那张清单 —— **每一条都对着那一页的一句话**，
 * 不是对着实现。第 1 条尤其：它就是 §0 那句"到第三分钟一件都不剩"本身，
 * 而它只能这样跑（180 秒 × 200 个种子，几毫秒），所以整个模块才必须是纯的。
 *
 * 第 7 条（`?theseus=off` 之后行为逐字相同）住在
 * `packages/app/test/theseus-flag.test.ts`：那一条问的是**开关**，
 * 而开关在 app 那一侧。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  borrowDistance, buildSchedule, createTheseus, movementOfEvent, quietSlotKeys, scaleDrift,
  slotWeights, tierAnchors,
} from '../src/theseus.ts';
import type { TheseusMachine, TheseusReplacement } from '../src/theseus.ts';
import { ARC, FRAMING, MORPH, THESEUS } from '../src/tuning.ts';
import { ALL_SLOT_KEYS } from '../src/slots.ts';
import { createArc, movementBounds } from '../src/arc.ts';
import { mulberry32 } from '../src/rng.ts';

const DT = 1 / 60;

interface RunResult {
  fired: TheseusReplacement[];
  maxInFlight: number;
  borrow: number[];
  machine: TheseusMachine;
}

/**
 * 走完一场。**时间从弧线来**（`ArcState.elapsed`），不在测试里自己数秒 ——
 * 这样"人不在就停表"这件事不用在两个地方各写一遍。
 */
function session(seed: number, seconds = ARC.total, opt: {
  present?: boolean;
  energy?: Record<string, number> | null;
  /** 整具身体的运动量（`MotionFeatures.energy`）。不给 = 站着不动 */
  overallEnergy?: number;
  rate?: number;
} = {}): RunResult {
  const present = opt.present ?? true;
  const arc = createArc();
  const t = createTheseus({ seed, rate: opt.rate });
  const fired: TheseusReplacement[] = [];
  const borrow: number[] = [];
  let maxInFlight = 0;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const a = arc.update(present, DT);
    const s = t.update({
      elapsed: a.elapsed, present, energy: opt.energy ?? null, overallEnergy: opt.overallEnergy,
    }, DT);
    if (s.fired) fired.push(s.fired);
    if (s.inFlight > maxInFlight) maxInFlight = s.inFlight;
    borrow.push(s.borrowDistance);
  }
  return { fired, maxInFlight, borrow, machine: t };
}

// ── §10 第 1 条 ──────────────────────────────────────────────────────────────
test('theseus: 三分钟之后一件原件都不剩 —— 200 个种子，18 个槽位一个不漏', () => {
  let worst = ALL_SLOT_KEYS.length;
  const misses: number[] = [];
  for (let seed = 1; seed <= 200; seed++) {
    const { machine } = session(seed);
    const covered = ALL_SLOT_KEYS.filter((k) => machine.isReplaced(k)).length;
    if (covered < worst) worst = covered;
    if (covered < ALL_SLOT_KEYS.length) misses.push(seed);
  }
  // 这一句不是"大多数种子"，是 §0 那句话本身：没有哪一场观众该看到一件原件留下来
  assert.equal(worst, ALL_SLOT_KEYS.length,
    `最差的一场只换掉了 ${worst}/18 件；漏掉的种子：${misses.slice(0, 8).join(', ')}`);
});

test('theseus: 总数落在 26 件上下 —— §2 那张表的合计', () => {
  const want = THESEUS.perBeat.reduce((a, b) => a + b, 0);
  assert.equal(want, 26, 'tuning 里的 perBeat 合计变了，§2 那张表要跟着改');
  for (const seed of [1, 7, 99, 12345]) {
    assert.equal(session(seed).fired.length, want, `seed ${seed}`);
  }
});

// ── §10 第 2 条 ──────────────────────────────────────────────────────────────
test('theseus: 头二十秒一件都没换 —— §2 里最硬的那条线', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const first = session(seed, 60).fired[0];
    assert.ok(first, `seed ${seed}: 一分钟之内总该换过一件`);
    assert.ok(first.at >= THESEUS.graceSeconds,
      `seed ${seed}: 第一件落在 ${first.at.toFixed(2)}s，早于 ${THESEUS.graceSeconds}s 的宽限 —— ` +
      '在"那是我"立住之前动它，观众读到的是故障，不是离开');
  }
});

test('theseus: ?arc= 压短之后宽限也不许被挖穿', () => {
  // `?arc=60` 时第 I 段只有 13.2 秒，整段都落在 20 秒宽限里 ——
  // 窗口被压到段末，排出来的时刻会比宽限还早。宽限赢，这一条是在
  // 浏览器里跑 `?arc=60` 时发现的（HUD 上"宽限中"和第一件同时出现）。
  for (const total of [60, 30, 21]) {
    for (let seed = 1; seed <= 20; seed++) {
      for (const t of buildSchedule(mulberry32(seed), total)) {
        assert.ok(t >= THESEUS.graceSeconds,
          `?arc=${total} seed ${seed}: 排到了 ${t.toFixed(2)}s，早于 ${THESEUS.graceSeconds}s 的宽限`);
      }
    }
  }
});

test('theseus: 第一段优先动安静的槽位 —— 第一次替换要被余光看见，不被正眼看见', () => {
  const quiet = quietSlotKeys();
  // 锁骨 / 关节（含颈环）/ 脚 —— 身份住在头和手上，第一段不动它们
  assert.deepEqual([...quiet].sort(),
    ['clavicleL', 'clavicleR', 'footL', 'footR', 'joint', 'neck']);
  let quietFirst = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const first = session(seed, 60).fired[0];
    if (quiet.has(first.slot)) quietFirst++;
  }
  // 偏向，不是硬规则（§3："仍然是随机的，只是随机得有方向"）
  assert.ok(quietFirst >= 45,
    `60 场里只有 ${quietFirst} 场第一件落在安静槽位上 —— quietBias 没在起作用`);
});

// ── §10 第 3 条 ──────────────────────────────────────────────────────────────
test('theseus: 任何一秒最多三件在交接，两件之间不短于 minGap', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const { fired, maxInFlight, machine } = session(seed);
    // 先钉住"这个测试看得见全部" —— `fired` 一帧只报一件，如果机器某一帧连发了几件，
    // 下面两条断言就会集体瞎掉（这一条是在实测中补上的：拿掉 minGap 之后
    // 原来的写法照样全绿，因为多出来的那几件根本没被报告出来）
    assert.equal(fired.length, machine.state.events,
      `seed ${seed}: 报出来 ${fired.length} 件，机器自己数了 ${machine.state.events} 件 —— 一帧发了不止一件`);
    assert.ok(maxInFlight <= THESEUS.maxConcurrent,
      `seed ${seed}: 同时 ${maxInFlight} 件在交接 —— 这就是 docs/05 §3 说的"整个人炸开"`);
    for (let i = 1; i < fired.length; i++) {
      const gap = fired[i].at - fired[i - 1].at;
      assert.ok(gap >= THESEUS.minGap - 1e-6,
        `seed ${seed}: 第 ${i} 件和上一件只隔了 ${gap.toFixed(3)}s`);
      // 并发也从**时刻**上再算一遍，不只信机器自报的 inFlight：
      // 一个把自己的计数写错的机器，靠它自己的读数是验不出来的（P21）
      const overlap = fired.filter((f) => Math.abs(f.at - fired[i].at) < MORPH.crossfade).length;
      assert.ok(overlap <= THESEUS.maxConcurrent,
        `seed ${seed}: 第 ${i} 件前后 ${MORPH.crossfade}s 里挤了 ${overlap} 件`);
    }
  }
});

test('theseus: minGap 被现场调到比 crossfade 还短时，三件并发那道闸接得住', () => {
  // 默认参数下 `minGap`(1.2) = `MORPH.crossfade`(1.2)，于是画面上永远只有一件在交接，
  // `maxConcurrent` 那道闸**一次都不会响** —— 一道永远不响的闸是验不了的。
  // 所以这一条故意把 minGap 压到 0.2 秒，把它逼到会响的地方再看它响不响。
  const was = THESEUS.minGap;
  THESEUS.minGap = 0.05;
  try {
    // 再叠一个 `?theseus=10`：26 件压进十几秒，这时候不撞上限才是奇怪的
    for (let seed = 1; seed <= 20; seed++) {
      const { fired, maxInFlight, machine } = session(seed, ARC.total, { rate: 10 });
      assert.equal(fired.length, machine.state.events, `seed ${seed}: 一帧发了不止一件`);
      assert.ok(maxInFlight <= THESEUS.maxConcurrent,
        `seed ${seed}: 同时 ${maxInFlight} 件在交接 —— docs/05 §3 说的"整个人炸开"`);
      for (let i = 1; i < fired.length; i++) {
        assert.ok(fired[i].at - fired[i - 1].at >= THESEUS.minGap - 1e-6, `seed ${seed} 第 ${i} 件`);
      }
    }
  } finally { THESEUS.minGap = was; }
});

// ── §10 第 4 条 ──────────────────────────────────────────────────────────────
test('theseus: 站着不动的人也走完这条线 —— 一个运动量都不喂，照样 18/18', () => {
  for (const seed of [3, 17, 400]) {
    const { machine, fired } = session(seed, ARC.total, { energy: null });
    assert.equal(ALL_SLOT_KEYS.filter((k) => machine.isReplaced(k)).length, 18, `seed ${seed}`);
    assert.equal(fired.length, 26, `seed ${seed}`);
  }
});

test('theseus: 没有人的时候它不会自己动 —— 一件都不换', () => {
  // ⚠️ 这一条**不能**靠弧线喂时间：人不在时弧线本来就停表，`elapsed` 永远是 0，
  // 于是"没人不换"和"排期还没到"分不开，测试会在机器坏掉时照样全绿（实测过）。
  // 所以这里手动把秒数推上去 —— 时钟在走、人不在，正是那个 bug 的形状。
  const t = createTheseus({ seed: 9 });
  let events = 0;
  for (let i = 0; i < Math.round(ARC.total / DT); i++) {
    const s = t.update({ elapsed: i * DT, present: false }, DT);
    if (s.fired) events++;
  }
  assert.equal(events, 0, '没人在场却在换件 —— 那是一具自己在演的身体');
  assert.equal(t.state.replaced, 0);
  // 反面：同一个种子、同一条时间轴，人在场时它是会换的 ——
  // 否则上面那条断言可能只是"排期是空的"
  const live = createTheseus({ seed: 9 });
  let liveEvents = 0;
  for (let i = 0; i < Math.round(ARC.total / DT); i++) {
    if (live.update({ elapsed: i * DT, present: true }, DT).fired) liveEvents++;
  }
  assert.ok(liveEvents > 0);
});

test('theseus: 它拿走你正在用的那一部分 —— motionBias 的方向（§3）', () => {
  const lastAt: Record<string, number> = {};
  for (const k of ALL_SLOT_KEYS) lastAt[k] = 0;
  const ctx = { now: 100, lastAt, firstMovement: false, energy: { handR: 1 } };
  const w = slotWeights(ctx);
  const iR = ALL_SLOT_KEYS.indexOf('handR');
  const iL = ALL_SLOT_KEYS.indexOf('handL');
  // 挥右手，被拿走的就是右臂。反过来（"用得最少的被拿走"）是关于**萎缩**的隐喻，
  // 而这件作品说的不是衰退 —— 写反了它依然能跑，所以必须有这一条钉着它
  assert.ok(w[iR] > w[iL],
    `动得最多的 handR 权重 ${w[iR]} 不高于没动的 handL ${w[iL]} —— motionBias 的方向反了`);
  assert.ok(Math.abs(w[iR] / w[iL] - (1 + THESEUS.motionBiasGain)) < 1e-6);
});

// ── §3 的裁定：动作**也**改速率（`motionRateGain`）────────────────────────────
//
// 实测出来的 `MotionFeatures.energy`（合成骨架，1.7m，60fps）：
//   完全静止 0.000 · 轻微自然晃动 0.014 · 单手挥 1.5Hz 0.185 ·
//   整具左右摇摆 0.25m 0.286 · 双臂 2Hz 大幅挥手 0.774
// 所以"一个真的在动的人"读的是 0.3 上下，不是几。下面的能量取值全从这张表来。
const STILL = 0;
const ENERGETIC = 0.3;      // 参考值：也正好是 MOTION.stillnessSpeedRef
const FLAILING = 5;         // 比实测最大值（0.77）还大六倍 —— "一直在蹦的人"的上界

const FIRST_BOUND = movementBounds(ARC.total, ARC.beats)[0];

test('theseus: 站着不动的人走的是基准速率，不是更慢的 —— 裁定的第 1 条硬线', () => {
  // ⚠️ 这一条的基准**必须**是 `buildSchedule` 排出来的那张表，不能是"另一种写法的
  // 站着不动"。第一版写的是"不喂运动量"和"喂 0"两条路对比 —— 它们当然一致，
  // 于是把"加速项给每个人都白送一点"这种改法照样放过去了（实测：变异之后全绿）。
  // 排期表是唯一一个不受加速项影响的参照物，所以对比只能对着它。
  for (const seed of [3, 17, 400]) {
    for (const e of [undefined, STILL]) {
      const { fired, machine } = session(seed, ARC.total, { overallEnergy: e });
      const plan = machine.schedule;
      const anchors = tierAnchors();
      assert.equal(fired.length, plan.length, `seed ${seed} energy=${e}`);
      for (let i = 0; i < fired.length; i++) {
        // 不早于排期：加速项在站着不动的人身上必须是恒等
        assert.ok(fired[i].at >= plan[i] - 1e-9,
          `seed ${seed} energy=${e}: 第 ${i + 1} 件排在 ${plan[i].toFixed(3)}s，` +
          `却在 ${fired[i].at.toFixed(3)}s 就换了 —— 站着不动的人被加速了`);
        // 也不晚于排期（帧量化 + minGap 复位最多差几帧）：**加速只能加，不能减**。
        // 唯一的例外是有据可查的那一条：升档跟着的那一件要等升档之后满 `tierLead` 秒才碎
        //（`tierAnchors`，docs/44 §6 2026-09-14 夜），升档落在乐章边界 ±edgeMargin 里还要再等出去；
        // 被它压住的后面几件按 minGap 依次放出来。除此之外一件都不许晚。
        const hold = anchors.includes(i) ? THESEUS.tierLead + 2 * THESEUS.edgeMargin : 0;
        const queue = i > 0 ? fired[i - 1].at + THESEUS.minGap : 0;
        const release = Math.max(plan[i] + hold, queue);
        assert.ok(fired[i].at <= release + 3 * DT,
          `seed ${seed} energy=${e}: 第 ${i + 1} 件排在 ${plan[i].toFixed(3)}s，` +
          `拖到 ${fired[i].at.toFixed(3)}s 才换 —— 站着不动的人走的是更慢的速率`);
      }
      assert.ok(fired.length >= 25, `seed ${seed}: 只换了 ${fired.length} 件`);
      assert.equal(ALL_SLOT_KEYS.filter((k) => machine.isReplaced(k)).length, 18, `seed ${seed}`);
    }
  }
});

test('theseus: 一直在蹦的人也不会在第一乐章里被拆光 —— 裁定的第 2 条硬线', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const hot = session(seed, ARC.total, { overallEnergy: FLAILING });
    const cold = session(seed, ARC.total, { overallEnergy: STILL });

    // ⚠️ 先钉住"这一条看得见它要看的东西"。docs/44 §10.5 里两道绿着的坏闸
    // 都是栽在这一步上的：不先证明加速真的在这一场里发生过，
    // 下面那个上限就可能只是在断言"加速根本没接上"。
    const hotLast = hot.fired[hot.fired.length - 1].at;
    const coldLast = cold.fired[cold.fired.length - 1].at;
    assert.ok(hotLast < coldLast - 10,
      `seed ${seed}: 一直在蹦也只把最后一件从 ${coldLast.toFixed(1)}s 提到 ${hotLast.toFixed(1)}s —— ` +
      '加速没在这一场里生效，下面的上限断言等于没断言');

    const inFirst = hot.fired.filter((f) => f.at < FIRST_BOUND).length;
    assert.ok(inFirst <= THESEUS.perBeat[0],
      `seed ${seed}: 第一乐章里换了 ${inFirst} 件（额度 ${THESEUS.perBeat[0]} 件）—— ` +
      '"那是我"还没立住就被拆光了（docs/44 §2 / docs/26 §E）');
    assert.ok(hot.fired[0].at >= THESEUS.graceSeconds,
      `seed ${seed}: 第一件落在 ${hot.fired[0].at.toFixed(2)}s，加速把宽限挖穿了`);
    // 加速只改疏密，不改总数，也不改"一件原件都不剩"
    // （个别种子的基准排期本来就只有 25 件 —— 第 26 件被 minGap 推出 180 秒之外，
    //  在 `buildSchedule` 里就丢掉了。所以这里比的是"和站着不动的人一样多"，
    //  而不是硬写 26：那是排期的性质，不是加速的性质）
    assert.equal(hot.fired.length, cold.fired.length, `seed ${seed}: 加速把件数改了`);
    assert.equal(ALL_SLOT_KEYS.filter((k) => hot.machine.isReplaced(k)).length, 18, `seed ${seed}`);
    // 密了也不许下暴雨：minGap 和三件并发那两道闸照样管用
    assert.ok(hot.maxInFlight <= THESEUS.maxConcurrent, `seed ${seed}`);
    for (let i = 1; i < hot.fired.length; i++) {
      assert.ok(hot.fired[i].at - hot.fired[i - 1].at >= THESEUS.minGap - 1e-6, `seed ${seed} 第 ${i} 件`);
    }
  }
});

test('theseus: 加速是单调的 —— 动得越多，排期只会更早，一件都不会更晚', () => {
  const ladder = [STILL, 0.185, ENERGETIC, 0.774, FLAILING];
  for (let seed = 1; seed <= 12; seed++) {
    const runs = ladder.map((e) => session(seed, ARC.total, { overallEnergy: e }).fired);
    const n = runs[0].length;
    for (const r of runs) assert.equal(r.length, n, `seed ${seed}: 加速把件数改了`);
    for (let i = 1; i < ladder.length; i++) {
      for (let k = 0; k < n; k++) {
        assert.ok(runs[i][k].at <= runs[i - 1][k].at + 1e-6,
          `seed ${seed}: energy 从 ${ladder[i - 1]} 提到 ${ladder[i]} 之后，` +
          `第 ${k + 1} 件反而从 ${runs[i - 1][k].at.toFixed(2)}s 退到 ${runs[i][k].at.toFixed(2)}s —— ` +
          '加速项减速了');
      }
    }
    // 阶梯顶端必须真的动过，否则上面那串 `<=` 在"加速完全没接"时也全绿
    assert.ok(runs[ladder.length - 1][n - 1].at < runs[0][n - 1].at - 10,
      `seed ${seed}: 整条阶梯一动没动`);
  }
});

test('theseus: 倍速就是 1 + motionRateGain × energy —— 0.8 这个数的来路本身', () => {
  // §2 那张表里最小的一档：III 段 5.6s/件 → IV 段 4.5s/件。
  // 动得多的人在一段之内体验到的应该是**下一段的疏密**，不是这条线里没有过的节奏。
  const want = 1 + THESEUS.motionRateGain * ENERGETIC;
  assert.ok(Math.abs(want - 5.6 / 4.5) < 0.02,
    `motionRateGain=${THESEUS.motionRateGain} 在 energy=0.3 时给出 ${want.toFixed(3)} 倍速，` +
    `而 §2 那张表的 III→IV 是 ${(5.6 / 4.5).toFixed(3)} 倍 —— 数和它的理由对不上了`);

  // 再从行为上验一遍：一段之内，每一件距段首的偏移被压成 1/倍速
  const bounds = movementBounds(ARC.total, ARC.beats);
  const floorOf = (k: number) => Math.max(THESEUS.graceSeconds, k <= 0 ? 0 : bounds[k - 1]);
  const ratios: number[] = [];
  for (let seed = 1; seed <= 10; seed++) {
    const hot = session(seed, ARC.total, { overallEnergy: ENERGETIC }).fired;
    const cold = session(seed, ARC.total, { overallEnergy: STILL }).fired;
    for (let i = 0; i < cold.length; i++) {
      const floor = floorOf(movementOfEvent(i));
      const base = cold[i].at - floor;
      if (base < 8) continue;              // 贴着段首的那几件偏移太小，比值全是量化噪声
      ratios.push((hot[i].at - floor) / base);
    }
  }
  const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  assert.ok(ratios.length > 50, `只取到 ${ratios.length} 个样本`);
  assert.ok(Math.abs(mean - 1 / want) < 0.03,
    `一段之内的偏移被压成了 ${mean.toFixed(3)}，而 1/(1+${THESEUS.motionRateGain}×${ENERGETIC}) = ` +
    `${(1 / want).toFixed(3)} —— 加速的**强度**和 tuning 里写的那个数对不上`);
});

// ── §10 第 5 条 ──────────────────────────────────────────────────────────────
test('theseus: 人一走全部归零 —— 下一个人从一具完整的原件身体开始（§8）', () => {
  const arc = createArc();
  const t = createTheseus({ seed: 42 });
  for (let i = 0; i < Math.round(120 / DT); i++) {
    const a = arc.update(true, DT);
    t.update({ elapsed: a.elapsed, present: true }, DT);
  }
  assert.ok(t.state.replaced > 0, '两分钟之后总该换掉过几件');

  let sawReset = false;
  for (let i = 0; i < Math.round((ARC.resetAfter + 2) / DT); i++) {
    const a = arc.update(false, DT);
    const s = t.update({ elapsed: a.elapsed, present: false }, DT);
    if (s.justReset) sawReset = true;
  }
  assert.ok(sawReset, `离开 ${ARC.resetAfter}s 之后必须归零 —— 用的是 ARC.resetAfter，不是第二套宽限`);
  assert.equal(t.state.replaced, 0);
  for (const k of ALL_SLOT_KEYS) assert.equal(t.isReplaced(k), false, `${k} 还留着上一场的件`);
});

// ── §10 第 6 条 ──────────────────────────────────────────────────────────────
test('theseus: 借件距离单调不减 —— 晚期不会突然借回自己的件', () => {
  const { borrow } = session(5);
  for (let i = 1; i < borrow.length; i++) {
    assert.ok(borrow[i] >= borrow[i - 1],
      `第 ${i} 帧借距从 d${borrow[i - 1]} 退回 d${borrow[i]} —— "越来越不像你"当场自相矛盾`);
  }
  assert.equal(borrow[0], 0, '开场必须是 d0：自己的件');
  assert.ok(borrow[borrow.length - 1] >= 3, `走到头至少要到 d3，实得 d${borrow[borrow.length - 1]}`);
  // 曲线被写成不单调的也不许让它回头（防的是有人调参时手滑）
  const bad = [0.1, 0.05, 0.6, 0.9];
  let prev = -1;
  for (let p = 0; p <= 1.0001; p += 0.01) {
    const d = borrowDistance(p, 4, bad);
    assert.ok(d >= prev, `overall=${p.toFixed(2)} 时借距回头了`);
    prev = d;
  }
});

test('theseus: ?arc= 把整条压短之后排期仍然成立 —— 不出界、不倒序', () => {
  const t = buildSchedule(mulberry32(1), 90);
  assert.ok(t.length > 0);
  for (let i = 1; i < t.length; i++) assert.ok(t[i] > t[i - 1]);
  assert.ok(t[t.length - 1] <= 90);
  // 比宽限还短的一场：一件都排不进去也不许抛、不许给出负数
  const tiny = buildSchedule(mulberry32(1), 10);
  for (const x of tiny) assert.ok(Number.isFinite(x) && x >= 0);
});

// ── §5 第 5 条：整体尺度 ──────────────────────────────────────────────────────
test('theseus: 尺度漂移在开场几乎不动，走到头正好是 scaleDrift', () => {
  assert.equal(scaleDrift(0, 1), 1, '开场必须是原样 —— "那是我"要先立住');
  assert.ok(Math.abs(scaleDrift(20 / 180, 1) - 1) < 0.005,
    `二十秒宽限那一刻已经缩放了 ${(scaleDrift(20 / 180, 1) - 1) * 100}% —— 开场不该动`);
  assert.ok(Math.abs(scaleDrift(1, 1) - (1 + THESEUS.scaleDrift)) < 1e-9);
  assert.ok(Math.abs(scaleDrift(1, -1) - (1 - THESEUS.scaleDrift)) < 1e-9);
  // 单调：一件装置里"忽大忽小"读作故障，不读作漂移
  let prev = 0;
  for (let p = 0; p <= 1.0001; p += 0.01) {
    const v = scaleDrift(p, 1);
    assert.ok(v >= prev, `overall=${p.toFixed(2)} 时尺度回头了`);
    prev = v;
  }
});

test('theseus: 尺度漂移不会把头顶挤出画面 —— 这是它唯一能坏的方式', () => {
  // 取景余量（× 身高）：画面比身体高 `heightFactor`，身体中心还被抬高 `centerLift`。
  // 头顶上方剩下的就是这么多，尺度漂移只能吃它的一部分。
  const headroom = (FRAMING.heightFactor - 1) / 2 - FRAMING.centerLift;
  assert.ok(THESEUS.scaleDrift < headroom,
    `scaleDrift=${THESEUS.scaleDrift} 已经吃掉全部 ${headroom.toFixed(3)} 的头顶余量 —— ` +
    '那不是"它变大了"，那是画面把头切了');
  // 留一半余量给非标准站姿（举手、跳起来）
  assert.ok(THESEUS.scaleDrift < headroom / 2,
    `scaleDrift=${THESEUS.scaleDrift} 吃掉了一半以上的头顶余量，举手的人会被切`);
});

test('theseus: 尺度的方向由种子定，两个方向都会出现，人一走回到 1', () => {
  const dirs = new Set<number>();
  for (let seed = 1; seed <= 30; seed++) {
    const t = createTheseus({ seed });
    for (let i = 0; i < 200; i++) t.update({ elapsed: ARC.total, present: true }, DT);
    dirs.add(Math.sign(t.state.scale - 1));
  }
  assert.deepEqual([...dirs].sort(), [-1, 1],
    '三十个种子里只出现了一个方向 —— §5 说的是"比你高，或比你矮"');

  // 归零：下一个人从原样开始（§8 的同一条理由 —— 他没见过上一具身体）
  const t = createTheseus({ seed: 4 });
  const arc = createArc();
  for (let i = 0; i < Math.round(150 / DT); i++) {
    const a = arc.update(true, DT);
    t.update({ elapsed: a.elapsed, present: true }, DT);
  }
  assert.ok(Math.abs(t.state.scale - 1) > 0.01, '两分半之后总该漂开了');
  for (let i = 0; i < Math.round((ARC.resetAfter + 2) / DT); i++) {
    const a = arc.update(false, DT);
    t.update({ elapsed: a.elapsed, present: false }, DT);
  }
  assert.equal(t.state.scale, 1, '人走了尺度还留在上一场');
});
