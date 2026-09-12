# Agent Instructions — SECOND BODY

实时交互艺术装置：摄像头 → 人体姿态 → 刚体部件挂载 → WebGPU 渲染，
外加一条把观众剪影送去 3D 生成模型的慢回路。
TS（靠 Node type-stripping 直接跑 `.ts`，无编译步骤）+ three.js WebGPU + Node 资产流水线。

## 读取路线（只读改动需要的那部分）

1. `docs/00-PROJECT-BRIEF.md` — 总是读，30 秒
2. `docs/02-ENGINEERING-PRINCIPLES.md` — 任何非平凡改动前读
3. 改部件/资产格式 → `docs/03-SPEC-part-library.md`
4. 改骨架/坐标/挂载 → `docs/04-SPEC-rig-and-attach.md`（**最容易出隐性 bug 的地方**）
5. 改演化/基因/生命周期 → `docs/05-SPEC-genome-and-evolution.md`
6. 跨模块接口 → `docs/06-SPEC-runtime-protocol.md`
7. 边界/分层问题 → `docs/01-ARCHITECTURE.md`
8. 调 Hyper3D → `docs/07-HYPER3D-API.md`（**不要凭记忆写客户端**）
9. 改主题/开场选择页 → `docs/12-SPEC-themes.md`
10. 做网页部署 → `docs/13-DEPLOY.md`
11. 现场/风险 → `docs/09-RISKS-AND-UNKNOWNS.md`

`docs/08-OPEN-SOURCE-BASE.md` 是背景，不是契约。
`docs/10-SURFACES.md` 是"什么真的跑通了"的唯一真相 —— 动完代码要更新它。
`docs/11-TASKS.md` 是任务卡。

## 不变量

- **帧循环里永不抛异常**；每条降级路径必须存在且被跑过（P2/P3）。
- **单位与坐标系只在 `docs/04-SPEC` 定义一次**，别处不重复定义、不打补丁。
- `packages/core` 不许 import `three`、不许碰 `window`/`fs`。依赖只能向下。
- 所有随机来自传入的 `Rng`，所有时间来自传入的 `dt`。禁止 `Math.random()` / 模块内读时钟。
- `parts.json` 不存在时应用必须照常运行（占位几何）。
- 不提交 `.env`、API key、真人素材。
- 不加依赖，除非先写清"为什么平台能力或本地几十行代码更差"。
- `docs/archive/` 是痕迹，不是当前指令。

## 变更纪律

非平凡改动前先写五行：

```
Outcome:    完成后一个人能做什么
Boundary:   改动的最小系统面
Invariants: 必须仍然成立的东西
Proof:      要跑的命令 / 现场验证
Non-goals:  故意排除的相邻工作
```

一次一个连贯改动。不混入无关重构、依赖升级、文件搬家、格式化。
改到 `docs/03` / `docs/04` / `packages/core/src/types.ts` 这三处冻结契约 → **停下来报告，不要自行修改**。

Commit：`<type>(<domain>): <祈使句，小写开头，不加句号>`
type = feat / fix / perf / test / docs / chore；domain 用领域名不用目录名：
`rig` / `genome` / `factory` / `render` / `capture` / `stage` / `protocol`。

## 停止时报告

```
Status:     done / partial / blocked
Scope:      改了什么
Validation: 跑过的确切命令；没跑的写 Not run 加理由
Risks:      可能还不对的地方
Next:       一个具体的下一步
```

**跑过才能说通过。** 没跑的检查写 `Not run` 加理由是完整的答案；说"应该能跑"不是。
合并前的唯一门：`npm run check`。
