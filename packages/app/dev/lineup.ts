/**
 * 形体并排（dev 工具）—— 把若干条目**同时**摆在一排，各自用各自的身体方案。
 *
 * 它存在的唯一理由是 docs/PRD.md §5 的第 3 条：
 * 「三个物种并排给人看，对方能说出它们形体上的区别，而不只是颜色。」
 * 这条是六条判据里唯一确凿成立的一条，而它是靠身体方案挣来的 ——
 * 所以每次加新方案，都要拿这一页重新自证它**没有被做没**，最好是更强了。
 *
 * 用的是真正的运行时模块（`remapSkeleton` + `createCreature`），不是示意图。
 * 摆位的办法是**平移骨架本身**而不是平移渲染节点：这样身体的位置完全由数据决定，
 * 两种渲染器（刚体 / 团块）都一样管用，不需要任何一方配合。
 *
 * URL：?ids=orb,furball,...  ?pose=apose|raise|crouch|open  ?tier=0..3  ?seed=1
 *     ?still=N  跑满 N 帧就停 —— headless 取证必须有这个，否则永不停的 rAF
 *               会把 Chrome 的 --virtual-time-budget 吊住，截出来是空白页
 */
import * as THREE from 'three/webgpu';
import { remapSkeleton } from '../../core/src/bodyplan.ts';
import { makeGenome } from '../../core/src/genome.ts';
import { ALL_BONE_IDS } from '../../core/src/slots.ts';
import { SKELETON, TIME } from '../../core/src/tuning.ts';
import type { Bone, BoneId, Presence, Skeleton, Tier, Vec3 } from '../../core/src/types.ts';
import { createPartLibrary } from '../src/assets/library.ts';
import { partIdsOf } from '../src/creature/assemble.ts';
import { createCreature } from '../src/creature/creature.ts';
import { mountPageHead } from '../src/ui/page.ts';

mountPageHead({
  title: '形体并排', titleEn: 'Body plans side by side', overlay: true,
  note: '同一副人体骨架，几种身体方案 —— 差别在形体上，不在颜色上。',
});

const hud = document.getElementById('hud')!;
const qs = new URLSearchParams(location.search);
const H = SKELETON.referenceHeight;

const BASE: Record<string, Vec3> = {
  pelvis: [0, 0.95, 0], chest: [0, 1.35, 0], neck: [0, 1.45, 0], headCenter: [0, 1.60, 0],
  shoulderL: [0.19, 1.38, 0], elbowL: [0.36, 1.10, 0.02], wristL: [0.47, 0.86, 0.04], handTipL: [0.51, 0.76, 0.05],
  shoulderR: [-0.19, 1.38, 0], elbowR: [-0.36, 1.10, 0.02], wristR: [-0.47, 0.86, 0.04], handTipR: [-0.51, 0.76, 0.05],
  hipL: [0.09, 0.93, 0], kneeL: [0.10, 0.51, 0.01], ankleL: [0.10, 0.09, 0], footIdxL: [0.10, 0.03, 0.16],
  hipR: [-0.09, 0.93, 0], kneeR: [-0.10, 0.51, 0.01], ankleR: [-0.10, 0.09, 0], footIdxR: [-0.10, 0.03, 0.16],
};
/** 与 dev/figure.ts 同一组姿态 —— 两页看到的必须是同一个人 */
const POSES: Record<string, Record<string, Vec3>> = {
  apose: {},
  raise: { elbowL: [0.24, 1.66, 0], wristL: [0.28, 1.90, 0], handTipL: [0.30, 1.99, 0] },
  open: {
    elbowL: [0.50, 1.38, 0], wristL: [0.74, 1.38, 0], handTipL: [0.83, 1.38, 0],
    elbowR: [-0.50, 1.38, 0], wristR: [-0.74, 1.38, 0], handTipR: [-0.83, 1.38, 0],
  },
  crouch: {
    pelvis: [0, 0.55, 0], chest: [0, 0.95, 0], neck: [0, 1.05, 0], headCenter: [0, 1.20, 0],
    hipL: [0.09, 0.53, 0], hipR: [-0.09, 0.53, 0],
    kneeL: [0.16, 0.32, 0.25], kneeR: [-0.16, 0.32, 0.25],
    shoulderL: [0.19, 0.98, 0], shoulderR: [-0.19, 0.98, 0],
    elbowL: [0.33, 0.70, 0.02], wristL: [0.44, 0.46, 0.04], handTipL: [0.48, 0.37, 0.05],
    elbowR: [-0.33, 0.70, 0.02], wristR: [-0.44, 0.46, 0.04], handTipR: [-0.48, 0.37, 0.05],
  },
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

const human = (): Skeleton => {
  const j: Record<string, Vec3> = { ...BASE, ...(POSES[qs.get('pose') ?? 'apose'] ?? {}) };
  const bones: Bone[] = ALL_BONE_IDS.map((id) => {
    const [a, b] = BONE_JOINTS[id];
    const p0 = j[a], p1 = j[b];
    return { id, p0, p1, length: Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]), roll: 0, confidence: 1 };
  });
  return { bones, joints: j, height: H, warmingUp: false, t: 0 };
};

/** 把一具已经重映射好的身体整体搬到 x 处。数据层平移，渲染器不用知道这件事 */
function shiftX(sk: Skeleton, dx: number): Skeleton {
  const joints: Record<string, Vec3> = {};
  for (const k in sk.joints) joints[k] = [sk.joints[k][0] + dx, sk.joints[k][1], sk.joints[k][2]];
  const bones = sk.bones.map((b) => ({
    ...b,
    p0: [b.p0[0] + dx, b.p0[1], b.p0[2]] as Vec3,
    p1: [b.p1[0] + dx, b.p1[1], b.p1[2]] as Vec3,
  }));
  return { ...sk, bones, joints };
}

// ── 场景 ────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101114);
const renderer = new THREE.WebGPURenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 0.05, 80);
scene.add(new THREE.HemisphereLight(0xdfe6ef, 0x1a1b20, 1.3));
const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(2, 3.5, 3); scene.add(key);
const rim = new THREE.DirectionalLight(0x8fb4d8, 1.2); rim.position.set(-2.5, 1.5, -2); scene.add(rim);

const library = createPartLibrary();
await library.load();

const DEFAULT_IDS = ['orb', 'furball', 'manipulator', 'screenface', 'xeno', 'autonomous'];
const ids = (qs.get('ids')?.split(',').map((s) => s.trim()).filter(Boolean) ?? DEFAULT_IDS)
  .filter((id) => library.index.themes.some((t) => t.id === id));
const tier = Math.min(3, Math.max(0, Number(qs.get('tier') ?? 2) | 0)) as Tier;
const seed = (Number(qs.get('seed') ?? 1) | 0) >>> 0;

const presence: Presence = { state: 'ALIVE', elapsed: 999, transition: 1 };

/** 一排的间距：按最宽的那具身体来定，否则环绕型会压到邻居身上 */
const PITCH = 2.0;

const row: { id: string; plan: string; sk: Skeleton }[] = [];
for (let i = 0; i < ids.length; i++) {
  const def = library.index.themes.find((t) => t.id === ids[i])!;
  const plan = def.bodyPlan ?? 'rig';
  const sk = shiftX(remapSkeleton(human(), plan), (i - (ids.length - 1) / 2) * PITCH);
  row.push({ id: ids[i], plan: typeof plan === 'string' ? plan : (plan.kind ?? 'rig'), sk });
}

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(Math.max(6, ids.length * PITCH + 2), 4),
  new THREE.MeshStandardMaterial({ color: 0x17181c, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2; scene.add(ground);

const creatures = row.map((r) => {
  const c = createCreature({ library });
  scene.add(c.object);
  return c;
});

for (let i = 0; i < row.length; i++) {
  const g = makeGenome(seed, tier, library.index, { theme: row[i].id, rejected: library.rejected });
  await Promise.race([library.preload(partIdsOf(g)), new Promise((r) => setTimeout(r, 4000))]);
  creatures[i].remorph(g);
  creatures[i].pose(row[i].sk, presence, 1 / 60);
}

// 相机：按整排的包围盒取景。环绕型很宽、单柱型很高，用人形的相机参数会直接出画
let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
for (const r of row) for (const b of r.sk.bones) for (const p of [b.p0, b.p1]) for (let k = 0; k < 3; k++) {
  lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]);
}
const cx = (lo[0] + hi[0]) / 2, cy = (lo[1] + hi[1]) / 2;
// 宽和高分别算一次取大的：一排是横的（宽受限），单柱型又很高（高受限），
// 只按其中一边拟合总会有一边出画
const tanY = Math.tan((camera.fov * Math.PI) / 360);
const tanX = tanY * (innerWidth / innerHeight);
const dz = Math.max((hi[0] - lo[0]) / 2 / tanX, (hi[1] - lo[1]) / 2 / tanY) * 1.12 + 0.6;
camera.position.set(cx, cy, dz);
camera.lookAt(cx, cy, 0);

hud.innerHTML = `<b>形体并排 · ${row.length} 个物种</b>\n` +
  row.map((r) => `${r.id.padEnd(13)} ${r.plan}`).join('\n') +
  (library.usingFallback ? '\n\n⚠ parts.json 不可用 → 程序化占位几何（P3）' : '');

let last = performance.now();
const stillFrames = qs.has('still') ? Math.max(1, Number(qs.get('still') ?? 30) | 0) : 0;
let frameNo = 0;
renderer.setAnimationLoop((now: number) => {
  const dt = Math.min(TIME.dtMax, Math.max(TIME.dtMin, (now - last) / 1000));
  last = now;
  for (let i = 0; i < row.length; i++) creatures[i].pose(row[i].sk, presence, dt);
  renderer.render(scene, camera);
  if (stillFrames && ++frameNo >= stillFrames) renderer.setAnimationLoop(null);
});
