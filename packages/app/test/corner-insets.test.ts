/**
 * 舞台四个角的边距是**同一个数**（作品负责人 2026-09-14：左下读数和右下那一列要底部对齐）。
 *
 * 左上小屏幕、左下读数、右上目录一直是 `--sb-safe × 0.5`；只有右下出口那一列用了整个 `--sb-safe`，
 * 于是它比读数高出半个安全区、也比目录往里缩了半个安全区 —— 四个角没有站在同一个框上。
 * 选择把右下角挪下来而不是把另外三个挪上去：三个角已经是一个框，改一个比改三个少动东西；
 * 投影切边的顾虑在现场模式下不成立（`?kiosk=1` 不挂出口）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const HALF = /calc\(var\(--sb-safe\)\s*\*\s*0\.5\)/;

function first(block: string, sel: string): string {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return block.match(new RegExp(`${esc}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

test('四个角同一个边距：右下出口列与左下读数底边对齐、与右上目录右边对齐', () => {
  const exits = first(css('../src/ui/exits.css'), '.sb-exits');
  const readout = first(css('../src/ui/readout.css'), '.sb-readout');
  const corner = first(css('../src/ui/corner.css'), '.sb-corner');
  const bottomOf = (b: string) => b.match(/bottom:\s*([^;]+);/)?.[1].trim() ?? '';
  const rightOf = (b: string) => b.match(/right:\s*([^;]+);/)?.[1].trim() ?? '';
  assert.match(bottomOf(readout), HALF, '读数的底边距不再是半个安全区 —— 这条测试的基准变了');
  assert.equal(bottomOf(exits).replace(/\s+/g, ''), bottomOf(readout).replace(/\s+/g, ''), '右下出口列和左下读数的底边距不一样，底部对不齐');
  assert.equal(rightOf(exits).replace(/\s+/g, ''), rightOf(corner).replace(/\s+/g, ''), '右下出口列和右上目录的右边距不一样，右边对不齐');
});

test('入口展签：整块字（含隐私那一行）和摄像头按钮的边距与右上目录同一个框', () => {
  const entry = css('../src/shell/entry.css');
  const label = first(entry, '.sb-entry');
  const camera = first(entry, '.sb-camera');
  const corner = first(css('../src/ui/corner.css'), '.sb-corner');
  const rightOf = (b: string) => b.match(/right:\s*([^;]+);/)?.[1].trim().replace(/\s+/g, '') ?? '';
  assert.match(label.match(/padding:\s*([^;]+);/)?.[1] ?? '', HALF, '展签的内边距不是半个安全区 —— 左下那一行和右上目录不在同一个框里');
  assert.equal(rightOf(camera), rightOf(corner), '摄像头按钮和右上目录的右边距不一样');
  assert.match(camera.match(/bottom:\s*([^;]+);/)?.[1] ?? '', HALF, '摄像头按钮的底边距不是半个安全区');
});
