/**
 * 四层声音的图。**它只依赖 `BaseAudioContext`**，不依赖 `window`、不依赖时钟 ——
 * 于是同一份代码既跑在现场的 `AudioContext` 上，也跑在取证用的
 * `OfflineAudioContext` 上（`render.ts`）。取证证明的就是现场跑的那一份，
 * 不是一个"为了截图另写的简化版"。
 *
 * 分层与信号的对应写在 `tuning.ts` 的 `SOUND` 块头上，不在这里重复。
 * 这个文件只讲**怎么接**，以及几个不接成这样就会出问题的地方：
 *
 * - 所有连续参数走 `setTargetAtTime`。它在音频线程上做指数趋近，
 *   于是控制率只有 30Hz 也听不出台阶；而且掉帧时参数不会跟着卡住。
 * - 房间层的慢呼吸由一个 0.077Hz 的振荡器直接调制增益，**不经过帧循环**。
 *   会呼吸的东西不该依赖别人每帧来推它一下。
 * - 末端挂一个压缩器当限幅。现场调错一个数就炸掉音响是完全可能的，
 *   而"声音难听"远好过"声音吓人"。
 */
import { SOUND } from '../../../core/src/tuning.ts';
import type { Rng, Tier } from '../../../core/src/types.ts';
import { makeNoiseBuffer } from './noise.ts';
import type { SoundSignal } from './signal.ts';
import { voiceOf, type Voice } from './voice.ts';

export type LayerId = 'room' | 'body' | 'event' | 'wait';
export type EventKind = 'tier' | 'graft';

export interface SoundGraph {
  readonly ctx: BaseAudioContext;
  /** 淡入淡出与静音都作用在它上面。取证时也从这里往后接分析节点 */
  readonly master: GainNode;
  /** 控制率更新。`time` = 参数生效的 ctx 时间；离线取证要能把它排到未来 */
  control(s: SoundSignal, dt: number, time: number): void;
  trigger(kind: EventKind, tier: Tier, time: number): void;
  setVoice(v: Voice, time: number): void;
  /** 各层当前的目标电平 0..1。电平表读它 —— 离线也算得出来，不需要 analyser */
  readonly levels: Readonly<Record<LayerId, number>>;
  dispose(): void;
}

const clamp = (n: number, lo: number, hi: number): number =>
  (Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo);
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 0 = 这里没有人，1 = 人完全在场。四个 presence 状态压成一个数 */
function presenceAmount(s: SoundSignal): number {
  const t = clamp(s.transition, 0, 1);
  if (s.presence === 'ALIVE') return 1;
  if (s.presence === 'ENTERING') return t;
  if (s.presence === 'LEAVING') return 1 - t;
  return 0;
}

/** 当前玩法对身体层音色的修正。`follow` 是基线，所以它没有条目（tuning 里也没有） */
function actColor(actId: string | null): {
  tilt: number; q: number; gain: number; tau: number; detune: number; echo: number;
} {
  const a = SOUND.acts;
  if (actId === 'resist') {
    return { tilt: a.resist.tiltMul, q: 1, gain: a.resist.gainMul, tau: a.resist.tauMul, detune: 0, echo: 0 };
  }
  if (actId === 'facing') {
    return { tilt: 1, q: a.facing.qMul, gain: a.facing.gainMul, tau: 1, detune: a.facing.detune, echo: 0 };
  }
  if (actId === 'echo') {
    return { tilt: 1, q: 1, gain: 1, tau: 1, detune: 0, echo: a.echo.mix };
  }
  return { tilt: 1, q: 1, gain: 1, tau: 1, detune: 0, echo: 0 };
}

/**
 * 带通把宽带噪声削成一条窄带，剩下的能量随带宽走。**不补这一刀，
 * `SOUND.body.gain` 就不再是"身体层有多响"**，而是"带通有多窄"的副产品：
 * 实测未补偿时身体层比房间层低 18dB —— 也就是根本听不见，
 * 于是 PRD §3 的"因果可见"在听觉上等于不存在。
 * 补偿之后 `body.gain` 和 `room.aliveGain` 才在同一把尺子上。
 *
 * 二阶带通的等效噪声带宽 ≈ (f0/Q)·π/2。
 */
function makeup(f0: number, q: number, sampleRate: number): number {
  const bw = Math.max(20, (f0 / Math.max(0.3, q)) * (Math.PI / 2));
  return Math.sqrt(sampleRate / 2 / bw);
}

export interface GraphOptions {
  rng: Rng;
  /** 起始音色。运行中换条目用 `setVoice` */
  voice?: Voice;
}

export function buildSoundGraph(ctx: BaseAudioContext, opts: GraphOptions): SoundGraph {
  let voice = opts.voice ?? voiceOf(null);

  // ── 总线 ────────────────────────────────────────────────────────────────
  // 限幅器不是"音质处理"，是护栏：现场把某个 gain 调错一位数时，
  // 观众听到的是被压住的声音，而不是一次全量程的爆音。
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.004;
  limiter.release.value = 0.18;
  limiter.connect(ctx.destination);

  const master = ctx.createGain();
  master.gain.value = 0;          // 解锁时才淡进来
  master.connect(limiter);

  const bus = ctx.createGain();
  bus.gain.value = 1;
  bus.connect(master);

  // ── 噪声源：一段循环缓冲，两个播放头 ────────────────────────────────────
  const buffer = makeNoiseBuffer(ctx, opts.rng);
  const sources: AudioBufferSourceNode[] = [];
  const noiseSource = (rate: number, offset: number): AudioBufferSourceNode => {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.playbackRate.value = rate;
    // 两个播放头错开起点，否则房间层和身体层是同一段噪声的两份拷贝，
    // 听起来会像一个被加了共振的东西，而不是两层。
    src.start(0, offset % buffer.duration);
    sources.push(src);
    return src;
  };

  // ── 第一层 · 房间 ───────────────────────────────────────────────────────
  const roomSrc = noiseSource(1, 0);
  const roomHP = ctx.createBiquadFilter();
  roomHP.type = 'highpass';
  roomHP.frequency.value = SOUND.room.floorHz;
  const roomLP = ctx.createBiquadFilter();
  roomLP.type = 'lowpass';
  roomLP.frequency.value = SOUND.room.idleTilt;
  roomLP.Q.value = 0.4;
  /** 呼吸只改这一级，基准增益改下一级 —— 两件事分开才调得动 */
  const roomBreath = ctx.createGain();
  roomBreath.gain.value = 1;
  const roomBase = ctx.createGain();
  roomBase.gain.value = SOUND.room.idleGain;
  roomSrc.connect(roomHP).connect(roomLP).connect(roomBreath).connect(roomBase).connect(bus);

  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = SOUND.room.breatheHz;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = SOUND.room.breatheDepth;
  lfo.connect(lfoDepth).connect(roomBreath.gain);
  lfo.start(0);

  // ── 第二层 · 身体 ───────────────────────────────────────────────────────
  const bodySrc = noiseSource(1.31, buffer.duration * 0.41);
  const bodyBP = ctx.createBiquadFilter();
  bodyBP.type = 'bandpass';
  bodyBP.frequency.value = voice.reson;
  bodyBP.Q.value = voice.q;
  const bodyMakeup = ctx.createGain();
  bodyMakeup.gain.value = makeup(voice.reson, voice.q, ctx.sampleRate);
  const bodyGain = ctx.createGain();
  bodyGain.gain.value = 0;
  bodySrc.connect(bodyBP).connect(bodyMakeup).connect(bodyGain).connect(bus);

  // 高频"擦"层：由 jerk 驱动。它和主共振是两路，因为它们回答的是两个问题
  //（"是什么材质" vs "动得有多猛"），混在一个滤波器里就分不开了。
  const sizzleHP = ctx.createBiquadFilter();
  sizzleHP.type = 'highpass';
  sizzleHP.frequency.value = SOUND.body.sizzleHz;
  const sizzleGain = ctx.createGain();
  sizzleGain.gain.value = 0;
  bodySrc.connect(sizzleHP).connect(sizzleGain).connect(bus);

  // 回声玩法：身体层复制一份延后送出。常驻但增益为 0 ——
  // 现建现拆一个 DelayNode 会在切玩法的那一刻产生一次爆音。
  const delay = ctx.createDelay(4);
  delay.delayTime.value = SOUND.acts.echo.delay;
  const feedback = ctx.createGain();
  feedback.gain.value = SOUND.acts.echo.feedback;
  const echoGain = ctx.createGain();
  echoGain.gain.value = 0;
  bodyGain.connect(delay);
  delay.connect(feedback).connect(delay);
  delay.connect(echoGain).connect(bus);

  // ── 第四层 · 等待（第三层是一次性的，见 trigger） ───────────────────────
  const waitGain = ctx.createGain();
  waitGain.gain.value = 0;
  const waitLP = ctx.createBiquadFilter();
  waitLP.type = 'lowpass';
  waitLP.frequency.value = 900;
  waitLP.connect(waitGain).connect(bus);
  const waitA = ctx.createOscillator();
  const waitB = ctx.createOscillator();
  waitA.type = 'sine';
  waitB.type = 'sine';
  waitA.frequency.value = voice.root / 2;
  waitB.frequency.value = voice.root / 2 + SOUND.wait.beatHz;
  const waitMix = ctx.createGain();
  waitMix.gain.value = 0.5;
  waitA.connect(waitMix);
  waitB.connect(waitMix);
  waitMix.connect(waitLP);
  waitA.start(0);
  waitB.start(0);

  // ── 状态 ────────────────────────────────────────────────────────────────
  const levels: Record<LayerId, number> = { room: 0, body: 0, event: 0, wait: 0 };
  let wasWaiting = false;
  let disposed = false;

  /** `setTargetAtTime` 的 τ：要在 `seconds` 内走完 ~95%，τ ≈ seconds/3 */
  const tauFor = (seconds: number): number => Math.max(0.005, seconds / 3);

  const ramp = (p: AudioParam, value: number, time: number, tau: number): void => {
    p.setTargetAtTime(value, time, Math.max(0.005, tau));
  };

  function control(s: SoundSignal, dt: number, time: number): void {
    if (disposed) return;
    const here = presenceAmount(s);

    // 房间：有人 = 更厚、更亮。**这是唯一在无人时也响的层**
    const roomGain = mix(SOUND.room.idleGain, SOUND.room.aliveGain, here);
    const energyOpen = 1 + 0.35 * clamp(s.energy / 2, 0, 1);
    ramp(roomBase.gain, roomGain, time, tauFor(SOUND.room.tau));
    ramp(roomLP.frequency, mix(SOUND.room.idleTilt, SOUND.room.aliveTilt, here) * energyOpen,
      time, tauFor(SOUND.room.tau));
    levels.room = roomGain / SOUND.room.aliveGain;

    // 身体：速度驱动增益，玩法驱动音色。没有人就没有身体声 —— 身体不在那儿了
    const c = actColor(s.actId);
    const speedN = clamp(s.speed / SOUND.body.speedRef, 0, 1.4);
    const target = (SOUND.body.minGain + (SOUND.body.gain - SOUND.body.minGain) * speedN) * c.gain * here;
    const tau = SOUND.body.tau * c.tau;
    const f0 = voice.reson * c.tilt * Math.pow(2, c.detune / 1200);
    const q = voice.q * c.q;
    ramp(bodyGain.gain, target, time, tau);
    ramp(bodyBP.frequency, f0, time, tau);
    ramp(bodyBP.Q, q, time, SOUND.tau);
    // 玩法也会改带宽（resist 压低中心、facing 收窄 Q），补偿要跟着一起走，
    // 否则"更闷"会连带变成"更小声"——那是两件事
    ramp(bodyMakeup.gain, makeup(f0, q, ctx.sampleRate), time, SOUND.tau);
    ramp(sizzleGain.gain, SOUND.body.sizzleGain * clamp(s.jerk / SOUND.body.jerkRef, 0, 1) * here,
      time, SOUND.body.tau);
    ramp(echoGain.gain, c.echo * here, time, 0.25);
    levels.body = clamp(target / Math.max(1e-6, SOUND.body.gain), 0, 1);

    // 等待：只在慢回路真的在跑的时候存在。到货（waiting 落回 false）时
    // 两个振荡器收束到同频 —— 拍频消失就是"想通了"，不需要另外一个音来宣布
    const waiting = s.waiting && here > 0;
    if (waiting !== wasWaiting) {
      const base = voice.root / 2;
      ramp(waitB.frequency, waiting ? base + SOUND.wait.beatHz : base, time,
        tauFor(waiting ? 0.5 : SOUND.wait.resolve));
      wasWaiting = waiting;
    }
    ramp(waitGain.gain, waiting ? SOUND.wait.gain : 0, time,
      tauFor(waiting ? SOUND.wait.fadeIn : SOUND.wait.fadeOut));
    levels.wait = waiting ? 1 : Math.max(0, levels.wait - dt / Math.max(0.05, SOUND.wait.fadeOut));

    // 事件层的电平表是我们自己算的包络：一次性节点没法被持续读数
    levels.event = Math.max(0, levels.event - dt / Math.max(0.05, SOUND.event.duration));
  }

  function trigger(kind: EventKind, tier: Tier, time: number): void {
    if (disposed) return;
    const e = SOUND.event;
    const isTier = kind === 'tier';
    const dur = isTier ? e.duration : e.graftDuration;
    const peak = isTier ? e.gain : e.graftGain;
    // 升档往上走（得到了什么）；零件到位是一个更轻、更高、没有打击的确认
    const ratio = isTier ? (e.tierRatio[clamp(tier, 0, 3)] ?? 1) : 1.5;
    const f0 = voice.root * ratio;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(peak, time + e.attack);
    // 指数衰减到 -60dB 附近。setTargetAtTime 永远到不了 0，所以末尾补一刀
    env.gain.setTargetAtTime(0.0001, time + e.attack, tauFor(dur));
    env.gain.setValueAtTime(0, time + dur + 0.05);
    env.connect(bus);

    const stopAt = time + dur + 0.1;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f0;
    osc.connect(env);
    osc.start(time);
    osc.stop(stopAt);

    // 第二个泛音只给升档。它是"这具身体多了一档"的那点金属感；
    // 零件到位不该有 —— 那是礼物，不是成就（docs/23 §S6）。
    if (isTier) {
      const upper = ctx.createOscillator();
      upper.type = 'triangle';
      upper.frequency.value = f0 * 3;
      const upperGain = ctx.createGain();
      upperGain.gain.value = 0.18;
      upper.connect(upperGain).connect(env);
      upper.start(time);
      upper.stop(stopAt);

      // 打击瞬间的噪声。没有它只是"一个音"，有了它才是"一次合上"
      const burst = ctx.createBufferSource();
      burst.buffer = buffer;
      burst.loop = true;
      burst.playbackRate.value = 2;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f0 * 6;
      bp.Q.value = 1.2;
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(e.noiseGain * peak, time);
      bg.gain.setTargetAtTime(0.0001, time, tauFor(e.noiseDecay));
      bg.gain.setValueAtTime(0, time + e.noiseDecay * 4);
      burst.connect(bp).connect(bg).connect(bus);
      burst.start(time, 0);
      burst.stop(time + e.noiseDecay * 4 + 0.02);
    }

    levels.event = 1;
  }

  return {
    ctx,
    master,
    control,
    trigger,
    setVoice(v, time) {
      voice = v;
      if (disposed) return;
      // 换条目 = 换物种。音色要跟着换，但不能"啪"地一下 —— 与相机重新取景
      // 同一条道理（STAGE.framingTau），所以走和取景差不多的时间常数。
      ramp(bodyBP.frequency, v.reson, time, 0.45);
      ramp(bodyBP.Q, v.q, time, 0.45);
      ramp(bodyMakeup.gain, makeup(v.reson, v.q, ctx.sampleRate), time, 0.45);
      ramp(waitA.frequency, v.root / 2, time, 0.45);
      ramp(waitB.frequency, v.root / 2 + (wasWaiting ? SOUND.wait.beatHz : 0), time, 0.45);
    },
    levels,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const s of sources) { try { s.stop(); } catch { /* 已经停了 */ } }
      try { lfo.stop(); waitA.stop(); waitB.stop(); } catch { /* 同上 */ }
      try { master.disconnect(); limiter.disconnect(); } catch { /* 同上 */ }
    },
  };
}
