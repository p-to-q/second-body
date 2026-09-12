# 参考图来源 —— `industrial`（Figure 03（Figure AI））

> 🧍 产品人 / 工业 humanoid 产品化　·　抓取日期 **2026-09-13**　·　结论：**未找到合规来源**

验收标准是 `docs/30-ASSET-INTAKE.md` §2。下面每一条都写了**过没过、为什么**，
因为图不进版本库（`.gitignore` 有意为之），这份文件就是唯一能重放的记录。

## 收下的图

**没有。** 下面记的是查过的每一条路和它们为什么不行 —— 
`docs/30` §2 说得很清楚，不合格的图不要放进来。`196f527` 那一批就是这么烧掉的。

## 查过的来源（按 `docs/30` 的优先级）

### Figure 官网

`https://www.figure.ai/`

已查：站点是 Next.js + Contentful，HTML 里只出到 logo 和 footer 底图，机器人图全部由 JS 注入。curl / WebFetch 都取不到直链。要抓必须开浏览器手动存。

### Figure 03 发布文

`https://www.figure.ai/news/introducing-figure-03`

页面本身可访问（HTTP 200），棚拍图在页面里。**这是最可能过 §2 的一张**：Figure 03 的官方发布图是浅灰无缝背景、正面、全身、平光。手动存这一张。

### Wikimedia Commons

已查：没有 Figure 机器人的任何条目。

## 怎么再抓一遍

按上面的路线逐条试。**不要为了凑数随便抓一张** —— 
这个条目现在走纯文字 prompt（见同目录 `prompt.md`）是正确的状态，不是缺口。
