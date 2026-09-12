/**
 * 收口：把五条泳道接成一件作品。
 *
 * 一帧的顺序在 docs/06 §1 已经写死，这里就是照抄。
 * 之所以不发给子代理：这是唯一一处所有契约同时成立或同时失效的地方，
 * 出问题时必须有人能一眼看懂整条链，而不是看懂五个模块。
 *
 * 启动 = 打开一个 URL（P10）。URL 开关见 docs/06 §6。
 */
import * as THREE from 'three/webgpu';

import { buildSkeleton, mediapipeToWorld } from '../../core/src/skeleton.ts';
import { createStabilizer } from '../../core/src/stabilize.ts';
import { createMotion } from '../../core/src/motion.ts';
import { createEvolution } from '../../core/src/evolution.ts';
import { createPresence } from '../../core/src/presence.ts';
import { makeGenome } from '../../core/src/genome.ts';
import { remapSkeleton } from '../../core/src/bodyplan.ts';
import { mulberry32 } from '../../core/src/rng.ts';
import { CAPTURE } from '../../core/src/tuning.ts';
import type { MotionFeatures, Skeleton, Tier } from '../../core/src/types.ts';

import { createCapture } from './capture/capture.ts';
import { createPartLibrary } from './assets/library.ts';
import { createCreature } from './creature/creature.ts';
import { createMassBody } from './creature/mass.ts';
import type { BodyInstance } from './creature/body.ts';
import { createStage } from './stage/stage.ts';
import { chooseTheme, themeFromUrl } from './choose/choose.ts';
import { createFrameLoop } from './shell/safe-frame.ts';
import { enterKiosk, readFlags } from './shell/kiosk.ts';
import { createHud } from './shell/hud.ts';
import { ACTS, createDirector, type World } from './acts/index.ts';

const flags = readFlags();

async function boot(): Promise<void> {
  // ── 1. 渲染器与舞台 ──────────────────────────────────────────────────────
  const renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  // WebGPU 必须先 init() 才能同步 render()。renderAsync() 已废弃，
  // 而且每帧 await 会把渲染塞进微任务队列，帧时间读数会骗人。
  await renderer.init();
  document.body.appendChild(renderer.domElement);

  const stage = createStage();
  stage.resize(innerWidth, innerHeight);
  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    stage.resize(innerWidth, innerHeight);
  });

  enterKiosk(renderer.domElement, flags);
  const hud = flags.debug ? createHud() : null;

  // ── 2. 资产。失败也 resolve —— 没有 parts.json 时用占位几何照跑（ADR-4） ──
  const library = createPartLibrary();
  await library.load();
  if (library.usingFallback) console.warn('[main] 没有部件库，用程序化占位几何运行');

  // ── 3. 采集与选主题**并行** ──────────────────────────────────────────────
  // 为什么并行：MediaPipe 的 wasm + 两个模型要好几秒。串行的话观众选完主题
  // 会盯着一块黑屏等它加载 —— 而那正是整个体验里最需要连贯的一刻
  //（卡片冲向镜头、溶解、然后身体应该**已经在那里了**）。
  const capturePromise = (async () => {
    const c = await createCapture();
    await c.start();
    if (c.lastError) console.warn('[main] capture:', c.lastError);
    return c;
  })();

  let theme = flags.theme ?? themeFromUrl();
  if (!theme) {
    await new Promise<void>((done) => {
      void chooseTheme({
        onChoose: (id) => { theme = id; done(); },
        seed: flags.seed ?? undefined,
      }).then((handle) => { if (!handle) done(); });   // handle 为 null = URL 里已经有主题
    });
  }

  // 预取被选中主题的部件，免得进场后第一秒还在拿占位几何顶着
  const wanted = library.index.parts.filter((p) => p.family === theme).map((p) => p.id);
  await Promise.race([
    library.preload(wanted),
    new Promise((r) => setTimeout(r, 2500)),   // 预取失败/慢也不许卡住进场
  ]);

  const capture = await capturePromise;

  // 身体方案：物种自己声明，?plan= 可覆盖（docs/18-BODY-PLANS.md）。
  // 这是「物种真的不一样」与「同一具人体换皮」之间的那一行。
  const themeDef = library.index.themes?.find((t) => t.id === theme);
  const bodyPlan = flags.plan ?? themeDef?.bodyPlan ?? 'rig';

  // ── 5. 状态机 ───────────────────────────────────────────────────────────
  const presence = createPresence();
  const stabilizer = createStabilizer();
  const motion = createMotion();
  const evolution = createEvolution();
  // 身体方案决定用哪种**表达**：刚体挂载（手办式）还是团块（物质式）。
  // 两者都满足 BodyInstance，帧循环不关心是哪一种（docs/18 §2）。
  const planKind = typeof bodyPlan === 'string' ? bodyPlan : (bodyPlan.kind ?? 'rig');
  const isMass = planKind === 'mass';
  const creature = createCreature({ library });
  const massBody = isMass ? createMassBody({ library, theme: theme ?? undefined }) : null;
  const body: BodyInstance = massBody ?? creature;
  stage.scene.add(body.object);

  let seed = flags.seed ?? (Math.random() * 0xffffffff) >>> 0;   // 会话级种子，仅此一处
  let lastFeatures: MotionFeatures | null = null;
  let lastSkeleton: Skeleton | null = null;
  let tier: Tier = (flags.tier ?? 0) as Tier;
  let note = '';
  let elapsedT = 0;

  const morph = (t?: Tier) => {
    if (t !== undefined) tier = t;
    // 团块没有槽位件可换 —— 它的"演化"由 tier 驱动的表面参数表达，不是换装。
    if (!isMass) creature.remorph(makeGenome(seed, tier, library.index, { theme: theme ?? undefined }));
  };
  morph(tier);

  // ── 玩法扩展点（docs/16）。帧循环固定，玩法挂在旁边 ───────────────────────
  const director = createDirector(ACTS);
  const world: World = {
    get t() { return elapsedT; },
    get presence() { return presence.current; },
    get skeleton() { return lastSkeleton; },
    get features() { return lastFeatures; },
    get evolution() { return evolution.state; },
    get genome() { return isMass ? null : creature.genome; },
    creature: body, stage, library, capture, flags,
    rng: mulberry32(seed),
    morph,
    note: (s) => { note = s; },
  };

  // ── 6. 一帧（docs/06 §1） ────────────────────────────────────────────────
  const loop = createFrameLoop((dt) => {
    elapsedT += dt;
    const raw = capture.latest();
    const detected = raw !== null && raw.score > CAPTURE.minScore;
    const p = presence.update(detected, dt);

    if (raw) {
      // 运动特征算在**人的**骨架上：驱动演化的是观众实际动了多少，
      // 而不是重映射之后那具身体动了多少。顺序不能反。
      const humanSk = stabilizer.apply(buildSkeleton(mediapipeToWorld(raw), raw.world, raw.t), dt);
      lastFeatures = motion.update(humanSk, dt);
      lastSkeleton = remapSkeleton(humanSk, bodyPlan);
      const evo = evolution.update(lastFeatures, dt);
      // ?tier= 锁定时不让演化改形态 —— look dev 要的是一个不动的靶子
      if (evo.tierChanged && flags.tier === null) morph(evo.tier);
    }
    // 身体怎么动交给当前的 Act。追踪短暂丢失时 lastSkeleton 还在，
    // Act 会继续用它 pose，所以画面不会僵死（P3）。
    director.update(world, dt);

    // 人走了 → 换一个种子，下一个人是全新的身体（docs/05 §5）
    if (presence.justReset) {
      seed = (Math.random() * 0xffffffff) >>> 0;
      motion.reset();
      evolution.reset();
      stabilizer.reset();
      lastSkeleton = null;
      morph((flags.tier ?? 0) as Tier);
    }

    stage.update(p, lastFeatures, dt);
    renderer.render(stage.scene, stage.camera);

    if (hud) {
      const s = body.stats;
      hud.update(loop.stats, {
        instances: (s as { instances?: number }).instances ?? 0, triangles: s.triangles,
        drawCalls: s.drawCalls, inferenceHz: capture.fps,
        act: director.currentId ?? '—', note,
      });
    }
  });

  if (flags.act && !director.force(flags.act, world)) {
    console.warn(`[main] ?act=${flags.act} 不存在或已被禁用，按正常流程选`);
  }

  loop.start();
  console.info(
    `[main] running · theme=${theme} · seed=${seed} · ` +
    `plan=${planKind} · capture=${flags.demo ? 'replay' : 'webcam'} · acts=${ACTS.map((a) => a.id).join(',')}`,
  );
}

void boot().catch((err) => {
  // 启动失败必须看得见 —— 现场白屏是最糟的失败（P3）
  console.error('[main] boot failed:', err);
  const el = document.createElement('pre');
  el.style.cssText = 'color:#e0455a;font:13px ui-monospace,monospace;padding:2rem;white-space:pre-wrap';
  el.textContent = `启动失败：${err instanceof Error ? err.message : String(err)}\n\n` +
    '试试 ?demo=1（不需要摄像头），或看控制台。';
  document.body.appendChild(el);
});
