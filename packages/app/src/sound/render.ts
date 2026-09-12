/**
 * 离线取证。
 *
 * 项目负责人没法在自动化环境里"听"，所以这里把声音变成**看得见的东西**：
 * 用 `OfflineAudioContext` 把同一份 `buildSoundGraph` 跑一遍，拿到整段波形，
 * 再由 `/dev/sound.html` 画成波形 + 频谱。
 *
 * 关键在于**跑的是同一份图**，不是一个为了截图另写的简化版 ——
 * 那种取证只能证明取证代码自己是对的。
 *
 * 每个场景只回答一个问题（和 `/dev/` 下其它页面同一条规矩：越窄越早知道是谁的锅）。
 */
import { SOUND } from '../../../core/src/tuning.ts';
import { mulberry32 } from '../../../core/src/rng.ts';
import type { Tier } from '../../../core/src/types.ts';
import { buildSoundGraph, type EventKind } from './graph.ts';
import type { SoundSignal } from './signal.ts';
import { voiceOf, type Voice } from './voice.ts';

export interface Scenario {
  id: string;
  /** 它证明什么。一句话 */
  proves: string;
  seconds: number;
  signal(t: number): SoundSignal;
  events?: readonly { at: number; kind: EventKind; tier: Tier }[];
  voice?: Voice;
}

const base = (over: Partial<SoundSignal>): SoundSignal => ({
  presence: 'ALIVE', transition: 1, speed: 0, jerk: 0, energy: 0,
  actId: 'follow', waiting: false, ...over,
});

/** 一段 0 → 峰 → 0 的运动，四个玩法共用同一条曲线，好并排比 */
const sweep = (t: number, seconds: number): number =>
  Math.sin(Math.PI * Math.min(1, Math.max(0, t / seconds))) * 1.25;

const actScenario = (actId: string, proves: string): Scenario => ({
  id: `act-${actId}`,
  proves,
  seconds: 9,
  signal: (t) => base({ actId, speed: sweep(t, 9), jerk: sweep(t, 9) * 8 }),
});

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'presence',
    proves: '有人 / 没人，房间的底噪真的不一样（第一层）',
    seconds: 14,
    signal: (t) => {
      if (t < 3) return base({ presence: 'IDLE', transition: 0 });
      if (t < 4.2) return base({ presence: 'ENTERING', transition: (t - 3) / 1.2 });
      if (t < 9.5) return base({ presence: 'ALIVE', transition: 1, energy: 0.8 });
      if (t < 12) return base({ presence: 'LEAVING', transition: (t - 9.5) / 2.5 });
      return base({ presence: 'IDLE', transition: 0 });
    },
  },
  {
    id: 'motion',
    proves: '身体层的增益跟着 MotionFeatures.speed 走（第二层 · 因果可见）',
    seconds: 12,
    signal: (t) => base({ speed: sweep(t, 12), jerk: t > 5.5 && t < 6.5 ? 14 : 0, energy: 1.2 }),
  },
  {
    id: 'tier',
    proves: '三次升档各有各的音高，且每次都落在 600ms 内（第三层 · docs/23 §S5）',
    seconds: 8,
    signal: () => base({ speed: 0.15 }),
    events: [
      { at: 1.0, kind: 'tier', tier: 1 },
      { at: 3.0, kind: 'tier', tier: 2 },
      { at: 5.0, kind: 'tier', tier: 3 },
      { at: 6.6, kind: 'graft', tier: 0 },
    ],
  },
  {
    id: 'wait',
    proves: '慢回路那 30–90 秒有声音撑着，到货时拍频收束（第四层）',
    seconds: 20,
    signal: (t) => base({ speed: 0.12, waiting: t > 1.5 && t < 14 }),
  },
  actScenario('follow', '基线：没有修正项的身体声'),
  actScenario('echo', '回声：同一段身体声延后 1.2s 又来了一遍'),
  actScenario('resist', '迟滞：更低、更闷、跟得更慢 —— 这是"重量"'),
  actScenario('facing', '对视：收窄、失谐 —— "它不再是我"'),
];

export function scenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

/**
 * 把一个场景渲染成整段波形。
 *
 * 主输出直接给到 `SOUND.master`，**不走那 1.4 秒淡入** ——
 * 淡入是解锁体验的一部分，不是声音设计的一部分，混在取证里只会让前两秒看不清。
 */
export async function renderScenario(sc: Scenario, seed = 0x50554e44, sampleRate = 44100): Promise<AudioBuffer> {
  const frames = Math.ceil(sc.seconds * sampleRate);
  const ctx = new OfflineAudioContext(1, frames, sampleRate);
  const graph = buildSoundGraph(ctx, { rng: mulberry32(seed), voice: sc.voice ?? voiceOf(null) });
  graph.master.gain.setValueAtTime(SOUND.master, 0);

  const step = 1 / Math.max(1, SOUND.controlHz);
  for (let t = 0; t < sc.seconds; t += step) graph.control(sc.signal(t), step, t);
  for (const e of sc.events ?? []) graph.trigger(e.kind, e.tier, e.at);

  return ctx.startRendering();
}

/**
 * 单声道 16-bit PCM WAV。为了能把一小段真的存进 `scratch/evidence/` ——
 * 波形图证明"在按信号变化"，wav 证明"它听起来是这个样子"，两者不能互相替代。
 */
export function toWav(buffer: AudioBuffer): Blob {
  const src = buffer.getChannelData(0);
  const bytes = new ArrayBuffer(44 + src.length * 2);
  const view = new DataView(bytes);
  const ascii = (at: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i)); };

  ascii(0, 'RIFF');
  view.setUint32(4, 36 + src.length * 2, true);
  ascii(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);                     // PCM
  view.setUint16(22, 1, true);                     // 单声道
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, src.length * 2, true);
  for (let i = 0; i < src.length; i++) {
    const v = Math.max(-1, Math.min(1, src[i]));
    view.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return new Blob([bytes], { type: 'audio/wav' });
}
