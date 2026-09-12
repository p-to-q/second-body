# 参考图来源 —— `petbot`（Aibo ERS-1000（Sony））

> 🐶 宠物 / artificial life　·　抓取日期 **2026-09-13**　·　结论：**未找到合规来源**

验收标准是 `docs/30-ASSET-INTAKE.md` §2。下面每一条都写了**过没过、为什么**，
因为图不进版本库（`.gitignore` 有意为之），这份文件就是唯一能重放的记录。

## 收下的图

**没有。** 下面记的是查过的每一条路和它们为什么不行 —— 
`docs/30` §2 说得很清楚，不合格的图不要放进来。`196f527` 那一批就是这么烧掉的。

## 查过的来源（按 `docs/30` 的优先级）

### Sony aibo 官网（日 / 美）

`https://aibo.sony.jp/ ・ https://us.aibo.com/`

两站都是 JS 渲染，HTML 里只有一张 OGP 图。要拿白底产品图必须开浏览器手动存。aibo 是**消费电子产品**，官网商品页几乎必然有纯白底棚拍图 —— 这是最可靠的一条路。

### Commons

`https://commons.wikimedia.org/w/index.php?search=intitle%3Aaibo+robot&ns6=1`

已核验最大的 `Aibo (robotic dog).jpg`（CC BY 2.0, 6720×3780）：画面里**两只 aibo**（一只趴着一只站着）+ 地毯 + 红墙 + 浅景深。不过。其余 `Aibo ichigo 01-03.jpg`（CC BY-SA 4.0, 4000×3000）未逐张核验。

## 怎么再抓一遍

按上面的路线逐条试。**不要为了凑数随便抓一张** —— 
这个条目现在走纯文字 prompt（见同目录 `prompt.md`）是正确的状态，不是缺口。

---

## AI 生成参考图（2026-09-13 追加）

| 文件 | 来源 | 版权 | 说明 |
|---|---|---|---|
| `glossy-pet-robot.png` | MiniMax Design 图片生成（Design Image 2.5 Sunburst），2026-09-13 | AI 生成，无第三方权利 | 1024×1024。见下方 prompt 原文与生成记录。 |

**提交的 prompt 原文：**

> A studio product photograph of a small glossy quadruped pet robot standing square on four legs facing camera. Pearlescent white injection-moulded consumer-electronics body with rounded organic-electronic volumes, crisp parting lines, thin articulated ears and a thin tail of the same material, two black oval OLED eyes, a little dark grey rubber showing at the joints, an elongated low body. Plain flat light-grey seamless studio background, soft even diffuse lighting, no hard shadows, no props, no text, no logo, single subject, whole subject inside frame with margin.

**生成记录：** 一次生成、一次采用。agent 选了 1:1，长边 1024 —— **刚好卡在硬要求下限**，如果后面要放大重出，这条最该重做。珠光白注塑 + 黑椭圆眼 + 薄片耳尾都在。
