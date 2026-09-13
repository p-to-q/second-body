import test from 'node:test';
import assert from 'node:assert/strict';
import { readFlags } from '../src/shell/kiosk.ts';

test('flags: 默认值 —— 镜像开、其余关', () => {
  const f = readFlags('');
  assert.equal(f.mirror, true, '镜像必须默认开，现场关掉镜子就不是镜子了');
  assert.equal(f.demo, false);
  assert.equal(f.debug, false);
  assert.equal(f.theme, null);
  assert.equal(f.seed, null);
});

test('flags: ?mirror=0 是唯一能关镜像的写法', () => {
  assert.equal(readFlags('?mirror=0').mirror, false);
  assert.equal(readFlags('?mirror=1').mirror, true);
  assert.equal(readFlags('?mirror=false').mirror, true, 'mirror=false 不算 —— 只认 0，避免手滑关掉镜像');
});

test('flags: 数值参数非法时退回 null 而不是 NaN', () => {
  assert.equal(readFlags('?seed=abc').seed, null);
  assert.equal(readFlags('?seed=').seed, null);
  assert.equal(readFlags('?tier=2').tier, 2);
  assert.equal(readFlags('?seed=0').seed, 0, 'seed=0 是合法的，不能被当成假值丢掉');
});

test('flags: theme 原样透传', () => {
  assert.equal(readFlags('?theme=char.dumpling').theme, 'char.dumpling');
});

test('flags: 加载态与目录默认都在，各自有一个关掉的写法', () => {
  const f = readFlags('');
  assert.equal(f.loading, true, '默认要有加载态 —— 黑屏才是那个被修掉的 bug');
  assert.equal(f.nav, true);
  assert.equal(readFlags('?loading=0').loading, false);
  assert.equal(readFlags('?nav=0').nav, false);
});

test('flags: 现场模式下目录自动消失，不需要再写一个参数', () => {
  // 装置画面上不该挂网站导航。这条判断只有 readFlags 一处，
  // 各挂载点不许自己再判一次 —— 否则总有一处会漏。
  assert.equal(readFlags('?kiosk=1').nav, false);
  assert.equal(readFlags('?kiosk=1').loading, true, '现场照样要有加载态：黑屏在现场更致命');
});

test('flags: ?wave= 只认 on / off，认不出来的值 = 当没写过', () => {
  // 和 ?scene= / ?shading= / ?cam= 同一条规矩：手滑写的参数**不许静默生效**，
  // 也不许静默变成"我以为我关掉了"。null 的意思是"这条参数没被认出来"，
  // 默认走哪条由消费者（main.ts）决定并把结论打印出来。
  assert.equal(readFlags('').wave, null, '没写就是 null');
  assert.equal(readFlags('?wave=on').wave, 'on');
  assert.equal(readFlags('?wave=off').wave, 'off');
  assert.equal(readFlags('?wave=1').wave, null, '?wave=1 不算 —— 它读起来像"开"，但我们没认');
  assert.equal(readFlags('?wave=yes').wave, null);
  assert.equal(readFlags('?wave=').wave, null);
  assert.equal(readFlags('?wave=OFF').wave, null, '大小写不宽容：只有一种写法能关掉它');
});

test('flags: ?wave= 的默认不是"关" —— 现场没有输入设备，关掉等于没有这一条', () => {
  // 这条钉的是**默认值本身**，它是一个判断不是一个实现细节：
  // 现场（?kiosk=1）一件输入设备都没有，默认关掉的话观众只能等 30 秒被随机塞一具身体。
  assert.notEqual(readFlags('?kiosk=1').wave, 'off');
  assert.notEqual(readFlags('').wave, 'off');
});
