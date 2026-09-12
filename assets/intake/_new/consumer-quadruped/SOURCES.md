# 参考图来源 —— `_new/consumer-quadruped`（Go2（Unitree））

> 🐕 消费机器狗 / 四足商品化　·　抓取日期 **2026-09-13**　·　结论：**roster 里没有对应条目，需要新建**

验收标准是 `docs/30-ASSET-INTAKE.md` §2。下面每一条都写了**过没过、为什么**，
因为图不进版本库（`.gitignore` 有意为之），这份文件就是唯一能重放的记录。

## 收下的图

**没有。** 下面记的是查过的每一条路和它们为什么不行 —— 
`docs/30` §2 说得很清楚，不合格的图不要放进来。`196f527` 那一批就是这么烧掉的。

## 查过的来源（按 `docs/30` 的优先级）

### Unitree Go2 产品页

`https://www.unitree.com/go2`

图直链可枚举。已核验 `1c36f0b0…_3840x3266.jpg`：单台 Go2，但**站在一块礁石上、脚下有水面**（多物体）+ 纯黑背景 + 强轮廓光。不过。`ce0f65bf…_2944x1540.jpg`：一只手举着手机在前景，Go2 在背景虚化。不过。

### 同页 800×800 产品小图

`https://www.unitree.com/images/148d8cc897044981ac31186d69ce369f_800x800.png`

疑似白底，但 800px < 1024，出局。

### Commons `Category:Unitree Go2`

`https://commons.wikimedia.org/wiki/Category:Unitree_Go2`

24 个文件，全部是 Japan Mobility Show 2025 同一组展台照（CC BY 4.0, 3840×2160）。展会背景，不过。

## 怎么再抓一遍

按上面的路线逐条试。**不要为了凑数随便抓一张** —— 
这个条目现在走纯文字 prompt（见同目录 `prompt.md`）是正确的状态，不是缺口。
