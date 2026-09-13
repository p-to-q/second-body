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

import { createCapture, type Capture } from './capture/capture.ts';
import { createPartLibrary } from './assets/library.ts';
import { createCreature } from './creature/creature.ts';
import { resolveShading, type ShadingId } from './creature/shading.ts';
import { createMassBody } from './creature/mass.ts';
import { createNascent } from './creature/nascent.ts';
import { createSwarmBody } from './creature/swarm.ts';
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
import { mountControls, type Controls } from './ui/controls.ts';
import { cornerColumn } from './ui/corner.ts';
import { mountPreview, wantsPreview, PREVIEW_BOTTOM } from './ui/preview.ts';
import { createHud } from './shell/hud.ts';
import { createSound } from './sound/sound.ts';
import { createCues } from './sound/cues.ts';
import { COPY } from './ui/i18n.ts';
import { ACTS, createDirector, type World } from './acts/index.ts';

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
  //
  // 控件条（`ui/controls.ts`）和它共用右上角，所以目录一展开就要让位。
  // 控件条要等身体和舞台都在了才挂得起来，于是这里只能留一个可变引用 ——
  // 两条线的先后顺序是真实存在的，不假装它不存在。
  // ── 0b. 网页版入口层（docs/PRD §8 / docs/23 §S0 网页分支） ─────────────────
  // 唯一的作用是把「请求摄像头」推迟到观众自己按那一下为止：在此之前用回放驱动，
  // 一次权限都不问。现场（?kiosk=1）和深链拿到 null，这一层等于不存在。
  // 它不阻塞下面的加载 —— 只有进 S2 之前会 await 一次 entry.started。
  //
  // **它必须在目录之前建**：目录要不要挂上来就铺开，答案就是"展签在不在"，
  // 而那个答案只有它知道。用它的返回值，不要在这里把它的条件重写一遍。
  const entry = mountEntry(flags);

  // 右上角那一列：目录 → 设置 → 控件，三节同流（`ui/corner.ts`）。
  // 只在真要挂东西的时候才建，否则空的 fixed 元素会吃掉指针事件。
  const corner = flags.nav ? cornerColumn() : undefined;

  let controls: Controls | null = null;
  const nav = mountNav({
    mount: corner,
    // 铺开是**展签版式的一部分** —— `shell/entry.css` 为它让出了右边一栏。
    // 深链和现场没有展签，也就没有那一栏：那时候铺开的目录是整片压在作品上的。
    startOpen: entry !== null,
    enabled: flags.nav, overlay: true,
  });

  // 离散接触音（docs/29 §第五层）。**必须在这里建**，不能跟着 createSound 走：
  // 它要放的四记里有三记发生在选择页上，而 createSound 是选完主题才建的。
  // 建它只是发四个 fetch + 一次离线解码，不碰输出设备、不等用户手势，
  // 所以展签还立着的时候素材就已经就位了。加载不上就是那一记没声音（P3）。
  const cues = createCues({ muted: flags.mute });

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
  // HUD 和那块小屏幕（`ui/preview.ts`）共用左上角，而小屏幕赢 ——
  // 它是给观众的，HUD 是给我们自己的。挂不挂只看 flags，所以这里就能算出来。
  const hud = flags.debug ? createHud({ top: wantsPreview(flags) ? PREVIEW_BOTTOM : 8 }) : null;

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

  // 展签一走，目录就收回那个词。理由同上：让出右边一栏的是展签的版式，
  // 展签不在了那一栏也就不在了，再铺着就是压在作品上。
  // 观众想看目录随时点得开 —— 收起来的不是入口，只是那张表。
  nav?.close();

  // 「开始」那一下同时是 AudioContext 的解锁时刻，一声轻触是"系统醒了"的唯一回执。
  // 放在 await 之后而不是塞进 entry.ts：`started` 是在 click 处理里 resolve 的，
  // 紧接着的这一个微任务仍在同一次用户手势内，浏览器照样放行。
  // 深链与现场（entry === null）没有这一下点击，也就没有这一声 —— 那是对的。
  if (entry) cues.play('enter');

  let theme = flags.theme ?? themeFromUrl();
  if (!theme) {
    // 举手滚动（`choose/ring/wave.ts`）。现场一件输入设备都没有，这是那一页
    // 唯一一条不靠鼠标/键盘的输入。三个条件缺一不可，**判断只在这一处**：
    //   1. `?wave=off` 没关掉它（认不出来的值 = 没写过，走默认 on）
    //   2. 这一刻驱动帧的真的是摄像头 —— 网页版入口层还在时用的是回放，
    //      现场 / 深链才是摄像头（和上面 `createCapture` 的判断同一条）
    //   3. `?demo=1` 不算。让一段录像去操作名单，观众看见的是"它自己在动"
    // 摄像头还在起（好几秒）时 `captureForChoose` 还是 null，手势就晚一点到位 ——
    // 这一页在此期间照常可以用鼠标/键盘，不需要等它。
    const waveOn = flags.wave !== 'off' && !entry && !flags.demo;
    let captureForChoose: { latest(): ReturnType<Capture['latest']> } | null = null;
    if (waveOn) void capturePromise.then((c) => { captureForChoose = c; });
    console.info(`[main] 选择页举手滚动：${waveOn ? 'on' : 'off'}（?wave=${flags.wave ?? '默认'}）`);
    await new Promise<void>((done) => {
      void chooseTheme({
        onChoose: (id) => { theme = id; done(); },
        seed: flags.seed ?? undefined,
        pose: waveOn ? () => captureForChoose?.latest() ?? null : undefined,
        onPass: () => cues.play('pass'),
        // 自动选择必须和手动确认**不是同一声**，否则观众会以为自己碰到了什么
        onCommit: (_id, how) => cues.play(how === 'idle' ? 'idle' : 'commit'),
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
  // `let`：控件条会在七种骨架之间热切它。`remapSkeleton` 是纯函数、每帧调一次，
  // 换一个值下一帧就生效 —— 会重建身体的只有"进出团块"，那一条走重载（见 controls.ts）。
  let bodyPlan = flags.plan ?? themeDef?.bodyPlan ?? 'rig';

  // ── 4b. 左上角那块小屏幕（`ui/preview.ts`）────────────────────────────────
  // **挂在这里，不是更早。** 它要显示摄像头画面，而这件作品有一条硬规矩：
  //「开始」之前一次权限都不问（`shell/entry.ts` 文件头）。挂在选择页之前，
  // 它就得先有画面可显示，那就等于把权限弹窗提到了第一眼 —— 正好是那条规矩
  // 存在的全部理由。所以它出现在**观众选完物种、已经进到作品里**之后：
  // 这一刻回放或摄像头都已经在跑，它显示的是真事。
  //
  // 挂不挂的判断在 `wantsPreview()` 一处（`?demo=1` 永不挂、`?kiosk=1` 默认不挂），
  // 这里不重写一遍那个条件 —— 和 `flags.nav` 同一条纪律。
  const preview = mountPreview({
    flags,
    // 用 getter：观众按下「用我的摄像头」之后 `capture` 会被整个换掉，
    // 这块屏幕必须跟着换到新的那一个 `<video>` 上。
    // `video` 只有 `WebcamCapture` 有（回放没有摄像头画面），所以按可选字段读 ——
    // 和 HUD 读 `camera` 是同一个写法，不为一个显示用的旁路去动 `Capture` 契约。
    video: () => (capture as { video?: HTMLVideoElement }).video ?? null,
    // "摄像头这条路通不通"问的是那条流还在不在，不是有没有报过错：
    // `lastError` 上会留着"GPU delegate 失败，回落 CPU"这种**已经被兜住**的旧账，
    // 拿它当判据，画面明明好好的却会一直写着"打开摄像头"。
    cameraOn: () => {
      const v = (capture as { video?: HTMLVideoElement }).video;
      return !!v?.srcObject;
    },
  });

  // ── 5. 状态机 ───────────────────────────────────────────────────────────
  const presence = createPresence();
  const stabilizer = createStabilizer();
  // 时域精化在**原始 landmark 上**做，在 buildSkeleton 之前 ——
  // 骨架是从 landmark 推出来的，先抖后建等于把抖动烘进骨长和朝向里，
  // 后面再滤就只能滤掉症状。顺序不能反（docs/24 §2）。
  // 建出来就不再拆：这两个是控件条上唯一**必须能当场比**的两项
  //（"它为什么看起来像活的"），而重建一次精化器等于丢掉整条滚动中位数。
  // 所以开关是一个 boolean，不是一个 null —— 关掉时它不参与那一帧，仅此而已。
  const refiner = REFINE.enabled ? createRefiner() : null;
  let refineOn = flags.refine;
  // 生命力在 remapSkeleton **之后**才作用（见帧循环）：延迟要发生在**那具身体**的链上，
  // 不是人的链上。反了的话四足的前腿会带着人类肩膀的延迟。
  const vitality = createVitality();
  let vitalityOn = flags.vitality;
  const motion = createMotion();
  const evolution = createEvolution();
  // 身体方案决定用哪种**表达**：刚体挂载（手办式）还是团块（物质式）。
  // 两者都满足 BodyInstance，帧循环不关心是哪一种（docs/18 §2）。
  const planKind = typeof bodyPlan === 'string' ? bodyPlan : (bodyPlan.kind ?? 'rig');
  const isMass = planKind === 'mass';
  // 点场（`creature/swarm.ts`）：和团块同一条路数的第三种表达 —— 一片跟着活骨架
  // 走的点，一件槽位件都不实例化。挂在 `field`／「场」这一个条目上，理由是它的
  // tagline 就是「身体消失，只剩运动」，而在这之前它**没有 bodyPlan**，
  // 走的是默认刚体装配、向别的物种借了一整套四肢。
  const isSwarm = planKind === 'swarm';
  // 着色语言：物种自己声明（`creature/shading.ts` 的那张表），`?shading=` 可覆盖。
  // 和 `bodyPlan` 同一条路数 —— 「线」这个物种的辨识度全在那一圈描边上，
  // 而描边是着色属性不是几何属性（docs/12），所以它只能在这里被决定。
  let shading: ShadingId = resolveShading(theme, flags.shading);
  const creature = createCreature({ library, shading });
  const massBody = isMass ? createMassBody({ library, theme: theme ?? undefined }) : null;
  const swarmBody = isSwarm ? createSwarmBody({ library, theme: theme ?? undefined }) : null;
  // 开场那一具：tier 0 是一个还没分化出零件的团块，tier ≥ 1 才长出刚体件。
  // 理由全写在 `creature/nascent.ts` 的文件头 —— 一句话是：兜底几何是 catch 块，
  // 不是形态，拿它当开场，观众读到的是"它坏了"。
  // `bodyPlan:'mass'` 的物种本来就全程是团块，不需要这一层。
  // `NASCENT.enabled=false` 时这里是 null，下面的 morph 就退回"每档都 remorph"，
  // 也就是改这版之前的行为 —— 那个开关的理由写在 tuning.ts 的 NASCENT.enabled 上。
  // 点场和团块一样，本来就全程不实例化零件 —— 开场那一层（团块 tier 0）
  // 对它没有意义：它没有"还没分化出零件"的阶段，它从来就没有零件。
  const nascent = isMass || isSwarm || !NASCENT.enabled
    ? null
    : createNascent({ creature, library, theme: theme ?? undefined });
  const body: BodyInstance = massBody ?? swarmBody ?? nascent ?? creature;
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
    if (isMass || isSwarm) return;
    nascent?.setTier(tier);
    // tier 0 一件部件都没有（parts.json 里 tier 0 的件数是 0），有开场形态接着的时候
    // remorph 只会白建 30 个占位实例然后被团块盖住 —— 那 30 个实例正是这次要拿掉的东西。
    if (!nascent || tier >= 1) {
      creature.remorph(makeGenome(seed, tier, library.index, { theme: theme ?? undefined, rejected: library.rejected }));
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

    // 那块小屏幕吃的是 **raw，不是精化之后的 cooked**。
    // 精化器会在遮挡时保持最后一次可信位置最多 0.67 秒（`core/refine.ts`）——
    // 那对身体是对的（抽搐比迟钝更毁体验），对这块屏幕是致命的：
    // 它会在人已经走出画面之后继续显示一副"看得见"的骨架。
    // 这块屏幕唯一的职责就是说实话，所以它站在滤波之前。
    preview?.update(raw, dt);

    if (raw) {
      // 运动特征算在**人的**骨架上：驱动演化的是观众实际动了多少，
      // 而不是重映射之后那具身体动了多少。顺序不能反。
      const cooked = refiner && refineOn ? refiner.apply(raw, dt) : raw;
      const humanSk = stabilizer.apply(buildSkeleton(mediapipeToWorld(cooked), cooked.world, cooked.t), dt);
      // 反折约束放在稳定化**之后**：它靠骨长把远端点转回去，
      // 而骨长要等滚动中位数定下来才可信（放前面就是拿噪声当尺子）。
      if (refiner && refineOn) clampFold(humanSk);
      lastFeatures = motion.update(humanSk, dt);
      const planned = remapSkeleton(humanSk, bodyPlan);
      // 刚体挂载做不出"弯"，但一串各自延迟不同的刚体看起来就是在弯 ——
      // 这是参照作品那句 "wiggles, shifts, and bends" 唯一能不做蒙皮就拿到的部分。
      // 方案要一起递进去：vitality 末尾还要落一次地，而"拿谁当基准"随方案变
      // （没有脚的方案按整具最低关节，见 core/bodyplan.ts 的 groundsByLowestJoint）
      lastSkeleton = vitalityOn ? vitality.apply(planned, lastFeatures, dt, bodyPlan) : planned;
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
      vitality.reset();
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
        // `camera` 只有 `WebcamCapture` 有（回放没有摄像头可选），所以按可选字段读 ——
        // 和上面 `instances` 同一个写法，不为一个显示字段去动 `Capture` 契约。
        cam: (capture as { camera?: { hud: string } | null }).camera?.hud,
        camFallback: (capture as { camera?: { why: string } | null }).camera?.why === 'fallback',
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

  // ── 控件条（`ui/controls.ts`）──────────────────────────────────────────────
  // 这件作品的能力此前全部只能用 URL 参数切，等于观众和评委看不见。
  // 这里只是把**已经存在的**开关接出去：一个都不新增，一个都不编。
  // 现场（`?kiosk=1`）下 `flags.nav` 为 false，这一整条不挂 —— 和目录同一个判断。
  controls = mountControls({
    enabled: flags.nav,
    mount: corner,
    nav,
    host: {
      themeId: theme ?? null,
      themes: library.index.themes ?? [],
      planId: () => (typeof bodyPlan === 'string' ? bodyPlan : (bodyPlan.kind ?? 'rig')),
      // 只在"两边都不是团块"时会被调到（controls.ts 的 setForm 负责那条判断）。
      // 换方案时把比例也一起丢掉是对的：比例是**那个物种**的身材，
      // 而观众此刻要看的正是"换一具身体会怎样"。
      setPlan: (id) => { bodyPlan = id; },
      sceneId: () => stage.sceneId,
      setScene: (id) => stage.setScene(id),
      actId: () => director.currentId,
      actIds: ACTS.filter((a) => a.kind === 'body').map((a) => a.id),
      setAct: (id) => director.force(id, world),
      vitality: () => vitalityOn,
      setVitality: (on) => { vitalityOn = on; if (!on) vitality.reset(); },
      refine: () => refineOn && refiner !== null,
      setRefine: (on) => { refineOn = on; if (!on) refiner?.reset(); },
      post: () => stage.post,
      setPost: (on) => stage.setPost(on),
      // 团块身体没有部件、也就没有可以套外壳的网格（docs/18 的两种表达）。
      // 这时候不给这一项，而不是给一个按了没反应的按钮 ——
      // 控件条只暴露真实存在的开关（`ui/controls.ts` 文件头的那一条纪律）。
      shading: massBody ? null : () => shading,
      setShading: massBody ? null : (id) => { shading = id; creature.setShading(id); },
      toggleMute: () => sound.toggleMute(),
      muted: () => sound.state === 'off' || sound.state === 'muted',
    },
  });

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
