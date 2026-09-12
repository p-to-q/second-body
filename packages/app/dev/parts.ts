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

type Verdict = 'keep' | 'reject' | null;
const curation: Record<string, { verdict: Verdict }> =
  await fetch('/parts/curation.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));

const spinners: THREE.Group[] = [];
const cells: { meta: PartMeta; cell: THREE.Group; frame: THREE.LineSegments }[] = [];
const FRAME_COLOR: Record<string, number> = { keep: 0x3ddc84, reject: 0xe0455a, none: 0x2a3038 };
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

  // 评级外框：绿=keep 红=reject 灰=未评
  const frameGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(CW * 0.9, 1.18, CW * 0.9));
  const frame = new THREE.LineSegments(frameGeo, new THREE.LineBasicMaterial({ color: FRAME_COLOR.none }));
  frame.position.y = 0.5;
  cell.add(frame);

  const spin = new THREE.Group();
  cell.add(spin);
  spinners.push(spin);
  cells.push({ meta, cell, frame });

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
  `${metas.length} parts · 红=socketA(底) 蓝=socketB(顶) · 空格暂停 · 点部件评级(未评→keep→reject)`,
  `行(上→下): ${usedSlots.join(' / ')}`,
  `列(左→右): ${VARIANT_ORDER.join(' / ')}`,
  odd.length ? `\n⚠ 可疑: ${odd.map((m) => `${m.id}(girth=${m.localGirth.toFixed(2)})`).join(', ')}` : '\n✓ 没有明显异常的比例',
].join('\n');

function paintFrames() {
  for (const c of cells) {
    const v = curation[c.meta.id]?.verdict ?? 'none';
    (c.frame.material as THREE.LineBasicMaterial).color.setHex(FRAME_COLOR[v] ?? FRAME_COLOR.none);
  }
  const keep = Object.values(curation).filter((x) => x.verdict === 'keep').length;
  const rej = Object.values(curation).filter((x) => x.verdict === 'reject').length;
  stat.textContent = `策展: keep ${keep} · reject ${rej} · 未评 ${metas.length - keep - rej}`;
}
const stat = document.createElement('div');
stat.style.cssText = 'position:fixed;right:12px;top:10px;color:#9aa;font:12px ui-monospace,monospace';
document.body.appendChild(stat);
paintFrames();

// 点一下循环 未评 → keep → reject → 未评。好素材必须显式保留（docs/14 §5）
const ray = new THREE.Raycaster();
renderer.domElement.addEventListener('pointerdown', async (ev) => {
  const rect = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((ev.clientX - rect.left) / rect.width) * 2 - 1,
    -((ev.clientY - rect.top) / rect.height) * 2 + 1,
  );
  ray.setFromCamera(ndc, camera);
  let best: typeof cells[number] | null = null, bestD = Infinity;
  for (const c of cells) {
    const d = Math.hypot(c.cell.position.x - ray.ray.origin.x - ray.ray.direction.x * 10,
                         c.cell.position.y + 0.5 - ray.ray.origin.y - ray.ray.direction.y * 10);
    if (d < bestD) { bestD = d; best = c; }
  }
  if (!best || bestD > CW * 0.6) return;
  const cur = curation[best.meta.id]?.verdict ?? null;
  const next: Verdict = cur === null ? 'keep' : cur === 'keep' ? 'reject' : null;
  if (next === null) delete curation[best.meta.id]; else curation[best.meta.id] = { verdict: next };
  paintFrames();
  await fetch('/__curate', { method: 'POST', body: JSON.stringify({ id: best.meta.id, verdict: next }) });
});

let paused = false;
addEventListener('keydown', (e) => { if (e.code === 'Space') { paused = !paused; e.preventDefault(); } });

let t = 0;
renderer.setAnimationLoop(() => {
  if (!paused) { t += 0.006; for (const s of spinners) s.rotation.y = t; }
  renderer.render(scene, camera);
});
