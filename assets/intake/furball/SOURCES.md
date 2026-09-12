# 参考图来源 —— `furball`（Moflin（Casio））

> 🐹 毛球 / emotional creature　·　抓取日期 **2026-09-13**　·　结论：**未找到合规来源**

验收标准是 `docs/30-ASSET-INTAKE.md` §2。下面每一条都写了**过没过、为什么**，
因为图不进版本库（`.gitignore` 有意为之），这份文件就是唯一能重放的记录。

## 收下的图

**没有。** 下面记的是查过的每一条路和它们为什么不行 —— 
`docs/30` §2 说得很清楚，不合格的图不要放进来。`196f527` 那一批就是这么烧掉的。

## ⚠️ 这个条目要特别注意

毛球是 §3「让轮廓说话」最难满足的一个 —— 它的毛边本来就是糊的。找图时**优先纯白底**，让毛和背景有最大反差；灰底会把轮廓吃掉。

## 查过的来源（按 `docs/30` 的优先级）

### Casio Moflin 官网

`https://moflin.casio.com/`

**已查：该域名 TLS 证书与主机名不匹配，curl 直接连不上。**从浏览器访问（会有证书警告）或走 `https://www.casio.com/` 的产品目录。

### Commons

`https://commons.wikimedia.org/wiki/File:Casio%E3%81%AEAI%E3%83%9A%E3%83%83%E3%83%88%E3%83%AD%E3%83%9C%E3%80%8CMoflin%E3%80%8D.jpg`

唯一一张，CC BY-SA 4.0，4284×5712。已核验：**被一只手托着**，背景是展台（小板凳、绿地毯、另一只灰色 Moflin、说明牌）。多物体 + 杂背景，不过。

## 怎么再抓一遍

按上面的路线逐条试。**不要为了凑数随便抓一张** —— 
这个条目现在走纯文字 prompt（见同目录 `prompt.md`）是正确的状态，不是缺口。

---

## AI 生成参考图（2026-09-13 追加）

| 文件 | 来源 | 版权 | 说明 |
|---|---|---|---|
| `furry-companion-robot.png` | MiniMax Design 图片生成（Design Image 2.5 Sunburst），2026-09-13 | AI 生成，无第三方权利 | 1152×864。见下方 prompt 原文与生成记录。 |

**提交的 prompt 原文：**

> A studio product photograph of a small emotional companion robot shaped like a rounded ball of soft fur: dense pale cream long-pile fur covering the whole body, no visible limbs, no visible face, one tiny dark sensor gleam, palm-sized, soft and tactile. Plain flat light-grey seamless studio background, soft even diffuse lighting, no hard shadows, no hands holding it, single object centred with margin.

**生成记录：** 一次生成、一次采用。任务给的 prompt 原样提交。无手、无脸、无四肢，只有一点传感器暗光 —— 正是 docs/31 点名要拉开的「形态最不像」那一类。
