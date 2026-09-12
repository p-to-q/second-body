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
