/**
 * 声音里**能在 node 里测的那一部分**：音色推导、噪声缓冲、以及两条跨模块的约定。
 *
 * 图本身测不了（node 没有 Web Audio），所以图的证据走另一条路：
 * `/dev/sound.html` 的离线渲染 + `scratch/evidence/sound-*.png`。
 * 这里只守住那些"错了但不会有人发现"的地方 —— 尤其是两条跨文件的对齐，
 * 它们各自看都对，合起来才是错的。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { SOUND, STAGE } from '../../core/src/tuning.ts';
import { mulberry32 } from '../../core/src/rng.ts';
import { voiceOf } from '../src/sound/voice.ts';
import { makeNoiseBuffer } from '../src/sound/noise.ts';
import { SCENARIOS } from '../src/sound/render.ts';
import type { ThemeDef } from '../../core/src/types.ts';

const theme = (humanLike: number, lifeLike: number): ThemeDef => ({
  id: 't', kind: 'archetype', name: '测试', nameEn: 'test', tagline: '',
  palette: [], source: 'procedural', axes: { humanLike, lifeLike }, coverage: 'full',
});

/** 线性插值到端点会带一个 ulp 的误差，逐位比较没有意义 */
const near = (a: number, b: number, msg?: string): void =>
  assert.ok(Math.abs(a - b) < 1e-9, msg ?? `${a} ≉ ${b}`);

test('音色：lifeLike 两端各自落在 tuning 里那两个数上', () => {
  near(voiceOf(theme(0.5, 1)).reson, SOUND.voice.resonHiLife);
  near(voiceOf(theme(0.5, 0)).reson, SOUND.voice.resonLoLife);
  near(voiceOf(theme(0.5, 1)).q, SOUND.voice.qHiLife);
  near(voiceOf(theme(0.5, 0)).q, SOUND.voice.qLoLife);
  near(voiceOf(theme(1, 0.5)).root, SOUND.voice.rootHiHuman);
  near(voiceOf(theme(0, 0.5)).root, SOUND.voice.rootLoHuman);
});

test('音色：越有机共振越低 —— 这条单调性是"瓷 vs 绒毛"能听出来的全部依据', () => {
  let prev = Infinity;
  for (let life = 0; life <= 1.0001; life += 0.1) {
    const v = voiceOf(theme(0.5, life));
    assert.ok(v.reson < prev, `lifeLike=${life.toFixed(1)} 的共振没有比上一档更低`);
    prev = v.reson;
  }
});

test('音色：没有条目 / 轴是 NaN 都落在中点，不产生 NaN', () => {
  // 拿不到条目要的是"一个中性音色"，不是静音，更不是 NaN 把整条链毒掉（P3）
  const mid = voiceOf(theme(0.5, 0.5));
  assert.deepEqual(voiceOf(null), mid);
  assert.deepEqual(voiceOf(undefined), mid);
  assert.deepEqual(voiceOf(theme(NaN, NaN)), mid);
  for (const v of Object.values(voiceOf(theme(2, -3)))) assert.ok(Number.isFinite(v));
});

test('对齐：升档的声音和 stage.pulse 一样长 —— 不一样就读成两件事', () => {
  assert.equal(SOUND.event.duration, STAGE.pulseDuration);
});

test('对齐：回声层的延迟等于 acts/echo.ts 的 1.2s', () => {
  // echo.ts 里那个数没有导出（它是玩法内部的事），所以这里钉死字面量：
  // 哪天有人改了其中一个，这条会红。
  assert.equal(SOUND.acts.echo.delay, 1.2);
});

/** 只用到 sampleRate / createBuffer 的那一小块 —— 够 makeNoiseBuffer 跑 */
function fakeCtx(sampleRate = 8000): BaseAudioContext {
  return {
    sampleRate,
    createBuffer(_ch: number, length: number, sr: number) {
      const data = new Float32Array(length);
      return { length, sampleRate: sr, duration: length / sr, getChannelData: () => data };
    },
  } as unknown as BaseAudioContext;
}

test('噪声：同一个 seed 两次得到同一段 —— 所有随机都来自传入的 Rng', () => {
  const a = makeNoiseBuffer(fakeCtx(), mulberry32(7)).getChannelData(0);
  const b = makeNoiseBuffer(fakeCtx(), mulberry32(7)).getChannelData(0);
  const c = makeNoiseBuffer(fakeCtx(), mulberry32(8)).getChannelData(0);
  assert.deepEqual(Array.from(a.slice(0, 64)), Array.from(b.slice(0, 64)));
  assert.notDeepEqual(Array.from(a.slice(0, 64)), Array.from(c.slice(0, 64)));
});

test('噪声：有限、不削顶、不是一条直线', () => {
  const d = makeNoiseBuffer(fakeCtx(), mulberry32(1)).getChannelData(0);
  let peak = 0, sum = 0;
  for (const v of d) {
    assert.ok(Number.isFinite(v));
    peak = Math.max(peak, Math.abs(v));
    sum += v * v;
  }
  const rms = Math.sqrt(sum / d.length);
  assert.ok(peak < 1, `峰值 ${peak.toFixed(3)} 到了满量程，混进总线一定会削`);
  assert.ok(rms > 0.01 && rms < 0.4, `RMS ${rms.toFixed(4)} 不像噪声`);
});

test('噪声：循环接缝是连续的 —— 每 4 秒一声"嗒"比噪声本身更容易被听见', () => {
  const d = makeNoiseBuffer(fakeCtx(), mulberry32(3)).getChannelData(0);
  // 接缝处（末样本 → 首样本）的跳变不该显著大于段内相邻样本的典型跳变
  let typical = 0;
  for (let i = 1; i < d.length; i++) typical += Math.abs(d[i] - d[i - 1]);
  typical /= d.length - 1;
  const seam = Math.abs(d[0] - d[d.length - 1]);
  assert.ok(seam < typical * 12, `接缝跳变 ${seam.toFixed(4)} vs 典型 ${typical.toFixed(4)}`);
});

test('取证场景：每个场景都有名字、有它证明的那句话、时长为正', () => {
  const ids = new Set<string>();
  for (const sc of SCENARIOS) {
    assert.ok(sc.id && !ids.has(sc.id), `场景 id 重复或为空：${sc.id}`);
    ids.add(sc.id);
    assert.ok(sc.proves.length > 4, `${sc.id} 没写清楚它证明什么`);
    assert.ok(sc.seconds > 0);
    // 场景函数在整段上都要给出合法信号：靶场和取证都直接喂它
    for (let t = 0; t < sc.seconds; t += 0.5) {
      const s = sc.signal(t);
      assert.ok(Number.isFinite(s.speed) && Number.isFinite(s.jerk) && Number.isFinite(s.transition));
    }
  }
  assert.ok(ids.has('presence') && ids.has('motion') && ids.has('tier') && ids.has('wait'),
    '四层各自至少要有一个单独逼出它的场景');
});
