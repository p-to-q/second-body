/**
 * 控制器（`stepFollow` / `stepCrop`）从成熟实现里采纳的几条行为（docs/49 §6.5 对照表里标"采纳 / 改造"的那几行）。
 * 每条一个断言；先红后绿的记录在 §6.7。都是**同一个控制器的参数**，不是特例。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { cropTarget, cropZoomLimit, stepCrop, stepFollow, CROP_FULL, type Crop, type Follow, type FollowParams } from '../src/autoframe.ts';
import { mulberry32 } from '../src/rng.ts';
import { AUTOFRAME } from '../src/tuning.ts';
import { person, SEATED } from './framing-people.ts';

const DT = 1 / 60;
const BASE: FollowParams = { deadZone: 0.04, band: 0.06, omega: 3, range: 5 };
function drive(p: FollowParams, target: (i: number) => number, n: number): number[] {
  let s: Follow = { x: 0, v: 0 };
  const xs: number[] = [];
  for (let i = 0; i < n; i++) { s = stepFollow(s, target(i), DT, p); xs.push(s.x); }
  return xs;
}

test('稳定延迟：目标在死区外不到 0.3 秒就回来 —— 一动不动；停在外面 —— 0.3 秒后才开始跟', () => {
  const p = { ...BASE, settle: 0.3 };
  const blip = drive(p, (i) => (i < 12 ? 0.2 : 0), 120);
  assert.ok(blip.every((x) => x === 0), `0.2 秒的一下让它动了：${Math.max(...blip)}`);
  const moved = drive(p, () => 0.2, 120);
  assert.equal(moved[Math.floor(0.25 / DT)], 0, '没等稳定就动了');
  assert.ok(moved[119] > 0.05, `停稳之后没跟：${moved[119]}`);
});

test('限速：大距离时每帧不超过 maxSpeed·dt（临界阻尼从静止起步的峰值速度要靠它压）', () => {
  const free = drive(BASE, () => 3, 180);
  const capped = drive({ ...BASE, maxSpeed: 0.8 }, () => 3, 180);
  const speed = (xs: number[]) => xs.reduce((m, x, i) => Math.max(m, Math.abs(x - (i ? xs[i - 1] : 0)) / DT), 0);
  assert.ok(speed(free) > 0.8, '这个用例本来就没超速，测不出东西');
  assert.ok(speed(capped) <= 0.8 + 1e-9, `超速：${speed(capped)}`);
});

test('速度前馈：匀速走时落后得少；停下时冲过去的量不超过 leadMax', () => {
  const ramp = (i: number) => Math.min(2, i * DT * 1.0);
  const plain = drive({ ...BASE, deadZone: 0, band: 1e-6 }, ramp, 240);
  const lead = drive({ ...BASE, deadZone: 0, band: 1e-6, lead: 0.3, leadMax: 0.1 }, ramp, 240);
  const lagAt = Math.floor(1.5 / DT);
  assert.ok(ramp(lagAt) - lead[lagAt] < ramp(lagAt) - plain[lagAt] - 0.05, `前馈没有减少落后：${(ramp(lagAt) - lead[lagAt]).toFixed(3)} vs ${(ramp(lagAt) - plain[lagAt]).toFixed(3)}`);
  // 冲过去的上限要用一个跟得上目标的弹簧量（ω = 20）：ω = 3 的弹簧自己落后得多，前馈的尖峰被它吃掉，
  // 那样上限在不在都是绿的（先红后绿第一轮这一发没红，docs/49 §6.7）
  const fast = { ...BASE, deadZone: 0, band: 1e-6, omega: 20 };
  const long = drive({ ...fast, lead: 0.3, leadMax: 0.1 }, ramp, 600);
  const over = Math.max(...long) - 2;
  assert.ok(over > 0.02, `这个用例里前馈根本没冲过去（${over.toFixed(3)}），量不出上限`);
  assert.ok(over <= 0.1 + 1e-9, `停下时冲过了 ${over.toFixed(3)}（上限 0.1）`);
  assert.ok(Math.max(...plain, ...drive(fast, ramp, 600)) <= 2 + 1e-9, '没有前馈时临界阻尼不该过冲');
});

test('目标去抖：检测噪声（±0.03 均匀）在进弹簧之前被压掉，输出的抖动小一半以上', () => {
  const rng = mulberry32(5);
  const noise = Array.from({ length: 600 }, () => (rng.next() - 0.5) * 0.06);
  // 弹簧开得很快（ω = 20）：这里量的是去抖这一级，不是弹簧本身的低通
  const p = { ...BASE, deadZone: 0, band: 1e-6, omega: 20 };
  const sd = (xs: number[]) => { const t = xs.slice(120); const m = t.reduce((a, b) => a + b, 0) / t.length; return Math.sqrt(t.reduce((a, b) => a + (b - m) ** 2, 0) / t.length); };
  const raw = drive(p, (i) => 0.3 + noise[i], 600);
  const smooth = drive({ ...p, jitter: { minCutoff: 0.5, beta: 0.05 } }, (i) => 0.3 + noise[i], 600);
  assert.ok(sd(smooth) < sd(raw) * 0.5, `去抖后 ${sd(smooth).toFixed(4)} vs 不去抖 ${sd(raw).toFixed(4)}`);
});

const runCrop = (n: number, input: (i: number) => Parameters<typeof stepCrop>[1], from: Crop = CROP_FULL): Crop[] => {
  const out: Crop[] = [];
  let c = from;
  for (let i = 0; i < n; i++) { c = stepCrop(c, input(i), DT); out.push(c); }
  return out;
};

test('小屏：放大的弹簧比平移的慢（缩放在小屏上最显眼），而且放大确实按它自己的弹簧走', () => {
  // 平移整体的完成时间还叠着稳定延迟和死区过渡带的慢尾巴，拿它比没有意义；比的是两个弹簧本身
  assert.ok(AUTOFRAME.previewZoomOmega < AUTOFRAME.previewOmega);
  const cs = runCrop(360, () => ({ active: true, snap: false, screen: person(SEATED).screen }));
  const travel = AUTOFRAME.previewZoom - 1;
  const t90 = cs.findIndex((c) => c.zoom - 1 >= 0.9 * travel) * DT;
  // 临界阻尼到 90%：(1 + ωt)·e^(−ωt) = 0.1 → ωt ≈ 3.89
  const expect = 3.89 / AUTOFRAME.previewZoomOmega;
  assert.ok(Math.abs(t90 - expect) < 0.15, `放大 90% 用了 ${t90.toFixed(2)}s，按 ω=${AUTOFRAME.previewZoomOmega} 应该 ${expect.toFixed(2)}s`);
});

test('小屏：分辨率下限 —— 源画面不够时不放大像素', () => {
  assert.equal(cropZoomLimit(720, 432), AUTOFRAME.previewZoom);
  assert.ok(Math.abs(cropZoomLimit(480, 432) - 480 / 432) < 1e-9);
  assert.equal(cropZoomLimit(360, 432), 1);
  assert.equal(cropZoomLimit(NaN, 432), AUTOFRAME.previewZoom, '拿不到尺寸时按上限（旧行为）');
  const cs = runCrop(240, () => ({ active: true, snap: false, screen: person(SEATED).screen, maxZoom: cropZoomLimit(480, 432) }));
  assert.ok(cs.every((c) => c.zoom <= 480 / 432 + 1e-9), `放大超过了分辨率下限：${Math.max(...cs.map((c) => c.zoom))}`);
});

test('小屏：眼睛落在窗口上三分之一（头顶留白）', () => {
  const screen = person(SEATED).screen!;
  const cs = runCrop(360, () => ({ active: true, snap: false, screen }));
  const c = cs[cs.length - 1];
  const eyes = [0, 2, 5, 7, 8].map((i) => screen[i].y).reduce((a, b) => a + b, 0) / 5;
  // 目标本身：眼睛**正好**在窗口上三分之一
  const target = cropTarget(screen, AUTOFRAME.previewZoom)!;
  const atTarget = (eyes - (target.y - 0.5 / AUTOFRAME.previewZoom)) * AUTOFRAME.previewZoom;
  assert.ok(Math.abs(atTarget - AUTOFRAME.previewEyeLine) < 1e-9, `目标把眼睛放在窗口的 ${atTarget.toFixed(3)} 处`);
  // 实际窗口停在目标的死区 + 过渡带之内（死区本来就是"差这么一点不追"）
  assert.ok(Math.abs(c.cy.x - target.y) <= AUTOFRAME.previewDeadZone + AUTOFRAME.previewBand, `窗口中心 ${c.cy.x.toFixed(3)} 离目标 ${target.y.toFixed(3)} 太远`);
  assert.equal(cropTarget(undefined), null);
});

test('小屏：上半身取景里人量不到 —— 先停 1 秒，再慢慢放回整幅；人回来时从停着的地方接着走，没有跳', () => {
  const seated = person(SEATED).screen;
  const warm = runCrop(240, () => ({ active: true, snap: false, screen: seated }));
  const zoomed = warm[warm.length - 1].zoom;
  const gone = runCrop(180, () => ({ active: true, snap: false, screen: undefined }), warm[warm.length - 1]);
  assert.ok(Math.abs(gone[Math.floor(0.9 / DT)].zoom - zoomed) < 0.01, `丢了 0.9 秒就开始放了：${gone[54].zoom}`);
  assert.ok(gone[179].zoom < 1.12, `丢了 3 秒还没放回来：${gone[179].zoom}`);
  const back = runCrop(120, () => ({ active: true, snap: false, screen: seated }), gone[119]);
  const seq = [gone[119], ...back].map((c) => c.zoom);
  const worst = seq.reduce((m, z, i) => (i ? Math.max(m, Math.abs(z - seq[i - 1]) * (0.016 / DT)) : m), 0);
  assert.ok(worst <= AUTOFRAME.maxStep.zoom + 1e-9, `人回来时放大倍数跳了 ${worst}`);
});
