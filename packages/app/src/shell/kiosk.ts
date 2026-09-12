/**
 * 现场外壳：全屏、藏鼠标、防休眠、context lost 自愈、URL 开关。
 * P10 现场优先 —— 启动 = 打开一个 URL，不需要在终端敲第二条命令。
 */

export interface Flags {
  demo: boolean;        // ?demo=1   用录制的 pose 回放，不开摄像头
  debug: boolean;       // ?debug=1  骨架线 + 数值 HUD
  nopost: boolean;      // ?nopost=1 关后期，排查性能
  mirror: boolean;      // ?mirror=0 关镜像（只用于调试坐标，现场绝不要用）
  theme: string | null; // ?theme=xeno  跳过选择页
  seed: number | null;  // ?seed=12345  复现一个具体的身体
  tier: number | null;  // ?tier=2      锁定 tier，调 look dev 用
  kiosk: boolean;       // ?kiosk=1  进入现场模式
}

export function readFlags(search = location.search): Flags {
  const q = new URLSearchParams(search);
  // 空字符串（?seed=）必须是 null 而不是 0 —— Number('') === 0 是个经典陷阱，
  // 它会让一个手滑写空的参数变成"锁定 seed 0"，而且完全没有提示。
  const num = (k: string) => {
    const v = q.get(k);
    if (v === null || v.trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    demo: q.get('demo') === '1',
    debug: q.get('debug') === '1',
    nopost: q.get('nopost') === '1',
    mirror: q.get('mirror') !== '0',
    theme: q.get('theme'),
    seed: num('seed'),
    tier: num('tier'),
    kiosk: q.get('kiosk') === '1',
  };
}

/** 防止 macOS 在无人交互时息屏 —— 装置会在这上面吃大亏 */
async function keepAwake(): Promise<() => void> {
  const nav = navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } };
  if (!nav.wakeLock) return () => {};
  let lock: { release(): Promise<void> } | null = null;
  const acquire = async () => {
    try { lock = await nav.wakeLock!.request('screen'); }
    catch { /* 没权限就算了，不是致命的 */ }
  };
  await acquire();
  // 切走再切回来会自动释放，必须重新申请
  const onVis = () => { if (document.visibilityState === 'visible') void acquire(); };
  document.addEventListener('visibilitychange', onVis);
  return () => { document.removeEventListener('visibilitychange', onVis); void lock?.release(); };
}

export interface Kiosk { dispose(): void; }

export function enterKiosk(canvas: HTMLCanvasElement, flags: Flags): Kiosk {
  const cleanups: (() => void)[] = [];

  if (flags.kiosk) {
    document.documentElement.style.cursor = 'none';
    // 全屏必须由用户手势触发，所以挂在第一次点击上
    const once = () => { void document.documentElement.requestFullscreen?.().catch(() => {}); };
    addEventListener('pointerdown', once, { once: true });
    cleanups.push(() => removeEventListener('pointerdown', once));
  }

  void keepAwake().then((release) => cleanups.push(release));

  // WebGL/WebGPU context lost：现场跑几小时一定会遇到一次
  const onLost = (e: Event) => {
    e.preventDefault();
    console.warn('[kiosk] graphics context lost —— 3 秒后重载');
    setTimeout(() => location.reload(), 3000);
  };
  canvas.addEventListener('webglcontextlost', onLost);
  cleanups.push(() => canvas.removeEventListener('webglcontextlost', onLost));

  // 未捕获的异常不该让页面停在半死状态
  const onErr = (e: ErrorEvent) => console.error('[kiosk] uncaught:', e.message);
  const onRej = (e: PromiseRejectionEvent) => console.error('[kiosk] unhandled rejection:', e.reason);
  addEventListener('error', onErr);
  addEventListener('unhandledrejection', onRej);
  cleanups.push(() => { removeEventListener('error', onErr); removeEventListener('unhandledrejection', onRej); });

  return { dispose() { for (const c of cleanups) c(); } };
}
