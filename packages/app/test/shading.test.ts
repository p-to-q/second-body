import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { TOON } from '../../core/src/tuning.ts';
import {
  DEFAULT_SHADING, SHADING_OF_THEME, createFillMaterial, createOutlineMaterial,
  isShadingId, resolveShading,
} from '../src/creature/shading.ts';

/**
 * 描边这条路径最容易坏的**不是**它自己，而是它悄悄影响到别人。
 *
 * 2026-09-13 之前这里守的是"只有 `char.line` 走 toon"，因为那时描边是 opt-in。
 * 默认翻过来之后（`DEFAULT_SHADING = 'toon'`，作品负责人的决定，预算数见
 * `test/outline-budget.test.ts`），要守的那件事**方向反了但性质没变**：
 * 现在最容易悄悄发生的是**某个物种被漏掉**（例外表被人加了一行、或者默认被
 * 翻回去），症状同样是"今天的渲染好像不太一样"，同样没有人会报告。
 * 所以这一组断言仍然有一半是在守"没有谁被静悄悄改掉"。
 */

test('默认走 toon；只有例外表点名的才回到 physical', () => {
  assert.equal(DEFAULT_SHADING, 'toon');
  // 这一串是当天 roster 里各 kind 的代表。没有一个在例外表里，所以全部走默认
  for (const id of ['char.line', 'porcelain', 'xeno', 'industrial', 'char.inflate',
    'char.diva', 'guest.keynote', 'char.tokusatsu', 'char.painting', 'field']) {
    assert.equal(resolveShading(id), 'toon', `${id} 该走默认的描边`);
  }
  // 没有物种（开场还没选）也必须有答案，不能是 undefined —— 帧循环里不许有洞。
  // 而且**开场那一具也得有描边**：它和选完物种之后是同一具身体，
  // 中途长出一圈线会读成"它刚才坏了"。
  assert.equal(resolveShading(null), 'toon');
  assert.equal(resolveShading(undefined), 'toon');
  // 例外表现在是空的。它不为空的时候，每一条都必须是 physical ——
  // 往里写 'toon' 是没有意义的（默认已经是了），而一条没有意义的例外
  // 下一个人读到会以为默认是 physical。
  for (const [id, s] of Object.entries(SHADING_OF_THEME)) {
    assert.equal(s, 'physical', `${id}：例外表只该用来把物种拉回 physical`);
  }
});

test('?shading= 覆盖物种自己的声明，认不出来的值不生效', () => {
  assert.equal(resolveShading('porcelain', 'toon'), 'toon');
  // `?shading=physical` 是现在唯一能当场把描边关掉的写法 —— 描边翻成默认之后，
  // 这个开关承担的正是它当初被留下来的那个理由：「它到底该不该有这圈线」要能当场 A/B
  assert.equal(resolveShading('char.line', 'physical'), 'physical');
  assert.equal(resolveShading('porcelain', 'physical'), 'physical');
  assert.equal(resolveShading('char.line', null), 'toon');
  assert.equal(isShadingId('toon'), true);
  assert.equal(isShadingId('cartoon'), false);   // 手滑写错不该静默退回默认
  assert.equal(isShadingId(null), false);
});

test('physical 这条路一个参数都没改', () => {
  const m = createFillMaterial('physical', {
    color: new THREE.Color(0.5, 0.5, 0.5), roughness: 0.42, metalness: 0.13, name: 'x',
  }) as THREE.MeshPhysicalMaterial;
  assert.equal(m.type, 'MeshPhysicalMaterial');
  assert.equal(m.roughness, 0.42);
  assert.equal(m.metalness, 0.13);
  // 部件不保证封闭，单面渲染会露出破洞 —— 这一条比描边老，别被"统一一下"收走
  assert.equal(m.side, THREE.DoubleSide);
});

test('toon 填充是离散色阶，不是连续的 Lambert', () => {
  const m = createFillMaterial('toon', {
    color: new THREE.Color(1, 1, 1), roughness: 0.7, metalness: 0, name: 'y',
  }) as THREE.MeshToonNodeMaterial;
  const g = m.gradientMap;
  assert.ok(g, '没有色阶贴图的话 toon 材质会退回 three 内置的两级，平涂就不是我们说的那个平涂');
  assert.equal((g.image as { width: number }).width, TOON.bands.length);
  assert.ok(TOON.bands.length >= 2 && TOON.bands.length <= 4);
  // 线性过滤会把三级重新抹成渐变 —— 那就等于没做平涂
  assert.equal(g.magFilter, THREE.NearestFilter);
  assert.equal(g.minFilter, THREE.NearestFilter);
  // 乘数不是颜色：给它 sRGB，0.55 会被解码成 0.27，整具身体暗一倍
  assert.equal(g.colorSpace, THREE.NoColorSpace);
});

test('描边外壳是"背面 + 沿法线外推"，不是一个放大的副本', () => {
  const m = createOutlineMaterial();
  // 正面朝外的话外壳会整个盖住身体 —— 屏幕上只剩一团墨
  assert.equal(m.side, THREE.BackSide);
  // 推挤必须挂在 positionNode 上。挂到 vertexNode 上会接管整段顶点计算、
  // 连带把实例矩阵丢掉，一整个桶的外壳会叠在原点（见 shading.ts 的说明）
  assert.ok(m.positionNode, 'positionNode 没了 = 外壳和身体完全重合 = 一条线都看不见');
  assert.equal(m.vertexNode ?? null, null);
  assert.ok(TOON.outlineMeters > 0);
});
