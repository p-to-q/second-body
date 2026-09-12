# 07 · Hyper3D / Rodin API — 事实卡

> 2026-09-12 实读官方文档 + 实际打过接口后整理。**以本文为准，不要凭记忆写客户端。**
> 官方文档：https://docs.hyper3d.ai/en

## 0. 已验证的账号状态

```
GET https://api.hyper3d.com/api/v2/check_balance
Authorization: Bearer $RODIN_API_KEY
→ {"balance": 213}
```
基础生成 **0.5 credits/次** → 当前余额约 **420 次**。部件库预算 ≤ 120 次（60 credits）。

## 1. 三步生命周期

```
POST /api/v2/rodin      (multipart/form-data)  → { uuid, jobs:{uuids[], subscription_key}, consumed }
POST /api/v2/status     {subscription_key}     → { jobs:[{uuid,status,queue_length}] }
POST /api/v2/download   {task_uuid}            → { list:[{name,url}] }   ← 签名 URL
```

**⚠️ 两个 ID 不能搞混（最常见的错误）：**
- `/status` 收 `jobs.subscription_key`
- `/download` 收 **顶层** `uuid` 作为 `task_uuid`
- 搞反 → `NO_SUCH_TASK`

**⚠️ 应用层错误走 body 不走 HTTP 状态码：**
被拒绝的提交**依然返回 HTTP 201**，原因在 `error` 字段。
> 合法的成功判定 = `HTTP 2xx` **且** `error` 为空 **且** 顶层 `uuid` 非空。
> 只看 HTTP 状态码的客户端会去轮询一个根本不存在的任务。

Job 状态机：`Waiting → Generating → Done | Failed`。
`Waiting` 时可能附带 `queue_length`（前面排队数量）。

## 2. 关键请求参数（Gen-2.5，`POST /api/v2/rodin`）

| 参数 | 我们的取值 | 说明 |
|---|---|---|
| `tier` | **必填** `Gen-2.5-Low` | 文档原话："Clean assets and small hard-surface props" —— 正是我们要的。**省略会退回 Gen-1/1.5 的 `Regular`** |
| `prompt` | 见 `recipes/` | text-to-3D 时必填；image-to-3D 时是方向性引导 |
| `images` | 慢回路用 | 1–5 张，第一张用于材质生成 |
| `mesh_mode` | `Raw` | 三角面。`Quad` 是四边面（Gen-2.5 默认 Raw） |
| `quality_override` | **`3000`** | 目标面数，500–2,000,000。比 `quality` 枚举精确。（`quality=extra-low` 在 Raw 下是 20000，对我们太重） |
| `material` | `PBR`（首批）/ `None`（批量） | `None` 明显更快。最终渲染我们统一套自己的材质（见 03 §4） |
| `geometry_file_format` | `glb` | 默认值 |
| `seed` | recipe 里固定 | 0–65535。**确定性的来源** |
| `bbox_condition` | `[w,h,l]` | 三个 1–2048 的整数，控制比例。**这是我们控制"手臂是细长的、躯干是宽的"的主要手段** |
| `is_symmetric` | `symmetric`/`balanced` | 肢体件用 `symmetric`，躯干用 `balanced` |
| `geometry_instruct_mode` | `faithful` | 默认是 `creative`。我们要**风格一致**，所以用 `faithful` |
| `texture_mode` | 默认（跟 tier） | 不动 |
| `TAPose` | `false` | 只在生成整具人形时才有意义 |
| `image_label` | 慢回路可用 | 每张图的视角标签：`F/FL/FR/B/BL/BR/L/R/U/D/?` |

**计费（可叠加）**：基础 0.5 credits；`tier=Gen-2.5-Extreme-High` +0.5；`texture_mode=extreme-high` +2.0。
我们用的组合 = **0.5 credits/件**。

### bbox_condition 用法
`[Width(X), Height(Y), Length(Z)]`，整数 1–2048，只表达**比例**（相对盒子）。
我们的槽位映射（部件主轴最终会被规范化到 +Y，所以让 Y 为长轴）：

| slot | bbox (x,y,z) |
|---|---|
| upperArm / foreArm / thigh / shin | `[100, 320, 100]` 细长 |
| spine（躯干） | `[420, 500, 260]` |
| head | `[260, 280, 300]` |
| hand / foot | `[160, 200, 320]` |
| clavicle | `[120, 220, 120]` |
| joint | `[200, 200, 200]` |

## 3. 错误码与重试策略

| code | 处理 |
|---|---|
| `API_PARALLELISM_LIMIT_REACHED` | **账号并发上限**。等一个任务完成再提交 → 客户端必须有并发闸门（我们设 `MAX_INFLIGHT=3`，遇到该错自动降到 1） |
| `API_INSUFFICIENT_FUNDS` | 立即停止整批，报警 |
| `INVALID_REQUEST` | 不重试，记进 ledger 的 `error`，跳过 |
| `API_OBJECT_NOT_FOUND_ON_IMAGE` | 慢回路：剪影图没检测到物体 → 换一帧重试一次 |
| `IMAGE_CONTENT_VIOLATION` | 不重试（慢回路要对观众友好地静默失败） |
| `NO_SUCH_TASK` | 检查是不是两个 ID 用反了 |
| HTTP 429 | **必须读 `Retry-After` 头**并等待该秒数。不要硬编码任何 QPS |
| HTTP 5xx | 指数退避重试，最多 4 次 |

轮询节奏：首次等 **5s**，之后 **3s** 一次，总超时 **8 分钟**（超时记 failed，不要无限等）。
`/status` 的限流比 `/rodin` 宽松得多，但也别 1s 一轮。

### 文档没写、实测踩到的三件事

1. **数组字段必须是 JSON 字符串**，不能用重复的 form 字段。
   `-F 'image_label=?'` 会得到 `HTTP 500` + `SyntaxError: Unexpected token '?'` ——
   服务端直接对该字段做 `JSON.parse`。正确写法：`-F 'image_label=["?"]'`。
   `bbox_condition`、`addons` 同理。
   **注意这个错误是 500 不是 400**，很容易被当成服务端抖动而盲目重试（我们就踩了一整批）。

2. **`preview_render=true` 会多出一个 job，而这个 job 恒定 Failed**（Gen-2.5-Low 与 Medium 都试过），
   几何 job 本身是好的。两个后果：
   - 等待逻辑必须支持"部分失败"（`waitForDone({allowPartial:true})`），
     否则一个渲染 job 会把整单几何一起丢掉；
   - 拿不到主题参考图，只能自己渲（见 docs/12 §3）。

3. **`quality_override` 不是硬保证。** 实测 50 件里有 2 件返回了未减面的原始网格
   （1,515,338 和 439,286 tris），而且顶点完全未焊接 —— meshoptimizer 对未焊接网格收不动。
   → 流水线必须自带「容差焊接 + 逐级放宽误差的减面」兜底。这不是优化，是必需品。

## 4. 我们的两条用法

### A. 离线部件工厂（主力）
`recipes/*.json` → text-to-3D（或一张统一的风格参考图 + image-to-3D）→ 规范化 → `parts.json`。
固定 seed + `faithful` + 统一 prompt 后缀来保证风格一致。

### B. 现场慢回路（作品的差异化）
观众剪影 PNG（MediaPipe Image Segmenter 输出的 mask，抠成白底黑形）→ image-to-3D
→ 30–90s 后得到"属于这个人"的一块部件 → 热插拔到 `spine` 或 `head` 槽位。
- 客户端浏览器**不直接调 Hyper3D**（P8）：走 `packages/factory` 的 `localhost:8787` 代理。
- 失败 = 静默放弃，快回路无感知。
- 每人最多触发 1 次，前置冷却 20s，防止刷爆 credits。

## 5. 已知未知（见 09）
- U4：`material=None` 与 `PBR` 的几何质量是否有差别？（省时间 vs 保留贴图参考）—— 仍未测
- U5 ✅ **已解决**：`bbox_condition` 对 Gen-2.5-Low 约束很强。请求 `[100,320,100]` 实得
  `(0.60, 1.88, 0.58)`，比例误差 < 3%。这是控制部件比例最有效的手段。
- U6 🟡：纯文字生成的同主题一致性"够用但不够齐"；已改为 anchor 图走 image-to-3D（docs/12 §3）。
- U7：账号并发上限具体是多少？（文档不公开；实测 concurrency=3 从未触发
  `API_PARALLELISM_LIMIT_REACHED`）
