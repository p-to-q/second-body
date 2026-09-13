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
// 注意返回的是 three 的 BufferGeometry，不是 types.ts 里的什么类型 ——
// core 不许 import three，所以这个类型只存在于 app 侧。
interface PartLibrary {
  load(): Promise<void>;                      // 失败也要 resolve，内部切到占位模式
  readonly index: PartLibraryIndex;            // 缺资产时返回内置的占位 index
  geometry(partId: string): THREE.BufferGeometry;  // 永不返回 undefined：缺失 → 占位几何
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

## 5. 慢回路 HTTP 协议（浏览器 ↔ dev server）

key 只在 Node 侧（P8）。**完整协议、预算、血统池、失败矩阵见 `docs/17-SLOW-LOOP.md`。**

落地时和本节原来的草案差了两处，都写在这里免得两边打架：
- 不是独立的 `localhost:8787` 进程，而是 dev server 上的 `/__slow` 中间件 ——
  装置跑在本地机器上，那台机器上就有 factory，多起一个进程只是多一处要被拉起来的东西。
- 提交体是 PNG 原始字节，不是 multipart：只有一张图，multipart 只是多一层解析。

```
POST /__slow?slot=&session=&species=     body = 剪影 PNG 原始字节
  → 200 SlowJob { id, status:'submitted' }   // 立即返回，不等生成
  → 4xx { ok:false, code, error }            // 预算/坏请求，结构化 JSON，绝不静默退化
  → 404                                      // 生产构建里没有这条回路 → 前端静默关掉它

GET  /__slow/<jobId>
  → 200 SlowJob    // status: submitted | generating | ready | failed

GET  /__slow/part/<partId>.glb
  → 200 model/gltf-binary   （已过 normalize，满足 docs/03 §6 契约）

GET  /__slow/lineage?species=
  → 200 { chance, total, parts: PartMeta[], entries: […] }   // 前人留下的件
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
| `?cam=1` / `?cam=<deviceId>` | 选用哪一台摄像头（见下面「现场：怎么选中对着观众的那台」） |
<<<<<<< HEAD
<<<<<<< HEAD
| `?preview=on` / `?preview=off` | 左上角那块「它有没有看见我」的小屏幕（`ui/preview.ts`）。网页版默认**开**，`?kiosk=1` 默认**关**，`?demo=1` **永远关**（回放没有摄像头，那块屏幕会变成一句假话）。写错的值等于没写，规矩同 `?scene=` |
=======
| `?wave=on\|off` | 选择页的**举手滚动**（默认开）。举一只手过肩、停住 0.75 秒、横向挥 = 翻名单。认不出来的值等于没写（见下面「现场：没有鼠标的人怎么翻名单」） |

### 现场：没有鼠标的人怎么翻名单

现场没有鼠标、没有触控板、没有键盘。在这之前，站在装置前面的人**翻不了名单** ——
他只能等 30 秒，然后被随机塞一具身体。`?wave=` 那一条补的就是这个。

**怎么用**（观众不需要被教，这段是给操作员的）：

1. 举起**一只**手，手腕高过同侧肩膀。
2. 停住约 **0.75 秒**。此时环上会出现一团跟着手动的软化 —— 那就是"它认得我了"，
   和把鼠标悬在正面那张卡上时发生的是同一件事。
3. 手**横向**挥。往右 = 名单往后翻（等价于滚轮往下），往左 = 往回。
   手放下，或者过肩线以下超过 0.35 秒，就松开。

**它不会被误触发**，三道闸各挡一类人：手腕必须高过肩线（挡边说话边比划的）、
必须连续举住 0.75 秒（挡走过去的路人）、**只能举一只手**（挡伸懒腰和举双手拍照的）。
三道闸的推导写在 `packages/app/src/choose/ring/wave.ts` 的文件头。

**它什么时候根本不存在**：没有摄像头、没给权限、`?demo=1`（回放）、
网页版还没按「用我的摄像头」、`?gl=off`（DOM 降级列表）、`?wave=off`。
这些情况下这一页和以前**逐字一样** —— 鼠标、触控板、触摸、键盘、30 秒自动选
全部照常。开机时控制台打一行 `选择页举手滚动：on|off`，不用猜。
>>>>>>> worktree-agent-a848efb2d0fcd426f
=======
| `?exits=0` / `?exits=1` | 右下角那一列（回到大厅 / 把身体还回去 / 摄像头，见 `ui/exits.ts`）。默认开，**`?kiosk=1` 下默认关** —— 无人值守的装置不该向公众提供「回到大厅」。认不出来的值当没写过并打一条 warn |
>>>>>>> worktree-agent-a1a31aff3ae8d1a5d

### 现场：怎么选中对着观众的那台

现场通常插着两台摄像头：一台外接的对着观众，一台笔记本内置的对着墙。
不写 `?cam=` 的话，用哪台**由浏览器决定**，而它并不知道哪台对着人。

装好线之后，照这三步做一次，之后就不用再想它：

1. 打开 `/?debug=1`，按「用我的摄像头」给权限。左上角 HUD 上会多出一行
   `cam <摄像头的名字>` —— 那就是**现在正在拍的那台**。
2. 如果它不是你要的那台：按 `F12` 打开控制台，开机时打过一张表，长这样

   ```
   [webcam] 摄像头：FaceTime HD Camera (内置)
     ?cam=0  ?cam=a10f22cc  FaceTime HD Camera (内置)  ← 现在用的
     ?cam=1  ?cam=b7c19e04  Logitech BRIO
   ```

   每一行前面那两个写法都能直接抄进地址栏。先用序号试：`/?debug=1&cam=1`，
   看 HUD 那一行变成不是你要的那个名字为止。
3. **开机 URL 里请写 deviceId 那一种**，例如 `/?kiosk=1&cam=b7c19e04`。
   序号会因为插拔、换 USB 口而整体错位；deviceId 在同一台机器 + 同一个浏览器
   用户资料下是稳定的。序号是"找"的工具，deviceId 才是"钉"的工具。

演出当中如果有人碰掉了外接摄像头的线：**装置不会停**，它会自动退回另一台
继续跑。但这时 `?debug=1` 的 HUD 上那一行会变红，写着「用的不是你要的那台」。
巡场时瞄一眼这一行就够了 —— 它是"这件作品此刻是不是在对着一面墙演"
唯一的答案。

写错的值（比如 `?cam=1.5`、`?cam=-1`）等于没写，不会被"猜"成某一台。
认出来的话，HUD 那一行末尾一定跟着 `← ?cam=<你写的值>`；只有名字、没有这个尾巴，
就说明你的参数根本没被认出来 —— 检查一下拼写，别一遍遍重刷同一个坏 URL。

## 7. 性能读数

`?debug=1` 时左上角常驻：`fps / 推理 Hz / 实例数 / 三角数 / draw calls / JS ms`，
外加一行 `cam <当前摄像头>`（不是数字，但它和这些数字一样是"现在真的怎么样"，
而且回落时同样标红 —— 见 §6）。
超出 `docs/02 P5` 预算的数字标红。**红了就是 bug，不是"以后再优化"。**
