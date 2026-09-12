import test from 'node:test';
import assert from 'node:assert/strict';
import { attachMatrix } from '../src/attach.ts';
import { applyMat4, identity } from '../src/vec.ts';
import { mulberry32 } from '../src/rng.ts';
import type { Bone, Vec3 } from '../src/types.ts';

const bone = (p0: Vec3, p1: Vec3, roll = 0): Bone => ({
  id: 'spine', p0, p1, length: Math.hypot(p1[0]-p0[0], p1[1]-p0[1], p1[2]-p0[2]), roll, confidence: 1,
});
const near = (a: Vec3, b: Vec3, eps = 1e-6) => {
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(a[i]-b[i]) < eps, `${a} vs ${b}`);
};

test('单位骨头 → 单位阵', () => {
  const m = attachMatrix(bone([0,0,0],[0,1,0]), identity());
  near(applyMat4(m, [0,0,0]), [0,0,0]);
  near(applyMat4(m, [0,1,0]), [0,1,0]);
});

test('核心不变式: socketA→p0, socketB→p1', () => {
  const rng = mulberry32(7);
  for (let i = 0; i < 1000; i++) {
    const p0: Vec3 = [rng.next()*4-2, rng.next()*4-2, rng.next()*4-2];
    const p1: Vec3 = [rng.next()*4-2, rng.next()*4-2, rng.next()*4-2];
    const m = attachMatrix(bone(p0, p1), identity());
    near(applyMat4(m, [0,0,0]), p0, 1e-5);
    near(applyMat4(m, [0,1,0]), p1, 1e-5);
    assert.ok(m.every(Number.isFinite), 'matrix finite');
  }
});

test('退化: 骨头朝向 -Y（人倒立）', () => {
  const m = attachMatrix(bone([1,2,3],[1,1,3]), identity());
  assert.ok(m.every(Number.isFinite));
  near(applyMat4(m, [0,0,0]), [1,2,3], 1e-6);
  near(applyMat4(m, [0,1,0]), [1,1,3], 1e-6);
});

test('退化: 零长骨头不产生 NaN', () => {
  const b: Bone = { id: 'spine', p0: [1,1,1], p1: [1,1,1], length: 0, roll: 0, confidence: 0 };
  const m = attachMatrix(b, identity());
  assert.ok(m.every(Number.isFinite));
});

test('退化: NaN / Infinity 输入被净化', () => {
  const b: Bone = { id: 'spine', p0: [NaN,0,0], p1: [0,Infinity,0], length: NaN, roll: NaN, confidence: 1 };
  const m = attachMatrix(b, identity());
  assert.ok(m.every(Number.isFinite), JSON.stringify(m));
});

test('girth 只影响横向，不影响端点', () => {
  const m = attachMatrix(bone([0,0,0],[0,2,0]), identity(), { girth: 3 });
  near(applyMat4(m, [0,1,0]), [0,2,0]);
  near(applyMat4(m, [1,0,0]), [3,0,0]);
});

test('mirror 翻转 X，不影响端点', () => {
  const m = attachMatrix(bone([0,0,0],[0,2,0]), identity(), { girth: 1, mirror: true });
  near(applyMat4(m, [0,1,0]), [0,2,0]);
  near(applyMat4(m, [1,0,0]), [-1,0,0]);
});

test('uniform 模式: 尺寸由 girth 决定，与骨长无关', () => {
  const b = bone([0,0,0],[0,0.15,0]);           // 很短的颈骨
  const m = attachMatrix(b, identity(), { girth: 0.4, mode: 'uniform' });
  near(applyMat4(m, [0,0,0]), [0,0,0]);
  near(applyMat4(m, [0,1,0]), [0,0.4,0]);       // 不是 0.15 —— 头不该被颈骨压扁
  near(applyMat4(m, [1,0,0]), [0.4,0,0]);
});

test('stretch 模式（默认）仍然拉到骨长', () => {
  const b = bone([0,0,0],[0,0.15,0]);
  const m = attachMatrix(b, identity(), { girth: 0.4 });
  near(applyMat4(m, [0,1,0]), [0,0.15,0]);
});

// ── 脚那条路：axisLength + anchor（见 tuning.ts 的 FOOT） ────────────────────

test('axisLength 覆盖长轴尺寸，两种 mode 下都生效', () => {
  const b = bone([0,0,0],[0,0.17,0]);                 // 骨长 0.17，girth 0.4
  for (const mode of ['stretch', 'uniform'] as const) {
    const m = attachMatrix(b, identity(), { girth: 0.4, mode, axisLength: 0.25 });
    near(applyMat4(m, [0,1,0]), [0,0.25,0]);          // 不是 0.17，也不是 0.4
    near(applyMat4(m, [1,0,0]), [0.4,0,0]);           // 横向仍然是 girth
  }
});

test('anchor 把部件沿骨头方向倒退，p0 落在长轴的 anchor 处', () => {
  // 一根水平的"脚骨"：踝在原点，脚尖朝 +Z
  const b = bone([0,0,0],[0,0,0.17]);
  const m = attachMatrix(b, identity(), { girth: 0.4, mode: 'uniform', axisLength: 0.25, anchor: 0.3 });
  near(applyMat4(m, [0,0,0]), [0,0,-0.075], 1e-6);    // 脚跟尖：踝后面 0.3×0.25
  near(applyMat4(m, [0,1,0]), [0,0,0.175], 1e-6);     // 脚尖：踝前面 0.7×0.25
});

test('anchor 缺省 / 越界都不改变老行为', () => {
  const b = bone([1,2,3],[1,3,3]);
  for (const anchor of [undefined, 0, NaN, -5]) {
    const m = attachMatrix(b, identity(), { anchor });
    near(applyMat4(m, [0,0,0]), [1,2,3], 1e-6);
  }
});
