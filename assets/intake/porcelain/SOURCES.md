# 参考图来源 —— `porcelain`（Optimus（Tesla））

> 🧍 劳工人 / 大众想象最强　·　抓取日期 **2026-09-13**　·　结论：**CONDITIONAL ×1**

验收标准是 `docs/30-ASSET-INTAKE.md` §2。下面每一条都写了**过没过、为什么**，
因为图不进版本库（`.gitignore` 有意为之），这份文件就是唯一能重放的记录。

## 收下的图

### 🟡 有条件合格　`optimus-tesla.jpg`

- **直链**：https://upload.wikimedia.org/wikipedia/commons/c/ca/Optimus_Tesla.jpg
- **出处页**：https://commons.wikimedia.org/wiki/File:Optimus_Tesla.jpg
- **版权方**：上传者声明为公有领域
- **授权**：Public domain（上传者释出）
- **尺寸**：1883×3198
- **§2 核验**：单主体 / 正面 / 全身未裁切 / 深灰平光背景 / 长边 3198px —— 这五条过。**一条不过**：一根黑色隔离带绳在小腿高度横穿画面。绳很细且与背景同色，但 §2 说「背景里的东西会被当成物体的一部分」。**先在 `/dev/anchor.html` 上看一眼（不花钱），确认绳没被读成结构再用。**

## 查过的来源（按 `docs/30` 的优先级）

### Commons 其它 Optimus 照片

`https://commons.wikimedia.org/w/index.php?search=Optimus+Tesla&ns6=1`

另有 `Optimus bot at Tesla showroom - 20251118 - 01/02.jpg`（CC BY-SA 4.0, 2268×4032）与 `Tesla Bot, Tesla Shop, Westfield Century City (Sept. 2024).JPG`（CC0, 1732×3012）两条备选，同为门店展示位实拍，未逐张目视核验。

### Tesla 官网

`https://www.tesla.com/AI`

已查：对 curl 返回 403，抓不了。Tesla 也没有对 Optimus 开放的 press kit。

## 怎么再抓一遍

按上面的直链 `curl -L -o <文件名> '<直链>'` 存进本目录即可。
存完先跑 `/dev/anchor.html` 目视确认（**不花 credits**），再进 `factory:generate`。
