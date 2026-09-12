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
 * ## 为什么是四记，以及为什么不是六记
 *
 * 名单与理由写在 `tuning.ts` 的 `SOUND.cues` 头上（升档与到货故意不在这里）。
 * 这个文件只负责**怎么放**。
 */
import { SOUND } from '../../../core/src/tuning.ts';

/** 四个事件。id 同时就是文件名（`assets/sound/<id>.webm`）—— 没有第二处登记 */
export type CueId = 'enter' | 'pass' | 'commit' | 'idle';

export const CUE_IDS: readonly CueId[] = ['enter', 'pass', 'commit', 'idle'];

/** 每一记在页面上是什么动作。靶场的按钮标签与 docs/29 共用这一份 */
export const CUE_LABELS: Record<CueId, string> = {
  enter: 'S1 入口「开始」（同时是 AudioContext 的解锁时刻）',
  pass: 'S2 卡片经过（滚动 / 拖动 / 键盘跨过一张）',
  commit: 'S2 手动确认选中',
  idle: 'S2 30 秒无操作自动选择',
};

export interface Cues {
  /** 放一记。没解码好、被节流、或静音时**什么都不做且不报错** */
  play(id: CueId): void;
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

const DEAD_READY: Record<CueId, boolean> = { enter: false, pass: false, commit: false, idle: false };

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

export function createCues(opts: CuesOptions): Cues {
  if (!SOUND.enabled || !SOUND.cues.enabled || opts.muted) {
    if (opts.muted) cuesMuted = true;
    return { play() {}, ready: DEAD_READY, dispose() {} };
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

  return {
    play(id) {
      if (dead || cuesMuted) return;
      const buf = buffers[id];
      if (!buf) return;                      // 还没解码好 / 没加载上 —— 静默（P3）

      let gain = SOUND.cues[id];
      let rate = 1;

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

        // 自动选择那一记多一道低通 = "更远"。放在这里而不是烘进文件里，
        // 是因为它是**可调的设计参数**（SOUND.cues.idleTilt），不是素材的属性
        if (id === 'idle') {
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = SOUND.cues.idleTilt;
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
      for (const c of cleanups) c();
      cleanups.length = 0;
    },
  };
}

// ── 取证 ───────────────────────────────────────────────────────────────────

/**
 * 把四记按 `at` 排进一条离线时间线，渲染成一段波形。
 *
 * 跑的是**和现场同一条链**（同一份 buffer、同一组 `SOUND.cues` 增益、
 * idle 同一道低通），所以图上看到的就是观众会听到的 —— 这和 `render.ts`
 * 那边"取证必须跑同一份图"是同一条规矩，不是另写一个简化版。
 */
export const CUE_SHEET: readonly { id: CueId; at: number }[] = [
  { id: 'enter', at: 0.35 },
  { id: 'pass', at: 1.30 },
  { id: 'pass', at: 1.46 },
  { id: 'pass', at: 1.62 },
  { id: 'commit', at: 2.55 },
  { id: 'idle', at: 3.55 },
];

export async function renderCues(
  buffers: Partial<Record<CueId, AudioBuffer>>, seconds = 4.4, sampleRate = 48000,
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
    let gain = SOUND.cues[id];
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
    if (id === 'idle') {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = SOUND.cues.idleTilt;
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
