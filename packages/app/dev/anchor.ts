/**
 * 主题参考图（anchor）渲染器 —— dev 工具。
 *
 * 为什么存在：同一主题里 20 件部件如果各自从文字生成，风格只能靠形容词碰运气（docs/09 U6）。
 * 正确做法是让后 19 件以第一件的**图像**为参考走 image-to-3D。
 * Rodin 的 preview_render 在本账号拿不到渲染图（docs/09 U12），所以我们自己渲。
 *
 * 打开这个页面 → 它会把每个生成型主题的 spine.<theme>.a 原始（带贴图）glb
 * 渲染成 1024² 的单体图，POST 回 assets/refs/<theme>/_anchor.png。
 * 然后 `npm run factory:generate -- --theme=<id>` 就会自动走 image-to-3D。
 */
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { PartLibraryIndex } from '../../core/src/types.ts';

const log = (s: string) => { document.getElementById('log')!.textContent += '\n' + s; };
const shots = document.getElementById('shots')!;
document.getElementById('log')!.textContent = '渲染主题参考图…';

const SIZE = 1024;
const index: PartLibraryIndex = await (await fetch('/parts/parts.json')).json();
const themes = index.themes.filter((t) => t.source === 'rodin');

const renderer = new THREE.WebGPURenderer({ antialias: true, alpha: false });
renderer.setSize(SIZE, SIZE);
renderer.setPixelRatio(1);
const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
const loader = new GLTFLoader();

for (const theme of themes) {
  const id = `spine.${theme.id}.a`;
  const url = `/raw/${id}/base_basic_pbr.glb`;          // 用带贴图的原始件，材质信息才在
  try {
    const gltf = await loader.loadAsync(url);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf2f2f0);        // 干净浅底，接近"产品照"
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb8bcc4, 2.0));
    const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(2, 3, 4); scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.9); fill.position.set(-3, 1, 2); scene.add(fill);

    const obj = gltf.scene;
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    obj.position.sub(center);
    scene.add(obj);

    const radius = Math.max(size.x, size.y, size.z) * 0.5;
    const dist = radius / Math.tan((camera.fov * Math.PI) / 360) * 1.6;
    camera.position.set(dist * 0.45, dist * 0.28, dist * 0.85);
    camera.lookAt(0, 0, 0);

    await renderer.renderAsync(scene, camera);
    const blob: Blob = await new Promise((r) => renderer.domElement.toBlob((b) => r(b!), 'image/png'));
    const res = await fetch(`/__anchor/${theme.id}`, { method: 'POST', body: blob });
    const j = await res.json();
    log(`✓ ${theme.id.padEnd(12)} ${(j.bytes / 1024).toFixed(0)} KB → assets/refs/${theme.id}/_anchor.png`);
    const img = document.createElement('img');
    img.src = URL.createObjectURL(blob);
    img.title = theme.id;
    shots.appendChild(img);
  } catch (e) {
    log(`✗ ${theme.id}: ${(e as Error).message}（该主题的 ${id} 可能还没生成）`);
  }
}
log('\n完成。接下来: npm run factory:generate -- --theme=<id>');
