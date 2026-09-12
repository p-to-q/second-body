# 参考图来源 —— `droid`（BDX droid（Disney））

> 🤖 小怪物 / character robotics　·　抓取日期 **2026-09-13**　·　结论：**未找到合规来源**

验收标准是 `docs/30-ASSET-INTAKE.md` §2。下面每一条都写了**过没过、为什么**，
因为图不进版本库（`.gitignore` 有意为之），这份文件就是唯一能重放的记录。

## 收下的图

**没有。** 下面记的是查过的每一条路和它们为什么不行 —— 
`docs/30` §2 说得很清楚，不合格的图不要放进来。`196f527` 那一批就是这么烧掉的。

## ⚠️ 这个条目要特别注意

**这个条目有 clearance 问题，不只是找图问题。** BDX 是迪士尼的角色 IP，roster 里 `droid` 的 clearance 是 `own`，说明它取的是「角色机器人」这个**造型传统**，不是 BDX 这台具体的机器。喂 BDX 的照片进 image-to-3D 会让生成结果**贴近具体 IP**，这跟 docs/14 §1 划的线相反。建议：这一个条目**不喂参考图**，继续走纯文字 prompt。

## 查过的来源（按 `docs/30` 的优先级）

### Disney Parks Blog

`https://disneyparksblog.com/`

BDX 的官方图基本只在 Disney Parks Blog / D23 的活动稿里出现，且全部是主题乐园现场照（人群、夜景、舞台灯）。未逐张核验，但按调性判断过 §2 的概率极低。

### Commons

已查：搜不到任何 BDX / Disney droid 的条目。

## 怎么再抓一遍

按上面的路线逐条试。**不要为了凑数随便抓一张** —— 
这个条目现在走纯文字 prompt（见同目录 `prompt.md`）是正确的状态，不是缺口。
