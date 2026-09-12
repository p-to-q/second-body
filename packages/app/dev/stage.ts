/**
 * 舞台预览（dev 工具）—— T-09 的验收台。
 *
 * 它把**正式的** `src/stage/stage.ts` 接上**正式的** PartLibrary / Creature，
 * 用一副合成 A-pose 骨架（经 `remapSkeleton` 按物种的身体方案重映射）当身体，
 * 于是屏幕上看到的灯光、地面、影子、后期、取景，就是现场会跑的那一份。
 *
 * 为什么不直接看 `/?demo=1`：那条路要摄像头/回放和整条收口链，
 * 而 T-09 要回答的是一个更窄的问题 —— **这一帧像不像一件作品**。
 * 越少的东西挡在中间，越早发现是谁的锅。
 *
 * URL：
 *   ?theme=xeno     条目（缺省取 roster 第一个可用的）
 *   ?plan=quadruped 强行换身体方案（缺省用条目自己声明的）
 *   ?state=idle     空场：没有身体，只有呼吸粒子（S1）
 *   ?nopost=1       关整条后期（对照用）
 *   ?debug=1        HUD：fps / 三角 / draw / 取景 / look，超 BUDGET 标红
 *   ?pulse=0.12     预热结束前 0.12 秒打一次升档脉冲（S5）—— 截图正好落在脉冲里
 *   ?loop=pulse     跑起来之后每 3 秒打一次脉冲（肉眼看节奏用）
 *   ?warm=6         预热多少秒再开始渲染（截图用，见 warmUp 的说明）
 *   ?seed= ?tier=   同 /dev/figure.html
 * 键：P 打一次脉冲，I 切空场，←/→ 换条目，空格暂停机位呼吸。
 */
import * as THREE from 'three/webgpu';
import { makeGenome, themeIsUsable } from '../../core/src/genome.ts';
import { remapSkeleton } from '../../core/src/bodyplan.ts';
import { BUDGET, TIME } from '../../core/src/tuning.ts';
import type { Genome, Presence, Skeleton, Tier } from '../../core/src/types.ts';
import { createPartLibrary } from '../src/assets/library.ts';
import { partIdsOf } from '../src/creature/assemble.ts';
import { createCreature } from '../src/creature/creature.ts';
import { createStage } from '../src/stage/stage.ts';
import { REFERENCE_POSE } from '../src/stage/framing.ts';

const hud = document.getElementById('hud')!;
const qs = new URLSearchParams(location.search);
const DEBUG = qs.get('debug') === '1';

// 参考站姿（1.7m A-pose）直接用舞台自己那一副 —— 取景和渲染看的是同一具身体，
// 两边各写一份迟早会对不上。
const human: Skeleton = REFERENCE_POSE;

// ── 渲染器 ──────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGPURenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const library = createPartLibrary();
await library.load();                       // parts.json 缺失也 resolve → 占位模式（ADR-4）

const usable = library.index.themes
  .filter((t) => library.usingFallback || themeIsUsable(library.index, t.id, 3));
const themes = usable.length ? usable : library.index.themes;

const asInt = (v: string | null, fallback: number): number => {
  if (v === null || v.trim() === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};
let seed = asInt(qs.get('seed'), 7) >>> 0;
const tier = Math.min(3, Math.max(0, asInt(qs.get('tier'), 2))) as Tier;
let themeIdx = Math.max(0, themes.findIndex((t) => t.id === qs.get('theme')));

// stage 自己会读 URL flags（?nopost=1 / ?debug=1 / ?plan=）
const stage = createStage({ theme: themes[themeIdx], index: library.index });
stage.resize(innerWidth, innerHeight);

const creature = createCreature({ library });
stage.scene.add(creature.object);

let idle = qs.get('state') === 'idle';
let genome: Genome = makeGenome(seed, tier, library.index, { theme: themes[themeIdx].id });
let body: Skeleton = human;

async function rebuild(): Promise<void> {
  const def = themes[themeIdx];
  genome = makeGenome(seed, tier, library.index, { theme: def.id });
  // 身体方案：条目自己声明，?plan= 覆盖（docs/18）。这一行就是"物种真的不一样"。
  body = remapSkeleton(human, qs.get('plan') ?? def.bodyPlan ?? 'rig');
  stage.setTheme(def, library.index);
  stage.frame(body);
  await library.preload(partIdsOf(genome));   // 预取后再 remorph → 截图不会拍到占位体
  creature.remorph(genome);
  creature.pose(body, presence(), 1 / 60);
  warmUp();
  const p = new URLSearchParams(location.search);
  p.set('theme', def.id);
  history.replaceState(null, '', `?${p}`);
}

let paused = false;

/**
 * 空转若干帧，**不渲染**，只推进状态。
 *
 * 为什么必须有：取景过渡、粒子聚拢、灯的在场渐变都是带时间常数的，
 * 而 headless 截图工具（`--virtual-time-budget`）只会真正跑出十来帧 ——
 * 不预热就永远拍到"正在过渡中"的那一瞬，取证图全是半成品。
 * 现场没有这个问题：真人面前这些过渡本来就该被看见。
 */
function warmUp(seconds = Number(qs.get('warm') ?? 2.5)): void {
  const p = presence();
  const n = Math.round(Math.max(0, seconds) * 60);
  // ?pulse=0.12 → 在预热结束前 0.12 秒打一次升档脉冲，于是截图正好落在脉冲里
  const pulseAt = qs.has('pulse') ? n - Math.round(Number(qs.get('pulse') || 0.1) * 60) : -1;
  const trace: string[] = [];
  for (let i = 0; i < n; i++) {
    if (i === pulseAt) stage.pulse(tier);
    if (!idle) creature.pose(body, p, (1 / 60) * stage.timeScale);
    stage.update(p, null, 1 / 60);
    if (pulseAt >= 0 && i >= pulseAt && (i - pulseAt) % 3 === 0 && i - pulseAt <= 45) {
      trace.push(`${((i - pulseAt) / 60).toFixed(3)}s×${stage.timeScale.toFixed(2)}`);
    }
  }
  // 脉冲的两个数（600ms / dt×0.4）没法从截图上量，所以把时间缩放的轨迹打出来当证据
  if (trace.length) console.info('[stage] pulse timeScale:', trace.join(' '));
}

/** dev 页面永远是明确的在场状态，不演进出场动画 —— 截图不该抓到中间态 */
const presence = (): Presence => (idle
  ? { state: 'IDLE', elapsed: 999, transition: 0 }
  : { state: 'ALIVE', elapsed: 999, transition: 1 });

await rebuild();

// `?pulse=` 是给取证截图用的：预热里打完脉冲之后**冻住**，
// 否则截图前那十来帧真实时间会把 600ms 的脉冲跑完，拍到的是脉冲之后。
if (qs.has('pulse')) paused = true;

// ── 交互 ────────────────────────────────────────────────────────────────────
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  stage.resize(innerWidth, innerHeight);
});
addEventListener('keydown', async (e) => {
  if (e.code === 'KeyP') { stage.pulse(tier); return; }
  if (e.code === 'KeyI') { idle = !idle; return; }
  if (e.code === 'Space') { paused = !paused; e.preventDefault(); return; }
  if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
    themeIdx = (themeIdx + (e.code === 'ArrowRight' ? 1 : -1) + themes.length) % themes.length;
    await rebuild();
  }
  if (e.code === 'KeyN') { seed = (seed * 1664525 + 1013904223) >>> 0; await rebuild(); }
});

// ── HUD ─────────────────────────────────────────────────────────────────────
let fps = 60;
let jsMs = 0;
const over = (v: number, max: number): string =>
  (v > max ? `<span class="over">${v.toLocaleString()}</span>` : v.toLocaleString());

function drawHud(): void {
  const def = themes[themeIdx];
  const s = creature.stats;
  const L = stage.look;
  const b = stage.bounds;
  hud.innerHTML = DEBUG
    ? `<b>${def.name} · ${def.nameEn}</b>  ${qs.get('plan') ?? def.bodyPlan ?? 'rig'}${idle ? ' · 空场' : ''}\n`
      + `${fps.toFixed(0)} fps · frame ${jsMs.toFixed(2)}ms\n`
      + `实例 ${over(s.instances, BUDGET.maxInstances)}/${BUDGET.maxInstances} · `
      + `三角 ${over(s.triangles, BUDGET.maxTriangles)} · draw ${over(s.drawCalls, BUDGET.maxDrawCalls)}\n`
      + `后期 ${stage.post ? 'on' : 'off'} · bloom ${L.bloomStrength.toFixed(2)} · ao ${L.aoStrength.toFixed(2)}\n`
      + `取景 h=${b.height.toFixed(2)}m w=${b.width.toFixed(2)}m cy=${b.centerY.toFixed(2)}m · `
      + `fov ${stage.camera.fov.toFixed(1)}°\n`
      + `seed ${seed} · tier ${tier}`
      + (stage.pulseGain > 0 ? `\n升档脉冲 全身 +${(stage.pulseGain * 100).toFixed(1)}% · dt×${stage.timeScale.toFixed(2)}` : '')
    : '';
}

// ── 帧循环 ──────────────────────────────────────────────────────────────────
// 帧循环里永不抛异常（P2）：dev 页面也一样，不然一个小错就只剩黑屏，什么都查不到
let last = performance.now();
let hudAt = 0;
let t = 0;
let nextPulse = qs.get('loop') === 'pulse' ? 3 : Infinity;
let rendered = 0;

renderer.setAnimationLoop((now: number) => {
  const dt = Math.min(TIME.dtMax, Math.max(TIME.dtMin, (now - last) / 1000));
  last = now;
  t += dt;
  fps = fps * 0.92 + (1 / dt) * 0.08;
  const t0 = performance.now();
  try {
    if (t >= nextPulse) { stage.pulse(tier); nextPulse = t + 3; }
    const p = presence();
    // 升档停滞要作用到身体上：把 stage.timeScale 乘进喂给 creature 的 dt。
    // **收口的人在 main.ts 里也要这么做**（stage.pulse 只管舞台那一半）。
    if (!idle) creature.pose(body, p, dt * stage.timeScale);
    creature.object.visible = !idle;
    stage.update(p, null, paused ? 0 : dt);
    stage.render(renderer);
    rendered++;
  } catch (e) {
    console.error('[dev/stage] 帧异常', e);
  }
  jsMs = jsMs * 0.9 + (performance.now() - t0) * 0.1;
  if (now - hudAt > 200) { hudAt = now; drawHud(); }
});

// 截图工具用：等它变成 true 再抓，才不会拍到还没成形的第一帧
Object.assign(globalThis as Record<string, unknown>, {
  __stage: {
    stage, creature, library,
    get ready() { return rendered > 30; },
    get stats() { return creature.stats; },
    pulse: () => stage.pulse(tier),
  },
});
