# 参考图来源 —— `patrol`（Spot（Boston Dynamics））

> 🐕 机器狗 / 定义 quadruped archetype　·　抓取日期 **2026-09-13**　·　结论：**未找到合规来源**

验收标准是 `docs/30-ASSET-INTAKE.md` §2。下面每一条都写了**过没过、为什么**，
因为图不进版本库（`.gitignore` 有意为之），这份文件就是唯一能重放的记录。

## 收下的图

**没有。** 下面记的是查过的每一条路和它们为什么不行 —— 
`docs/30` §2 说得很清楚，不合格的图不要放进来。`196f527` 那一批就是这么烧掉的。

## 查过的来源（按 `docs/30` 的优先级）

### Boston Dynamics Spot 产品页

`https://bostondynamics.com/products/spot/`

图直链全部可枚举（`https://bostondynamics.com/wp-content/uploads/<年>/<月>/<名>.jpg`）。已看过文件名清单：全部是工地/变电站/地铁隧道的现场作业照，无一张棚拍。

### Boston Dynamics Brandfolder

`https://brandfolder.com/bostondynamics`

官方品牌资产库，**需登录**。Spot 的白底棚拍图几乎肯定在里面。

### Commons `Category:Spot (robot)`

`https://commons.wikimedia.org/wiki/Category:Spot_(robot)`

38 个文件，全部是会展/实验室/政府活动的现场照。已核验最大的 `SpotMini_02_by-dpc.jpg`（CC BY 4.0, 9248×6936）：人群背景 + 机身上加装了三个第三方载荷盒 + 趴姿 + 硬阴影。四条不过。

## 怎么再抓一遍

按上面的路线逐条试。**不要为了凑数随便抓一张** —— 
这个条目现在走纯文字 prompt（见同目录 `prompt.md`）是正确的状态，不是缺口。

---

## AI 生成参考图（2026-09-13 追加）

| 文件 | 来源 | 版权 | 说明 |
|---|---|---|---|
| `yellow-field-robot-product-shot.png` | MiniMax Design 图片生成（Design Image 2.5 Sunburst），2026-09-13 | AI 生成，无第三方权利 | 2304×1728。见下方 prompt 原文与生成记录。 |

**提交的 prompt 原文：**

> A studio product photograph of a headless quadruped field robot standing square on all four legs in a neutral stance, seen from a slight three-quarter front angle. Engineering-yellow injection-moulded body shells over matte black machined joint drums, a long low box-shaped torso, bulging knee-motor drums, slim tubular shanks, protective bumper ribs and a few exposed hex bolts, small rubber foot pads, no face and no decorative surfaces. Plain flat light-grey seamless studio background, soft even diffuse lighting, no hard shadows, no props, no text, no logo, single subject, whole subject inside frame with margin.

**生成记录：** 一次生成、一次采用。agent 选了 4:3 横幅 —— 对四足躯干是对的（`prompt.md` 提醒近立方 bbox 会抄成小躯干，横幅参考图正好把躯干拉长）。黄壳/黑关节/无头三要素齐全。
