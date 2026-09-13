import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { TOON } from '../../core/src/tuning.ts';
import {
  SHADING_OF_THEME, createFillMaterial, createOutlineMaterial, isShadingId, resolveShading,
} from '../src/creature/shading.ts';

/**
 * 描边这条路径最容易坏的**不是**它自己，而是它悄悄影响到别人：
 * 一个 `Record` 查错了键、一个默认值写成 `'toon'`、一次"顺手统一材质"，
 * 都会让另外二十几个物种一起变成卡通 —— 而那是一个**没有人会报告的 bug**，
 * 因为它看起来只是"今天的渲染好像不太一样"。
 * 所以这一组断言里有一半是在守"别人没变"。
 */

test('只有声明过的物种走 toon，其余一律 physical', () => {
  assert.equal(resolveShading('char.line'), 'toon');
  // 这一串是当天 roster 里各 kind 的代表。它们一个都不该被描边碰到
  for (const id of ['porcelain', 'xeno', 'industrial', 'char.inflate', 'char.diva',
    'guest.keynote', 'char.tokusatsu', 'char.painting', 'field']) {
    assert.equal(resolveShading(id), 'physical', `${id} 不该被描边碰到`);
  }
  // 没有物种（开场还没选）也必须有答案，不能是 undefined —— 帧循环里不许有洞
  assert.equal(resolveShading(null), 'physical');
  assert.equal(resolveShading(undefined), 'physical');
  // 表里只该有真正需要它的那些；多一条就是多一个物种被改了长相
  assert.deepEqual(Object.keys(SHADING_OF_THEME), ['char.line']);
});

test('?shading= 覆盖物种自己的声明，认不出来的值不生效', () => {
  assert.equal(resolveShading('porcelain', 'toon'), 'toon');
  assert.equal(resolveShading('char.line', 'physical'), 'physical');
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
