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
 *     ?plan=<拓扑>        强制身体方案，压过条目自己声明的
 *     ?pose=raise|crouch|open|apose   换一副合成姿态 —— 用来证明"因果还在"
 *     ?angle=0.35         冻结转台角度（弧度）
 *     ?still=90           跑满 N 帧就停 —— headless 取证必须有这个
 *     ?shading=toon|physical  强制着色语言，压过条目自己声明的（`creature/shading.ts`）
 * 一排并排比较不同物种的形体，见 dev/lineup.html。
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
import { isShadingId, resolveShading, type ShadingId } from '../src/creature/shading.ts';
import { remapSkeleton } from '../../core/src/bodyplan.ts';
import { mountPageHead } from '../src/ui/page.ts';

mountPageHead({
  title: '装配', titleEn: 'Figure assembly', overlay: true,
  note: '部件挂到骨架上，比例和朝向对不对 —— 一具身体是怎么被拼出来的。',
});

const hud = document.getElementById('hud')!;
const qs = new URLSearchParams(location.search);
const DEBUG = qs.get('debug') === '1';
const BODY_HEIGHT = SKELETON.referenceHeight;

// ── 合成 A-pose 骨架（米，Y-up，面朝 +Z；左侧在 +X，与镜像后的世界一致） ──────────
const J0_SRC: Record<string, Vec3> = {
  pelvis: [0, 0.95, 0], chest: [0, 1.35, 0], neck: [0, 1.45, 0], headCenter: [0, 1.60, 0],
  shoulderL: [0.19, 1.38, 0], elbowL: [0.36, 1.10, 0.02], wristL: [0.47, 0.86, 0.04], handTipL: [0.51, 0.76, 0.05],
  shoulderR: [-0.19, 1.38, 0], elbowR: [-0.36, 1.10, 0.02], wristR: [-0.47, 0.86, 0.04], handTipR: [-0.51, 0.76, 0.05],
  hipL: [0.09, 0.93, 0], kneeL: [0.10, 0.51, 0.01], ankleL: [0.10, 0.09, 0], footIdxL: [0.10, 0.03, 0.16],
  hipR: [-0.09, 0.93, 0], kneeR: [-0.10, 0.51, 0.01], ankleR: [-0.10, 0.09, 0], footIdxR: [-0.10, 0.03, 0.16],
};
/**
 * 另外几副合成姿态。**它们的唯一用途是证明因果**：同一个身体方案，
 * 换一副人的姿态，身体必须跟着变 —— 而且要以这个物种自己的方式变
 * （抬手 / 蹲下 / 张开，docs/PRD.md §5 第 2 条）。
 */
const POSES: Record<string, Record<string, Vec3>> = {
  apose: {},
  raise: {   // 抬左手
    elbowL: [0.24, 1.66, 0], wristL: [0.28, 1.90, 0], handTipL: [0.30, 1.99, 0],
  },
  open: {    // 双臂平举张开
    elbowL: [0.50, 1.38, 0], wristL: [0.74, 1.38, 0], handTipL: [0.83, 1.38, 0],
    elbowR: [-0.50, 1.38, 0], wristR: [-0.74, 1.38, 0], handTipR: [-0.83, 1.38, 0],
  },
  crouch: {  // 蹲下
    pelvis: [0, 0.55, 0], chest: [0, 0.95, 0], neck: [0, 1.05, 0], headCenter: [0, 1.20, 0],
    hipL: [0.09, 0.53, 0], hipR: [-0.09, 0.53, 0],
    kneeL: [0.16, 0.32, 0.25], kneeR: [-0.16, 0.32, 0.25],
    shoulderL: [0.19, 0.98, 0], shoulderR: [-0.19, 0.98, 0],
    elbowL: [0.33, 0.70, 0.02], wristL: [0.44, 0.46, 0.04], handTipL: [0.48, 0.37, 0.05],
    elbowR: [-0.33, 0.70, 0.02], wristR: [-0.44, 0.46, 0.04], handTipR: [-0.48, 0.37, 0.05],
  },
};
const POSE_NAME = new URLSearchParams(location.search).get('pose') ?? 'apose';
Object.assign(J0_SRC, POSES[POSE_NAME] ?? {});

/** J 是每帧被重映射结果覆盖的工作副本；J0 是原始人体姿态，永不修改 */
const J0: Record<string, Vec3> = { ...J0_SRC };
const J: Record<string, Vec3> = { ...J0_SRC };

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
const QS = new URLSearchParams(location.search);
/**
 * 身体方案优先级：?plan= 覆盖 > 条目自己声明的 > 'rig'。
 * 和 main.ts 同一套优先级 —— dev 页和运行时对同一个条目必须看到同一具身体，
 * 否则在这里调好的东西到现场就不是那样。
 */
const PLAN_OVERRIDE = QS.get('plan');

const bonesRaw: Bone[] = ALL_BONE_IDS.map((id) => {
  const [a, b] = BONE_JOINTS[id];
  const p0 = J[a], p1 = J[b];
  return { id, p0, p1, length: Math.hypot(p1[0]-p0[0], p1[1]-p0[1], p1[2]-p0[2]), roll: 0, confidence: 1 };
});

// 身体方案在 index 载入后才知道（条目自己声明的），先占位，下面立刻重算
let bones: Bone[] = bonesRaw;
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

// 相机拟合的状态必须声明在 rebuild() 之前 —— rebuild 里会调 fitCamera()，
// 而顶层的 `await rebuild()` 比这几行更早执行过一次，声明在后面会踩 TDZ。
let camDist = 3;
let center: [number, number, number] = [0, 0.9, 0];
let span = 1.7;
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
// `?parts=/parts/harvest/` 指向另一份索引 —— 取件池（真实机器人 CAD，docs/33）就是靠它
// 和 Rodin 生成件拼进同一具身体的。不给就是默认的 /parts/，行为不变。
const library = createPartLibrary(qs.has('parts') ? { baseUrl: qs.get('parts')! } : {});
await library.load();                          // parts.json 缺失也 resolve → 占位模式
// 着色语言和 `?plan=` 同一套优先级：`?shading=` 覆盖 > 条目自己声明的 > physical。
// dev 页和运行时对同一个条目必须看到同一具身体 —— 取证图要是比现场多一圈墨或少一圈墨，
// 它就不是证据，是另一张图。
const SHADING_OVERRIDE: ShadingId | null =
  isShadingId(qs.get('shading')) ? (qs.get('shading') as ShadingId) : null;
const creature = createCreature({ library, shading: resolveShading(qs.get('theme'), SHADING_OVERRIDE) });
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
let genome: Genome = makeGenome(seed, tier, library.index, { theme: themes[themeIdx], rejected: library.rejected });

/**
 * 身体方案优先级：`?plan=` 覆盖 > 条目自己声明的 > 'rig'。
 * 和 main.ts 同一套优先级 —— dev 页和运行时对同一个条目必须看到同一具身体，
 * 否则在这里调好的东西到现场就不是那样。
 */
let planLabel = 'rig';
function applyPlan(themeId: string) {
  const def = library.index.themes?.find((t) => t.id === themeId);
  const plan = PLAN_OVERRIDE ?? def?.bodyPlan ?? 'rig';
  const r = remapSkeleton(
    { bones: bonesRaw, joints: { ...J0 }, height: BODY_HEIGHT, warmingUp: false, t: 0 },
    plan,
  );
  bones = r.bones;
  skeleton.bones = r.bones;
  for (const k in J) delete J[k];
  Object.assign(J, r.joints);
  planLabel = typeof plan === 'string' ? plan : `${plan.kind ?? 'rig'}+比例`;
}

async function rebuild() {
    applyPlan(themes[themeIdx]);
  // ←/→ 换主题时着色也要跟着换，否则翻到「线」还是一条线都没有
  creature.setShading(resolveShading(themes[themeIdx], SHADING_OVERRIDE));
  genome = makeGenome(seed, tier, library.index, { theme: themes[themeIdx], rejected: library.rejected });
  // 预取后再 remorph → 截图不会拍到占位体。
  // 但**时间不许被资产绑架**（P3）：preload 的契约是"永不 reject"，
  // 它没承诺"一定 resolve" —— 真挂住过一次，整页停在 loading 且不报错。
  await Promise.race([
    library.preload(partIdsOf(genome)),
    new Promise((r) => setTimeout(r, 3000)),
  ]);
  creature.remorph(genome);                    // 第一次调用直接成型，之后是 crossfade
  creature.pose(skeleton, presence, 1 / 60);
    fitCamera();
  syncUrl();
}

function syncUrl() {
  const p = new URLSearchParams(location.search);
  p.set('theme', themes[themeIdx]); p.set('seed', String(seed)); p.set('tier', String(tier));
  history.replaceState(null, '', `?${p}`);
}

// 启动失败必须看得见（§craft）：dev 页卡在 "loading…" 而不报错，
// 会让人以为是资源慢，实际是抛了异常。
try {
  await rebuild();
} catch (err) {
  hud.textContent = `装配失败：${err instanceof Error ? err.message : String(err)}\n\n${err instanceof Error ? err.stack ?? '' : ''}`;
  hud.style.color = '#e0455a';
  throw err;
}
/**
 * 按**身体的实际包围盒**取景，而不是假设"一个站着的 1.7m 人"。
 * 四足方案的身体是横的、矮的 —— 用人形的相机参数会直接出画。
 * 这条对正式舞台同样成立（docs/18 落地后 stage 必须跟着改）。
 */
function fitCamera() {
  const bb = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
for (const b of bones) for (const p of [b.p0, b.p1]) for (let i = 0; i < 3; i++) {
  if (p[i] < bb.min[i]) bb.min[i] = p[i];
  if (p[i] > bb.max[i]) bb.max[i] = p[i];
}
  center = [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, (bb.min[2] + bb.max[2]) / 2];
  span = Math.max(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2], 0.5);
  camDist = (span / (2 * Math.tan((camera.fov * Math.PI) / 360))) * 1.9;
}
fitCamera();

camera.position.set(camDist * 0.55, center[1] + span * 0.35, camDist * 0.85);
camera.lookAt(center[0], center[1], center[2]);

// ?debug=1 时把内部状态挂出来，方便在控制台量 pose() 的 CPU 开销、比对 genome 的确定性、截图取证
if (DEBUG) {
  Object.assign(globalThis as Record<string, unknown>, {
    __figure: {
      library, creature, skeleton, presence, themes, camera, renderer,
      /**
       * 无头取证：固定机位渲染一帧，返回 PNG data URL。
       *
       * 两件事都必须自己做，不能指望帧循环：无头 Chrome 没有合成器在推帧，
       * `setAnimationLoop` 一次都不跑（画布因此永远是空的）；而自转的相机会让
       * 改前/改后两张图差在角度上 —— 看的人分不清是修好了还是只是转过去了。
       */
      async shot(angle = 0.55) {
        paused = true;
        spin = angle;
        fitCamera();
        const a = Math.sin(spin) * 0.9;
        camera.position.set(Math.sin(a) * camDist, center[1] + span * 0.35, Math.cos(a) * camDist);
        camera.lookAt(center[0], center[1], center[2]);
        creature.pose(skeleton, presence, 1 / 60);
        await renderer.renderAsync(scene, camera);
        return renderer.domElement.toDataURL('image/png');
      },
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
/**
 * `?still=N`：跑满 N 帧就停。**headless 截图必须有这个** ——
 * 永不停的 rAF 会把 Chrome 的 `--virtual-time-budget` 一直吊住，截出来是空白页。
 * 这条和 dev/mass.ts 是同一条规矩，照抄过来的。
 */
const stillFrames = qs.has('still') ? Math.max(1, asInt(qs.get('still'), 60)) : 0;
/** `?angle=`：冻结转台角度，取证图之间才能比较（同一个机位看不同的身体） */
const fixedAngle = qs.has('angle') ? Number(qs.get('angle')) : null;
let frameNo = 0;
renderer.setAnimationLoop((now: number) => {
  const dt = Math.min(TIME.dtMax, Math.max(TIME.dtMin, (now - last) / 1000));
  last = now;
  fps = fps * 0.92 + (1 / dt) * 0.08;
  const t0 = performance.now();
  if (!paused) spin += dt * 0.3;
  const a = fixedAngle !== null && Number.isFinite(fixedAngle) ? fixedAngle : Math.sin(spin) * 0.9;
  camera.position.set(Math.sin(a) * camDist, center[1] + span * 0.35, Math.cos(a) * camDist);
  camera.lookAt(center[0], center[1], center[2]);
  creature.pose(skeleton, presence, dt);
  const t1 = performance.now();
  renderer.render(scene, camera);
  // poseMs = Creature 自己的 CPU 预算（docs/02 P5 的"CPU 每帧 JS"）；
  // renderMs = three 提交一帧的开销，不属于本任务，但红了要知道是谁红的
  poseMs = poseMs * 0.9 + (t1 - t0) * 0.1;
  jsMs = jsMs * 0.9 + (performance.now() - t0) * 0.1;
  if (now - hudAt > 200) { hudAt = now; drawHud(); }   // HUD 每 200ms 一次，别让 innerHTML 进预算
  if (stillFrames && ++frameNo >= stillFrames) {
    drawHud();
    renderer.setAnimationLoop(null);
    document.title = `装配 · still · ${planLabel}`;
  }
});
