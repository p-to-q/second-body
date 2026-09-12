/**
 * Pose 录制页（dev 工具，不进现场）—— T-16 的前半张卡。
 *
 * 为什么必须有它：现场兜底是 `?demo=1` 回放，而在这之前回放的是
 * `assets/demo/pose-synthetic.json` —— **程序生成的假数据**，轴向来自尚未实测的假设。
 * 也就是说在录到真人之前，我们其实没有兜底。这个页面就是把它变成真的。
 *
 * 做的事：开摄像头 → 按 CAPTURE.targetHz 定速采样 `RawPose` → `{fps, frames}` →
 * 写回 `assets/demo/`（dev 中间件 `/__demo`）或直接下载。
 *
 * 三个刻意的决定：
 *  1. **定速采样，不是"有新姿态才记一帧"**：回放是按 fps 走墙钟的，
 *     录制端也必须是均匀时间轴，否则回放会莫名其妙忽快忽慢。
 *  2. **没人的那一帧要记成 `world: []`**，不是丢掉。
 *     走进画面 / 走出画面这两件事全靠它，ReplayCapture 看到空 world 就返回 null（＝没人）。
 *  3. **绝不写 `synthetic: true`**，也绝不在没有人的时候伪造数据。没录到就是没录到。
 */
import { WebcamCapture } from '../src/capture/webcam.ts';
import { CAPTURE } from '../../core/src/tuning.ts';
import type { Landmark, RawPose } from '../../core/src/types.ts';

/** 录制脚本：现场真会发生的六件事，按秒排。总长 60s（T-16 要求的时长） */
const BEATS: Array<{ at: number; what: string; how: string }> = [
  { at: 0, what: '走进画面', how: '从画面外走进来，走到站位线上' },
  { at: 8, what: '站定', how: '正对镜头站住，自然呼吸，别刻意不动' },
  { at: 18, what: '大幅挥手', how: '两只手都要举过头，幅度往大了做' },
  { at: 30, what: '蹲下起立', how: '蹲到底再起来，做两次' },
  { at: 40, what: '转身一圈', how: '原地慢慢转 360°，让背面也被看到' },
  { at: 50, what: '走出画面', how: '往侧面走出去，最后几秒画面里必须没有人' },
  { at: 60, what: '录完了', how: '点停止' },
];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const video = $<HTMLVideoElement>('cam');
const canvas = $<HTMLCanvasElement>('ov');
const ctx = canvas.getContext('2d')!;
const statEl = $('stat');
const errEl = $('err');
const beatEl = $('beat');
const beatsEl = $<HTMLOListElement>('beats');
const nameEl = $<HTMLInputElement>('name');
const goBtn = $<HTMLButtonElement>('go');
const stopBtn = $<HTMLButtonElement>('stop');
const saveBtn = $<HTMLButtonElement>('save');
const dlBtn = $<HTMLButtonElement>('dl');
const dot = $('dot');

let cap: WebcamCapture | null = null;
let connections: Array<{ start: number; end: number }> = [];

let recording = false;
let t0 = 0;
let nextSampleAt = 0;
let frames: RawPose[] = [];
let saved: { fps: number; frames: RawPose[] } | null = null;
let savedNote = '';

const SAMPLE_MS = 1000 / CAPTURE.targetHz;

for (const b of BEATS) {
  const li = document.createElement('li');
  li.textContent = `${String(b.at).padStart(2, '0')}s  ${b.what}`;
  li.title = b.how;
  beatsEl.appendChild(li);
}

goBtn.onclick = () => {
  frames = [];
  saved = null;
  savedNote = '';
  recording = true;
  t0 = performance.now();
  nextSampleAt = t0;
  goBtn.disabled = true; stopBtn.disabled = false;
  saveBtn.disabled = true; dlBtn.disabled = true;
  dot.classList.add('on');
};

stopBtn.onclick = () => finish();
saveBtn.onclick = () => { void save(); };
dlBtn.onclick = () => download();

/**
 * 启动看门狗：这么久还没有第一帧推理、也没有 lastError，就当场说人话。
 * `WebcamCapture.start()` 永不 reject，但它**可以永远不 resolve**
 * （wasm/模型从 CDN 下不下来、某些浏览器里 enumerateDevices 直接挂住）。
 * 那种情况下没有异常可接，只有一个一直不返回的 promise。
 */
const BOOT_TIMEOUT_MS = 15000;

boot();

function boot(): void {
  cap = new WebcamCapture(video);

  // 先起帧循环，**再**去 start() —— 顺序很重要：
  // start() 挂住时，状态面板和报错框仍然是活的。
  // 之前是 `await cap.start()` 然后才 frame()，于是一旦它不返回，
  // 这一页就永远停在 "启动中…"，连"出了什么事"都不说。
  frame();
  void cap.start();            // 永不 reject：摄像头翻车时靠 lastError 说话

  // 骨架连线只影响叠加线，拿不到也能录，所以不挡启动
  void import('@mediapipe/tasks-vision')
    .then((m) => { connections = m.PoseLandmarker.POSE_CONNECTIONS; })
    .catch(() => { /* 没有连线也能录 */ });

  setTimeout(() => {
    if (cap?.fps || cap?.lastError) return;   // 已经起来了，或者已经有话说了
    showError(
      `${BOOT_TIMEOUT_MS / 1000} 秒了还没拿到第一帧推理，也没有报错。\n` +
      '多半是 MediaPipe 的 wasm / 模型没下下来（断网，或本地 assets/models/ 是空的），\n' +
      '也可能是这个浏览器根本没把摄像头交出来。',
    );
  }, BOOT_TIMEOUT_MS);
}

function frame(): void {
  requestAnimationFrame(frame);
  const now = performance.now();
  const pose = cap?.latest() ?? null;

  if (recording) {
    // 定速采样：一次 rAF 可能要补多帧（掉帧时），时间轴必须保持均匀
    let guard = 0;
    while (now >= nextSampleAt && guard++ < 8) {
      frames.push(snapshot(pose, nextSampleAt - t0));
      nextSampleAt += SAMPLE_MS;
    }
    if (elapsed() >= BEATS[BEATS.length - 1].at + 2) finish();   // 到点自动收，免得一个人跑回来按按钮
  }

  draw(pose);
  paint(pose);
}

function elapsed(): number { return recording ? (performance.now() - t0) / 1000 : (frames.length * SAMPLE_MS) / 1000; }

/** 没人时记一帧空的 —— 这就是"走进画面/走出画面"在数据里的样子 */
function snapshot(p: RawPose | null, tMs: number): RawPose {
  if (!p) return { world: [], score: 0, t: Math.round(tMs) };
  return {
    world: p.world.map(round4),
    screen: p.screen?.map(round4),
    score: r(p.score, 3),
    t: Math.round(tMs),
  };
}

// 4 位小数 = 0.1mm / 0.01% 画幅。再多就是在存 float 噪声，白白让文件翻倍
function round4(l: Landmark): Landmark {
  const out: Landmark = { x: r(l.x, 4), y: r(l.y, 4), z: r(l.z, 4) };
  if (typeof l.visibility === 'number') out.visibility = r(l.visibility, 3);
  return out;
}
function r(v: number, d: number): number {
  if (!Number.isFinite(v)) return 0;
  const m = 10 ** d;
  return Math.round(v * m) / m;
}

function finish(): void {
  if (!recording) return;
  recording = false;
  dot.classList.remove('on');
  goBtn.disabled = false; stopBtn.disabled = true;
  const withPeople = frames.filter((f) => f.world.length).length;
  saved = { fps: CAPTURE.targetHz, frames };
  saveBtn.disabled = frames.length === 0;
  dlBtn.disabled = frames.length === 0;
  savedNote = frames.length
    ? `录到 ${frames.length} 帧，其中 ${withPeople} 帧有人（${((withPeople / frames.length) * 100).toFixed(0)}%）`
    : '一帧都没录到';
  if (withPeople === 0) {
    showError('整段录制里一帧都没有检测到人。\n这份数据是没用的 —— 重录，别存。');
    saveBtn.disabled = true;
  }
}

async function save(): Promise<void> {
  if (!saved) return;
  const name = (nameEl.value || 'untitled').trim();
  saveBtn.disabled = true;
  try {
    const res = await fetch(`/__demo/${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(saved),
    });
    const j = await res.json() as { ok?: boolean; path?: string; bytes?: number; error?: string };
    if (!res.ok || !j.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
    savedNote = `✓ 已写回 ${j.path}（${((j.bytes ?? 0) / 1e6).toFixed(1)} MB）· 试试 ?demo=1&clip=${name}`;
  } catch (e) {
    savedNote = `写回失败（${e instanceof Error ? e.message : String(e)}），改用下载，然后手动放进 assets/demo/`;
    download();
  }
  saveBtn.disabled = false;
}

function download(): void {
  if (!saved) return;
  const name = (nameEl.value || 'untitled').trim();
  const file = name.startsWith('pose-') ? name : `pose-${name}`;
  const blob = new Blob([JSON.stringify(saved)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${file}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function draw(pose: RawPose | null): void {
  const w = video.videoWidth || CAPTURE.requestedVideo.width;
  const h = video.videoHeight || CAPTURE.requestedVideo.height;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  ctx.clearRect(0, 0, w, h);
  const pts = pose?.screen;
  if (!pts?.length) return;
  ctx.lineWidth = Math.max(2, w / 500);
  ctx.strokeStyle = 'rgba(140,190,230,0.7)';
  for (const c of connections) {
    const a = pts[c.start], b = pts[c.end];
    if (!a || !b) continue;
    ctx.beginPath(); ctx.moveTo(a.x * w, a.y * h); ctx.lineTo(b.x * w, b.y * h); ctx.stroke();
  }
  const rad = Math.max(3, w / 260);
  ctx.fillStyle = '#e8564a';
  for (const p of pts) { ctx.beginPath(); ctx.arc(p.x * w, p.y * h, rad, 0, Math.PI * 2); ctx.fill(); }
}

function paint(pose: RawPose | null): void {
  const err = cap?.lastError ?? null;
  if (err) showError(err);

  const t = elapsed();
  const bytes = frames.length * 2300;   // 粗估：33+33 个点、4 位小数 ≈ 2.3 KB/帧
  statEl.textContent = [
    `状态       ${recording ? '● 录制中' : frames.length ? '已停止' : '待机'}`,
    `时长       ${t.toFixed(1)}s`,
    `帧数       ${frames.length}  @${CAPTURE.targetHz}fps`,
    `推理 Hz    ${cap?.fps ?? 0}`,
    `画面里     ${pose ? `有人 score ${pose.score.toFixed(2)}` : '没有人'}`,
    `估算体积   ${(bytes / 1e6).toFixed(1)} MB`,
    savedNote ? `\n${savedNote}` : '',
  ].join('\n');

  const i = BEATS.findIndex((b, k) => t >= b.at && (k === BEATS.length - 1 || t < BEATS[k + 1].at));
  Array.from(beatsEl.children).forEach((li, k) => {
    li.className = !recording ? '' : k === i ? 'now' : k < i ? 'done' : '';
  });
  const b = recording && i >= 0 ? BEATS[i] : null;
  beatEl.innerHTML = b
    ? `${b.what}<small>${b.how}</small>`
    : recording ? '' : '<small style="font-size:15px">点「开始录制」，然后照右边的六件事做一遍</small>';
}

function showError(msg: string): void {
  errEl.style.display = 'block';
  errEl.textContent = `摄像头 / 模型出错：\n${msg}\n\n` +
    '没有摄像头就不要录 —— 也不要用合成数据顶替（T-16 明确禁止）。\n' +
    '换一台有摄像头、并且前面站得下一个真人的机器再录。';
}
