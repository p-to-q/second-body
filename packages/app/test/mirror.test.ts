import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mirrorGeometry } from '../src/assets/library.ts';

/**
 * 左半身原来是靠"矩阵里给个负 X 缩放"做出来的。负行列式会把所有三角形变成背面，
 * 而背面片元的法线会被取反 —— 左半身于是比右半身暗一大截，看起来像换了材质。
 *
 * 这条测试守住修法本身：镜像副本必须**绕序也翻过来**，也就是闭合网格的有向体积
 * 仍然为正。只 `scale(-1,1,1)` 的话它会变成负的 —— 那正是原来那个 bug。
 */
function signedVolume(geo: THREE.BufferGeometry): number {
  const pos = geo.getAttribute('position');
  const idx = geo.getIndex();
  const n = idx ? idx.count : pos.count;
  const at = (i: number) => {
    const k = idx ? idx.getX(i) : i;
    return [pos.getX(k), pos.getY(k), pos.getZ(k)] as const;
  };
  let v = 0;
  for (let i = 0; i + 2 < n; i += 3) {
    const a = at(i), b = at(i + 1), c = at(i + 2);
    v += (a[0] * (b[1] * c[2] - b[2] * c[1])
        - a[1] * (b[0] * c[2] - b[2] * c[0])
        + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return v;
}

for (const [name, make] of [
  ['索引几何', () => new THREE.BoxGeometry(1, 2, 3)],
  ['非索引几何', () => new THREE.BoxGeometry(1, 2, 3).toNonIndexed()],
] as const) {
  test(`mirrorGeometry 保持有向体积为正（${name}）`, () => {
    const src = make();
    const before = signedVolume(src);
    assert.ok(before > 0, `原件就该是正的: ${before}`);

    const m = mirrorGeometry(src);
    const after = signedVolume(m);
    assert.ok(after > 0, `镜像后仍须为正，否则法线是反的: ${after}`);
    assert.ok(Math.abs(Math.abs(after) - Math.abs(before)) < 1e-6, '体积大小不该变');

    // 真的镜像了：X 的包围盒对称翻转
    m.computeBoundingBox();
    src.computeBoundingBox();
    assert.ok(Math.abs(m.boundingBox!.min.x + src.boundingBox!.max.x) < 1e-6);
  });
}

test('mirrorGeometry 不改动原件', () => {
  const src = new THREE.BoxGeometry(1, 1, 1);
  const v0 = signedVolume(src);
  mirrorGeometry(src);
  assert.equal(signedVolume(src), v0);
});
