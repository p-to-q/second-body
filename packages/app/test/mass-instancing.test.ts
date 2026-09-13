import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { ALL_BONE_IDS } from '../../core/src/slots.ts';
import { MASS } from '../../core/src/tuning.ts';
import type { Bone, Presence, Skeleton } from '../../core/src/types.ts';
import { createMassBody } from '../src/creature/mass.ts';

/**
 * 团块渲染器的**实例数**回归。
 *
 * 背景（`creature/mass.ts` 文件头 §3）：`Mesh.count` 是 three 自己的实例数字段，
 * 而 `MarchingCubes` 这个 addon 把同一个字段当"这一帧写了多少顶点"在用。
 * `three/webgpu` 取实例数时只看字段名，于是 MarchingCubes 一旦进场景图，
 * 2k 面的身体每帧被实例化几千份 —— 1 个 draw call、1200 万面、~100ms。
 *
 * **为什么测这个而不是测帧率**：帧率断言在 CI 上必然不稳（没有 GPU、跑在共享机器上）。
 * "场景图里那个对象的实例数是不是 1" 是同一件事的**确定性**表述 ——
 * 它为真时上面那条路就不可能重新出现，而且在任何机器上答案都一样。
 */

const presence: Presence = { state: 'ALIVE', elapsed: 999, transition: 1 };

/** 一副够用的直立骨架：只要每根骨头有长度、能落进场盒就行 */
function makeSkeleton(): Skeleton {
  const bones: Bone[] = ALL_BONE_IDS.map((id, i) => ({
    id,
    p0: [0, 0.9 + i * 0.01, 0],
    p1: [0.02, 1.0 + i * 0.01, 0],
    length: 0.1,
    roll: 0,
    confidence: 1,
  }));
  return { bones, joints: {}, height: 1.7, warmingUp: false, t: 0 };
}

test('mass: 场景图里没有 MarchingCubes 本体，实例数恒为 1', () => {
  const body = createMassBody({});
  const sk = makeSkeleton();
  for (let i = 0; i < 3; i++) body.pose(sk, presence, 1 / 60);

  const drawn: THREE.Object3D[] = [];
  body.object.traverse((o) => { if ((o as THREE.Mesh).isMesh) drawn.push(o); });
  assert.ok(drawn.length > 0, '团块至少要有一个可画的网格，否则这条用例什么也没盯住');

  for (const o of drawn) {
    // 这两条是同一件事的两面：MarchingCubes 不进场景图 ⇒ count 不会被改写成顶点数
    assert.equal(
      (o as { isMarchingCubes?: boolean }).isMarchingCubes, undefined,
      'MarchingCubes 本体不许进场景图：它会把 Mesh.count 写成顶点数，' +
      '而 three/webgpu 照字段名把它读作实例数',
    );
    assert.equal(
      (o as THREE.Mesh).count, 1,
      `场景图里 ${o.name || o.type} 的实例数必须是 1；` +
      '不是 1 就说明整具身体每帧被画了这么多遍（见 mass.ts 文件头 §3）',
    );
  }

  body.dispose();
});

test('mass: 自报的三角数就是真正要画的那些（drawRange 收得住）', () => {
  const body = createMassBody({});
  const sk = makeSkeleton();
  for (let i = 0; i < 3; i++) body.pose(sk, presence, 1 / 60);

  const mesh = body.object.children.find((o) => (o as THREE.Mesh).isMesh) as THREE.Mesh;
  const drawRange = mesh.geometry.drawRange;
  assert.equal(
    drawRange.count, body.stats.triangles * 3,
    'HUD 上的三角数必须等于 drawRange 真正覆盖的顶点数 / 3 —— ' +
    '缓冲区是按 maxPolyCount 开的（远大于实际），读错就会把"少画了"读成"画完了"',
  );
  assert.ok(
    drawRange.count < mesh.geometry.getAttribute('position').count,
    'drawRange 必须比缓冲区小：等于缓冲区说明 setDrawRange 没生效，整块空缓冲都在被画',
  );

  body.dispose();
});

test('mass: 这条回归盯的是 three 的真实行为，不是我们自己的假设', () => {
  // 如果哪天 three 改了 MarchingCubes 或改了实例数的取法，这条会先红 ——
  // 那时上面两条的理由就需要重写，而不是把它们删掉了事。
  const mc = new MarchingCubes(16, new THREE.MeshBasicMaterial() as unknown as THREE.Material,
    false, false, MASS.maxPolyCount);
  assert.equal(new THREE.Mesh().count, 1, 'Mesh.count 仍然是 three 的实例数字段，默认 1');
  mc.addBall(0.5, 0.5, 0.5, 6, 20);
  mc.update();
  assert.ok(
    (mc as unknown as { count: number }).count > 1,
    'MarchingCubes 仍然把顶点数写进 Mesh.count —— 冲突还在，所以它仍然不能进场景图',
  );
});
