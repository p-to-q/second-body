/**
 * 网格落地：**关节贴地不等于脚贴地**。
 *
 * 这个文件钉住的是一个用"看一眼截图"很难量、但一量就跑不掉的事实：
 * 骨架层的落地（docs/04 §3.5）把最低的脚**关节**放到 y=0，而观众看到的是网格，
 * 脚这个部件绕骨轴长出来，底面还在骨轴下方半个脚厚的地方。现场读出来就是"脚陷进地里"。
 *
 * 下面第一条用的是**真实数字**：站姿来自 `app/src/stage/framing.ts` 的参考 A-pose，
 * 部件包围盒逐字抄自 `assets/parts/parts.json` 里的 `foot.porcelain.a`，
 * 挂载参数抄自 `app/src/creature/assemble.ts` 给脚用的那一组（FOOT + uniform）。
 * 所以它量的是真的会被渲染出来的那个位置，不是一个为通过而造的场景。
 *
 * core 不许 import app（依赖只能向下，docs/01 §2），所以"装配那条路真的调用了
 * 这里的落地"由 `packages/app/test/ground.test.ts` 端到端地证；
 * 这个文件证的是几何本身与全部退化情况。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { attachMatrix } from '../src/attach.ts';
import { groundLift, liftMatrixInPlace, lowestPointOf, MAX_LIFT, type PlacedExtent } from '../src/ground.ts';
import { FOOT, SLOT_WIDTH } from '../src/tuning.ts';
import type { Bone, Mat4, Vec3 } from '../src/types.ts';

/** `foot.porcelain.a` 的归一化包围盒（parts.json 原值，长度=1、socketA 在原点） */
const FOOT_AABB = {
  min: [-0.2390892952680588, 0, -0.2703717350959778] as Vec3,
  max: [0.2390892952680588, 1, 0.2703717350959778] as Vec3,
};
const FOOT_GIRTH = 0.5407;

/**
 * 参考站姿里、**已经按骨架规矩落过地**的右脚：脚尖 footIdx 正好在 y=0。
 * 也就是说进到这个测试的时候，骨架那一层的活已经干完、而且干对了。
 */
function groundedFootBone(): Bone {
  const ankle: Vec3 = [-0.1, 0.06, 0];
  const toe: Vec3 = [-0.1, 0, 0.16];
  return {
    id: 'footR', p0: ankle, p1: toe,
    length: Math.hypot(toe[0] - ankle[0], toe[1] - ankle[1], toe[2] - ankle[2]),
    roll: 0, confidence: 1,
  };
}

/** `assemble()` 给脚用的那一组挂载参数（同一份 tuning，不另抄数字） */
function footMatrix(bone: Bone): Mat4 {
  const m: Mat4 = new Array(16).fill(0);
  const axisLength = Math.min(
    FOOT.maxLength,
    Math.max(FOOT.minLength, bone.length * FOOT.lengthOfBone),
  );
  return attachMatrix(bone, m, {
    mode: 'uniform',
    girth: SLOT_WIDTH.foot / FOOT_GIRTH,
    axisLength,
    anchor: FOOT.anchor,
  });
}

test('落地：脚关节贴地时，脚的网格还沉在地板下面 —— 这正是要修的那件事', () => {
  const bone = groundedFootBone();
  assert.equal(Math.min(bone.p0[1], bone.p1[1]), 0, '前提：骨架层已经把脚尖放到 y=0');

  const lowest = lowestPointOf({ matrix: footMatrix(bone), aabb: FOOT_AABB });
  assert.ok(lowest !== null, '真实的脚必须量得出最低点');
  // 关节在 0，网格却在 -0.03 以下：差的就是脚在骨轴下方的那半个厚度。
  // 这一行如果变绿（lowest ≈ 0），说明"按关节落地"已经足够 —— 那这整个模块就该删掉。
  assert.ok(lowest! < -0.03, `脚的网格应当沉在地下，实测 ${lowest}`);
});

test('落地：抬升之后，最低的网格点正好落在 y=0（而不是差半个脚厚）', () => {
  const m = footMatrix(groundedFootBone());
  const part: PlacedExtent = { matrix: m, aabb: FOOT_AABB };

  const lift = groundLift([part]);
  assert.ok(lift > 0.03, `抬升量应当就是沉下去的那一截，实测 ${lift}`);

  liftMatrixInPlace(m, lift);
  assert.ok(Math.abs(lowestPointOf(part)!) < 1e-12, '抬完之后脚底必须**正好**在地面上');
});

test('落地：整具身体一起抬，不许把身体拆散', () => {
  // 两只脚 + 一件浮在高处的头。抬升由最低的那一件决定，其余件的相对高度不变
  const foot = { matrix: footMatrix(groundedFootBone()), aabb: FOOT_AABB };
  const head: PlacedExtent = {
    matrix: [0.2, 0, 0, 0, 0, 0.2, 0, 0, 0, 0, 0.2, 0, 0, 1.5, 0, 1],
    aabb: { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] },
  };
  const before = lowestPointOf(head)!;
  const lift = groundLift([foot, head]);
  liftMatrixInPlace(foot.matrix, lift);
  liftMatrixInPlace(head.matrix, lift);

  assert.ok(Math.abs(lowestPointOf(foot)!) < 1e-12, '最低的那一件落在地面上');
  assert.ok(Math.abs(lowestPointOf(head)! - (before + lift)) < 1e-12, '其余件跟着走同样的距离');
});

test('落地：浮在空中的身体会被放下去，不是只会往上抬', () => {
  // 骨架层的落地基准是关节；四足/矮壮那些方案换过基准之后，网格完全可能停在地面之上。
  // 只补一个方向的话，"贴地"就只是一个愿望而不是一条恒等式。
  const floating: PlacedExtent = {
    matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.3, 0, 1],
    aabb: { min: [-0.1, 0, -0.1], max: [0.1, 0.2, 0.1] },
  };
  const lift = groundLift([floating]);
  assert.ok(lift < 0, `浮着就该往下放，实测 ${lift}`);
  liftMatrixInPlace(floating.matrix, lift);
  assert.ok(Math.abs(lowestPointOf(floating)!) < 1e-12);
});

test('落地：一个部件都没有 → 不动身体（mass 那一档、以及进场时全身缩到 0）', () => {
  assert.equal(groundLift([]), 0, '不知道身体在哪里时，唯一安全的动作是别动它');
});

test('落地：缺 aabb / 坏矩阵的件被跳过，而不是把整具身体带成 NaN（P2）', () => {
  const noBox: PlacedExtent = { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -9, 0, 1] };
  const nanMatrix: PlacedExtent = {
    matrix: [1, NaN, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -9, 0, 1],
    aabb: { min: [0, 0, 0], max: [1, 1, 1] },
  };
  assert.equal(lowestPointOf(noBox), null, '没有包围盒就量不出最低点 —— 返回 null，不是 0');
  assert.equal(lowestPointOf(nanMatrix), null);
  assert.equal(groundLift([noBox, nanMatrix]), 0, '全都量不了 = 什么都不知道 = 不动');

  const good: PlacedExtent = {
    matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -0.05, 0, 1],
    aabb: { min: [0, 0, 0], max: [1, 1, 1] },
  };
  const lift = groundLift([noBox, nanMatrix, good]);
  assert.ok(Number.isFinite(lift), '坏件不许污染好件');
  assert.ok(Math.abs(lift - 0.05) < 1e-12, `坏件被跳过，抬升只由好件决定，实测 ${lift}`);
});

test('落地：镜像件要按翻过来的 X 区间量（镜像烘在几何里，不在矩阵里）', () => {
  // 一件左右不对称的部件：X 只往正方向长。矩阵把局部 +X 转到世界 -Y。
  const aabb = { min: [0, 0, 0] as Vec3, max: [1, 0.01, 0.01] as Vec3 };
  const matrix: Mat4 = [0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const plain = lowestPointOf({ matrix, aabb })!;
  const mirrored = lowestPointOf({ matrix, aabb, mirrored: true })!;
  assert.ok(Math.abs(plain - -1) < 1e-12, '原件伸向 -Y');
  assert.ok(Math.abs(mirrored - 0) < 1e-12, '镜像件伸向 +Y —— 量成原件就会白抬一米');
});

test('落地：荒谬的包围盒被钳住 —— 最坏情况是"还沉着"，不是"飞出画面"', () => {
  // parts.json 是外部数据（P2 默认不可信）。一件坏掉的包围盒不该把身体弹走。
  const broken: PlacedExtent = {
    matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    aabb: { min: [0, -1e6, 0], max: [1, 1, 1] },
  };
  assert.equal(groundLift([broken]), MAX_LIFT);
});
