/**
 * `?cam=` 选摄像头 —— 解析、落到设备、以及**回落必须看得见**。
 *
 * 这个文件存在的理由只有最后一条：现场那台外接摄像头被拔掉时，
 * 装置照样跑（好），但它必须在 HUD 上说自己跑在别的摄像头上（这才是那个 bug）。
 * "安静地对着一面墙演一整晚"是这件作品最贵的一种失败，
 * 而它和一切正常时唯一的区别就是 `describeCamera()` 的返回值 —— 所以那必须被钉住。
 *
 * `mediaDevices` 在 node 里伪造不出来，也不值得伪造：会错的是这些判断，
 * 不是 `getUserMedia` 本身（AGENTS：只测纯的那一半）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  camName, describeCamera, formatCameraList, isCamFlag, parseCam, pickCamera,
  type CamDevice,
} from '../src/capture/camera-select.ts';
import { readFlags } from '../src/shell/kiosk.ts';

/** 现场的样子：0 号是内置（对着墙），1 号是外接（对着观众） */
const EXTERNAL = 'b7c19e04d2f1aa53';
const DEVICES: CamDevice[] = [
  { deviceId: 'a10f22cc9e77', label: 'FaceTime HD Camera (内置)' },
  { deviceId: EXTERNAL, label: 'Logitech BRIO' },
  { deviceId: 'c0ffee0011', label: 'OBS Virtual Camera' },
];
/** 外接被拔掉之后 */
const UNPLUGGED: CamDevice[] = [DEVICES[0], DEVICES[2]];

test('cam: 两种写法都认 —— 序号给人，deviceId 给开机脚本', () => {
  assert.deepEqual(parseCam('1'), { kind: 'index', index: 1 });
  assert.deepEqual(parseCam('0'), { kind: 'index', index: 0 }, 'cam=0 是合法的，不能被当成假值丢掉');
  assert.deepEqual(parseCam(EXTERNAL), { kind: 'id', id: EXTERNAL });
  assert.deepEqual(parseCam(' b7c19e04 '), { kind: 'id', id: 'b7c19e04' }, '前后空格是 URL 里常见的手滑，不该因此认不出来');
});

test('cam: 认不出来的值退成 null 而不是静默挑一台（和 ?scene= / ?shading= 同一条规矩）', () => {
  // 手滑写错和"参数没生效"必须分得开 —— 否则现场只会一遍遍重刷同一个坏 URL
  assert.equal(parseCam('1.5'), null);
  assert.equal(parseCam('-1'), null, '负序号像序号但不是序号，不许被当成 deviceId 蒙混过去');
  assert.equal(parseCam('前面那台'), null);
  assert.equal(parseCam('a10f 22cc'), null, '带空格 = 不是 deviceId');
  assert.equal(parseCam(''), null, '?cam= 空值 = 没写，不是"第 0 台"');
  assert.equal(parseCam(null), null);
  assert.equal(isCamFlag('1'), true);
  assert.equal(isCamFlag('1.5'), false);
});

test('flags: ?cam= 接进 readFlags，认不出来就是 null', () => {
  assert.equal(readFlags('').cam, null, '默认不指定 —— 不写 ?cam= 的行为必须和这次改动之前一模一样');
  assert.equal(readFlags('?cam=1').cam, '1');
  assert.equal(readFlags(`?cam=${EXTERNAL}`).cam, EXTERNAL);
  assert.equal(readFlags('?cam=1.5').cam, null);
  assert.equal(readFlags('?cam=').cam, null);
});

test('cam: 序号按 videoinput 的顺序数，越界就是 null', () => {
  assert.equal(pickCamera(DEVICES, '1')?.deviceId, EXTERNAL);
  assert.equal(pickCamera(DEVICES, '0')?.label, 'FaceTime HD Camera (内置)');
  assert.equal(pickCamera(DEVICES, '9'), null, '越界不许绕回第 0 台');
});

test('cam: deviceId 全串和唯一前缀都算，不唯一就落空（宁可大声回落也不替人猜）', () => {
  assert.equal(pickCamera(DEVICES, EXTERNAL)?.label, 'Logitech BRIO');
  assert.equal(pickCamera(DEVICES, 'b7c19e04')?.label, 'Logitech BRIO');
  const twins: CamDevice[] = [
    { deviceId: 'aabb1111', label: 'Cam A' },
    { deviceId: 'aabb2222', label: 'Cam B' },
  ];
  assert.equal(pickCamera(twins, 'aabb'), null, '前缀撞上两台 = 不知道要哪台 = 落空');
  assert.equal(pickCamera(twins, 'aabb1111')?.label, 'Cam A');
});

test('cam: 权限之前那条 deviceId 为空的占位条目不算数', () => {
  // Chrome 在没给权限时会返回一条 deviceId='' 、label='' 的占位。
  // 按序号取到它、再拿空串去约束 getUserMedia，是个会静默生效的错。
  const preGrant: CamDevice[] = [{ deviceId: '', label: '' }];
  assert.equal(pickCamera(preGrant, '0'), null);
  assert.equal(pickCamera(preGrant, 'b7c1'), null);
});

test('cam: 没写 ?cam= 就是 default，HUD 上只报名字', () => {
  const st = describeCamera(DEVICES, null, DEVICES[0].deviceId);
  assert.equal(st.why, 'default');
  assert.equal(st.asked, null);
  assert.equal(st.hud, 'FaceTime HD Camera (内置)');
});

test('cam: 要到了就是 asked，HUD 上带着你写的那个值', () => {
  const st = describeCamera(DEVICES, '1', EXTERNAL);
  assert.equal(st.why, 'asked');
  assert.equal(st.label, 'Logitech BRIO');
  assert.match(st.hud, /Logitech BRIO/);
  assert.match(st.hud, /\?cam=1/);
});

test('cam: 外接被拔掉 —— 装置照跑，但 HUD 必须说它跑在别的摄像头上', () => {
  // 这是整个改动要挡住的那个失败：开机脚本写着 ?cam=<外接的 id>，
  // 外接没插，浏览器给了内置（对着一面墙），而画面一切"正常"。
  const st = describeCamera(UNPLUGGED, EXTERNAL, UNPLUGGED[0].deviceId);
  assert.equal(st.why, 'fallback', '这一个字段就是"它是不是在对着墙演"的唯一判据');
  assert.equal(st.label, 'FaceTime HD Camera (内置)', '报的是实际那台，不是我们要的那台');
  assert.match(st.hud, /不是你要的那台/);
  assert.match(st.hud, new RegExp(`\\?cam=${EXTERNAL}`), 'HUD 要同时说出"你要的是谁"');

  // P21：如果这坏了，仪表会显示成什么？—— 必须不等于一切正常时那一行。
  const ok = describeCamera(DEVICES, EXTERNAL, EXTERNAL);
  assert.equal(ok.why, 'asked');
  assert.notEqual(ok.hud, st.hud, '回落和正常长得一样，这个 HUD 就不是仪表');
});

test('cam: 序号错位（插拔之后）同样算回落', () => {
  // ?cam=1 昨天是外接，今天插拔之后 1 号成了别的东西。
  // 此时 pick 得到的和实际在跑的对不上 —— 照样要红。
  const st = describeCamera(DEVICES, '1', DEVICES[0].deviceId);
  assert.equal(st.why, 'fallback');
});

test('cam: 拿不到实际 deviceId 时宁可判成回落（不确定就吵，不许假装正常）', () => {
  const st = describeCamera(DEVICES, '1', '');
  assert.equal(st.why, 'fallback');
});

test('cam: 打给操作员的那张表，每一行都直接能抄进 URL', () => {
  const st = describeCamera(DEVICES, '1', EXTERNAL);
  const lines = formatCameraList(DEVICES, st);
  assert.equal(lines.length, 3);
  assert.match(lines[1], /\?cam=1/);
  assert.match(lines[1], /\?cam=b7c19e04/, '序号用来找，deviceId 前缀用来钉 —— 两个都要打出来');
  assert.match(lines[1], /现在用的/);
  assert.ok(!lines[0].includes('现在用的'));
  assert.match(formatCameraList([], st)[0], /枚举不到/);
});

test('cam: label 是空串（权限还没给）时退到 deviceId 前缀，而不是显示一片空白', () => {
  assert.equal(camName({ deviceId: 'a10f22cc9e77', label: '' }), '#a10f22cc');
  assert.equal(camName({ deviceId: '', label: '' }), '未知摄像头');
  assert.equal(camName(null), '未知摄像头');
});
