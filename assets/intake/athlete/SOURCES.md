# 参考图来源 —— `athlete`（Atlas（Boston Dynamics））

> 🧍 人 / humanoid 极限运动　·　抓取日期 **2026-09-13**　·　结论：**PASS ×1**

验收标准是 `docs/30-ASSET-INTAKE.md` §2。下面每一条都写了**过没过、为什么**，
因为图不进版本库（`.gitignore` 有意为之），这份文件就是唯一能重放的记录。

## 收下的图

### ✅ 合格　`atlas-frontview-2013.jpg`

- **直链**：https://upload.wikimedia.org/wikipedia/commons/8/81/Atlas_frontview_2013.jpg
- **出处页**：https://commons.wikimedia.org/wiki/File:Atlas_frontview_2013.jpg
- **版权方**：DARPA（美国国防部）
- **授权**：Public domain（美国联邦政府作品）
- **尺寸**：3738×5147
- **§2 核验**：单主体 / 纯白背景 / 正面 / 平光无硬阴影 / 全身未裁切 / 长边 5147px。§2 六条全过。注意：这是 2013 年液压 Atlas，不是 2024 年电动 Atlas —— 但 `athlete` 的 look写的就是「外露执行器 + 液压缸 + 裸机械铝」，液压代恰恰更贴。

## 查过的来源（按 `docs/30` 的优先级）

### Boston Dynamics 官网 Atlas 页

`https://bostondynamics.com/atlas/`

已查：全部是车间/仓库实拍或渲染场景，背景杂乱，§2 不过。`atlas-tri-1024x1024.jpg` 正面、光柔，但小腿以下被裁掉。

### Boston Dynamics Brandfolder

`https://brandfolder.com/bostondynamics`

官方品牌资产库，但**需要登录**。要拿电动 Atlas 的棚拍图，从这里申请是唯一正路。

## 怎么再抓一遍

按上面的直链 `curl -L -o <文件名> '<直链>'` 存进本目录即可。
存完先跑 `/dev/anchor.html` 目视确认（**不花 credits**），再进 `factory:generate`。
