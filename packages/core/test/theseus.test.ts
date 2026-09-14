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
  borrowDistance, buildSchedule, createTheseus, quietSlotKeys, slotWeights,
} from '../src/theseus.ts';
import type { TheseusMachine, TheseusReplacement } from '../src/theseus.ts';
import { ARC, MORPH, THESEUS } from '../src/tuning.ts';
import { ALL_SLOT_KEYS } from '../src/slots.ts';
import { createArc } from '../src/arc.ts';
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
    const s = t.update({ elapsed: a.elapsed, present, energy: opt.energy ?? null }, DT);
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
