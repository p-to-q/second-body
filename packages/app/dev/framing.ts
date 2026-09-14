/**
 * 取景模式靶场 —— 分类器每一帧看到了什么、判了什么、为什么。
 *
 * 为什么是 2D 画点而不是真舞台：要看的是**判据**（哪几个点可信、在不在画内、尺度在不在缩），
 * 不是镜头运动。舞台上的效果去 `/?debug=1` 看 HUD 那两行 framing。
 * 不吃 WebGPU，无头环境里也能出图。
 *
 * 默认播一段合成的人（`core/test/framing-people.ts`，和 node 测试同一段），
 * 按「用摄像头」才请求权限 —— 和正式程序同一条规矩：不点就不问。
 */
import {
  createFramingClassifier, decide, isFramingPolicy, trustedLandmark,
  type FramingClassifier, type FramingMode, type FramingPolicy,
} from '../../core/src/autoframe.ts';
import { AUTOFRAME } from '../../core/src/tuning.ts';
import type { RawPose } from '../../core/src/types.ts';
import { between, person, SEATED, STOOD_UP_CLOSE, WHOLE, type PersonSpec } from '../../core/test/framing-people.ts';
import type { Capture } from '../src/capture/capture.ts';
import { formatFramingRows } from '../src/shell/hud.ts';
import '../src/ui/type.css';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const view = $<HTMLCanvasElement>('view');
const line = $<HTMLCanvasElement>('line');
const num = $<HTMLDivElement>('num');
const vctx = view.getContext('2d')!;
const lctx = line.getContext('2d')!;

/** 合成的那一段：每一格 [秒, 从, 到]。和 autoframe.test.ts 的「时间线」那条同形 */
const SCRIPT: Array<[number, PersonSpec, PersonSpec]> = [
  [3, SEATED, SEATED],
  [0.4, SEATED, STOOD_UP_CLOSE], [1.6, STOOD_UP_CLOSE, STOOD_UP_CLOSE],
  [1.2, STOOD_UP_CLOSE, WHOLE], [2.8, WHOLE, WHOLE],
  [1.0, WHOLE, SEATED], [4, SEATED, SEATED],
  [2, SEATED, SEATED],
];
const SCRIPT_LEN = SCRIPT.reduce((a, [s]) => a + s, 0);

function synthetic(t: number): RawPose {
  let u = t % SCRIPT_LEN;
  for (const [s, a, b] of SCRIPT) {
    if (u < s) return person(between(a, b, u / s));
    u -= s;
  }
  return person(SEATED);
}

const q = new URLSearchParams(location.search);
let policy: FramingPolicy = isFramingPolicy(q.get('framing')) ? (q.get('framing') as FramingPolicy) : 'auto';
let kiosk = q.get('kiosk') === '1';
let classifier: FramingClassifier = createFramingClassifier({ kiosk });
let capture: Capture | null = null;
let t = 0;
let last = performance.now();
/** 最近 20 秒：[时刻, 模式 | null] */
const history: Array<[number, FramingMode | null]> = [];
const HISTORY_SECONDS = 20;

$<HTMLSelectElement>('policy').value = policy;
$<HTMLSelectElement>('policy').addEventListener('change', (e) => { policy = (e.target as HTMLSelectElement).value as FramingPolicy; });
$<HTMLInputElement>('kiosk').checked = kiosk;
$<HTMLInputElement>('kiosk').addEventListener('change', (e) => {
  kiosk = (e.target as HTMLInputElement).checked;
  classifier = createFramingClassifier({ kiosk });
});
$<HTMLButtonElement>('cam').addEventListener('click', async () => {
  const { createCapture } = await import('../src/capture/capture.ts');
  const c = await createCapture('webcam');
  await c.start();
  if (c.lastError) { $('src').textContent = `摄像头没开起来：${c.lastError}`; c.stop(); return; }
  capture = c;
  classifier.reset();
  history.length = 0;
});

const COLOR: Record<FramingMode, string> = { full: '#8a9099', upper: '#e8a33d', 'stepping-back': '#5aa9e6' };

function draw(pose: RawPose | null): void {
  const W = view.width, H = view.height;
  vctx.fillStyle = '#0a0b0d';
  vctx.fillRect(0, 0, W, H);
  // 画框留一圈边：画外的点也要画得出来（它们是"出画"的证据）
  const pad = 0.18;
  const sx = (x: number) => (pad + x * (1 - 2 * pad)) * W;
  const sy = (y: number) => (pad + y * (1 - 2 * pad)) * H;
  vctx.strokeStyle = '#555';
  vctx.strokeRect(sx(0), sy(0), sx(1) - sx(0), sy(1) - sy(0));
  const pts = pose?.screen;
  if (!pts) return;
  pts.forEach((l, i) => {
    if (!Number.isFinite(l.x) || !Number.isFinite(l.y)) return;
    const leg = i >= 25 && i <= 28;
    vctx.beginPath();
    vctx.arc(sx(l.x), sy(l.y), leg ? 6 : 3.5, 0, Math.PI * 2);
    vctx.strokeStyle = vctx.fillStyle = leg ? '#e8a33d' : '#e6e6e6';
    if (trustedLandmark(l)) vctx.fill(); else vctx.stroke();
  });
}

function drawLine(): void {
  const W = line.width, H = line.height;
  lctx.clearRect(0, 0, W, H);
  const x = (tt: number) => W - ((t - tt) / HISTORY_SECONDS) * W;
  for (let i = 0; i < history.length; i++) {
    const [tt, m] = history[i];
    const next = history[i + 1]?.[0] ?? t;
    lctx.fillStyle = m ? COLOR[m] : '#000';
    lctx.fillRect(x(tt), 8, Math.max(1, x(next) - x(tt)), H - 16);
    if (i > 0 && history[i - 1][1] !== m) { lctx.fillStyle = '#fff'; lctx.fillRect(x(tt), 0, 1, H); }
  }
}

function frame(): void {
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  t += dt;
  const pose = capture ? capture.latest() : synthetic(t);
  $('src').textContent = capture ? '摄像头' : `合成 ${(t % SCRIPT_LEN).toFixed(1)} / ${SCRIPT_LEN.toFixed(0)}s`;
  const r = classifier.update(pose, dt);
  const d = decide(policy, r);
  history.push([t, r.evidence ? r.mode : null]);
  while (history.length && t - history[0][0] > HISTORY_SECONDS) history.shift();
  draw(pose);
  drawLine();
  const [a, b] = formatFramingRows({ reading: r, decision: d, legHold: d.holdLegs ? 1 : 0, shot: d.shot === 'upper' ? 1 : 0 });
  num.innerHTML = '';
  for (const s of [
    a, b,
    `景别 ${d.shot} · 腿 ${d.holdLegs ? '站姿' : '追踪'} · 上半身是正当取景 ${d.upperIsIntended ? '是（引导不为腿说话）' : '否'}`,
    `门限：进上半身 ${kiosk ? AUTOFRAME.enterUpperSecondsKiosk : AUTOFRAME.enterUpperSeconds}s（刚出现 ${AUTOFRAME.enterUpperFirstSeconds}s）· 退后确认 ${AUTOFRAME.stepBackConfirmSeconds}s · 进全身 ${AUTOFRAME.enterFullSeconds}s · 头肩被切 ${AUTOFRAME.abnormalSeconds}s · 冷却 ${AUTOFRAME.cooldownSeconds}s`,
  ]) {
    const el = document.createElement('div');
    el.textContent = s;
    num.append(el);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
