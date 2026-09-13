/**
 * 团块也要站在地面上 —— 而且**量的是真的被三角化出来的那个等值面**。
 *
 * ## 它补的是哪一个洞
 *
 * `assemble()` 那条路已经落地了（`core/ground.ts` + `creature/assemble.ts`），
 * 但 `mass.ts` 的身体**根本不走 `assemble()`**：它一个槽位件都不实例化，
 * 整具身体是一个 MarchingCubes 等值面。于是团块（`coral` / `char.dumpling` /
 * `char.ghost`，以及每一个人的 tier 0 开场形态 `nascent.ts`）从落地那天起
 * 就一直沉在地板下面 —— 沉的量约等于脚那一段的球半径，再加上相邻球融合时
 * 表面自己胖出来的那一圈（`MASS.radiusScale` 的注释写着这件事）。
 *
 * ## 为什么不量 AABB、也不量球心
 *
 * 球心 + 半径是**估计**：融合会让表面胖出球半径之外，而胖多少取决于
 * 相邻球的间距与 isolation，不是一个能写下来的数。
 * `MarchingCubes.update()` 之后，geometry 里躺着的是这一帧**真的要画的顶点**，
 * 量它才是量那个 artefact 本身（P21 第 1 条：量成品，不量标记）。
 *
 * ## `Mesh.count` 那个坑
 *
 * 这里**故意不读 `mc.count`**（`mass.ts` 文件头 §3：three 把它当实例数、
 * 这个 addon 把它当顶点数）。测试读的是 `geometry.drawRange.count` ——
 * 渲染器真正会画的那一段，和 `mass-instancing.test.ts` 钉住的是同一个数。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { BONES } from '../../core/src/skeleton.ts';
import type { Bone, BoneId, Presence, Skeleton, Vec3 } from '../../core/src/types.ts';
import { createMassBody } from '../src/creature/mass.ts';

const presence: Presence = { state: 'ALIVE', elapsed: 999, transition: 1 };

/** 参考站姿，**脚已经按骨架规矩落过地**（最低的脚尖正好在 y=0） */
const POSE: Record<string, Vec3> = {
  pelvis: [0, 0.95, 0], chest: [0, 1.35, 0], neck: [0, 1.45, 0], headCenter: [0, 1.60, 0],
  shoulderL: [0.19, 1.38, 0], elbowL: [0.33, 1.10, 0.02], wristL: [0.44, 0.86, 0.04], handTipL: [0.48, 0.77, 0.05],
  shoulderR: [-0.19, 1.38, 0], elbowR: [-0.33, 1.10, 0.02], wristR: [-0.44, 0.86, 0.04], handTipR: [-0.48, 0.77, 0.05],
  hipL: [0.09, 0.93, 0], kneeL: [0.10, 0.51, 0.01], ankleL: [0.10, 0.06, 0], footIdxL: [0.10, 0, 0.16],
  hipR: [-0.09, 0.93, 0], kneeR: [-0.10, 0.51, 0.01], ankleR: [-0.10, 0.06, 0], footIdxR: [-0.10, 0, 0.16],
};
/**
 * 由关节表直接搭一具骨架。
 *
 * **故意不走 `buildSkeleton()`**：它的关节置信度来自 MediaPipe landmark，
 * 不喂 landmark 就全是 0，而 `mass.ts` 会把 `confidence ≤ 0.02` 的骨头跳过 ——
 * 那样撒出来是 0 个球，这条测试就量了个空气（第一版真的这样，红得莫名其妙）。
 */
function skeletonOf(joints: Record<string, Vec3>): Skeleton {
  const bones: Bone[] = BONES.map(([id, a, b]) => {
    const p0 = joints[a], p1 = joints[b];
    return {
      id: id as BoneId, p0: [...p0] as Vec3, p1: [...p1] as Vec3,
      length: Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]),
      roll: 0, confidence: 1,
    };
  });
  const height = Math.max(...Object.values(joints).map((p) => p[1]));
  return { bones, joints, height, warmingUp: false, t: 0 };
}

const standing = (): Skeleton => skeletonOf(POSE);

/**
 * 这一帧的等值面在**世界坐标**里的最低点。
 *
 * 场景图里那个 Mesh 共用 MarchingCubes 的 geometry，局部空间是 [-1,1]³，
 * 世界 = position + local × scale —— 和渲染器做的是同一件事，
 * 但**故意自己算一遍**，不调用被测代码里的任何一行（否则是拿它验证它自己）。
 */
function lowestRenderedPoint(object: THREE.Object3D): number {
  const mesh = object.children.find((o) => (o as THREE.Mesh).isMesh) as THREE.Mesh;
  assert.ok(mesh, '团块必须有一个可画的网格');
  const attr = mesh.geometry.getAttribute('position');
  const n = Math.min(mesh.geometry.drawRange.count, attr.count);
  assert.ok(n > 0, '这一帧一个顶点都没有 —— 测试量了个空气');
  let lo = Infinity;
  for (let i = 0; i < n; i++) {
    const y = mesh.position.y + attr.getY(i) * mesh.scale.y;
    if (y < lo) lo = y;
  }
  return lo;
}

test('mass: 团块的等值面最低点站在 y=0 上 —— 不是球心，是真的三角化出来的面', () => {
  const body = createMassBody({});
  const sk = standing();
  for (let i = 0; i < 3; i++) body.pose(sk, presence, 1 / 60);

  const lo = lowestRenderedPoint(body.object);
  assert.ok(
    Math.abs(lo) < 1e-6,
    `等值面最低点在 ${lo.toFixed(4)}m。负数 = 整具身体陷在地板里（团块从落地那天起就这样，` +
    '因为它根本不走 assemble()，而 assemble() 才是网格落地的那条路）',
  );

  // 抬升是 stats 里的一个数，不是"我们相信它抬了" —— HUD 和取证都读得到它
  assert.ok(body.stats.lift > 0.005, `团块本来就该是沉着的，抬升应当为正，实际 ${body.stats.lift}`);
  body.dispose();
});

test('mass: 人蹲下时团块仍然贴地（抬升随姿态变，不是一个存起来的常数）', () => {
  const body = createMassBody({});
  const crouch = skeletonOf({
    ...POSE,
    pelvis: [0, 0.55, 0], chest: [0, 0.95, 0], neck: [0, 1.05, 0], headCenter: [0, 1.20, 0],
    hipL: [0.09, 0.53, 0], hipR: [-0.09, 0.53, 0],
    kneeL: [0.12, 0.35, 0.18], kneeR: [-0.12, 0.35, 0.18],
    shoulderL: [0.19, 0.98, 0], shoulderR: [-0.19, 0.98, 0],
    elbowL: [0.30, 0.75, 0.05], elbowR: [-0.30, 0.75, 0.05],
    wristL: [0.36, 0.52, 0.10], wristR: [-0.36, 0.52, 0.10],
    handTipL: [0.38, 0.45, 0.12], handTipR: [-0.38, 0.45, 0.12],
  });
  for (let i = 0; i < 3; i++) body.pose(crouch, presence, 1 / 60);

  const lo = lowestRenderedPoint(body.object);
  assert.ok(Math.abs(lo) < 1e-6, `蹲姿下等值面最低点在 ${lo.toFixed(4)}m`);
  body.dispose();
});

test('mass: 进出场那几帧不把化开的团块往地上拽', () => {
  const body = createMassBody({});
  const sk = standing();
  for (let i = 0; i < 3; i++) body.pose(sk, presence, 1 / 60);
  const alive = (body.object.children[0] as THREE.Mesh).position.y;
  assert.ok(body.stats.lift > 0.005, '前提：满在场时团块确实被抬起来了，否则下面冻结的是 0');

  // LEAVING 中段：物质向质心收回去，最低点自然离地 —— 这时把它按回地面
  // 就成了"一边化开一边往下掉"，那不是设计
  body.pose(sk, { state: 'LEAVING', elapsed: 1, transition: 0.5 }, 1 / 60);
  const leaving = (body.object.children[0] as THREE.Mesh).position.y;
  assert.ok(
    Math.abs(leaving - alive) < 1e-9,
    `化开途中团块的世界位置被改了（${alive} → ${leaving}）—— 抬升应当冻结在最后一帧满在场的值`,
  );
  body.dispose();
});
