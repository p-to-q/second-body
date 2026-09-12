/**
 * 部件对照表（dev 工具，不进现场）。
 * 用途：一眼看出哪些部件比例崩了、风格不统一、正反颠倒。
 *
 * 布局 = 真正的 contact sheet：正交相机、平铺网格、每格一个单位高度。
 * 红点 = socketA(0,0,0) 必须在底；蓝点 = socketB(0,1,0) 必须在顶。
 * 每个部件绕自身 Y 轴慢转，方便看四面。空格键暂停。
 */
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { PartMeta } from '../../core/src/types.ts';

const hud = document.getElementById('hud')!;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x17181a);

const renderer = new THREE.WebGPURenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xdfe6ef, 0x23242a, 1.4));
const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(1.5, 3, 2.5); scene.add(key);
const rim = new THREE.DirectionalLight(0x9ab6d8, 1.1); rim.position.set(-2, 1, -2); scene.add(rim);

const material = new THREE.MeshStandardMaterial({ color: 0xe9e5dd, roughness: 0.7, metalness: 0.0 });
const loader = new GLTFLoader();

const metas: PartMeta[] = await (await fetch('/parts/_metas.json')).json();

// 行 = 槽位，列 = family.variant。同一行横着看就能比出风格/比例是否一致。
const SLOT_ORDER = ['head', 'neck', 'spine', 'clavicle', 'upperArm', 'foreArm', 'hand', 'thigh', 'shin', 'foot', 'joint'];
const variantOf = (id: string) => id.split('.').slice(1).join('.');     // "shell.a"
const VARIANT_ORDER = [...new Set(metas.map((m) => variantOf(m.id)))].sort();
const usedSlots = SLOT_ORDER.filter((s) => metas.some((m) => m.slot === s));
const COLS = Math.max(1, VARIANT_ORDER.length);
const ROWS = Math.max(1, usedSlots.length);
const CW = 1.25, CH = 1.5;   // 每格宽/高

const spinners: THREE.Group[] = [];
metas.forEach((meta) => {
  const col = Math.max(0, VARIANT_ORDER.indexOf(variantOf(meta.id)));
  const row = Math.max(0, usedSlots.indexOf(meta.slot));
  const cell = new THREE.Group();
  cell.position.set((col - (COLS - 1) / 2) * CW, (ROWS - 1 - row) * CH, 0);
  scene.add(cell);

  const dot = (y: number, color: number) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 8), new THREE.MeshBasicMaterial({ color }));
    m.position.y = y; cell.add(m); return m;
  };
  dot(0, 0xff3355);
  dot(1, 0x3399ff);
  cell.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)]),
    new THREE.LineBasicMaterial({ color: 0x3a4450 }),
  ));

  const spin = new THREE.Group();
  cell.add(spin);
  spinners.push(spin);

  loader.load(`/parts/${meta.file}`, (gltf) => {
    gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = material; });
    spin.add(gltf.scene);
  }, undefined, () => console.warn('load failed', meta.file));
});

const worldW = COLS * CW, worldH = ROWS * CH;
let camera: THREE.OrthographicCamera;
function fit() {
  const aspect = innerWidth / innerHeight;
  const pad = 1.12;
  let w = worldW * pad, h = worldH * pad;
  if (w / h < aspect) w = h * aspect; else h = w / aspect;
  camera = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, -50, 50);
  camera.position.set(0, (ROWS - 1) * CH / 2 + 0.5, 10);
  camera.lookAt(0, (ROWS - 1) * CH / 2 + 0.5, 0);
  renderer.setSize(innerWidth, innerHeight);
}
fit();
addEventListener('resize', fit);

const odd = metas.filter((m) => m.localGirth > 1.2 || m.localGirth < 0.08 || m.triCount > 5000);
hud.textContent = [
  `${metas.length} parts · 红=socketA(底，应靠近躯干) 蓝=socketB(顶) · 空格暂停旋转`,
  `行(上→下): ${usedSlots.join(' / ')}`,
  `列(左→右): ${VARIANT_ORDER.join(' / ')}`,
  odd.length ? `\n⚠ 可疑: ${odd.map((m) => `${m.id}(girth=${m.localGirth.toFixed(2)})`).join(', ')}` : '\n✓ 没有明显异常的比例',
].join('\n');

let paused = false;
addEventListener('keydown', (e) => { if (e.code === 'Space') { paused = !paused; e.preventDefault(); } });

let t = 0;
renderer.setAnimationLoop(() => {
  if (!paused) { t += 0.006; for (const s of spinners) s.rotation.y = t; }
  renderer.render(scene, camera);
});
