# 参考图来源 —— `autonomous`（Waymo（Jaguar I-PACE + 5th-gen Waymo Driver））

> 🚗 无人车 / 巨型具身智能　·　抓取日期 **2026-09-13**　·　结论：**PASS ×2**

验收标准是 `docs/30-ASSET-INTAKE.md` §2。下面每一条都写了**过没过、为什么**，
因为图不进版本库（`.gitignore` 有意为之），这份文件就是唯一能重放的记录。

## 收下的图

### ✅ 合格（首选）　`waymo-ipace-front-left.png`

- **直链**：https://lh3.googleusercontent.com/b9wFntCoT7fZQZVC30LUEpFD9u7x9ZK_WvEn49lv4xjHs6INcuYvtCDWMqpARDgjI4jbS14zXsCEc9prMEQKOXDWowuB28TCWCY=s0
- **出处页**：https://waymo.com/press/
- **版权方**：Waymo LLC
- **授权**：官方 press kit。原文："We're happy to provide assets to use for press and educational purposes." 要求配图注明 "Source: Waymo."；商业使用需联系 press@waymo.com。本作品为非商业艺术项目，参考图只作风格引导、不再分发 —— 落在该许可内。
- **尺寸**：15188×8438，PNG **带 alpha 通道**
- **§2 核验**：单主体 / **透明背景**（比白底还干净）/ 前左四分之三视角 / 全车未裁切 / 无硬阴影 / 长边 15188px。§2 六条全过，而且是这 16 个里质量最高的一张。⚠️ 文件很大，§2 上限 20MB —— 进流水线前先降到长边 ~4000px。

### ✅ 合格（备选，正面）　`waymo-ipace-front.png`

- **直链**：https://lh3.googleusercontent.com/uIbtrbu5p1omQdnsl7OFGtfDqcQEjkiTxHfWyJglaiJCmawWOE2n0700EUOa9wts33y9oTCgvz6yz6XaCplAZPs5pYf1i5lkpz8=s0
- **出处页**：https://waymo.com/press/
- **版权方**：Waymo LLC
- **授权**：同上
- **尺寸**：8640×8640，PNG 带 alpha
- **§2 核验**：严格正面、白底、单主体、全车未裁切、软阴影在地面。§2 全过。正面视角对传感器穹顶的形状表达不如四分之三好，所以列为备选。若要两张一起喂，按 docs/07 §2 的 `image_label` 标 `["FL","F"]`，**第一张决定材质**，把四分之三那张放第一。

## 查过的来源（按 `docs/30` 的优先级）

### Waymo press kit（正本）

`https://waymo.com/press/`

Fleet 区还有 6th-gen Waymo Driver on Hyundai IONIQ 5 的渲染图（`…yIyGMo29gCXr…=s0`，7818×4398 PNG）和 Waymo Ojai，未核验。

### Commons

`https://commons.wikimedia.org/w/index.php?search=intitle%3AWaymo+Jaguar&ns6=1`

已核验 `Waymo Jaguar I-Pace - Side View 01.jpg`（CC BY 4.0, 5721×3218）：街景 + 车内有人 + 斑马线。不过。Commons 上的 Waymo 全是路拍。

## 怎么再抓一遍

按上面的直链 `curl -L -o <文件名> '<直链>'` 存进本目录即可。
存完先跑 `/dev/anchor.html` 目视确认（**不花 credits**），再进 `factory:generate`。
