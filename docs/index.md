# docs index

## 新人（或新代理）从这三份开始

读完这三份就能开始改，**不要**一次读完 `docs/`：

1. [`../AGENTS.md`](../AGENTS.md) —— 读取路线、不变量，以及**开工前的基线自检**
2. [`02-ENGINEERING-PRINCIPLES.md`](02-ENGINEERING-PRINCIPLES.md) —— 宪法 P0–P20，每条附教会我们的那件事
3. [`10-SURFACES.md`](10-SURFACES.md) —— 什么真的跑通了（唯一可信，带证据栏）

然后按本页的表按需取用。所有**可调的数**都在
[`../packages/core/src/tuning.ts`](../packages/core/src/tuning.ts) 一个文件里。

**冻结契约**是 `packages/core/src/types.ts`、`03`、`04` 三处：**不自己改，停下来报告
`contract change needed: <原因>`**，由契约持有者统一改并广播（理由见 P0 / P11）。

## 语言

面向"进来改代码的人"的规范与纪律是**英文**：`../README.md`、`../AGENTS.md`、
[`02-ENGINEERING-PRINCIPLES.md`](02-ENGINEERING-PRINCIPLES.md)、
[`15-ORCHESTRATION.md`](15-ORCHESTRATION.md)、
[`34-REPO-STYLE.md`](34-REPO-STYLE.md)。
它们的中文版**已被取代，不再维护** —— 两份规范一定会漂移，漂移的规范比没有规范更糟；
旧措辞在 git history 里。

作品本身的文档（`PRD` / `00` / `25` / `26` / `27` / `31`）和 `packages/` 里的全部代码注释
**保持中文**：它们记录的是"为什么"，中文写得更准。

## 契约（改代码前必须服从）
| 文件 | 管什么 | 谁必须读 |
|---|---|---|
| `02-ENGINEERING-PRINCIPLES.md` | **全项目宪法**：落点与工艺标准、排优先级的四问、P0–P10、以及这一路踩出来的 P11–P20（每条附教会我们的那件事） | 所有人，反复读 |
| `03-SPEC-part-library.md` | `parts.json` 磁盘格式、规范化保证 | 资产流水线 + 运行时 |
| `04-SPEC-rig-and-attach.md` | 坐标系、单位、骨架拓扑、挂载数学 | 任何碰几何/姿态的人 |
| `05-SPEC-genome-and-evolution.md` | genome 抽取、运动特征、演化、生命周期 | 形态/交互 |
| `06-SPEC-runtime-protocol.md` | 模块间接口、慢回路 HTTP 协议 | 跨模块工作 |
| `12-SPEC-themes.md` | anchor 一致性流程、开场选择页 | 资产 + 开场页 |
| `14-SPEC-roster.md` | 物种谱系、三种 kind、clearance 门、素材策展 | 资产 |
| `16-SPEC-acts.md` | 玩法扩展点：Act / World / Director | 加新玩法 |
| `17-SLOW-LOOP.md` | 慢回路服务端：端点、预算、血统池、失败矩阵、前端接口 | 接慢回路 |
| `23-SPEC-ui.md` | **每个场景的 UI + 全部边界情况** | 任何碰画面的人 |
| `29-SOUND.md` | 声音的四层、各绑哪个信号、现场怎么调、怎么关 | 任何碰声音的人 |
| `packages/core/src/types.ts` | 运行时所有共享类型（**冻结**） | 所有人 |

## 背景（是 context，不是 contract）
| 文件 | 内容 |
|---|---|
| `PRD.md` | 产品定义：观众的 90 秒、三条排他主张、完成的定义、当前最大缺口 |
| `00-PROJECT-BRIEF.md` | 意图、对原作的逆向结论、成功判据、非目标 |
| `01-ARCHITECTURE.md` | 全景图、分层、ADR 摘要、并行泳道 |
| `07-HYPER3D-API.md` | Rodin API 事实卡（实测，不是记忆） |
| `08-OPEN-SOURCE-BASE.md` | 开源底座清单与取舍、Plan B |
| `18-BODY-PLANS.md` | **头号设计缺陷**（物种雷同）的诊断与两档解法 |
| `19/20/22-RESEARCH-*.md` | 调研：形体重定向 / 渲染性能与缓存 / 程序化身体表达 |
| `24-RESEARCH-mocap.md` | 调研：MediaPipe Pose 精度 —— 上游弱点、可移植的后处理、换档取舍 |
| `28-RESEARCH-stage.md` | 调研：舞台美学 —— 同类装置做了什么，以及每条结论对应改哪个参数（四套场景的来路、地平线/接触阴影/反射/粒子的取舍） |
| `09-RISKS-AND-UNKNOWNS.md` | 不确定性登记册 + 现场风险 |
| `13-DEPLOY.md` | 现场形态 vs 网页形态、Vercel、体积与隐私 |
| `30-ASSET-INTAKE.md` | 喂图要求：什么样的参考图能用、为什么（每条都是烧过 credits 买来的） |
| `31-ARCHETYPES.md` | 16 个真实机器人 archetype ↔ roster id 对表：参考图来源、prompt 摘要、bodyPlan 不符清单 |

## 状态与流水
| 文件 | 内容 |
|---|---|
| `10-SURFACES.md` | **什么真的跑通了** —— 唯一可信的状态表 |
| `11-TASKS.md` | 可分派的任务卡 |
| `CHANGES.md` | durable 变更的 append-only 记录 |
| `15-ORCHESTRATION.md` | 并行推进的规则、泳道、合并顺序、踩过的坑（**英文**） |
| `34-REPO-STYLE.md` | p-to-q 的 README 风格对照（每条有出处）与我们的差距（**英文**） |
| `35-VISCOSE.md` | 首屏那个环移植自哪、授权能不能用、GLSL→TSL 逐条差异、签名效果做到了几成 |
