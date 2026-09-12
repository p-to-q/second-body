/**
 * WebcamCapture —— MediaPipe 实现的 `Capture`（docs/06 §2）。
 *
 * 契约里真正难的只有两条，其余都是样板：
 *  1. `latest()` 非阻塞：推理跑在自己的循环上（目标 CAPTURE.targetHz），
 *     渲染线程只读最近一次成功的结果。渲染永远不等推理（docs/06 §1）。
 *  2. `latest()` 绝不抛异常：所有可能炸的东西（getUserMedia / wasm / 模型下载 /
 *     detectForVideo）都被包住，失败只写 `lastError`，返回值退化成 null。
 *
 * 降级路径（P2/P3，每条都必须存在）：
 *   GPU delegate 失败      → CPU delegate
 *   本地 wasm 失败         → CDN wasm
 *   本地模型文件不存在      → CDN 模型
 *   ImageSegmenter 起不来  → 只丢 mask，姿态照跑（慢回路自己会静默关掉）
 *   摄像头权限被拒          → lastError 有值，latest() 恒为 null，页面不白屏
 *
 * 这里**不做任何姿态处理**：不滤波、不建骨架、不换坐标系。
 * 坐标转换只允许发生在 core/skeleton.ts 的 mediapipeToWorld()（docs/04 §1）。
 */
import { FilesetResolver, ImageSegmenter, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { Landmark, RawPose } from '../../../core/src/types.ts';
import { CAPTURE } from '../../../core/src/tuning.ts';
import { notePresence } from '../shell/idle.ts';
import { readFlags, type PoseModel } from '../shell/kiosk.ts';
import type { Capture, CaptureStep } from './capture.ts';

// 本地 wasm：打包进产物，现场断网也能起（Vite 把它们当静态资源发出去）
// 注意子路径没有 /wasm/：包的 exports 就是这么导出的
import wasmLoaderUrl from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import wasmBinaryUrl from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';

const CDN_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';

/**
 * 模型文件不进仓库（几 MB 的二进制）。优先读本地 `assets/models/`（现场务必预先放好），
 * 没有就回落到 Google 的模型 CDN。
 */
const MODELS = {
  segmenter: {
    local: '/models/selfie_segmenter.tflite',
    cdn: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
  },
};

/**
 * 三个档位的姿态模型（`?model=lite|full|heavy`，docs/24 §3）。
 * 官方 model card 的实测差：lite→full 的 3D MAE 45mm→39mm、PDJ +4 点，GPU 代价约 +20%；
 * heavy 再好一点但 GPU 帧率掉到约一半。默认仍是 lite —— 现场机器的余量还没压测过（U9）。
 *
 * **换档是一个 URL 参数，不是一次重新构建**：逆光把 lite 打崩时，现场只能靠这个。
 */
const POSE_MODEL_FILES = {
  lite: 'pose_landmarker_lite',
  full: 'pose_landmarker_full',
  heavy: 'pose_landmarker_heavy',
} as const;

function poseModelSource(which: PoseModel): { local: string; cdn: string } {
  const base = POSE_MODEL_FILES[which] ?? POSE_MODEL_FILES.lite;
  return {
    local: `/models/${base}.task`,
    cdn: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/${base}/float16/latest/${base}.task`,
  };
}

/**
 * 每多少个推理 tick 抠一次图。mask 只给慢回路用（docs/06 §5），
 * 2Hz 足够，跟着姿态跑会白白吃掉快回路的预算。
 * 不放 tuning.ts：这不是"现场要调的数"，是一条实现内部的节流。
 */
const MASK_EVERY_N_TICKS = Math.max(1, Math.round(CAPTURE.targetHz / 2));

export class WebcamCapture implements Capture {
  readonly video: HTMLVideoElement;

  #stream: MediaStream | null = null;
  #landmarker: PoseLandmarker | null = null;
  #segmenter: ImageSegmenter | null = null;

  #latest: RawPose | null = null;
  #mask: ImageBitmap | null = null;
  #maskCanvas: HTMLCanvasElement | null = null;

  #fps = 0;
  #tickTimes: number[] = [];
  #tick = 0;
  #lastVideoTime = -1;
  #lastStamp = -1;
  #running = false;
  #rafId = 0;
  #error: string | null = null;

  /** 起来之后用的是哪条路，dev 页面拿来显示 */
  backend: 'GPU' | 'CPU' | null = null;
  /** 实际加载的姿态模型档位（`?model=`；没指定就是默认档） */
  readonly model: PoseModel;

  /**
   * 启动里程碑。三件：摄像头开了 / 姿态模型到了 / 抠图模型问过了。
   * 三件都是**真的发生了才报**，加载态因此不用猜（见 capture.ts 的 CaptureStep）。
   */
  #onStep: CaptureStep | null;
  #steps = 0;
  static readonly START_STEPS = 3;

  constructor(video?: HTMLVideoElement, model?: PoseModel, onStep?: CaptureStep) {
    this.#onStep = onStep ?? null;
    this.model = model ?? readFlags().model ?? 'lite';
    this.video = video ?? document.createElement('video');
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.autoplay = true;
  }

  get fps(): number { return this.#fps; }
  get lastError(): string | null { return this.#error; }

  latest(): RawPose | null { return this.#latest; }
  latestMask(): ImageBitmap | null { return this.#mask; }

  /** 永不 reject：失败写进 lastError，让页面自己决定怎么显示 */
  async start(): Promise<void> {
    if (this.#running) return;
    this.#running = true;
    try {
      await this.#openCamera();
      this.#step();
      await this.#openModels();
      this.#loop();
    } catch (e) {
      this.#error = describe(e);
      this.#running = false;
    }
  }

  stop(): void {
    this.#running = false;
    if (this.#rafId) cancelAnimationFrame(this.#rafId);
    this.#rafId = 0;
    this.#stream?.getTracks().forEach((t) => t.stop());
    this.#stream = null;
    try { this.#landmarker?.close(); } catch { /* 关闭失败不值得吵 */ }
    try { this.#segmenter?.close(); } catch { /* 同上 */ }
    this.#landmarker = null;
    this.#segmenter = null;
    this.#mask?.close();
    this.#mask = null;
    this.#latest = null;
    this.#fps = 0;
  }

  /** 报一件。回调自己炸了不许拖垮启动 —— 它只是个显示用的旁路 */
  #step(): void {
    this.#steps = Math.min(WebcamCapture.START_STEPS, this.#steps + 1);
    try { this.#onStep?.(this.#steps, WebcamCapture.START_STEPS); } catch { /* 显示用的旁路，别管 */ }
  }

  // ── 启动 ────────────────────────────────────────────────────────────────
  async #openCamera(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('浏览器没有 getUserMedia（需要 https 或 localhost）');
    }
    this.#stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: CAPTURE.requestedVideo.width }, height: { ideal: CAPTURE.requestedVideo.height } },
      audio: false,
    });
    this.video.srcObject = this.#stream;
    await this.video.play();
    if (!this.video.videoWidth) {
      await new Promise<void>((res) => this.video.addEventListener('loadeddata', () => res(), { once: true }));
    }
  }

  async #openModels(): Promise<void> {
    const poseModel = await resolveModel(poseModelSource(this.model));

    // wasm：先本地，失败再 CDN
    let fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;
    try {
      fileset = { wasmLoaderPath: new URL(wasmLoaderUrl, location.href).href,
                  wasmBinaryPath: new URL(wasmBinaryUrl, location.href).href };
      this.#landmarker = await this.#makeLandmarker(fileset, poseModel);
    } catch (e) {
      this.#error = `本地 wasm 起不来，回落 CDN：${describe(e)}`;
      fileset = await FilesetResolver.forVisionTasks(CDN_WASM);
      this.#landmarker = await this.#makeLandmarker(fileset, poseModel);
    }
    this.#step();

    // 抠图是慢回路的输入，起不来不该拖垮姿态
    try {
      this.#segmenter = await ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: await resolveModel(MODELS.segmenter), delegate: 'GPU' },
        runningMode: 'VIDEO',
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      });
    } catch (e) {
      this.#segmenter = null;
      this.#error = `ImageSegmenter 未启用（慢回路会静默关掉）：${describe(e)}`;
    }
    this.#step();
  }

  async #makeLandmarker(
    fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
    modelAssetPath: string,
  ): Promise<PoseLandmarker> {
    const opts = { runningMode: 'VIDEO' as const, numPoses: 1, outputSegmentationMasks: false };
    try {
      const lm = await PoseLandmarker.createFromOptions(fileset, {
        ...opts, baseOptions: { modelAssetPath, delegate: 'GPU' },
      });
      this.backend = 'GPU';
      return lm;
    } catch (e) {
      // 没有 WebGL / 驱动挂了 → CPU 也能跑，只是慢
      this.#error = `GPU delegate 失败，回落 CPU：${describe(e)}`;
      const lm = await PoseLandmarker.createFromOptions(fileset, {
        ...opts, baseOptions: { modelAssetPath, delegate: 'CPU' },
      });
      this.backend = 'CPU';
      return lm;
    }
  }

  // ── 推理循环 ────────────────────────────────────────────────────────────
  #loop = (): void => {
    if (!this.#running) return;
    this.#rafId = requestAnimationFrame(this.#loop);
    try {
      this.#infer();
    } catch (e) {
      // 一帧炸了不许冒到帧循环外（AGENTS 不变量：帧循环里永不抛异常）
      this.#error = describe(e);
    }
  };

  #infer(): void {
    const lm = this.#landmarker;
    if (!lm || this.video.readyState < 2) return;

    // 同一帧不重复推理；timestamp 必须严格递增，否则 MediaPipe 会抛
    const vt = this.video.currentTime;
    if (vt === this.#lastVideoTime) return;
    this.#lastVideoTime = vt;
    const now = performance.now();
    const stamp = now <= this.#lastStamp ? this.#lastStamp + 1 : now;
    this.#lastStamp = stamp;

    const res = lm.detectForVideo(this.video, stamp);
    const world = res.worldLandmarks?.[0];
    const screen = res.landmarks?.[0];
    if (world?.length) {
      this.#latest = {
        world: world.map(toLandmark),
        screen: screen?.map(toLandmark),
        score: overallScore(screen, world),
        t: stamp,
      };
    } else {
      this.#latest = null;   // 没人：返回 null，不是返回上一帧的幽灵
    }
    res.close?.();

    // 顺手上报"有没有人"给无人降帧（shell/idle.ts）。
    // 这件事只有采集端知道，让它自己说，收口的 main.ts 就一行都不用改。
    notePresence((this.#latest?.score ?? 0) > CAPTURE.minScore, now);

    this.#tick++;
    this.#countTick(now);
    if (this.#segmenter && this.#tick % MASK_EVERY_N_TICKS === 0) this.#segment(stamp);
  }

  /** 推理 Hz：数最近 1 秒里成功跑了几次 */
  #countTick(now: number): void {
    this.#tickTimes.push(now);
    while (this.#tickTimes.length && now - this.#tickTimes[0] > 1000) this.#tickTimes.shift();
    this.#fps = this.#tickTimes.length;
  }

  #segment(stamp: number): void {
    const seg = this.#segmenter;
    if (!seg) return;
    try {
      seg.segmentForVideo(this.video, stamp, (result) => {
        const m = result.categoryMask;
        if (!m) return;
        const w = m.width, h = m.height;
        const src = m.getAsUint8Array();
        const cvs = this.#maskCanvas ??= document.createElement('canvas');
        cvs.width = w; cvs.height = h;
        const ctx = cvs.getContext('2d');
        if (!ctx) return;
        const img = ctx.createImageData(w, h);
        for (let i = 0; i < src.length; i++) {
          // selfie_segmenter 的 category mask：0 = 背景，非 0 = 人
          const on = src[i] !== 0 ? 255 : 0;
          const p = i * 4;
          img.data[p] = img.data[p + 1] = img.data[p + 2] = 255;
          img.data[p + 3] = on;
        }
        ctx.putImageData(img, 0, 0);
        // createImageBitmap 是异步的：新的到货再换掉旧的，别让消费者拿到半张图
        void createImageBitmap(cvs).then((bmp) => {
          this.#mask?.close();
          this.#mask = bmp;
        }).catch(() => { /* 抠图掉一帧无所谓 */ });
      });
    } catch (e) {
      this.#error = describe(e);
    }
  }
}

function toLandmark(l: { x: number; y: number; z: number; visibility?: number }): Landmark {
  return { x: l.x, y: l.y, z: l.z, visibility: l.visibility };
}

/**
 * MediaPipe 不给"整体置信度"，只有逐点 visibility。取平均值当 score（docs/06 §1 用它判有没有人）。
 * 有些模型版本 visibility 恒为 0；那种情况下"检出了 33 个点"本身就是证据，记 1。
 */
function overallScore(
  screen: ReadonlyArray<{ visibility?: number }> | undefined,
  world: ReadonlyArray<{ visibility?: number }>,
): number {
  const src = screen?.length ? screen : world;
  let sum = 0, n = 0;
  for (const l of src) {
    const v = l.visibility;
    if (typeof v === 'number' && Number.isFinite(v)) { sum += v; n++; }
  }
  if (!n || sum === 0) return 1;
  return Math.min(1, Math.max(0, sum / n));
}

/** 本地有模型就用本地（现场断网），否则 CDN */
async function resolveModel(m: { local: string; cdn: string }): Promise<string> {
  try {
    const r = await fetch(m.local, { method: 'HEAD' });
    const type = r.headers.get('content-type') ?? '';
    if (r.ok && !type.includes('text/html')) return m.local;
  } catch { /* 本地没有就算了 */ }
  return m.cdn;
}

function describe(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  return String(e);
}
