/**
 * 部件读片 —— `/dev/sheet.html`。
 *
 * 这是项目最早的那张部件对照表（`dev/parts.ts`，后来被改写成 `/parts` 档案页之前的样子）：
 * 像医院灯箱上一排排 X 光片 —— **行是槽位、列是物种·变体**，每一格一件部件、自己慢转，
 * 红点 = socketA 必须在底、蓝点 = socketB 必须在顶，外框就是它的评级：**绿 = 保留、红 = 不合格、灰 = 未评**。
 * 点一格就在三档之间循环。作品负责人 2026-09-14 要把它作为可展示的页面放回工作台的「侧室」组。
 *
 * 两点和原版不同，都是为了"能在公网打开"：
 * 1. 数据只读运行时发布的 `/parts/parts.json` 与 `/parts/curation.json`（原版读 `_metas.json`，那是流水线中间产物，不进构建）。
 * 2. **点评级只在 dev server 上写回**（`/__curate`，`import.meta.env.DEV` 才探）。线上点一下只改这一屏，刷新就回到仓库里的评级 ——
 *    HUD 上照实写着是哪一种，不让人以为自己改了档案。
 */
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { PartLibraryIndex, PartMeta } from '../../core/src/types.ts';
import { mountPageHead } from '../src/ui/page.ts';

type Verdict = 'keep' | 'reject' | null;

mountPageHead({
  title: '部件读片',
  titleEn: 'Parts contact sheet',
  // 一行放得下：浮层页头折成两行会压到下面的读数（无头截图实测）
  note: '外框绿 = 保留，红 = 不合格，灰 = 未评。点一格换一档。',
  overlay: true,
});

const hud = document.getElementById('hud')!;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e0f12);

const renderer = new THREE.WebGPURenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xdfe6ef, 0x23242a, 1.4));
const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(1.5, 3, 2.5); scene.add(key);
const rim = new THREE.DirectionalLight(0x9ab6d8, 1.1); rim.position.set(-2, 1, -2); scene.add(rim);

const material = new THREE.MeshStandardMaterial({ color: 0xe9e5dd, roughness: 0.7, metalness: 0 });
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

const index: PartLibraryIndex = await (await fetch('/parts/parts.json')).json();
const metas: PartMeta[] = index.parts;
const curation: Record<string, { verdict: Verdict; note?: string }> =
  await fetch('/parts/curation.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));

/** dev server 上才有写回；生产构建里这是常量 false，请求连同分支一起被摇掉 */
async function canWrite(): Promise<boolean> {
  if (!import.meta.env.DEV) return false;
  try { return (await fetch('/__curate?probe', { method: 'POST' })).status === 204; } catch { return false; }
}
const writable = await canWrite();

// 行 = 槽位，列 = 物种·变体。同一行横着看就能比出风格 / 比例是否一致
const SLOT_ORDER = ['head', 'neck', 'spine', 'clavicle', 'upperArm', 'foreArm', 'hand', 'thigh', 'shin', 'foot', 'joint'];
const columnOf = (id: string): string => id.split('.').slice(1).join('.');
const COLUMNS = [...new Set(metas.map((m) => columnOf(m.id)))].sort();
const ROWS_USED = SLOT_ORDER.filter((s) => metas.some((m) => m.slot === s));
const COLS = Math.max(1, COLUMNS.length);
const ROWS = Math.max(1, ROWS_USED.length);
const CW = 1.25;
const CH = 1.5;

const FRAME: Record<'keep' | 'reject' | 'none', number> = { keep: 0x3ddc84, reject: 0xe0455a, none: 0x2a3038 };
const socketGeo = new THREE.SphereGeometry(0.028, 12, 8);
const socketA = new THREE.MeshBasicMaterial({ color: 0xff3355 });
const socketB = new THREE.MeshBasicMaterial({ color: 0x3399ff });
const axisMat = new THREE.LineBasicMaterial({ color: 0x3a4450 });
const axisGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)]);
const frameGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(CW * 0.9, 1.18, CW * 0.9));

interface Cell { meta: PartMeta; group: THREE.Group; frame: THREE.LineSegments; spin: THREE.Group }
const cells: Cell[] = [];

for (const meta of metas) {
  const col = Math.max(0, COLUMNS.indexOf(columnOf(meta.id)));
  const row = Math.max(0, ROWS_USED.indexOf(meta.slot));
  const group = new THREE.Group();
  group.position.set((col - (COLS - 1) / 2) * CW, (ROWS - 1 - row) * CH, 0);
  scene.add(group);

  const a = new THREE.Mesh(socketGeo, socketA); group.add(a);
  const b = new THREE.Mesh(socketGeo, socketB); b.position.y = 1; group.add(b);
  group.add(new THREE.Line(axisGeo, axisMat));

  const frame = new THREE.LineSegments(frameGeo, new THREE.LineBasicMaterial({ color: FRAME.none }));
  frame.position.y = 0.5;
  group.add(frame);

  const spin = new THREE.Group();
  group.add(spin);
  cells.push({ meta, group, frame, spin });

  loader.load(`/parts/${meta.file}`, (gltf) => {
    gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = material; });
    spin.add(gltf.scene);
  }, undefined, () => console.warn('[sheet] 部件加载失败', meta.file));
}

let camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -50, 50);
function fit(): void {
  const aspect = innerWidth / innerHeight;
  // 上面留出页头那几行的高度，读片不压在字底下
  let w = COLS * CW * 1.08;
  let h = ROWS * CH * 1.22;
  if (w / h < aspect) w = h * aspect; else h = w / aspect;
  camera = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, -50, 50);
  const cy = (ROWS - 1) * CH / 2 + 0.5 + h * 0.04;
  camera.position.set(0, cy, 10);
  camera.lookAt(0, cy, 0);
  renderer.setSize(innerWidth, innerHeight);
}
fit();
addEventListener('resize', fit);

function paint(): void {
  let keep = 0;
  let reject = 0;
  for (const c of cells) {
    const v = curation[c.meta.id]?.verdict ?? null;
    if (v === 'keep') keep++;
    if (v === 'reject') reject++;
    (c.frame.material as THREE.LineBasicMaterial).color.setHex(FRAME[v ?? 'none']);
  }
  const odd = metas.filter((m) => m.localGirth > 1.2 || m.localGirth < 0.08 || m.triCount > 5000).length;
  hud.textContent = [
    `${metas.length} 件 · ${COLS} 列 × ${ROWS} 行（${ROWS_USED.join(' / ')}）`,
    `保留 ${keep} · 不合格 ${reject} · 未评 ${metas.length - keep - reject}${odd ? ` · 比例可疑 ${odd}` : ''}`,
    writable ? '点一格：未评 → 保留 → 不合格，写回 curation.json' : '点一格只改这一屏（线上不写回），刷新回到仓库里的评级',
    '空格 暂停转动',
  ].join('\n');
}
paint();

// 点一下循环 未评 → 保留 → 不合格 → 未评
const ray = new THREE.Raycaster();
renderer.domElement.addEventListener('pointerdown', (ev) => {
  const rect = renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(
    ((ev.clientX - rect.left) / rect.width) * 2 - 1,
    -((ev.clientY - rect.top) / rect.height) * 2 + 1,
  ), camera);
  // 正交相机：射线原点就是点下去的那一点的世界坐标
  const px = ray.ray.origin.x;
  const py = ray.ray.origin.y;
  let best: Cell | null = null;
  let bestD = Infinity;
  for (const c of cells) {
    const d = Math.hypot(c.group.position.x - px, c.group.position.y + 0.5 - py);
    if (d < bestD) { bestD = d; best = c; }
  }
  if (!best || bestD > CW * 0.6) return;
  const cur = curation[best.meta.id]?.verdict ?? null;
  const next: Verdict = cur === null ? 'keep' : cur === 'keep' ? 'reject' : null;
  if (next === null) delete curation[best.meta.id];
  else curation[best.meta.id] = { ...curation[best.meta.id], verdict: next };
  paint();
  if (writable) {
    void fetch('/__curate', { method: 'POST', body: JSON.stringify({ id: best.meta.id, verdict: next }) })
      .catch(() => console.warn('[sheet] 写回失败，这一次只改了这一屏'));
  }
});

let paused = false;
addEventListener('keydown', (e) => { if (e.code === 'Space') { paused = !paused; e.preventDefault(); } });

let t = 0;
renderer.setAnimationLoop(() => {
  if (!paused) { t += 0.006; for (const c of cells) c.spin.rotation.y = t; }
  renderer.render(scene, camera);
});
