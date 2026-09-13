/**
 * 卡片图 —— 环上那一张图是怎么来的。
 *
 * 三条来源，按这个顺序：
 *   1. `/refs/<id>/_anchor.png`        我们自己渲的主题参考图，版权自有（docs/12 §3）
 *   2. 程序化「场」卡片                 source === 'procedural' 的条目（field）
 *   3. 程序化「空位」卡片               还没生成、但库里已有部件的条目
 * 一张参考作品的图片或字体都没有用 —— 它们不在 MIT 范围内（见 docs/35-VISCOSE.md）。
 *
 * 每张卡片都先合成到一张 2:1 的 canvas 上，因为角标（guest / character）要画在
 * **卡片上**而不是浮在 DOM 里 —— 它得跟着卡片一起被融化、被拉丝、被吞掉。
 */
import type { Rng, ThemeDef } from '../../../core/src/types.ts';

/** 2:1。图集的格子也是这个比例（`ring/atlas.ts` 的 CELL_ASPECT），改一边就要改另一边 */
export const CARD_W = 1024;
export const CARD_H = 512;

/** 一张图最多等这么久。等不到就退到程序化卡片，不让开场停在黑屏上。 */
const IMAGE_TIMEOUT_MS = 4000;

/** 加载一张图。永远不抛异常、永远会结束 —— 失败就是 null。 */
export function loadImage(url: string, timeoutMs = IMAGE_TIMEOUT_MS): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    let done = false;
    const finish = (value: HTMLImageElement | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    img.onload = () => finish(img);
    img.onerror = () => finish(null);
    img.src = url;
  });
}

function newCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0b0b0c';
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  return { canvas, ctx };
}

/** cover-fit：卡片一定被填满，图按短边裁。 */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement): void {
  const scale = Math.max(CARD_W / img.width, CARD_H / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (CARD_W - w) / 2, (CARD_H - h) / 2, w, h);
}

/**
 * 「场」：没有身体，只有关节球和它们之间的张力线（docs/14 §2 field）。
 * 全部随机来自传入的 Rng —— 同一个 seed 每次画出同一张卡。
 */
function drawField(ctx: CanvasRenderingContext2D, rng: Rng): void {
  const joints: Array<{ x: number; y: number; r: number }> = [];
  const count = 16;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    joints.push({
      x: CARD_W * (0.08 + t * 0.84) + (rng.next() - 0.5) * 40,
      y: CARD_H * (0.5 + Math.sin(t * Math.PI * 1.6) * 0.26) + (rng.next() - 0.5) * 30,
      r: 3 + rng.next() * 9,
    });
  }
  ctx.lineWidth = 1;
  for (let i = 0; i < joints.length; i++) {
    for (let j = i + 1; j < joints.length; j++) {
      const a = joints[i];
      const b = joints[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 220) continue;
      ctx.strokeStyle = `rgba(210,220,230,${(1 - d / 220) * 0.5})`;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  for (const j of joints) {
    ctx.fillStyle = 'rgba(240,244,248,0.92)';
    ctx.beginPath();
    ctx.arc(j.x, j.y, j.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * 「还没长出来的那个」：有条目、有部件，但还没渲 anchor 图。
 * 画一块空盘子而不是破图 —— 观众看到的是"这里将来有东西"，不是 404。
 */
function drawAbsent(ctx: CanvasRenderingContext2D, rng: Rng): void {
  const inset = 48;
  ctx.strokeStyle = 'rgba(190,200,210,0.55)';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 12]);
  ctx.strokeRect(inset, inset, CARD_W - inset * 2, CARD_H - inset * 2);
  ctx.setLineDash([]);
  // 稀疏的抖动点，和后期的 Bayer 网格是同一种语言。
  // 亮度要够看得出"这里有一张卡"，又不能和真的 anchor 图抢眼。
  for (let i = 0; i < 1100; i++) {
    const x = inset + rng.next() * (CARD_W - inset * 2);
    const y = inset + rng.next() * (CARD_H - inset * 2);
    ctx.fillStyle = `rgba(214,222,230,${0.14 + rng.next() * 0.42})`;
    ctx.fillRect(Math.floor(x / 6) * 6, Math.floor(y / 6) * 6, 5, 5);
  }
}

/**
 * kind 角标。**只给 archetype 以外的条目画** —— 不是筛选器，只是让人知道
 * 自己在看的是一个机器人物种、一位嘉宾，还是一个角色（docs/14 §1）。
 * 画得很轻：观众第一眼该看见的是那具身体。
 */
function drawKindBadge(ctx: CanvasRenderingContext2D, kind: ThemeDef['kind']): void {
  if (kind === 'archetype') return;
  const label = kind.toUpperCase();
  ctx.font = '500 20px ui-monospace, SFMono-Regular, Menlo, monospace';
  const textWidth = ctx.measureText(label).width + 12 * 2 + label.length * 2;
  const w = Math.ceil(textWidth);
  const h = 40;
  const x = CARD_W - w - 28;
  const y = 28;
  ctx.fillStyle = 'rgba(10,10,12,0.55)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(235,238,242,0.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = 'rgba(235,238,242,0.85)';
  ctx.textBaseline = 'middle';
  // 手动字距，canvas 没有 letter-spacing
  let cx = x + 12;
  for (const ch of label) {
    ctx.fillText(ch, cx, y + h / 2 + 1);
    cx += ctx.measureText(ch).width + 2;
  }
}

export type CardKind = 'anchor' | 'field' | 'absent';

export interface BuiltCard {
  theme: ThemeDef;
  /**
   * 合成好的那张 2D canvas。**交出去的是画布，不是贴图**：
   * 环把所有卡片拼进同一张图集（`ring/atlas.ts`），贴图只有那一张，
   * 由环自己拥有。这里再造一个 `CanvasTexture` 不但没人用，还会把
   * three 的 WebGL 构建拖进这一页的包里（我们用的是 `three/webgpu`）。
   */
  canvas: HTMLCanvasElement;
  /** 这张卡的图是从哪来的 —— 报告和 dev 页面用 */
  from: CardKind;
}

/** 合成一张卡。不发网络请求：图已经由调用者加载好（或者没有）。 */
export function buildCard(theme: ThemeDef, image: HTMLImageElement | null, rng: Rng): BuiltCard {
  const { canvas, ctx } = newCanvas();
  let from: CardKind;
  if (image) {
    drawCover(ctx, image);
    from = 'anchor';
  } else if (theme.source === 'procedural') {
    drawField(ctx, rng);
    from = 'field';
  } else {
    drawAbsent(ctx, rng);
    from = 'absent';
  }
  drawKindBadge(ctx, theme.kind);
  return { theme, canvas, from };
}
