/**
 * 精度基准台（dev 工具，不进现场）。
 *
 * **没有度量就没有"准不准"。** 这一页把"感觉不够准"换成三组可以抄下来的数字，
 * 并且把**测不到的东西**同样显式列出来 —— 不编（docs/02 P17）。
 *
 * 三路并排跑同一份输入：
 *   A 原始   `mediapipeToWorld` → `buildSkeleton`
 *   B 现有   A + `createStabilizer()`     ← 这就是 `main.ts` 今天跑的东西
 *   C 新     `createRefiner()`（分组 One-Euro + 遮挡补全 + 质量兜底）→ B → `clampFold`
 *
 * 量三件事，每件都在**世界系、毫米**下报，因为毫米能和身体尺寸对照着读：
 *   - **抖动**：每个关节每个轴最近 1 秒的标准差。静止的人身上它应该趋近 0。
 *   - **骨长变异**：每根骨头长度的 变异系数 σ/μ（%）。docs/04 §3 说未稳定化时约 ±15%。
 *   - **跟随偏差**：相对 A 的 RMS 位移（mm）。滤波必然带来滞后，这一列就是代价，
 *     必须和抖动一起读 —— 只看抖动，把所有东西冻死也能拿满分。
 *
 * 录制/回放：录一段 `RawPose` 进内存，之后可以**离线把三路重跑任意多次**，
 * 数字完全可复现。真人不在场时这是唯一能反复评估的方式。
 */
import { captureKindFromUrl, createCapture, type Capture } from '../src/capture/capture.ts';
import { fetchClipIndex, preferredClip, resolveClipUrl } from '../src/capture/replay.ts';
import { LM, buildSkeleton, landmarkConfidence, mediapipeToWorld } from '../../core/src/skeleton.ts';
import { createStabilizer, type Stabilizer } from '../../core/src/stabilize.ts';
import { clampFold, createRefiner, type Refiner } from '../../core/src/refine.ts';
import { CAPTURE } from '../../core/src/tuning.ts';
import type { RawPose, Skeleton } from '../../core/src/types.ts';

const REC_SECONDS = 10;
const WINDOW_MS = 1000;

/** 盯住的关节。够覆盖躯干/肢体/末端三组，又不至于一屏塞不下 */
const JOINTS = [
  'pelvis', 'chest', 'headCenter',
  'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'wristL', 'wristR',
  'hipL', 'hipR', 'kneeL', 'kneeR', 'ankleL', 'ankleR',
] as const;

/**
 * 关节 → 它的 visibility 来自哪几个 landmark（派生关节取最小值，同 docs/04 §2）。
 * 直接读原始 landmark，不从骨头反推 —— 反推会把两端的较小值算两次。
 */
const JOINT_LM: Readonly<Record<string, readonly number[]>> = {
  pelvis: [LM.L_HIP, LM.R_HIP], chest: [LM.L_SHOULDER, LM.R_SHOULDER],
  headCenter: [LM.L_EAR, LM.R_EAR],
  shoulderL: [LM.L_SHOULDER], shoulderR: [LM.R_SHOULDER],
  elbowL: [LM.L_ELBOW], elbowR: [LM.R_ELBOW],
  wristL: [LM.L_WRIST], wristR: [LM.R_WRIST],
  hipL: [LM.L_HIP], hipR: [LM.R_HIP],
  kneeL: [LM.L_KNEE], kneeR: [LM.R_KNEE],
  ankleL: [LM.L_ANKLE], ankleR: [LM.R_ANKLE],
};

const $ = (id: string): HTMLElement => document.getElementById(id)!;
const video = $('cam') as HTMLVideoElement;

// ── 统计原语 ────────────────────────────────────────────────────────────────

/** 滑动窗口的标准差。窗口按**墙钟**算，掉帧时窗口仍然是 1 秒 */
class Win {
  #v: number[] = []; #t: number[] = [];
  push(v: number, now: number): void {
    if (!Number.isFinite(v)) return;
    this.#v.push(v); this.#t.push(now);
    while (this.#t.length && now - this.#t[0] > WINDOW_MS) { this.#t.shift(); this.#v.shift(); }
  }
  get n(): number { return this.#v.length; }
  get mean(): number { return this.#v.length ? this.#v.reduce((a, b) => a + b, 0) / this.#v.length : 0; }
  get std(): number {
    const n = this.#v.length;
    if (n < 2) return 0;
    const m = this.mean;
    return Math.sqrt(this.#v.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1));
  }
  reset(): void { this.#v = []; this.#t = []; }
}

/** 不带时间窗的累计（离线重跑用：整段一个数） */
class Acc {
  n = 0; #s = 0; #s2 = 0;
  push(v: number): void { if (Number.isFinite(v)) { this.n++; this.#s += v; this.#s2 += v * v; } }
  get mean(): number { return this.n ? this.#s / this.n : 0; }
  get rms(): number { return this.n ? Math.sqrt(this.#s2 / this.n) : 0; }
  get std(): number {
    if (this.n < 2) return 0;
    const m = this.mean;
    return Math.sqrt(Math.max(0, this.#s2 / this.n - m * m) * (this.n / (this.n - 1)));
  }
}

// ── 一路流水线 ──────────────────────────────────────────────────────────────

type Lane = 'A' | 'B' | 'C';
const LANE_NAME: Record<Lane, string> = { A: 'A 原始', B: 'B 现有', C: 'C 新' };

interface Pipe {
  lane: Lane;
  step(raw: RawPose, dt: number): Skeleton;
  reset(): void;
  /** C 路专用：遮挡补全/兜底的当前状态 */
  note(): string;
}

function makePipe(lane: Lane): Pipe {
  let stab: Stabilizer | null = lane === 'A' ? null : createStabilizer();
  let ref: Refiner | null = lane === 'C' ? createRefiner() : null;
  let folded = 0;
  return {
    lane,
    step(raw, dt) {
      const src = ref ? ref.apply(raw, dt) : raw;
      let sk = buildSkeleton(mediapipeToWorld(src), src.world, src.t);
      if (stab) sk = stab.apply(sk, dt);
      if (lane === 'C') folded = clampFold(sk);
      return sk;
    },
    reset() {
      stab = lane === 'A' ? null : createStabilizer();
      ref = lane === 'C' ? createRefiner() : null;
      folded = 0;
    },
    note() {
      if (!ref) return '';
      const s = ref.stats;
      return `保持 ${s.held} · 放手 ${s.dropped} · 折叠修正 ${folded} · 兜底 ×${s.cutoffScale.toFixed(2)}`;
    },
  };
}

/** 一路的实时窗口统计 */
interface LaneStats {
  joint: Record<string, { x: Win; y: Win; z: Win }>;
  bone: Record<string, Win>;
  follow: Record<string, Win>;   // 相对 A 的位移（mm）
}

function makeStats(): LaneStats {
  const joint: LaneStats['joint'] = {};
  for (const j of JOINTS) joint[j] = { x: new Win(), y: new Win(), z: new Win() };
  return { joint, bone: {}, follow: {} };
}

function sample(st: LaneStats, sk: Skeleton, ref: Skeleton | null, now: number): void {
  for (const j of JOINTS) {
    const p = sk.joints?.[j];
    if (!p) continue;
    st.joint[j].x.push(p[0] * 1000, now);
    st.joint[j].y.push(p[1] * 1000, now);
    st.joint[j].z.push(p[2] * 1000, now);
    const r = ref?.joints?.[j];
    if (r) {
      (st.follow[j] ??= new Win()).push(
        Math.hypot(p[0] - r[0], p[1] - r[1], p[2] - r[2]) * 1000, now);
    }
  }
  for (const b of sk.bones ?? []) (st.bone[b.id] ??= new Win()).push(b.length * 1000, now);
}

/** 一路的一行汇总：平均抖动 / 最差骨长变异 / 跟随偏差 */
function summarize(st: LaneStats): { jitter: number; jz: number; boneCv: number; worstBone: string; follow: number } {
  let js = 0, jn = 0, jz = 0, jzn = 0;
  for (const j of JOINTS) {
    const s = st.joint[j];
    if (s.x.n < 2) continue;
    js += (s.x.std + s.y.std + s.z.std) / 3; jn++;
    jz += s.z.std; jzn++;
  }
  let worst = 0, worstBone = '—';
  for (const id in st.bone) {
    const w = st.bone[id];
    if (w.n < 2 || w.mean <= 0) continue;
    const cv = (w.std / w.mean) * 100;
    if (cv > worst) { worst = cv; worstBone = id; }
  }
  let f = 0, fn = 0;
  for (const j in st.follow) { const w = st.follow[j]; if (w.n) { f += w.mean; fn++; } }
  return {
    jitter: jn ? js / jn : 0,
    jz: jzn ? jz / jzn : 0,
    boneCv: worst,
    worstBone,
    follow: fn ? f / fn : 0,
  };
}

// ── 运行时 ──────────────────────────────────────────────────────────────────

const kind = captureKindFromUrl();
const pipes: Record<Lane, Pipe> = { A: makePipe('A'), B: makePipe('B'), C: makePipe('C') };
const stats: Record<Lane, LaneStats> = { A: makeStats(), B: makeStats(), C: makeStats() };
let cap: Capture | null = null;
/** 画表用的最近一帧：B 路骨架 + 它对应的原始 pose */
let lastB: Skeleton | null = null;
let lastRaw: RawPose | null = null;
let lastT = 0;
let frames = 0;
let seenPose = 0;

/** 录制缓冲：存的是**原始 RawPose**，所以三路可以离线重跑任意多次 */
let recording = false;
let recEnd = 0;
let buffer: Array<{ raw: RawPose; dt: number }> = [];
/** 离线缓冲是从哪来的：null = 现场录的，否则是片段 URL */
let loaded: string | null = null;

addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') {
    for (const l of ['A', 'B', 'C'] as Lane[]) { stats[l] = makeStats(); pipes[l].reset(); }
    frames = 0; seenPose = 0;
  }
});

$('rec').addEventListener('click', () => {
  buffer = [];
  loaded = null;
  recording = true;
  recEnd = performance.now() + REC_SECONDS * 1000;
  ($('run') as HTMLButtonElement).disabled = true;
  ($('dl') as HTMLButtonElement).disabled = true;
});

$('run').addEventListener('click', () => { $('offline').innerHTML = offline(); });

/**
 * 直接把一段片段灌进离线重跑，**不经过实时循环**。
 *
 * 为什么需要这条路：实时循环挂在 `requestAnimationFrame` 上，页面不可见时浏览器会把它
 * 掐到 1Hz（无头/后台窗口就是这种情况）。那时录出来的东西是每秒一帧的幻灯片，
 * 抖动统计全是 0 —— 看起来"非常稳"，其实是**没有数据**。
 * 离线路读的是片段自己的 fps，跟浏览器的心情无关，所以数字可复现。
 */
$('load').addEventListener('click', () => {
  void (async () => {
    $('recinfo').textContent = '读片段中…';
    try {
      const asked = new URLSearchParams(location.search).get('clip');
      const url = asked ? resolveClipUrl(asked) : (preferredClip(await fetchClipIndex())?.url ?? '/demo/pose-synthetic.json');
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const raw: unknown = await r.json();
      const frames = (Array.isArray(raw) ? raw : (raw as { frames?: unknown }).frames) as RawPose[] | undefined;
      const fps = (!Array.isArray(raw) && typeof (raw as { fps?: unknown }).fps === 'number'
        ? (raw as { fps: number }).fps : CAPTURE.targetHz) || CAPTURE.targetHz;
      if (!Array.isArray(frames) || !frames.length) throw new Error('片段里没有帧');
      loaded = url;
      buffer = frames.filter((f) => f?.world?.length).map((f) => ({ raw: f, dt: 1 / fps }));
      ($('run') as HTMLButtonElement).disabled = !buffer.length;
      ($('dl') as HTMLButtonElement).disabled = true;   // 片段本来就在盘上，不用再存一份
      $('recinfo').textContent = `已载入 ${url}：${buffer.length} 帧 @ ${fps}fps。`;
      $('offline').innerHTML = offline();
    } catch (e) {
      $('recinfo').innerHTML = `<span class="bad">读不到片段：${esc(String(e))}</span>`;
    }
  })();
});

$('dl').addEventListener('click', () => {
  // 录制回写接口（vite 的 /__demo）只收**真录制**，所以这里只给本地下载，
  // 由人去判断这段值不值得进 assets/demo/ —— 合成数据绝不该混进兜底片段。
  const clip = { fps: CAPTURE.targetHz, frames: buffer.map((b) => b.raw) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(clip)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = `accuracy-${Date.now()}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

void boot();

async function boot(): Promise<void> {
  const c = await createCapture(kind, { video });
  cap = c;
  await c.start();
  lastT = performance.now();
  frame();
}

function frame(): void {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min(0.25, Math.max(1e-3, (now - lastT) / 1000));
  lastT = now;

  const raw = cap?.latest() ?? null;
  frames++;
  if (raw) {
    seenPose++;
    const a = pipes.A.step(raw, dt);
    const b = pipes.B.step(raw, dt);
    const c = pipes.C.step(raw, dt);
    lastB = b; lastRaw = raw;
    sample(stats.A, a, null, now);
    sample(stats.B, b, a, now);
    sample(stats.C, c, a, now);
    if (recording) {
      buffer.push({ raw: structuredClone(raw), dt });
      if (now >= recEnd) stopRec();
    }
  } else if (recording && now >= recEnd) {
    stopRec();
  }
  paint(raw, now);
}

function stopRec(): void {
  recording = false;
  const ok = buffer.length > 0;
  ($('run') as HTMLButtonElement).disabled = !ok;
  ($('dl') as HTMLButtonElement).disabled = !ok;
}

// ── 离线重跑 ────────────────────────────────────────────────────────────────

/**
 * 对录下来的同一段输入，把三路各自从零跑一遍，整段累计出一组数。
 * 实时窗口的数字会随人当下在做什么漂移，这一组不会 —— **改进前后要对比的是这一组**。
 */
function offline(): string {
  if (!buffer.length) return '缓冲区是空的。';
  const rows: string[] = [];
  const cols: Record<Lane, { jitter: Acc; jz: Acc; cv: Acc; worst: number; worstId: string; follow: Acc }> = {
    A: blank(), B: blank(), C: blank(),
  };
  const refSk: Skeleton[] = [];

  for (const lane of ['A', 'B', 'C'] as Lane[]) {
    const pipe = makePipe(lane);
    const perJoint: Record<string, number[]> = {};
    const perBone: Record<string, number[]> = {};
    for (const j of JOINTS) perJoint[j] = [];
    let i = 0;
    for (const f of buffer) {
      const sk = pipe.step(f.raw, f.dt);
      if (lane === 'A') refSk.push(sk);
      for (const j of JOINTS) {
        const p = sk.joints?.[j];
        if (!p) continue;
        // 逐帧位移（一阶差分）的 RMS = "每帧动了多少"。静止段里它就是抖动本身，
        // 而且不受"人走到哪里"影响 —— 全片累计必须用它，不能用位置的标准差。
        const prev = perJoint[j];
        if (prev.length >= 3) {
          const d = Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]) * 1000;
          cols[lane].jitter.push(d);
          cols[lane].jz.push(Math.abs(p[2] - prev[2]) * 1000);
        }
        perJoint[j] = [p[0], p[1], p[2]];
        const r = refSk[i]?.joints?.[j];
        if (r && lane !== 'A') {
          cols[lane].follow.push(Math.hypot(p[0] - r[0], p[1] - r[1], p[2] - r[2]) * 1000);
        }
      }
      for (const b of sk.bones ?? []) (perBone[b.id] ??= []).push(b.length * 1000);
      i++;
    }
    for (const id in perBone) {
      const arr = perBone[id];
      if (arr.length < 2) continue;
      const m = arr.reduce((x, y) => x + y, 0) / arr.length;
      if (m <= 0) continue;
      const sd = Math.sqrt(arr.reduce((x, y) => x + (y - m) ** 2, 0) / (arr.length - 1));
      const cv = (sd / m) * 100;
      cols[lane].cv.push(cv);
      if (cv > cols[lane].worst) { cols[lane].worst = cv; cols[lane].worstId = id; }
    }
  }

  const secs = buffer.reduce((a, b) => a + b.dt, 0);
  rows.push(`片段：${buffer.length} 帧 / ${secs.toFixed(1)}s ｜ 来源：${loaded ?? `现场录制（${sourceLabel()}）`}`);
  rows.push('');
  rows.push('                     逐帧位移 RMS   同·仅Z    骨长变异 σ/μ    最差骨头        跟随偏差');
  rows.push('                        (mm/帧)     (mm/帧)      (均值 %)                    (mm, 相对 A)');
  for (const lane of ['A', 'B', 'C'] as Lane[]) {
    const c = cols[lane];
    rows.push(
      `${LANE_NAME[lane].padEnd(10)}` +
      `${c.jitter.rms.toFixed(2).padStart(14)}` +
      `${c.jz.rms.toFixed(2).padStart(12)}` +
      `${c.cv.mean.toFixed(2).padStart(14)}` +
      `   ${(`${c.worstId} ${c.worst.toFixed(1)}%`).padEnd(18)}` +
      `${lane === 'A' ? '—' : c.follow.mean.toFixed(1)}`,
    );
  }
  rows.push('');
  rows.push('读法：逐帧位移 RMS 越小越稳；跟随偏差越大越迟钝。两个一起看 ——');
  rows.push('      只压前者不看后者，等于"把身体冻住"也能拿满分。');
  if (isSynthetic()) {
    rows.push('');
    rows.push('⚠ 这段来自合成占位数据。它量的是合成器，不是 MediaPipe。');
    rows.push('  滤波器之间的**相对**比较仍然成立（同一输入同一噪声），');
    rows.push('  但任何"MediaPipe 抖 X mm"的绝对结论都不成立。');
  }
  return rows.join('\n');
}

function blank() {
  return { jitter: new Acc(), jz: new Acc(), cv: new Acc(), worst: 0, worstId: '—', follow: new Acc() };
}

// ── 画面 ────────────────────────────────────────────────────────────────────

function paint(raw: RawPose | null, now: number): void {
  const c = cap;
  $('src').innerHTML =
    `<span class="hi">${kind === 'replay' ? '回放' : '摄像头'}</span>`
    + `  ${backendOf(c)}\n`
    + `推理 Hz   ${num(c?.fps ?? 0, (c?.fps ?? 0) >= CAPTURE.targetHz)}\n`
    + `置信度    ${num(raw?.score ?? 0, (raw?.score ?? 0) >= CAPTURE.minScore, 2)}`
    + `   ${raw ? '有人' : '<span class="warn">无人 / 未就绪</span>'}\n`
    + `有姿态帧  ${seenPose} / ${frames}\n`
    + `C 路      ${pipes.C.note()}\n`
    + (c?.lastError ? `<span class="bad">${esc(c.lastError)}</span>` : 'lastError  —');

  if (recording) {
    $('recinfo').innerHTML = `<span class="bad">● 录制中</span> ${buffer.length} 帧，剩 ${((recEnd - now) / 1000).toFixed(1)}s`;
  } else if (buffer.length && !loaded) {
    $('recinfo').textContent = `已录 ${buffer.length} 帧。「⟲ 三路重跑」可反复跑，结果完全可复现。`;
  }

  $('banner').innerHTML = seenPose === 0
    ? '<span class="bad">还没有任何一帧检出人体 —— 下面所有数字都是空的，不是"很稳"。</span>'
    : (isSynthetic() ? '⚠ 输入是合成占位数据：可用于比较滤波器，不可用于判断 MediaPipe 的绝对精度。' : '');

  $('agg').innerHTML = aggTable();
  $('joints').innerHTML = jointTable();
  $('bones').innerHTML = boneTable();
  $('unmeasurable').innerHTML = unmeasurable();
}

function aggTable(): string {
  const head = '<tr><th>路</th><th>平均抖动 σ (mm)</th><th>仅 Z 轴 σ (mm)</th>'
    + '<th>最差骨长变异</th><th>跟随偏差 (mm)</th></tr>';
  const rows = (['A', 'B', 'C'] as Lane[]).map((l) => {
    const s = summarize(stats[l]);
    return `<tr class="${l}"><td>${LANE_NAME[l]}</td>`
      + `<td>${s.jitter.toFixed(2)}</td><td>${s.jz.toFixed(2)}</td>`
      + `<td>${s.boneCv.toFixed(1)}% <span class="dim">${s.worstBone}</span></td>`
      + `<td>${l === 'A' ? '<span class="dim">—</span>' : s.follow.toFixed(1)}</td></tr>`;
  }).join('');
  return `<table>${head}${rows}</table>`;
}

function jointTable(): string {
  const head = '<tr><th>关节</th><th>vis</th><th>x</th><th>y</th><th>z</th>'
    + '<th>σx</th><th>σy</th><th>σz</th><th class="C">C σ(xyz)</th></tr>';
  const rows = JOINTS.map((j) => {
    const p = lastB?.joints?.[j];
    const s = stats.B.joint[j], sc = stats.C.joint[j];
    const conf = confOf(j);
    const cls = conf >= CAPTURE.minJointConfidence ? '' : ' class="warn"';
    const cAvg = (sc.x.std + sc.y.std + sc.z.std) / 3;
    const bAvg = (s.x.std + s.y.std + s.z.std) / 3;
    const better = cAvg < bAvg ? 'good' : 'warn';
    return `<tr><td${cls}>${j}</td><td>${conf.toFixed(2)}</td>`
      + `<td>${mm(p?.[0])}</td><td>${mm(p?.[1])}</td><td>${mm(p?.[2])}</td>`
      + `<td>${s.x.std.toFixed(1)}</td><td>${s.y.std.toFixed(1)}</td><td>${s.z.std.toFixed(1)}</td>`
      + `<td class="${better}">${cAvg.toFixed(1)}</td></tr>`;
  }).join('');
  return `<table>${head}${rows}</table>`
    + '<div class="dim">x/y/z 为 B 路世界坐标（mm，已镜像/翻转/落地）。σ = 最近 1 秒标准差。</div>';
}

function boneTable(): string {
  const ids = Object.keys(stats.B.bone);
  if (!ids.length) return '<pre class="dim">还没有数据。</pre>';
  const head = '<tr><th>骨头</th><th>长度 (mm)</th><th class="A">A σ/μ</th><th class="B">B σ/μ</th><th class="C">C σ/μ</th></tr>';
  const rows = ids.map((id) => {
    const cv = (l: Lane) => {
      const w = stats[l].bone[id];
      return w && w.n > 1 && w.mean > 0 ? (w.std / w.mean) * 100 : 0;
    };
    const a = cv('A'), b = cv('B'), c = cv('C');
    return `<tr><td>${id}</td><td>${stats.B.bone[id].mean.toFixed(0)}</td>`
      + `<td class="${a > 5 ? 'bad' : ''}">${a.toFixed(1)}%</td>`
      + `<td class="${b > 5 ? 'bad' : ''}">${b.toFixed(1)}%</td>`
      + `<td class="${c > 5 ? 'bad' : ''}">${c.toFixed(1)}%</td></tr>`;
  }).join('');
  return `<table>${head}${rows}</table>`
    + '<div class="dim">σ/μ = 变异系数。docs/04 §3：未稳定化时约 ±15%。</div>';
}

/**
 * **这一块是这一页存在的另一半理由。**
 * 上面那些数字容易让人以为"精度已经量过了"。没有。
 * 下面这些东西在没有真人站到镜头前之前，一个都测不出来 —— 写在这里，别让它们被默认成"已解决"。
 */
function unmeasurable(): string {
  const items: Array<[string, string]> = [
    ['关节位置误差 (MPJPE)', '没有真值。要么有动捕设备，要么有标注数据集 —— 我们两样都没有。'],
    ['U1 world landmark 轴向', '需要真人蹲下 / 抬手。docs/04 §1 的 Y/Z 两行至今是**假设**。'],
    ['U2 深度可用性', '需要真人前后走 1 米，比"量程"和"抖动"哪个大。'],
    ['U3 现场灯光下的丢帧率', '必须到现场、用现场的灯测。'],
    ['遮挡 / 侧身 / 背身表现', '需要真人转身、抬手挡脸。合成数据里没有遮挡。'],
    ['lite vs full vs heavy 的真实差异', '需要同一段**真人**输入跑两次；换档开关已经有了（?model=）。'],
    ['观感（"跟手"还是"迟钝"）', '数字量不出来。跟随偏差只是它的代理量。'],
  ];
  return '<h2>无法测量（需要真人 / 现场）</h2>'
    + items.map(([k, v]) => `<div><span class="hi">${k}</span><br><span class="dim">${v}</span></div>`).join('')
    + '<div class="dim" style="margin-top:6px">P17：不编。这些格子空着比填一个猜的数字有用。</div>';
}

// ── 小工具 ──────────────────────────────────────────────────────────────────

function confOf(joint: string): number {
  const w = lastRaw?.screen?.length ? lastRaw.screen : lastRaw?.world;
  if (!w) return 0;
  let lo = 1;
  for (const i of JOINT_LM[joint] ?? []) lo = Math.min(lo, landmarkConfidence(w[i]));
  return lo;
}

function isSynthetic(): boolean {
  const s = loaded ?? (cap as Partial<{ source: string }> | null)?.source ?? '';
  return s.includes('synthetic');
}
function sourceLabel(): string {
  return (cap as Partial<{ source: string; backend: string }> | null)?.source
    ?? (cap as Partial<{ backend: string }> | null)?.backend ?? kind;
}
function backendOf(c: Capture | null): string {
  const b = c as Partial<{ backend: string; source: string; model: string }> | null;
  const model = b?.model ? ` · 模型 ${b.model}` : '';
  return esc((b?.backend ?? b?.source ?? '') + model);
}
function mm(v: number | undefined): string {
  return v === undefined || !Number.isFinite(v) ? '<span class="dim">—</span>' : (v * 1000).toFixed(0);
}
function num(v: number, ok: boolean, digits = 0): string {
  return `<span class="${ok ? 'good' : 'bad'}">${v.toFixed(digits)}</span>`;
}
function esc(s: string): string {
  return s.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch] ?? ch));
}
