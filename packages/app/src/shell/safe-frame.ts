/**
 * 帧循环外壳。P2：**帧循环里永不抛异常。**
 *
 * 现场最糟的失败不是画面难看，是白屏 + 一个观众站在那里不知道发生了什么。
 * 所以这里的策略是：一帧出错 → 记下来 → 继续下一帧；连续出错才降级；永不中断 rAF。
 */
import { TIME } from '../../../core/src/tuning.ts';

export interface FrameStats {
  fps: number;
  /** 本帧 JS 耗时（ms，EMA） */
  cpuMs: number;
  frames: number;
  errors: number;
  lastError: string | null;
  /** 连续出错次数。达到阈值会触发 onDegrade */
  consecutiveErrors: number;
}

export interface SafeFrameOptions {
  /** 连续这么多帧出错就调 onDegrade（默认 30） */
  degradeAfter?: number;
  onDegrade?: (stats: FrameStats) => void;
  /** 每个错误最多打印一次同样的消息，避免刷屏 */
  onError?: (err: unknown, stats: FrameStats) => void;
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
  const stats: FrameStats = { fps: 0, cpuMs: 0, frames: 0, errors: 0, lastError: null, consecutiveErrors: 0 };
  const seen = new Set<string>();
  let raf = 0;
  let last = 0;
  let degraded = false;

  const frame = (tMs: number) => {
    raf = requestAnimationFrame(frame);

    const rawDt = last ? (tMs - last) / 1000 : 1 / 60;
    last = tMs;
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
      if (!degraded && stats.consecutiveErrors >= degradeAfter) {
        degraded = true;
        console.error(`[frame] 连续 ${degradeAfter} 帧出错，降级`);
        opt.onDegrade?.(stats);
      }
    }
    stats.cpuMs += (performance.now() - t0 - stats.cpuMs) * 0.1;
    stats.frames++;
  };

  return {
    start() { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } },
    stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } },
    get stats() { return stats; },
  };
}
