/**
 * 团块身体调试页（dev 工具）—— `src/creature/mass.ts` 的取证台。
 *
 * 它用一副**合成骨架**（A-pose ↔ 大动作两个关键帧之间插值，身高 1.7m）驱动真正的
 * `createMassBody()`，并且能把它和现有的刚体渲染器 `createCreature()` **并排**摆出来。
 * 并排那一张是判断「像不像原作那种流过身体的物质」的唯一办法 ——
 * 单看团块永远说得过去，和手办摆在一起才看得出差在哪。
 *
 * URL：?res=40  ?mode=mass|rig|compare  ?pose=a|big|anim  ?theme=coral  ?seed=1  ?tier=2
 *      ?angle=0.35 固定转台角度  ?still=90 跑满 90 帧就停（截图取证用：headless 下
 *      永不停的 rAF 会把 --virtual-time-budget 吊住）
 * 键：←/→ res（这是 mass 唯一的降级旋钮）· ↑/↓ 换主题 · M 换模式 · P 换姿势
 *     空格 暂停转台 · S 骨架线
 */
import * as THREE from 'three/webgpu';
import { makeGenome, themeIsUsable } from '../../core/src/genome.ts';
import { ALL_BONE_IDS } from '../../core/src/slots.ts';
import { BUDGET, SKELETON, TIME } from '../../core/src/tuning.ts';
import type { Bone, BoneId, Presence, Skeleton, Tier, Vec3 } from '../../core/src/types.ts';
import { createPartLibrary } from '../src/assets/library.ts';
import { partIdsOf } from '../src/creature/assemble.ts';
import { createCreature } from '../src/creature/creature.ts';
import { createMassBody } from '../src/creature/mass.ts';
import { mountPageHead } from '../src/ui/page.ts';

mountPageHead({
  title: '团块身体', titleEn: 'Mass body', overlay: true,
  note: '不走刚体挂载的那种身体：它由物质构成，不是由零件构成。',
});

const hud = document.getElementById('hud')!;
const tag = document.getElementById('tag')!;
const qs = new URLSearchParams(location.search);
const BODY_HEIGHT = SKELETON.referenceHeight;

// ── 合成骨架：两个关键帧（米，Y-up，面朝 +Z；左侧在 +X），与 dev/figure.ts 同一副 ──────
type Joints = Record<string, Vec3>;

/** 静止：A-pose */
const POSE_A: Joints = {
  pelvis: [0, 0.95, 0], chest: [0, 1.35, 0], neck: [0, 1.45, 0], headCenter: [0, 1.60, 0],
  shoulderL: [0.19, 1.38, 0], elbowL: [0.36, 1.10, 0.02], wristL: [0.47, 0.86, 0.04], handTipL: [0.51, 0.76, 0.05],
  shoulderR: [-0.19, 1.38, 0], elbowR: [-0.36, 1.10, 0.02], wristR: [-0.47, 0.86, 0.04], handTipR: [-0.51, 0.76, 0.05],
  hipL: [0.09, 0.93, 0], kneeL: [0.10, 0.51, 0.01], ankleL: [0.10, 0.09, 0], footIdxL: [0.10, 0.03, 0.16],
  hipR: [-0.09, 0.93, 0], kneeR: [-0.10, 0.51, 0.01], ankleR: [-0.10, 0.09, 0], footIdxR: [-0.10, 0.03, 0.16],
};

/** 大动作：一手举过头顶、一手甩到身侧后方、一腿抬起跨出去。故意不对称 */
const POSE_BIG: Joints = {
  pelvis: [0, 0.98, 0], chest: [0.02, 1.38, 0.03], neck: [0.03, 1.48, 0.04], headCenter: [0.05, 1.62, 0.06],
  shoulderL: [0.20, 1.41, 0.01], elbowL: [0.42, 1.62, 0.05], wristL: [0.52, 1.90, 0.08], handTipL: [0.55, 2.00, 0.09],
  shoulderR: [-0.20, 1.40, 0], elbowR: [-0.48, 1.30, 0.10], wristR: [-0.62, 1.05, 0.30], handTipR: [-0.64, 0.97, 0.38],
  hipL: [0.10, 0.96, 0], kneeL: [0.26, 0.58, 0.14], ankleL: [0.30, 0.22, 0.34], footIdxL: [0.30, 0.18, 0.48],
  hipR: [-0.10, 0.96, 0], kneeR: [-0.12, 0.52, -0.02], ankleR: [-0.13, 0.09, 0], footIdxR: [-0.13, 0.03, 0.16],
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

const joints: Joints = {};
const bones: Bone[] = ALL_BONE_IDS.map((id) => ({
  id, p0: [0, 0, 0], p1: [0, 0, 0], length: 0, roll: 0, confidence: 1,
}));
const skeleton: Skeleton = { bones, joints, height: BODY_HEIGHT, warmingUp: false, t: 0 };
// dev 页面永远"在场"：不做进出场动画，免得截图抓到半透明的中间态
const presence: Presence = { state: 'ALIVE', elapsed: 999, transition: 1 };

/** k=0 → A-pose，k=1 → 大动作。**就地改写** skeleton，帧循环里不分配 */
function setPose(k: number) {
  for (const key of Object.keys(POSE_A)) {
    const a = POSE_A[key], b = POSE_BIG[key] ?? a;
    let j = joints[key];
    if (!j) { j = [0, 0, 0]; joints[key] = j; }
    j[0] = a[0] + (b[0] - a[0]) * k;
    j[1] = a[1] + (b[1] - a[1]) * k;
    j[2] = a[2] + (b[2] - a[2]) * k;
  }
  for (const bone of bones) {
    const [ja, jb] = BONE_JOINTS[bone.id];
    const p0 = joints[ja], p1 = joints[jb];
    bone.p0[0] = p0[0]; bone.p0[1] = p0[1]; bone.p0[2] = p0[2];
    bone.p1[0] = p1[0]; bone.p1[1] = p1[1]; bone.p1[2] = p1[2];
    bone.length = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
  }
}

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
const ground = new THREE.Mesh(new THREE.CircleGeometry(3.2, 64),
  new THREE.MeshStandardMaterial({ color: 0x17181c, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; scene.add(ground);

const skelGroup = new THREE.Group(); scene.add(skelGroup);
const skelLines = bones.map(() => {
  const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x4a90d9 }));
  skelGroup.add(line);
  return g;
});
skelGroup.visible = false;
function syncSkelLines() {
  for (let i = 0; i < bones.length; i++) {
    const b = bones[i];
    const pos = skelLines[i].getAttribute('position') as THREE.BufferAttribute;
    pos.setXYZ(0, b.p0[0], b.p0[1], b.p0[2]);
    pos.setXYZ(1, b.p1[0], b.p1[1], b.p1[2]);
    pos.needsUpdate = true;
  }
}

// ── 运行时模块 ──────────────────────────────────────────────────────────────
const library = createPartLibrary();
await library.load();                          // parts.json 缺失也 resolve → 占位模式

const themes = library.index.themes.map((t) => t.id)
  .filter((id) => library.usingFallback || themeIsUsable(library.index, id, 3));
if (!themes.length) themes.push('placeholder');

const asInt = (v: string | null, fallback: number) => {
  if (v === null || v.trim() === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};
let themeIdx = Math.max(0, themes.indexOf(qs.get('theme') ?? themes[0]));
const seed = asInt(qs.get('seed'), 1) >>> 0;
const tier = Math.min(3, Math.max(0, asInt(qs.get('tier'), 2))) as Tier;

// 团块。两边各自一个 Group 承载，compare 模式下左右分开摆
const massHolder = new THREE.Group(); scene.add(massHolder);
const mass = createMassBody({ library, theme: themes[themeIdx], res: asInt(qs.get('res'), 40) });
massHolder.add(mass.object);

// 刚体版（对照组）。只在需要时才建，免得 mass-only 模式白付一份装配开销
const rigHolder = new THREE.Group(); scene.add(rigHolder);
let creature: ReturnType<typeof createCreature> | null = null;
async function ensureCreature() {
  if (creature) return creature;
  creature = createCreature({ library });
  rigHolder.add(creature.object);
  const genome = makeGenome(seed, tier, library.index, { theme: themes[themeIdx] });
  await library.preload(partIdsOf(genome));    // 预取后再 remorph → 截图不会拍到占位体
  creature.remorph(genome);
  return creature;
}
async function reskinCreature() {
  if (!creature) return;
  const genome = makeGenome(seed, tier, library.index, { theme: themes[themeIdx] });
  await library.preload(partIdsOf(genome));
  creature.remorph(genome);
}

type Mode = 'mass' | 'rig' | 'compare';
const MODES: Mode[] = ['mass', 'rig', 'compare'];
let mode = (MODES.includes(qs.get('mode') as Mode) ? qs.get('mode') : 'mass') as Mode;

type PoseMode = 'a' | 'big' | 'anim';
const POSES: PoseMode[] = ['a', 'big', 'anim'];
let poseMode = (POSES.includes(qs.get('pose') as PoseMode) ? qs.get('pose') : 'a') as PoseMode;

const SPLIT = 0.85;   // compare 模式下两具身体各自偏移多少米

async function applyMode() {
  if (mode === 'mass') {
    massHolder.visible = true; massHolder.position.x = 0;
    rigHolder.visible = false;
  } else if (mode === 'rig') {
    await ensureCreature();
    massHolder.visible = false;
    rigHolder.visible = true; rigHolder.position.x = 0;
  } else {
    await ensureCreature();
    massHolder.visible = true; massHolder.position.x = -SPLIT;
    rigHolder.visible = true; rigHolder.position.x = SPLIT;
  }
  syncUrl();
}

function syncUrl() {
  const p = new URLSearchParams(location.search);
  p.set('mode', mode); p.set('pose', poseMode); p.set('res', String(mass.res));
  p.set('theme', themes[themeIdx]);
  history.replaceState(null, '', `?${p}`);
}

setPose(poseMode === 'big' ? 1 : 0);
await applyMode();

camera.position.set(0, 1.15, 4.4);
camera.lookAt(0, 1.0, 0);

// 控制台取证用
Object.assign(globalThis as Record<string, unknown>, {
  __mass: {
    mass, skeleton, presence, themes,
    get creature() { return creature; },
    get stats() { return mass.stats; },
    get rigStats() { return creature?.stats ?? null; },
    get fps() { return fps; },
    setRes(n: number) { mass.setRes(n); syncUrl(); return mass.res; },
    async setMode(m: Mode) { mode = m; await applyMode(); return mode; },
    setPose(p: PoseMode) { poseMode = p; if (p !== 'anim') setPose(p === 'big' ? 1 : 0); syncUrl(); return p; },
    async setTheme(id: string) {
      if (!themes.includes(id)) return themes[themeIdx];
      themeIdx = themes.indexOf(id); mass.setTheme(id); await reskinCreature(); syncUrl();
      return id;
    },
    setSpin(v: boolean) { paused = !v; return !paused; },
    setAngle(a: number) { spinAngle = a; paused = true; return a; },
    /**
     * 取证用：这一帧真正提交给 GPU 的面数 / draw 数（`renderer.info`）。
     * 和 `stats.triangles` 对不上 = 有人在偷偷实例化。`docs/18 §7` 的配方用它。
     */
    get submitted() {
      const r = renderer.info.render;
      return { triangles: r.triangles, drawCalls: r.drawCalls };
    },
  },
});

// ── HUD ─────────────────────────────────────────────────────────────────────
let jsMs = 0;
let fps = 60;
/**
 * 这一帧**真正提交给 GPU** 的面数（`renderer.info`），和团块自报的 `stats.triangles`
 * 分开显示。两者一旦对不上，就说明有人在这条路上偷偷实例化 —— 那正是
 * 「2k 面的身体每帧提交 1200 万面」那个根因的表征。留着它，下次一眼就能看见。
 */
let gpuTris = 0;
function drawHud() {
  const s = mass.stats;
  const r = creature?.stats;
  const def = library.index.themes.find((t) => t.id === themes[themeIdx]);
  const overBudget = s.cpuMs > BUDGET.maxCpuMsPerFrame;
  // fps 独占一行、掉帧就整行标红。**毫秒和帧率不是同一件事**：团块曾经每帧
  // 只花 1~2ms JS 却只跑 9 fps（时间全在 GPU 提交那一侧），当时这一行是灰的，
  // 旁边 `frame 2.42ms` 一片祥和，于是这件事在眼皮底下待了很久。见 BUDGET.minFps。
  const slow = fps < BUDGET.minFps;
  hud.innerHTML =
    `<b>mass · 团块</b>  ${def ? `${def.name} · ${def.nameEn}` : themes[themeIdx]}\n` +
    `模式 ${mode} · 姿势 ${poseMode}\n` +
    `←/→ res · ↑/↓ 主题 · M 模式 · P 姿势 · 空格 转台 · S 骨架线\n\n` +
    `<b>res ${s.resolution}</b> · 球 ${s.balls} · 三角 ${s.triangles.toLocaleString()} · draw ${s.drawCalls}\n` +
    `<span style="color:${slow ? '#e0455a' : '#9aa'}"><b>${fps.toFixed(0)} fps</b>` +
    `${slow ? ` ⚠ 掉帧（下限 ${BUDGET.minFps}）` : ''}</span>\n` +
    `mass ${s.cpuMs.toFixed(2)}ms${overBudget ? ' ⚠超预算' : ''} · frame ${jsMs.toFixed(2)}ms` +
    ` · 提交 ${(gpuTris / 1000).toFixed(1)}k 面/帧\n` +
    `预算 ${BUDGET.maxTriangles.toLocaleString()} 三角 / ${BUDGET.maxDrawCalls} draw / ${BUDGET.maxCpuMsPerFrame}ms\n` +
    (r ? `\n<b>rig · 刚体对照</b>  实例 ${r.instances} · 三角 ${r.triangles.toLocaleString()} · draw ${r.drawCalls}\n` : '') +
    (library.usingFallback ? '\n⚠ parts.json 不可用 → 程序化占位几何（P3）' : '');
  tag.textContent = mode === 'compare' ? '← mass（团块，1 draw）        刚体（一骨一件）→' : '';
}

// ── 交互 ────────────────────────────────────────────────────────────────────
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
let paused = qs.has('angle');
let spinAngle = qs.has('angle') ? Number(qs.get('angle')) || 0 : 0;
addEventListener('keydown', async (e) => {
  if (e.code === 'Space') { paused = !paused; e.preventDefault(); return; }
  if (e.code === 'KeyS') { skelGroup.visible = !skelGroup.visible; return; }
  if (e.code === 'KeyM') { mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length]; await applyMode(); return; }
  if (e.code === 'KeyP') {
    poseMode = POSES[(POSES.indexOf(poseMode) + 1) % POSES.length];
    if (poseMode !== 'anim') setPose(poseMode === 'big' ? 1 : 0);
    syncUrl(); return;
  }
  if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
    // res 是这个方案唯一的降级旋钮：帧率掉了就降它
    mass.setRes(mass.res + (e.code === 'ArrowRight' ? 4 : -4));
    syncUrl(); return;
  }
  if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
    themeIdx = (themeIdx + (e.code === 'ArrowUp' ? 1 : -1) + themes.length) % themes.length;
    mass.setTheme(themes[themeIdx]);
    await reskinCreature();
    syncUrl();
  }
});

// ── 帧循环 ──────────────────────────────────────────────────────────────────
let last = performance.now();
let hudAt = 0;
let animT = 0;
// ?still=N：跑满 N 帧（够 EMA 收敛）就停。headless 截图必须有这个 ——
// 永不停的 rAF 会把 Chrome 的 --virtual-time-budget 一直吊住，截不出图。
const stillFrames = qs.has('still') ? Math.max(1, asInt(qs.get('still'), 90)) : 0;
let frameNo = 0;
renderer.setAnimationLoop((now: number) => {
  const dt = Math.min(TIME.dtMax, Math.max(TIME.dtMin, (now - last) / 1000));
  last = now;
  fps = fps * 0.92 + (1 / dt) * 0.08;
  const t0 = performance.now();

  if (poseMode === 'anim') {
    animT += dt;
    setPose(0.5 - 0.5 * Math.cos(animT * 1.6));
  }
  skeleton.t = now / 1000;
  if (skelGroup.visible) syncSkelLines();

  if (!paused) spinAngle += dt * 0.3;
  const a = Math.sin(spinAngle) * 0.75;
  const dist = mode === 'compare' ? 6.4 : 4.0;
  camera.position.set(Math.sin(a) * dist, 1.15, Math.cos(a) * dist);
  camera.lookAt(0, 1.0, 0);

  if (massHolder.visible) mass.pose(skeleton, presence, dt);
  if (creature && rigHolder.visible) creature.pose(skeleton, presence, dt);

  renderer.render(scene, camera);
  gpuTris = renderer.info.render.triangles;
  jsMs = jsMs * 0.9 + (performance.now() - t0) * 0.1;
  if (now - hudAt > 200) { hudAt = now; drawHud(); }   // HUD 每 200ms 一次，别让 innerHTML 进预算

  if (stillFrames && ++frameNo >= stillFrames) {
    drawHud();
    renderer.setAnimationLoop(null);
    document.title = `Mass body · still · ${mass.stats.triangles} tris`;
  }
});
