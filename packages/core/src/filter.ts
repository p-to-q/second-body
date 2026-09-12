/**
 * One Euro Filter —— 低延迟去抖。
 * 为什么不是 lerp：lerp 在快动作时会引入明显滞后（"跟不上手"），
 * One Euro 在快动作时自动抬高截止频率，慢/静止时压低，两头都对。
 * 参考: Casiez et al., CHI 2012。
 */

export interface OneEuroParams {
  /** 静止时的截止频率(Hz)。越小越稳越滞后 */
  minCutoff?: number;
  /** 速度对截止频率的增益。越大越跟手、越抖 */
  beta?: number;
  /** 速度本身的平滑截止频率 */
  dCutoff?: number;
}

const alphaOf = (cutoff: number, dt: number): number => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

export interface Scalar1D {
  (value: number, dt: number): number;
  reset(): void;
}

export function oneEuro(p: OneEuroParams = {}): Scalar1D {
  const minCutoff = p.minCutoff ?? 1.0;
  const beta = p.beta ?? 0.02;
  const dCutoff = p.dCutoff ?? 1.0;
  let xPrev: number | null = null;
  let dxPrev = 0;

  const f = ((value: number, dt: number): number => {
    if (!Number.isFinite(value)) return xPrev ?? 0;          // P2：输入不可信
    if (!Number.isFinite(dt) || dt <= 0) dt = 1 / 60;
    if (xPrev === null) { xPrev = value; return value; }
    const dx = (value - xPrev) / dt;
    const ad = alphaOf(dCutoff, dt);
    dxPrev = ad * dx + (1 - ad) * dxPrev;
    const cutoff = minCutoff + beta * Math.abs(dxPrev);
    const a = alphaOf(cutoff, dt);
    xPrev = a * value + (1 - a) * xPrev;
    return xPrev;
  }) as Scalar1D;

  f.reset = () => { xPrev = null; dxPrev = 0; };
  return f;
}

export interface Vec3Filter {
  (v: readonly number[], dt: number): [number, number, number];
  reset(): void;
}

export function oneEuroVec3(p: OneEuroParams = {}): Vec3Filter {
  const fs = [oneEuro(p), oneEuro(p), oneEuro(p)];
  const f = ((v: readonly number[], dt: number) =>
    [fs[0](v[0], dt), fs[1](v[1], dt), fs[2](v[2], dt)] as [number, number, number]) as Vec3Filter;
  f.reset = () => fs.forEach((x) => x.reset());
  return f;
}

/** 帧率无关的指数滑动平均系数：a = 1 - e^(-dt/τ)。全项目统一用这个，不要用固定系数。 */
export const emaAlpha = (dt: number, tau: number): number =>
  tau <= 0 ? 1 : 1 - Math.exp(-Math.max(0, dt) / tau);

/** 滑动中位数（骨长稳定化用）。窗口小、调用频繁，直接排序拷贝即可。 */
export function rollingMedian(size: number) {
  const buf: number[] = [];
  return {
    push(v: number): number {
      if (Number.isFinite(v)) { buf.push(v); if (buf.length > size) buf.shift(); }
      if (!buf.length) return v;
      const s = [...buf].sort((a, b) => a - b);
      const m = s.length >> 1;
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    },
    get count() { return buf.length; },
    reset() { buf.length = 0; },
  };
}
