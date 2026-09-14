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

/** One Euro 的状态，拿出来成一个值：纯函数的控制器（`autoframe.ts` 的 `stepFollow`）要把它存在自己的状态里 */
export interface OneEuroState { x: number; dx: number }

/**
 * One Euro 的一步，**纯函数**。`s` 为 undefined = 第一个样本（原样返回）。
 * 输入不可信时保持上一个值（P2）。`oneEuro()` 那个带闭包的版本就是它包一层 —— 两份数学不许各写各的。
 */
export function oneEuroStep(s: OneEuroState | undefined, value: number, dtIn: number, p: OneEuroParams = {}): OneEuroState {
  if (!Number.isFinite(value)) return s ?? { x: 0, dx: 0 };
  if (!s) return { x: value, dx: 0 };
  const dt = Number.isFinite(dtIn) && dtIn > 0 ? dtIn : 1 / 60;
  const ad = alphaOf(p.dCutoff ?? 1.0, dt);
  const dx = ad * ((value - s.x) / dt) + (1 - ad) * s.dx;
  const a = alphaOf((p.minCutoff ?? 1.0) + (p.beta ?? 0.02) * Math.abs(dx), dt);
  return { x: a * value + (1 - a) * s.x, dx };
}

export function oneEuro(p: OneEuroParams = {}): Scalar1D {
  let st: OneEuroState | undefined;
  const f = ((value: number, dt: number): number => {
    if (!Number.isFinite(value)) return st?.x ?? 0;          // P2：输入不可信
    st = oneEuroStep(st, value, dt, p);
    return st.x;
  }) as Scalar1D;

  f.reset = () => { st = undefined; };
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
