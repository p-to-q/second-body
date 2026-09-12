import test from 'node:test';
import assert from 'node:assert/strict';
import { parseClipIndex, preferredClip, resolveClipUrl } from '../src/capture/replay.ts';

// 现场手打 URL 的人不会记得 `/demo/pose-` 前缀，所以三种写法都得认。
test('clip: ?clip= 的三种写法都指向同一个文件', () => {
  assert.equal(resolveClipUrl('walkwave'), '/demo/pose-walkwave.json');
  assert.equal(resolveClipUrl('pose-walkwave'), '/demo/pose-walkwave.json');
  assert.equal(resolveClipUrl('pose-walkwave.json'), '/demo/pose-walkwave.json');
  assert.equal(resolveClipUrl('/demo/pose-walkwave.json'), '/demo/pose-walkwave.json');
  assert.equal(resolveClipUrl('  walkwave  '), '/demo/pose-walkwave.json', '手抖多打的空格不算错');
});

test('clip: 空 ?clip= 退回默认文件而不是拼出一个坏路径', () => {
  assert.equal(resolveClipUrl(''), '/demo/pose-synthetic.json');
});

test('clip: index.json 三种写法都解析得出来', () => {
  assert.deepEqual(parseClipIndex(['walkwave']).map((c) => c.url), ['/demo/pose-walkwave.json']);
  assert.deepEqual(
    parseClipIndex({ clips: [{ name: 'walkwave', url: '/demo/pose-walkwave.json', frames: 1800 }] })[0],
    { name: 'walkwave', url: '/demo/pose-walkwave.json', frames: 1800 },
  );
  assert.deepEqual(parseClipIndex(null), [], '没有 index 不许炸，返回空');
  assert.deepEqual(parseClipIndex({ clips: 'nope' }), []);
});

// 这条是整张卡的重点：默认挑到的**永远不该是**合成占位数据。
test('clip: 真录制永远排在合成占位数据前面', () => {
  const entries = parseClipIndex({
    clips: [
      { name: 'pose-synthetic', url: '/demo/pose-synthetic.json', synthetic: true },
      { name: 'pose-walkwave', url: '/demo/pose-walkwave.json', synthetic: false },
    ],
  });
  assert.equal(preferredClip(entries)?.url, '/demo/pose-walkwave.json');
});

test('clip: 只有合成数据时仍然挑得出东西（有兜底总比没画面强）', () => {
  const entries = parseClipIndex({ clips: [{ url: '/demo/pose-synthetic.json', synthetic: true }] });
  assert.equal(preferredClip(entries)?.url, '/demo/pose-synthetic.json');
  assert.equal(preferredClip([]), null);
});
