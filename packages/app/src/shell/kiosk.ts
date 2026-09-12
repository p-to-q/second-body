/**
 * 现场外壳：全屏、藏鼠标、防休眠、无人降帧、context lost 自愈、URL 开关。
 * P10 现场优先 —— 启动 = 打开一个 URL，不需要在终端敲第二条命令。
 */
import { getDegradeState } from './degrade.ts';
import { noteActivity } from './idle.ts';

export interface Flags {
  demo: boolean;        // ?demo=1   用录制的 pose 回放，不开摄像头
  debug: boolean;       // ?debug=1  骨架线 + 数值 HUD
  nopost: boolean;      // ?nopost=1 关后期，排查性能（降级阶梯第 1 级也会把它翻成 true）
  mirror: boolean;      // ?mirror=0 关镜像（只用于调试坐标，现场绝不要用）
  theme: string | null; // ?theme=xeno  跳过选择页
  seed: number | null;  // ?seed=12345  复现一个具体的身体
  tier: number | null;  // ?tier=2      锁定 tier，调 look dev 用
  kiosk: boolean;       // ?kiosk=1  进入现场模式
  act: string | null;   // ?act=echo 锁定一个玩法（docs/16）
  plan: string | null;  // ?plan=quadruped 覆盖身体方案（docs/18）
  selftest: boolean;    // ?selftest=1 开场自检页（不进主程序）
  clip: string | null;  // ?clip=walkwave  指定回放片段（配合 ?demo=1）
  /** ?model=lite|full|heavy  换 PoseLandmarker 档位（docs/24 §3）。null = 默认档 lite */
  model: PoseModel | null;
  /** ?refine=0 关掉时域精化（One-Euro + 遮挡保持 + 质量兜底）。留着是为了能现场做 A/B */
  refine: boolean;
  /** ?vitality=0 关掉跟随延迟与呼吸。它是"看起来像活的"和"反应慢"之间的那条线，必须能当场比 */
  vitality: boolean;
}

/** MediaPipe 的三个 PoseLandmarker 档位。精度/延迟的实测差异见 docs/24 §3 */
export type PoseModel = 'lite' | 'full' | 'heavy';
const POSE_MODELS: readonly string[] = ['lite', 'full', 'heavy'];

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
    // 降级阶梯第 1 级 = 关后期。写在这里而不是让各子系统各记一份状态：
    // 谁读 flags 谁就自动看到降级后的世界，晚初始化的模块也不会漏掉。
    nopost: q.get('nopost') === '1' || getDegradeState().nopost,
    mirror: q.get('mirror') !== '0',
    theme: q.get('theme'),
    seed: num('seed'),
    tier: num('tier'),
    kiosk: q.get('kiosk') === '1',
    act: q.get('act'),
    plan: q.get('plan'),
    selftest: q.get('selftest') === '1',
    clip: q.get('clip'),
    // 手滑写 ?model=fulll 不该静默退回 lite —— 认不出来就是 null，
    // 采集端会把"实际用的是哪个档"显示出来，现场不用猜。
    model: POSE_MODELS.includes(q.get('model') ?? '') ? (q.get('model') as PoseModel) : null,
    // 默认开。之所以给一个关的开关：精化是**唯一**会在观众和数据之间加延迟的东西，
    // 现场如果有人说"反应慢了"，要能在 3 秒内证明是不是它。
    refine: q.get('refine') !== '0',
    vitality: q.get('vitality') !== '0',
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

  // 有人动鼠标/键盘 = 有人在这儿，立刻退出无人降帧（现场调试时不该对着 10fps 调参）
  const wake = () => noteActivity();
  addEventListener('pointermove', wake, { passive: true });
  addEventListener('pointerdown', wake, { passive: true });
  addEventListener('keydown', wake);
  cleanups.push(() => {
    removeEventListener('pointermove', wake);
    removeEventListener('pointerdown', wake);
    removeEventListener('keydown', wake);
  });

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
