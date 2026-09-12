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
import { clampFold, createRefiner } from '../../core/src/refine.ts';
import { createMotion } from '../../core/src/motion.ts';
import { createEvolution } from '../../core/src/evolution.ts';
import { createPresence } from '../../core/src/presence.ts';
import { makeGenome } from '../../core/src/genome.ts';
import { remapSkeleton } from '../../core/src/bodyplan.ts';
import { mulberry32 } from '../../core/src/rng.ts';
import { CAPTURE, REFINE } from '../../core/src/tuning.ts';
import type { MotionFeatures, Skeleton, Tier } from '../../core/src/types.ts';

import { createCapture } from './capture/capture.ts';
import { createPartLibrary } from './assets/library.ts';
import { createCreature } from './creature/creature.ts';
import { createMassBody } from './creature/mass.ts';
import type { BodyInstance } from './creature/body.ts';
import { createStage } from './stage/stage.ts';
import { chooseTheme, themeFromUrl } from './choose/choose.ts';
import { createFrameLoop } from './shell/safe-frame.ts';
import { showBootError } from './shell/boot-error.ts';
import { createSlowLoop } from './slow/slow.ts';
import { enterKiosk, readFlags } from './shell/kiosk.ts';
import { mountCameraButton, mountEntry } from './shell/entry.ts';
import { createHud } from './shell/hud.ts';
import { ACTS, createDirector, type World } from './acts/index.ts';

const flags = readFlags();

async function boot(): Promise<void> {
  // ── 0. 网页版入口层（docs/PRD §8 / docs/23 §S0 网页分支） ─────────────────
  // 唯一的作用是把「请求摄像头」推迟到观众自己按那一下为止：在此之前用回放驱动，
  // 一次权限都不问。现场（?kiosk=1）和深链拿到 null，这一层等于不存在。
  // 它不阻塞下面的加载 —— 只有进 S2 之前会 await 一次 entry.started。
  const entry = mountEntry(flags);

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
    // 入口层在场 = 还没人授权过 → 先用回放起步（见 shell/entry.ts 的文件头）
    const c = await createCapture(entry ? 'replay' : undefined);
    await c.start();
    if (c.lastError) console.warn('[main] capture:', c.lastError);
    return c;
  })();

  // 展签还立着的时候不要把选择页顶出来。加载在后面照常进行，这里只等那一下点击。
  await entry?.started;

  let theme = flags.theme ?? themeFromUrl();
  if (!theme) {
    await new Promise<void>((done) => {
      void chooseTheme({
        onChoose: (id) => { theme = id; done(); },
        seed: flags.seed ?? undefined,
      }).then((handle) => { if (!handle) done(); });   // handle 为 null = URL 里已经有主题
    });
  }

  // 血统：前人留在这台机器上的件，有机会进下一个人的候选池（docs/17 §5）。
  // 这是「模型会被改变、会留下后果」的那一半 —— 没有它，慢回路只是一次性的礼物；
  // 有了它，这台机器上的物种池是被历任观众改写过的。
  // 生产构建下这个端点是 404，`lineage()` 返回空数组，开场一点都不受影响。
  const slow = createSlowLoop({
    mask: () => capture.latestMask(),
    species: () => theme ?? '',
    loadGeometry: (url) => library.loadUrl(url),
    // 团块身体没有槽位，也就没有"接一个零件上去"这回事 —— 它的表达是连续的。
    // 这不是缺陷，是 docs/18 里两种表达的分界；慢回路对它静默跳过。
    body: () => (massBody ? null : creature),
  });
  for (const p of await slow.lineage(theme ?? '')) {
    if (!library.index.parts.some((q) => q.id === p.id)) library.index.parts.push(p);
  }

  // 预取被选中主题的部件，免得进场后第一秒还在拿占位几何顶着
  const wanted = library.index.parts.filter((p) => p.family === theme).map((p) => p.id);
  await Promise.race([
    library.preload(wanted),
    new Promise((r) => setTimeout(r, 2500)),   // 预取失败/慢也不许卡住进场
  ]);

  // `let` 而不是 `const`：观众按下「用我的摄像头」之后，这一个引用会被换掉
  // （回放 → 摄像头）。两个实现可互换是 Capture 的硬契约，帧循环不需要知道换过。
  let capture = await capturePromise;

  // 身体方案：物种自己声明，?plan= 可覆盖（docs/18-BODY-PLANS.md）。
  // 这是「物种真的不一样」与「同一具人体换皮」之间的那一行。
  const themeDef = library.index.themes?.find((t) => t.id === theme);
  stage.setTheme(themeDef ?? theme ?? null, library.index);
  const bodyPlan = flags.plan ?? themeDef?.bodyPlan ?? 'rig';

  // ── 5. 状态机 ───────────────────────────────────────────────────────────
  const presence = createPresence();
  const stabilizer = createStabilizer();
  // 时域精化在**原始 landmark 上**做，在 buildSkeleton 之前 ——
  // 骨架是从 landmark 推出来的，先抖后建等于把抖动烘进骨长和朝向里，
  // 后面再滤就只能滤掉症状。顺序不能反（docs/24 §2）。
  const refiner = REFINE.enabled && flags.refine ? createRefiner() : null;
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
    // getter：capture 会在运行中被换掉（回放 → 摄像头），玩法必须看到当前那一个
    get capture() { return capture; },
    creature: body, stage, library, flags,
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
      const cooked = refiner ? refiner.apply(raw, dt) : raw;
      const humanSk = stabilizer.apply(buildSkeleton(mediapipeToWorld(cooked), cooked.world, cooked.t), dt);
      // 反折约束放在稳定化**之后**：它靠骨长把远端点转回去，
      // 而骨长要等滚动中位数定下来才可信（放前面就是拿噪声当尺子）。
      if (refiner) clampFold(humanSk);
      lastFeatures = motion.update(humanSk, dt);
      lastSkeleton = remapSkeleton(humanSk, bodyPlan);
      stage.frame(lastSkeleton);   // 取景按**重映射之后**的身体算：四足是横的矮的
      const evo = evolution.update(lastFeatures, dt);
      // 团块的"沸腾"层由运动能量驱动 —— 动得越猛表面越沸（tuning 的 MASS.surface）
      massBody?.setEnergy(lastFeatures.energy);
      // ?tier= 锁定时不让演化改形态 —— look dev 要的是一个不动的靶子
      if (evo.tierChanged && flags.tier === null) {
        morph(evo.tier);
        stage.pulse(evo.tier);      // docs/23 §S5：升档必须可感知，否则演化等于没发生
      }
    }
    // 身体怎么动交给当前的 Act。追踪短暂丢失时 lastSkeleton 还在，
    // Act 会继续用它 pose，所以画面不会僵死（P3）。
    // 升档那 0.15 秒的时间停滞对**身体**生效，对状态机不生效 ——
    // 否则 charge 和在场判定会跟着一起变慢，观众会觉得"卡了一下"而不是"顿了一下"。
    director.update(world, dt * stage.timeScale);

    // 慢回路：站够 SLOW_LOOP.armAfter 秒才武装。它内部**从不 await**在这一帧上，
    // 失败的正确表现是什么都没发生 —— 观众不该知道刚才有东西在跑（P3）。
    slow.update(p.state === 'ALIVE', dt);

    // 人走了 → 换一个种子，下一个人是全新的身体（docs/05 §5）
    if (presence.justReset) {
      seed = (Math.random() * 0xffffffff) >>> 0;
      motion.reset();
      evolution.reset();
      stabilizer.reset();
      refiner?.reset();
      slow.reset();
      lastSkeleton = null;
      morph((flags.tier ?? 0) as Tier);
    }

    stage.update(p, lastFeatures, dt);
    stage.render(renderer);   // 后期链在舞台里；?nopost=1 时它退化成直出

    if (hud) {
      const s = body.stats;
      hud.update(loop.stats, {
        instances: (s as { instances?: number }).instances ?? 0, triangles: s.triangles,
        drawCalls: s.drawCalls, inferenceHz: capture.fps,
        act: director.currentId ?? '—',
        // 精化的三个数挂在 note 上而不是扩 HudCounts：它们只在调参时看，
        // 不值得为此动一个被所有页面共用的契约。
        note: [
          note,
          refiner && `hold=${refiner.stats.held} drop=${refiner.stats.dropped} q=${refiner.stats.cutoffScale.toFixed(2)}`,
          slow.phase !== 'idle' && `slow:${slow.phase}${slow.note ? `(${slow.note})` : ''}`,
        ].filter(Boolean).join(' · '),
      });
    }
  });

  if (flags.act && !director.force(flags.act, world)) {
    console.warn(`[main] ?act=${flags.act} 不存在或已被禁用，按正常流程选`);
  }

  loop.start();

  // 唯一请求摄像头权限的地方。失败（拒绝 / 没有摄像头）就留着按钮，回放继续跑 ——
  // 观众看到的不是一个报错，而是"还没换成我"（docs/23 §S1 网页分支）。
  if (entry) {
    mountCameraButton(async () => {
      const cam = await createCapture('webcam');
      await cam.start();
      if (cam.lastError) { console.warn('[main] camera:', cam.lastError); cam.stop(); return false; }
      capture.stop();
      capture = cam;
      return true;
    });
  }

  console.info(
    `[main] running · theme=${theme} · seed=${seed} · ` +
    `plan=${planKind} · capture=${entry || flags.demo ? 'replay' : 'webcam'} · ` +
    `acts=${ACTS.map((a) => a.id).join(',')}`,
  );
}

void boot().catch(showBootError);
