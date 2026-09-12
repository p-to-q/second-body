# 参考图来源 —— `screenface`（Loona（KEYi Tech））

> 🐱 桌宠 / screen-face creature　·　抓取日期 **2026-09-13**　·　结论：**未找到合规来源**

验收标准是 `docs/30-ASSET-INTAKE.md` §2。下面每一条都写了**过没过、为什么**，
因为图不进版本库（`.gitignore` 有意为之），这份文件就是唯一能重放的记录。

## 收下的图

**没有。** 下面记的是查过的每一条路和它们为什么不行 —— 
`docs/30` §2 说得很清楚，不合格的图不要放进来。`196f527` 那一批就是这么烧掉的。

## 查过的来源（按 `docs/30` 的优先级）

### KEYi Tech Loona 产品页

`https://www.keyirobot.com/products/loona`

页面存在（HTTP 200），但 curl 握手时 `SSL_ERROR_SYSCALL`（站点对非浏览器 UA 不稳定）。浏览器打开正常。Loona 是消费品，商品页有白底棚拍图的概率很高。

### Commons

已查：没有任何 Loona 条目。

## 怎么再抓一遍

按上面的路线逐条试。**不要为了凑数随便抓一张** —— 
这个条目现在走纯文字 prompt（见同目录 `prompt.md`）是正确的状态，不是缺口。
