# 参考图来源 —— `softwear`（NEO（1X））

> 🧥 家庭人 / soft humanoid　·　抓取日期 **2026-09-13**　·　结论：**未找到合规来源**

验收标准是 `docs/30-ASSET-INTAKE.md` §2。下面每一条都写了**过没过、为什么**，
因为图不进版本库（`.gitignore` 有意为之），这份文件就是唯一能重放的记录。

## 收下的图

**没有。** 下面记的是查过的每一条路和它们为什么不行 —— 
`docs/30` §2 说得很清楚，不合格的图不要放进来。`196f527` 那一批就是这么烧掉的。

## ⚠️ 这个条目要特别注意

NEO 是**唯一一个 §3「不要给穿衣服的照片当参考」直接撞上的条目** —— 它本来就穿着针织衫。这不是缺陷，这就是这个物种：布料褶皱在这里**应该**被当成结构。喂图时不要挑动作幅度大的姿势，褶皱越少越好。

## 查过的来源（按 `docs/30` 的优先级）

### 1X NEO 产品页

`https://www.1x.tech/neo`

图托管在 Sanity CDN，直链可枚举（`https://cdn.sanity.io/images/qka6yvsc/production/<hash>-<w>x<h>.webp`）。已逐张查过两张最像全身像的：`ee557c73…-1069x2293`（半身裁切 + 画面边缘有第二台 NEO 的手臂）、`f0e1b1c6…-2731x4096`（NEO 和真人模特背靠背）—— **两张都不过 §2**。

### 1X 全站其余 Sanity 图

`https://cdn.sanity.io/images/qka6yvsc/production/`

还有 `8353aa03…-4096x2730`、`c1a93f30…-4096x2731`、`f195d31c…-3351x2234` 未核验，但 1X 的全部视觉都是时装摄影调子（有人、有场景、有硬侧光），过 §2 的概率低。

## 怎么再抓一遍

按上面的路线逐条试。**不要为了凑数随便抓一张** —— 
这个条目现在走纯文字 prompt（见同目录 `prompt.md`）是正确的状态，不是缺口。

---

## AI 生成参考图（2026-09-13 追加）

| 文件 | 来源 | 版权 | 说明 |
|---|---|---|---|
| `knitted-home-robot.png` | MiniMax Design 图片生成（Design Image 2.5 Sunburst），2026-09-13 | AI 生成，无第三方权利 | 1728×2304。见下方 prompt 原文与生成记录。 |

**提交的 prompt 原文：**

> A full-body studio product photograph of a soft humanoid home robot entirely wrapped in a seamless knitted textile sleeve over a slim rigid inner core, standing straight facing camera in a neutral pose. Warm greige wool-feel knit covering the whole body, ribbed knit cuffs marking the joints, no visible mechanism anywhere, the only hard surface is a smooth oval face visor which is also fabric-covered. Plain flat light-grey seamless studio background, soft even diffuse lighting, no hard shadows, no props, no text, no logo, single subject, whole subject inside frame with margin.

**生成记录：** 一次生成、一次采用。prompt 由本目录 `prompt.md` 的形态/材质描述改写为整机视角（`prompt.md` 写的是「肢体段」，不能直接当参考图用），末尾接任务规定的统一背景约束。MiniMax 的 agent 自行选了 3:4 竖幅。满足硬要求：单主体、浅灰无缝背景、平光无硬阴影、全身留边、正面站立。
