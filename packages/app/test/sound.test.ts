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
import { statSync } from 'node:fs';

import { SOUND, STAGE } from '../../core/src/tuning.ts';
import { mulberry32 } from '../../core/src/rng.ts';
import { voiceOf } from '../src/sound/voice.ts';
import { makeNoiseBuffer } from '../src/sound/noise.ts';
import { SCENARIOS } from '../src/sound/render.ts';
import { CUE_IDS, CUE_LABELS, CUE_SHEET } from '../src/sound/cues.ts';
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

// ── 第五层 · 离散接触音 ─────────────────────────────────────────────────────
//
// 播放与图都在浏览器里（node 没有 Web Audio），所以这里只守住能在 node 里守住的：
// 名单、素材是否真的在仓库里、以及几条"各自看都对、合起来才是错的"设计约定。
// 听感那一半走 `/dev/sound.html` 和 `scratch/evidence/sound-cues.png`。

test('离散音：四记的名单与它们的增益一一对上，一个都不多一个都不少', () => {
  assert.deepEqual([...CUE_IDS], ['enter', 'pass', 'commit', 'idle']);
  for (const id of CUE_IDS) {
    assert.equal(typeof SOUND.cues[id], 'number', `SOUND.cues.${id} 不见了`);
    assert.ok(SOUND.cues[id] > 0 && SOUND.cues[id] <= 1, `${id} 的增益 ${SOUND.cues[id]} 不在 (0,1]`);
    assert.ok(CUE_LABELS[id].length > 4, `${id} 没写清楚它是哪个动作`);
  }
});

test('离散音：素材真的在仓库里，而且短、而且不是 wav', () => {
  for (const id of CUE_IDS) {
    const file = new URL(`../../../assets/sound/${id}.webm`, import.meta.url);
    // 这一条守的是"代码提到了一个不存在的文件"——它在浏览器里只表现为
    // 一记安静的 404（P3 的静默跳过），没有人会发现
    const size = statSync(file).size;
    assert.ok(size > 400 && size < 24_000, `${id}.webm 大小 ${size}B 不像一记接触音`);
  }
});

test('离散音：S5 升档与 S6 到货没有被"顺手补全"回来', () => {
  // 这看起来是废话，但它守的是一个**会被人好心填上的空缺**：
  // 下一个人看到 event 层有 tier / graft，很容易觉得这里漏了两记。
  // 不加的理由写在 SOUND.cues 的注释里，这两条断言是那段理由的锁。
  assert.ok(!('tier' in SOUND.cues), '升档不该有离散音：同一件事会响两次，且必然错开 600ms 包络');
  assert.ok(!('graft' in SOUND.cues), '到货不该有离散音：event.graftGain 已经是那一声');
});

test('离散音：自动选择比手动确认更轻、也更闷 —— 观众要听得出这一下不是自己碰的', () => {
  assert.ok(SOUND.cues.idle < SOUND.cues.commit,
    `idle ${SOUND.cues.idle} 不比 commit ${SOUND.cues.commit} 轻`);
  // 只调小音量做不到"更远"：小声的近处声音仍然是近处声音，所以必须另有一道低通
  assert.ok(SOUND.cues.idleTilt > 200 && SOUND.cues.idleTilt < 6000,
    `idleTilt ${SOUND.cues.idleTilt}Hz 要么等于没滤，要么把这一记滤没了`);
});

test('离散音：经过那一记比确认轻得多 —— 它是导航的触觉反馈，不是提示音', () => {
  assert.ok(SOUND.cues.pass * 2 < SOUND.cues.commit,
    `pass ${SOUND.cues.pass} 相对 commit ${SOUND.cues.commit} 太响，会读成"选中了"`);
  // 连打衰减要真的衰减，又不能一记就没：0.74³ ≈ 0.41，第四记仍然听得见
  assert.ok(SOUND.cues.passRepeatDecay > 0.5 && SOUND.cues.passRepeatDecay < 1);
  assert.ok(SOUND.cues.passMinGapMs >= 30 && SOUND.cues.passMinGapMs <= 120,
    `passMinGapMs ${SOUND.cues.passMinGapMs} 要么防不住糊，要么把正常滑动也吃掉`);
});

test('离散音：取证时间线每一记都在名单上、按时间排好、且盖满四记', () => {
  let prev = -Infinity;
  for (const c of CUE_SHEET) {
    assert.ok((CUE_IDS as readonly string[]).includes(c.id), `取证里出现了名单外的 ${c.id}`);
    assert.ok(c.at > prev, '取证时间线没按时间排好，图上读出来的顺序会是错的');
    prev = c.at;
  }
  for (const id of CUE_IDS) {
    assert.ok(CUE_SHEET.some((c) => c.id === id), `${id} 没进取证图 —— 那它就没有证据`);
  }
  // 连打那一段必须真的连着，否则图上证明不了 passRepeatDecay
  const pass = CUE_SHEET.filter((c) => c.id === 'pass');
  assert.ok(pass.length >= 3, '取证里至少要三记连着的 pass，才看得出逐次变轻');
  assert.ok((pass[pass.length - 1].at - pass[0].at) * 1000 < SOUND.cues.passResetMs,
    '取证里那几记 pass 间隔超过了 passResetMs，连打计数会被清零 —— 图上就看不出渐远');
});
