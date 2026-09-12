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
import { createVitality } from '../../core/src/vitality.ts';
import { createMotion } from '../../core/src/motion.ts';
import { createEvolution } from '../../core/src/evolution.ts';
import { createPresence } from '../../core/src/presence.ts';
import { makeGenome } from '../../core/src/genome.ts';
import { remapSkeleton } from '../../core/src/bodyplan.ts';
import { mulberry32 } from '../../core/src/rng.ts';
import { CAPTURE, NASCENT, REFINE } from '../../core/src/tuning.ts';
import type { MotionFeatures, Skeleton, Tier } from '../../core/src/types.ts';

import { createCapture } from './capture/capture.ts';
import { createPartLibrary } from './assets/library.ts';
import { createCreature } from './creature/creature.ts';
import { createMassBody } from './creature/mass.ts';
import { createNascent } from './creature/nascent.ts';
import type { BodyInstance } from './creature/body.ts';
import { createStage } from './stage/stage.ts';
import { chooseTheme, themeFromUrl } from './choose/choose.ts';
import { createFrameLoop } from './shell/safe-frame.ts';
import { showBootError } from './shell/boot-error.ts';
import { createSlowLoop } from './slow/slow.ts';
import { enterKiosk, readFlags } from './shell/kiosk.ts';
import { mountCameraButton, mountEntry } from './shell/entry.ts';
import { mountLoading } from './shell/loading.ts';
import { showNotice } from './shell/notice.ts';
import { mountNav } from './ui/nav.ts';
import { createHud } from './shell/hud.ts';
import { createSound } from './sound/sound.ts';
import { COPY } from './ui/i18n.ts';import { ACTS, createDirector, type World } from './acts/index.ts';

const flags = readFlags();

/**
 * 「正在准备零件」这一档里，`parts.json` 自己占多少。
 * 剩下的留给选择页那 23 张 anchor 图 —— 它们才是这一档真正要等的东西。
 */
const PARTS_INDEX_SHARE = 0.15;

async function boot(): Promise<void> {
  // ── 0. 加载态（docs/23 §S0）─────────────────────────────────────────────
  // 在这之前，从打开 URL 到身体出现之间观众看到的是一块黑屏。它挂在最前面，
  // 但 600ms 宽限期内一帧都不画 —— 快的时候观众仍然不该看见这个场景。
  // `?loading=0` 返回空实现，所以下面的调用点不需要写 if。
  const loading = mountLoading(flags);

  // 目录（docs/23 §S4）。现场（`?kiosk=1`）下 `flags.nav` 为 false，等于不存在。
  // 挂在这里而不是等选择页结束：慢网上它正好是那几秒里唯一"还有别的可看"的出口。
  mountNav({ enabled: flags.nav, overlay: true });

  // ── 0b. 网页版入口层（docs/PRD §8 / docs/23 §S0 网页分支） ─────────────────
  // 唯一的作用是把「请求摄像头」推迟到观众自己按那一下为止：在此之前用回放驱动，
  // 一次权限都不问。现场（?kiosk=1）和深链拿到 null，这一层等于不存在。
  // 它不阻塞下面的加载 —— 只有进 S2 之前会 await 一次 entry.started。
  const entry = mountEntry(flags);

  // ── 1. 资产先开跑。它不依赖渲染器 ────────────────────────────────────────
  // 原来它排在 `renderer.init()` **后面**。可 parts.json 和 anchor 图跟渲染器
  // 一点关系都没有，而 init() 是首次 pipeline 编译，慢机器上要好几秒 ——
  // 那几秒里管子完全是空的。改成并行，首屏少等的正是这一整段。
  // 失败也 resolve：没有 parts.json 时用占位几何照跑（ADR-4）。
  loading.begin('parts');
  const library = createPartLibrary();
  const libraryReady = library.load().then(() => loading.progress('parts', PARTS_INDEX_SHARE));

  // ── 2. 渲染器与舞台 ──────────────────────────────────────────────────────
  loading.begin('render');
  const renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  // 渲染器造出来了 —— 这是这一档里唯一一个 init() 之前就成立的真事实。
  // 报它是因为 init() 是一个不可分割的长 await：没有这一格，慢机器上
  // 「正在点亮画面」会在 0% 上停好几秒，而停住的数字读起来就是"坏了"。
  loading.progress('render', 0.4);
  // WebGPU 必须先 init() 才能同步 render()。renderAsync() 已废弃，
  // 而且每帧 await 会把渲染塞进微任务队列，帧时间读数会骗人。
  await renderer.init();
  loading.done('render');
  document.body.appendChild(renderer.domElement);

  // 回落到 WebGL2 了没有。**在这里读，不在这里说** —— 说要等加载态收掉之后（见下面），
  // 否则这句话会被那一层盖住，等它露出来的时候 4 秒早就走完了（实测踩过）。
  const renderFellBack =
    (renderer.backend as { isWebGPUBackend?: boolean } | undefined)?.isWebGPUBackend !== true;

  const stage = createStage();
  stage.resize(innerWidth, innerHeight);
  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    stage.resize(innerWidth, innerHeight);
  });

  enterKiosk(renderer.domElement, flags);
  const hud = flags.debug ? createHud() : null;

  // ── 3. 等资产（上面早就在跑了）──────────────────────────────────────────
  await libraryReady;
  if (library.usingFallback) console.warn('[main] 没有部件库，用程序化占位几何运行');

  // ── 4. 采集与选主题**并行** ──────────────────────────────────────────────
  // 为什么并行：MediaPipe 的 wasm + 两个模型要好几秒。串行的话观众选完主题
  // 会盯着一块黑屏等它加载 —— 而那正是整个体验里最需要连贯的一刻
  //（卡片冲向镜头、溶解、然后身体应该**已经在那里了**）。
  loading.begin('body');
  const capturePromise = (async () => {
    // 入口层在场 = 还没人授权过 → 先用回放起步（见 shell/entry.ts 的文件头）
    // onStep 是采集端自己报的真实里程碑，不是定时器（见 capture.ts 的 CaptureStep）
    const c = await createCapture(entry ? 'replay' : undefined, {
      onStep: (done, total) => loading.progress('body', done / total),
    });
    await c.start();
    if (c.lastError) console.warn('[main] capture:', c.lastError);
    loading.done('body');
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
        // 这一页真正的等待在它返回之前（23 张 anchor 图）。只上报，不改这一页的任何表现。
        onProgress: (n, total) => loading.progress(
          'parts', PARTS_INDEX_SHARE + (1 - PARTS_INDEX_SHARE) * (total ? n / total : 1),
        ),
      }).then((handle) => {
        // 选择页已经在屏幕上了 —— 观众有事可做，加载态立刻让位。
        // 剩下的预取在后面继续跑，但它不该再挡着任何人。
        loading.finish();
        if (!handle) done();   // handle 为 null = URL 里已经有主题
      });
    });
  } else {
    loading.done('parts');
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
  // 深链（`?theme=`）没经过选择页，加载态要在这里收 —— 它是幂等的，重复调用无害
  loading.finish();

  // `let` 而不是 `const`：观众按下「用我的摄像头」之后，这一个引用会被换掉
  // （回放 → 摄像头）。两个实现可互换是 Capture 的硬契约，帧循环不需要知道换过。
  let capture = await capturePromise;

  // 身体方案：物种自己声明，?plan= 可覆盖（docs/18-BODY-PLANS.md）。
  // 这是「物种真的不一样」与「同一具人体换皮」之间的那一行。
  const themeDef = library.index.themes?.find((t) => t.id === theme);
  stage.setTheme(themeDef ?? theme ?? null, library.index);

  // 进场这一刻，`docs/23` 允许说两句话，都只说一次、都自己淡掉：
  //
  //   §S4  左下角物种名 —— 「观众需要知道自己选的是什么，但只需要知道一次」。
  //        此前这一行不存在：选择页一退场，观众就再也没机会知道自己选了什么。
  //   §S0  右下角「降级渲染」—— 只给网页版。现场静默：站在装置前面的人
  //        对这条信息无能为力，说了只是打扰。此前只有一行 console.warn，
  //        而那是给我们看的，不是给观众看的。
  if (themeDef) showNotice({ zh: themeDef.name, en: themeDef.nameEn });
  if (renderFellBack && !flags.kiosk) showNotice(COPY.boot.fallbackRender, { corner: 'bottom-right' });
  const bodyPlan = flags.plan ?? themeDef?.bodyPlan ?? 'rig';

  // ── 5. 状态机 ───────────────────────────────────────────────────────────
  const presence = createPresence();
  const stabilizer = createStabilizer();
  // 时域精化在**原始 landmark 上**做，在 buildSkeleton 之前 ——
  // 骨架是从 landmark 推出来的，先抖后建等于把抖动烘进骨长和朝向里，
  // 后面再滤就只能滤掉症状。顺序不能反（docs/24 §2）。
  const refiner = REFINE.enabled && flags.refine ? createRefiner() : null;
  // 生命力在 remapSkeleton **之后**才作用（见帧循环）：延迟要发生在**那具身体**的链上，
  // 不是人的链上。反了的话四足的前腿会带着人类肩膀的延迟。
  const vitality = flags.vitality ? createVitality() : null;
  const motion = createMotion();
  const evolution = createEvolution();
  // 身体方案决定用哪种**表达**：刚体挂载（手办式）还是团块（物质式）。
  // 两者都满足 BodyInstance，帧循环不关心是哪一种（docs/18 §2）。
  const planKind = typeof bodyPlan === 'string' ? bodyPlan : (bodyPlan.kind ?? 'rig');
  const isMass = planKind === 'mass';
  const creature = createCreature({ library });
  const massBody = isMass ? createMassBody({ library, theme: theme ?? undefined }) : null;
  // 开场那一具：tier 0 是一个还没分化出零件的团块，tier ≥ 1 才长出刚体件。
  // 理由全写在 `creature/nascent.ts` 的文件头 —— 一句话是：兜底几何是 catch 块，
  // 不是形态，拿它当开场，观众读到的是"它坏了"。
  // `bodyPlan:'mass'` 的物种本来就全程是团块，不需要这一层。
  // `NASCENT.enabled=false` 时这里是 null，下面的 morph 就退回"每档都 remorph"，
  // 也就是改这版之前的行为 —— 那个开关的理由写在 tuning.ts 的 NASCENT.enabled 上。
  const nascent = isMass || !NASCENT.enabled
    ? null
    : createNascent({ creature, library, theme: theme ?? undefined });
  const body: BodyInstance = massBody ?? nascent ?? creature;
  stage.scene.add(body.object);

  let seed = flags.seed ?? (Math.random() * 0xffffffff) >>> 0;   // 会话级种子，仅此一处

  // 声音（docs/29-SOUND.md）。四层各绑一个**已经算好的**信号，所以这里只是转手，
  // 不新增任何计算。它自己等第一次用户手势才建 AudioContext（浏览器自动播放策略），
  // 建不起来就永久静音继续 —— 画面一帧都不受影响（P3）。
  const sound = createSound({ muted: flags.mute, seed, theme: themeDef ?? null });
  let slowWas = slow.phase;
  let lastFeatures: MotionFeatures | null = null;
  let lastSkeleton: Skeleton | null = null;
  let tier: Tier = (flags.tier ?? 0) as Tier;
  let note = '';
  let elapsedT = 0;

  const morph = (t?: Tier) => {
    if (t !== undefined) tier = t;
    // 团块没有槽位件可换 —— 它的"演化"由 tier 驱动的表面参数表达，不是换装。
    if (isMass) return;
    nascent?.setTier(tier);
    // tier 0 一件部件都没有（parts.json 里 tier 0 的件数是 0），有开场形态接着的时候
    // remorph 只会白建 30 个占位实例然后被团块盖住 —— 那 30 个实例正是这次要拿掉的东西。
    if (!nascent || tier >= 1) {
      creature.remorph(makeGenome(seed, tier, library.index, { theme: theme ?? undefined }));
    }
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
      const planned = remapSkeleton(humanSk, bodyPlan);
      // 刚体挂载做不出"弯"，但一串各自延迟不同的刚体看起来就是在弯 ——
      // 这是参照作品那句 "wiggles, shifts, and bends" 唯一能不做蒙皮就拿到的部分。
      lastSkeleton = vitality ? vitality.apply(planned, lastFeatures, dt) : planned;
      stage.frame(lastSkeleton);   // 取景按**重映射之后**的身体算：四足是横的矮的
      const evo = evolution.update(lastFeatures, dt);
      // 团块的"沸腾"层由运动能量驱动 —— 动得越猛表面越沸（tuning 的 MASS.surface）
      massBody?.setEnergy(lastFeatures.energy);
      nascent?.setEnergy(lastFeatures.energy);
      // ?tier= 锁定时不让演化改形态 —— look dev 要的是一个不动的靶子
      if (evo.tierChanged && flags.tier === null) {
        morph(evo.tier);
        stage.pulse(evo.tier);      // docs/23 §S5：升档必须可感知，否则演化等于没发生
        sound.tierUp(evo.tier);     // 同一个事件的另一半。两半必须在同一帧，否则读成两件事
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
      vitality?.reset();
      slow.reset();
      lastSkeleton = null;
      morph((flags.tier ?? 0) as Tier);
    }

    // 声音吃的是 **未经时间停滞缩放的 dt**：升档那 0.15 秒画面顿一下是设计，
    // 声音跟着顿会变成"卡带"。理由和状态机不吃 timeScale 是同一条。
    if (slow.phase === 'grafted' && slowWas !== 'grafted') sound.grafted();
    slowWas = slow.phase;
    sound.update({
      presence: p.state, transition: p.transition,
      speed: lastFeatures?.speed ?? 0,
      jerk: lastFeatures?.jerk ?? 0,
      energy: lastFeatures?.energy ?? 0,
      actId: director.currentId,
      waiting: slow.phase === 'running',
    }, dt);

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
    `acts=${ACTS.map((a) => a.id).join(',')} · sound=${sound.state}`,
  );
}

void boot().catch(showBootError);
