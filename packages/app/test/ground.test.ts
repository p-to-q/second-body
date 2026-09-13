/**
 * 端到端：**装配出来的身体真的站在地面上**，七种身体方案都一样。
 *
 * 为什么这条测试非有不可：`core/test/ground.test.ts` 证的是那段几何数学对，
 * 但它证不了装配那条路**调用了**它 —— 而 bug 恰恰是"少了一步"，不是"那一步算错了"。
 * 一个只测纯函数的套件在修之前和修之后都是绿的，那就不是仪表（P21）。
 * 所以这里跑的是真的 `assemble()`：给它参考站姿、给它七种拓扑，量它吐出来的矩阵。
 *
 * 量法与渲染端一致：每件的局部 aabb 过它自己的挂载矩阵，取全身最低的那个角。
 * 这也是这条测试唯一"自己写"的数学 —— 故意不复用 `core/ground.ts`，
 * 否则就变成"用同一段代码验证它自己"。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { assemble } from '../src/creature/assemble.ts';
import { REFERENCE_POSE } from '../src/stage/framing.ts';
import { BODY_PLANS, remapSkeleton, type BodyPlanId } from '../../core/src/bodyplan.ts';
import { ALL_BONE_IDS } from '../../core/src/slots.ts';
import type {
  Genome, Mat4, PartMeta, Skeleton, Slot, SlotKey, Vec3,
} from '../../core/src/types.ts';

/**
 * 一套"每个槽位一件"的假部件。包围盒照抄 parts.json 的形状约定：
 * 长度归一化到 1（沿 +Y，socketA 在原点），横向对称。
 * 数值取自 `foot.porcelain.a` 一类的真实件，不是随手编的小盒子 ——
 * 编一个薄片会让这条测试在"其实还沉着"的情况下也变绿。
 */
const HALF = 0.27;
const META: Record<string, PartMeta> = {};
function metaOf(partId: string): PartMeta {
  const slot = partId.slice('part:'.length) as Slot;
  META[partId] ??= {
    id: partId, slot, tier: 0, file: '', family: 'test',
    localGirth: HALF * 2, triCount: 12,
    aabb: { min: [-HALF, 0, -HALF], max: [HALF, 1, HALF] },
    symmetry: 'mirror',
  };
  return META[partId];
}

const GENOME: Genome = {
  seed: 1, tier: 1, theme: 'test',
  slots: Object.fromEntries(
    ([...ALL_BONE_IDS, 'joint'] as SlotKey[]).map((k) => {
      const slot = k === 'joint' ? 'joint' : slotOf(k);
      return [k, { partId: `part:${slot}`, materialRole: 'primary' as const }];
    }),
  ) as Genome['slots'],
  materials: { primary: 'm', secondary: 'm', accent: 'm' },
};

/** BoneId → Slot。抄 `core/slots.ts` 的表太啰嗦，这里只要一个能用的映射 */
function slotOf(bone: string): Slot {
  const raw = bone.replace(/[LR]$/, '');
  return (raw === 'footIdx' ? 'foot' : raw) as Slot;
}

/** 一件部件被它自己的挂载矩阵变换之后的世界最低点（八个角，老老实实全算） */
function lowestOf(m: Mat4, aabb: { min: Vec3; max: Vec3 }): number {
  let lo = Infinity;
  for (const x of [aabb.min[0], aabb.max[0]]) {
    for (const y of [aabb.min[1], aabb.max[1]]) {
      for (const z of [aabb.min[2], aabb.max[2]]) {
        lo = Math.min(lo, m[1] * x + m[5] * y + m[9] * z + m[13]);
      }
    }
  }
  return lo;
}

function lowestMeshPoint(sk: Skeleton): number {
  const parts = assemble(GENOME, sk, { metaOf }, {});
  assert.ok(parts.length > 0, '参考站姿应当装配出部件');
  let lo = Infinity;
  for (const p of parts) lo = Math.min(lo, lowestOf(p.matrix, metaOf(p.partId).aabb));
  return lo;
}

for (const plan of BODY_PLANS as readonly BodyPlanId[]) {
  test(`落地：${plan} 的网格最低点落在地面上`, () => {
    const sk = remapSkeleton(REFERENCE_POSE, plan);
    const lo = lowestMeshPoint(sk);
    assert.ok(Number.isFinite(lo), `${plan} 量出了 NaN`);
    // 修之前这里是 -0.03 ~ -0.06（人形）乃至 -0.3（四足的前腿）。
    // 允许的误差只有浮点噪声：`几乎贴地` 不是一条可以慢慢漂的标准。
    assert.ok(Math.abs(lo) < 1e-9, `${plan} 的网格最低点应当是 0，实测 ${lo}`);
  });
}

test('落地：抬的是网格，不是骨架 —— 关节该留在原地', () => {
  // 这条把"修法对不对"钉死：如果有人图省事去改骨架的落地基准，
  // 上面七条会照样绿，但接触阴影（`framing.ts` 的 contactPoints 以 y=0 为参照）
  // 就会跟着脚一起往上跑，影子画在没有脚的地方。
  //
  // 参考站姿本身的脚尖在 y=0.03（它是给取景用的，没落过地），
  // 而真正喂给装配的骨架是稳定器落过地的 —— 这里先补上那一步，量的才是运行时那件事。
  const sk = groundedAtFeet(remapSkeleton(REFERENCE_POSE, 'rig'));
  const before = JSON.stringify(sk.joints);

  assert.ok(Math.abs(lowestMeshPoint(sk)) < 1e-9, '网格落在地面上');
  assert.equal(JSON.stringify(sk.joints), before, 'assemble() 不许改写传进来的骨架');

  const lowestJoint = Math.min(...Object.values(sk.joints).map((v) => v[1]));
  assert.ok(Math.abs(lowestJoint) < 1e-9, '最低的脚关节仍然在 y=0 —— 动的是网格，不是骨架');
});

/** 把骨架整体平移，让最低的脚关节回到 y=0（docs/04 §3.5，稳定器每帧干的那件事） */
function groundedAtFeet(sk: Skeleton): Skeleton {
  let lo = Infinity;
  for (const n of ['footIdxL', 'footIdxR', 'ankleL', 'ankleR']) {
    const y = sk.joints[n]?.[1];
    if (Number.isFinite(y) && y < lo) lo = y;
  }
  if (!Number.isFinite(lo)) return sk;
  const joints: Record<string, Vec3> = {};
  for (const k in sk.joints) joints[k] = [sk.joints[k][0], sk.joints[k][1] - lo, sk.joints[k][2]];
  return {
    ...sk,
    joints,
    bones: sk.bones.map((b) => ({
      ...b,
      p0: [b.p0[0], b.p0[1] - lo, b.p0[2]] as Vec3,
      p1: [b.p1[0], b.p1[1] - lo, b.p1[2]] as Vec3,
    })),
  };
}

test('落地：一个部件都不实例化时（mass / 进场缩到 0）什么都不做', () => {
  const sk = remapSkeleton(REFERENCE_POSE, 'rig');
  const empty = assemble(GENOME, sk, { metaOf }, {
    render: Object.fromEntries(([...ALL_BONE_IDS, 'joint'] as SlotKey[]).map((k) => [k, []])),
  });
  assert.equal(empty.length, 0, '全空的渲染表应当装配出 0 件');
});

test('落地：部件缺 aabb 时不产生 NaN 矩阵（parts.json 是外部数据）', () => {
  const sk = remapSkeleton(REFERENCE_POSE, 'rig');
  const blind = {
    metaOf: (id: string): PartMeta => ({ ...metaOf(id), aabb: undefined as unknown as PartMeta['aabb'] }),
  };
  const parts = assemble(GENOME, sk, blind, {});
  assert.ok(parts.length > 0);
  for (const p of parts) {
    assert.ok(p.matrix.every(Number.isFinite), `${p.key} 的矩阵出现了 NaN`);
  }
});
