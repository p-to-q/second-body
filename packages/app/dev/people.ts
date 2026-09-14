/**
 * 多人入镜靶场 —— 跟踪器每一帧看到了几个人、配给了谁、谁拿到身体、身体站在哪（docs/50）。
 *
 * 为什么是 2D 画点而不是真舞台：要看的是**判据**（配对代价、出生憋了多久、丢了多久、谁在候补），
 * 不是身体长什么样。舞台上的效果去 `/?debug=1&people=2&demo=1` 看 HUD 那几行 people。
 * 不吃 WebGPU，无头环境里也能出图。
 *
 * 默认播合成的场景（`core/test/framing-people.ts` 的人形）；按「用摄像头」才请求权限 —— 和正式程序同一条规矩。
 */
import { createPeopleTracker, lineup, tintFor, type PeopleFrame, type PeopleTracker } from '../../core/src/people.ts';
import { PEOPLE } from '../../core/src/tuning.ts';
import type { RawPose } from '../../core/src/types.ts';
import { person, type PersonSpec } from '../../core/test/framing-people.ts';
import type { Capture } from '../src/capture/capture.ts';
import { formatPeopleRows } from '../src/shell/hud.ts';
import '../src/ui/type.css';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const view = $<HTMLCanvasElement>('view');
const stageC = $<HTMLCanvasElement>('stage');
const line = $<HTMLCanvasElement>('line');
const num = $<HTMLDivElement>('num');
const vctx = view.getContext('2d')!;
const sctx = stageC.getContext('2d')!;
const lctx = line.getContext('2d')!;

/** 一个场景：秒数 + 每一刻画面里的人 */
interface Scene { name: string; seconds: number; at(t: number): PersonSpec[] }

const SCENES: Scene[] = [
  {
    name: '两个人交叉走过',
    seconds: 8,
    at: (t) => {
      const u = (t % 8) / 8;
      const a = 0.15 + 0.7 * u, b = 0.85 - 0.7 * u;
      return Math.abs(a - b) < 0.08 ? [{ cx: a, s: 0.5 }] : [{ cx: a, s: 0.5 }, { cx: b, s: 0.5 }];
    },
  },
  {
    name: '一个挡住另一个',
    seconds: 8,
    at: (t) => {
      const u = t % 8;
      const front = { cx: 0.3 + 0.4 * Math.min(1, Math.max(0, (u - 2) / 3)), s: 0.6, hy: 0.52 };
      const back = { cx: 0.55, s: 0.35, hy: 0.45 };
      return Math.abs(front.cx - back.cx) < 0.08 ? [front] : [front, back];
    },
  },
  {
    name: '第四个人擦肩走过（上限 3）',
    seconds: 10,
    at: (t) => {
      const u = t % 10;
      const three = [{ cx: 0.2, s: 0.45 }, { cx: 0.5, s: 0.45 }, { cx: 0.8, s: 0.45 }].map((p, i) => ({ ...p, cx: p.cx + 0.01 * Math.sin(u * 2 + i) }));
      return u > 3 && u < 4.4 ? [...three, { cx: 0.05 + (u - 3) * 0.65, s: 0.62, hy: 0.55 }] : three;
    },
  },
  {
    name: '主身体走了、另一个人还在',
    seconds: 12,
    at: (t) => {
      const u = t % 12;
      const b = { cx: 0.7 + 0.02 * Math.sin(u * 3), s: 0.45 };
      if (u < 4) return [{ cx: 0.3 + 0.02 * Math.sin(u * 2), s: 0.5 }, b];
      if (u < 6) return [{ cx: 0.3 - (u - 4) * 0.25, s: 0.5 }, b];
      return [b];
    },
  },
  {
    name: '墙上一张海报 + 一个人进来',
    seconds: 12,
    at: (t) => {
      const u = t % 12;
      const poster = { cx: 0.12, s: 0.38, hy: 0.45 };
      return u < 2 ? [poster] : [poster, { cx: 0.55 + 0.08 * Math.sin(u * 2), s: 0.5 }];
    },
  },
  {
    name: '小孩在大人旁边',
    seconds: 8,
    at: (t) => [{ cx: 0.42 + 0.02 * Math.sin(t * 2), s: 0.5 }, { cx: 0.6 + 0.03 * Math.sin(t * 3.1), s: 0.3, hy: 0.62 }],
  },
];

const q = new URLSearchParams(location.search);
const sceneSel = $<HTMLSelectElement>('scene');
SCENES.forEach((s, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = s.name; sceneSel.append(o); });
sceneSel.value = String(Math.max(0, Math.min(SCENES.length - 1, Number(q.get('scene') ?? 0) || 0)));
const capSel = $<HTMLSelectElement>('cap');
if (q.get('cap')) capSel.value = q.get('cap')!;

let tracker: PeopleTracker = createPeopleTracker({ cap: Number(capSel.value) });
let capture: Capture | null = null;
let t = 0;
let frameNo = 0;
let last = performance.now();
const HISTORY_SECONDS = 20;
/** 最近 20 秒：[时刻, 这一帧的结果] */
const history: Array<[number, PeopleFrame]> = [];
/** 站位弹簧的替身：工作台上直接画 lineup 的目标（舞台上是临界阻尼追它） */
const SEED = 2026;

const restart = () => { tracker = createPeopleTracker({ cap: Number(capSel.value) }); history.length = 0; t = 0; };
sceneSel.addEventListener('change', restart);
capSel.addEventListener('change', () => tracker.setCap(Number(capSel.value)));
$<HTMLButtonElement>('cam').addEventListener('click', async () => {
  const { createCapture } = await import('../src/capture/capture.ts');
  const c = await createCapture('webcam');
  c.setPeople?.(PEOPLE.hardMax);
  await c.start();
  if (c.failed ?? c.lastError) { $('src').textContent = `摄像头没开起来：${c.lastError}`; c.stop(); return; }
  capture = c;
  restart();
});

/** id → 颜色。和舞台上的差异色同一张表（主身体在舞台上是白的，这里给它 id 的颜色好分辨） */
const colorOf = (id: number): string => {
  const [r, g, b] = tintFor(SEED, id);
  const hue = (id * 137.5) % 360;
  return `hsl(${hue.toFixed(0)} ${Math.round(40 + 40 * (1 - (r + g + b) / 3))}% 62%)`;
};

/** 确定性的打乱：MediaPipe 的输出顺序不保证，靶场上也不给它保证 */
function shuffle<T>(xs: T[], k: number): T[] {
  if (xs.length < 2) return xs;
  const r = k % xs.length;
  const rot = [...xs.slice(r), ...xs.slice(0, r)];
  return k % 3 === 0 ? rot.reverse() : rot;
}

const EDGES: ReadonlyArray<readonly [number, number]> = [
  [11, 12], [11, 23], [12, 24], [23, 24], [11, 13], [13, 15], [12, 14], [14, 16], [23, 25], [25, 27], [24, 26], [26, 28], [0, 11], [0, 12],
];

function drawView(poses: readonly RawPose[], f: PeopleFrame): void {
  const W = view.width, H = view.height;
  vctx.fillStyle = '#0a0b0d';
  vctx.fillRect(0, 0, W, H);
  const pad = 0.1;
  const sx = (x: number) => (pad + x * (1 - 2 * pad)) * W;
  const sy = (y: number) => (pad + y * (1 - 2 * pad)) * H;
  vctx.strokeStyle = '#555';
  vctx.strokeRect(sx(0), sy(0), sx(1) - sx(0), sy(1) - sy(0));
  // 原始观测：灰点（输出顺序号标在胸口 —— 看得出它每帧在换）
  poses.forEach((p, i) => {
    const s = p.screen; if (!s) return;
    vctx.fillStyle = '#666';
    for (const l of s) { vctx.beginPath(); vctx.arc(sx(l.x), sy(l.y), 1.6, 0, Math.PI * 2); vctx.fill(); }
    vctx.fillText(`[${i}]`, sx(s[11].x), sy(s[11].y) - 6);
  });
  // 轨迹：骨架按 id 上色
  for (const tr of f.tracks) {
    const s = tr.pose.screen; if (!s) continue;
    vctx.strokeStyle = colorOf(tr.id);
    vctx.globalAlpha = tr.missing > 0 ? 0.3 : 1;
    vctx.lineWidth = tr.primary ? 3 : tr.selected ? 1.6 : 1;
    vctx.setLineDash(tr.selected ? [] : [4, 4]);
    vctx.beginPath();
    for (const [a, b] of EDGES) { vctx.moveTo(sx(s[a].x), sy(s[a].y)); vctx.lineTo(sx(s[b].x), sy(s[b].y)); }
    vctx.stroke();
    vctx.setLineDash([]);
    vctx.fillStyle = colorOf(tr.id);
    vctx.font = '12px ui-monospace, monospace';
    vctx.fillText(`#${tr.id}${tr.primary ? ' 主' : tr.selected ? ' 伴' : ''}${tr.state === 'tentative' ? ' 候补' : ''}`, sx(tr.cx) - 16, sy(tr.cy - tr.scale * 1.4));
    vctx.globalAlpha = 1;
  }
}

function drawStage(f: PeopleFrame): void {
  const W = stageC.width, H = stageC.height;
  sctx.fillStyle = '#0a0b0d';
  sctx.fillRect(0, 0, W, H);
  const span = PEOPLE.maxOffset * 2 + 0.6;
  const px = (m: number) => W / 2 + (m / span) * W;
  sctx.strokeStyle = '#333';
  sctx.beginPath(); sctx.moveTo(px(0), 0); sctx.lineTo(px(0), H); sctx.stroke();
  for (const m of [-PEOPLE.maxOffset, PEOPLE.maxOffset]) { sctx.beginPath(); sctx.moveTo(px(m), 0); sctx.lineTo(px(m), H); sctx.stroke(); }
  const seen = f.tracks.filter((tr) => tr.selected && tr.missing === 0);
  const targets = lineup(seen.map((tr) => ({ id: tr.id, cx: tr.cx, scale: tr.scale })));
  for (const [id, x] of targets) {
    const tr = f.tracks.find((k) => k.id === id)!;
    sctx.fillStyle = colorOf(id);
    const y = tr.primary ? H * 0.4 : H * 0.62;   // 伴随身体往后站（俯视图里画低一点）
    sctx.beginPath(); sctx.arc(px(x), y, tr.primary ? 9 : 7, 0, Math.PI * 2); sctx.fill();
    sctx.fillText(`#${id} ${x >= 0 ? '+' : ''}${x.toFixed(2)}m`, px(x) - 26, y + 22);
  }
  sctx.fillStyle = '#777';
  sctx.fillText('舞台俯视（米）· 屏幕右 = +x · 竖线 = 中线与 ±maxOffset', 8, 14);
}

function drawLine(): void {
  const W = line.width, H = line.height;
  lctx.clearRect(0, 0, W, H);
  const ids = [...new Set(history.flatMap(([, f]) => f.tracks.map((tr) => tr.id)))].sort((a, b) => a - b).slice(-6);
  const rowH = H / Math.max(1, ids.length);
  const x = (tt: number) => W - ((t - tt) / HISTORY_SECONDS) * W;
  for (let i = 0; i < history.length; i++) {
    const [tt, f] = history[i];
    const next = history[i + 1]?.[0] ?? t;
    for (const tr of f.tracks) {
      const r = ids.indexOf(tr.id);
      if (r < 0 || tr.missing > 0) continue;
      lctx.fillStyle = colorOf(tr.id);
      lctx.globalAlpha = tr.selected ? 1 : 0.25;
      const h = tr.primary ? rowH * 0.8 : tr.selected ? rowH * 0.45 : rowH * 0.2;
      lctx.fillRect(x(tt), r * rowH + (rowH - h) / 2, Math.max(1, x(next) - x(tt)), h);
    }
  }
  lctx.globalAlpha = 1;
  lctx.fillStyle = '#aaa';
  ids.forEach((id, r) => lctx.fillText(`#${id}`, 4, r * rowH + rowH / 2 + 4));
}

function frame(): void {
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  t += dt;
  frameNo++;
  const scene = SCENES[Number(sceneSel.value)];
  const poses: RawPose[] = capture
    ? [...(capture.latestAll?.() ?? [])]
    : shuffle(scene.at(t).map((s) => person(s)), frameNo);
  $('src').textContent = capture ? '摄像头' : `合成 ${(t % scene.seconds).toFixed(1)} / ${scene.seconds}s`;
  const f = tracker.update(poses, dt);
  history.push([t, f]);
  while (history.length && t - history[0][0] > HISTORY_SECONDS) history.shift();
  drawView(poses, f);
  drawStage(f);
  drawLine();
  num.innerHTML = '';
  for (const s of [
    ...formatPeopleRows({ frame: f, cap: tracker.cap, bodies: tracker.cap, outlineYields: false, shed: false }),
    `门限：位置 ${PEOPLE.gateTorso} 躯干 + ${PEOPLE.gateGrowthPerSecond}/s · 尺度 ln ${Math.exp(PEOPLE.gateScale).toFixed(2)} · 出生 ${PEOPLE.birthSeconds}s · 宽限 ${PEOPLE.graceSeconds}s · 认亲 ${PEOPLE.reattachSeconds}s`,
    `换人：面积 × ${PEOPLE.swapRatio} 持续 ${PEOPLE.swapSeconds}s · 海报让位：动过的人在场 ${PEOPLE.staticYieldSeconds}s`,
  ]) {
    const el = document.createElement('div');
    el.textContent = s;
    num.append(el);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
