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
import { mountPageHead } from '../src/ui/page.ts';

mountPageHead({
  title: 'Anchor 渲染', titleEn: 'Theme anchors',
  note: '轮播卡片上那张参考图怎么来的 —— 每个主题的 spine.a 渲成 1024² 单体图。',
  state: '需要 dev server',
});

const log = (s: string) => { document.getElementById('log')!.textContent += '\n' + s; };
const shots = document.getElementById('shots')!;
document.getElementById('log')!.textContent = '渲染主题参考图…';

const SIZE = 1024;
const index: PartLibraryIndex = await (await fetch('/parts/parts.json')).json();
/**
 * 默认只渲**还没有参考图的**主题，并且 `?theme=<id>` 可以只挑一个。
 *
 * 为什么改成这样：原来它无条件把每个主题都重渲一遍。加一个新物种时，
 * 已经好的那二十几张会被同一批灯光和相机重新覆盖一次 —— 万一这中间
 * 舞台参数动过，一批风格统一的 anchor 就会悄悄变得不统一，
 * 而这批图正是**下游所有零件风格一致的唯一来源**。
 * 重渲全部要显式要：`?all=1`。
 */
const QS = new URLSearchParams(location.search);
const ONLY = QS.get('theme');
const ALL = QS.get('all') === '1';

/**
 * 只看 `res.ok` 是错的：**vite dev 的 SPA 兜底会把 404 变成 200**，
 * 返回的是 index.html。于是"这张图在不在"永远答"在"，这一页就永远什么都不做。
 * 判据必须是 content-type 真的是图。
 */
async function hasAnchor(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/refs/${id}/_anchor.png`, { method: 'HEAD' });
    return res.ok && (res.headers.get('content-type') ?? '').startsWith('image/');
  } catch { return false; }
}

const candidates = index.themes.filter((t) => t.source === 'rodin' && (!ONLY || t.id === ONLY));
const themes = ALL
  ? candidates
  : (await Promise.all(candidates.map(async (t) => (await hasAnchor(t.id)) ? null : t)))
      .filter((t): t is NonNullable<typeof t> => t !== null);

if (!themes.length) {
  document.getElementById('log')!.textContent =
    ONLY ? `${ONLY} 已经有参考图了（要重渲加 ?all=1）` : '每个主题都已经有参考图（要重渲加 ?all=1）';
}

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
