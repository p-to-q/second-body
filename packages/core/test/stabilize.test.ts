import test from 'node:test';
import assert from 'node:assert/strict';
import { createStabilizer } from '../src/stabilize.ts';
import { BONES } from '../src/skeleton.ts';
import { mulberry32 } from '../src/rng.ts';
import { add, clone, dist, dot, norm, scale, sub } from '../src/vec.ts';
import { SKELETON } from '../src/tuning.ts';
import type { Bone, BoneId, Skeleton, Vec3 } from '../src/types.ts';

// ─────────────────────────────────────────────────────────────────────────────
// 合成骨架：方向逐帧固定，骨长 ±15% 抖动（docs/04 §3 描述的症状）。
// 随机全部来自传入的 Rng（P1），没有 Math.random、没有读时钟。

const RIG: Record<BoneId, { dir: Vec3; len: number }> = {
  spine: { dir: [0, 1, 0.05], len: 0.50 },
  neck: { dir: [0, 1, 0.10], len: 0.08 },
  head: { dir: [0, 1, -0.05], len: 0.14 },
  clavicleL: { dir: [-1, 0.15, 0], len: 0.19 },
  clavicleR: { dir: [1, 0.15, 0], len: 0.19 },
  upperArmL: { dir: [-1, -0.30, 0.20], len: 0.28 },
  upperArmR: { dir: [1, -0.30, 0.20], len: 0.28 },
  foreArmL: { dir: [-0.90, -0.40, 0.30], len: 0.25 },
  foreArmR: { dir: [0.90, -0.40, 0.30], len: 0.25 },
  handL: { dir: [-0.80, -0.50, 0.20], len: 0.14 },
  handR: { dir: [0.80, -0.50, 0.20], len: 0.14 },
  thighL: { dir: [-0.05, -1, 0.10], len: 0.45 },
  thighR: { dir: [0.05, -1, 0.10], len: 0.45 },
  shinL: { dir: [0, -1, -0.05], len: 0.42 },
  shinR: { dir: [0, -1, -0.05], len: 0.42 },
  footL: { dir: [0, -0.20, 1], len: 0.16 },
  footR: { dir: [0, -0.20, 1], len: 0.16 },
};

const ROOTS: Record<string, Vec3> = { pelvis: [0, 0.95, 0], hipL: [-0.09, 0.95, 0], hipR: [0.09, 0.95, 0] };

/** 相对骨长的抖动量，-0.15..+0.15 */
type Jitter = (boneIndex: number, frame: number) => number;

/** "呼吸"：docs/04 §3 点名的症状 —— 每根骨头以自己的相位周期性伸缩 ±15% */
const breathing = (amp = 0.15): Jitter =>
  (i, f) => amp * Math.sin((f / 7.3) * Math.PI * 2 + i * 0.7);

/** 白噪声：更凶的一种读法 —— 每帧独立均匀抖动 ±15% */
const whiteNoise = (seed: number, amp = 0.15): Jitter => {
  const rng = mulberry32(seed);
  return () => amp * (rng.next() * 2 - 1);
};

function synth(frame: number, jitter: Jitter): Skeleton {
  const joints: Record<string, Vec3> = {
    pelvis: clone(ROOTS.pelvis), hipL: clone(ROOTS.hipL), hipR: clone(ROOTS.hipR),
  };
  const bones: Bone[] = [];
  BONES.forEach(([id, a, b], i) => {
    const r = RIG[id];
    const len = r.len * (1 + jitter(i, frame));
    const p0 = clone(joints[a]);
    const p1 = add(p0, scale(norm(r.dir), len));
    joints[b] = clone(p1);
    bones.push({ id, p0: clone(p0), p1: clone(p1), length: len, roll: 0, confidence: 1 });
  });
  return { bones, joints, height: 1.7, warmingUp: false, t: frame / 30 };
}

const dirOf = (b: Bone): Vec3 => norm(sub(b.p1, b.p0));
const angle = (a: Vec3, b: Vec3): number => Math.acos(Math.min(1, Math.max(-1, dot(a, b))));

function stdev(xs: number[]): number {
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
}

interface Run {
  /** 每根骨头的输入 / 输出长度序列（只收集中位数窗口填满之后的帧） */
  inLen: Record<string, number[]>;
  outLen: Record<string, number[]>;
  /** 全部骨头汇总的"相对标称长度的偏差"，用来看整体抑制比 */
  inDev: number[];
  outDev: number[];
  maxAngle: number;
}

/** 跑 frames 帧，顺带逐帧校验"只改长度不改方向"和 warmingUp */
function drive(jitter: Jitter, frames: number): Run {
  const st = createStabilizer();
  const r: Run = { inLen: {}, outLen: {}, inDev: [], outDev: [], maxAngle: 0 };
  for (let f = 0; f < frames; f++) {
    const sk = synth(f, jitter);
    const out = st.apply(sk, 1 / 30);

    assert.equal(out.bones.length, BONES.length, `第 ${f} 帧骨头数`);
    assert.equal(out.warmingUp, f < SKELETON.warmupFrames, `第 ${f} 帧 warmingUp`);

    for (let i = 0; i < out.bones.length; i++) {
      const ib = sk.bones[i];
      const ob = out.bones[i];
      assert.equal(ob.id, ib.id, '骨头顺序不许变');
      assert.ok(ob.p0.every(Number.isFinite) && ob.p1.every(Number.isFinite), `${ob.id} 端点有限`);
      assert.ok(Math.abs(ob.length - dist(ob.p0, ob.p1)) < 1e-12, `${ob.id} length 必须等于 |p1-p0|`);
      r.maxAngle = Math.max(r.maxAngle, angle(dirOf(ib), dirOf(ob)));

      if (f >= SKELETON.medianWindow) {
        (r.inLen[ib.id] ??= []).push(ib.length);
        (r.outLen[ob.id] ??= []).push(ob.length);
        r.inDev.push(ib.length - RIG[ib.id].len);
        r.outDev.push(ob.length - RIG[ob.id].len);
      }
    }
  }
  return r;
}

const rms = (xs: number[]): number => Math.sqrt(xs.reduce((s, x) => s + x * x, 0) / xs.length);

// ── 主验收 ──────────────────────────────────────────────────────────────────

test('T-04 主验收: 200 帧"呼吸"式 ±15% 抖动 → 每根骨头的骨长 std < 输入的 1/5，方向逐帧不变', () => {
  const r = drive(breathing(), 200);

  assert.ok(r.maxAngle < 1e-6, `方向被改动了：最大夹角 ${r.maxAngle} rad（只许改长度）`);

  let worst = 0;
  for (const [id] of BONES) {
    const si = stdev(r.inLen[id]);
    const so = stdev(r.outLen[id]);
    assert.ok(si > 0, `${id}: 输入本身没有抖动，这条测试就没意义了`);
    worst = Math.max(worst, so / si);
    assert.ok(so < si / 5, `${id}: 输出 std=${so.toFixed(5)} 未降到输入 std=${si.toFixed(5)} 的 1/5`);
  }
  assert.ok(worst < 0.2, `最差的骨头 std 比值 ${worst.toFixed(3)}`);
});

test('T-04 主验收（更凶的读法）: 200 帧白噪声 ±15% → 整体抖动量降到 1/5 以下', () => {
  // ⚠️ 为什么这条按"全部骨头汇总"判、而不是逐根判：
  //    90 帧滑动中位数对**独立均匀白噪声**的理论抑制比是 (b-a)/(2√n) ÷ (b-a)/√12 ≈ 0.18，
  //    本来就贴着 1/5；再加上窗口填满后只剩 110 帧、且相邻帧的中位数高度相关，
  //    单根骨头的经验 std 比值在不同种子下会在 0.16..0.29 之间摆。
  //    汇总 17 根 × 110 帧之后估计量才稳定（实测多种子 ≤ 0.19）。
  //    docs/04 §3 点名要治的是"呼吸"（周期性伸缩），上一条测的就是那个，抑制比 ~20×。
  const r = drive(whiteNoise(20260912), 200);
  assert.ok(r.maxAngle < 1e-6, `方向被改动了：最大夹角 ${r.maxAngle} rad`);

  const ratio = rms(r.outDev) / rms(r.inDev);
  assert.ok(ratio < 0.2, `白噪声下整体抖动只降到 ${ratio.toFixed(3)}，应 < 0.2`);

  for (const [id] of BONES) {
    const si = stdev(r.inLen[id]);
    const so = stdev(r.outLen[id]);
    assert.ok(so < si / 4, `${id}: 输出 std=${so.toFixed(5)} 相对输入 std=${si.toFixed(5)} 抑制不足 4×`);
  }
});

// ── 热身 / 透传 ─────────────────────────────────────────────────────────────

test('前 30 帧热身：warmingUp = true，长度原样透传，位置只差一次落地平移', () => {
  const st = createStabilizer();
  const jitter = whiteNoise(11);
  for (let f = 0; f < SKELETON.warmupFrames; f++) {
    const sk = synth(f, jitter);
    const out = st.apply(sk, 1 / 30);
    assert.equal(out.warmingUp, true, `第 ${f} 帧应该还在热身`);
    // §3.5 的重新落地在热身期也生效（输出契约是"永远贴地"，不分两种情况），
    // 所以端点允许整体差一个 Y 平移 —— 但**长度**必须逐位相同，这才是"透传"的含义。
    const shift = out.bones[0].p1[1] - sk.bones[0].p1[1];
    for (let i = 0; i < out.bones.length; i++) {
      assert.ok(Math.abs(out.bones[i].length - sk.bones[i].length) < 1e-12, '热身期必须原样透传长度');
      assert.ok(Math.abs(out.bones[i].p1[0] - sk.bones[i].p1[0]) < 1e-12, '热身期 X 不动');
      assert.ok(Math.abs(out.bones[i].p1[2] - sk.bones[i].p1[2]) < 1e-12, '热身期 Z 不动');
      assert.ok(Math.abs((out.bones[i].p1[1] - sk.bones[i].p1[1]) - shift) < 1e-12,
        '热身期 Y 只允许差同一个全局平移量');
    }
  }
  assert.equal(st.apply(synth(99, jitter), 1 / 30).warmingUp, false, '第 31 帧起退出热身');
});

test('热身结束后才真的改长度（证明它不是个空壳）', () => {
  const st = createStabilizer();
  const jitter = whiteNoise(3);
  let changed = 0;
  for (let f = 0; f < 120; f++) {
    const sk = synth(f, jitter);
    const out = st.apply(sk, 1 / 30);
    if (f < SKELETON.warmupFrames) continue;
    for (let i = 0; i < out.bones.length; i++) {
      if (Math.abs(out.bones[i].length - sk.bones[i].length) > 1e-6) changed++;
    }
  }
  assert.ok(changed > 1000, `稳定化几乎没改过长度（只改了 ${changed} 次）`);
});

test('reset() 清空中位数并重新进入热身', () => {
  const st = createStabilizer();
  const jitter = whiteNoise(5);
  for (let f = 0; f < 100; f++) st.apply(synth(f, jitter), 1 / 30);
  st.reset();
  const sk = synth(100, jitter);
  const out = st.apply(sk, 1 / 30);
  assert.equal(out.warmingUp, true);
  for (let i = 0; i < out.bones.length; i++) {
    assert.ok(Math.abs(out.bones[i].length - sk.bones[i].length) < 1e-12, 'reset 后应重新透传');
  }
});

// ── 前向运动学 ──────────────────────────────────────────────────────────────

test('前向运动学链完整：子骨的 p0 等于父骨的 p1，根关节保持测量位置', () => {
  const st = createStabilizer();
  const jitter = whiteNoise(99);
  let sk!: Skeleton;
  let out!: Skeleton;
  for (let f = 0; f < 100; f++) { sk = synth(f, jitter); out = st.apply(sk, 1 / 30); }

  const byId = new Map(out.bones.map((b) => [b.id, b]));
  const parentOf: Record<string, BoneId> = {};
  for (const [id, , child] of BONES) parentOf[child] = id;

  // §3.5 的重新落地是一次全局 Y 平移，用 pelvis 把它量出来
  const rootShift = out.joints.pelvis[1] - sk.joints.pelvis[1];

  for (const [id, a] of BONES) {
    const b = byId.get(id)!;
    const parent = parentOf[a];
    if (parent) {
      assert.ok(dist(b.p0, byId.get(parent)!.p1) < 1e-12, `${id}.p0 应等于父骨 ${parent}.p1`);
    } else {
      // pelvis / hipL / hipR：没有任何骨头指向它们，FK 不移动它们。
      // 但 §3.5 的重新落地会把整具骨架沿 Y 平移一次，所以这里只能断言
      // "除了那一次全局 Y 平移之外没被动过" —— X/Z 必须逐位相同。
      assert.ok(Math.abs(b.p0[0] - sk.joints[a][0]) < 1e-12, `根关节 ${a} 的 X 不应被动`);
      assert.ok(Math.abs(b.p0[2] - sk.joints[a][2]) < 1e-12, `根关节 ${a} 的 Z 不应被动`);
      const shift = b.p0[1] - sk.joints[a][1];
      assert.ok(Math.abs(shift - rootShift) < 1e-12, `根关节 ${a} 的 Y 位移必须与其它根关节一致（同一次落地平移）`);
    }
  }
  for (const [id, , child] of BONES) {
    assert.ok(dist(out.joints[child], byId.get(id)!.p1) < 1e-12, `joints.${child} 与骨头端点不一致`);
  }
});

// ── P2 降级 ────────────────────────────────────────────────────────────────

test('P2：NaN / 零长 / 空骨架 / 坏 dt 都不产生 NaN', () => {
  const st = createStabilizer(90, 2);
  const jitter = whiteNoise(77);
  for (let f = 0; f < 60; f++) {
    const sk = synth(f, jitter);
    if (f % 3 === 0) {
      sk.bones[4] = { ...sk.bones[4], p0: [NaN, 0, 0], p1: [0, Infinity, 0], length: NaN };
      sk.bones[9] = { ...sk.bones[9], p1: clone(sk.bones[9].p0), length: 0 };   // 零长（关节缺失）
    }
    const out = st.apply(sk, f % 7 === 0 ? NaN : 1 / 30);
    for (const b of out.bones) {
      assert.ok(b.p0.every(Number.isFinite), `${b.id} p0=${JSON.stringify(b.p0)}`);
      assert.ok(b.p1.every(Number.isFinite), `${b.id} p1=${JSON.stringify(b.p1)}`);
      assert.ok(Number.isFinite(b.length) && b.length >= 0, `${b.id} length=${b.length}`);
    }
    for (const [k, p] of Object.entries(out.joints)) {
      assert.ok(p.every(Number.isFinite), `关节 ${k}=${JSON.stringify(p)}`);
    }
  }
  const empty = st.apply({ bones: [], joints: {}, height: 1.7, warmingUp: false, t: 0 }, 1 / 30);
  assert.equal(empty.bones.length, 0);
});

test('零长骨头不会被凭空塞一个方向（不许朝 +Y 弹出去）', () => {
  const st = createStabilizer(90, 0);
  const jitter = whiteNoise(42);
  for (let f = 0; f < 120; f++) {
    const sk = synth(f, jitter);
    const i = sk.bones.findIndex((b) => b.id === 'footL');   // 脚尖始终看不见
    sk.bones[i] = { ...sk.bones[i], p1: clone(sk.bones[i].p0), length: 0 };
    const out = st.apply(sk, 1 / 30);
    const foot = out.bones.find((b) => b.id === 'footL')!;
    assert.ok(dist(foot.p0, foot.p1) < 1e-12, `零长骨头被改出了长度：${dist(foot.p0, foot.p1)}`);
  }
});

test('输入骨架不被就地修改（apply 返回新对象）', () => {
  const st = createStabilizer(90, 1);
  const jitter = whiteNoise(8);
  for (let f = 0; f < 50; f++) {
    const sk = synth(f, jitter);
    const before = sk.bones.map((b) => b.length);
    const snapshot = sk.bones.map((b) => clone(b.p1));
    const out = st.apply(sk, 1 / 30);
    assert.notEqual(out, sk, 'apply 应返回新的 Skeleton');
    assert.notEqual(out.bones, sk.bones);
    sk.bones.forEach((b, i) => {
      assert.equal(b.length, before[i], '输入的 length 被改了');
      assert.ok(dist(b.p1, snapshot[i]) < 1e-15, '输入的端点被改了');
    });
  }
});

test('重建之后重新落地：每一帧最低的脚都在 y=0（docs/04 §3.5）', () => {
  // 骨长换成中位数后，腿链累积的长度差会让脚离地或陷地几厘米 —— 现场表现为影子不贴地。
  // 没有 §3.5 这一步，下面的 worst 会是厘米级而不是 1e-9。
  const st = createStabilizer();
  const jitter = breathing(0.15);
  let worst = 0;
  for (let f = 0; f < 240; f++) {
    const out = st.apply(synth(f, jitter), 1 / 60);
    const y = Math.min(
      out.joints.footIdxL?.[1] ?? Infinity, out.joints.footIdxR?.[1] ?? Infinity,
      out.joints.ankleL?.[1] ?? Infinity, out.joints.ankleR?.[1] ?? Infinity,
    );
    worst = Math.max(worst, Math.abs(y));
    // 骨头端点必须跟着一起平移，否则骨头和关节会对不上
    for (const b of out.bones) assert.ok(Number.isFinite(b.p0[1]) && Number.isFinite(b.p1[1]));
  }
  assert.ok(worst < 1e-9, `最低脚最大偏离 y=0 达 ${worst}`);
});
