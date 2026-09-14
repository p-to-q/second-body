/**
 * 横向与连续性在 app 这一侧的消费者（docs/49 §6.3）：
 *
 *  1. 引导：从左右走出去的人听到**那一侧**的话，排在「往后退一点」前面；贴边但整个人在画里的人不被说。
 *  2. 读数：WRN12 同一把尺子。
 *  3. 镜像：侧边按观众自己的左右说，小屏上那条边画在显示的对应一侧。
 *  4. 小屏裁切开不开：减少动态、多人时不开。
 *  5. 舞台相机（`shotCamera`）：任意景别序列下视角与移轴每 16ms 的变化有上限；横向余量随景别连续收窄。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { cropActive, createSeeWatch, displaySide, seeState } from '../src/ui/preview-state.ts';
import { assess } from '../src/ui/readout-state.ts';
import { COPY } from '../src/ui/i18n.ts';
import { DEFAULT_BOUNDS, fitFrame, lateralRoom, shotCamera } from '../src/stage/framing.ts';
import { formatFramingRows } from '../src/shell/hud.ts';
import { createFramingClassifier, decide, smoothstep, stepShot, SHOT_REST, type ShotState } from '../../core/src/autoframe.ts';
import { mulberry32 } from '../../core/src/rng.ts';
import { AUTOFRAME, STAGE } from '../../core/src/tuning.ts';
import { person, SEATED, WHOLE } from '../../core/test/framing-people.ts';

const at = (cx: number) => person({ ...WHOLE, cx });

test('引导：从观众自己的左 / 右边走出去 → 那一侧的话；排在「往后退一点」前面', () => {
  assert.deepEqual(seeState({ camera: true, pose: at(1.03) }), { state: 'partial', reason: 'side', side: 'left' });
  assert.deepEqual(seeState({ camera: true, pose: at(-0.03) }), { state: 'partial', reason: 'side', side: 'right' });
  // 画外点可见度给高（MediaPipe 有时就这么自信）：可信点数也够「往后退一点」了，仍然说那一侧
  assert.equal(seeState({ camera: true, pose: person({ ...WHOLE, cx: -0.03, visOut: 0.9 }) }).reason, 'side');
  // 回来那一侧的话：往左出去 → 往右回来
  assert.ok(COPY.preview.outLeft && COPY.preview.outRight && COPY.preview.outLeft !== COPY.preview.outRight);
});

test('引导：贴着边、但整个人都在画里 —— 不说话；太近两边都出 —— 是「往后退一点」，不是侧边', () => {
  assert.deepEqual(seeState({ camera: true, pose: at(0.08) }), { state: 'ok', reason: 'ok' });
  assert.deepEqual(seeState({ camera: true, pose: at(0.92) }), { state: 'ok', reason: 'ok' });
  const huge = person({ ...WHOLE, s: 2.2, hy: 0.6, visOut: 0.9 });
  assert.equal(seeState({ camera: true, pose: huge }).reason, 'bounds');
});

test('引导：快速左右晃在画内，话一次都不出；真的走出去再走回来，话出现一次、收回一次，不闪', () => {
  const watch = createSeeWatch();
  const dt = 1 / 30;
  let changes = 0, prev = 'ok|';
  const feed = (pose: ReturnType<typeof at>) => {
    const r = watch.update({ camera: true, pose }, dt);
    const key = `${r.reason}|${r.side ?? ''}`;
    if (key !== prev) { changes++; prev = key; }
  };
  for (let i = 0; i < 60; i++) feed(at(0.5));
  changes = 0;
  for (let i = 0; i < 180; i++) feed(at(0.5 + 0.3 * Math.sin(2 * Math.PI * 2 * i * dt)));
  assert.equal(changes, 0, '画内晃让小屏开口了');
  for (let i = 0; i < 60; i++) feed(at(1.03));
  for (let i = 0; i < 90; i++) feed(at(0.5));
  assert.equal(changes, 2, `走出去再回来，话变了 ${changes} 次`);
});

test('读数：从左右走出去照报 WRN12（按躯干坐标，不靠数画外可信点）；画内贴边不报；一大半关节都丢了时 ALM01 照旧更重', () => {
  const live = { features: null, inferenceHz: 30 };
  // 胯中点正好压在左边上：33 个点里 16 个在画外（可见度 0.2，不可信 → `outOfFrame` 数出 0 个），躯干 31% 越界
  assert.equal(assess({ ...live, pose: at(0.0) }).code, 'WRN12');
  assert.equal(assess({ ...live, pose: at(0.08) }).code, null);
  // 再往外走：一大半关节看不见了。「关节丢失」比「部分出画」重（ALARM_ORDER），这一条不因为横向而改
  assert.equal(assess({ ...live, pose: at(-0.03) }).code, 'ALM01');
});

test('镜像：侧边按观众自己的左右；镜像显示时细边画在同一侧，?mirror=0 时画在另一侧', () => {
  assert.equal(displaySide('left', true), 'left');
  assert.equal(displaySide('right', true), 'right');
  assert.equal(displaySide('left', false), 'right');
});

test('小屏裁切：上半身取景才开；减少动态、画里有别的有身体的人时不开', () => {
  assert.equal(cropActive({ upperIsIntended: true, reduced: false, othersBodied: false }), true);
  assert.equal(cropActive({ upperIsIntended: true, reduced: true, othersBodied: false }), false);
  assert.equal(cropActive({ upperIsIntended: true, reduced: false, othersBodied: true }), false);
  assert.equal(cropActive({ upperIsIntended: false, reduced: false, othersBodied: false }), false);
});

test('舞台相机：t = 0 时视角和等身全景逐字相同；余量在中景里窄得多', () => {
  const b = DEFAULT_BOUNDS;
  const full = shotCamera(b, 1.71, SHOT_REST, 16 / 9);
  const f = fitFrame(b);
  const dist = Math.max(0.8, STAGE.viewDistance - Math.min(1.0, b.depth / 2));
  assert.equal(full.fov, (2 * Math.atan((Math.max(f.frameHeight, f.frameWidth / (16 / 9)) / 2) / dist) * 180) / Math.PI);
  const upper = shotCamera(b, 1.71, { ...SHOT_REST, progress: 1 }, 16 / 9);
  assert.ok(upper.room < full.room * 0.6, `中景余量 ${upper.room.toFixed(2)} vs 全景 ${full.room.toFixed(2)}`);
  assert.ok(full.room > 0.8, `全景余量只有 ${full.room.toFixed(2)}m`);
  assert.equal(lateralRoom(1, 9 / 16, 1.0), 0, '竖屏里没有横向余量时不许是负的');
});

test('连续性：任意景别 / hold 序列下，舞台相机的视角、移轴与横向余量每 16ms 的变化不超过上限', () => {
  const rng = mulberry32(11);
  let s: ShotState = SHOT_REST;
  let prev = shotCamera(DEFAULT_BOUNDS, 1.71, s, 16 / 9);
  let t = 0, next = 0;
  let shot: 'full' | 'upper' = 'full', hold = false, ox = 0;
  let wf = 0, wp = 0;
  while (t < 60) {
    if (t >= next) { shot = rng.next() < 0.5 ? 'upper' : 'full'; hold = rng.next() < 0.3; ox = (rng.next() - 0.5) * 0.5; next = t + 0.1 + rng.next() * 1.4; }
    const dt = 0.004 + rng.next() * 0.062;
    t += dt;
    s = stepShot(s, { shot, offset: { x: ox, y: 0 }, reduced: false, hold }, dt);
    const cam = shotCamera(DEFAULT_BOUNDS, 1.71, s, 16 / 9);
    wf = Math.max(wf, Math.abs(cam.fov - prev.fov) * (0.016 / dt));
    wp = Math.max(wp, Math.abs(cam.panX - prev.panX) * (0.016 / dt));
    prev = cam;
  }
  assert.ok(wf <= AUTOFRAME.maxStep.fovDeg + 1e-9, `视角一帧变了 ${wf.toFixed(3)}°/16ms（上限 ${AUTOFRAME.maxStep.fovDeg}）`);
  assert.ok(wp <= AUTOFRAME.maxStep.pan + 1e-9, `移轴一帧挪了 ${wp.toFixed(4)}m/16ms（上限 ${AUTOFRAME.maxStep.pan}）`);
  assert.ok(smoothstep(1) === 1);
});

test('HUD：横向那一段（偏移 / 余量 / 在做什么 / 出画侧）和"摄像头在取景"都读得出来', () => {
  const c = createFramingClassifier();
  const r = c.update(person(SEATED), 1 / 30, { cameraFraming: true });
  const [a, b] = formatFramingRows({ reading: r, decision: decide('auto', r), legHold: 0, shot: 0, lateral: { x: -0.42, room: 0.9, why: 'hold-edge', side: 'left' } });
  assert.match(a, /侧 -0\.42\/±0\.90m hold-edge ⚠出画\(left\)/);
  assert.match(b, /摄像头在取景/);
});
