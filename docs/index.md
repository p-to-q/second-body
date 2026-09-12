# docs index

## 契约（改代码前必须服从）
| 文件 | 管什么 | 谁必须读 |
|---|---|---|
| `02-ENGINEERING-PRINCIPLES.md` | 全项目宪法：P0–P10 | 所有人 |
| `03-SPEC-part-library.md` | `parts.json` 磁盘格式、规范化保证 | 资产流水线 + 运行时 |
| `04-SPEC-rig-and-attach.md` | 坐标系、单位、骨架拓扑、挂载数学 | 任何碰几何/姿态的人 |
| `05-SPEC-genome-and-evolution.md` | genome 抽取、运动特征、演化、生命周期 | 形态/交互 |
| `06-SPEC-runtime-protocol.md` | 模块间接口、慢回路 HTTP 协议 | 跨模块工作 |
| `12-SPEC-themes.md` | 六个主题、anchor 一致性流程、开场选择页 | 资产 + 开场页 |
| `packages/core/src/types.ts` | 运行时所有共享类型（**冻结**） | 所有人 |

## 背景（是 context，不是 contract）
| 文件 | 内容 |
|---|---|
| `00-PROJECT-BRIEF.md` | 意图、对原作的逆向结论、成功判据、非目标 |
| `01-ARCHITECTURE.md` | 全景图、分层、ADR 摘要、并行泳道 |
| `07-HYPER3D-API.md` | Rodin API 事实卡（实测，不是记忆） |
| `08-OPEN-SOURCE-BASE.md` | 开源底座清单与取舍、Plan B |
| `09-RISKS-AND-UNKNOWNS.md` | 不确定性登记册 + 现场风险 |
| `13-DEPLOY.md` | 现场形态 vs 网页形态、Vercel、体积与隐私 |

## 状态与流水
| 文件 | 内容 |
|---|---|
| `10-SURFACES.md` | **什么真的跑通了** —— 唯一可信的状态表 |
| `11-TASKS.md` | 可分派的任务卡 |
| `CHANGES.md` | durable 变更的 append-only 记录 |
