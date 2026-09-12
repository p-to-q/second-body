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
  opts: { video?: HTMLVideoElement } = {},
): Promise<Capture> {
  if (kind === 'replay') {
    const { ReplayCapture } = await import('./replay.ts');
    return new ReplayCapture();
  }
  const { WebcamCapture } = await import('./webcam.ts');
  return new WebcamCapture(opts.video);
}
