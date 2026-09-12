/**
 * 噪声源。整个声音系统只有这一处产生随机数，而且它用的是传进来的 `Rng`
 * —— 不是 `Math.random()`（AGENTS.md 不变量）。同一个 seed 两次启动，
 * 房间的底噪是同一段底噪；这既是可复现，也是取证能对得上的前提。
 *
 * 为什么是粉噪不是白噪：白噪的能量均匀分布在每赫兹上，听觉上是"嘶——"，
 * 读作**设备噪声**；粉噪每倍频程等能量，读作**空间**。这件作品的第一层
 * 要的是"这个房间是活的"，不是"这台机器开着"。
 * 近似用 Paul Kellet 的三极点滤波器（公开算法，十行，不值得引依赖）。
 *
 * 做成一段循环缓冲而不是 ScriptProcessor / AudioWorklet：
 * 缓冲播放完全跑在音频线程上，**帧循环里一个字节都不动**（P5）。
 */
import type { Rng } from '../../../core/src/types.ts';

/** 循环段长度（秒）。短于 2s 的粉噪能听出周期；长了只是白占内存 */
const LOOP_SECONDS = 4;

/** 归一化后的峰值。留 15% 余量给下游的滤波器共振（带通 Q 高时会抬起来） */
const PEAK = 0.85;

export function makeNoiseBuffer(ctx: BaseAudioContext, rng: Rng): AudioBuffer {
  const n = Math.max(1, Math.floor(ctx.sampleRate * LOOP_SECONDS));
  // 接缝交叉淡化的长度。多生成这么多样本，专门用来盖住循环的那一下
  const fade = Math.min(4096, n >> 2);

  const tmp = new Float32Array(n + fade);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < tmp.length; i++) {
    const w = rng.next() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.0990460;
    b1 = 0.96300 * b1 + w * 0.2965164;
    b2 = 0.57000 * b2 + w * 1.0526913;
    tmp[i] = b0 + b1 + b2 + w * 0.1848;
  }

  // 按实测峰值归一到 PEAK，而不是乘一个猜出来的系数。
  // 粉噪的峰值因子随 seed 波动得厉害（实测 1.3 ~ 1.7 倍 RMS 之上），
  // 拍脑袋的系数总有某个 seed 会把总线顶到削顶 —— 而削顶只会在现场出现。
  let peak = 0;
  for (const v of tmp) peak = Math.max(peak, Math.abs(v));
  const norm = peak > 1e-6 ? PEAK / peak : 0;
  for (let i = 0; i < tmp.length; i++) tmp[i] *= norm;

  // 把"第 n..n+fade 段"交叉淡进开头，接缝处两边是同一条连续信号。
  // 不能只把首尾各淡到 0 —— 那样每 4 秒会出现一次音量凹陷，
  // 而周期性的凹陷比噪声本身更容易被耳朵抓住。
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const out = buf.getChannelData(0);
  out.set(tmp.subarray(0, n));
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    out[i] = tmp[i] * t + tmp[n + i] * (1 - t);
  }
  return buf;
}
