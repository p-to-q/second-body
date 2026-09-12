import test from 'node:test';
import assert from 'node:assert/strict';
import { captureKindFromUrl } from '../src/capture/capture.ts';

// 现场兜底的第一颗扣子：?demo=1 必须真的把采集换成回放。
// 扣错了就会在断网/摄像头翻车时当场发现，那时已经来不及。
test('capture: ?demo=1 换成回放，其余一律走摄像头', () => {
  assert.equal(captureKindFromUrl('?demo=1'), 'replay');
  assert.equal(captureKindFromUrl(''), 'webcam');
  assert.equal(captureKindFromUrl('?debug=1'), 'webcam');
  assert.equal(captureKindFromUrl('?demo=0'), 'webcam');
  assert.equal(captureKindFromUrl('?demo=true'), 'webcam', 'demo 只认 1，和 readFlags 保持一致');
});
