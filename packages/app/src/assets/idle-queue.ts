/**
 * 空闲切片队列（docs/48 §10）。把"迟早要做、但不必在帧循环里做"的活挪进浏览器空闲时间。
 *
 * 为什么需要：升档 / 替换那一帧里，帧循环在现做只依赖已到货几何的活 —— 例如左侧肢体的
 * 预镜像副本（`library.mirrored()` 懒建）。实测升档 2→3 那一帧 255ms（B-prof2），栈里就有它。
 * 这些活的结果和"什么时候做"无关，所以在几何到货之后的空闲里做掉，帧循环拿到的就是现成的。
 *
 * 纯的：时钟和"请求一个空闲时段"都由调用方注入，测试不需要浏览器。
 *
 * - 同一个 key 只做一次（做过的记账，`clear()` 才忘）；
 * - 每个切片做到预算用完就停，剩下的再请求一个空闲时段；切片为 0 也至少做一件（不饿死）；
 * - 一件活炸了只记一笔（`onError`），后面的照做。
 */
export interface IdleQueueOptions {
  now: () => number;
  /** 请求一个空闲时段；到了之后调用方调 `run(本时段剩余毫秒)` */
  schedule: () => void;
  onError?: (key: string, e: unknown) => void;
}

export interface IdleQueue {
  add(key: string, job: () => void): void;
  /** 在 `budgetMs` 内尽量多做 */
  run(budgetMs: number): void;
  readonly pending: number;
  /** 换了一个观众 / 库被拆了：没做的丢掉，记账清空 */
  clear(): void;
}

export function createIdleQueue(opt: IdleQueueOptions): IdleQueue {
  const jobs: { key: string; job: () => void }[] = [];
  const queued = new Set<string>();
  const done = new Set<string>();
  let requested = false;

  const request = (): void => {
    if (requested || !jobs.length) return;
    requested = true;
    opt.schedule();
  };

  return {
    add(key, job) {
      if (queued.has(key) || done.has(key)) return;
      queued.add(key);
      jobs.push({ key, job });
      request();
    },

    run(budgetMs) {
      requested = false;
      const start = opt.now();
      let ran = 0;
      while (jobs.length && (ran === 0 || opt.now() - start < budgetMs)) {
        const { key, job } = jobs.shift()!;
        queued.delete(key);
        done.add(key);
        ran++;
        try { job(); } catch (e) { opt.onError?.(key, e); }
      }
      request();
    },

    get pending() { return jobs.length; },

    clear() {
      jobs.length = 0;
      queued.clear();
      done.clear();
    },
  };
}
