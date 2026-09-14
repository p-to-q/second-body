/**
 * Capture 接口（docs/06 §2 的可执行版本）与实现选择器。
 *
 * 为什么接口住在这里而不是 core/types.ts：`Capture` 里有 `ImageBitmap`，
 * 而 core 不许碰浏览器 API（AGENTS 不变量）。core 只定义 `RawPose` 这种纯数据。
 *
 * 两个实现（WebcamCapture / ReplayCapture）必须可互换 —— 这是 P3 降级路径
 * 与现场 plan B 的基础，所以选择只发生在这一个函数里，调用方永远只见到 `Capture`。
 */
import type { RawPose } from '../../../core/src/types.ts';
import { readFlags } from '../shell/kiosk.ts';

export interface Capture {
  start(): Promise<void>;
  /** 最近一次成功的姿态；没有人/还没就绪时返回 null。绝不抛异常 */
  latest(): RawPose | null;
  /** 最近一帧的人像 mask（慢回路用），可能为 null */
  latestMask(): ImageBitmap | null;
  readonly fps: number;
  readonly lastError: string | null;
  stop(): void;
  /**
   * 最近一次推理（回放：出帧）完成于哪一刻（`performance.now()` 毫秒，和 `RawPose.t` 同一时钟）。
   * 姿态时钟（`pose-clock.ts`）靠它分辨"新的一份"和"同一份又被读了一次" ——
   * 没人的时候 `latest()` 连着返回 null，光看返回值分不出推理是在跑还是停了。
   */
  readonly inferredAt?: number;
  /**
   * `start()` 之后这一路**起不来**。和 `lastError` 分开：`lastError` 上会留着已经被兜住的
   * 旧账（"GPU delegate 失败，回落 CPU"），拿它判"能不能用"，好好的摄像头会被当成坏的丢掉。
   * 没实现这个字段的一路按 `lastError` 判（回放：只有致命错误才写 lastError）。
   */
  readonly failed?: boolean;
}

export type CaptureKind = 'webcam' | 'replay';

/**
 * `?demo=1` → 回放（评委演示 / 断网 / 摄像头翻车时的兜底，docs/06 §6）。
 * URL 开关的解析只有 `readFlags` 一份，这里不再自己读 URLSearchParams。
 */
export function captureKindFromUrl(search?: string): CaptureKind {
  return readFlags(search).demo ? 'replay' : 'webcam';
}

/**
 * 按 URL 参数造一个 Capture。动态 import 是故意的：`?demo=1` 这条路
 * 不该把 MediaPipe 的 wasm/模型也拖下来（现场断网时它正好就是拖不下来的那部分）。
 */
export async function createCapture(
  kind: CaptureKind = captureKindFromUrl(),
  /** 调试页可以把自己的 <video> 传进来，好把画面显示出来；运行时不需要 */
  opts: { video?: HTMLVideoElement; onStep?: CaptureStep } = {},
): Promise<Capture> {
  if (kind === 'replay') {
    const { ReplayCapture } = await import('./replay.ts');
    return new ReplayCapture(undefined, opts.onStep);
  }
  const { WebcamCapture } = await import('./webcam.ts');
  return new WebcamCapture(opts.video, undefined, opts.onStep);
}

/**
 * 启动里程碑回调 —— 加载态（`shell/loading.ts`）的「正在认识你的身体」那一档
 * 靠它显示真实进度。
 *
 * 为什么非要让采集端自己报：这一档最久的部分是 MediaPipe 的 wasm 与模型下载，
 * 而那几个 fetch 发生在库内部，外面**观察不到**。没有这个回调，那一行就只能
 * 在 0% 上停几秒再直接跳到完成 —— 也就是又变回一块什么都不说的黑屏。
 * 报的是"第几件到齐了"这种真事件，不是定时器往上爬的假数（见 loading.ts §2）。
 */
export type CaptureStep = (done: number, total: number) => void;
