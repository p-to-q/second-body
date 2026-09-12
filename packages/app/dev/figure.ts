/**
 * 装配预览（dev 工具）—— 在姿态追踪还不存在的时候，就把
 * 「资产 → genome → 挂载数学 → 实例化渲染」这条链子整体验证一遍。
 *
 * 它用一副**合成的 A-pose 骨架**（写死的关节坐标，身高 1.7m）驱动真正的运行时模块：
 *   `src/assets/library.ts`（PartLibrary） + `src/creature/creature.ts`（Creature）。
 * 装配逻辑不再住在这个文件里 —— 这里只剩"假骨架 + 相机 + HUD"。
 * 所以任何比例错误、朝向错误（flip）、槽位缺失都会在这里一眼看出来，
 * 而且看到的就是运行时真正会跑的那份代码。
 *
 * URL：?theme=porcelain  ?seed=1234  ?tier=0..3  ?debug=1
 * 键：←/→ 换主题，↑/↓ 换 tier，N 下一个 seed，空格暂停旋转，S 显示/隐藏骨架线。
 */
import * as THREE from 'three/webgpu';
import { makeGenome, themeIsUsable } from '../../core/src/genome.ts';
import { ALL_BONE_IDS } from '../../core/src/slots.ts';
import { BUDGET, SKELETON, TIME } from '../../core/src/tuning.ts';
import type { Bone, BoneId, Genome, Presence, Skeleton, Tier, Vec3 } from '../../core/src/types.ts';
import { createPartLibrary } from '../src/assets/library.ts';
import { partIdsOf } from '../src/creature/assemble.ts';
import { createCreature } from '../src/creature/creature.ts';

const hud = document.getElementById('hud')!;
const qs = new URLSearchParams(location.search);
const DEBUG = qs.get('debug') === '1';
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
const skeleton: Skeleton = { bones, joints: J, height: BODY_HEIGHT, warmingUp: false, t: 0 };
// dev 页面永远"在场"：不做进出场动画，免得截图时抓到半透明的中间态
const presence: Presence = { state: 'ALIVE', elapsed: 999, transition: 1 };

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

const skelGroup = new THREE.Group(); scene.add(skelGroup);
for (const b of bones) {
  skelGroup.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...b.p0), new THREE.Vector3(...b.p1)]),
    new THREE.LineBasicMaterial({ color: 0x4a90d9 }),
  ));
}
skelGroup.visible = false;

// ── 运行时模块 ──────────────────────────────────────────────────────────────
const library = createPartLibrary();
await library.load();                          // parts.json 缺失也 resolve → 占位模式
const creature = createCreature({ library });
scene.add(creature.object);

const themes = library.index.themes.map((t) => t.id)
  .filter((id) => library.usingFallback || themeIsUsable(library.index, id, 3));
if (!themes.length) themes.push('placeholder');

// 注意 Number(null) === 0 —— 不显式挡掉 null，?tier 缺省就会悄悄变成 tier 0
const asInt = (v: string | null, fallback: number) => {
  if (v === null || v.trim() === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};
let seed = asInt(qs.get('seed'), 1) >>> 0;
let tier = Math.min(3, Math.max(0, asInt(qs.get('tier'), 2))) as Tier;
let themeIdx = Math.max(0, themes.indexOf(qs.get('theme') ?? themes[0]));
let genome: Genome = makeGenome(seed, tier, library.index, { theme: themes[themeIdx] });

async function rebuild() {
  genome = makeGenome(seed, tier, library.index, { theme: themes[themeIdx] });
  await library.preload(partIdsOf(genome));    // 预取后再 remorph → 截图不会拍到占位体
  creature.remorph(genome);                    // 第一次调用直接成型，之后是 crossfade
  creature.pose(skeleton, presence, 1 / 60);
  syncUrl();
}

function syncUrl() {
  const p = new URLSearchParams(location.search);
  p.set('theme', themes[themeIdx]); p.set('seed', String(seed)); p.set('tier', String(tier));
  history.replaceState(null, '', `?${p}`);
}

await rebuild();
camera.position.set(1.7, 1.25, 2.7);
camera.lookAt(0, 0.95, 0);

// ?debug=1 时把内部状态挂出来，方便在控制台量 pose() 的 CPU 开销、比对 genome 的确定性、截图取证
if (DEBUG) {
  Object.assign(globalThis as Record<string, unknown>, {
    __figure: {
      library, creature, skeleton, presence, themes,
      get genome() { return genome; },
      get stats() { return creature.stats; },
      async set(next: { theme?: string; seed?: number; tier?: number }) {
        if (next.theme && themes.includes(next.theme)) themeIdx = themes.indexOf(next.theme);
        if (Number.isFinite(next.seed)) seed = (next.seed as number) >>> 0;
        if (Number.isFinite(next.tier)) tier = Math.min(3, Math.max(0, next.tier as number)) as Tier;
        await rebuild();
        return genome;
      },
    },
  });
}

// ── HUD ─────────────────────────────────────────────────────────────────────
let jsMs = 0;
let poseMs = 0;
let fps = 60;
function drawHud() {
  const def = library.index.themes.find((t) => t.id === themes[themeIdx]);
  const s = creature.stats;
  const missing = Object.entries(genome.slots)
    .filter(([, pick]) => pick.partId.startsWith('placeholder:'))
    .map(([k]) => k);
  hud.innerHTML =
    `<b>${def ? `${def.name} · ${def.nameEn}` : themes[themeIdx]}</b>  (${themeIdx + 1}/${themes.length})\n` +
    `${def?.tagline ?? ''}\n\n` +
    `seed ${seed} · tier ${tier} · 身高 ${BODY_HEIGHT}m\n` +
    `←/→ 主题 · ↑/↓ tier · N 换 seed · 空格 暂停 · S 骨架线\n` +
    (library.usingFallback ? '⚠ parts.json 不可用 → 程序化占位几何（P3）\n' : '') +
    (missing.length ? `⚠ 占位槽位: ${missing.join(', ')}\n` : '✓ 槽位齐全\n') +
    (DEBUG
      ? `\n实例 ${s.instances}/${BUDGET.maxInstances} · 三角 ${s.triangles.toLocaleString()} · draw ${s.drawCalls}\n` +
        `${fps.toFixed(0)} fps · pose ${poseMs.toFixed(2)}ms · frame ${jsMs.toFixed(2)}ms · 占位实例 ${s.placeholders} · 换装 ${s.swapsActive}活/${s.swapsQueued}排\n` +
        `资产 ${library.stats.loaded} 已加载 / ${library.stats.failed} 失败 / ${library.stats.pending} 在途`
      : '');
}

// ── 交互 ────────────────────────────────────────────────────────────────────
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
let paused = false, spin = 0;
addEventListener('keydown', async (e) => {
  if (e.code === 'Space') { paused = !paused; e.preventDefault(); return; }
  if (e.code === 'KeyS') { skelGroup.visible = !skelGroup.visible; return; }
  // 不用 Math.random：同一串按键必须给出同一串身体（P1/P9）
  if (e.code === 'KeyN') { seed = (seed * 1664525 + 1013904223) >>> 0; await rebuild(); return; }
  if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
    const d = e.code === 'ArrowRight' ? 1 : -1;
    themeIdx = (themeIdx + d + themes.length) % themes.length;
    await rebuild(); return;
  }
  if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
    tier = Math.min(3, Math.max(0, tier + (e.code === 'ArrowUp' ? 1 : -1))) as Tier;
    await rebuild();
  }
});

// ── 帧循环 ──────────────────────────────────────────────────────────────────
let last = performance.now();
let hudAt = 0;
renderer.setAnimationLoop((now: number) => {
  const dt = Math.min(TIME.dtMax, Math.max(TIME.dtMin, (now - last) / 1000));
  last = now;
  fps = fps * 0.92 + (1 / dt) * 0.08;
  const t0 = performance.now();
  if (!paused) spin += dt * 0.3;
  const a = Math.sin(spin) * 0.9;
  camera.position.set(Math.sin(a) * 3.1, 1.25, Math.cos(a) * 3.1);
  camera.lookAt(0, 0.95, 0);
  creature.pose(skeleton, presence, dt);
  const t1 = performance.now();
  renderer.render(scene, camera);
  // poseMs = Creature 自己的 CPU 预算（docs/02 P5 的"CPU 每帧 JS"）；
  // renderMs = three 提交一帧的开销，不属于本任务，但红了要知道是谁红的
  poseMs = poseMs * 0.9 + (t1 - t0) * 0.1;
  jsMs = jsMs * 0.9 + (performance.now() - t0) * 0.1;
  if (now - hudAt > 200) { hudAt = now; drawHud(); }   // HUD 每 200ms 一次，别让 innerHTML 进预算
});
