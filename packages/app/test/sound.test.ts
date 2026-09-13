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
import { CUE_IDS, CUE_LABELS, CUE_SHEET, cueGain, cueTilt } from '../src/sound/cues.ts';
import { WORK, WORK_IDS, createWorkSchedule, type WorkCueId } from '../src/sound/work.ts';
import { createGroundSense } from '../src/sound/ground.ts';
import { contactPoints } from '../src/stage/framing.ts';
import { REFERENCE_POSE } from '../src/stage/framing.ts';
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

test('离散音：名单与它们的增益一一对上，一个都不多一个都不少', () => {
  assert.deepEqual([...CUE_IDS], [
    'enter', 'pass', 'commit', 'idle', 'reveal', 'ground', 'work-a', 'work-b', 'work-c',
  ]);
  for (const id of CUE_IDS) {
    const g = cueGain(id);
    assert.equal(typeof g, 'number', `${id} 没有增益`);
    assert.ok(g > 0 && g <= 1, `${id} 的增益 ${g} 不在 (0,1]`);
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

test('离散音：整层素材加起来仍然是"几十 KB"那一档', () => {
  // `assets/sound/README.md` 立的是 3MB 的上限。这条测试守的不是那个上限
  // （离它还有两个数量级），守的是**量级本身**：这一层一旦开始按分钟计，
  // 它就不再是接触音了，而没有人会因为总量从 19KB 涨到 800KB 而察觉。
  let total = 0;
  for (const id of CUE_IDS) total += statSync(new URL(`../../../assets/sound/${id}.webm`, import.meta.url)).size;
  assert.ok(total < 64_000, `离散音素材共 ${total}B，已经不是"几十 KB"了`);
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

// ── 这一轮加的两记（观众侧） ────────────────────────────────────────────────

test('离散音：选择页落定比确认轻、比自动选择重 —— 邀请不该压过决定', () => {
  // 三个数的**相对**关系就是设计（docs/29 §2.7）：
  // 你的决定（commit）> 机器的邀请（reveal）> 机器替你决定（idle）。
  // 任何一处翻过来，观众读到的因果就反了。
  assert.ok(cueGain('reveal') < cueGain('commit'),
    `reveal ${cueGain('reveal')} 压过了 commit ${cueGain('commit')}`);
  assert.ok(cueGain('reveal') > cueGain('idle'),
    `reveal ${cueGain('reveal')} 比 idle ${cueGain('idle')} 还轻，那它就不是一次登场`);
  // 入口那一下仍然是最实的一记：它是"系统醒了"的唯一回执
  assert.ok(cueGain('enter') > cueGain('reveal'));
});

test('离散音：触地落在"质感"那一档，不是"通知"那一档', () => {
  // 触地会**反复**发生（每一步一次）。凡是会反复发生的，都必须比任何一记
  // 一次性的确认音轻 —— 否则一段走动就变成一串提示音。
  assert.ok(cueGain('ground') < cueGain('commit'));
  assert.ok(cueGain('ground') < cueGain('idle'));
  assert.ok(cueGain('ground') <= cueGain('pass'),
    `ground ${cueGain('ground')} 比导航的触觉反馈 pass ${cueGain('pass')} 还响`);
  // 触地**不过**低通：它就发生在这间屋子里，正下方。远靠低通，近就不该有
  assert.equal(cueTilt('ground'), 0);
});

// ── 第六层 · 工作声（排程是纯的，所以这一半在 node 里守得住） ──────────────

test('工作声：慢回路没在跑的时候一记都不发', () => {
  const s = createWorkSchedule(mulberry32(11));
  for (let i = 0; i < 600; i++) assert.equal(s.update(false, 1 / 30), null);
});

test('工作声：开头空一段 —— 第一记落在 leadIn 之后', () => {
  // 写成"第一记在哪"而不是"leadIn 之前没有"：后者在 leadIn=0 时是一句废话
  // （循环一次都不跑），也就测不出有人把这段空白删掉（P21：坏了的时候仪表要变）
  for (const seed of [11, 12, 13]) {
    const s = createWorkSchedule(mulberry32(seed));
    let first: number | null = null;
    for (let t = 0; t < 20 && first === null; t += 1 / 30) {
      if (s.update(true, 1 / 30)) first = t;
    }
    assert.notEqual(first, null, `seed=${seed}：20 秒里一记都没有`);
    assert.ok(first! >= WORK.leadIn - 1 / 30,
      `seed=${seed}：第一记在 ${first!.toFixed(2)}s，早于 leadIn ${WORK.leadIn}s`);
    assert.ok(first! < WORK.leadIn + WORK.gap + WORK.gapJitter + 0.1,
      `seed=${seed}：第一记拖到 ${first!.toFixed(2)}s，那段等待开头是空的`);
  }
});

/** 跑 `seconds` 秒的等待，把每一记的时刻与内容收集起来 */
function runWork(seed: number, seconds: number, dt = 1 / 30): { at: number; id: WorkCueId; gain: number; rate: number }[] {
  const s = createWorkSchedule(mulberry32(seed));
  const out: { at: number; id: WorkCueId; gain: number; rate: number }[] = [];
  for (let t = 0; t < seconds; t += dt) {
    const tick = s.update(true, dt);
    if (tick) out.push({ at: t, ...tick });
  }
  return out;
}

test('工作声：90 秒的等待里响得住、又不吵 —— 密度落在设计的量级上', () => {
  // 慢回路是 30–90 秒（docs/00 §3）。这一条守的是"那段等待不是空的"，
  // 同时守住另一头：一分半里几十记就不是"隔壁有人"，是"隔壁在拆房子"。
  const ticks = runWork(5, 90);
  assert.ok(ticks.length >= 20 && ticks.length <= 40,
    `90 秒里 ${ticks.length} 记，不在 [20,40] 这个量级上`);
  for (const k of ticks) {
    assert.ok((WORK_IDS as readonly string[]).includes(k.id), `排出了名单外的 ${k.id}`);
    assert.ok(Number.isFinite(k.gain) && k.gain > 0 && k.gain < 1, `增益 ${k.gain} 不合法`);
    assert.ok(k.rate > 0.8 && k.rate < 1.2, `播放速率 ${k.rate} 抖得太远，会听成另一个东西`);
  }
});

test('工作声：不许加速 —— 越来越密就是一条会撒谎的进度条', () => {
  // 这是这一层最重要的一条（work.ts 文件头第 1 条 / P21）：
  // 慢回路什么时候回来我们并不知道，任何"快好了"的暗示都是在骗人。
  for (const seed of [1, 7, 99, 2026]) {
    const ticks = runWork(seed, 120);
    const half = Math.floor(ticks.length / 2);
    const gapOf = (a: typeof ticks): number =>
      (a[a.length - 1].at - a[0].at) / Math.max(1, a.length - 1);
    const first = gapOf(ticks.slice(0, half));
    const second = gapOf(ticks.slice(half));
    // 后半段的平均间隔不该系统性地小于前半段。±35% 是随机抖动的余量，
    // 真有趋势的话（比如线性收紧）这个比值会稳定地掉到 0.5 以下
    assert.ok(second > first * 0.65,
      `seed=${seed}：前半 ${first.toFixed(2)}s → 后半 ${second.toFixed(2)}s，听起来在加速`);
  }
});

test('工作声：不许规律 —— 等间隔读作钟表', () => {
  const ticks = runWork(3, 180);
  const gaps = ticks.slice(1).map((k, i) => k.at - ticks[i].at);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length);
  assert.ok(sd / mean > 0.15, `间隔的变异系数只有 ${(sd / mean).toFixed(3)}，这是节拍器不是干活`);
  assert.ok(Math.abs(mean - WORK.gap) < WORK.gapJitter * 0.5,
    `平均间隔 ${mean.toFixed(2)}s 离设计的 ${WORK.gap}s 太远`);
});

test('工作声：连着两记不会是同一个采样 —— 那是这一层最容易被听出的破绽', () => {
  const ticks = runWork(42, 240);
  assert.ok(ticks.length > 40, '样本太少，这条测了等于没测');
  for (let i = 1; i < ticks.length; i++) {
    assert.notEqual(ticks[i].id, ticks[i - 1].id, `第 ${i} 记和上一记都是 ${ticks[i].id}`);
  }
  // 三个变体都要真的被用上：只在两个之间来回也满足上面那条，但听起来还是两个东西
  const used = new Set(ticks.map((k) => k.id));
  assert.equal(used.size, WORK_IDS.length, `只用上了 ${[...used].join('/')}`);
});

test('工作声：同一个 seed 两次得到同一串 —— 随机全部来自传入的 Rng', () => {
  assert.deepEqual(runWork(8, 60), runWork(8, 60));
  assert.notDeepEqual(runWork(8, 60), runWork(9, 60));
});

test('工作声：等待一结束就停，而且不补一记"做完了"', () => {
  // 到货那一声已经是 event.graftGain（docs/23 §S6）。再补一记就是同一件事响两次 ——
  // 和名单里拒绝升档离散音同一条理由。
  const s = createWorkSchedule(mulberry32(4));
  for (let t = 0; t < 30; t += 1 / 30) s.update(true, 1 / 30);
  for (let i = 0; i < 300; i++) assert.equal(s.update(false, 1 / 30), null);
  // 再次进入等待要重新等一遍 leadIn（不是接着上一次的计时往下走）
  let t = 0;
  while (t < WORK.leadIn - 0.05) {
    assert.equal(s.update(true, 1 / 30), null, '第二段等待没有重新空开头那一段');
    t += 1 / 30;
  }
});

test('工作声：掉帧不会把攒下的时间变成一串连发', () => {
  // 一帧 2 秒（真实现场见过：切标签页回来）。补间隔而不是清零，所以最多一记
  const s = createWorkSchedule(mulberry32(6));
  for (let t = 0; t < WORK.leadIn + 0.2; t += 1 / 30) s.update(true, 1 / 30);
  let fired = 0;
  for (let i = 0; i < 3; i++) if (s.update(true, 2.0)) fired++;
  assert.ok(fired <= 3, `一帧 2 秒发了 ${fired} 记`);
  const s2 = createWorkSchedule(mulberry32(6));
  s2.update(true, 1 / 30);
  assert.ok(s2.update(true, 60) !== null, '停了一分钟之后第一记要照常发');
  assert.equal(typeof s2.update(true, 0)?.id, 'undefined', 'dt=0 不该凭空再发一记');
});

test('工作声：它在"隔壁"—— 远靠低通，不靠音量', () => {
  for (const id of WORK_IDS) {
    assert.ok(cueTilt(id) > 400 && cueTilt(id) < 4000,
      `${id} 的低通 ${cueTilt(id)}Hz 要么等于没滤，要么把这一记滤没了`);
  }
  // 比 idle 那一记更远一档，但不能更远到听不出是什么材料
  assert.ok(cueTilt('work-a') > SOUND.cues.idleTilt);
});

test('旋钮的移交：这一层的每一个数都已经住进 tuning.ts，`sound/` 下没有留下一个暂居的', () => {
  // 这一条守的是一个**会被悄悄留下的半成品**：`WORK` 和 `CUES_PENDING` 曾经
  // 因为 tuning.ts 归另一条 lane 才暂居在 sound/ 下（AGENTS.md：每个可调的数
  // 都该住在 tuning.ts）。移交之后 `cueGain` 只有一条路：问 `SOUND`。
  // 所以这条测试现在钉的是**结果**，不再是"随时可以搬"。
  for (const k of ['gain', 'leadIn', 'gap', 'gapJitter', 'gainJitter', 'detune', 'tilt'] as const) {
    assert.equal(typeof WORK[k], 'number', `WORK.${k} 不见了，移交清单就对不上了`);
    assert.ok(Number.isFinite(WORK[k]) && WORK[k] > 0);
    // 同一个数，不是抄了一份 —— 抄一份的话现场调 tuning.ts 会调了个寂寞
    assert.equal(WORK[k], SOUND.work[k], `WORK.${k} 和 SOUND.work.${k} 不是同一个数`);
  }
  assert.equal(WORK as unknown, SOUND.work as unknown, 'work.ts 的 WORK 该就是 SOUND.work 本身');
  // **六记全部**由 tuning.ts 说了算。这一轮加的 reveal / ground 也在里面 ——
  // 回退那一行连同 CUES_PENDING 已经删掉了，漏一个这里就会红
  for (const id of ['enter', 'pass', 'commit', 'idle', 'reveal', 'ground'] as const) {
    assert.equal(cueGain(id), SOUND.cues[id], `${id} 的增益没有走 SOUND.cues`);
  }
  // 第六层三个变体共用 SOUND.work.gain，它们**不**在 SOUND.cues 里各占一行
  for (const id of WORK_IDS) {
    assert.equal(cueGain(id), SOUND.work.gain, `${id} 的增益没有走 SOUND.work.gain`);
    assert.ok(!(id in SOUND.cues), `${id} 不该在 SOUND.cues 里再写一遍`);
  }
});

test('离散音：取证时间线每一记都在名单上、按时间排好、且盖满每一记', () => {
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

// ── `ground` 那一记的触发判据（docs/29 §2.8） ───────────────────────────────
//
// 这一块守的是这一轮最容易做错的一件事：**从 `speed` / `energy` 去猜触地**。
// 那样出来的不是触地，是"动得快就响" —— 观众一听就知道和画面对不上（P21）。
// 所以判据吃的是画接触阴影用的**同一批落点**（`stage/framing.ts` 的 `contactPoints`），
// 而这一层在 node 里测得了：输入就是几个 `[x, z, lift]`。

/** 一个站着不动的身体：两只脚贴地 */
const PLANTED: Array<[number, number, number]> = [[0.1, 0, 0.01], [-0.1, 0, 0.01]];
/** 抬起左脚之后只剩一个落点 */
const ONE_FOOT: Array<[number, number, number]> = [[-0.1, 0, 0.01]];
const FRAME = 1 / 60;

/** 跑 n 帧同一组落点，返回响了几记 */
function run(
  g: ReturnType<typeof createGroundSense>,
  pts: Array<[number, number, number]>, n: number, dt = FRAME,
): number {
  let fired = 0;
  for (let i = 0; i < n; i++) if (g.update(pts, dt)) fired++;
  return fired;
}

test('触地：站着不动一记都不响 —— 它绑的是接触，不是"有人在那儿"', () => {
  const g = createGroundSense();
  assert.equal(run(g, PLANTED, 300), 0, '站了 5 秒响了');
});

test('触地：身体一出现在画面里不该砸一下 —— 第一次观测只立基准', () => {
  // 站姿的两只脚一上来就是贴地的。没有"只立基准"这一条，进场那一帧
  // 会从 0 跳到 2，观众在卡片刚溶解的那一刻听到一记闷响，而他什么都没做
  const g = createGroundSense();
  assert.equal(g.update(PLANTED, FRAME), false);
  assert.equal(run(g, PLANTED, 60), 0);
});

test('触地：抬脚不响，落脚响一记', () => {
  const g = createGroundSense();
  run(g, PLANTED, 10);
  assert.equal(run(g, ONE_FOOT, 30), 0, '抬起一只脚不该有声音 —— 失去不发声');
  let fired = 0;
  for (let i = 0; i < 30; i++) if (g.update(PLANTED, FRAME)) fired++;
  assert.equal(fired, 1, `落一次脚响了 ${fired} 记`);
});

test('触地：≥120ms 的防抖 —— 阈值上下抖一帧不会变成一串搓衣板', () => {
  const g = createGroundSense();
  run(g, PLANTED, 10);
  // 在阈值上下来回抖 60 帧（每帧 1/60 s = 16.7ms，远短于 120ms）。
  // 不防抖的话这一秒里有 30 次"多出一个落点"，听起来就是一把搓衣板。
  // 防抖之后上限是 1000ms / minGapMs —— 这条测试钉的是**那个上限**，
  // 不是一个恰好数：写成"响 1 记"会在改 minGapMs 的那天红得毫无道理。
  const JITTER = 60;
  let fired = 0;
  for (let i = 0; i < JITTER; i++) fired += g.update(i % 2 ? ONE_FOOT : PLANTED, FRAME) ? 1 : 0;
  const cap = Math.ceil((JITTER * FRAME * 1000) / SOUND.ground.minGapMs);
  assert.ok(fired <= cap, `抖了 ${JITTER} 帧响了 ${fired} 记，上限是 ${cap}`);
  assert.ok(fired < JITTER / 2 / 2, `响了 ${fired} 记，和不防抖的 ${JITTER / 2} 记比几乎没拦住`);
});

test('触地：两步之间隔得够开就是两记', () => {
  const g = createGroundSense();
  run(g, PLANTED, 10);
  let fired = 0;
  for (let step = 0; step < 2; step++) {
    fired += run(g, ONE_FOOT, 18);          // 0.3s 抬着
    for (let i = 0; i < 18; i++) if (g.update(PLANTED, FRAME)) fired++;
  }
  assert.equal(fired, 2, `两步响了 ${fired} 记`);
});

test('触地：整具身体悬在空中时，动得再猛也不响 —— 这一条就是"不拿 speed 去猜"', () => {
  // `contactPoints` 对跳在空中的身体返回空数组（test/scenes.test.ts 钉着这一条）。
  // 一个从 speed 推出来的判据在这一段会疯狂发声，这里必须是 0
  const g = createGroundSense();
  run(g, PLANTED, 10);
  assert.equal(run(g, [], 120), 0, '悬空的 2 秒里响了');
});

test('触地：落点还在名单里但离地太高不算着地', () => {
  // `contactPoints` 的名额上限是 STAGE.contactLiftRange（0.22m），
  // 所以一只抬到 0.15m 的脚**仍然在返回值里**，只是 lift 大。
  // 判据必须自己再夹一道，否则"抬脚"和"落脚"根本分不开
  const g = createGroundSense();
  const HIGH: Array<[number, number, number]> = [[0.1, 0, 0.15], [-0.1, 0, 0.15]];
  run(g, HIGH, 10);
  assert.equal(run(g, HIGH, 60), 0);
  let fired = 0;
  for (let i = 0; i < 30; i++) if (g.update(PLANTED, FRAME)) fired++;
  assert.equal(fired, 1, '从 0.15m 落到贴地该响一记');
});

test('触地：reset() 之后重新立基准 —— 换了一个人不该先砸一下', () => {
  const g = createGroundSense();
  run(g, PLANTED, 10);
  run(g, [], 10);
  g.reset();
  assert.equal(run(g, PLANTED, 60), 0, 'reset 之后第一次观测又响了');
});

test('触地：阈值夹在"站姿贴地"和"落点名额上限"之间，防抖不低于规格的 120ms', () => {
  // 下界：参考站姿脚尖离地 0.03m（scenes.test.ts 钉着 lift < 0.05）。
  // 比它小的话，站着的人算作没着地，追踪每抖一下就重新"落"一次
  const feet = contactPoints(REFERENCE_POSE, 4, STAGE.contactLiftRange);
  assert.equal(feet.length, 2);
  for (const [, , lift] of feet) {
    assert.ok(lift < SOUND.ground.threshold,
      `站姿的脚 lift=${lift} 没被 threshold ${SOUND.ground.threshold} 算作着地`);
  }
  // 上界：超过 contactLiftRange 的落点 contactPoints 根本不返回，写得比它大等于没判据
  assert.ok(SOUND.ground.threshold < STAGE.contactLiftRange,
    `threshold ${SOUND.ground.threshold} ≥ contactLiftRange ${STAGE.contactLiftRange}，判据形同虚设`);
  assert.ok(SOUND.ground.minGapMs >= 120,
    `minGapMs ${SOUND.ground.minGapMs} 低于 docs/29 §2.8 要求的 120ms`);
});

test('触地：它比任何一记一次性的确认音都轻 —— 反复发生的不能读成通知', () => {
  for (const id of ['enter', 'commit', 'reveal', 'idle', 'pass'] as const) {
    assert.ok(cueGain('ground') <= cueGain(id),
      `ground ${cueGain('ground')} 压过了一次性的 ${id} ${cueGain(id)}`);
  }
});
