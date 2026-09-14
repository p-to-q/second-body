/**
 * `?camframing=` 与摄像头自带取景（docs/49 §6.3 三）。`MediaStreamTrack` 在 node 里造不出来，也不需要：
 * 会错的是"请求不请求、请求什么、失败了会不会连累摄像头启动"，这里用假 track 把这几条钉住。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCamFraming, framingConstraints, readCamFraming, readCaps, type CamFramingStatus, type TrackLike,
} from '../src/capture/cam-framing.ts';
import { readFlags } from '../src/shell/kiosk.ts';
import { createFramingClassifier, decide } from '../../core/src/autoframe.ts';
import { person, SEATED, WHOLE } from '../../core/test/framing-people.ts';

/** 一条会记下自己被请求了什么的假 track */
function fakeTrack(opts: { caps?: unknown; settings?: Record<string, unknown>; apply?: 'ok' | 'reject' | 'hang' | 'throw' } = {}) {
  const calls: Record<string, unknown>[] = [];
  const settings: Record<string, unknown> = { width: 1280, height: 720, deviceId: 'cam-1', ...opts.settings };
  const track: TrackLike = {
    getCapabilities: () => opts.caps ?? {},
    getSettings: () => settings,
    getConstraints: () => ({ width: { ideal: 1280 }, height: { ideal: 720 }, deviceId: { exact: 'cam-1' } }),
    applyConstraints: (c) => {
      calls.push(c);
      if (opts.apply === 'throw') throw new Error('sync boom');
      if (opts.apply === 'reject') return Promise.reject(new Error('OverconstrainedError'));
      if (opts.apply === 'hang') return new Promise<void>(() => {});
      if (typeof c.faceFraming === 'boolean') settings.faceFraming = c.faceFraming;
      return Promise.resolve();
    },
  };
  return { track, calls };
}

test('?camframing=：默认 auto；三个值读得回来；认不出来喊一声、按 auto 走', () => {
  assert.equal(readFlags('').camframing, 'auto');
  for (const v of ['auto', 'on', 'off'] as const) assert.equal(readFlags(`?camframing=${v}`).camframing, v);
  const warn = console.warn;
  const said: string[] = [];
  console.warn = (m: string) => { said.push(String(m)); };
  try { assert.equal(readFlags('?camframing=yes').camframing, 'auto'); } finally { console.warn = warn; }
  assert.ok(said.some((m) => m.includes('?camframing=yes')));
});

test('能力：规范的 sequence<boolean>、实现给的单个 boolean、垃圾输入都认得；pan/tilt/zoom 只读', () => {
  assert.deepEqual(readCaps({ faceFraming: [true, false], pan: {}, zoom: { min: 1, max: 4 } }), { faceFraming: [true, false], pan: true, tilt: false, zoom: true });
  assert.deepEqual(readCaps({ faceFraming: true }).faceFraming, [true]);
  assert.deepEqual(readCaps(null), { faceFraming: null, pan: false, tilt: false, zoom: false });
  assert.equal(readCaps({ faceFraming: 'yes' }).faceFraming, null);
});

test('请求：auto 从不请求；on / off 只在能力里真有那个值时请求，而且带上原来的约束（尺寸与点名的摄像头不许被重置掉）', () => {
  const both = readCaps({ faceFraming: [true, false] });
  const cur = { width: { ideal: 1280 }, deviceId: { exact: 'cam-1' } };
  assert.equal(framingConstraints('auto', both, cur), null);
  assert.deepEqual(framingConstraints('on', both, cur), { width: { ideal: 1280 }, deviceId: { exact: 'cam-1' }, faceFraming: true });
  assert.deepEqual(framingConstraints('off', both, cur), { ...cur, faceFraming: false });
  assert.equal(framingConstraints('off', readCaps({ faceFraming: [true] }), cur), null, '给不了 false 就不请求');
  assert.equal(framingConstraints('on', readCaps({}), cur), null, '不支持就静默不请求');
});

test('applyCamFraming：成功时读回状态；auto 只读不请求；不支持时不请求、不抛', async () => {
  const on = fakeTrack({ caps: { faceFraming: [true, false] } });
  const s = await applyCamFraming(on.track, 'on');
  assert.equal(on.calls.length, 1);
  assert.deepEqual([s.applied, s.active, s.supported], ['ok', true, true]);
  const auto = fakeTrack({ caps: { faceFraming: [true, false] }, settings: { faceFraming: true } });
  const a = await applyCamFraming(auto.track, 'auto');
  assert.equal(auto.calls.length, 0, 'auto 替人请求了');
  assert.equal(a.active, true, 'auto 没读出摄像头已经在取景');
  const none = fakeTrack({ caps: {} });
  const n = await applyCamFraming(none.track, 'on');
  assert.deepEqual([none.calls.length, n.applied, n.supported, n.active], [0, 'unsupported', false, null]);
});

test('applyCamFraming：永不 reject、永不挡启动 —— 请求被拒、同步抛、一直不 resolve、track 不存在、方法本身抛', async () => {
  for (const apply of ['reject', 'throw', 'hang'] as const) {
    const t = fakeTrack({ caps: { faceFraming: [true, false] }, apply });
    // 自己掐一块 1 秒的表：applyCamFraming 要是没有自己的超时，这里拿到的是 'still-waiting' 并且当场红，
    // 而不是一直挂着、等测试运行器把整条取消（先红后绿第一轮这一发只被取消、没有断言红，docs/49 §6.7）
    let timer: ReturnType<typeof setTimeout> | undefined;
    const s = await Promise.race([
      applyCamFraming(t.track, 'off', 30),
      new Promise<'still-waiting'>((resolve) => { timer = setTimeout(() => resolve('still-waiting'), 1000); }),
    ]);
    clearTimeout(timer);
    assert.notEqual(s, 'still-waiting', `${apply} 把启动挡住了`);
    assert.equal((s as CamFramingStatus).applied, 'failed', apply);
  }
  assert.equal((await applyCamFraming(null, 'on')).applied, 'unsupported');
  const evil: TrackLike = { getCapabilities: () => { throw new Error('x'); }, getSettings: () => { throw new Error('y'); } };
  const e = await applyCamFraming(evil, 'on');
  assert.equal(e.supported, false);
  assert.equal(readCamFraming(evil, 'auto').active, null);
});

test('摄像头在取景时：腿不在是预期 —— 现场也快进上半身、不催往后退；它自己缩放不当成退后', () => {
  const kioskCam = createFramingClassifier({ kiosk: true });
  let r = kioskCam.update(person(SEATED), 1 / 30, { cameraFraming: true });
  for (let i = 0; i < 15; i++) r = kioskCam.update(person(SEATED), 1 / 30, { cameraFraming: true });
  assert.equal(r.mode, 'upper', '摄像头在取景时现场还在等 3 秒');
  assert.equal(decide('full', r, { cameraFraming: true }).upperIsIntended, true, '选了全景时摄像头裁掉的腿照样被催');
  assert.equal(decide('auto', { mode: 'full' }, { cameraFraming: true }).upperIsIntended, true);
  assert.equal(decide('auto', { mode: 'full' }).upperIsIntended, false, '没有摄像头取景时的旧行为变了');
  // 摄像头自己把画面拉远（尺度缩 30%），腿仍然被裁在外面：不是退后
  const c = createFramingClassifier();
  for (let i = 0; i < 90; i++) c.update(person(SEATED), 1 / 30, { cameraFraming: true });
  const zoomOut = { ...SEATED, s: 0.7, hy: 1.02 };
  let modes = new Set<string>();
  for (let i = 0; i < 30; i++) modes.add(c.update(person({ ...SEATED, s: 1 - (0.3 * i) / 30, hy: 0.95 + (0.07 * i) / 30 }), 1 / 30, { cameraFraming: true }).mode);
  for (let i = 0; i < 30; i++) modes.add(c.update(person(zoomOut), 1 / 30, { cameraFraming: true }).mode);
  assert.ok(!modes.has('stepping-back'), `摄像头缩放被当成了退后：${[...modes]}`);
  // 对照：同一段缩放，没有摄像头取景时是退后（证明上面那条不是因为缩得不够）
  const ref = createFramingClassifier();
  for (let i = 0; i < 90; i++) ref.update(person(SEATED), 1 / 30);
  modes = new Set<string>();
  for (let i = 0; i < 30; i++) modes.add(ref.update(person({ ...SEATED, s: 1 - (0.3 * i) / 30, hy: 0.95 + (0.07 * i) / 30 }), 1 / 30).mode);
  assert.ok(modes.has('stepping-back'), `对照没有判出退后：${[...modes]}`);
  assert.ok(WHOLE);
});
