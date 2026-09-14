/**
 * 角上的字，**按它底下真正的像素**翻墨。纯逻辑，不碰 DOM、不碰 three —— node 里量得住。
 *
 * ## 为什么不再只按场景翻
 *
 * `stageInk(look)` 读的是 `look.skyTop`：一套场景一个数。可是角底下的东西会变 ——
 * 身体（和它背后那团晕）会从角底下走过去，弧线在改灯，场景会中途换，取景在跟着人走。
 * 一个"每场一个数"的输入**结构上**跟不上这些。所以这里量的是渲染出来的那一帧：
 * `ink-sampler.ts` 把画布缩到一张小格子里，这个文件把格子变成每个角各自的一套墨。
 *
 * 场景那一份（`stageInk`）没有删：它是**兜底**。读不到像素的时候（WebGPU 画布那一刻
 * 不可读、`?gl=off`、抛了异常），各角的令牌被撤掉，CSS 退回到全局的 `--sb-on-stage`。
 *
 * ## 滞回带是算出来的，不是挑的
 *
 * `INK_FLIP_LUMA` 那段注释里的交点：两套墨对比度相等处 `(L+0.05)² = (L浅+0.05)(L深+0.05)`。
 * 用 `STAGE_INK` 的两个颜色**当场算**（不抄数：那段注释原来写 0.166，喂错了亮度），
 * L ≈ 0.176。这里取的带是**两套墨都还过 WCAG 大字号 3:1 的那一段**：
 *   - 浅墨在底亮度 ≤ (L浅+0.05)/3 − 0.05 ≈ 0.224 时仍 ≥ 3:1
 *   - 深墨在底亮度 ≥ 3·(L深+0.05) − 0.05 ≈ 0.136 时仍 ≥ 3:1
 * 在带里**不翻**，代价最多是掉到 3:1，不会更低。而这条带在 (L+0.05) 的对数尺度上
 * 正好以交点为中心（两端之积 = 交点的平方）—— 同一条公式的两面，不是另立的数。
 */
import { STAGE_INK, srgbToLinear, type StageInk } from './look.ts';

export type InkSide = 'onDark' | 'onLight';

/** 四个会压在画布上的角。readout（左下那块读数）不在里面：它有自己的底 */
export const INK_REGIONS = ['tr', 'br', 'bl', 'tl'] as const;
export type InkRegion = typeof INK_REGIONS[number];

/**
 * 每个角发布的三个令牌。**写成字面量**，不用模板拼：
 * `test/css-tokens.test.ts` 要逐个核对它们在 CSS 里有缺省值、首屏翻了、组件取用了。
 */
export const REGION_TOKENS: Record<InkRegion, { on: string; dim: string; strong: string }> = {
  tr: { on: '--sb-on-stage-tr', dim: '--sb-on-stage-dim-tr', strong: '--sb-ink-strong-tr' },
  br: { on: '--sb-on-stage-br', dim: '--sb-on-stage-dim-br', strong: '--sb-ink-strong-br' },
  bl: { on: '--sb-on-stage-bl', dim: '--sb-on-stage-dim-bl', strong: '--sb-ink-strong-bl' },
  tl: { on: '--sb-on-stage-tl', dim: '--sb-on-stage-dim-tl', strong: '--sb-ink-strong-tl' },
};

/** `#rgb` / `#rrggbb` → 相对亮度（线性，Rec.709 = WCAG） */
export function hexLuma(hex: string): number {
  const s = hex.length === 4
    ? [hex[1] + hex[1], hex[2] + hex[2], hex[3] + hex[3]]
    : [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)];
  const [r, g, b] = s.map((h) => srgbToLinear(parseInt(h, 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const L_PALE = hexLuma(STAGE_INK.onDark.on);
const L_DEEP = hexLuma(STAGE_INK.onLight.on);

/** 两套墨对比度相等的底亮度（≈ 0.166） */
export const INK_CROSSOVER = Math.sqrt((L_PALE + 0.05) * (L_DEEP + 0.05)) - 0.05;

/** 滞回带：底亮度 > hi 才考虑换深墨，< lo 才考虑换浅墨。推导见文件头 */
export const INK_BAND = {
  lo: 3 * (L_DEEP + 0.05) - 0.05,
  hi: (L_PALE + 0.05) / 3 - 0.05,
} as const;

/**
 * 采样率与驻留。⚠️ 这两个是旋钮，**本该住在 `tuning.ts`**；那是冻结契约，
 * 已在交付报告里提"需要变更契约"。在搬过去之前这里是唯一一份。
 *
 * 2 Hz：一次采样要读回一次 GPU，代价在 `ink-sampler.ts` 的头上记着实测值。
 * 驻留 2 次：越过带边之后要**连续两次**都在外面才翻 —— 一条胳膊扫过角落大约
 * 0.3 s，在 2 Hz 下至多压中一次，于是不翻；一个真正站过来的人会连续压中。
 */
export const INK_SAMPLE_HZ = 2;
export const INK_DWELL_SAMPLES = 2;

/** 8 位 sRGB → 线性。256 格查表，采样时不做 pow */
export const SRGB8_TO_LINEAR: Float32Array = (() => {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++) t[i] = srgbToLinear(i / 255);
  return t;
})();

/** 归一化的框（0..1，相对画布；y 向下） */
export interface Box { x0: number; y0: number; x1: number; y1: number }

/**
 * RGBA 格子（`getImageData` 的原样）里，一个框底下的**平均相对亮度**。
 * 框外、全透明（= 读回失败的样子）返回 NaN —— "不知道"不许被当成"黑"。
 */
export function regionLuma(px: ArrayLike<number>, w: number, h: number, box: Box): number {
  const cx0 = Math.max(0, Math.floor(box.x0 * w));
  const cy0 = Math.max(0, Math.floor(box.y0 * h));
  const cx1 = Math.min(w, Math.ceil(box.x1 * w));
  const cy1 = Math.min(h, Math.ceil(box.y1 * h));
  let sum = 0;
  let n = 0;
  for (let y = cy0; y < cy1; y++) {
    for (let x = cx0; x < cx1; x++) {
      const i = (y * w + x) * 4;
      if (px[i + 3] === 0) continue;
      sum += 0.2126 * SRGB8_TO_LINEAR[px[i]] + 0.7152 * SRGB8_TO_LINEAR[px[i + 1]]
        + 0.0722 * SRGB8_TO_LINEAR[px[i + 2]];
      n++;
    }
  }
  return n > 0 ? sum / n : NaN;
}

/** 整张格子有没有一个不透明的像素。全透明 = WebGPU 画布那一刻不可读 */
export function gridReadable(px: ArrayLike<number>): boolean {
  for (let i = 3; i < px.length; i += 4) if (px[i] !== 0) return true;
  return false;
}

export interface InkTracker {
  readonly side: InkSide | null;
  /** 喂一次亮度。NaN = 这一次没量到，状态不动 */
  step(luma: number): InkSide | null;
  reset(): void;
}

/** 一个角的滞回 + 驻留。第一次量到时按交点直接定边，之后只在越带且驻留够了才翻 */
export function createInkTracker(
  band: { lo: number; hi: number } = INK_BAND,
  dwell = INK_DWELL_SAMPLES,
  crossover = INK_CROSSOVER,
): InkTracker {
  let side: InkSide | null = null;
  let pending = 0;
  return {
    get side() { return side; },
    step(l) {
      if (!Number.isFinite(l)) return side;
      if (side === null) {
        side = l < crossover ? 'onDark' : 'onLight';
        pending = 0;
        return side;
      }
      const outside = side === 'onDark' ? l > band.hi : l < band.lo;
      pending = outside ? pending + 1 : 0;
      if (pending >= Math.max(1, dwell)) {
        side = side === 'onDark' ? 'onLight' : 'onDark';
        pending = 0;
      }
      return side;
    },
    reset() { side = null; pending = 0; },
  };
}

export const inkOf = (side: InkSide): StageInk => STAGE_INK[side];

/** 往根上写 / 撤一个令牌。value 为 null = 撤掉，CSS 退回全局那一份 */
export type TokenWriter = (token: string, value: string | null) => void;

export interface InkBoardSample {
  /** 缩小后的画布像素；null = 这一次读不到（抛了、全透明、上下文拿不到） */
  px: ArrayLike<number> | null;
  w: number;
  h: number;
  /** 每个角此刻在画布上的框；null = 这个角现在没有东西（元素不在 / 零尺寸） */
  boxes: Record<InkRegion, Box | null>;
}

export interface InkBoard {
  sample(s: InkBoardSample): void;
  /** 全部撤回场景墨 */
  release(): void;
  readonly state: Record<InkRegion, { luma: number; side: InkSide | null }>;
  readonly failures: number;
}

/**
 * 四个角各一个 tracker，**互不相干**。只在某个角换边时写 DOM，不是每次采样都写。
 *
 * 读不到像素的那一次：立刻把所有角撤回场景墨（绝不留一个过期的颜色），
 * 只 log 一次。角"没有东西"（null 框）时保持原状 —— 那不是失败，只是字暂时不在。
 */
export function createInkBoard(write: TokenWriter, log: (msg: string) => void = () => {}): InkBoard {
  const trackers = {} as Record<InkRegion, InkTracker>;
  const state = {} as Record<InkRegion, { luma: number; side: InkSide | null }>;
  const shown = {} as Record<InkRegion, InkSide | null>;
  for (const r of INK_REGIONS) {
    trackers[r] = createInkTracker();
    state[r] = { luma: NaN, side: null };
    shown[r] = null;
  }
  let failures = 0;
  let logged = false;

  const release = (): void => {
    for (const r of INK_REGIONS) {
      trackers[r].reset();
      state[r].side = null;
      state[r].luma = NaN;
      if (shown[r] !== null) {
        const t = REGION_TOKENS[r];
        write(t.on, null); write(t.dim, null); write(t.strong, null);
        shown[r] = null;
      }
    }
  };

  return {
    sample(s) {
      if (!s.px || !gridReadable(s.px)) {
        failures++;
        if (!logged) {
          logged = true;
          log('[stage] 读不到画布像素 —— 角上的字退回按场景翻墨（只说这一次）');
        }
        release();
        return;
      }
      failures = 0;
      for (const r of INK_REGIONS) {
        const box = s.boxes[r];
        if (!box) continue;
        const l = regionLuma(s.px, s.w, s.h, box);
        state[r].luma = l;
        const side = trackers[r].step(l);
        state[r].side = side;
        if (side !== null && side !== shown[r]) {
          const ink = inkOf(side);
          const t = REGION_TOKENS[r];
          write(t.on, ink.on); write(t.dim, ink.dim); write(t.strong, ink.strong);
          shown[r] = side;
        }
      }
    },
    release,
    get state() { return state; },
    get failures() { return failures; },
  };
}
