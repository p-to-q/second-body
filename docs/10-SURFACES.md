# 10 · Surfaces — 什么真的跑通了

> 这张表是项目状态的**唯一可信来源**。文档写了不等于跑通了。
> 状态只有五档：`stable`（跑通且有证据）/ `experimental`（能跑但没稳）/
> `stub`（只有占位/签名）/ `spec-only`（只有文档）/ `archived`。
>
> 规则：**动完代码就更新这张表。** 证据一栏必须是"跑过的命令"或"截图路径"，不能是"应该可以"。

最后更新：2026-09-12（T-07 Creature 落地后）

## 资产流水线

| 表面 | 状态 | 证据 |
|---|---|---|
| Rodin 客户端（提交/轮询/下载/错误码/429/并发闸门） | `stable` | `npm run factory:generate -- --pilot`：6/6 成功，21–47s/件 |
| 幂等台账 `ledger.json` | `stable` | 第二次 `--dry-run` 报 "需要生成 0 个" |
| 预算闸门（单次 ≤40 credits、余额检查） | `stable` | 代码路径已走通；超额分支 `Not run` |
| 规范化（主轴 +Y / socketA 原点 / 长度 1 / 去贴图 / 单 mesh） | `stable` | `npm run factory:normalize`：6/6 无 warning；2.3MB → ~110KB |
| 长轴朝向自动判定（粗端朝下） | `experimental` | `foot` 判错，已用 `Recipe.flip` 人工覆盖；主题化后需重新复检（T-13） |
| 容差焊接 + 逐级减面兜底 | `stable` | 对 Rodin 返回的 1.5M 面未焊接网格：1,515,338 → 4,884 tris，文件 66 MB → 148 KB |
| 部件契约检查 `npm run check:parts` | `stable` | 50 件 0 错 0 警告；捕获过一次"prune 没跑导致 66 MB"的真实回归 |
| 部件对照表 `/dev/parts.html`（行=槽位，列=变体） | `stable` | 截图见 `scratch/evidence/` |
| 装配预览 `/dev/figure.html`（合成 A-pose × 运行时 PartLibrary/Creature） | `stable` | 已改为驱动真正的运行时模块；`?theme=&seed=&tier=&debug=1`，porcelain/industrial/coral 截图见 `scratch/evidence/creature-*.png`；它抓到了「头被颈骨压扁」这个真 bug |
| 主题 anchor 渲染 `/dev/anchor.html` | `stable` | 5 个主题的 `_anchor.png` 全部生成（porcelain 白 / industrial 黑 / patrol 黄黑 / xeno 深蓝肋 / coral） |
| image-to-3D（以 anchor 图为参考） | `experimental` | 提交路径已验证（HTTP 201）；全主题批量生成进行中 |
| 100 件主题部件库（5 主题 × 10 槽位 × 2 变体） | `experimental` | 生成中 |

## Core（纯逻辑）

| 表面 | 状态 | 证据 |
|---|---|---|
| `types.ts` 冻结契约 | `stable` | 被 core / factory / app 三处共同引用 |
| `attach.ts` 挂载数学（stretch / uniform 双模式） | `stable` | 9 个测试，含 1000 次随机不变式 + 4 种退化输入 + 两种模式 |
| `filter.ts`（OneEuro / emaAlpha / rollingMedian） | `stable` | 4 个测试，含帧率无关性与抗离群值 |
| `presence.ts` 生命周期状态机 | `stable` | 3 个测试，含"离开途中回来不清零" |
| `evolution.ts` 演化 | `stable` | 3 个测试，含阈值抖动与首次升档时机 |
| `rng.ts` / `vec.ts` | `stable` | 被上述测试间接覆盖 |
| `slots.ts`（BoneId→Slot、SLOT_WIDTH） | `stable` | 纯表；已被 `app/src/creature/assemble.ts` 实际消费 |
| `genome.ts` 抽取 | `stable` | 同 seed 两次刷新 genome 深度相等（`/dev/figure.html?seed=1234` 实测）|
| `skeleton.ts` / `stabilize.ts` / `motion.ts` | `spec-only` | 见 `docs/11-TASKS.md` T-02/T-04/T-06 |

## Runtime（浏览器）

| 表面 | 状态 | 证据 |
|---|---|---|
| Vite + `three/webgpu` 渲染栈 | `stable` | `/dev/parts.html` 在 WebGPU 下正常出图 |
| 主程序 `src/main.ts` | `stub` | 只有一行 console.log |
| `src/assets/library.ts` PartLibrary（parts.json + glb + 程序化占位） | `stable` | 把 `parts.json` 改名 → 页面照跑，30 个占位实例（`creature-fallback-no-partsjson.png`）；单个 glb 改名 → 只有那一个槽位退回占位，16/17 正常（`creature-one-glb-missing-head-fallback.png`）|
| `src/creature/assemble.ts` 纯装配（挂载 + 关节盖片） | `stable` | 30 个实例的 `M·(0,0,0)` 与 `bone.p0` 误差 0；stretch 槽位 `M·(0,1,0)` 与 `p1` 误差 0 |
| `src/creature/creature.ts` 实例化渲染 / remorph / graft | `experimental` | 30 实例 · 87k 三角 · 17 draw · `pose()` 0.06–0.21ms；换装最多 3 活并排队（18 槽位 438 帧 = 7.3s 排空）；`graft()` 热插拔 73 帧完成。**只在合成 A-pose 上跑过，没接过真骨架** |
| 摄像头采集 / MediaPipe | `spec-only` | T-01 |
| Stage / 后期 | `spec-only` | T-09 |
| `?demo=1` 回放 | `spec-only` | T-16。**现场兜底依赖它，不能一直是 spec-only** |
| 慢回路（代理 + 热插拔） | `spec-only` | T-17 |
| 开场选择页（dither 轮播） | `spec-only` | T-18。上游代码 MIT 可用，其 `public/` 素材不可用 |
| Web 部署（Vercel + serverless 慢回路） | `spec-only` | T-19，检查单在 `docs/13` §6 |

## 明确还没验证的（见 `docs/09`）

U1 MediaPipe 轴向 · U2 单目深度可用性 · U3 现场灯光 · U4 material=None 的影响 · U6 主题内一致性（anchor 后）· U7 API 并发上限 · U9 目标机帧率 · U10 慢回路端到端耗时

已解决并回填：U5 bbox 约束 · U8 减面 · U11 百万面兜底 · U12 preview_render · U13 数组字段编码
