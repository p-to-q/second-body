/**
 * 帧循环外壳。P2：**帧循环里永不抛异常。**
 *
 * 现场最糟的失败不是画面难看，是白屏 + 一个观众站在那里不知道发生了什么。
 * 所以这里的策略是：一帧出错 → 记下来 → 继续下一帧；连续出错才降级；永不中断 rAF。
 */
import { TIME } from '../../../core/src/tuning.ts';
import { degrade, type DegradeStage } from './degrade.ts';
import { idleState } from './idle.ts';

export interface FrameStats {
  fps: number;
  /** 本帧 JS 耗时（ms，EMA） */
  cpuMs: number;
  frames: number;
  errors: number;
  lastError: string | null;
  /** 连续出错次数。达到阈值会触发 onDegrade */
  consecutiveErrors: number;
  /** 已经降到第几级（null = 没降级）。见 shell/degrade.ts */
  degraded: DegradeStage | null;
  /** 正在无人降帧（见 shell/idle.ts） */
  throttled: boolean;
}

export interface SafeFrameOptions {
  /** 连续这么多帧出错就降一级（默认 30）。再连续错这么多帧就再降一级 */
  degradeAfter?: number;
  /**
   * 覆盖降级动作。**不传就走 `shell/degrade.ts` 的三级阶梯**
   * （关后期 → 占位几何 → 重载），这是现场想要的默认值：
   * 收口的 main.ts 不传任何东西也能得到真的降级，而不是一行日志。
   */
  onDegrade?: (stats: FrameStats) => void;
  /** 每个错误最多打印一次同样的消息，避免刷屏 */
  onError?: (err: unknown, stats: FrameStats) => void;
  /** 关掉无人降帧（dev 页面/性能测量时用） */
  noIdleThrottle?: boolean;
}

export interface FrameLoop {
  start(): void;
  stop(): void;
  readonly stats: FrameStats;
}

/**
 * @param tick 每帧回调。dt 已经钳进 TIME 范围 —— 切标签页回来会给出几秒的 dt，
 *             不钳会把所有状态机一次性冲飞。
 */
export function createFrameLoop(
  tick: (dt: number, tMs: number) => void,
  opt: SafeFrameOptions = {},
): FrameLoop {
  const degradeAfter = opt.degradeAfter ?? 30;
  const stats: FrameStats = {
    fps: 0, cpuMs: 0, frames: 0, errors: 0, lastError: null,
    consecutiveErrors: 0, degraded: null, throttled: false,
  };
  const seen = new Set<string>();
  let raf = 0;
  let last = 0;
  // 第一帧没有"上一帧"。用独立的标志位而不是 `last === 0`：
  // rAF 的时间戳真的可能是 0，那时 falsy 判断会把第一帧之后的节流也一起吃掉。
  let primed = false;

  const frame = (tMs: number) => {
    raf = requestAnimationFrame(frame);

    // 无人 N 分钟 → 降到 IDLE.fps。跳掉的帧不更新 last，dt 因此仍然是真实间隔。
    // 注意只降**渲染**：推理和回放各有自己的循环，那部分的功耗不在这里管。
    if (!opt.noIdleThrottle) {
      const idle = idleState();
      stats.throttled = idle.throttled;
      if (idle.throttled && primed && tMs - last < 1000 / idle.fps) return;
    }

    const rawDt = primed ? (tMs - last) / 1000 : 1 / 60;
    last = tMs;
    primed = true;
    const dt = Math.min(Math.max(rawDt, TIME.dtMin), TIME.dtMax);
    // fps 用未钳的真实间隔算，否则读数会骗人
    const instFps = rawDt > 0 ? 1 / rawDt : 0;
    stats.fps += (instFps - stats.fps) * 0.1;

    const t0 = performance.now();
    try {
      tick(dt, tMs);
      stats.consecutiveErrors = 0;
    } catch (err) {
      stats.errors++;
      stats.consecutiveErrors++;
      const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
      stats.lastError = msg.split('\n')[0];
      if (!seen.has(stats.lastError)) {      // 同一条只吼一次，别刷屏
        seen.add(stats.lastError);
        console.error('[frame]', msg);
      }
      opt.onError?.(err, stats);
      // 每再连续错 degradeAfter 帧就再降一级：上一级没救回来，才轮到下一级。
      if (stats.consecutiveErrors % degradeAfter === 0) {
        console.error(`[frame] 连续 ${stats.consecutiveErrors} 帧出错，降级`);
        if (opt.onDegrade) opt.onDegrade(stats);
        else stats.degraded = degrade(stats.lastError) ?? stats.degraded;
      }
    }
    stats.cpuMs += (performance.now() - t0 - stats.cpuMs) * 0.1;
    stats.frames++;
  };

  return {
    start() { if (!raf) { last = 0; primed = false; raf = requestAnimationFrame(frame); } },
    stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } },
    get stats() { return stats; },
  };
}
