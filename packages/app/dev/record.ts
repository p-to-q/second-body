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
 *
 * ── 第二条路：视频文件（T-16 后半张卡）───────────────────────────────────
 * 摄像头那条路要求"有一台带摄像头的机器 + 一个愿意站在它前面的真人"。
 * 这两样在写这行字的时候都没有，于是 `assets/demo/` 里只有合成占位数据 ——
 * 等于**根本没有兜底**，而线上部署（评委打开的那个链接）跑的正是它。
 *
 * 所以加一条：`?video=<url>` 或选一个本地文件，对着一段**授权干净的真人视频**跑同一个
 * PoseLandmarker。这不是"造一份更好的假数据"：MediaPipe 在真实视频上的输出就是真实录制 ——
 * 真的人、真的关节抖动、真的遮挡、真的深度噪声。轴向假设第一次有机会被真实人体证伪。
 *
 * 视频路**逐帧 seek**，不跟着播放走：
 * 实时播放会掉帧（推理比 30fps 慢），掉的帧在时间轴上是个洞，而回放是按 fps 走墙钟的 ——
 * 洞会变成"突然快进"。逐帧 seek 慢，但拿到的是完整、均匀的序列。
 */
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { WebcamCapture } from '../src/capture/webcam.ts';
import { CAPTURE } from '../../core/src/tuning.ts';
import type { Landmark, RawPose } from '../../core/src/types.ts';

// 本地 wasm：和 webcam.ts 走同一套（打包进产物，现场断网也能起）
import wasmLoaderUrl from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import wasmBinaryUrl from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';

const CDN_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';

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

const params = new URLSearchParams(location.search);

/**
 * 两条互斥的源。默认还是摄像头 —— 有真人在场时它仍然是最好的那条路。
 * `?video=` / 选文件 会切到 file：**不开摄像头**（没有摄像头的机器也要能跑完这条线）。
 */
type Mode = 'camera' | 'file';
let mode: Mode = params.get('video') ? 'file' : 'camera';

/** `?model=lite|full|heavy`：视频路默认 full。不是实时，没有理由省那 20% GPU */
const MODEL_FILE = ({ lite: 'pose_landmarker_lite', full: 'pose_landmarker_full', heavy: 'pose_landmarker_heavy' } as const)[
  (params.get('model') ?? 'full') as 'lite' | 'full' | 'heavy'
] ?? 'pose_landmarker_full';

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
const fileEl = $<HTMLInputElement>('file');
const runFileBtn = $<HTMLButtonElement>('runfile');

if (params.get('name')) nameEl.value = params.get('name')!;

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

fileEl.onchange = () => {
  const f = fileEl.files?.[0];
  if (f) void runVideo(URL.createObjectURL(f), f.name);
};
runFileBtn.onclick = () => fileEl.click();

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

function boot(): void {
  cap = new WebcamCapture(video);

  // 先起帧循环，**再**去 start() —— 顺序很重要：
  // start() 挂住时，状态面板和报错框仍然是活的。
  // 之前是 `await cap.start()` 然后才 frame()，于是一旦它不返回，
  // 这一页就永远停在 "启动中…"，连"出了什么事"都不说。
  frame();
  void cap.start();            // 永不 reject：摄像头翻车时靠 lastError 说话

  void loadConnections();

  setTimeout(() => {
    if (cap?.fps || cap?.lastError) return;   // 已经起来了，或者已经有话说了
    showError(
      `${BOOT_TIMEOUT_MS / 1000} 秒了还没拿到第一帧推理，也没有报错。\n` +
      '多半是 MediaPipe 的 wasm / 模型没下下来（断网，或本地 assets/models/ 是空的），\n' +
      '也可能是这个浏览器根本没把摄像头交出来。',
    );
  }, BOOT_TIMEOUT_MS);
}

/** 骨架连线只影响叠加线，拿不到也能录，所以不挡启动 */
async function loadConnections(): Promise<void> {
  try {
    const m = await import('@mediapipe/tasks-vision');
    connections = m.PoseLandmarker.POSE_CONNECTIONS;
  } catch { /* 没有连线也能录 */ }
}

// ── 视频文件路 ──────────────────────────────────────────────────────────────

/** 视频路自己的最近一帧结果（摄像头路是问 cap.latest()，两条路不共用状态） */
let filePose: RawPose | null = null;
let fileNote = '';
let fileBusy = false;

/**
 * 对一段视频逐帧跑 PoseLandmarker，跑出一份和摄像头录制**完全同构**的 `{fps, frames}`。
 *
 * 为什么是 seek 而不是 play()：见文件头。简单说 —— 我们要的是完整序列，不是实时体验。
 * 为什么每帧都要 push（哪怕没人）：`world: []` 就是"画面里没有人"在数据里的样子，
 * 走进/走出画面全靠它，ReplayCapture 看到空 world 返回 null。
 */
async function runVideo(src: string, label: string): Promise<void> {
  if (fileBusy) return;
  fileBusy = true;
  mode = 'file';
  goBtn.disabled = true; stopBtn.disabled = true; saveBtn.disabled = true; dlBtn.disabled = true;
  frames = []; saved = null; savedNote = '';
  try {
    fileNote = '正在加载模型…';
    const lm = await makeLandmarker();

    fileNote = `正在加载 ${label}…`;
    video.srcObject = null;
    video.removeAttribute('autoplay');
    video.loop = false;
    video.crossOrigin = 'anonymous';
    video.src = src;
    await new Promise<void>((res, rej) => {
      video.onloadedmetadata = () => res();
      video.onerror = () => rej(new Error(`视频加载失败：${label}`));
    });

    const dur = video.duration;
    if (!Number.isFinite(dur) || dur <= 0) throw new Error(`拿不到视频时长（${dur}）`);
    const step = 1 / CAPTURE.targetHz;
    // 末尾留一帧余量：最后一帧 seek 到 duration 上在部分解码器里永远不 'seeked'
    const end = dur - step;
    let stamp = 0;

    for (let t = 0; t < end; t += step) {
      await seekTo(t);
      // MediaPipe 的 VIDEO 模式要求时间戳严格递增；这里用我们自己的均匀时间轴，
      // 不用 video.currentTime —— seek 的落点可能被吸到最近的关键帧，不保证单调。
      stamp += SAMPLE_MS;
      let res: ReturnType<PoseLandmarker['detectForVideo']> | null = null;
      try { res = lm.detectForVideo(video, Math.round(stamp)); } catch { res = null; }
      const world = res?.worldLandmarks?.[0];
      const screen = res?.landmarks?.[0];
      filePose = world?.length
        ? { world: world.map(toLm), screen: screen?.map(toLm), score: overallScore(screen ?? world), t: Math.round(t * 1000) }
        : null;
      res?.close?.();
      frames.push(snapshot(filePose, t * 1000));
      if (frames.length % 30 === 0) {
        fileNote = `跑到 ${t.toFixed(1)}s / ${dur.toFixed(1)}s（${frames.length} 帧）`;
        status().note = fileNote;
        status().frames = frames.length;
        await new Promise((r) => requestAnimationFrame(r));   // 让出一帧，页面别假死
      }
    }
    lm.close();
    fileNote = '';
    finish();
    // `?save=1`：跑完直接写回。让"重跑一遍所有素材"变成一串 URL，而不是一串点击。
    if (params.get('save') === '1' && !saveBtn.disabled) await save();
  } catch (e) {
    fileNote = '';
    status().error = e instanceof Error ? e.message : String(e);
    showError(`视频路跑不下去：${status().error}`);
  }
  fileBusy = false;
  status().done = true;
}

/**
 * 给自动化用的一个小窗口。视频路一跑就是几分钟，而这几分钟里页面只会自己转 ——
 * 没有它，外面只能靠截图猜跑到哪了。
 */
interface RecordStatus { done: boolean; frames: number; note: string; error: string | null }
function status(): RecordStatus {
  const w = window as unknown as { __record?: RecordStatus };
  return (w.__record ??= { done: false, frames: 0, note: '', error: null });
}

function seekTo(t: number): Promise<void> {
  return new Promise<void>((res) => {
    // seek 偶尔不回 'seeked'（编码问题 / 落在同一帧上）。超时也往下走，
    // 大不了这一帧和上一帧一样 —— 比整段卡死强。
    const done = () => { video.removeEventListener('seeked', done); clearTimeout(timer); res(); };
    const timer = setTimeout(done, 2000);
    video.addEventListener('seeked', done, { once: true });
    video.currentTime = t;
  });
}

/**
 * 和 webcam.ts 同一套降级：本地 wasm → CDN wasm、本地模型 → CDN 模型、GPU → CPU。
 *
 * `?delegate=cpu` 不是调参，是一条真实的出路：在**软件 OpenGL**（无头 Chrome 的
 * SwiftShader、没有显卡驱动的现场机器）上，"GPU" delegate 会比 CPU 慢两个数量级 ——
 * 实测这段 45s 的片子，GPU 路每帧要 8 秒，CPU 路是几十毫秒。
 * 自动探测探不出来（GPU delegate 会成功创建，只是慢），所以给一个开关。
 */
async function makeLandmarker(): Promise<PoseLandmarker> {
  const modelAssetPath = await resolveModelPath();
  const opts = { runningMode: 'VIDEO' as const, numPoses: 1, outputSegmentationMasks: false };
  const order = params.get('delegate') === 'cpu' ? (['CPU', 'GPU'] as const) : (['GPU', 'CPU'] as const);
  // 本地 wasm 先试；CDN 那条**懒加载** —— 本地能起就不该去碰网络（现场可能是断的）
  const filesets = [
    async () => ({ wasmLoaderPath: new URL(wasmLoaderUrl, location.href).href,
                   wasmBinaryPath: new URL(wasmBinaryUrl, location.href).href }),
    () => FilesetResolver.forVisionTasks(CDN_WASM),
  ];
  let lastErr: unknown = null;
  for (const make of filesets) {
    const fs = await make();
    for (const delegate of order) {
      try {
        return await PoseLandmarker.createFromOptions(fs, { ...opts, baseOptions: { modelAssetPath, delegate } });
      } catch (e) { lastErr = e; }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function resolveModelPath(): Promise<string> {
  const local = `/models/${MODEL_FILE}.task`;
  try {
    const r = await fetch(local, { method: 'HEAD' });
    if (r.ok && !(r.headers.get('content-type') ?? '').includes('text/html')) return local;
  } catch { /* 本地没有就 CDN */ }
  return `https://storage.googleapis.com/mediapipe-models/pose_landmarker/${MODEL_FILE}/float16/latest/${MODEL_FILE}.task`;
}

function toLm(l: { x: number; y: number; z: number; visibility?: number }): Landmark {
  return { x: l.x, y: l.y, z: l.z, visibility: l.visibility };
}

/** 和 webcam.ts 的 overallScore 同义：逐点 visibility 取平均；恒为 0 的模型版本记 1 */
function overallScore(src: ReadonlyArray<{ visibility?: number }>): number {
  let sum = 0, n = 0;
  for (const l of src) {
    const v = l.visibility;
    if (typeof v === 'number' && Number.isFinite(v)) { sum += v; n++; }
  }
  if (!n || sum === 0) return 1;
  return Math.min(1, Math.max(0, sum / n));
}

function frame(): void {
  requestAnimationFrame(frame);
  const now = performance.now();
  const pose = mode === 'file' ? filePose : (cap?.latest() ?? null);

  if (recording && mode === 'camera') {
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
  if (!recording && mode === 'camera') return;
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
  status().note = savedNote;
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
  const err = mode === 'camera' ? (cap?.lastError ?? null) : null;
  if (err) showError(err);

  const t = elapsed();
  const bytes = frames.length * 2300;   // 粗估：33+33 个点、4 位小数 ≈ 2.3 KB/帧
  statEl.textContent = [
    `源         ${mode === 'file' ? `视频文件 · ${MODEL_FILE.replace('pose_landmarker_', '')}` : '摄像头'}`,
    `状态       ${fileNote || (recording ? '● 录制中' : frames.length ? '已停止' : '待机')}`,
    `时长       ${t.toFixed(1)}s`,
    `帧数       ${frames.length}  @${CAPTURE.targetHz}fps`,
    `推理 Hz    ${mode === 'file' ? '—（逐帧 seek，不跟实时）' : cap?.fps ?? 0}`,
    `画面里     ${pose ? `有人 score ${pose.score.toFixed(2)}` : '没有人'}`,
    `估算体积   ${(bytes / 1e6).toFixed(1)} MB`,
    savedNote ? `\n${savedNote}` : '',
  ].join('\n');

  const i = BEATS.findIndex((b, k) => t >= b.at && (k === BEATS.length - 1 || t < BEATS[k + 1].at));
  Array.from(beatsEl.children).forEach((li, k) => {
    li.className = !recording ? '' : k === i ? 'now' : k < i ? 'done' : '';
  });
  const b = mode === 'camera' && recording && i >= 0 ? BEATS[i] : null;
  beatEl.innerHTML = b
    ? `${b.what}<small>${b.how}</small>`
    : recording ? '' : mode === 'file'
      ? `<small style="font-size:15px">${fileNote || '视频跑完了，点「写回 assets/demo/」'}</small>`
      : '<small style="font-size:15px">点「开始录制」，然后照右边的六件事做一遍</small>';
}

function showError(msg: string): void {
  errEl.style.display = 'block';
  errEl.textContent = mode === 'file'
    ? `${msg}\n\n换一段视频，或者检查 /models/ 与网络（wasm 和模型要么本地有，要么下得下来）。`
    : `摄像头 / 模型出错：\n${msg}\n\n` +
      '没有摄像头就不要录 —— 也不要用合成数据顶替（T-16 明确禁止）。\n' +
      '换一台有摄像头、并且前面站得下一个真人的机器再录。';
}

// ── 启动 ────────────────────────────────────────────────────────────────────
// 放在文件最末尾：视频路要读 `filePose` 这类 `let`，而 `let` 只有执行到那一行才存在。
// 之前这段在文件中部，于是第一帧 rAF 就撞上 TDZ —— 页面一直空着，只在控制台里喊。
if (mode === 'file') {
  frame();                                       // 帧循环只负责画，视频路自己推自己的帧
  void loadConnections();
  void runVideo(params.get('video')!, params.get('video')!);
} else {
  boot();
}
