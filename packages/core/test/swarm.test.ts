/**
 * 点场（`core/src/swarm.ts`）的两件纯事：点怎么撒、点云的底在哪里。
 *
 * **为什么只测这两件**：渲染那一半（公告牌、运动历史环、顶点着色器）要一个
 * WebGPU 上下文才跑得起来，在 CI 上断言它等于断言显卡 —— 那是 `docs/18 §7`
 * 明确交给取证截图的那一层。这里测的是"点在哪里"，那是确定性的、可复现的、
 * 而且**恰好是两个已经在这个仓库里出过两次的 bug 的落点**（落地、随机不可复现）。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { ALL_BONE_IDS, SLOT_OF_BONE } from '../src/slots.ts';
import { jitterRadiusOf, lowestSwarmY, placeSwarmPoints } from '../src/swarm.ts';
import { SLOT_WIDTH, SWARM } from '../src/tuning.ts';
import type { Bone, Vec3 } from '../src/types.ts';

/** 一副"每根骨头都是一段竖直线段"的假骨架，长度与下标一致，方便算期望 */
function fakeBones(lengths: readonly number[], baseY = 0): Bone[] {
  return ALL_BONE_IDS.map((id, i) => {
    const L = lengths[i] ?? 0;
    const p0: Vec3 = [0, baseY, 0];
    const p1: Vec3 = [0, baseY + L, 0];
    return { id, p0, p1, length: L, roll: 0, confidence: 1 };
  });
}

const UNIFORM = ALL_BONE_IDS.map(() => 0.3);

// ── 撒点 ────────────────────────────────────────────────────────────────────

test('撒点：数量精确，字段都在合法区间', () => {
  const pts = placeSwarmPoints(500, UNIFORM, 1234);
  assert.equal(pts.length, 500);
  for (const p of pts) {
    assert.ok(Number.isInteger(p.bone) && p.bone >= 0 && p.bone < ALL_BONE_IDS.length, `bone=${p.bone}`);
    assert.ok(p.t >= 0 && p.t <= 1, `t=${p.t}`);
    assert.ok(p.lag >= 0 && p.lag <= 1, `lag=${p.lag}`);
    assert.ok(p.phase >= 0 && p.phase <= 1);
    assert.ok(p.size > 0.5 && p.size < 1.5);
    const r = jitterRadiusOf(p.bone);
    assert.ok(Math.abs(p.jitter[0]) <= r + 1e-9);
    assert.ok(Math.abs(p.jitter[1]) <= r * SWARM.jitterAlong + 1e-9);
    assert.ok(Math.abs(p.jitter[2]) <= r + 1e-9);
  }
});

test('撒点：同一个 seed 给出同一片点（P1 —— 截图能复现）', () => {
  const a = placeSwarmPoints(200, UNIFORM, 7);
  const b = placeSwarmPoints(200, UNIFORM, 7);
  const c = placeSwarmPoints(200, UNIFORM, 8);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('撒点：按骨长加权 —— 两倍长的骨头拿到约两倍的点', () => {
  const lengths = ALL_BONE_IDS.map((_, i) => (i === 0 ? 0.6 : 0.3));
  const pts = placeSwarmPoints(20_000, lengths, 42);
  const n0 = pts.filter((p) => p.bone === 0).length;
  const n1 = pts.filter((p) => p.bone === 1).length;
  // 期望比例 2.0；20k 个样本下 ±12% 的带足够宽，不会偶发红
  assert.ok(n1 > 0);
  const ratio = n0 / n1;
  assert.ok(ratio > 1.76 && ratio < 2.24, `比例 ${ratio.toFixed(3)} 不在 2±12%`);
});

test('撒点：延迟压向"现在" —— 多数点贴着当下，少数拖在后面', () => {
  const pts = placeSwarmPoints(20_000, UNIFORM, 99);
  const near = pts.filter((p) => p.lag < 0.25).length / pts.length;
  const far = pts.filter((p) => p.lag > 0.75).length / pts.length;
  // lagCurve = 2.4 ⇒ P(lag<0.25) = 0.25^(1/2.4) ≈ 0.56，P(lag>0.75) ≈ 1-0.75^(1/2.4) ≈ 0.115
  assert.ok(near > 0.45, `贴着当下的只有 ${(near * 100).toFixed(1)}%，形会被糊掉`);
  assert.ok(far < 0.25 && far > 0.02, `拖在后面的占 ${(far * 100).toFixed(1)}%`);
  assert.ok(near > far * 2, '延迟分布必须偏向"现在"，均匀分布读作运动模糊而不是"只剩运动"');
});

test('撒点：骨长全是 0 / NaN 时退回等权，而不是产出 NaN 或空表（P2/P3）', () => {
  const zero = placeSwarmPoints(300, ALL_BONE_IDS.map(() => 0), 5);
  assert.equal(zero.length, 300);
  assert.ok(zero.every((p) => Number.isFinite(p.t) && Number.isInteger(p.bone)));
  const nan = placeSwarmPoints(300, ALL_BONE_IDS.map(() => Number.NaN), 5);
  assert.equal(nan.length, 300);
  assert.ok(nan.every((p) => Number.isFinite(p.jitter[0])));
  assert.equal(placeSwarmPoints(0, UNIFORM, 1).length, 0);
});

// ── 落地 ────────────────────────────────────────────────────────────────────

test('落地：点云的底比骨架的底更低 —— 这就是这一步非有不可的理由', () => {
  // 骨架那一层只保证最低的**关节**在 y=0。点撒在骨头周围，所以云的底在 0 以下。
  const bones = fakeBones(UNIFORM, 0);
  const pts = placeSwarmPoints(2000, UNIFORM, 3);
  const lo = lowestSwarmY(pts, bones, 1);
  assert.ok(lo !== null);
  assert.ok(lo! < 0, `点云最低点 ${lo} 不在地板以下 —— 那说明抖动没生效`);
  // 而且它不会比"最粗那根骨头的抖动半径"更低 —— 量的是点，不是一个随手的负数
  const maxJit = Math.max(...ALL_BONE_IDS.map((id) => SLOT_WIDTH[SLOT_OF_BONE[id]] * 0.5 * SWARM.jitterScale * SWARM.jitterAlong));
  assert.ok(lo! > -maxJit - 1e-9, `${lo} 低于包络下界 ${-maxJit}`);
});

test('落地：抬升之后最低点正好落在 y=0（这是一条恒等式，不是一个愿望）', () => {
  const bones = fakeBones(UNIFORM, 0);
  const pts = placeSwarmPoints(2000, UNIFORM, 3);
  const lo = lowestSwarmY(pts, bones, 1)!;
  const lifted = fakeBones(UNIFORM, -lo);
  assert.ok(Math.abs(lowestSwarmY(pts, lifted, 1)!) < 1e-9);
});

test('落地：抖动跟着身材缩 —— 小孩的点云不该按成年人的厚度沉下去', () => {
  const bones = fakeBones(UNIFORM, 0);
  const pts = placeSwarmPoints(2000, UNIFORM, 3);
  const big = lowestSwarmY(pts, bones, 1)!;
  const small = lowestSwarmY(pts, bones, 0.5)!;
  assert.ok(small > big, '身材减半，点云的底应该更靠近地面');
  // 下界是精确的：min 是一族 `骨头高度 + 抖动·s` 的下包络，对 s 是凹的，
  // 而 s=0 时最低点不可能低于骨架本身（这里的假骨架底在 y=0）⇒ min(0.5) ≥ 0.5·min(1)。
  // 上界给一条宽带就够 —— 要钉的是"抖动真的跟着缩了"，不是某一个点的身份。
  assert.ok(small >= big * 0.5 - 1e-9, `${small} 低于凹性给出的下界 ${big * 0.5}`);
  assert.ok(small < big * 0.35, `${small} 几乎没缩 —— bodyScale 没有作用在抖动上`);
});

test('落地：量不出来时返回 null，不是 0（0 是一个合法高度）', () => {
  assert.equal(lowestSwarmY([], fakeBones(UNIFORM), 1), null);
  assert.equal(lowestSwarmY(placeSwarmPoints(10, UNIFORM, 1), [], 1), null);
});

test('落地：一根骨头冲飞（NaN）只跳过它，不让整片点消失（P2）', () => {
  const bones = fakeBones(UNIFORM, 0);
  const pts = placeSwarmPoints(2000, UNIFORM, 3);
  const good = lowestSwarmY(pts, bones, 1)!;
  const broken = bones.map((b, i) => (i === 3 ? { ...b, p0: [0, Number.NaN, 0] as Vec3 } : b));
  const got = lowestSwarmY(pts, broken, 1);
  assert.ok(got !== null && Number.isFinite(got), '一根坏骨头不该把整个结果变成 null/NaN');
  assert.ok(got >= good - 1e-9);
});
