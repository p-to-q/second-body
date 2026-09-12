/**
 * 取景是主观的，但三件事是可测的，而且都出过事：
 *
 *  1. 「等身」这条产品主张（docs/PRD §3）在代码里的具体形式是：
 *     **人形的取景必须和 T-09 之前一模一样**（画面高 2.45m、底边 -0.30m）。
 *     任何人调 `FRAMING` 的系数，这条会先红。
 *  2. **每一种身体方案都得框得住自己。** 四足是横的矮的，towering 快 2m 高，
 *     inverted 的重心在地面以下 —— 这些都真的把身体挤出过画面。
 *  3. 坏输入（NaN 骨架 / 空骨架 / 不认识的方案名）不许产出 NaN 取景：
 *     那会让整个画面消失，而观众永远不该看见"出错了"（docs/23 §S8）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { BODY_PLANS } from '../../core/src/bodyplan.ts';
import type { Skeleton, Vec3 } from '../../core/src/types.ts';
import {
  boundsOfPlan, boundsOfSkeleton, fitFrame, lerpBounds, DEFAULT_BOUNDS, FRAMING, REFERENCE_POSE,
} from '../src/stage/framing.ts';

test('framing: 人形的取景和 T-09 之前一模一样 —— 等身不许被身体方案改掉', () => {
  const fit = fitFrame(boundsOfPlan('rig'));
  assert.ok(Math.abs(fit.frameHeight - 2.45) < 0.01, `画面高度应为 2.45m，实际 ${fit.frameHeight.toFixed(3)}`);
  assert.ok(Math.abs((fit.centerY - fit.frameHeight / 2) - -0.30) < 0.02,
    `画面底边应在 -0.30m（脚前留一段地面），实际 ${(fit.centerY - fit.frameHeight / 2).toFixed(3)}`);
});

test('framing: 参考站姿确实是一具 1.7m 的人（换了它，等身的数就全变了）', () => {
  const b = boundsOfSkeleton(REFERENCE_POSE);
  assert.ok(b);
  assert.ok(Math.abs(b.height - 1.57) < 0.02, `参考站姿的骨架盒应高 1.57m，实际 ${b.height.toFixed(3)}`);
  assert.ok(Math.abs(b.width - 1.02) < 0.02, `参考站姿的骨架盒应宽 1.02m，实际 ${b.width.toFixed(3)}`);
  // 未知方案的退路必须**正好**等于人形，不然相机会在这两者之间跳一下
  assert.deepEqual(boundsOfPlan('rig'), DEFAULT_BOUNDS);
});

test('framing: 每种身体方案都框得住自己，不出画', () => {
  for (const plan of BODY_PLANS) {
    const b = boundsOfPlan(plan);
    const fit = fitFrame(b);
    const top = fit.centerY + fit.frameHeight / 2;
    const bottom = fit.centerY - fit.frameHeight / 2;
    assert.ok(Number.isFinite(top) && Number.isFinite(bottom), `${plan} 的取景是 NaN`);
    assert.ok(top >= b.centerY + b.height / 2, `${plan} 的头顶出画了`);
    assert.ok(bottom <= b.centerY - b.height / 2, `${plan} 的脚出画了`);
    assert.ok(fit.frameWidth >= b.width, `${plan} 的两侧出画了`);
    assert.ok(fit.frameHeight >= FRAMING.minFrameHeight - 1e-9
      && fit.frameHeight <= FRAMING.maxFrameHeight + 1e-9, `${plan} 的取景没被夹住`);
  }
});

test('framing: 带比例的 spec 也能取景（{ kind, limb } 那种）', () => {
  // 长腿的四足必须比标准四足框得更高，否则新比例一落地身体就出画
  const plain = boundsOfPlan('quadruped');
  const longLegs = boundsOfPlan({ kind: 'quadruped', limb: 1.6 });
  assert.ok(longLegs.height > plain.height + 0.1,
    `limb=1.6 的四足应该更高：${plain.height.toFixed(2)} → ${longLegs.height.toFixed(2)}`);
  const fit = fitFrame(longLegs);
  assert.ok(fit.centerY + fit.frameHeight / 2 >= longLegs.centerY + longLegs.height / 2, '长腿四足出画了');
});

test('framing: 四足读得出"比人小"，但不会小到看不见', () => {
  const human = fitFrame(boundsOfPlan('rig')).frameHeight;
  const quad = fitFrame(boundsOfPlan('quadruped')).frameHeight;
  // 画面框得越小 = 身体在屏幕上占得越大。四足必须仍然比人形"小一号"：
  // 完全自适应（四足和人一样大）就等于杀掉了等身这条主张。
  assert.ok(quad < human, '四足的取景框应该比人形小');
  const magnification = human / quad;
  assert.ok(magnification > 1.2 && magnification < 2.0,
    `四足相对严格 1:1 被放大了 ${magnification.toFixed(2)} 倍 —— 超出"有限插值"的范围`);
});

test('framing: 不认识的方案 / 空骨架 / NaN 都不炸，退回人形', () => {
  assert.deepEqual(boundsOfPlan('no-such-plan'), DEFAULT_BOUNDS);
  assert.deepEqual(boundsOfPlan(null), DEFAULT_BOUNDS);
  assert.equal(boundsOfSkeleton(null), null);
  assert.equal(boundsOfSkeleton({ ...REFERENCE_POSE, bones: [] }), null);
  const nan: Skeleton = {
    ...REFERENCE_POSE,
    bones: REFERENCE_POSE.bones.map((b) => ({ ...b, p0: [NaN, NaN, NaN] as Vec3 })),
  };
  const got = boundsOfSkeleton(nan);
  assert.ok(got && Number.isFinite(got.height) && Number.isFinite(got.centerY), 'NaN 端点必须被跳过');
});

test('framing: 插值端点正确', () => {
  const a = boundsOfPlan('rig'), b = boundsOfPlan('quadruped');
  assert.deepEqual(lerpBounds(a, b, 0), a);
  assert.deepEqual(lerpBounds(a, b, 1), b);
  const mid = lerpBounds(a, b, 0.5);
  assert.ok(mid.height > b.height && mid.height < a.height);
});
