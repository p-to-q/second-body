/**
 * 一条线（`core/src/line.ts` + docs/44 §6：四个乐章留名字，删边界）。
 *
 * 三道闸，各对着那条裁定里的一句话：
 *  1. **没有边界**：`arc.overall` 按 1% 一步扫过去，三个数没有一步跳得超过一个小界。
 *  2. **四个玩法仍然是它们自己**：在各自的地名上，三个数等于删掉的那四个文件里的数，
 *     而且采样器吐出来的骨架和那四个文件逐帧对得上。
 *     参照物是**抄在这个文件里的旧实现**，不是 `tuning.ts` —— 参照物要是跟着 LINE 一起改，
 *     这道闸就会和它要挡的东西一起坏（docs/44 §10.5 第 6 条那三道坏闸的形状）。
 *  3. **永远不脱钩**：一个抬着手站定的人，整条线走完，身体一毫米都不自己动。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLineSampler, lineAt, linePoints, pointOf, speciesDrift } from '../src/line.ts';
import { movementBounds, type MovementIndex } from '../src/arc.ts';
import { buildSkeleton } from '../src/skeleton.ts';
import { ARC } from '../src/tuning.ts';
import type { Bone, Skeleton, Vec3 } from '../src/types.ts';

// ─────────────────────────── 旧实现（逐字取自删掉之前的 acts/*.ts） ───────────────────────────

/** 今天（删之前）四个玩法各自的那个数。**写死**，不从 tuning 读 */
const TODAY = {
  delay: [0, 1.2, 0, 0],
  weight: [0, 0, 1, 0],
  facing: [0, 0, 0, 1],
};

/** echo.ts：环形缓冲里离 t-1.2 最近的那一帧；缓冲不够半个延迟就跟随 */
function legacyEcho() {
  const ECHO = 1.2; const CAP = Math.ceil(ECHO * 60 * 2);
  const buf: { t: number; sk: Skeleton }[] = []; let head = 0;
  return (sk: Skeleton, t: number): Skeleton => {
    buf[head] = { t, sk }; head = (head + 1) % CAP;
    const want = t - ECHO;
    let best: { t: number; sk: Skeleton } | null = null;
    for (const f of buf) { if (!f) continue; if (!best || Math.abs(f.t - want) < Math.abs(best.t - want)) best = f; }
    return best && t - best.t >= ECHO * 0.5 ? best.sk : sk;
  };
}

/** resist.ts：逐关节临界阻尼追踪，τ 随速度 0.06..0.42 */
function legacyResist(first: Skeleton) {
  const follow: Record<string, Vec3> = {};
  for (const k in first.joints) follow[k] = [...first.joints[k]] as Vec3;
  return (sk: Skeleton, dt: number, speed: number): Skeleton => {
    const step = Math.min(dt, 1 / 15);
    const tau = 0.06 + (0.42 - 0.06) * Math.min(1, speed / 1.2);
    const a = 1 - Math.exp(-step / Math.max(1e-3, tau));
    const track = (key: string, target: Vec3): Vec3 => {
      let cur = follow[key];
      if (!cur) { cur = [target[0], target[1], target[2]]; follow[key] = cur; return [...cur] as Vec3; }
      cur[0] += (target[0] - cur[0]) * a; cur[1] += (target[1] - cur[1]) * a; cur[2] += (target[2] - cur[2]) * a;
      return [...cur] as Vec3;
    };
    const joints: Record<string, Vec3> = {};
    for (const k in sk.joints) joints[k] = track(k, sk.joints[k]);
    const bones: Bone[] = sk.bones.map((b) => {
      const p0 = track(`${b.id}#0`, b.p0); const p1 = track(`${b.id}#1`, b.p1);
      return { ...b, p0, p1, length: Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]) };
    });
    return { ...sk, joints, bones };
  };
}

/** facing.ts：X 取负 */
function legacyFacing(sk: Skeleton): Skeleton {
  const f = (p: Vec3): Vec3 => [-p[0], p[1], p[2]];
  const joints: Record<string, Vec3> = {};
  for (const k in sk.joints) joints[k] = f(sk.joints[k]);
  return { ...sk, joints, bones: sk.bones.map((b) => ({ ...b, p0: f(b.p0), p1: f(b.p1) })) };
}

// ─────────────────────────── 夹具 ───────────────────────────

const POSE: Record<string, Vec3> = {
  pelvis: [0, 0.95, 0], chest: [0, 1.35, 0], neck: [0, 1.45, 0], headCenter: [0, 1.60, 0],
  shoulderL: [0.19, 1.38, 0], elbowL: [0.33, 1.10, 0.02], wristL: [0.44, 0.86, 0.04], handTipL: [0.48, 0.77, 0.05],
  shoulderR: [-0.19, 1.38, 0], elbowR: [-0.33, 1.10, 0.02], wristR: [-0.44, 0.86, 0.04], handTipR: [-0.48, 0.77, 0.05],
  hipL: [0.09, 0.93, 0], kneeL: [0.10, 0.51, 0.01], ankleL: [0.10, 0.09, 0], footIdxL: [0.10, 0.03, 0.16],
  hipR: [-0.09, 0.93, 0], kneeR: [-0.10, 0.51, 0.01], ankleR: [-0.10, 0.09, 0], footIdxR: [-0.10, 0.03, 0.16],
};

/** 站在舞台偏左 0.3m、右手举过头顶 —— 故意不对称，也故意不站在中线上 */
function asymmetricPose(): Record<string, Vec3> {
  const p: Record<string, Vec3> = {};
  for (const k in POSE) p[k] = [POSE[k][0] + 0.3, POSE[k][1], POSE[k][2]];
  p.elbowR = [-0.30 + 0.3, 1.62, 0.02]; p.wristR = [-0.34 + 0.3, 1.88, 0.04]; p.handTipR = [-0.35 + 0.3, 1.97, 0.05];
  return p;
}

/** 挥右手：肘和腕绕肩画圈，1.5Hz */
function waving(t: number): Skeleton {
  const p: Record<string, Vec3> = {};
  for (const k in POSE) p[k] = [...POSE[k]] as Vec3;
  const s = Math.sin(2 * Math.PI * 1.5 * t), c = Math.cos(2 * Math.PI * 1.5 * t);
  p.elbowR = [-0.33 - 0.05 * c, 1.25 + 0.15 * s, 0.02];
  p.wristR = [-0.44 - 0.15 * c, 1.20 + 0.35 * s, 0.04];
  p.handTipR = [-0.48 - 0.17 * c, 1.22 + 0.40 * s, 0.05];
  return buildSkeleton(p, [], t);
}

const side = (k: string) => (k.endsWith('L') ? `${k.slice(0, -1)}R` : k.endsWith('R') ? `${k.slice(0, -1)}L` : k);
const gap = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** 两副骨架之间最大的关节差（米）。`relabel` = 左右名字互换之后再比 */
function worstJoint(a: Skeleton, b: Skeleton, relabel = false): number {
  let w = 0;
  for (const k in a.joints) {
    const q = b.joints[relabel ? side(k) : k];
    if (q) w = Math.max(w, gap(a.joints[k], q));
  }
  for (const x of a.bones) {
    const y = b.bones.find((z) => z.id === (relabel ? side(x.id) : x.id));
    if (y) w = Math.max(w, gap(x.p0, y.p0), gap(x.p1, y.p1), Math.abs(x.length - y.length));
  }
  return w;
}

// ─────────────────────────── 闸 1：没有边界 ───────────────────────────

/**
 * 1% 一步上允许的最大变化。按"三分钟的 1% = 1.8 秒"算：
 * 延迟 1.2 秒要在两个地名之间长出来，最陡处一步约 0.076 秒；
 * 0.1 秒是那个斜率再留一点余量 —— 而一个硬切一步就是 1.2。
 */
const MAX_STEP = {
  delay: 0.1, weight: 0.1, facing: 0.1,
  // 物种漂移只有 25 秒（第 III 乐章开头 → 第 III 个地名），smoothstep 最陡处一步 0.108。
  // 界按它自己的斜率定，不是按上面三条抄；原来那个 4 秒硬坡一步是 0.45。
  drift: 0.12,
};

test('line: arc.overall 按 1% 扫过去，三个数没有一步跳过界 —— 线上没有边界', (t) => {
  let prev = lineAt(0);
  let prevDrift = speciesDrift(0);
  const worst = { delay: 0, weight: 0, facing: 0, drift: 0 };
  for (let i = 1; i <= 100; i++) {
    const x = i / 100;
    const now = lineAt(x);
    const drift = speciesDrift(x);
    for (const k of ['delay', 'weight', 'facing'] as const) {
      const d = Math.abs(now[k] - prev[k]);
      worst[k] = Math.max(worst[k], d);
      assert.ok(d <= MAX_STEP[k],
        `${k} 在 overall ${((i - 1) / 100).toFixed(2)} → ${x.toFixed(2)} 跳了 ${d.toFixed(3)}（界 ${MAX_STEP[k]}）—— 边界回来了`);
    }
    const dd = Math.abs(drift - prevDrift);
    worst.drift = Math.max(worst.drift, dd);
    assert.ok(dd <= MAX_STEP.drift, `物种漂移在 overall ${x.toFixed(2)} 跳了 ${dd.toFixed(3)}`);
    prev = now; prevDrift = drift;
  }
  t.diagnostic(`最大一步：延迟 ${worst.delay.toFixed(3)}s · 重量 ${worst.weight.toFixed(3)} · 朝向 ${worst.facing.toFixed(3)} · 漂移 ${worst.drift.toFixed(3)}`);
});

test('line: 旧的三个段界上（40 / 85 / 135 秒）两侧各 0.1 秒，三个数几乎相等', () => {
  const ends = movementBounds(1, ARC.beats);
  for (const b of ends.slice(0, 3)) {
    const lo = lineAt(b - 0.1 / 180), hi = lineAt(b + 0.1 / 180);
    for (const k of ['delay', 'weight', 'facing'] as const) {
      assert.ok(Math.abs(hi[k] - lo[k]) < 0.01, `${k} 在 ${Math.round(b * 180)} 秒那条旧界上跳了 ${Math.abs(hi[k] - lo[k])}`);
    }
  }
});

// ─────────────────────────── 闸 2：四个玩法仍然是它们自己 ───────────────────────────

test('line: 每个地名落在它自己那一段里（第 I 个 ≈ 20 秒宽限那一刻）', () => {
  const ends = movementBounds(1, ARC.beats);
  for (let k = 0; k < 4; k++) {
    const p = pointOf(k as MovementIndex);
    assert.ok(p > (k === 0 ? 0 : ends[k - 1]) && p < ends[k], `第 ${k + 1} 个地名 ${p} 不在自己那一段里`);
  }
  // beats[0] = 0.22 → 第 I 段 39.6 秒，中点 19.8 秒；THESEUS.graceSeconds = 20。差 0.2 秒，
  // 两条线在同一刻前后开始动 —— 界放到 0.5 秒，钉的是"同一刻"，不是巧合的小数
  assert.ok(Math.abs(pointOf(0) * 180 - 20) < 0.5, `第 I 个地名在 ${pointOf(0) * 180} 秒`);
  assert.deepEqual(linePoints(), [0, 1, 2, 3].map((k) => pointOf(k as MovementIndex)));
});

test('line: 在各自的地名上，三个数就是删掉的那四个玩法里的数', () => {
  for (let k = 0; k < 4; k++) {
    const at = lineAt(pointOf(k as MovementIndex));
    for (const key of ['delay', 'weight', 'facing'] as const) {
      assert.ok(Math.abs(at[key] - TODAY[key][k]) < 1e-9,
        `第 ${k + 1} 个地名上 ${key} = ${at[key]}，今天的玩法是 ${TODAY[key][k]}`);
    }
  }
});

/** 钉在第 k 个地名上跑 `seconds` 秒挥手，逐帧和旧实现比，返回最大偏差（米） */
function pinnedVsLegacy(k: MovementIndex, seconds = 6): number {
  const s = createLineSampler();
  const target = lineAt(pointOf(k));
  const dt = 1 / 60;
  const echo = legacyEcho();
  let resist: ReturnType<typeof legacyResist> | null = null;
  let worst = 0;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    const t = i * dt;
    const sk = waving(t);
    const speed = 0.8;
    const got = s.apply({ skeleton: sk, t, dt, speed, target, snap: i === 0 });
    let want: Skeleton;
    if (k === 0) want = sk;
    else if (k === 1) want = echo(sk, t);
    else if (k === 2) { resist ??= legacyResist(sk); want = resist(sk, dt, speed); }
    else want = legacyFacing(sk);
    // 旧 echo 缓冲不够半个延迟时跟随、新的取最老那一帧：这 1.2 秒的建立期不比
    if (k === 1 && t < 1.25) continue;
    worst = Math.max(worst, worstJoint(got, want, k === 3));
  }
  return worst;
}

const NAMES = ['follow', 'echo', 'resist', 'facing'];
for (let k = 0; k < 4; k++) {
  test(`line: 钉在第 ${k + 1} 个地名上，采样器逐帧就是原来的 ${NAMES[k]}`, (t) => {
    const worst = pinnedVsLegacy(k as MovementIndex);
    t.diagnostic(`${NAMES[k]}: 挥手 6 秒最大偏差 ${(worst * 1000).toFixed(4)}mm`);
    assert.ok(worst < 1e-3, `${NAMES[k]} 在自己的地名上和原来差了 ${(worst * 1000).toFixed(2)}mm`);
  });
}

// ─────────────────────────── 闸 3：永远不脱钩 ───────────────────────────

/** 整条线 0 → 1 走 `seconds` 秒，观众一直是 `pose`，速度 `speed`。返回头 settle 秒之后身体自己动的最大量 */
function walkLine(pose: Skeleton, speed: number, seconds = 200, settle = 3): { moved: number; facing: number } {
  const s = createLineSampler();
  const dt = 1 / 60;
  let ref: Skeleton | null = null;
  let moved = 0;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    const t = i * dt;
    const target = lineAt(t / 180);
    const out = s.apply({ skeleton: pose, t, dt, speed, target, snap: i === 0 });
    if (t < settle) continue;
    if (!ref) { ref = out; continue; }
    moved = Math.max(moved, worstJoint(out, ref));
  }
  return { moved, facing: s.facing };
}

test('line: 永不脱钩 —— 抬着右手、站偏一边，一动不动走完整条线，身体一毫米都不自己动', (t) => {
  const { moved, facing } = walkLine(buildSkeleton(asymmetricPose(), [], 0), 0);
  t.diagnostic(`静止 200 秒（跨过全部三条旧界），自动 ${(moved * 1000).toFixed(4)}mm，朝向停在 ${facing.toFixed(3)}`);
  assert.ok(moved < 1e-3,
    `观众静止时它自己动了 ${(moved * 1000).toFixed(1)}mm —— 映射在没有人出力的时候变了（docs/40 §1）`);
});

test('line: 对照组 —— 同一个姿态、观众在动（速度读数非零）时，朝向真的走到了终点', (t) => {
  // 没有这一条，上面那条在"朝向永远不追"时也是绿的：把 facingChase 改成 0 就能骗过它
  const { moved, facing } = walkLine(buildSkeleton(asymmetricPose(), [], 0), 0.3);
  t.diagnostic(`速度 0.3 走完整条线：朝向 ${facing.toFixed(3)}，身体换边 ${(moved * 1000).toFixed(0)}mm`);
  assert.ok(facing > 0.99, `观众一直在动，朝向却只到 ${facing}`);
  assert.ok(moved > 0.3, '朝向走完了，身体却没有换到另一边 —— 这个夹具量不出映射的变化');
});

test('line: 物种漂移第 III 乐章开头才开始、第 III 个地名到齐，而且单调', () => {
  const ends = movementBounds(1, ARC.beats);
  assert.equal(speciesDrift(ends[1] - 1e-6), 0, '第 III 乐章之前物种方案不许露面（docs/40 §1）');
  assert.equal(speciesDrift(pointOf(2)), 1);
  assert.equal(speciesDrift(1), 1);
  let prev = 0;
  for (let i = 0; i <= 1000; i++) {
    const d = speciesDrift(i / 1000);
    assert.ok(d >= prev - 1e-12, `漂移在 ${i / 1000} 往回走了`);
    prev = d;
  }
});
