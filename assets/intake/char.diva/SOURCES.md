# 参考图来源 —— `char.diva`

> 抓取日期 **2026-09-13** · 来源：MiniMax Design 图片生成

| 文件 | 来源 | 版权 | 说明 |
|---|---|---|---|
| `holographic-performer-v1.png` | MiniMax Design 图片生成（Design Image 2.5 Sunburst），2026-09-13 | AI 生成，无第三方权利 | 1664×2496。生成 2 次，采用第 2 次。**带一个圆形展示基座，不完全满足「无道具」** —— 见下。 |

**提交的 prompt 原文（任务给定，原样提交）：**

> A full-body studio render of a translucent holographic performer figure, standing straight facing camera. Frosted translucent acrylic body with internal teal emissive glow running along thin channels, slender elongated proportions, long trailing ribbon-like elements falling from the head, polished edges. Weightless, no visible face detail. Plain flat light-grey seamless background, soft even diffuse lighting, no hard shadows, no props, single subject, whole figure inside frame with margin.

**生成记录：** 第 1 次被内容安全审核拒（已退 200 积分）—— MiniMax 自己说「刚才的描述触发了内容审核」，猜测是 "performer figure" + 人形轮廓的组合。它保留材质/发光/构图，改用「抽象展示雕塑」的说法重跑，第 2 次通过。画幅是我回答的 2:3 竖幅。

**⚠️ 这张的已知问题：** 重写成「展示雕塑」的副作用是模型给它加了一个**圆形展示基座**。硬要求里写了「无道具」，基座算道具，而且对 image-to-3D 是实打实的污染 —— Rodin 会把基座当成身体的一部分挤出来。所以：

- 已经发了第二轮请求（只改一点：去掉基座，其余不动），文件名会是 `holographic-performer-v2.png`。**如果 v2 干净，就用 v2，把 v1 删掉。**
- 如果 v2 也带基座或者没跑出来，**退而求其次是把 v1 的基座裁掉**（构图上基座在最下方、边界清楚，裁完主体仍完整）—— 跟 `char.tokusatsu` 用的是同一招：参考图只需要回答「什么材质、怎么鼓起来的」。

## 2026-09-13 实际发出去的是什么

`holographic-performer-v2.png` **没有出现**。按上面写好的退路，把 v1 的圆形基座裁掉：

| 文件 | 怎么来的 | 用途 |
|---|---|---|
| `_orig/holographic-performer-v1.png` | 原图，1664×2496 | 留档，不进管线（`loadRefs` 只读目录本层） |
| `holographic-performer-v1-segment.png` | v1 裁 `(0, 430) – (1664, 1800)`，1664×1370 | **实际发给 Rodin 的那一张**，sha256 `613e259afab6a705…` |

裁掉的是**头和基座**：基座是道具（§2 硬要求里的「无道具」），头是为了让参考图从
「一个完整的人形」退回「身体的一段」（§5.5）。留下的是胸腹髋 + 大腿 + 全部飘带。

**结果见 `docs/30 §5.5` 末尾新增的那一段。** 一句话：材质和飘带都拿到了，
但裁到这个程度**仍然不够** —— 六个槽位各拿到了一具缩小的整人，
`joint.char.diva.a` 因此被 reject（`assets/parts/curation.json`）。
