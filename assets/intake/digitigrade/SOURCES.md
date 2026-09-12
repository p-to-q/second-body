# 参考图来源 —— `digitigrade`（Digit（Agility Robotics））

> 🦿 鸟腿人 / 非人腿 humanoid　·　抓取日期 **2026-09-13**　·　结论：**未找到合格图，但找到了官方 press kit**

验收标准是 `docs/30-ASSET-INTAKE.md` §2。下面每一条都写了**过没过、为什么**，
因为图不进版本库（`.gitignore` 有意为之），这份文件就是唯一能重放的记录。

## 收下的图

**没有。** 下面记的是查过的每一条路和它们为什么不行 —— 
`docs/30` §2 说得很清楚，不合格的图不要放进来。`196f527` 那一批就是这么烧掉的。

## 查过的来源（按 `docs/30` 的优先级）

### Agility Robotics 官方 Press Kit（ZIP）

`https://cdn.prod.website-files.com/68d6ca150ffa11fdc25d7575/699fd6d541e09471842a5bb2_30e59d76dede462f7254f9de51752abf_Agility%20Robotics%20Press%20Kit.zip`

**已验证可下载**：HTTP 200，`application/zip`，5,019,252 bytes。从 https://www.agilityrobotics.com/resources 页面上挂出来的。这是 16 个里**唯一一个真正公开、无需登录的厂商 press kit**。我没有解包（本线不下载二进制），下一个人直接解开挑图。

### Agility press 页面上的散图

`https://www.agilityrobotics.com/press`

`699fdc15…_Agility_Digit_06.jpg`（2000×1500）已核验：纯灰无缝棚拍、平光、单台 Digit ——**但它抱着一个大料箱（第二个物体），且小腿以下被下边框裁掉**。两条硬伤，不用。另有 `698e0488…_digit-head-closeup.jpg`，是头部特写，不是整机。

### Commons

已查：`Category:Agility Robotics` 里只有两个 logo 文件。

## 怎么再抓一遍

按上面的路线逐条试。**不要为了凑数随便抓一张** —— 
这个条目现在走纯文字 prompt（见同目录 `prompt.md`）是正确的状态，不是缺口。
