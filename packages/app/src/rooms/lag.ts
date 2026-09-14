/**
 * 侧室 `/lag` —— 慢半拍。（原 `/dev/vitality.html`，生命力 A/B 靶场。）
 *
 * ## 它对一个没造过这件作品的人来说是关于什么的
 *
 * 场上站着的那具身体是**一堆互不相连的刚体**。刚体做不出"弯" ——
 * 那是这件作品从一开始就接受的物理限制（不做蒙皮，docs/22）。
 * 可它看起来是活的。为什么？这个房间就是那个"为什么"：
 * 左边是目标姿态本身，右边是同一段动作、每一节比上一节多落后一点点。
 * 一串各自延迟不同的刚体，看起来就是在弯。
 *
 * 底下那三行数字是这个房间不煽情的那一半：指尖落后多少、胸口落后多少、
 * **骨盆落后多少（应当 ≈ 0）**。最后那个数是这条主张的证伪条件 ——
 * 根部也跟着慢，那就不是"末端比根部慢半拍"，只是整体卡顿。
 *
 * ## 为什么是 2D 画骨架线而不是真渲染
 *
 * 要看的是**延迟的形状**，不是材质和光。骨架线把它暴露得最清楚，
 * 而且不吃 WebGPU —— 一台跑不动 WebGPU 的笔记本上这个房间照样开得出来，
 * 这正是它够格被展出、而 `/dev/lineup.html` 不够格的那条差别。
 *
 * ## 颜色被拿掉了
 *
 * 原来 A 路是灰、B 路是强调蓝。搬出后台的时候两条都改成 `--sb-ink`：
 * docs/26 §F「全站只有一处用颜色承担语义」，A/B 不是那一处。
 * 差别本来就由**位置**说清楚了（左边关、右边开，各自带标题），
 * 再配一层色是让颜色去说一件版面已经说完的话。
 */
import { createVitality } from '../../../core/src/vitality.ts';
import { buildSkeleton, BONES } from '../../../core/src/skeleton.ts';
import { VITALITY } from '../../../core/src/tuning.ts';
import type { Skeleton, Vec3 } from '../../../core/src/types.ts';
import { COPY, setBi } from '../ui/i18n.ts';
import { mountRoom } from './room.ts';
import './lag.css';

const BASE: Record<string, Vec3> = {
  pelvis: [0, 0.95, 0], chest: [0, 1.35, 0], neck: [0, 1.45, 0], headCenter: [0, 1.60, 0],
  shoulderL: [0.19, 1.38, 0], elbowL: [0.33, 1.10, 0.02], wristL: [0.44, 0.86, 0.04], handTipL: [0.48, 0.77, 0.05],
  shoulderR: [-0.19, 1.38, 0], elbowR: [-0.33, 1.10, 0.02], wristR: [-0.44, 0.86, 0.04], handTipR: [-0.48, 0.77, 0.05],
  hipL: [0.09, 0.93, 0], kneeL: [0.10, 0.51, 0.01], ankleL: [0.10, 0.09, 0], footIdxL: [0.10, 0.03, 0.16],
  hipR: [-0.09, 0.93, 0], kneeR: [-0.10, 0.51, 0.01], ankleR: [-0.10, 0.09, 0], footIdxR: [-0.10, 0.03, 0.16],
};

/** 一段左右甩臂 —— 延迟在往复运动的**折返点**上最明显，所以用正弦而不是匀速 */
function poseAt(t: number): Skeleton {
  const s = Math.sin(t * 2.1);
  const j: Record<string, Vec3> = {};
  for (const k in BASE) j[k] = [...BASE[k]] as Vec3;
  const swing = (k: string, amt: number) => { j[k] = [j[k][0] + s * amt, j[k][1] + Math.abs(s) * amt * 0.5, j[k][2] + s * amt * 0.6]; };
  swing('chest', 0.05); swing('neck', 0.07); swing('headCenter', 0.09);
  swing('shoulderL', 0.10); swing('elbowL', 0.26); swing('wristL', 0.46); swing('handTipL', 0.52);
  swing('shoulderR', 0.08); swing('elbowR', 0.20); swing('wristR', 0.36); swing('handTipR', 0.41);
  return buildSkeleton(j, [], t);
}

const PX = 190, CX = 310, CY = 520;
const project = (p: Vec3): [number, number] => [CX + p[0] * PX, CY - p[1] * PX];

function draw(ctx: CanvasRenderingContext2D, sk: Skeleton, alpha: number, color: string): void {
  ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = alpha > 0.5 ? 2.5 : 1.2;
  ctx.lineCap = 'round';
  for (const [, a, b] of BONES) {
    const pa = sk.joints[a], pb = sk.joints[b];
    if (!pa || !pb) continue;
    const [x0, y0] = project(pa), [x1, y1] = project(pb);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ── 房间 ────────────────────────────────────────────────────────────────────

const L = COPY.rooms.lag;
const room = mountRoom({ title: L.title, lede: L.lede });

/** 一格：一块画布 + 它底下那一句。`figure`/`figcaption` 是这两者关系的原生说法 */
function panel(caption: typeof L.off): CanvasRenderingContext2D {
  const fig = document.createElement('figure');
  fig.className = 'lag-panel';
  const canvas = document.createElement('canvas');
  canvas.width = 620;
  canvas.height = 560;
  // 画布里画的是骨架线，不是一张图。读屏念得到的那一句就是底下的 figcaption，
  // 所以这里给一个空的 alt 等价物：role=img 而无名字会被念成"图像"三个字。
  canvas.setAttribute('aria-hidden', 'true');
  const cap = document.createElement('figcaption');
  setBi(cap, caption);
  fig.append(canvas, cap);
  row.append(fig);
  return canvas.getContext('2d')!;
}

const row = document.createElement('div');
row.className = 'lag-row';
const ctxOff = panel(L.off);
const ctxOn = panel(L.on);

const trailNote = document.createElement('p');
trailNote.className = 'lag-note';
setBi(trailNote, L.trail);

const num = document.createElement('div');
num.className = 'lag-num sb-data';

room.body.append(row, trailNote, num);

/**
 * 画布上的墨从**页面的令牌**里取，不写死。
 * 这一层原来是后台工具，两条轨迹一灰一蓝；搬出来之后两条都走 `--sb-ink`
 * （理由在文件头）。canvas 拿不到 CSS 变量，所以在这里读一次 ——
 * 只读一次是对的：这个房间没有换底色的场景。
 */
const readInk = (name: string, fallback: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
const INK = readInk('--sb-ink', 'currentColor');
const RULE = readInk('--sb-rule', 'currentColor');

const vit = createVitality();
const trailOff: Skeleton[] = [];
const trailOn: Skeleton[] = [];
const TRAIL = 12;

let t = 0;
let peakTip = 0, peakChest = 0;

function frame(): void {
  const dt = 1 / 60;
  t += dt;
  const target = poseAt(t);
  const alive = vit.apply(target, null, dt);

  trailOff.push(target); if (trailOff.length > TRAIL) trailOff.shift();
  trailOn.push(alive); if (trailOn.length > TRAIL) trailOn.shift();

  // 两路同墨。差别由**位置**说（左边关、右边开），不由颜色说 —— 见文件头
  for (const [ctx, trail] of [
    [ctxOff, trailOff] as const,
    [ctxOn, trailOn] as const,
  ]) {
    ctx.clearRect(0, 0, 620, 560);
    ctx.strokeStyle = RULE; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, CY); ctx.lineTo(620, CY); ctx.stroke();
    trail.forEach((s, i) => { if (i < trail.length - 1) draw(ctx, s, 0.06 + (i / trail.length) * 0.16, INK); });
    draw(ctx, trail[trail.length - 1], 1, INK);
  }

  // 数值：末端和根部各自落后目标多少
  const d = (k: string) => Math.hypot(
    alive.joints[k][0] - target.joints[k][0],
    alive.joints[k][1] - target.joints[k][1],
    alive.joints[k][2] - target.joints[k][2]);
  peakTip = Math.max(peakTip, d('handTipL'));
  peakChest = Math.max(peakChest, d('chest'));

  if (Math.round(t * 60) % 20 === 0) {
    num.innerHTML =
      `<div>lagSeconds <b>${VITALITY.lagSeconds}</b> · lagCurve <b>${VITALITY.lagCurve}</b> · breathHz <b>${VITALITY.breathHz}</b></div>` +
      `<div>指尖落后峰值 <b>${(peakTip * 100).toFixed(1)} cm</b> · 胸口落后峰值 <b>${(peakChest * 100).toFixed(1)} cm</b></div>` +
      `<div>骨盆落后 <b>${(d('pelvis') * 1000).toFixed(2)} mm</b>（应当 ≈ 0）· 比值 指尖/胸口 <b>${(peakTip / Math.max(1e-9, peakChest)).toFixed(1)}×</b></div>`;
  }
  requestAnimationFrame(frame);
}
frame();
