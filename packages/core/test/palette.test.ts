import test from 'node:test';
import assert from 'node:assert/strict';
import { harmonize } from '../src/palette.ts';
import type { MaterialDef, Vec3 } from '../src/types.ts';

const luma = (c: Vec3) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

const bone: MaterialDef = { id: 'matte.bone', tier: 1, baseColor: [0.93, 0.91, 0.87], roughness: 0.72, metalness: 0 };
const ash: MaterialDef = { id: 'matte.ash', tier: 1, baseColor: [0.42, 0.43, 0.45], roughness: 0.78, metalness: 0 };
const chitin: MaterialDef = { id: 'chitin.deep', tier: 2, baseColor: [0.16, 0.19, 0.24], roughness: 0.42, metalness: 0.25, clearcoat: 0.45 };
const glow: MaterialDef = { id: 'glow.signal', tier: 3, baseColor: [0.1, 0.11, 0.13], roughness: 0.5, metalness: 0.2, emissive: [0.2, 0.9, 0.7] };

test('primary 是锚点，原样返回', () => {
  assert.equal(harmonize(bone, bone, 'primary'), bone);
});

test('次要色被拉向主色，但明度差不会被抹平', () => {
  const out = harmonize(ash, bone, 'secondary');
  const before = Math.abs(luma(ash.baseColor) - luma(bone.baseColor));
  const after = Math.abs(luma(out.baseColor) - luma(bone.baseColor));
  assert.ok(after < before, `应该更接近: ${after} vs ${before}`);
  assert.ok(after > 0.05, `不能被抹平: ${after}`);
  assert.ok(out.baseColor.every((v) => v >= 0 && v <= 1), JSON.stringify(out.baseColor));
});

/**
 * 这条是 docs/PRD §5 第 3 条判据的护栏：统一材质**不许**把物种统一掉。
 * 同一个 `matte.ash` 挂在瓷身上和挂在异形身上必须还是两个颜色。
 */
test('不同物种的同一个角色材质仍然分得开', () => {
  const onBone = harmonize(ash, bone, 'secondary').baseColor;
  const onChitin = harmonize(ash, chitin, 'secondary').baseColor;
  const gap = Math.abs(luma(onBone) - luma(onChitin));
  assert.ok(gap > 0.1, `两个物种的四肢不该几乎一样亮: ${gap}`);
});

test('自发光材质原样返回 —— 它是信号，不是配色', () => {
  assert.equal(harmonize(glow, bone, 'accent'), glow);
});

test('表面响应向主色靠拢，且始终有限', () => {
  const out = harmonize(chitin, bone, 'accent');
  assert.ok(out.roughness > chitin.roughness && out.roughness < bone.roughness);
  assert.ok([out.roughness, out.metalness, out.clearcoat ?? 0].every(Number.isFinite));
});
