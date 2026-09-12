/**
 * 部件缩略图 —— 档案页里每件部件左边那一格。
 *
 * 三条要求决定了这个文件长这样：
 *   1. **公网能打开。** 191 件部件不能在打开页面的一瞬间全部下载并渲染。
 *      → IntersectionObserver，滚到谁渲谁，渲完就把像素拷进一张 2D canvas，
 *        three 那边的几何立刻释放。全程只有一个 renderer、一份显存。
 *   2. **没有 WebGL 也要好看**（docs/23 §S2「降级路径也是作品的一部分」）。
 *      → 退回**比例剪影**：按 aabb 画一个真实比例的矩形 + 中轴线 + 两个端点。
 *        它不是兜底的丑图，它回答的正是这张接触表本来要回答的问题 ——
 *        这件东西是细长的还是墩实的、socket 在不在两端。
 *   3. **一件加载失败不许影响其它件**（docs/23 §S0「单个 glb 失败 → 占位」）。
 *      → 失败就画比例剪影，不显示破图、不在控制台刷屏。
 *
 * 踩过的坑：renderer 的 canvas 直接塞进 DOM 会有 191 个 WebGL 上下文
 * （浏览器上限是 16 左右，超了会静默丢弃最早的那些，页面滚一屏就开始出现白格）。
 * 所以必须是「一个离屏 renderer + drawImage 到 2D canvas」这个形状。
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { PartMeta } from '../../core/src/types.ts';

/** 缩略图边长（CSS 像素）。再小就看不出比例，再大 191 件就太重 */
export const THUMB = 96;
const DPR = Math.min(devicePixelRatio || 1, 2);

const INK = '#9aa0a6';
const RULE = '#2a3038';
const SOCKET_A = '#e0455a';   // 底，和原来的接触表同一套颜色约定
const SOCKET_B = '#5b93d6';   // 顶

// ── 一个 renderer，全页共用 ────────────────────────────────────────────────

interface Rig {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  material: THREE.MeshStandardMaterial;
  holder: THREE.Group;
}

let rig: Rig | null = null;
let rigTried = false;

function getRig(): Rig | null {
  if (rigTried) return rig;
  rigTried = true;
  try {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(THUMB * DPR, THUMB * DPR, false);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xdfe6ef, 0x23242a, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(1.5, 3, 2.5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x9ab6d8, 1.0);
    rim.position.set(-2, 1, -2);
    scene.add(rim);

    // 部件的约定：长度归一到 1，socketA 在 (0,0,0)，socketB 在 (0,1,0)。
    // 所以正交相机固定框住 y ∈ [-0.1, 1.1] 就一定能把任何一件装下。
    const camera = new THREE.OrthographicCamera(-0.62, 0.62, 1.15, -0.09, -10, 10);
    camera.position.set(0.9, 0.5, 1.6);
    camera.lookAt(0, 0.5, 0);

    const holder = new THREE.Group();
    scene.add(holder);

    const material = new THREE.MeshStandardMaterial({ color: 0xe9e5dd, roughness: 0.72, metalness: 0 });
    return (rig = { renderer, scene, camera, material, holder });
  } catch {
    // 没有 WebGL。不是错误，是一条被设计过的路径。
    return (rig = null);
  }
}

/** 这一页到底是在渲真件还是在画比例剪影 —— 页头要如实说出来 */
export function thumbsUseGl(): boolean {
  return getRig() !== null;
}

// ── 比例剪影（没有 WebGL / 加载失败时的那张图）─────────────────────────────

function drawSilhouette(ctx: CanvasRenderingContext2D, meta: PartMeta): void {
  const w = THUMB;
  ctx.clearRect(0, 0, w, w);

  // 归一化后长度恒为 1，横向尺寸由 aabb 给出。按最宽的那一边等比装进格子。
  const sx = Math.abs(meta.aabb.max[0] - meta.aabb.min[0]);
  const sz = Math.abs(meta.aabb.max[2] - meta.aabb.min[2]);
  const girth = Math.max(sx, sz, meta.localGirth, 0.02);
  const pad = 12;
  const box = w - pad * 2;
  const scale = box / Math.max(1, girth);
  const bw = Math.max(2, girth * scale);
  const bh = 1 * scale;
  const x = (w - bw) / 2;
  const y = (w - bh) / 2;

  ctx.strokeStyle = RULE;
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(bw), Math.round(bh));

  // 中轴：+Y。这是 docs/04 里那条唯一的约定，画出来比写出来管用
  ctx.strokeStyle = INK;
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.moveTo(w / 2, y);
  ctx.lineTo(w / 2, y + bh);
  ctx.stroke();
  ctx.globalAlpha = 1;

  const dot = (cy: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(w / 2, cy, 2.6, 0, Math.PI * 2);
    ctx.fill();
  };
  dot(y + bh, SOCKET_A);   // socketA 在底
  dot(y, SOCKET_B);        // socketB 在顶
}

// ── 真件渲染 ───────────────────────────────────────────────────────────────

const loader = new GLTFLoader();

function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) mesh.geometry?.dispose();
  });
}

async function renderPart(ctx: CanvasRenderingContext2D, meta: PartMeta, partsBase: string): Promise<boolean> {
  const r = getRig();
  if (!r) return false;
  let gltf;
  try {
    gltf = await loader.loadAsync(`${partsBase}/${meta.file}`);
  } catch {
    return false;   // 单件失败：静默退到剪影，不吼、不显示破图
  }
  gltf.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) mesh.material = r.material;
  });
  r.holder.add(gltf.scene);
  try {
    r.renderer.render(r.scene, r.camera);
    ctx.clearRect(0, 0, THUMB, THUMB);
    ctx.drawImage(r.renderer.domElement, 0, 0, THUMB, THUMB);
  } catch {
    return false;
  } finally {
    r.holder.remove(gltf.scene);
    disposeTree(gltf.scene);
  }
  return true;
}

// ── 对外：一格缩略图 ───────────────────────────────────────────────────────

/**
 * 造一格缩略图并登记懒加载。返回的 canvas 立刻就有内容（比例剪影），
 * 滚进视口后被真件替换 —— 所以**任何时刻都不会出现空白格**。
 */
export function createThumb(
  meta: PartMeta,
  observer: IntersectionObserver,
  partsBase: string,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = THUMB;
  canvas.height = THUMB;
  canvas.style.width = `${THUMB}px`;
  canvas.style.height = `${THUMB}px`;
  const ctx = canvas.getContext('2d')!;
  drawSilhouette(ctx, meta);
  pending.set(canvas, { meta, ctx, partsBase });
  observer.observe(canvas);
  return canvas;
}

const pending = new Map<HTMLCanvasElement, { meta: PartMeta; ctx: CanvasRenderingContext2D; partsBase: string }>();

/**
 * 造观察器。串行渲染：一次只渲一件 —— 一屏十几件同时 loadAsync 会把
 * 主线程钉死好几秒，滚动直接卡成幻灯片。慢一点但一直是活的，这是对的取舍。
 */
export function createThumbObserver(): IntersectionObserver {
  const queue: HTMLCanvasElement[] = [];
  let running = false;

  async function drain(): Promise<void> {
    if (running) return;
    running = true;
    while (queue.length) {
      const canvas = queue.shift()!;
      const job = pending.get(canvas);
      if (!job) continue;
      pending.delete(canvas);
      await renderPart(job.ctx, job.meta, job.partsBase);
      // 让一帧出去，别把滚动卡住
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    running = false;
  }

  const observer = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const canvas = e.target as HTMLCanvasElement;
      observer.unobserve(canvas);
      if (pending.has(canvas)) queue.push(canvas);
    }
    if (getRig()) void drain();
  }, { rootMargin: '400px 0px' });

  return observer;
}
