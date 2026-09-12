/**
 * 采集调试页（dev 工具，不进现场）。两件事：
 *
 *  A. 验收 T-01：33 个点叠在视频上、左上角 fps / 推理 Hz / 置信度，
 *     摄像头权限被拒时页面不白屏且 lastError 有值。
 *  B. **量 U1/U2**（docs/09）：MediaPipe worldLandmarks 的轴向与单位没有官方文档，
 *     只能实测。右上角常驻 pelvis / leftWrist / rightWrist 的 world xyz，
 *     并且对每个分量累计 min/max/量程 + 最近 1 秒的抖动（标准差）。
 *     左右那一半已经由 docs/04 §1 的推导定死（`left_*` 是被摄者的左），不用再量；
 *     要量的是 Y 的方向和 Z 的可用性 —— 照右上角那两步做一遍就能把 U1/U2 填了。
 *
 * 这里只显示原始数据，**不做任何姿态处理**（滤波/骨架/坐标转换都是 core 的事）。
 * 画面故意不镜像：镜像只允许发生在 mediapipeToWorld()（docs/04 §1、docs/02 P4）。
 */
import { captureKindFromUrl, createCapture, type Capture } from '../src/capture/capture.ts';
import { CAPTURE } from '../../core/src/tuning.ts';
import type { Landmark, RawPose } from '../../core/src/types.ts';

const LM = { L_WRIST: 15, R_WRIST: 16, L_HIP: 23, R_HIP: 24 };

const hud = document.getElementById('hud')!;
const axesBox = document.getElementById('axes')!;
const video = document.getElementById('cam') as HTMLVideoElement;
const canvas = document.getElementById('ov') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

const kind = captureKindFromUrl();
let cap: Capture | null = null;
let connections: Array<{ start: number; end: number }> = [];

// 渲染 fps（和 capture.fps 是两回事：后者是推理 Hz，两者解耦，docs/06 §1）
let renderFps = 0;
const renderTimes: number[] = [];

/** 每个被盯住的关节，逐轴累计量程与抖动 —— U1/U2 的实测读数就是从这里抄 */
class AxisStats {
  min = Infinity; max = -Infinity;
  #win: number[] = [];
  #winT: number[] = [];
  push(v: number, now: number): void {
    if (!Number.isFinite(v)) return;
    if (v < this.min) this.min = v;
    if (v > this.max) this.max = v;
    this.#win.push(v); this.#winT.push(now);
    while (this.#winT.length && now - this.#winT[0] > 1000) { this.#winT.shift(); this.#win.shift(); }
  }
  /** 最近 1 秒的标准差 = "抖多少"（U2 判单目深度能不能撑 3D 挂载） */
  get jitter(): number {
    const n = this.#win.length;
    if (n < 2) return 0;
    const mean = this.#win.reduce((a, b) => a + b, 0) / n;
    return Math.sqrt(this.#win.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  }
  get range(): number { return this.max >= this.min ? this.max - this.min : 0; }
  reset(): void { this.min = Infinity; this.max = -Infinity; this.#win = []; this.#winT = []; }
}

const TRACKED = ['pelvis', 'leftWrist', 'rightWrist'] as const;
type Tracked = typeof TRACKED[number];
const stats: Record<Tracked, { x: AxisStats; y: AxisStats; z: AxisStats }> = {
  pelvis: { x: new AxisStats(), y: new AxisStats(), z: new AxisStats() },
  leftWrist: { x: new AxisStats(), y: new AxisStats(), z: new AxisStats() },
  rightWrist: { x: new AxisStats(), y: new AxisStats(), z: new AxisStats() },
};

addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') {
    for (const k of TRACKED) { stats[k].x.reset(); stats[k].y.reset(); stats[k].z.reset(); }
  }
});

void boot();

async function boot(): Promise<void> {
  try {
    // 画线只是好看，拿不到就只画点 —— 这条 import 在 ?demo=1 下是多余的开销，所以放在 webcam 分支里
    if (kind === 'webcam') {
      const { PoseLandmarker } = await import('@mediapipe/tasks-vision');
      connections = PoseLandmarker.POSE_CONNECTIONS;
    }
  } catch { /* 没有连线也能验收 */ }

  // 把页面上这个 <video> 交给 WebcamCapture：推理和显示用的是同一个元素
  const c = await createCapture(kind, { video });
  cap = c;
  await c.start();      // 永不 reject；权限被拒时靠 lastError 说话
  frame();
}

function frame(): void {
  requestAnimationFrame(frame);
  const now = performance.now();
  renderTimes.push(now);
  while (renderTimes.length && now - renderTimes[0] > 1000) renderTimes.shift();
  renderFps = renderTimes.length;

  const pose = cap?.latest() ?? null;   // 非阻塞：渲染永远不等推理
  if (pose) sample(pose, now);
  draw(pose);
  paintHud(pose);
}

function sample(p: RawPose, now: number): void {
  const j = joints(p.world);
  for (const k of TRACKED) {
    const v = j[k];
    if (!v) continue;
    stats[k].x.push(v.x, now); stats[k].y.push(v.y, now); stats[k].z.push(v.z, now);
  }
}

/** pelvis = mid(L_HIP, R_HIP)（docs/04 §2）。这里只为了显示，骨架构建是 T-02 的事 */
function joints(world: Landmark[]): Record<Tracked, Landmark | null> {
  const lh = world[LM.L_HIP], rh = world[LM.R_HIP];
  const pelvis = lh && rh ? { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2, z: (lh.z + rh.z) / 2 } : null;
  return { pelvis, leftWrist: world[LM.L_WRIST] ?? null, rightWrist: world[LM.R_WRIST] ?? null };
}

function draw(pose: RawPose | null): void {
  // 没有视频（回放模式）时用请求的采集分辨率当画布，免得叠加层被页面比例拉变形
  const w = video.videoWidth || CAPTURE.requestedVideo.width;
  const h = video.videoHeight || CAPTURE.requestedVideo.height;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  ctx.clearRect(0, 0, w, h);
  const pts = pose?.screen;
  if (!pts?.length) return;

  ctx.lineWidth = Math.max(2, w / 500);
  ctx.strokeStyle = 'rgba(140,190,230,0.75)';
  for (const c of connections) {
    const a = pts[c.start], b = pts[c.end];
    if (!a || !b) continue;
    ctx.beginPath(); ctx.moveTo(a.x * w, a.y * h); ctx.lineTo(b.x * w, b.y * h); ctx.stroke();
  }
  const r = Math.max(3, w / 260);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const vis = p.visibility ?? 1;
    ctx.fillStyle = vis >= CAPTURE.minJointConfidence ? '#e8564a' : 'rgba(232,86,74,0.28)';
    ctx.beginPath(); ctx.arc(p.x * w, p.y * h, r, 0, Math.PI * 2); ctx.fill();
  }
}

function paintHud(pose: RawPose | null): void {
  const c = cap;
  const err = c?.lastError ?? null;
  const infer = c?.fps ?? 0;
  const score = pose?.score ?? 0;
  const cls = (ok: boolean) => (ok ? '' : ' class="bad"');

  hud.innerHTML =
    `<b>${kind === 'replay' ? '回放 (?demo=1)' : '摄像头'}</b>`
    + (backendOf(c) ? `  ${backendOf(c)}` : '')
    + `\nfps        <span${cls(renderFps >= 30)}>${renderFps}</span>`
    + `\n推理 Hz    <span${cls(infer >= CAPTURE.targetHz)}>${infer}</span>`
    + `\n置信度     <span${cls(score >= CAPTURE.minScore)}>${score.toFixed(2)}</span>`
    + `   ${pose ? '有人' : '<span class="warn">无人 / 未就绪</span>'}`
    + (err ? `\n<span class="bad">lastError  ${escapeHtml(err)}</span>` : '\nlastError  —');

  const rows: string[] = ['world xyz（MediaPipe 原始坐标，未转换）'];
  const j = pose ? joints(pose.world) : null;
  for (const k of TRACKED) {
    const v = j?.[k] ?? null;
    const s = stats[k];
    rows.push(
      `${k.padEnd(11)}${v ? `${fmt(v.x)} ${fmt(v.y)} ${fmt(v.z)}` : '   —       —       —   '}`,
      `  量程      ${span(s.x)} ${span(s.y)} ${span(s.z)}`,
      `  抖动/1s   ${fmt(s.x.jitter)} ${fmt(s.y.jitter)} ${fmt(s.z.jitter)}`,
    );
  }
  // 左右那一半已由 docs/04 §1 推导定死，不用再量；只剩 Y 方向和 Z 的可用性
  rows.push('', 'U1/U2 两步（结论写回 docs/09）',
    ' 1 蹲下     → pelvis y 变大还是变小',
    ' 2 前后走 1m → pelvis z 量程 vs 抖动',
    '   抖动 ≈ 量程 → 深度不可用，退 2.5D');
  axesBox.textContent = rows.join('\n');
}

function backendOf(c: Capture | null): string {
  const b = (c as Partial<{ backend: string; source: string }> | null);
  return b?.backend ?? b?.source ?? '';
}

function fmt(n: number): string { return (n >= 0 ? ' ' : '') + n.toFixed(3); }
function span(s: AxisStats): string { return s.range ? ` ${s.range.toFixed(3)}` : '   —   '; }
function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch] ?? ch));
}
