import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { geometryFromScene } from '../src/assets/library.ts';

/**
 * 部件是用 EXT_meshopt_compression + KHR_mesh_quantization 写出来的（26 MB → 5.4 MB）。
 * 这条路径有两个静悄悄就会坏掉的地方，而且**都不会抛异常**：
 *
 *   1. 忘了 `loader.setMeshoptDecoder()` → 191 件全部加载失败 → 全程占位几何。
 *   2. 量化后的 position 是归一化 Int16，直接 `applyMatrix4` 会把反量化后的值写回
 *      Int16 再重新归一化 → 几何被夹烂（`toFloatAttribute` 就是为这个存在的）。
 *
 * 两种坏法在画面上都只是"部件看起来不太对"，没有报错。所以这里用真文件对一遍契约：
 * 解出来的几何必须仍然满足 docs/03 §6 —— 主轴 +Y、socketA 在原点、长度 1。
 *
 * 没有资产时跳过（ADR-4：无资产也能开发）。
 */
const PARTS_DIR = resolve(fileURLToPath(import.meta.url), '../../../../assets/parts');

test('library: meshopt 压缩过的部件解出来仍然满足规范化契约', async (t) => {
  if (!existsSync(PARTS_DIR)) return t.skip('没有 assets/parts/');
  const files = readdirSync(PARTS_DIR).filter((f) => f.endsWith('.glb')).slice(0, 5);
  if (!files.length) return t.skip('assets/parts/ 里没有 glb');

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  for (const file of files) {
    const buf = readFileSync(resolve(PARTS_DIR, file));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const gltf = await new Promise<{ scene: import('three').Object3D }>((ok, no) =>
      loader.parse(ab, '', ok as never, no));

    // 走运行时真正用的那个函数，而不是在测试里重写一遍
    const geo = geometryFromScene(gltf.scene as never);
    assert.ok(geo, `${file}: 解不出 mesh —— 多半是 MeshoptDecoder 没挂上`);
    geo!.computeBoundingBox();
    const bb = geo!.boundingBox!;

    assert.equal(geo!.getAttribute('position').array.constructor, Float32Array,
      `${file}: position 还是量化整数 —— 烘变换会把它夹烂`);
    assert.ok(Math.abs(bb.min.y) < 2e-3, `${file}: socketA 不在原点 y=${bb.min.y}`);
    assert.ok(Math.abs(bb.max.y - bb.min.y - 1) < 2e-3, `${file}: 长度 ${bb.max.y - bb.min.y} ≠ 1`);
    assert.ok(Math.abs((bb.min.x + bb.max.x) / 2) < 1e-2, `${file}: X 没居中 ${(bb.min.x + bb.max.x) / 2}`);
  }
});
