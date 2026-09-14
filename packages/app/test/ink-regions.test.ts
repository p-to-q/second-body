import test from 'node:test';
import assert from 'node:assert/strict';
import { INK_FLIP_LUMA, STAGE_INK } from '../src/stage/look.ts';
import {
  createInkBoard, createInkTracker, gridReadable, hexLuma, INK_BAND, INK_CROSSOVER, INK_REGIONS,
  REGION_TOKENS, regionLuma, type Box, type InkRegion,
} from '../src/stage/ink-regions.ts';

/**
 * 角上的字按**渲染出来的像素**翻墨（`stage/ink-regions.ts`）。
 *
 * 四条守卫：滞回（一条在阈值附近来回的亮度不许每次都翻）、四个角互不相干、
 * 读不到像素时退回场景墨、带是从交点推出来的而不是挑的。
 */

const contrast = (a: number, b: number): number => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

test('墨色滞回带：从两套墨的 3:1 边界推出来，而且以对比度相等的交点为中心', () => {
  const pale = hexLuma(STAGE_INK.onDark.on);
  const deep = hexLuma(STAGE_INK.onLight.on);
  // 交点处两套墨的对比度相等 —— 用定义量，不抄一个数（抄过：look.ts 原注释写的 0.166
  // 喂的是 0.7231 / 0.0106，而 #dfe4ea / #1a1d21 真正的亮度是 0.771 / 0.0121，交点是 0.176）
  assert.ok(Math.abs(contrast(pale, INK_CROSSOVER) - contrast(deep, INK_CROSSOVER)) < 1e-9, `交点 ${INK_CROSSOVER}`);
  assert.ok(Math.abs(contrast(pale, INK_BAND.hi) - 3) < 1e-9, '带的上沿应该正好是浅墨的 3:1');
  assert.ok(Math.abs(contrast(deep, INK_BAND.lo) - 3) < 1e-9, '带的下沿应该正好是深墨的 3:1');
  assert.ok(INK_BAND.lo < INK_CROSSOVER && INK_CROSSOVER < INK_BAND.hi);
  // 在 (L+0.05) 的尺度上对称：两端之积 = 交点的平方
  assert.ok(Math.abs((INK_BAND.lo + 0.05) * (INK_BAND.hi + 0.05) - (INK_CROSSOVER + 0.05) ** 2) < 1e-9);
  // 场景兜底的阈值落在带里 —— 两条路径不会给出互相矛盾的判断
  assert.ok(INK_BAND.lo < INK_FLIP_LUMA && INK_FLIP_LUMA < INK_BAND.hi);
});

test('墨色滞回：在阈值附近来回的亮度不翻，越带一次也不翻', () => {
  // 1) 带内来回：0.14 ↔ 0.20，跨过交点 40 次
  const a = createInkTracker();
  a.step(0.10);
  let flips = 0;
  let prev = a.side;
  for (let i = 0; i < 40; i++) {
    const s = a.step(i % 2 ? 0.14 : 0.20);
    if (s !== prev) flips++;
    prev = s;
  }
  assert.equal(flips, 0, `带内来回翻了 ${flips} 次`);

  // 2) 越带但只压中一次就回来（一条胳膊扫过去）：0.05, 0.40, 0.05, 0.40 …
  const b = createInkTracker();
  b.step(0.05);
  flips = 0;
  prev = b.side;
  for (let i = 0; i < 40; i++) {
    const s = b.step(i % 2 ? 0.05 : 0.40);
    if (s !== prev) flips++;
    prev = s;
  }
  assert.equal(flips, 0, `单次越带翻了 ${flips} 次（驻留没起作用）`);

  // 3) 真的站过来了：连续越带 → 翻，而且只翻一次
  const c = createInkTracker();
  c.step(0.02);
  const trace = [0.3, 0.3, 0.3, 0.3, 0.3].map((l) => c.step(l));
  assert.deepEqual(trace, ['onDark', 'onLight', 'onLight', 'onLight', 'onLight']);
  // NaN（这一次没量到）不改变状态
  assert.equal(c.step(NaN), 'onLight');
});

/** 64×36 的格子，左半/右半、上半/下半各自一个灰度（sRGB 8 位） */
function grid(fill: (x: number, y: number) => number, w = 64, h = 36): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const v = fill(x, y);
      px[i] = v; px[i + 1] = v; px[i + 2] = v; px[i + 3] = 255;
    }
  }
  return px;
}

const BOXES: Record<InkRegion, Box> = {
  tr: { x0: 0.8, y0: 0.0, x1: 1.0, y1: 0.2 },
  br: { x0: 0.8, y0: 0.8, x1: 1.0, y1: 1.0 },
  bl: { x0: 0.0, y0: 0.8, x1: 0.2, y1: 1.0 },
  tl: { x0: 0.0, y0: 0.0, x1: 0.2, y1: 0.2 },
};

test('区域亮度：量的是框底下的像素，全透明返回 NaN', () => {
  const px = grid((x) => (x >= 32 ? 255 : 0));
  assert.ok(Math.abs(regionLuma(px, 64, 36, BOXES.tr) - 1) < 1e-6);
  assert.equal(regionLuma(px, 64, 36, BOXES.tl), 0);
  const empty = new Uint8ClampedArray(64 * 36 * 4);
  assert.ok(Number.isNaN(regionLuma(empty, 64, 36, BOXES.tr)));
  assert.equal(gridReadable(empty), false);
  assert.equal(gridReadable(px), true);
});

function fakeRoot(): { tokens: Map<string, string>; write: (t: string, v: string | null) => void; logs: string[] } {
  const tokens = new Map<string, string>();
  return {
    tokens,
    logs: [],
    write: (t, v) => { if (v === null) tokens.delete(t); else tokens.set(t, v); },
  };
}

test('墨色分区：右上亮、右下暗时两个角各翻各的', () => {
  const root = fakeRoot();
  const board = createInkBoard(root.write);
  // 上半画面是纸（亮），下半是夜（暗）
  const px = grid((_, y) => (y < 18 ? 240 : 8));
  board.sample({ px, w: 64, h: 36, boxes: BOXES });
  assert.equal(root.tokens.get(REGION_TOKENS.tr.on), STAGE_INK.onLight.on, '右上在亮底上应是深墨');
  assert.equal(root.tokens.get(REGION_TOKENS.tl.strong), STAGE_INK.onLight.strong);
  assert.equal(root.tokens.get(REGION_TOKENS.br.on), STAGE_INK.onDark.on, '右下在暗底上应是浅墨');
  assert.equal(root.tokens.get(REGION_TOKENS.bl.dim), STAGE_INK.onDark.dim);

  // 身体只从右下走过（持续两次）：右下翻，右上一动不动
  const lit = grid((x, y) => (y < 18 ? 240 : x >= 48 ? 250 : 8));
  board.sample({ px: lit, w: 64, h: 36, boxes: BOXES });
  board.sample({ px: lit, w: 64, h: 36, boxes: BOXES });
  assert.equal(root.tokens.get(REGION_TOKENS.br.on), STAGE_INK.onLight.on, '右下该翻了');
  assert.equal(root.tokens.get(REGION_TOKENS.bl.on), STAGE_INK.onDark.on, '左下不该跟着翻');
  assert.equal(root.tokens.get(REGION_TOKENS.tr.on), STAGE_INK.onLight.on, '右上不该跟着翻');

  // 某个角暂时没有东西（null 框）：它保持原状，不被撤掉
  board.sample({ px, w: 64, h: 36, boxes: { ...BOXES, tl: null } });
  assert.equal(root.tokens.get(REGION_TOKENS.tl.on), STAGE_INK.onLight.on);
});

test('墨色兜底：读不到像素就撤回场景墨，只 log 一次', () => {
  const root = fakeRoot();
  const logs: string[] = [];
  const board = createInkBoard(root.write, (m) => logs.push(m));
  board.sample({ px: grid(() => 240), w: 64, h: 36, boxes: BOXES });
  assert.equal(root.tokens.size, INK_REGIONS.length * 3, '每个角三个令牌');

  // 读回失败的两种样子：null（抛了）和全透明（WebGPU 画布那一刻不可读）
  board.sample({ px: null, w: 64, h: 36, boxes: BOXES });
  assert.equal(root.tokens.size, 0, `读不到像素时还留着 ${[...root.tokens.keys()].join(', ')} —— 过期的颜色`);
  board.sample({ px: new Uint8ClampedArray(64 * 36 * 4), w: 64, h: 36, boxes: BOXES });
  assert.equal(root.tokens.size, 0);
  assert.equal(logs.length, 1, `log 了 ${logs.length} 次`);
  assert.equal(board.failures, 2);

  // 读回恢复：重新按像素定边（第一次按交点直接定，不等驻留）
  board.sample({ px: grid(() => 8), w: 64, h: 36, boxes: BOXES });
  assert.equal(root.tokens.get(REGION_TOKENS.tr.on), STAGE_INK.onDark.on);
  assert.equal(board.failures, 0);
});
