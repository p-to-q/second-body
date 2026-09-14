/**
 * `ink-regions.ts` 的那层薄壳：把舞台画布缩进一张小格子，量出四个角的框，交给 board。
 *
 * ## 为什么在 `stage.render()` 里、紧跟着那次绘制
 *
 * WebGPU 画布的内容只在**提交它的那个任务里**可读：这一帧的 current texture
 * 在任务结束、被呈现之后就失效了，之后 `drawImage` 读到的是全透明。
 * 三的 WebGPU 后端在 `renderer.render()` / `post.render()` 里同步 `queue.submit`，
 * 所以 `stage.render()` 返回之前，这一帧就在画布上、而且读得到。
 * 读到全透明时 board 当作读回失败处理（撤回场景墨），不会把"没读到"当成"黑"。
 *
 * ## 画和读分在两帧
 *
 * `drawImage` 必须在渲染的那个任务里（上一段）；`getImageData` 不必。
 * 两个放在同一个任务里时，读回要**等 GPU 把刚提交的这一整帧画完**才拿得到那 64×36 格 ——
 * 无头 Chrome 实测 getImageData 中位 4.6 ms，采样帧 6.7 ms 对普通帧 1.8 ms，
 * 一下子就越过 P5 的每帧 4 ms。挪到下一帧开头的 `tick()` 读时，上一帧早已画完，
 * 剩下的只有格子本身的那次拷贝。格子画进去之后就是 2D 画布自己的内容，不随 WebGPU 那帧失效。
 *
 * ## 代价
 *
 * 不该采样的帧上只有一两次布尔判断。采样那一帧：一次 `drawImage`（缩放在 GPU 上）；
 * 下一帧：一次 64×36 的 `getImageData`、四组 `getBoundingClientRect`。
 * `getImageData` 每次都会新建一个 ImageData —— 平台没有不分配的读法；2 Hz × 9.2 KB，
 * 不在逐帧路径上。实测数写在交付报告与 `docs/10-SURFACES.md`。
 */
import {
  createInkBoard, INK_REGIONS, INK_SAMPLE_HZ, type Box, type InkBoard, type InkRegion,
} from './ink-regions.ts';

/** 格子尺寸。16:9；一格在 1600 宽上是 25px，比角上最小的一行字还细 */
export const INK_GRID_W = 64;
export const INK_GRID_H = 36;

/**
 * 每个角由哪些元素组成。多个匹配取并集。
 * 读数（`.sb-readout`）故意不在：它有自己的底，而且正在另一条线上重做。
 */
export const INK_REGION_SELECTORS: Record<InkRegion, string> = {
  tr: '.sb-corner',
  br: '.sb-exits, .sb-notice--bottom-right',
  bl: '.sb-notice--bottom-left',
  tl: '.sb-see-word',
};

/** `.sb-see-word` 平时是空的（零高），字出现时要已经有墨 —— 空的时候按两行字的高度量 */
const EMPTY_LINE_PX = 40;

/** 连续读不到这么多次就不再试（每次失败的尝试本身也要读一次 GPU） */
const GIVE_UP_AFTER = 8;

export interface InkSampler {
  /** 喂 dt。只累加，不做别的 */
  tick(dt: number): void;
  /** 在把这一帧画到 `canvas` 上的**同一个任务里**调用 */
  afterRender(canvas: HTMLCanvasElement | null | undefined): void;
  dispose(): void;
  readonly board: InkBoard | null;
  readonly samples: number;
  readonly active: boolean;
}

export function createInkSampler(opt: { enabled: boolean; root?: HTMLElement }): InkSampler {
  const idle: InkSampler = {
    tick() {}, afterRender() {}, dispose() {},
    board: null, samples: 0, active: false,
  };
  if (!opt.enabled || typeof document === 'undefined') return idle;

  const root = opt.root ?? document.documentElement;
  const style = root.style;
  let warned = false;
  const warn = (msg: string, e?: unknown): void => {
    if (warned) return;
    warned = true;
    console.warn(msg, e ?? '');
  };
  const board = createInkBoard(
    (token, value) => { if (value === null) style.removeProperty(token); else style.setProperty(token, value); },
    (msg) => warn(msg),
  );

  const grid = document.createElement('canvas');
  grid.width = INK_GRID_W;
  grid.height = INK_GRID_H;
  const ctx = grid.getContext('2d');
  if (!ctx) {
    warn('[stage] 拿不到 2D 上下文 —— 角上的字按场景翻墨');
    return idle;
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'medium';

  const period = 1 / INK_SAMPLE_HZ;
  let acc = period;          // 第一帧就采：字一出现就该有对的墨
  let samples = 0;
  let stopped = false;
  // 采样时复用的框，不在采样路径上 new
  const boxes = {} as Record<InkRegion, Box | null>;
  const scratch = {} as Record<InkRegion, Box>;
  for (const r of INK_REGIONS) { boxes[r] = null; scratch[r] = { x0: 0, y0: 0, x1: 0, y1: 0 }; }

  function measure(canvas: HTMLCanvasElement): boolean {
    const cr = canvas.getBoundingClientRect();
    if (cr.width < 1 || cr.height < 1) return false;
    for (const r of INK_REGIONS) {
      let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
      for (const el of document.querySelectorAll(INK_REGION_SELECTORS[r])) {
        const b = el.getBoundingClientRect();
        if (b.width < 1) continue;
        const bottom = b.height < 1 ? b.top + EMPTY_LINE_PX : b.bottom;
        x0 = Math.min(x0, b.left); y0 = Math.min(y0, b.top);
        x1 = Math.max(x1, b.right); y1 = Math.max(y1, bottom);
      }
      if (!(x1 > x0 && y1 > y0)) { boxes[r] = null; continue; }
      const box = scratch[r];
      box.x0 = (x0 - cr.left) / cr.width; box.x1 = (x1 - cr.left) / cr.width;
      box.y0 = (y0 - cr.top) / cr.height; box.y1 = (y1 - cr.top) / cr.height;
      boxes[r] = box;
    }
    return true;
  }

  /** 上一帧画进了格子、还没读回。读回挪到下一帧开头的 tick，理由见文件头 */
  let drawn = false;
  let source: HTMLCanvasElement | null = null;

  function settle(px: Uint8ClampedArray | null): void {
    board.sample({ px, w: INK_GRID_W, h: INK_GRID_H, boxes });
    if (board.failures >= GIVE_UP_AFTER) {
      stopped = true;
      board.release();
    }
  }

  function read(): void {
    drawn = false;
    let px: Uint8ClampedArray | null = null;
    try {
      if (!source || !measure(source)) return;
      px = ctx.getImageData(0, 0, INK_GRID_W, INK_GRID_H).data;
    } catch (e) {
      warn('[stage] 读画布像素抛了 —— 角上的字退回按场景翻墨（只说这一次）', e);
      px = null;
    }
    settle(px);
  }

  return {
    tick(dt) {
      if (stopped) return;
      if (drawn) read();
      acc += dt;
    },
    afterRender(canvas) {
      if (stopped || drawn || acc < period || !canvas) return;
      acc = 0;
      samples++;
      try {
        ctx.clearRect(0, 0, INK_GRID_W, INK_GRID_H);
        ctx.drawImage(canvas, 0, 0, INK_GRID_W, INK_GRID_H);
        source = canvas;
        drawn = true;
      } catch (e) {
        warn('[stage] 读画布像素抛了 —— 角上的字退回按场景翻墨（只说这一次）', e);
        settle(null);
      }
    },
    dispose() { stopped = true; board.release(); },
    get board() { return board; },
    get samples() { return samples; },
    get active() { return !stopped; },
  };
}
