# 06 · SPEC · Runtime Protocol

> 模块之间的接口。类型的权威是 `packages/core/src/types.ts`，本文只解释**用法与时序**。

## 1. 帧循环的契约

```ts
frame(tMs: number):
  dt = clamp((tMs - last)/1000, 1/240, 1/15)   // 必须 clamp：切标签页回来会给出 3 秒的 dt
  raw       = capture.latest()                  // 非阻塞，可能是 null（推理比渲染慢）
  detected  = raw != null && raw.score > 0.5
  presence  = presenceMachine.update(detected, dt)
  if raw:
    skeleton = stabilizer.apply(buildSkeleton(mediapipeToWorld(raw)), dt)
    motion   = motionMachine.update(skeleton, dt)
    evo      = evolutionMachine.update(motion, dt)
    if evo.tierChanged: creature.remorph(makeGenome(session.seed, evo.tier, library.index))
    creature.pose(skeleton, presence, dt)
  if presenceMachine.justReset: session.seed = rng32(); motionMachine.reset(); evolutionMachine.reset()
  stage.update(presence, motion, dt)
  renderer.renderAsync(scene, camera)
```

**推理与渲染解耦**：MediaPipe 在自己的节奏上跑（≥30Hz），渲染 60fps。
渲染永远用"最新可得"的 pose，绝不等推理。姿态滤波吸收两者的速率差。

## 2. Capture 接口

```ts
interface Capture {
  start(): Promise<void>;
  /** 最近一次成功的姿态；没有人/还没就绪时返回 null。绝不抛异常 */
  latest(): RawPose | null;
  /** 最近一帧的人像 mask（慢回路用），可能为 null */
  latestMask(): ImageBitmap | null;
  readonly fps: number;
  readonly lastError: string | null;
  stop(): void;
}
```
实现两个：`WebcamCapture`（MediaPipe）与 `ReplayCapture`（读 `/demo/pose-*.json`，`?demo=1` 时启用）。
**两者必须可互换**，这是 P3 降级路径与现场 plan B 的基础。

## 3. PartLibrary 接口

```ts
interface PartLibrary {
  load(): Promise<void>;                      // 失败也要 resolve，内部切到占位模式
  readonly index: PartLibraryIndex;            // 缺资产时返回内置的占位 index
  geometry(partId: string): Geometry;          // 永不返回 undefined：缺失 → 占位几何
  readonly usingFallback: boolean;
}
```

## 4. Creature 接口

```ts
interface Creature {
  remorph(g: Genome): void;        // 只对变化的槽位做 crossfade，最多同时 3 个（docs/05 §3）
  pose(sk: Skeleton, p: Presence, dt: number): void;
  /** 慢回路产物到货：把某个槽位热插拔成新部件，带组装动画 */
  graft(slot: SlotKey, meta: PartMeta, geometry: Geometry): void;
}
```

## 5. 慢回路 HTTP 协议（浏览器 ↔ `localhost:8787`）

key 只在 Node 侧（P8）。浏览器只认识这三个端点：

```
POST /slow/submit        multipart: mask=<png blob>
  → 200 { id: string }                      // 立即返回，不等生成
  → 429 { error: "cooldown", retryAfter: n } // 冷却中（每人最多 1 次，间隔 20s）
  → 503 { error: "disabled" }                // 代理没起/没 key → 前端静默关掉这条回路

GET  /slow/status?id=…
  → 200 SlowJob    // status: submitted | generating | ready | failed

GET  /slow/part/<id>.glb
  → 200 model/gltf-binary   （已过 normalize，满足 docs/03 §6 契约）
```

前端规则（P3）：
- 全程 `try/catch` + 12s 超时；任何失败 → `slowLoop.disabled = true`，本次会话不再尝试。
- 轮询间隔 5s，最多 24 次（2 分钟）后放弃。
- **慢回路的任何状态都不允许影响快回路的帧率或姿态。**

## 6. 调试开关（URL 参数）

| 参数 | 作用 |
|---|---|
| `?demo=1` | 用录制的 pose 回放，不开摄像头（评委演示 / 断网兜底） |
| `?debug=1` | 显示骨架线框、socket 点、特征数值 |
| `?tier=2` | 锁定 tier，跳过演化（调 look dev 用） |
| `?seed=12345` | 锁定 genome seed（复现一个具体的身体） |
| `?nopost=1` | 关掉后期，排查性能 |
| `?mirror=0` | 关掉镜像（调试坐标用，现场绝不要用） |

## 7. 性能读数

`?debug=1` 时左上角常驻：`fps / 推理 Hz / 实例数 / 三角数 / draw calls / JS ms`。
超出 `docs/02 P5` 预算的数字标红。**红了就是 bug，不是"以后再优化"。**
