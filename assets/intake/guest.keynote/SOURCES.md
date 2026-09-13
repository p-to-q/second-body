# 参考图来源 —— `guest.keynote`

> 抓取日期 **2026-09-13** · 来源：MiniMax Design 图片生成

| 文件 | 来源 | 版权 | 说明 |
|---|---|---|---|
| `merino-knit-outfit.png` | MiniMax Design 图片生成（Design Image 2.5 Sunburst），2026-09-13 | AI 生成，无第三方权利 | 1728×2304。一次生成、一次采用。 |

**提交的 prompt 原文（任务给定，原样提交）：**

> A studio product photograph of a plain fine-gauge merino knit crewneck sweater in muted heather grey-green, photographed on an invisible mannequin so it holds a human torso shape, paired with dark charcoal slim trousers and plain white leather sneakers. Soft fabric folds and gentle drape, ribbed cuffs, matte wool fibre texture, absolutely no logo and no text, no face, no head, no hands. Plain flat light-grey seamless studio background, soft even diffuse lighting, no hard shadows, single subject, whole garment inside frame with margin.

**生成记录：** 一次过。agent 自选 3:4 竖幅。invisible-mannequin 生效 —— 无头、无脸、无手，衣服自己撑出躯干形状；无 logo 无文字；浅灰无缝背景、平光。这一条的关键是**布料的垂坠和罗纹收口要可读**（部件生成时织物褶皱会被当成结构），这张上袖口罗纹和衣身褶皱都清楚。

## 2026-09-13 实际发出去的是什么

| 文件 | 怎么来的 | 用途 |
|---|---|---|
| `_orig/merino-knit-outfit.png` | 原图，1728×2304 | 留档，不进管线（`loadRefs` 只读目录本层） |
| `merino-knit-outfit-segment.png` | 原图裁 `(0, 100) – (1728, 905)`，1728×805 | **实际发给 Rodin 的那一张**，sha256 `06b26b943ba8cf0b…` |

裁掉裤子和鞋，只留毛衣（领口到下摆罗纹、含两只袖口）。理由是 §3 的「一张图里
最好只有一种主材质」加 §5.5 的「槽位要的是身体的一段」—— 原图是三种材质
（羊毛 / 斜纹布 / 皮革）拼的一整套衣服。

**结果**：六件全部成立，织物那条技术轴真的落地了（`docs/39 §4` 第 1 条预判是
「大概率还是落在勉强那一档」，这一次比预判好）。代价同 `char.diva`：
每个槽位拿到的都是**一件完整的毛衣**而不是一段身体，只是毛衣被压进细长 bbox 之后
恰好读成了袖子和裤腿。见 `docs/30 §5.5`。
