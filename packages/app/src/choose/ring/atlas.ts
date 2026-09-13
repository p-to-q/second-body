/**
 * 把卡片图拼成**一张**图集。
 *
 * 为什么必须拼：整个环是一个片元着色器里的距离场，一个 draw call ——
 * 循环里"这是第几张卡"是运行时才知道的，而着色器不能用一个变下标去索引一组采样器。
 * 所以要么一张图集，要么每张卡一个 pass。上游选了图集，理由对我们同样成立。
 *
 * ## 尺寸是**建的时候就定死的**，之后只重画不重建
 *
 * 这是整个文件唯一需要解释的设计。换一张新贴图对象意味着材质里的节点树变了，
 * 于是整条渲染管线要重编译 —— 那在 WebGPU 上是一次肉眼可见的卡顿，
 * 而它偏偏会发生在展签还立着、环已经在背后转的时候。
 * 所以：格子数按 `MAX_PLANES` 的上限一次开好，卡片到货只是**往同一张画布上重画**
 * 加一个 `needsUpdate`。贴图对象自始至终是同一个。
 *
 * 代价是格子的宽高比也定死了（2:1，和 `choose/cards.ts` 画出来的卡一致）。
 * 将来卡片换了比例，改的是这里的两个常量和那边的两个常量，
 * 而不是"运行时自适应" —— 自适应在这里买不到任何东西，只会买回那次重编译。
 */
import * as THREE from 'three/webgpu';

/** 单格 px。卡片在 4K 屏上撑满也不到这个宽度，再高只是浪费显存 */
const CELL_W = 512;
const CELL_H = 256;

/** 格子的宽高比。环的几何跟着它走 —— 见文件头 */
export const CELL_ASPECT = CELL_W / CELL_H;

export interface Atlas {
  texture: THREE.CanvasTexture;
  /** 横向、纵向各几格。着色器用它把局部 uv 换算成图集 uv */
  grid: THREE.Vector2;
  /** 重画。卡片少于格子数时，多出来的格子留着上一次的内容（着色器不会取到它们） */
  paint(cards: HTMLCanvasElement[]): void;
  dispose(): void;
}

export function createAtlas(capacity: number): Atlas {
  const cols = Math.max(1, Math.ceil(Math.sqrt(capacity)));
  const rows = Math.max(1, Math.ceil(capacity / cols));

  const canvas = document.createElement('canvas');
  canvas.width = cols * CELL_W;
  canvas.height = rows * CELL_H;
  const ctx = canvas.getContext('2d')!;
  // 空格子不能是透明的：着色器夹紧 uv 之后仍可能取到格子最边上的那一列，
  // 透明会读成一个黑洞。填成页面底色，读起来就只是"那里没有卡"。
  ctx.fillStyle = '#0e0f12';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // 不生成 mipmap 是**故意的**：相邻两个像素可能落在图集的不同格子上，
  // 那一步的导数会让自动 mip 选到最粗的一层，于是格子边界上出现一圈糊。
  // 单格本来就已经缩到 512，没有 mip 也不会闪。
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  return {
    texture,
    grid: new THREE.Vector2(cols, rows),
    paint(cards) {
      cards.slice(0, cols * rows).forEach((card, i) => {
        const x = (i % cols) * CELL_W;
        const y = Math.floor(i / cols) * CELL_H;
        // cover-fit：格子一定被填满，图按短边裁。卡片本来就是 2:1，
        // 这一步平时是恒等的 —— 它存在只是为了以后换了比例也不会变形。
        const s = Math.max(CELL_W / card.width, CELL_H / card.height);
        const w = card.width * s;
        const h = card.height * s;
        ctx.drawImage(card, x + (CELL_W - w) / 2, y + (CELL_H - h) / 2, w, h);
      });
      texture.needsUpdate = true;
    },
    dispose: () => texture.dispose(),
  };
}
