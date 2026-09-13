/**
 * 声音的外壳：解锁、静音、节流、以及"出事就闭嘴"。
 *
 * ## 三条不能破的规矩
 *
 * 1. **没有用户手势就不建 AudioContext。** 不是"建了再 resume" ——
 *    那样 Chrome 会在控制台留下一条被拦截的警告，而现场那块屏幕上
 *    每一条红字都会被人当成故障。所以这里等第一次 pointerdown/keydown。
 *    网页版那一下就是入口层的「开始」，现场那一下就是进全屏的那一下
 *    （`shell/kiosk.ts` 已经挂在同一个事件上），**因此不需要改 entry.ts**。
 *
 * 2. **音频初始化失败 = 静音继续。** 任何一处抛异常就永久闭嘴并记一条日志，
 *    画面一帧都不受影响（P3）。装置在现场哑了比崩了好一万倍。
 *
 * 3. **帧循环里不做重活。** `update()` 每帧被调，但只有攒够 1/controlHz
 *    才会真正写参数；写的还全是 `setTargetAtTime`，插值在音频线程上做。
 *
 * ## 现场怎么关
 *
 * `?mute=1` 连 context 都不建；运行中按 `m` 在 `killFade` 秒内淡到 0 并挂起
 * context（再按一次回来）。两条路都不经过重启（docs/29 §现场怎么调）。
 */
import { SOUND } from '../../../core/src/tuning.ts';
import { mulberry32 } from '../../../core/src/rng.ts';
import type { ThemeDef, Tier } from '../../../core/src/types.ts';
import { buildSoundGraph, type LayerId, type SoundGraph } from './graph.ts';
// AudioContext 归 cues.ts 所有，不归这里：离散音**先被需要**（入口那一下点击和
// 整个选择页都发生在 createSound() 之前），所以 context 的生命周期必须比这里长。
// 两个 context 就是两条音频线程，而且按 `m` 只关得掉一个。
import { activeCues, releaseSharedAudioContext, setCuesMuted, sharedAudioContext } from './cues.ts';
import { createWorkSchedule } from './work.ts';
import type { SoundSignal } from './signal.ts';
import { voiceOf } from './voice.ts';

export type SoundState = 'off' | 'locked' | 'running' | 'muted' | 'failed';

export interface Sound {
  /** 每帧调。内部节流到 SOUND.controlHz */
  update(s: SoundSignal, dt: number): void;
  /** 升档。**必须**与 `stage.pulse()` 同一帧调用，两者是同一个事件的两半 */
  tierUp(tier: Tier): void;
  /** 慢回路的零件到位了（docs/23 §S6 的那声确认音） */
  grafted(): void;
  setTheme(theme: ThemeDef | null | undefined): void;
  /** 返回切换之后是不是静音 */
  toggleMute(): boolean;
  readonly state: SoundState;
  readonly levels: Readonly<Record<LayerId, number>>;
  dispose(): void;
}

const DEAD_LEVELS: Record<LayerId, number> = { room: 0, body: 0, event: 0, wait: 0 };

/** `?mute=1` / `SOUND.enabled=false` / 初始化失败 共用的这一个空壳 */
function silentSound(state: SoundState): Sound {
  return {
    update() {}, tierUp() {}, grafted() {}, setTheme() {}, toggleMute() { return true; },
    state, levels: DEAD_LEVELS, dispose() {},
  };
}

export interface SoundOptions {
  /** `?mute=1`。true = 什么都不建 */
  muted: boolean;
  /** 会话种子。噪声由它决定 —— 同一个 seed 两次启动是同一段底噪 */
  seed: number;
  /** 开场就知道的条目；之后换条目用 `setTheme` */
  theme?: ThemeDef | null;
  /** 现场键盘静音开关。靶场把它关掉，免得和自己的按键冲突 */
  hotkey?: boolean;
}

export function createSound(opts: SoundOptions): Sound {
  if (!SOUND.enabled || opts.muted) return silentSound('off');

  let graph: SoundGraph | null = null;
  let ctx: AudioContext | null = null;
  let state: SoundState = 'locked';
  let acc = 0;
  let pending: ThemeDef | null | undefined = opts.theme;
  const cleanups: (() => void)[] = [];
  // 第六层的排程。种子从会话种子派生（+1）而不是复用：底噪和工作声用同一串
  // 随机数的话，换一个 seed 两者会**一起**变，那就看不出哪一半在动了。
  // 它住在这里是因为它要 `dt` —— 而 `dt` 只有 `update()` 有（work.ts 的文件头）。
  const work = createWorkSchedule(mulberry32((opts.seed + 1) >>> 0));

  /** 第一次出错就永久闭嘴。不重试 —— 一个每帧重试的坏音频比没有音频更糟 */
  function die(where: string, err: unknown): void {
    if (state === 'failed') return;
    state = 'failed';
    console.warn(`[sound] ${where} 失败，本次会话静音继续`, err);
    try { graph?.dispose(); } catch { /* 已经坏了 */ }
    graph = null;
    releaseSharedAudioContext();
    ctx = null;
  }

  function guard(where: string, fn: () => void): void {
    if (state === 'failed') return;
    try { fn(); } catch (err) { die(where, err); }
  }

  function unlock(): void {
    if (graph || state === 'failed') return;
    try {
      // 可能已经被离散音那一层建好了（入口那一下点击就会建）—— 那就直接用同一个
      ctx = sharedAudioContext();
      if (!ctx) { state = 'failed'; return; }   // 没有 AudioContext，cues.ts 已经吼过一次了
      graph = buildSoundGraph(ctx, { rng: mulberry32(opts.seed), voice: voiceOf(pending) });
      // 从 0 淡进来。直接给 master 一个值会在第一下点击上带一声"啪"
      graph.master.gain.setValueAtTime(0.0001, ctx.currentTime);
      graph.master.gain.setTargetAtTime(SOUND.master, ctx.currentTime, SOUND.fadeIn / 3);
      state = 'running';
      void ctx.resume().catch(() => {});
    } catch (err) {
      die('初始化', err);
    }
  }

  const onGesture = (): void => { unlock(); };
  addEventListener('pointerdown', onGesture, { once: true, passive: true });
  addEventListener('keydown', onGesture, { once: true });
  cleanups.push(() => {
    removeEventListener('pointerdown', onGesture);
    removeEventListener('keydown', onGesture);
  });

  function setMuted(next: boolean): void {
    // 离散音那一层也要跟着走。取绝对值不取反，所以它自己的 `m` 处理先跑过一遍也无所谓
    setCuesMuted(next);
    if (!graph || !ctx) { state = next ? 'muted' : 'locked'; return; }
    const now = ctx.currentTime;
    graph.master.gain.cancelScheduledValues(now);
    graph.master.gain.setTargetAtTime(next ? 0.0001 : SOUND.master, now, SOUND.killFade / 3);
    state = next ? 'muted' : 'running';
    // 挂起要等淡出走完，否则时钟停了、增益也就停在半路上
    if (next) setTimeout(() => { if (state === 'muted') void ctx?.suspend().catch(() => {}); }, SOUND.killFade * 1000 + 60);
    else void ctx.resume().catch(() => {});
  }

  if (opts.hotkey !== false) {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'm' && e.key !== 'M') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      setMuted(state !== 'muted');
      console.info(`[sound] ${state === 'muted' ? '静音' : '恢复'}（按 m 切换）`);
    };
    addEventListener('keydown', onKey);
    cleanups.push(() => removeEventListener('keydown', onKey));
  }

  return {
    update(s, dt) {
      if (!graph || !ctx || state !== 'running') return;
      // 节流：攒够一个控制周期才写参数。dt 传给 control 是**攒起来的那一段**，
      // 电平表的衰减才不会因为节流而变慢
      acc += Number.isFinite(dt) && dt > 0 ? dt : 0;
      const step = 1 / Math.max(1, SOUND.controlHz);
      if (acc < step) return;
      const elapsed = acc;
      acc = 0;
      guard('control', () => graph!.control(s, elapsed, ctx!.currentTime));
      // 第六层。它**不经过** graph：工作声是离散接触音，走 cues 那条总线
      //（于是 `m` 和 `?mute=1` 一起管得着它，而 `master` 管不着 —— 和第五层一致）。
      // 排程是纯的、可测的；这里只是把排出来的那一记递给 cues.play。
      // 排程抛异常不该拖垮四层，所以它自己一个 guard。
      guard('work', () => {
        const tick = work.update(s.waiting, elapsed);
        if (tick) activeCues()?.play(tick.id, { gain: tick.gain, rate: tick.rate });
      });
    },
    tierUp(tier) {
      if (!graph || !ctx || state !== 'running') return;
      guard('tierUp', () => graph!.trigger('tier', tier, ctx!.currentTime));
    },
    grafted() {
      if (!graph || !ctx || state !== 'running') return;
      guard('grafted', () => graph!.trigger('graft', 0, ctx!.currentTime));
    },
    setTheme(theme) {
      pending = theme;
      if (!graph || !ctx) return;                 // 还没解锁 —— 解锁时会用 pending
      guard('setTheme', () => graph!.setVoice(voiceOf(theme), ctx!.currentTime));
    },
    toggleMute() {
      setMuted(state !== 'muted');
      return state === 'muted';
    },
    get state() { return state; },
    get levels() { return graph?.levels ?? DEAD_LEVELS; },
    dispose() {
      for (const c of cleanups) c();
      cleanups.length = 0;
      try { graph?.dispose(); } catch { /* 收尾不该再抛 */ }
      graph = null;
      releaseSharedAudioContext();
      ctx = null;
      state = 'off';
    },
  };
}
