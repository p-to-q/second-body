/**
 * 多人入镜（`core/src/people.ts`）。钉的是 docs/50 里写下的每一条边界：每条一个决定好的行为、一个断言。
 *
 * 喂的是合成的"画面里的人"（`framing-people.ts` 同一个 1.7m 人形），30Hz。
 * MediaPipe 的输出**顺序不保证**，所以时间线默认每一帧把观测打乱一次（确定性的打乱，不摇骰子）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bestAssignment, clampCap, createPeopleTracker, dedupe, lineup, observePerson, tintFor,
  type PeopleFrame, type PersonObs,
} from '../src/people.ts';
import { PEOPLE } from '../src/tuning.ts';
import type { RawPose } from '../src/types.ts';
import { person, type PersonSpec } from './framing-people.ts';

const HZ = 30;
const DT = 1 / HZ;

/** 确定性的打乱：第 k 帧按 k 旋转 + 反转，覆盖所有排列里常见的几种 */
function shuffle<T>(xs: T[], k: number): T[] {
  if (xs.length < 2) return xs;
  const r = k % xs.length;
  const rot = [...xs.slice(r), ...xs.slice(0, r)];
  return k % 3 === 0 ? rot.reverse() : rot;
}

/** 跑一段：每一帧给出这一帧画面里的人（spec 数组），返回每一帧的结果 */
function run(frames: number, at: (k: number, t: number) => PersonSpec[], opts: { cap?: number; noShuffle?: boolean } = {}): PeopleFrame[] {
  const tr = createPeopleTracker({ cap: opts.cap ?? 3 });
  const out: PeopleFrame[] = [];
  for (let k = 0; k < frames; k++) {
    const poses: RawPose[] = at(k, k * DT).map((s) => person(s));
    out.push(tr.update(opts.noShuffle ? poses : shuffle(poses, k), DT));
  }
  return out;
}

/** 这一帧离 x 最近的那条轨迹的 id */
function idNear(f: PeopleFrame, cx: number): number | undefined {
  let best: number | undefined, d = Infinity;
  for (const t of f.tracks) if (t.missing === 0 && Math.abs(t.cx - cx) < d) { d = Math.abs(t.cx - cx); best = t.id; }
  return best;
}

// ── 观测 ─────────────────────────────────────────────────────────────────────

test('观测：躯干中心、尺度、面积；没有 screen / 分太低 = 不作数', () => {
  const o = observePerson(person({ cx: 0.3, s: 0.5, hy: 0.52 }))!;
  assert.ok(o, '一个站着的人一定有观测');
  assert.ok(Math.abs(o.cx - 0.3) < 0.01, `中心 ${o.cx}`);
  assert.ok(o.scale > 0.2 && o.scale < 0.26, `躯干长约 0.45×0.5 = 0.225，量到 ${o.scale}`);
  const near = observePerson(person({ cx: 0.5, s: 0.9, hy: 0.6 }))!;
  assert.ok(near.area > o.area, '离得近的人面积大');
  assert.equal(observePerson({ ...person(), screen: undefined }), null, '回放录制没有 screen：多人跟踪不认它');
  assert.equal(observePerson({ ...person(), score: 0.2 }), null);
  assert.equal(observePerson(null), null);
});

test('观测：弯腰（躯干投影缩到 1/4）和侧身（肩宽缩到 1/4）时尺度都不塌 —— 不塌才不会被门限判成新人', () => {
  const upright = observePerson(person({ cx: 0.5, s: 0.5 }))!.scale;
  const bent = observePerson(person({ cx: 0.5, s: 0.5, torso: 0.25 }))!.scale;
  const side = observePerson(person({ cx: 0.5, s: 0.5, width: 0.25 }))!.scale;
  for (const [name, v] of [['弯腰', bent], ['侧身', side]] as const) {
    assert.ok(Math.abs(Math.log(v / upright)) <= PEOPLE.gateScale, `${name}：尺度 ${v.toFixed(3)} / 站直 ${upright.toFixed(3)} 越过了尺度门限`);
  }
  // 时间线：一个人站直 → 弯腰 → 站直，id 一个都不换
  const frames = run(HZ * 3, (_k, t) => [{ cx: 0.5, s: 0.5, torso: t > 1 && t < 2 ? 0.25 : 1 }], { cap: 1 });
  assert.equal(new Set(frames.slice(12).flatMap((f) => f.tracks.map((x) => x.id))).size, 1);
});

test('观测：胯在画外（笔记本前坐着）照样有中心和尺度', () => {
  const o = observePerson(person({ s: 1.0, hy: 0.95 }))!;
  assert.ok(o, '只露头肩的人也是一个人');
  assert.ok(o.scale > 0.3, `按肩宽折算的躯干长 ${o.scale}`);
});

test('去重：MediaPipe 在同一个人身上给两份，留一份；两个真人不合并', () => {
  const a = observePerson(person({ cx: 0.5 }))!;
  const b = observePerson({ ...person({ cx: 0.505 }), score: 0.9 })!;
  assert.equal(dedupe([b, a]).length, 1);
  assert.equal(dedupe([b, a])[0].score, a.score, '留分高的');
  const c = observePerson(person({ cx: 0.2 }))!;
  assert.equal(dedupe([a, c]).length, 2);
});

test('配对：穷举的是全局最优，不是贪心', () => {
  // 贪心会让观测 0 先拿走代价 0.1 的轨迹 0，逼观测 1 配 0.9；最优是 0→1 (0.2) + 1→0 (0.2)
  const { pairs } = bestAssignment([[0.1, 0.2], [0.2, 0.9]], 2);
  const m = new Map(pairs);
  assert.equal(m.get(0), 1);
  assert.equal(m.get(1), 0);
  // 门限外 / 高于不匹配代价的配对不接受
  assert.deepEqual(bestAssignment([[Infinity], [5]], 1).pairs, []);
});

// ── 身份 ─────────────────────────────────────────────────────────────────────

test('输出顺序每帧打乱：两个站着不动的人的 id 十秒不变，也不发新号', () => {
  const frames = run(HZ * 10, () => [{ cx: 0.3 }, { cx: 0.7 }]);
  const last = frames[frames.length - 1];
  const left = idNear(frames[30], 0.3), right = idNear(frames[30], 0.7);
  assert.notEqual(left, right);
  for (const f of frames.slice(30)) {
    assert.equal(idNear(f, 0.3), left);
    assert.equal(idNear(f, 0.7), right);
  }
  assert.equal(last.tracks.length, 2);
  assert.equal(Math.max(...last.tracks.map((t) => t.id)), 2, '一个新号都没多发');
});

test('两个人交叉走过（一样高、中间一帧重叠只剩一份）：id 跟着各自的方向走', () => {
  // 左边的人 3 秒从 0.2 走到 0.8，右边的反过来；1.4–1.6 秒两人重叠，MediaPipe 只给前面那一个
  const secs = 3;
  const frames = run(HZ * secs, (_k, t) => {
    const u = t / secs;
    const a = 0.2 + 0.6 * u, b = 0.8 - 0.6 * u;
    if (Math.abs(a - b) < 0.08) return [{ cx: a, s: 0.5 }];
    return [{ cx: a, s: 0.5 }, { cx: b, s: 0.5 }];
  });
  const walkerRight = idNear(frames[15], 0.2 + 0.6 * (15 * DT) / secs)!;
  const walkerLeft = idNear(frames[15], 0.8 - 0.6 * (15 * DT) / secs)!;
  const end = frames[frames.length - 1];
  assert.equal(idNear(end, 0.8), walkerRight, '往右走的那个人到了右边，还是他');
  assert.equal(idNear(end, 0.2), walkerLeft, '往左走的那个人到了左边，还是他');
});

test('一个挡住另一个（前面的大、后面的小）一秒：后面那个回来还是原来的 id', () => {
  const frames = run(HZ * 4, (_k, t) => {
    const front = { cx: 0.5, s: 0.6, hy: 0.52 };
    const back = { cx: 0.52, s: 0.35, hy: 0.45 };
    return t > 1.5 && t < 2.3 ? [front] : [front, back];
  });
  const smaller = (f: PeopleFrame) => [...f.tracks].sort((a, b) => a.scale - b.scale)[0]?.id;
  const backId = smaller(frames[30]);
  assert.ok(backId);
  const end = frames[frames.length - 1];
  assert.equal(smaller(end), backId, '被挡住 0.8 秒不算走');
  assert.equal(end.tracks.length, 2);
});

test('出生要憋：一帧误检不成人；死亡有宽限：丢一帧不死', () => {
  const blip = run(HZ * 2, (k) => (k === 20 ? [{ cx: 0.5 }, { cx: 0.2 }] : [{ cx: 0.5 }]));
  for (const f of blip) assert.ok(f.selected.length <= 1, '一帧误检不许拿到身体');
  assert.equal(blip[blip.length - 1].tracks.length, 1, '误检的那条已经消失');

  const flicker = run(HZ * 3, (k) => (k % 6 === 0 ? [] : [{ cx: 0.5 }]));
  const ids = new Set(flicker.slice(20).flatMap((f) => f.tracks.map((t) => t.id)));
  assert.equal(ids.size, 1, `每 6 帧丢 1 帧：始终是同一个 id（出现过 ${[...ids]}）`);
  assert.equal(flicker[flicker.length - 1].primary, [...ids][0]);
});

test('出生：连续被看见 birthSeconds 才转正、才拿到身体', () => {
  const frames = run(HZ * 1, () => [{ cx: 0.5 }]);
  const firstSelected = frames.findIndex((f) => f.selected.length > 0);
  assert.ok(firstSelected * DT >= PEOPLE.birthSeconds - DT, `第 ${firstSelected} 帧就拿到了身体`);
  assert.ok(firstSelected * DT <= PEOPLE.birthSeconds + 2 * DT);
});

test('走出画面 2 秒又回来（原地附近）：还是原来的 id；走了 5 秒再来：新 id', () => {
  const back = run(HZ * 5, (_k, t) => (t > 1 && t < 3.0 ? [] : [{ cx: 0.4 }]));
  const first = back[20].primary;
  assert.equal(back[back.length - 1].primary, first, '墓地认亲');
  assert.ok(back[back.length - 1].tracks[0].reattached >= 1);

  const gone = run(HZ * 8, (_k, t) => (t > 1 && t < 6.5 ? [] : [{ cx: 0.4 }]));
  assert.notEqual(gone[gone.length - 1].primary, gone[20].primary, '墓地过期：下一位是新的人');
});

// ── 谁拿到身体 ─────────────────────────────────────────────────────────────────

test('人数到顶：第四个人擦肩走过，场上三具身体一个都不换', () => {
  const frames = run(HZ * 6, (_k, t) => {
    const three = [{ cx: 0.2, s: 0.5 }, { cx: 0.5, s: 0.5 }, { cx: 0.8, s: 0.5 }];
    // 第四个人 1–2.2 秒走过前景：比场上的大 1.5 倍，但只停留 1.2 秒 < swapSeconds
    return t > 1 && t < 2.2 ? [...three, { cx: 0.1 + (t - 1) * 0.6, s: 0.62, hy: 0.55 }] : three;
  }, { cap: 3 });
  const before = [...frames[HZ * 0.9].selected].sort();
  assert.equal(before.length, 3);
  for (const f of frames.slice(HZ)) assert.deepEqual([...f.selected].sort(), before, '擦肩而过不许换人');
});

test('人数到顶：一个明显更近的人站定不走，swapSeconds 之后换掉最小的那个非主身体，只换一次', () => {
  const frames = run(HZ * 8, (_k, t) => {
    const two = [{ cx: 0.3, s: 0.5 }, { cx: 0.7, s: 0.35, hy: 0.45 }];
    return t > 2 ? [...two, { cx: 0.5, s: 0.7, hy: 0.6 }] : two;
  }, { cap: 2 });
  const primary = frames[HZ].primary;
  const changes = frames.slice(1).filter((f, i) => f.selected.join() !== frames[i].selected.join()).length;
  const end = frames[frames.length - 1];
  assert.equal(end.primary, primary, '主身体是粘的：不因为来了一个更大的人就交出去');
  assert.ok(end.selected.includes(idNear(end, 0.5)!), '站定的近处那个人拿到了身体');
  assert.ok(!end.selected.includes(idNear(end, 0.7)!), '让出的是最小的那个');
  assert.ok(changes <= 3, `选中集合变了 ${changes} 次（两次出生 + 一次换人）`);
});

test('主身体走了、另一个人还在：不交给新人，交给台上已经有身体的那一个；弧线的"有人"不断', () => {
  const frames = run(HZ * 6, (_k, t) => (t > 2 ? [{ cx: 0.7 }] : [{ cx: 0.3 }, { cx: 0.7 }]), { cap: 2 });
  const a = frames[HZ].primary!;
  const b = frames[HZ].selected.find((id) => id !== a)!;
  assert.ok(a && b);
  for (const f of frames) if (f.selected.length) assert.ok(f.primary !== null, '有人拿着身体时一定有主身体');
  assert.equal(frames[frames.length - 1].primary, b, '交接给已经在台上的那一个');
  assert.ok(frames.slice(HZ).every((f) => f.selected.length >= 1), '交接过程中台上一直有人');
});

test('海报：从出生就没动过的人像不拿身体；画面里只有它时照旧拿（和单人一样）', () => {
  const poster = { cx: 0.15, s: 0.4, hy: 0.45 };
  const alone = run(HZ * 3, () => [poster]);
  assert.equal(alone[alone.length - 1].selected.length, 1, '只有它：和 numPoses=1 的行为一样');

  // 一个真人走进来：动过、而且留下来 staticYieldSeconds → 海报让位
  const frames = run(HZ * 8, (_k, t) => (t > 2 ? [poster, { cx: 0.4 + 0.1 * Math.sin(t * 3), s: 0.5 }] : [poster]), { cap: 2 });
  const mid = frames[Math.round(HZ * 3)];
  assert.ok(mid.selected.includes(idNear(mid, 0.15)!), '人刚进来的那一秒海报还拿着身体：不许当场溶掉');
  const end = frames[frames.length - 1];
  const posterId = idNear(end, 0.15)!;
  assert.ok(!end.selected.includes(posterId), '海报不占身体');
  assert.equal(end.selected.length, 1);
  assert.notEqual(end.primary, posterId);
});

test('小孩站在大人旁边：两个 id、两具身体；尺度差不会让他们互相吞并', () => {
  const frames = run(HZ * 4, () => [{ cx: 0.4, s: 0.5 }, { cx: 0.55, s: 0.3, hy: 0.62 }], { cap: 2 });
  const end = frames[frames.length - 1];
  assert.equal(end.tracks.length, 2);
  assert.equal(end.selected.length, 2);
});

test('半个人出画（只剩一侧肩在画内）：不作数也不发新号；回来还是他', () => {
  const frames = run(HZ * 5, (_k, t) => (t > 1.5 && t < 2.2 ? [{ cx: 0.98, s: 0.5 }] : [{ cx: 0.85, s: 0.5 }]), { cap: 2 });
  const id = frames[20].primary;
  assert.equal(frames[frames.length - 1].primary, id);
  assert.equal(frames[frames.length - 1].tracks.length, 1);
});

test('调低上限：最后拿到身体的先让，主身体留下', () => {
  const tr = createPeopleTracker({ cap: 3 });
  let f: PeopleFrame = tr.current;
  for (let k = 0; k < HZ * 2; k++) f = tr.update([person({ cx: 0.2 }), person({ cx: 0.5 }), person({ cx: 0.8 })], DT);
  assert.equal(f.selected.length, 3);
  const primary = f.primary;
  tr.setCap(1);
  f = tr.update([person({ cx: 0.2 }), person({ cx: 0.5 }), person({ cx: 0.8 })], DT);
  assert.deepEqual(f.selected, [primary]);
  assert.equal(clampCap(99), PEOPLE.hardMax);
  assert.equal(clampCap(0), 1);
  assert.equal(clampCap(Number.NaN), 1);
});

test('大家都走了、然后回来：reset 由调用方做；tracker 自己在墓地过期后从头来', () => {
  const frames = run(HZ * 10, (_k, t) => (t > 2 && t < 7 ? [] : [{ cx: 0.3 }, { cx: 0.7 }]), { cap: 2 });
  assert.equal(frames[HZ * 5].selected.length, 0, '没人时没有身体');
  assert.equal(frames[HZ * 5].primary, null);
  const end = frames[frames.length - 1];
  assert.equal(end.selected.length, 2, '回来的两个人都拿到身体');
});

test('坏输入不 throw：NaN 坐标、空数组、null、巨大 dt', () => {
  const tr = createPeopleTracker({ cap: 3 });
  const bad = person();
  bad.screen = bad.screen!.map((l) => ({ ...l, x: Number.NaN }));
  assert.doesNotThrow(() => {
    tr.update([bad, null, undefined], DT);
    tr.update([], Number.NaN);
    tr.update([person()], 99);
  });
});

// ── 站位 ─────────────────────────────────────────────────────────────────────

test('站位：一个人永远在中线（单人行为不变）', () => {
  assert.equal(lineup([{ id: 1, cx: 0.1, scale: 0.2 }]).get(1), 0);
});

test('站位：镜像 —— 画面左边（观众的右手边）的人，身体在屏幕右边；组居中；挤开；不出界', () => {
  const m = lineup([{ id: 1, cx: 0.25, scale: 0.22 }, { id: 2, cx: 0.75, scale: 0.22 }]);
  assert.ok(m.get(1)! > 0 && m.get(2)! < 0, `镜像：${m.get(1)} / ${m.get(2)}`);
  assert.ok(Math.abs(m.get(1)! + m.get(2)!) < 1e-9, '组居中');
  const tight = lineup([{ id: 1, cx: 0.49, scale: 0.22 }, { id: 2, cx: 0.51, scale: 0.22 }, { id: 3, cx: 0.5, scale: 0.22 }]);
  const xs = [...tight.values()].sort((a, b) => a - b);
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] >= PEOPLE.minGap - 1e-6, `挤开：${xs}`);
  const wide = lineup([{ id: 1, cx: 0.0, scale: 0.05 }, { id: 2, cx: 1.0, scale: 0.05 }]);
  for (const x of wide.values()) assert.ok(Math.abs(x) <= PEOPLE.maxOffset + 1e-9, `出界：${x}`);
});

test('差异色：确定、按 id 变、永远不是白色', () => {
  assert.deepEqual(tintFor(7, 2), tintFor(7, 2));
  const seen = new Set<string>();
  for (let id = 1; id < 40; id++) {
    const c = tintFor(12345, id);
    assert.ok(!(c[0] === 1 && c[1] === 1 && c[2] === 1), '白色 = 主身体的原色，不许撞');
    seen.add(c.join());
  }
  assert.ok(seen.size >= 3, '不是所有人都一个颜色');
});

// 类型出口：给 app 层用
export type { PersonObs };
