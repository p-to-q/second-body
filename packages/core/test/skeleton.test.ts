import test from 'node:test';
import assert from 'node:assert/strict';
import { BONES, LM, MIRROR_X, buildSkeleton, mediapipeToWorld } from '../src/skeleton.ts';
import { dist } from '../src/vec.ts';
import { SKELETON } from '../src/tuning.ts';
import type { Landmark, RawPose, Skeleton, Vec3 } from '../src/types.ts';

// ─────────────────────────────────────────────────────────────────────────────
// 合成输入：用"身体语义"描述一个姿势，再按 docs/04 §1 的约定翻译成 MediaPipe 坐标。
//
//   side = 被摄者自己的左侧为正      up = 向上为正      fwd = 朝相机（观众）为正
//
// docs/04 §1：MediaPipe 是 +X 图像右、+Y 下、+Z 朝相机后方。
// 人正对相机时，**被摄者的左半边出现在图像右侧** → 左侧 = +mp.x。
// 这条"标签 ↔ 图像侧"的对应正是 docs/04 §1 标注"待实测确认"的部分：
// 实测若相反，改 MP_LEFT_SIGN 与 skeleton.ts 的 MIRROR_X，本文件其余断言不用动。
const MP_LEFT_SIGN = 1;

interface Node { side: number; up: number; fwd?: number; vis?: number }

const FILLER: Landmark = { x: 0, y: 0, z: 0, visibility: 0 };

function toRaw(nodes: Record<number, Node>, t = 0): RawPose {
  const world: Landmark[] = [];
  for (let i = 0; i < 33; i++) {
    const n = nodes[i];
    world[i] = n
      ? {
          x: MP_LEFT_SIGN * n.side,
          y: -n.up,
          z: -(n.fwd ?? 0),
          visibility: n.vis ?? 1,
        }
      : { ...FILLER };
  }
  return { world, score: 1, t };
}

/** 标准 T-pose，胯中点为原点。最低点（脚跟/脚尖）在 up = -0.90。 */
function tPose(): Record<number, Node> {
  return {
    [LM.NOSE]: { side: 0, up: 0.70, fwd: 0.10 },
    [LM.L_EAR]: { side: 0.075, up: 0.72 },
    [LM.R_EAR]: { side: -0.075, up: 0.72 },
    [LM.L_SHOULDER]: { side: 0.19, up: 0.50 },
    [LM.R_SHOULDER]: { side: -0.19, up: 0.50 },
    [LM.L_ELBOW]: { side: 0.47, up: 0.50 },
    [LM.R_ELBOW]: { side: -0.47, up: 0.50 },
    [LM.L_WRIST]: { side: 0.72, up: 0.50 },
    [LM.R_WRIST]: { side: -0.72, up: 0.50 },
    [LM.L_PINKY]: { side: 0.84, up: 0.49 },
    [LM.R_PINKY]: { side: -0.84, up: 0.49 },
    [LM.L_INDEX]: { side: 0.86, up: 0.50 },
    [LM.R_INDEX]: { side: -0.86, up: 0.50 },
    [LM.L_HIP]: { side: 0.09, up: 0 },
    [LM.R_HIP]: { side: -0.09, up: 0 },
    [LM.L_KNEE]: { side: 0.09, up: -0.45 },
    [LM.R_KNEE]: { side: -0.09, up: -0.45 },
    [LM.L_ANKLE]: { side: 0.09, up: -0.87 },
    [LM.R_ANKLE]: { side: -0.09, up: -0.87 },
    [LM.L_HEEL]: { side: 0.09, up: -0.90, fwd: -0.05 },
    [LM.R_HEEL]: { side: -0.09, up: -0.90, fwd: -0.05 },
    [LM.L_FOOT]: { side: 0.09, up: -0.90, fwd: 0.14 },
    [LM.R_FOOT]: { side: -0.09, up: -0.90, fwd: 0.14 },
  };
}

const build = (raw: RawPose): Skeleton =>
  buildSkeleton(mediapipeToWorld(raw), raw.world, raw.t);

const boneOf = (sk: Skeleton, id: string) => {
  const b = sk.bones.find((x) => x.id === id);
  assert.ok(b, `缺少骨头 ${id}`);
  return b;
};

function assertAllFinite(sk: Skeleton, what: string): void {
  assert.equal(sk.bones.length, BONES.length, `${what}: 骨头数`);
  for (const b of sk.bones) {
    for (const p of [b.p0, b.p1] as Vec3[]) {
      assert.ok(p.every(Number.isFinite), `${what}: ${b.id} 端点 ${JSON.stringify(p)}`);
    }
    assert.ok(Number.isFinite(b.length) && b.length >= 0, `${what}: ${b.id} length=${b.length}`);
    assert.ok(Number.isFinite(b.confidence), `${what}: ${b.id} confidence`);
    assert.equal(b.roll, 0, `${what}: ${b.id} roll 必须为 0（docs/04 §5）`);
  }
  for (const [k, p] of Object.entries(sk.joints)) {
    assert.ok(p.every(Number.isFinite), `${what}: 关节 ${k} = ${JSON.stringify(p)}`);
  }
  assert.ok(Number.isFinite(sk.height) && sk.height > 0, `${what}: height=${sk.height}`);
  assert.ok(Number.isFinite(sk.t), `${what}: t`);
}

// ── (a) 合成 T-pose → 17 根骨头全部有限、长度 > 0 ─────────────────────────────

test('(a) T-pose → 17 根骨头全部有限、长度 > 0、顺序与 BONES 一致', () => {
  const sk = build(toRaw(tPose(), 1234));
  assertAllFinite(sk, 'T-pose');
  assert.equal(sk.bones.length, 17);
  BONES.forEach(([id], i) => assert.equal(sk.bones[i].id, id, `第 ${i} 根应为 ${id}`));
  for (const b of sk.bones) {
    assert.ok(b.length > 0, `${b.id} 长度必须 > 0，实际 ${b.length}`);
    assert.ok(Math.abs(b.length - dist(b.p0, b.p1)) < 1e-12, `${b.id} length 必须等于 |p1-p0|`);
    assert.equal(b.confidence, 1, `${b.id} 全可见时 confidence 应为 1`);
  }
  assert.equal(sk.t, 1234);
  assert.equal(sk.warmingUp, false, 'warmingUp 由 stabilizer 负责，buildSkeleton 里是 false');
});

test('(a) 派生关节按 docs/04 §2 的表：pelvis / chest / neck / headCenter / handTip', () => {
  const sk = build(toRaw(tPose()));
  const j = sk.joints;
  // 落地平移把 up=-0.90 抬到 0，所以世界 y = up + 0.90
  const near = (a: number, b: number, msg: string) =>
    assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

  near(j.pelvis[0], 0, 'pelvis = mid(hipL,hipR) → x 居中');
  near(j.pelvis[1], 0.90, 'pelvis y');
  near(j.chest[1], 1.40, 'chest = mid(肩) y');
  near(j.headCenter[1], 1.62, 'headCenter = mid(耳) y');
  // neck = lerp(chest, headCenter, 0.35)
  near(j.neck[1], 1.40 + (1.62 - 1.40) * 0.35, 'neck = lerp(chest, headCenter, 0.35)');
  // handTip = mid(index, pinky)
  near(Math.abs(j.handTipL[0]), (0.86 + 0.84) / 2, 'handTipL = mid(index, pinky)');
});

test('(a) height = 颅顶到最低脚的 y 差（两耳中点 + craniumOffset）', () => {
  // MediaPipe 给不出颅顶，headCenter 是两耳中点，所以要补 SKELETON.craniumOffset，
  // 否则身高系统性低估 ~6%，整具身体比人矮一圈。见 docs/04 §2。
  const sk = build(toRaw(tPose()));
  const expected = 1.62 + SKELETON.craniumOffset;
  assert.ok(Math.abs(sk.height - expected) < 1e-9, `height=${sk.height}, 期望 ${expected}`);
});

// ── (b) 镜像 ────────────────────────────────────────────────────────────────

test('(b) 镜像机制：world.x = -mp.x —— 全项目唯一一次取负（P4）', () => {
  assert.equal(MIRROR_X, -1, '镜像常量被改了，请同步更新 docs/04 §1 的表');
  const world: Landmark[] = [];
  for (let i = 0; i < 33; i++) world[i] = { ...FILLER, visibility: 1 };
  world[LM.L_WRIST] = { x: 0.72, y: -0.50, z: 0.20, visibility: 1 };
  world[LM.R_WRIST] = { x: -0.72, y: -0.50, z: 0.20, visibility: 1 };
  const j = mediapipeToWorld({ world, score: 1, t: 0 });

  // 脚的 landmark 都在 mp 原点且可见 → 落地平移量为 0，y/z 可以直接对数
  assert.ok(Math.abs(j.wristL[0] - -0.72) < 1e-12, `mp.x=+0.72 → world.x 必须是 -0.72，实际 ${j.wristL[0]}`);
  assert.ok(Math.abs(j.wristR[0] - 0.72) < 1e-12, `mp.x=-0.72 → world.x 必须是 +0.72，实际 ${j.wristR[0]}`);
  assert.ok(Math.abs(j.wristL[1] - 0.50) < 1e-12, 'Y 翻转：mp.y 向下为正');
  assert.ok(Math.abs(j.wristL[2] - -0.20) < 1e-12, 'Z 翻转：朝相机为 +Z');
});

test('(b) 观众抬右手 → 屏幕 +X 侧的手抬起（docs/04 §1 "画面是镜子"）', () => {
  // 被摄者的右臂举过头顶：右 = side 为负
  const nodes = tPose();
  nodes[LM.R_ELBOW] = { side: -0.30, up: 0.75 };
  nodes[LM.R_WRIST] = { side: -0.22, up: 1.00 };
  nodes[LM.R_PINKY] = { side: -0.20, up: 1.11 };
  nodes[LM.R_INDEX] = { side: -0.22, up: 1.12 };
  const sk = build(toRaw(nodes));

  const handR = boneOf(sk, 'handR');
  const handL = boneOf(sk, 'handL');
  assert.ok(handR.p1[0] > 0, `抬起的那只手必须落在世界 +X 侧，实际 x=${handR.p1[0]}`);
  assert.ok(handR.p1[1] > sk.joints.headCenter[1], '抬起的手应高过头');
  assert.ok(handL.p1[1] < sk.joints.headCenter[1], '没抬的手应低于头');
});

test('(b) 举左手：按 docs/04 §1 的轴向约定，handL 落在世界 -X 侧', () => {
  // ⚠️ docs/11 T-02 验收 (b) 写的是 "handL 在世界 +X 侧"。
  //    两者只有在 "MediaPipe 的 left_* 出现在图像左侧" 时才一致，而 §1 说 +X 是图像右、
  //    正对相机的人其左半身出现在图像右侧 → left_* 是 +mp.x → 镜像后落在 -X。
  //    实现严格照 §1（MIRROR_X 取负）；这条断言记录的是 §1 约定下的真实结果。
  //    轴向实测（docs/09 U1）回来后，若结论相反，改 MP_LEFT_SIGN + MIRROR_X，符号自洽。
  const nodes = tPose();
  nodes[LM.L_ELBOW] = { side: 0.30, up: 0.75 };
  nodes[LM.L_WRIST] = { side: 0.22, up: 1.00 };
  nodes[LM.L_PINKY] = { side: 0.20, up: 1.11 };
  nodes[LM.L_INDEX] = { side: 0.22, up: 1.12 };
  const sk = build(toRaw(nodes));

  const handL = boneOf(sk, 'handL');
  const handR = boneOf(sk, 'handR');
  assert.ok(handL.p1[0] < 0, `handL.x=${handL.p1[0]}`);
  assert.ok(handL.p1[1] > sk.joints.headCenter[1], '抬起的手应高过头');
  assert.ok(handR.p1[0] > 0, '另一只手在 +X 侧');
});

test('(b) 左右不会串：同一侧的整条链都在同一侧', () => {
  const sk = build(toRaw(tPose()));
  for (const id of ['clavicleL', 'upperArmL', 'foreArmL', 'handL', 'thighL', 'shinL', 'footL']) {
    assert.ok(boneOf(sk, id).p1[0] < 0, `${id} 应在世界 -X 侧`);
  }
  for (const id of ['clavicleR', 'upperArmR', 'foreArmR', 'handR', 'thighR', 'shinR', 'footR']) {
    assert.ok(boneOf(sk, id).p1[0] > 0, `${id} 应在世界 +X 侧`);
  }
});

// ── (c) 缺失 / 低 visibility 的 landmark 不产生 NaN ──────────────────────────

test('(c) 空 / 残缺 / NaN 输入都不产生 NaN', () => {
  assertAllFinite(build({ world: [], score: 0, t: 0 }), '空数组');
  assertAllFinite(build({ world: new Array<Landmark>(33), score: 0, t: 0 }), '稀疏数组（全 undefined）');
  assertAllFinite(build({ score: 0, t: 0 } as unknown as RawPose), 'world 字段整个缺失');
  assertAllFinite(build({ world: [], score: 0, t: NaN } as RawPose), 't 是 NaN');

  const nodes = tPose();
  const raw = toRaw(nodes);
  raw.world[LM.L_WRIST] = { x: NaN, y: 0, z: 0, visibility: 1 };
  raw.world[LM.R_KNEE] = { x: 0, y: Infinity, z: 0, visibility: 1 };
  raw.world[LM.NOSE] = { x: 0, y: 0, z: NaN, visibility: NaN };
  assertAllFinite(build(raw), 'NaN / Infinity 分量');

  // 半数 landmark 直接删掉
  const holes = toRaw(nodes);
  for (const i of [LM.L_EAR, LM.R_EAR, LM.NOSE, LM.L_INDEX, LM.L_PINKY, LM.L_FOOT, LM.R_FOOT, LM.L_HEEL, LM.R_HEEL]) {
    delete (holes.world as (Landmark | undefined)[])[i];
  }
  assertAllFinite(build(holes), '删掉 9 个 landmark');
});

test('(c) visibility 低于 CAPTURE.minJointConfidence 时走 §2 的回退链', () => {
  const nodes = tPose();
  // 脸全看不见 → headCenter 回退 NOSE
  nodes[LM.L_EAR] = { side: 0.075, up: 0.72, vis: 0.05 };
  nodes[LM.R_EAR] = { side: -0.075, up: 0.72, vis: 0.05 };
  nodes[LM.NOSE] = { side: 0, up: 0.70, fwd: 0.10, vis: 0.7 };
  const sk = build(toRaw(nodes));
  assertAllFinite(sk, '耳朵不可见');
  assert.ok(Math.abs(sk.joints.headCenter[1] - (0.70 + 0.90)) < 1e-9, 'headCenter 应回退到 NOSE');
  assert.ok(Math.abs(boneOf(sk, 'head').confidence - 0.7) < 1e-9, '回退后 confidence 跟着 NOSE 走');

  // 连鼻子也没有 → headCenter 贴到 chest：零长 head 骨，但不许是 NaN，也不许掉到原点
  nodes[LM.NOSE] = { side: 0, up: 0.70, vis: 0 };
  const sk2 = build(toRaw(nodes));
  assertAllFinite(sk2, '整张脸不可见');
  assert.ok(Math.abs(sk2.joints.headCenter[1] - sk2.joints.chest[1]) < 1e-12, 'headCenter 回退到 chest');
  assert.equal(boneOf(sk2, 'head').confidence, 0, '无依据时 confidence 必须是 0');
});

test('(c) 手指看不见 → handTip = wrist + (wrist-elbow)×0.3（docs/04 §2）', () => {
  const nodes = tPose();
  nodes[LM.L_INDEX] = { side: 0.86, up: 0.50, vis: 0.1 };
  nodes[LM.L_PINKY] = { side: 0.84, up: 0.49, vis: 0.1 };
  const sk = build(toRaw(nodes));
  assertAllFinite(sk, '手指不可见');
  const hand = boneOf(sk, 'handL');
  const foreArm = boneOf(sk, 'foreArmL');
  assert.ok(Math.abs(hand.length - foreArm.length * 0.3) < 1e-9, `handL=${hand.length}, foreArmL=${foreArm.length}`);
});

test('(c) 缺失 landmark 的 confidence 为 0，可见的为两端较小值', () => {
  const nodes = tPose();
  nodes[LM.L_ELBOW] = { side: 0.47, up: 0.50, vis: 0.62 };
  nodes[LM.L_SHOULDER] = { side: 0.19, up: 0.50, vis: 0.81 };
  const sk = build(toRaw(nodes));
  assert.ok(Math.abs(boneOf(sk, 'upperArmL').confidence - 0.62) < 1e-9, '取两端较小值');

  const gone = toRaw(tPose());
  delete (gone.world as (Landmark | undefined)[])[LM.L_KNEE];
  assert.equal(boneOf(build(gone), 'thighL').confidence, 0);
});

// ── (d) 落地：min(footL.p1.y, footR.p1.y) ≈ 0 ───────────────────────────────

test('(d) 落地平移：最低的脚 y ≈ 0', () => {
  const sk = build(toRaw(tPose()));
  const yL = boneOf(sk, 'footL').p1[1];
  const yR = boneOf(sk, 'footR').p1[1];
  assert.ok(Math.abs(Math.min(yL, yR)) < 1e-9, `min(${yL}, ${yR}) 应 ≈ 0`);
});

test('(d) 下蹲 / 跳起都贴地：整体上下平移不改变最低脚的 y', () => {
  for (const offset of [-0.35, 0.6, 2.5]) {
    const nodes = tPose();
    for (const k of Object.keys(nodes)) nodes[Number(k)].up += offset;
    const sk = build(toRaw(nodes));
    const y = Math.min(boneOf(sk, 'footL').p1[1], boneOf(sk, 'footR').p1[1]);
    assert.ok(Math.abs(y) < 1e-9, `offset=${offset} → min foot y=${y}`);
    assert.ok(Math.abs(sk.height - (1.62 + SKELETON.craniumOffset)) < 1e-9, 'height 不受整体平移影响');
  }
});

test('(d) 抬一只脚：低的那只落在 0，高的那只保留高度差', () => {
  const nodes = tPose();
  nodes[LM.R_ANKLE] = { side: -0.09, up: -0.75 };
  nodes[LM.R_HEEL] = { side: -0.09, up: -0.78, fwd: -0.05 };
  nodes[LM.R_FOOT] = { side: -0.09, up: -0.78, fwd: 0.14 };
  const sk = build(toRaw(nodes));
  const yL = boneOf(sk, 'footL').p1[1];
  const yR = boneOf(sk, 'footR').p1[1];
  assert.ok(Math.abs(yL) < 1e-9, `站着的那只脚应在 0，实际 ${yL}`);
  assert.ok(Math.abs(yR - 0.12) < 1e-9, `抬起的那只脚应在 +0.12，实际 ${yR}`);
});

test('(d) 脚尖看不见时用脚踝兜底，仍然贴地且无 NaN', () => {
  const nodes = tPose();
  for (const i of [LM.L_FOOT, LM.R_FOOT, LM.L_HEEL, LM.R_HEEL]) {
    nodes[i] = { ...nodes[i], vis: 0.02 };
  }
  const sk = build(toRaw(nodes));
  assertAllFinite(sk, '脚尖脚跟都不可见');
  const y = Math.min(boneOf(sk, 'footL').p1[1], boneOf(sk, 'footR').p1[1]);
  assert.ok(Math.abs(y) < 1e-9, `退到脚踝后仍应贴地，实际 ${y}`);
  assert.equal(boneOf(sk, 'footL').confidence, 0, '没有脚尖依据 → confidence 0');
});

test('(d) 一个 landmark 都没有时 height 退回 referenceHeight，不会是 0 或 NaN', () => {
  const sk = build({ world: [], score: 0, t: 0 });
  assert.ok(sk.height > 0 && Number.isFinite(sk.height), `height=${sk.height}`);
});
