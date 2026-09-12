/**
 * ReplayCapture —— 从录制数据回放的 `Capture`（docs/06 §2、§6 的 `?demo=1`）。
 *
 * 存在的理由不是"方便开发"，是**现场兜底**：断网、逆光毁掉追踪、摄像头被占用、
 * 评委不敢上台，任何一条发生时都要能一键切到这里，而下游一行都不用改。
 * 所以它和 WebcamCapture 必须严格同构：同样非阻塞、同样绝不抛异常、
 * 同样在"没有人"的帧返回 null。
 *
 * 数据格式（`/demo/pose-*.json`，录制由 T-16 负责）：
 *   { "fps": 30, "frames": RawPose[] }   或者直接一个 RawPose[]
 * `frames[i].world` 是 **MediaPipe 原始坐标**，不是世界坐标 —— 回放不做任何转换，
 * 转换只允许发生在 core/skeleton.ts 的 mediapipeToWorld()（docs/04 §1）。
 */
import type { RawPose } from '../../../core/src/types.ts';
import { CAPTURE } from '../../../core/src/tuning.ts';
import type { Capture } from './capture.ts';

/** 找不到别的就用它。T-16 录到真数据后把真文件名写进 /demo/index.json */
const DEFAULT_CLIP = '/demo/pose-synthetic.json';
const INDEX = '/demo/index.json';

interface Clip { fps: number; frames: RawPose[]; }

export class ReplayCapture implements Capture {
  #clip: Clip | null = null;
  #latest: RawPose | null = null;
  #error: string | null = null;
  #running = false;
  #rafId = 0;
  #t0 = 0;
  #index = -1;
  #serveTimes: number[] = [];
  #fps = 0;

  /** 当前播的是哪个文件，dev 页面拿来显示 */
  source: string | null = null;

  readonly clipUrl: string | undefined;

  constructor(clipUrl?: string) { this.clipUrl = clipUrl; }

  get fps(): number { return this.#fps; }
  get lastError(): string | null { return this.#error; }

  latest(): RawPose | null { return this.#latest; }

  /** 录制里没有 mask（慢回路在 demo 模式下本来就该关掉） */
  latestMask(): ImageBitmap | null { return null; }

  /** 永不 reject：加载失败只写 lastError，latest() 恒为 null */
  async start(): Promise<void> {
    if (this.#running) return;
    this.#running = true;
    try {
      const url = this.clipUrl ?? (await pickClip());
      this.source = url;
      this.#clip = await loadClip(url);
      this.#t0 = performance.now();
      this.#loop();
    } catch (e) {
      this.#error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      this.#running = false;
    }
  }

  stop(): void {
    this.#running = false;
    if (this.#rafId) cancelAnimationFrame(this.#rafId);
    this.#rafId = 0;
    this.#latest = null;
    this.#fps = 0;
  }

  #loop = (): void => {
    if (!this.#running) return;
    this.#rafId = requestAnimationFrame(this.#loop);
    try {
      this.#serve();
    } catch (e) {
      this.#error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }
  };

  #serve(): void {
    const clip = this.#clip;
    if (!clip || !clip.frames.length) return;
    const now = performance.now();
    // 墙钟驱动、循环播放：回放速度不跟渲染帧率走，跟录制时的 fps 走
    const i = Math.floor(((now - this.#t0) / 1000) * clip.fps) % clip.frames.length;
    if (i === this.#index) return;
    this.#index = i;

    const f = clip.frames[i];
    // score 低于门限 = 录制里那一段确实没人，照原样传下去（docs/06 §1 自己会判）
    this.#latest = f.world?.length ? { ...f, t: now } : null;

    this.#serveTimes.push(now);
    while (this.#serveTimes.length && now - this.#serveTimes[0] > 1000) this.#serveTimes.shift();
    this.#fps = this.#serveTimes.length;
  }
}

/** `?clip=` > /demo/index.json 的第一条 > 默认文件 */
async function pickClip(): Promise<string> {
  const asked = new URLSearchParams(location.search).get('clip');
  if (asked) return asked;
  try {
    const r = await fetch(INDEX);
    if (r.ok) {
      const list: unknown = await r.json();
      const first = Array.isArray(list) ? list[0] : (list as { clips?: string[] })?.clips?.[0];
      if (typeof first === 'string' && first) return first;
    }
  } catch { /* 没有 index 就走默认 */ }
  return DEFAULT_CLIP;
}

async function loadClip(url: string): Promise<Clip> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`回放数据取不到：${url} → HTTP ${r.status}`);
  const raw: unknown = await r.json();
  const frames = Array.isArray(raw) ? raw : (raw as { frames?: unknown })?.frames;
  if (!Array.isArray(frames) || !frames.length) throw new Error(`回放数据是空的：${url}`);
  const fps = (!Array.isArray(raw) && typeof (raw as { fps?: unknown }).fps === 'number')
    ? (raw as { fps: number }).fps
    : CAPTURE.targetHz;
  return { fps: fps > 0 ? fps : CAPTURE.targetHz, frames: frames as RawPose[] };
}
