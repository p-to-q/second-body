# 02 · Engineering Principles

> **这份文档是给所有参与者（包括子代理）的宪法。任何一条与任务卡冲突时，以本文档为准。**
> 违反其中任何一条的 PR/改动一律回退，不讨论。

## P0 · 契约先行，实现在后

所有跨模块的类型、常量、文件格式都集中在两个地方：

- `packages/core/src/types.ts` —— 运行时所有共享类型
- `docs/03-SPEC-part-library.md` —— 磁盘资产格式（`parts.json`）

**这两处是冻结的。** 如果你的任务让你觉得必须改它们，那说明任务卡写错了：
**停下来，在任务输出里写明"需要变更契约：<原因>"，不要自行修改。**

## P1 · 每个模块都是纯函数优先

- 计算模块（滤波、骨架构建、运动特征、genome）必须是**纯函数**：输入 → 输出，无全局状态、无 DOM、无 `Date.now()`、无 `Math.random()`。
- 需要状态的（滤波器、状态机）做成 `createX()` 工厂返回闭包，状态显式持有，可以 `reset()`。
- 需要随机的，**必须**接收一个 `Rng` 参数（`packages/core/src/rng.ts`）。禁止裸用 `Math.random()`。
  理由：同一个 `seed` 必须永远生成同一个身体，否则现场没法复现、没法调试、没法做留念二维码。
- 需要时间的，**必须**接收 `dt` 或 `t` 参数。禁止模块内部读时钟。

## P2 · 帧循环里永不抛异常

渲染循环中的任何一环都不允许 `throw`。策略：

```ts
// ✅ 正确
const part = library.get(id) ?? library.fallback(slot);   // 资产缺失 → 占位几何
if (!Number.isFinite(v)) v = lastGood;                     // NaN → 保持上一帧

// ❌ 错误
const part = library.get(id)!;   // 现场炸给观众看
```

- 所有外部输入（摄像头、模型输出、网络）默认**不可信**：可能是 NaN、Infinity、undefined、空数组。
- 每个 `update(dt)` 入口第一行做输入 clamp/sanitize。
- 顶层有一个 `safeFrame()` 包一层 try/catch，捕获后写 `console.error` 并继续下一帧，**绝不中断 rAF**。

## P3 · 降级路径必须存在且被测试过

| 失败 | 降级 | 谁负责 |
|---|---|---|
| WebGPU 不可用 | three.js `WebGPURenderer` 自动回退 WebGL2 backend | runtime |
| `parts.json` 缺失/损坏 | 程序化占位几何（胶囊/盒子），**应用照常运行** | runtime |
| 单个 `.glb` 加载失败 | 该槽位退回占位几何，其他槽位不受影响 | runtime |
| 追踪丢失 < 1s | 保持最后姿态，轻微 idle 漂移 | runtime |
| 追踪丢失 > 1s | 进入 LEAVING → 溶解 | runtime |
| Hyper3D API 失败 | 慢回路静默放弃，快回路完全不受影响 | factory/runtime |
| 摄像头权限被拒 | 显示一行提示 + 用录制的 pose 数据回放（demo 模式） | runtime |

**`assets/parts/parts.json` 不存在时应用必须能跑。** 这条是硬性的：
它让「运行时开发」和「资产生产」可以完全并行，互不阻塞。

## P4 · 单位与坐标系只定义一次

见 `docs/04-SPEC-rig-and-attach.md` §1。摘要：

- **单位：米。** 所有长度、位置、速度都是米/米每秒。不允许出现像素。
- **坐标系：three.js 右手系，Y-up，-Z 指向屏幕内。**
- **镜像在且仅在一个地方发生**：`mediapipeToWorld()`。之后所有代码都活在已镜像的世界里。
- 任何函数如果做了坐标转换，函数名里必须带 `To`（`mediapipeToWorld`、`worldToScreen`）。

## P5 · 性能预算是需求，不是优化

目标：**1440p / 60fps / MacBook Pro M 系列**。

| 项 | 预算 |
|---|---|
| 屏上部件实例总数 | ≤ 64 |
| 三角形总数 | ≤ 250k |
| 单个部件 glb | ≤ 5k tris, ≤ 1.5 MB |
| draw call | ≤ 40 |
| CPU 每帧 JS | ≤ 4 ms |
| 推理（MediaPipe） | 独立于渲染，≥ 30 Hz，延迟 ≤ 60 ms |

超预算的模块不合并。`packages/app/src/debug/stats.ts` 里有实时读数，按 `` ` `` 键开关。

## P6 · 一个任务 = 一个文件 + 一个验收标准

任务卡（`docs/10-TASKS.md`）的格式是固定的：

```
### T-xx 标题
- 文件: packages/.../foo.ts       ← 只碰这个文件（和它的测试）
- 依赖: T-yy 已完成
- 契约: 从 types.ts 里 import 这些类型，不要重新定义
- 做什么: ...
- 不要做: ...
- 验收: `npm run test -w @sb/core -- foo` 通过，且 <可观察的现象>
```

- **不要顺手重构别的文件。** 看到别处有 bug，写进任务输出，不要动手。
- **不要引入新的运行时依赖。** 需要就在输出里申请，理由写清。devDependency 同理。
- **不要加抽象层。** 这是一个要在 48 小时后被扔掉或被展出的项目，不是一个要维护五年的库。

## P7 · 每个模块自带可运行的证据

- `packages/core` 的每个模块配一个 `*.test.ts`，用 node 内置 `node:test` + `node:assert`，零依赖。
- 视觉/交互类改动的"证据"是**截图或 10 秒录屏**，放进 `scratch/evidence/`，在输出里引用。
- "我觉得应该能跑" ≠ 证据。没有证据的任务视为未完成。

## P8 · 秘密只在一个地方

- `RODIN_API_KEY` 只从 `.env` 读，只在 `packages/factory` 里用，**永远不进浏览器包**。
- 任何文件里出现硬编码的 key = 立即回退。
- 慢回路需要从浏览器触发生成时，走本地 `packages/factory` 起的 localhost 代理，key 留在 Node 侧。

## P9 · 确定性与可复现

- 部件生成（factory）用固定 `seed`，`recipes/*.json` 是唯一真相，生成结果记录在 `assets/raw/ledger.json`。
- 已成功的 recipe **不重复生成**（省 credits，也保证资产稳定）。
- 运行时的一个身体完全由 `Genome { seed, tier }` 决定。给定 seed 必须像素级复现。

## P10 · 现场优先

任何"更优雅但现场更容易出事"的方案，一律不选。具体化：

- 不依赖网络（慢回路是唯一例外，且失败不影响主体验）。
- 不依赖登录、不依赖云端状态。
- 启动 = 打开一个 URL，全屏，结束。不需要终端里敲第二条命令。
- 有 `?demo=1` 模式：无摄像头也能放一段录好的 pose 回放，用于评委演示和断网兜底。
