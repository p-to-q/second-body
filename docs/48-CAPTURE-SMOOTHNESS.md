# 48 · Capture smoothness —— 摄像头打开时的黑与顿，以及整页的卡顿治理

> 作品负责人 2026-09-14 的报告（原话大意）：打开摄像头之后，授权完先是黑的，过一会儿**一顿**才加载出来；
> 镜头前动作一大，画面也卡。"让数据流顺起来，全页防卡顿，加保护措施。线上经常出现。"
> 当天追加："不只是摄像头 —— 各种意外情况都要有一套通用的治理：卡了怎么恢复、目标是不卡、用户要及时收到反馈。"
>
> 这一页是那两句话的**测量、改动、证据和还没做的部分**。所有数字都是当场在无头 Chrome 上跑出来的，
> 跑法在 §9；机器是作品负责人的 Apple silicon 笔记本（和 docs/02 P5 的目标机同一类）。
> **没有真人、没有真摄像头、没有线上网络** —— 摄像头是 Chrome 的假设备喂一段合成人形（§9），
> 这一条限制在每个结论后面都成立。

## 0 · 结论先说

1. **"先黑、一顿才出来"是主线程被 MediaPipe 占住了**，不是摄像头慢：权限在 0.56–1.6 秒就给了，
   之后 MediaPipe 建图（一次 303ms 暖缓存 / 599ms 冷缓存）和第一次 detect 编译着色器（195–266ms）
   两个长任务把整页冻住，而冻住的时候画面恰好刚换成摄像头。
2. **"动作大就卡"有两半**：推理本身在主线程上每次 p50 10ms / p95 19–22ms / p99 24–29ms（30 次每秒），
   动作一大检测器重跑、尾巴更长（>25ms 的帧：静止 20 → 运动 36，冷缓存那一场）；
   另一半是**台阶** —— 30Hz 的结果被 60–120Hz 的帧连着吃好几次，动作越大台阶越大。
3. 改法：推理、建图、预热全部挪进 **worker**（`capture/pose-worker.ts`）；**回放一直驱动身体到第一次推理完成**；
   身体吃**姿态时钟**插值出来的姿态（`capture/pose-clock.ts`）；全页一个**帧调速器**
   （`shell/governor.ts`）在掉帧时按阶梯放下已有的开关、余量回来再一级一级拿回。
4. 改后的数字在 §2 表里。〔改后数字见 §2〕

---

## 1 · 基线：原来是怎么走的

`main.ts` 的 `swapCapture('webcam')`（右下角「摄像头」那一行）：

```
按下 → createCapture('webcam') → start():
         getUserMedia → video.play()
         → resolveModel(HEAD /models/*.task，线上 404) → 从 Google CDN 取 5.8MB 模型（max-age=3600）
         → PoseLandmarker.createFromOptions（主线程：wasm 编译 + GPU delegate + 建图）
         → ImageSegmenter.createFromOptions（主线程，同上再来一遍）
         → rAF 推理循环开始
     → start() 返回 → capture 换成摄像头 → 小屏幕挂上 <video>
     → 下一帧：第一次 detectForVideo（主线程：编译着色器）
```

帧循环每帧 `capture.latest()` 直接喂精化器 / 骨架 / 生命力 —— 不论这一份是不是新的。

## 2 · 测量

**怎么测的**：`vite preview` 打的 dist；无头 Chrome，假摄像头喂一段 20 秒循环的合成人形视频
（0–8 秒站着微晃，8–20 秒拿 `assets/demo/pose-jumpingjacks.json` 那段真人录制做开合跳 + 左右大幅平移）；
走观众的那条路：展签「开始」→ 选择页回车 → 舞台上用回放跑 6 秒 → 点「摄像头」。
页内探针只观察不改应用：rAF 时间戳、`longtask`、`long-animation-frame`（带脚本归因）、
`getUserMedia` 返回时刻、小屏幕 `<video>` 出现与第一帧、读数第一次 `is-present`。
无头 Chrome 默认把 rAF 卡在 30Hz，所以**解开帧率**（`--disable-frame-rate-limit`）：
帧间隔因此量的是"这一帧的活有多重"，不是显示器节拍 —— p50 2–3ms 是这台机器上一帧的底，
p95/p99 和 >25ms 的计数才是卡顿。

### 2.1 启动（从按下「摄像头」算起，毫秒）

| | 基线 · 暖缓存 | 基线 · 冷缓存 | 改后 · 暖缓存 | 改后 · 冷缓存 |
|---|---|---|---|---|
| 权限给了（getUserMedia 返回） | 564 | 1580 | 1135 | 2482 |
| 小屏幕上出现画面 | 1217 | 15553 | 2359 | 16650 |
| 第一次认出人 | 1254 | 15818 | **2412** | 16866 |
| 按下之后的长任务（>50ms，整场） | 8 个，共 1250ms | 6 个，共 1181ms | 5 个，共 519ms | 10 个，共 660ms |
| 其中归因 MediaPipe 的 | 303ms 建图 · 195 / 231ms 首次 detect · 210ms 运动中 detect | 599ms 建图 · 266ms 首次 detect | **0** | **0** |
| 启动那一段帧间隔 p99 | 58.8 | 21.8 | 13.3 | 15.2 |

**冻结没有了，但暖缓存下第一次认出人晚了约 1.1 秒。** worker 里的预热 detect 要 1104–1274ms（主线程上第一次 detect 是 195–267ms：
OffscreenCanvas 上的 WebGL 编译更慢）。这一秒里回放照常驱动身体、右下角写「正在打开」，画面不停；
而观众的手移到那一行上时就开始预热（悬停预取），真人按下之前通常已经做完 —— 探针的 `el.click()` 不经过悬停，
所以上表是**没有预取**的最坏情形；带悬停的那一场见下。〔悬停〕
冷缓存下两边都被下载主导（15–17 秒），差别在噪声里。

冷缓存那一栏里 15 秒的大头是**本机** 11.7MB wasm + 线上 CDN 5.8MB 模型 + 抠图模型的下载。
带 trace 跑的那一次（trace 本身是负载）冻结量到 7000ms 建图、3659ms 首次 detect ——
**那一次不进结论**，但它说明慢机器上这两个长任务可以长到秒级：那就是作品负责人看到的"黑一下"。

### 2.2 稳态帧间隔（毫秒，解开帧率）

| | 静止 p95 / p99 · >25ms | 大动作 p95 / p99 · >25ms |
|---|---|---|
| 基线 · 暖缓存 | 13.3 / 19.9 · 17 | 13.6 / 20.2 · 29（另有一次 210ms 冻结，归因 webcam 推理） |
| 基线 · 冷缓存 | 16.4 / 24.6 · 20 | 16.9 / 24.7 · 36 |
| 改后 · 暖缓存 | **8.2 / 11.8 · 3** | **8.4 / 13.5 · 7** |
| 改后 · 冷缓存 | 13.7 / 20.9 · 11 | 14.0 / 26.3 · 35 |
| 基线 · CPU 4× | 〔〕 | 〔〕 |
| 改后 · CPU 4× | 〔〕 | 〔〕 |
| 基线 · DPR 3 | 〔〕 | 〔〕 |
| 改后 · DPR 3 | 〔〕 | 〔〕 |
| 改后 · `?worker=off`（降级路径） | 〔〕 | 〔〕 |

**冷缓存那一场改后大动作的 >25ms 没降（36 → 35）**，而这一场里一个 MediaPipe 的长任务都没有了：
剩下的长任务**全部归因帧循环本身**（`safe-frame` 55–153ms），集中在弧线的 30–47 秒 ——
那是忒修斯开始换件、档位往上走的那一段。暖缓存那一场同样：>50ms 的 4 帧全在 36–38 秒、全在帧循环里。
**采集这一半的卡顿已经拿走，剩下的下一个目标是换件 / 升档那一帧**（§8 第 1 条）。
这一场调速器走到过第 3 级又拿回一级（控制台：`放下 ink / swaps / inference`，`拿回 inference`）。

基线上每次推理的主线程耗时（带 trace 的那一次，rAF 卡在 30Hz，逐次 `FunctionCall` 统计）：
静止 p50 10.6 / p95 19.0 / p99 24.3ms，大动作 p50 9.6 / p95 22.1 / p99 28.6ms。
**60Hz 屏的一帧预算是 16.7ms，120Hz 是 8.3ms** —— 推理那一帧自己就吃掉了。

### 2.3 首屏字节（docs/13 的口径：标签页 → 选择页 → 舞台）

〔改前 / 改后〕

---

## 3 · 采集这一条线改了什么

### 3.1 推理进 worker（`capture/pose-worker.ts` + `capture/pose-protocol.ts`）

- 主线程每次推理只做一件事：`new VideoFrame(video)` 转移给 worker。**一次一帧**：结果回来之前不发下一帧，
  推理慢了频率自己降，渲染不受影响。
- 建图、GPU delegate、**预热**（拿一张空画布先 detect 一次，着色器在这里编译）全在 worker 里。
- worker 整页常驻：关掉摄像头再打开不重建；观众的手**移到「摄像头」那一行上**（悬停 / 聚焦）就开始取模型、建图 ——
  不碰摄像头、不问权限（`shell/entry.ts` 那条规矩照旧）。
- 工程上撞到的两件事，都有守卫：
  - **MediaPipe 的经典 wasm 胶水层在 module worker 里不可用**（它只是一个顶层 `var ModuleFactory`）。
    worker 用 `_module` 那一份，vite 的 worker 格式写死 `es`（dev 与 build 本来不一样）。
  - **第二个任务一律 `ModuleFactory not set`**：MediaPipe 建完一个任务就清掉全局工厂，而 module worker 的
    `import()` 有缓存、不会再执行胶水层。无头 Chrome 当场撞到（抠图起不来），同一个坑也会让 GPU→CPU 回落起不来。
    修法是每次创建前从缓存的模块上把 `default` 装回去（`test/pose-worker-factory.test.ts`）。
- 降级路径：worker 起不来 / `?worker=off` → 原来的主线程推理（MediaPipe 改成动态 import，worker 那条路上主线程一个字节都不下）。
  worker 中途死了 → 重新拿（最多 2 次）；一帧 2 秒没回来 → 当它丢了。

### 3.2 回放一直驱动身体，直到第一次推理完成

`WebcamCapture.start()` 现在在**第一份推理结果回来之后**才返回（上限 `CAPTURE.startTimeout`）。
`swapCapture` 在那之前一直用回放 —— 换过去的那一刻已经有姿态、小屏幕上的 `<video>` 已经在出帧。
启动期间右下角那一行写「正在打开」（此前只是变灰，字还写着「关着」）。

判"起没起来"改看 `Capture.failed`，不看 `lastError`：后者会留着已经兜住的旧账（"GPU delegate 失败，回落 CPU"），
拿它判的话，一台好好的、只是跑在 CPU 上的摄像头会被丢掉 —— 这是一个原来就在的坑。

### 3.3 姿态时钟（`capture/pose-clock.ts`）

渲染时刻往回退约一个推理间隔（封顶 `CAPTURE.interpDelayMax` 70ms），在最近两份结果**之间**插值；
最后一份之后按速度外推最多 `extrapolateMax` 60ms；`stallAfter` 250ms 没新结果就停住、
再过 `holdAfterStall` 600ms 交出 null 由在场判定淡出；推理说"没人"立刻 null（不插出幽灵）；
两份隔得比停滞还久（切回前台）不在它们之间插值。

身体吃它；**小屏幕和读数仍然吃采集端的原话** —— 它们的职责是说实话（`ui/preview.ts` 文件头那条）。
代价：身体比推理结果晚约 33ms。

---

## 4 · 全页的帧调速器（`shell/governor.ts` + `shell/governor-wire.ts`）

### 4.1 卡顿来源分类（按证据）

| 来源 | 信号 | 证据 | 现在怎么处理 |
|---|---|---|---|
| **推理 · 模型与 wasm 加载** | `vision_bundle` 长任务 | 基线 303ms（暖）/ 599ms（冷）/ 7000ms（带 trace） | worker 建图；悬停预取；回放驱动到首次推理 |
| **推理 · 首次 detect 编译着色器** | `webcam` 推理回调长任务 | 基线 195–267ms / 266ms / 3659ms | worker 里预热 |
| **推理 · 每帧 detect** | 主线程逐次耗时；>25ms 帧数随动作上升 | §2.2 | worker；调速器第 3 级降到 15Hz + 姿态时钟 |
| **推理 · GPU delegate 失败** | `backend=CPU`、警告 | 路径在，本机没触发 | worker 里回落 CPU（修了工厂坑之后才真的能回落）；不再被当成"摄像头坏了" |
| **推理 · 停滞 / worker 死了** | 推理 Hz、姿态时钟 `stalled` | 单测 | 在途超时、重拿 worker、姿态保持→淡出；读数 ALM 02 |
| 渲染 · 面数 / draw call | HUD | `BUDGET` + `outline-budget.test.ts`（已有） | 调速器第 4/5 级减代价 |
| 渲染 · 后期链 | — | 未单独量 | 调速器第 4 级（`stage.setPost`） |
| 渲染 · 首次用到某个物种/材质时编译管线 | 进舞台头几帧的帧循环长任务 | 基线进舞台 +56ms 一次 136ms、+5.7s 一次 115ms（归因 `safe-frame`） | **没做**：见 §8 |
| 渲染 · 墨色采样 GPU 读回 | — | `ink-sampler.ts` 头：读回中位 4.6ms，已拆到下一帧 | 调速器第 1 级暂停 |
| **造物 · 忒修斯替换 / 升档 remorph** | 帧循环自己的长任务 | 基线 +2.05s 一次 102ms；**改后剩下的长任务全在这里**：暖缓存 36–38s 四次 75–153ms，冷缓存 30–47s 55–90ms（全部归因 `safe-frame`） | 调速器第 2 级延后替换（最多 4 秒，不取消）；**替换本身的代价没动**：§8 第 1 条 |
| 造物 · GLB 解码 / meshopt | 部件加载时 | 未单独量 | **没做**：见 §8 |
| 造物 · 慢回路嫁接 | — | 生产构建里没有慢回路 | 不处理 |
| 主线程 · 逐帧分配与 GC | — | 未量（trace 太大，§9） | 姿态时钟每帧分配约 66 个小对象，**没优化**：见 §8 |
| 主线程 · 叠层的布局/样式 | — | 读数 4Hz 且值不变不写 DOM、右下角 1Hz（已有） | 调速器第 6 级停读数 |
| 资源 · 模型/部件走慢网 | 启动时间 | 冷缓存 15.5s（本机网络） | 启动期间回放驱动 +「正在打开」；模型托管见 §8 |
| 资源 · 长时间运行的内存 | 堆地板 | docs/37：30 分钟地板不抬（改前） | worker 多一份 wasm 堆；**改后没重浸泡**：见 §8 |
| 环境 · 标签页在后台 / 切回来 | `visibilityState`、单帧大间隔 | `frame-spike.test.ts`、`governor.test.ts` | 调速器不判；dt 钳位；姿态时钟停滞→淡出 |
| 环境 · 过热降频 / 集显 / 慢机器 | 帧间隔 | CPU 4× 两场（§2.2；CDP 降不了 GPU） | 调速器 |
| 环境 · 高 DPI | 帧间隔 | DPR 3 两场（§2.2） | 调速器第 5 级 |
| 环境 · 多显示器 / 不同刷新率 / VRR | 节拍估计 | `governor.test.ts` 30/60/120/144Hz + 抖动 | 节拍取第 10 百分位，下限 240Hz；丢帧另有 25ms 绝对下限 |
| 灾难 · WebGPU device lost | `onDeviceLost` | `device-lost.test.ts` | 说一句「正在恢复」→ 直接重载（吃重载闸）；`destroyed` 不管 |
| 灾难 · 摄像头中途断了 | track `ended` | 路径在，没实拔 | 换回回放 + 说一句 |

### 4.2 一个调速器，一条阶梯

输入：真实帧间隔（`FrameStats.frameMs`，没钳过）、长任务个数、页面是否在前台且没有在无人降帧。
输出：放下第几级。**每一级都接在一个已经存在的开关上**（`GOVERNOR_SWITCHES` 登记表，测试去 `main.ts` 核对）：

| 级 | 放下什么 | 开关 | 观众看得出来吗 |
|---|---|---|---|
| 1 | 角上字的墨色采样 | `stage.setInk` → `ink-sampler` 暂停 | 否 |
| 2 | 忒修斯替换延后（≤ `swapDeferMax` 4s） | `swapShed` → `createDeferral` 闸 → 仍是 `creature.replace` | 否（晚几秒） |
| 3 | 推理降到 15Hz | `WebcamCapture.setCadence` + 姿态时钟 | 几乎否 |
| 4 | 后期 | `stage.setPost`（控件条「渲染」、降级阶梯第 1 级同一个） | 是 → 右下角说一次「降级渲染」 |
| 5 | 像素比降到 1 | `renderer.setPixelRatio` | 是 |
| 6 | 读数停刷 | `uiShed` | 是（读数停住） |

判据与不闪（数都在 `core/src/tuning.ts` 的 `GOVERNOR`）：节拍 = 最近 10 秒帧间隔的第 10 百分位（不低于 1000/240ms）；
丢帧 = 帧间隔 > max(节拍 × 1.7, 25ms)；过载 = 2 秒窗口里丢帧 > 8% 或长任务 ≥ 2；
过载憋 1 秒放一级、余量憋 8 秒拿回一级、两次变化至少隔 2 秒、**每次变化后窗口清空**、
拿回后 12 秒内复发则下一次拿回憋的时间翻倍（封顶 64 秒）。

后期的"应该开着"由观众（控件条）和降级阶梯决定（`postWanted`），调速器只能在那之上临时关掉 ——
调速器拿回那一级时不会把观众自己关掉的后期打开。

**第一次上机就撞到的一件事**：无头 Chrome 解开帧率跑到 ~400fps，节拍被量成 1.0–1.4ms，
一帧 2–3ms 就被当成丢帧，几秒内六级全放（HUD `infer 15 Hz`）。VRR / ProMotion 屏上同样会抖。
于是加了节拍下限和 25ms 的绝对下限（`governor.test.ts` 先红后绿）。改后那几场里调速器实际走到几级，见 §2 各场的记录。〔〕

### 4.3 它看不见的

整段 10 秒每一帧都**一样**慢（稳定 25ms 跑在 60Hz 屏上）时节拍会被认成 25ms。浏览器实际上不这样稳定地慢，
但这一条没有被证明过。GPU 那一侧的代价只通过帧间隔间接看得见。

---

## 5 · 灾难情形

| 情形 | 以前 | 现在 | 守卫 |
|---|---|---|---|
| WebGPU device lost | 三打一行日志，之后永远黑 | 右下角「出了点问题，正在恢复」1.5 秒 → `degradeTo('reload')`（跳过前两级，仍吃每会话 2 次的重载闸）；`destroyed`（自己拆的）不管 | `device-lost.test.ts` |
| 摄像头中途断了 | 身体僵住，小屏幕黑 | 1 秒内换回回放，右下角「摄像头断开了，换回录像」 | 路径在，没实拔 |
| 推理停滞 / worker 死了 | 身体僵在最后一帧 | 姿态时钟外推 → 保持 → 交出 null（在场判定淡出）；worker 重拿 2 次；读数 ALM 02 照报 | `pose-clock.test.ts` |
| 切回前台（几秒的 dt） | dt 已钳（`TIME.dtMax`） | 另外：调速器不把它当丢帧；姿态时钟不在隔了几秒的两份之间插值 | `frame-spike.test.ts`、`governor.test.ts`、`pose-clock.test.ts` |
| 连续抛异常 | 降级阶梯（已有） | 不变 | `degrade.test.ts` |

## 6 · 反馈（只用已有的面）

- 观众：右下角「摄像头」那一行启动期间写「正在打开」（一个状态词，不是动画）；后期被调速器放下时右下角说一次「降级渲染」
  （一个会话一次，现场静默）；device lost 说「出了点问题，正在恢复」；摄像头断了说一句。全部走 `shell/notice.ts`，4 秒自己淡掉。
- 操作员：`?debug=1` 的 HUD 多一行 `gov=L<级>(<哪一级>) jank=<丢帧%> pose=<姿态时钟状态> infer@worker <单次 ms>`；
  控制台每次变级一行 `[governor] 放下/拿回 …`。
- 读数：**没有加新代码**。调速器放下推理那一级时推理确实降到 15Hz，WRN 13「推理偏慢」会如实亮 ——
  那是真的测量，不是误报；为它另开一个代码等于替调速器粉饰。

## 7 · 守卫（逐条先红后绿，提交里能看到红的那一次）

| 测试 | 守什么 |
|---|---|
| `test/pose-clock.test.ts` | 插值、120Hz 下匀速无台阶、外推封顶、停滞→保持→null、"没人"不出幽灵、大间隔不插值、重复观察不入队、t 严格递增 |
| `test/governor.test.ts` | 阶梯顺序；30/60/120/144Hz 稳态不动；过载一级一级放、至少隔 minDwell；余量一级一级拿回；忽好忽坏不闪；复发翻倍；后台/睡醒不算；长任务放级；**不锁帧 ~400fps 不动**；120Hz 偶发 12ms 不动 |
| `test/governor-wire.test.ts` | 第 n 级 = 前 n 个开关、只拨变了的、开关炸了不拖垮；**每一级登记的开关在 `main.ts` 的接线里、且是本来就有的开关**；延后闸不丢不乱序 |
| `test/frame-spike.test.ts` | 5 秒间隔：tick 拿到钳过的 dt，`frameMs` 是真实的 5000 |
| `test/device-lost.test.ts` | 意外丢失→重载、`destroyed`→不管、直接重载不白走前两级、重载闸照旧 |
| `test/camera-starting.test.ts` | 「正在打开」中英都有；exits 问 host 并写状态词；启动态不藏在动画后面；「摄像头断了」中英都有 |
| `test/pose-worker-factory.test.ts` | worker 里每一处 `createFromOptions` 前面都先装回工厂 |

## 8 · 还没做的（按预计收益排序）

1. **换件 / 升档那一帧**：采集挪走之后，改后剩下的长任务全部在帧循环里、集中在弧线 30–47 秒（75–153ms，§2.2）。
   先用 `TRACE=1` 在那一段拆开是 `creature.replace` 建实例、新件的管线编译、还是 `morph` 整具重建；
   管线编译那一半可以用 `renderer.compileAsync(scene, camera)` 提前到加载态或选择页聚焦某个物种时。
   进舞台头几帧的 115–136ms 长任务（§4.1）很可能是同一类，一起查。
2. **模型托管**：线上 `/models/*.task` 是 404，每次先白跑一个 HEAD，然后从 Google CDN 取 5.8MB（`max-age=3600`，一小时后重下）。
   放进 dist 并给长缓存是最直接的一步 —— 但 `webcam.ts` 文件头写着"模型不进仓库"，这是作品负责人的决定，不是这条线的。
3. **GLB 解码挪出主线程**（meshopt 解码进 worker 或切片进空闲时间）：没量。
4. **姿态时钟的逐帧分配**：每帧约 66 个小对象。改成复用缓冲要确认下游没人跨帧持有 `RawPose`。
5. **改后重新浸泡 30 分钟**（docs/37）：worker 多一份 wasm 堆，地板要重量。
6. **真人、真摄像头、真显示器**：60Hz 外接屏 + 120Hz ProMotion 各看一次调速器实际走到几级（docs/46 的检查表可以加一条）。
7. 升档 remorph 那一帧的代价：没单独量。

## 9 · 怎么重跑

脚本在 `scripts/capture-smoothness/`（原生 CDP，没有依赖）：

```bash
python3 scripts/capture-smoothness/figure.py assets/demo/pose-jumpingjacks.json /tmp/figure.y4m   # 合成人形，不是真人录像
npm run build && (cd packages/app && npx vite preview --port 4391)
node scripts/capture-smoothness/measure.ts http://localhost:4391 /tmp/run swap 45 1 1   # 最后两个数：CPU 降速倍数、是否复用缓存
DPR=3 node …      # 高 DPI
QUERY=worker=off node …   # 降级路径
BYTES=1 BYTES_ONLY=1 node … swap 10 1 0   # 首屏字节
TRACE=1 node …    # 带 trace（会拖慢页面，数字不进结论）
node scripts/capture-smoothness/summarize.ts /tmp/run
```

`measure.ts` 读的 y4m 路径是脚本同目录下的 `figure.y4m`，先把生成的文件放过去。
