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
