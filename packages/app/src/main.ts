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
import { CAPTURE } from '../../core/src/tuning.ts';
import type { MotionFeatures, Skeleton, Tier } from '../../core/src/types.ts';

import { createCapture } from './capture/capture.ts';
import { createPartLibrary } from './assets/library.ts';
import { createCreature } from './creature/creature.ts';
import { createStage } from './stage/stage.ts';
import { chooseTheme, themeFromUrl } from './choose/choose.ts';
import { createFrameLoop } from './shell/safe-frame.ts';
import { enterKiosk, readFlags } from './shell/kiosk.ts';
import { createHud } from './shell/hud.ts';

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

  // ── 3. 选主题。URL 里给了就跳过选择页（现场锁定 / 复现用） ────────────────
  let theme = flags.theme ?? themeFromUrl();
  if (!theme) {
    await new Promise<void>((done) => {
      void chooseTheme({
        onChoose: (id) => { theme = id; done(); },
        seed: flags.seed ?? undefined,
      }).then((handle) => { if (!handle) done(); });   // handle 为 null = URL 里已经有主题
    });
  }

  // ── 4. 采集。?demo=1 走回放，不拖 MediaPipe 的 wasm ──────────────────────
  const capture = await createCapture();
  await capture.start();
  if (capture.lastError) console.warn('[main] capture:', capture.lastError);

  // ── 5. 状态机 ───────────────────────────────────────────────────────────
  const presence = createPresence();
  const stabilizer = createStabilizer();
  const motion = createMotion();
  const evolution = createEvolution();
  const creature = createCreature({ library });
  stage.scene.add(creature.object);

  let seed = flags.seed ?? (Math.random() * 0xffffffff) >>> 0;   // 会话级种子，仅此一处
  let lastFeatures: MotionFeatures | null = null;
  let lastSkeleton: Skeleton | null = null;

  const morph = (tier: Tier) => {
    creature.remorph(makeGenome(seed, tier, library.index, { theme: theme ?? undefined }));
  };
  morph((flags.tier ?? 0) as Tier);

  // ── 6. 一帧（docs/06 §1） ────────────────────────────────────────────────
  const loop = createFrameLoop((dt) => {
    const raw = capture.latest();
    const detected = raw !== null && raw.score > CAPTURE.minScore;
    const p = presence.update(detected, dt);

    if (raw) {
      const sk = stabilizer.apply(buildSkeleton(mediapipeToWorld(raw), raw.world, raw.t), dt);
      lastSkeleton = sk;
      lastFeatures = motion.update(sk, dt);
      const evo = evolution.update(lastFeatures, dt);
      // ?tier= 锁定时不让演化改形态 —— look dev 要的是一个不动的靶子
      if (evo.tierChanged && flags.tier === null) morph(evo.tier);
      creature.pose(sk, p, dt);
    } else if (lastSkeleton) {
      creature.pose(lastSkeleton, p, dt);      // 追踪短暂丢失：保持最后姿态（P3）
    }

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
      const s = creature.stats;
      hud.update(loop.stats, {
        instances: s.instances, triangles: s.triangles,
        drawCalls: s.drawCalls, inferenceHz: capture.fps,
      });
    }
  });

  loop.start();
  console.info(`[main] running · theme=${theme} · seed=${seed} · capture=${flags.demo ? 'replay' : 'webcam'}`);
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
