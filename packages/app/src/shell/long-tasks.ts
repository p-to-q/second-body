/**
 * 长任务计数（> 50ms 的主线程任务，PerformanceObserver `longtask`）—— 帧调速器的第二个输入。
 *
 * 为什么帧间隔之外还要它：一次 7 秒的冻结（docs/48 §2，MediaPipe 建图）在帧间隔上
 * 只是**一个**样本，而调速器把单个超大间隔当成"切回前台"丢掉（那才是它的常态）。
 * 长任务是浏览器自己报的"主线程被占住了"，两者分得开。
 *
 * 不支持的浏览器（Safari）上它恒为 0：调速器只剩帧间隔一个输入，照样能工作。
 */
export interface LongTaskCounter {
  /** 上次 take() 以来出现了几个长任务 */
  take(): number;
  dispose(): void;
}

export function createLongTaskCounter(): LongTaskCounter {
  let n = 0;
  let obs: PerformanceObserver | null = null;
  try {
    if (typeof PerformanceObserver !== 'undefined'
      && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      obs = new PerformanceObserver((list) => { n += list.getEntries().length; });
      obs.observe({ type: 'longtask' });
    }
  } catch { obs = null; }
  return {
    take() { const k = n; n = 0; return k; },
    dispose() { obs?.disconnect(); obs = null; },
  };
}
