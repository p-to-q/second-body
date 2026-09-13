/**
 * 第五层 · 离散接触音。与合成的四层**并列**，不是它们的修饰。
 *
 * 四层绑的是**信号**：在场、速度、升档、等待 —— 连续的，一直在那儿。
 * 这一层绑的是**动作**：观众伸手做了一件事，一记，放完就没了。
 * 于是这一层是全工程里唯一用录音素材的地方（`assets/sound/`，逐条授权在那边的
 * README）——真实的一次碰撞里有一千个微结构，合成补不出来；而反过来，
 * 连续的房间底噪用素材就会循环、会带别人的房间进来（那份 README 的第 1、4 条）。
 * 两边各做各擅长的，不是谁替代谁。
 *
 * ## 四条不能破的规矩
 *
 * 1. **预解码，事件时只 `start()`。** 开场把四个文件 fetch + decode 完，
 *    之后每一记就是建一个 source 再 start。解码是几十毫秒的事，
 *    放在点击那一刻做，观众听到的就是一记**迟到的**确认音 —— 那比没有还糟。
 *
 * 2. **解码不需要用户手势。** 用 `OfflineAudioContext` 解码（它不受自动播放策略
 *    约束），播放才用共享的 `AudioContext`。所以展签还立着的时候素材已经就位了。
 *    `AudioBuffer` 不绑在建它的那个 context 上，可以直接拿去别处播。
 *
 * 3. **加载失败 = 静默跳过（P3）。** 某个文件 404 或解不开，就只是那一记没有声音，
 *    页面一帧都不受影响，控制台一条 info。装置哑一记比崩一次好一万倍。
 *
 * 4. **和四层共用一个 `AudioContext`。** 见 `sharedAudioContext()` ——
 *    两个 context 就是两条音频线程、两次硬件抢占，而且 `m` 只关得掉一个。
 *
 * ## 名单，以及名单外的那几个空缺
 *
 * 原来的四记（`enter` / `pass` / `commit` / `idle`）的理由写在 `tuning.ts` 的
 * `SOUND.cues` 头上，升档与到货**故意**不在名单里。
 * 这一轮加了两记观众侧的（`reveal` / `ground`）和第六层的三个变体
 * （`work-a/b/c`，排程在 `work.ts`）—— 加与不加的理由都在 `docs/29` §2.6 / §2.7，
 * 那张"没有的，以及为什么没有"表这一轮又长了三行。
 * 这个文件仍然只负责**怎么放**。
 */
import { SOUND } from '../../../core/src/tuning.ts';
import { WORK, WORK_IDS, type WorkCueId } from './work.ts';

/** id 同时就是文件名（`assets/sound/<id>.webm`）—— 没有第二处登记 */
export type CueId =
  | 'enter' | 'pass' | 'commit' | 'idle'   // 观众的手（第五层，原来的四记）
  | 'reveal' | 'ground'                    // 观众的手 / 那具身体（这一轮加的两记）
  | WorkCueId;                             // 第六层 · 工作声，见 work.ts

export const CUE_IDS: readonly CueId[] = [
  'enter', 'pass', 'commit', 'idle', 'reveal', 'ground', ...WORK_IDS,
];

/** 每一记在页面上是什么动作。靶场的按钮标签与 docs/29 共用这一份 */
export const CUE_LABELS: Record<CueId, string> = {
  enter: 'S1 入口「开始」（同时是 AudioContext 的解锁时刻）',
  pass: 'S2 卡片经过（滚动 / 拖动 / 键盘跨过一张）',
  commit: 'S2 手动确认选中',
  idle: 'S2 30 秒无操作自动选择',
  reveal: 'S2 选择页落定（机器把一盘东西放到你面前）',
  ground: 'S4 肢体触地（那具身体的重量真的落在地上）',
  'work-a': 'S6 慢回路在跑：隔壁那间屋子里的一记（变体 a）',
  'work-b': 'S6 慢回路在跑：隔壁那间屋子里的一记（变体 b）',
  'work-c': 'S6 慢回路在跑：隔壁那间屋子里的一记（变体 c）',
};

/**
 * ⚠️ **暂居的旋钮**，理由与移交办法同 `work.ts` 的 `WORK`：
 * `packages/core/src/tuning.ts` 这一轮归另一条 lane。
 * 把这三个数按键名贴进 `SOUND.cues`，再删掉这个对象和 `cueGain()` 里那一行回退，
 * 这个文件的其余部分一个字都不用改。移交清单在 `docs/29-SOUND.md` §2.6。
 *
 * 相对关系就是设计（和原来那四个数同一条规矩，改之前先读 docs/29 §2.5 / §2.7）：
 * `enter` 0.85 > `commit` 0.58 > **`reveal` 0.40** > `idle` 0.32 > `pass` 0.26 >
 * **`ground` 0.22** ≈ **`work` 0.22**。
 */
const CUES_PENDING = {
  /** 选择页落定。低于 commit（你的决定重于机器的邀请），高于 idle（它毕竟是一次登场） */
  reveal: 0.40,
  /** 触地。它会**反复**发生，所以必须落在"质感"那一档，不能落在"通知"那一档 */
  ground: 0.22,
} as const;

/** 每记的增益。先问 `SOUND.cues`，没有才回退到暂居的那一块 —— 移交之后这里自动改道 */
export function cueGain(id: CueId): number {
  const tuned = (SOUND.cues as Record<string, unknown>)[id];
  if (typeof tuned === 'number') return tuned;
  if (id in CUES_PENDING) return CUES_PENDING[id as keyof typeof CUES_PENDING];
  return WORK.gain;   // 三个 work 变体共用一个基准，逐记的抖动由 work.ts 排
}

/**
 * 那一道"更远"的低通（Hz），没有就是 0。
 * 它是**可调的设计参数**，不是素材的属性 —— 所以不烘进文件（docs/29 §2.5）。
 */
export function cueTilt(id: CueId): number {
  if (id === 'idle') return SOUND.cues.idleTilt;
  if ((WORK_IDS as readonly string[]).includes(id)) return WORK.tilt;
  return 0;
}

/** `play()` 的逐记修正。只有第六层用得上 —— 它每一记的轻重快慢都是排出来的 */
export interface CuePlayOptions {
  /** 直接替换这一记的增益（已经算进 `WORK.gain`） */
  gain?: number;
  /** playbackRate */
  rate?: number;
}

export interface Cues {
  /** 放一记。没解码好、被节流、或静音时**什么都不做且不报错** */
  play(id: CueId, opts?: CuePlayOptions): void;
  /** 哪几记真的可以放。靶场用它显示加载结果，主程序不看 */
  readonly ready: Readonly<Record<CueId, boolean>>;
  dispose(): void;
}

export interface CuesOptions {
  /** `?mute=1`。true = 连 fetch 都不发 */
  muted: boolean;
  /** 素材根路径。dev 下 assets/ 就是静态根，构建后由 vite.config 的 SHIPPED 复制过去 */
  base?: string;
  /** 现场键盘静音开关。靶场把它关掉，免得和自己的按键冲突 */
  hotkey?: boolean;
}

const DEAD_READY: Record<CueId, boolean> = Object.fromEntries(
  CUE_IDS.map((id) => [id, false]),
) as Record<CueId, boolean>;

// ── 共享的 AudioContext ─────────────────────────────────────────────────────
//
// 为什么住在这个文件里而不是 sound.ts：**离散音先被需要**。
// `createSound()` 在 main.ts 里是选完主题之后才建的，而入口那一下点击和
// 整个选择页都发生在它之前 —— 如果 context 归 sound.ts 所有，
// 这一层就只能自己再开一个。两个 context = 两条音频线程，而且按 `m` 只关得掉一个。

let shared: AudioContext | null = null;
/** 建过一次就失败了 = 这台机器上没有音频。别每次调用都重试 */
let sharedDead = false;

/**
 * 拿到那一个 `AudioContext`，没有就建。
 * **必须在用户手势的那一轮里调**（浏览器自动播放策略），否则 Chrome 会在控制台
 * 留一条被拦截的警告 —— 而现场那块屏上每一条红字都会被人当成故障。
 */
export function sharedAudioContext(): AudioContext | null {
  if (shared || sharedDead) return shared;
  const Ctor = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
  if (!Ctor) {
    sharedDead = true;
    console.warn('[sound] 这个浏览器没有 AudioContext，静音继续');
    return null;
  }
  try {
    shared = new Ctor({ latencyHint: 'interactive' });
    void shared.resume().catch(() => {});
  } catch (err) {
    sharedDead = true;
    console.warn('[sound] AudioContext 建不起来，静音继续', err);
  }
  return shared;
}

/** 收尾。`sound.ts` 出事或 dispose 时走这里，**而不是自己 close()** —— 那会把这一层一起关掉 */
export function releaseSharedAudioContext(): void {
  const ctx = shared;
  shared = null;
  cueBus = null;
  void ctx?.close().catch(() => {});
}

// ── 静音 ───────────────────────────────────────────────────────────────────
//
// 静音状态是**模块级**的，因为按 `m` 的时候这一层可能还没有 Sound 对象作伴
// （选择页就是这样）。`setCuesMuted` 取绝对值而不是取反：于是无论是这里的
// 键盘处理、还是 sound.ts 的 `setMuted`、还是靶场那个按钮先调，
// 三条路收敛到同一个状态，不会互相抵消。

let cuesMuted = false;
let cueBus: GainNode | null = null;

function busGain(): number {
  return cuesMuted ? 0 : SOUND.cues.gain;
}

export function setCuesMuted(next: boolean): void {
  if (cuesMuted === next) return;
  cuesMuted = next;
  if (!cueBus || !shared) return;
  const now = shared.currentTime;
  cueBus.gain.cancelScheduledValues(now);
  // 离散音本来就短，淡出没有意义：直接给值，下一记自然就没了
  cueBus.gain.setValueAtTime(busGain(), now);
}

export function cuesAreMuted(): boolean {
  return cuesMuted;
}

// ── 解码 ───────────────────────────────────────────────────────────────────

/**
 * 开场解码一次。用 `OfflineAudioContext` 是为了**不等用户手势**：
 * 它只是个解码器，不碰输出设备，所以自动播放策略管不着它。
 * 长度给 1 帧就够 —— 我们只用它的 `decodeAudioData`。
 */
async function decodeAll(base: string): Promise<Partial<Record<CueId, AudioBuffer>>> {
  const Ctor = (globalThis as { OfflineAudioContext?: typeof OfflineAudioContext })
    .OfflineAudioContext;
  if (!Ctor) return {};
  const dec = new Ctor(1, 1, 48000);
  const out: Partial<Record<CueId, AudioBuffer>> = {};
  await Promise.all(CUE_IDS.map(async (id) => {
    try {
      const res = await fetch(`${base}/${id}.webm`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      out[id] = await dec.decodeAudioData(await res.arrayBuffer());
    } catch (err) {
      // 这一记没了，别的照常。**不重试** —— 重试改不了 404，只会再等一次超时
      console.info(`[cues] ${id} 没加载上，这一记静默（P3）：`, err);
    }
  }));
  return out;
}

// ── 本体 ───────────────────────────────────────────────────────────────────

/**
 * 当前这一个 `Cues`。
 *
 * 为什么需要一个模块级的引用：**第六层的排程住在 `sound.ts` 里**（它要 `dt`，
 * 而 `dt` 只有帧循环有），但放声音的是这里。`createCues()` 是 `main.ts` 建的，
 * `createSound()` 拿不到那个对象 —— 而让 `main.ts` 把它递过去，就得动 `main.ts`。
 * 这个引用把那条线收进 `sound/` 内部：外面一行都不用改。
 *
 * 它和 `shared` / `cuesMuted` 是同一类东西（模块级、一个进程一份），
 * 而这一页/这一个装置本来就只会有一个 `Cues`。
 */
let active: Cues | null = null;

export function activeCues(): Cues | null {
  return active;
}

export function createCues(opts: CuesOptions): Cues {
  if (!SOUND.enabled || !SOUND.cues.enabled || opts.muted) {
    if (opts.muted) cuesMuted = true;
    // 静音的空壳也要登记：第六层于是照常调用、照常什么都不发生（而不是去问"有没有"）
    active = { play() {}, ready: DEAD_READY, dispose() {} };
    return active;
  }

  const base = opts.base ?? '/sound';
  const buffers: Partial<Record<CueId, AudioBuffer>> = {};
  const ready: Record<CueId, boolean> = { ...DEAD_READY };
  const cleanups: (() => void)[] = [];
  let dead = false;

  // 不 await：解码在后台跑，跑完之前 play() 只是静默跳过。
  // 展签那几秒足够它跑完，而就算没跑完也**不能**让它挡住任何一帧。
  void decodeAll(base).then((got) => {
    Object.assign(buffers, got);
    for (const id of CUE_IDS) ready[id] = !!got[id];
  });

  // `m` 得自己接一份：观众在选择页上按 `m` 的时候，`createSound()` 还没被调
  // （它在选完主题之后才建），那边的处理还不存在。两边都在时也不会打架 ——
  // `setCuesMuted` 取的是绝对值，谁先跑到结果都一样。
  if (opts.hotkey !== false) {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'm' && e.key !== 'M') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      setCuesMuted(!cuesMuted);
    };
    addEventListener('keydown', onKey);
    cleanups.push(() => removeEventListener('keydown', onKey));
  }

  /** 连着经过的计数与上一记的时刻。节流与"渐远"都靠它 */
  let passAt = 0;
  let passRun = 0;

  function bus(ctx: AudioContext): GainNode {
    if (cueBus && cueBus.context === ctx) return cueBus;
    cueBus = ctx.createGain();
    cueBus.gain.value = busGain();
    cueBus.connect(ctx.destination);
    return cueBus;
  }

  const self: Cues = {
    play(id, playOpts) {
      if (dead || cuesMuted) return;
      const buf = buffers[id];
      if (!buf) return;                      // 还没解码好 / 没加载上 —— 静默（P3）

      let gain = playOpts?.gain ?? cueGain(id);
      let rate = playOpts?.rate ?? 1;

      if (id === 'pass') {
        // 节流靠时钟而不是靠"上一记放完没"：素材长度是可换的，节奏不是。
        const now = performance.now();
        if (now - passAt < SOUND.cues.passMinGapMs) return;
        passRun = now - passAt > SOUND.cues.passResetMs ? 0 : Math.min(3, passRun + 1);
        passAt = now;
        gain *= SOUND.cues.passRepeatDecay ** passRun;
        rate = 1 + (Math.random() * 2 - 1) * SOUND.cues.passDetune;
      }

      try {
        const ctx = sharedAudioContext();
        if (!ctx) { dead = true; return; }
        const out = bus(ctx);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = rate;

        const g = ctx.createGain();
        g.gain.value = gain;

        // "更远"的那道低通（自动选择那一记 600Hz，第六层 900Hz）。
        // 放在这里而不是烘进文件里，是因为它是**可调的设计参数**，不是素材的属性
        const tilt = cueTilt(id);
        if (tilt > 0) {
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = tilt;
          src.connect(lp).connect(g).connect(out);
        } else {
          src.connect(g).connect(out);
        }

        src.onended = () => { try { src.disconnect(); g.disconnect(); } catch { /* 已经断了 */ } };
        src.start();
      } catch (err) {
        // 和四层同一条规矩：第一次出错就永久闭嘴，不重试
        dead = true;
        console.warn(`[cues] ${id} 播放失败，离散音本次会话静默`, err);
      }
    },
    get ready() { return ready; },
    dispose() {
      dead = true;
      if (active === self) active = null;
      for (const c of cleanups) c();
      cleanups.length = 0;
    },
  };
  active = self;
  return self;
}

// ── 取证 ───────────────────────────────────────────────────────────────────

/**
 * 把每一记按 `at` 排进一条离线时间线，渲染成一段波形。
 *
 * 跑的是**和现场同一条链**（同一份 buffer、同一组增益、同一道低通），
 * 所以图上看到的就是观众会听到的 —— 这和 `render.ts` 那边
 * "取证必须跑同一份图"是同一条规矩，不是另写一个简化版。
 *
 * 顺序照的是观众的时间线：入口 → 选择页落定 → 连着经过三张 → 确认 →
 * 自动选择 → 触地 → 慢回路在跑（三记工作声）。
 * **每一个 id 都必须出现在这里**：没进这张图的那一记就没有证据，
 * `test/sound.test.ts` 有一条断言钉住这件事。
 */
export const CUE_SHEET: readonly { id: CueId; at: number }[] = [
  { id: 'enter', at: 0.35 },
  { id: 'reveal', at: 0.95 },
  { id: 'pass', at: 1.70 },
  { id: 'pass', at: 1.86 },
  { id: 'pass', at: 2.02 },
  { id: 'commit', at: 2.95 },
  { id: 'idle', at: 3.95 },
  { id: 'ground', at: 4.70 },
  // 第六层。三记之间的间隔照 WORK.gap 的量级排，图上看得出它是"稀疏且不规律"的
  { id: 'work-a', at: 5.60 },
  { id: 'work-c', at: 7.90 },
  { id: 'work-b', at: 11.40 },
];

export async function renderCues(
  buffers: Partial<Record<CueId, AudioBuffer>>, seconds = 12.2, sampleRate = 48000,
): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * sampleRate), sampleRate);
  const out = ctx.createGain();
  out.gain.value = SOUND.cues.gain;
  out.connect(ctx.destination);

  let run = 0;
  let prev = -Infinity;
  for (const { id, at } of CUE_SHEET) {
    const buf = buffers[id];
    if (!buf) continue;
    let gain = cueGain(id);
    if (id === 'pass') {
      // 连打的衰减在取证里也要照算，否则图上那三记一样高，
      // 而现场是一记比一记轻 —— 那张图就在骗人（P14）
      run = (at - prev) * 1000 > SOUND.cues.passResetMs ? 0 : Math.min(3, run + 1);
      gain *= SOUND.cues.passRepeatDecay ** run;
    }
    prev = at;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = gain;
    const tilt = cueTilt(id);
    if (tilt > 0) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = tilt;
      src.connect(lp).connect(g).connect(out);
    } else {
      src.connect(g).connect(out);
    }
    src.start(at);
  }
  return ctx.startRendering();
}

/** 靶场取证要拿到解码结果。主程序不需要 —— 它只会 `play()` */
export async function loadCueBuffers(base = '/sound'): Promise<Partial<Record<CueId, AudioBuffer>>> {
  return decodeAll(base);
}
