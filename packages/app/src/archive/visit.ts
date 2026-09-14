/**
 * 前端这一半：**一次走完的相遇，往存档里写一行。**
 *
 * ## 什么时候写
 *
 * 弧线走完的那一帧（`ArcState.held` 第一次为真），一次，不再写第二次。
 * 不是每一乐章写一次，也不是关页面时抢救一次 —— 两条都是裁定：
 *
 * - `docs/43 §7.1` 第 1 条：**写出去发生在一次相遇的尽头，不在中途。**
 *   一次失败只毁一条记录；流式写会让一次网络抖动在九十秒里重试三十次，
 *   而每一次重试都在和快回路抢主线程。
 * - `§9.7`：**关掉页面的那一次不救。** `navigator.sendBeacon` 能救回半途离开的
 *   那一条，代价是存档里混进不完整的相遇 —— 存档的每一条都该是一次**完成的**相遇。
 *   这是策展判断，不是技术判断，所以这个文件里没有 `sendBeacon`，
 *   `test/archive.test.ts` 会扫这个目录钉住它。
 *
 * ## 它绝不许弄坏这件作品
 *
 * `docs/02` P10「演出优先」：慢回路是唯一的网络依赖例外，存档是**第二个**，
 * 所以它逐字照抄慢回路那一套纪律（`docs/17 §8`）：
 *
 * 1. **帧循环里只有一次 boolean 比较。** 网络在 `requestIdleCallback` 里。
 * 2. **任何失败 = 静默关掉，本次会话不再尝试。** 含超时、404、5xx、断网。
 * 3. **404 是正常答案**，不是错误：某些部署上这条回路不存在。
 * 4. **降级必须静默**（`docs/26 §F`：给失败配音效等于告诉全场它坏了）。
 *    观众不该知道存档写失败了；`?debug=1` 的 HUD 里那一行就够。
 */

/** 超时。和慢回路的取件超时同一个量级 —— 它只是"别挂着"，不是"要快" */
const TIMEOUT_MS = 5000;

export type VisitPhase =
  /** 还没走完这条弧线 */
  | 'idle'
  /** 正在写 */
  | 'writing'
  /** 写成功了，这一场结束 */
  | 'kept'
  /** 关掉了：失败过一次，或这一场本来就不该写 */
  | 'off';

export interface VisitReporter {
  /** 帧循环里调。一次 boolean 比较，别的什么都不做 */
  note(held: boolean): void;
  /** 给 `?debug=1` 的 HUD 读。**不进任何面向观众的页面** */
  readonly phase: VisitPhase;
  /** 落下去的那一条的序号，没有就是 null */
  readonly n: number | null;
}

export interface VisitOptions {
  /** 观众选的物种。没有就不写 —— 一条记不清物种的记录在这一档里等于没有内容 */
  species: string | null;
  /**
   * 这一场算不算数。`?demo=1` 和入口层的回放都不算：
   * 一段录像走完弧线不是一次相遇，把它写进存档等于给厚度掺水。
   */
  live: boolean;
  /** 测试用的注入口。生产路径上就是 `fetch` */
  fetch?: typeof globalThis.fetch;
  /** 测试用：把"等空闲"折成立刻执行 */
  idle?: (fn: () => void) => void;
}

const defaultIdle = (fn: () => void): void => {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
  if (ric) ric(fn); else setTimeout(fn, 0);
};

export function createVisitReporter(opt: VisitOptions): VisitReporter {
  const doFetch = opt.fetch ?? globalThis.fetch?.bind(globalThis);
  const idle = opt.idle ?? defaultIdle;

  // 不该写的三种情况在这里一次判完，之后 `note()` 就只剩一个比较
  let phase: VisitPhase = (!opt.live || !opt.species || !doFetch) ? 'off' : 'idle';
  let n: number | null = null;

  const write = async (species: string): Promise<void> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await doFetch!('/api/visit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ species }),
        signal: ctrl.signal,
      });
      // 404 = 这个部署上没有这条回路。和别的失败归成同一个出口：
      // 对观众来说它们是同一件事（什么都没发生），而这一页不需要知道是哪一种
      if (!res.ok) { phase = 'off'; return; }
      const j = (await res.json()) as { ok?: boolean; entry?: { n?: unknown } };
      n = typeof j?.entry?.n === 'number' ? j.entry.n : null;
      phase = j?.ok === true ? 'kept' : 'off';
    } catch {
      phase = 'off';
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    note(held) {
      if (phase !== 'idle' || !held) return;
      phase = 'writing';
      const species = opt.species as string;
      idle(() => { void write(species); });
    },
    get phase() { return phase; },
    get n() { return n; },
  };
}
