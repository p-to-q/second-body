/**
 * 装配预览（dev 工具）—— 在姿态追踪还不存在的时候，就把
 * 「资产 → 挂载数学 → 渲染」这条链子整体验证一遍。
 *
 * 它用一副**合成的 A-pose 骨架**（写死的关节坐标，身高 1.7m）驱动 core/attach.ts，
 * 所以任何比例错误、朝向错误（flip）、槽位缺失都会在这里一眼看出来，
 * 不用等摄像头那条链路做完。T-07 应该直接拿这里的装配逻辑去实现 Creature。
 *
 * 键：←/→ 换主题，空格暂停旋转，S 显示/隐藏骨架线。
 */
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { attachMatrix, jointMatrix } from '../../core/src/attach.ts';
import { SLOT_OF_BONE, IS_LEFT, ALL_BONE_IDS } from '../../core/src/slots.ts';
import { SLOT_FIT, SLOT_WIDTH, SKELETON, MORPH } from '../../core/src/tuning.ts';
import type { Bone, BoneId, Mat4, PartLibraryIndex, PartMeta, Vec3 } from '../../core/src/types.ts';

const hud = document.getElementById('hud')!;
const BODY_HEIGHT = SKELETON.referenceHeight;

// ── 合成 A-pose 骨架（米，Y-up，面朝 +Z；左侧在 +X，与镜像后的世界一致） ──────────
const J: Record<string, Vec3> = {
  pelvis: [0, 0.95, 0], chest: [0, 1.35, 0], neck: [0, 1.45, 0], headCenter: [0, 1.60, 0],
  shoulderL: [0.19, 1.38, 0], elbowL: [0.36, 1.10, 0.02], wristL: [0.47, 0.86, 0.04], handTipL: [0.51, 0.76, 0.05],
  shoulderR: [-0.19, 1.38, 0], elbowR: [-0.36, 1.10, 0.02], wristR: [-0.47, 0.86, 0.04], handTipR: [-0.51, 0.76, 0.05],
  hipL: [0.09, 0.93, 0], kneeL: [0.10, 0.51, 0.01], ankleL: [0.10, 0.09, 0], footIdxL: [0.10, 0.03, 0.16],
  hipR: [-0.09, 0.93, 0], kneeR: [-0.10, 0.51, 0.01], ankleR: [-0.10, 0.09, 0], footIdxR: [-0.10, 0.03, 0.16],
};
const BONE_JOINTS: Record<BoneId, [string, string]> = {
  spine: ['pelvis', 'chest'], neck: ['chest', 'neck'], head: ['neck', 'headCenter'],
  clavicleL: ['chest', 'shoulderL'], clavicleR: ['chest', 'shoulderR'],
  upperArmL: ['shoulderL', 'elbowL'], upperArmR: ['shoulderR', 'elbowR'],
  foreArmL: ['elbowL', 'wristL'], foreArmR: ['elbowR', 'wristR'],
  handL: ['wristL', 'handTipL'], handR: ['wristR', 'handTipR'],
  thighL: ['hipL', 'kneeL'], thighR: ['hipR', 'kneeR'],
  shinL: ['kneeL', 'ankleL'], shinR: ['kneeR', 'ankleR'],
  footL: ['ankleL', 'footIdxL'], footR: ['ankleR', 'footIdxR'],
};
const bones: Bone[] = ALL_BONE_IDS.map((id) => {
  const [a, b] = BONE_JOINTS[id];
  const p0 = J[a], p1 = J[b];
  return { id, p0, p1, length: Math.hypot(p1[0]-p0[0], p1[1]-p0[1], p1[2]-p0[2]), roll: 0, confidence: 1 };
});

// ── 场景 ────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101114);
const renderer = new THREE.WebGPURenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 50);
scene.add(new THREE.HemisphereLight(0xdfe6ef, 0x1a1b20, 1.3));
const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(2, 3.5, 3); scene.add(key);
const rim = new THREE.DirectionalLight(0x8fb4d8, 1.2); rim.position.set(-2.5, 1.5, -2); scene.add(rim);
const ground = new THREE.Mesh(new THREE.CircleGeometry(2.2, 64),
  new THREE.MeshStandardMaterial({ color: 0x17181c, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; scene.add(ground);

// mirror 用负 X 缩放实现，所以必须双面渲染（docs/04 §4 的陷阱）
const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe9e5dd, roughness: 0.62, metalness: 0.05, side: THREE.DoubleSide });

const index: PartLibraryIndex = await (await fetch('/parts/parts.json')).json();
const themes = [...new Set(index.parts.map((p) => p.family))].sort();
const loader = new GLTFLoader();
const cache = new Map<string, THREE.Object3D>();
const root = new THREE.Group(); scene.add(root);
const skelGroup = new THREE.Group(); scene.add(skelGroup);

for (const b of bones) {
  skelGroup.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...b.p0), new THREE.Vector3(...b.p1)]),
    new THREE.LineBasicMaterial({ color: 0x4a90d9 }),
  ));
}
skelGroup.visible = false;

async function geometryOf(meta: PartMeta): Promise<THREE.Object3D> {
  const hit = cache.get(meta.id);
  if (hit) return hit.clone(true);
  const gltf = await loader.loadAsync(`/parts/${meta.file}`);
  gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = bodyMat; });
  cache.set(meta.id, gltf.scene);
  return gltf.scene.clone(true);
}

const urlTheme = new URLSearchParams(location.search).get('theme');
let themeIdx = Math.max(0, themes.indexOf(urlTheme ?? themes[0]));
let missing: string[] = [];

async function build(theme: string) {
  root.clear();
  missing = [];
  const bodyScale = BODY_HEIGHT / 1.7;
  const m: Mat4 = new Array(16).fill(0);

  for (const b of bones) {
    const slot = SLOT_OF_BONE[b.id];
    const cands = index.parts.filter((p) => p.slot === slot && p.family === theme && p.tier <= 1);
    const pool = cands.length ? cands : index.parts.filter((p) => p.slot === slot && p.family === theme);
    if (!pool.length) { missing.push(`${b.id}(${slot})`); continue; }
    const meta = pool[0];
    const girth = (SLOT_WIDTH[slot] * bodyScale) / Math.max(1e-4, meta.localGirth);
    attachMatrix(b, m, { girth, mode: SLOT_FIT[slot], mirror: IS_LEFT[b.id] && meta.symmetry === 'mirror' });
    const obj = await geometryOf(meta);
    obj.matrixAutoUpdate = false;
    obj.matrix.fromArray(m);
    root.add(obj);
  }

  // 关节盖片
  const jointMeta = index.parts.find((p) => p.slot === 'joint' && p.family === theme);
  if (jointMeta) {
    for (const name of ['chest', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'hipL', 'hipR', 'kneeL', 'kneeR']) {
      const r = (SLOT_WIDTH.joint * bodyScale * MORPH.jointCapScale) / Math.max(1e-4, jointMeta.localGirth);
      jointMatrix(J[name], r, m);
      const obj = await geometryOf(jointMeta);
      obj.matrixAutoUpdate = false;
      obj.matrix.fromArray(m);
      root.add(obj);
    }
  }

  const def = index.themes.find((t) => t.id === theme);
  hud.innerHTML =
    `<b>${def ? def.name + ' · ' + def.nameEn : theme}</b>  (${themeIdx + 1}/${themes.length})\n` +
    `${def?.tagline ?? ''}\n\n` +
    `←/→ 换主题 · 空格 暂停 · S 骨架线\n` +
    `部件 ${root.children.length} 个 · 身高 ${BODY_HEIGHT}m\n` +
    (missing.length ? `⚠ 缺件: ${missing.join(', ')}` : '✓ 槽位齐全');
}

await build(themes[themeIdx]);
camera.position.set(1.7, 1.25, 2.7);
camera.lookAt(0, 0.95, 0);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
let paused = false, t = 0;
addEventListener('keydown', async (e) => {
  if (e.code === 'Space') { paused = !paused; e.preventDefault(); }
  if (e.code === 'KeyS') skelGroup.visible = !skelGroup.visible;
  const go = async (d: number) => {
    themeIdx = (themeIdx + d + themes.length) % themes.length;
    history.replaceState(null, '', `?theme=${themes[themeIdx]}`);
    await build(themes[themeIdx]);
  };
  if (e.code === 'ArrowRight') await go(1);
  if (e.code === 'ArrowLeft') await go(-1);
});
renderer.setAnimationLoop(() => {
  if (!paused) t += 0.005;
  const a = Math.sin(t) * 0.9;
  camera.position.set(Math.sin(a) * 3.1, 1.25, Math.cos(a) * 3.1);
  camera.lookAt(0, 0.95, 0);
  renderer.render(scene, camera);
});
