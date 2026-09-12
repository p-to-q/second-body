# 参考图来源 —— `manipulator`（Stretch（Hello Robot））

> 🦾 移动机械臂 / mobile manipulation　·　抓取日期 **2026-09-13**　·　结论：**CONDITIONAL ×1（需裁切）**

验收标准是 `docs/30-ASSET-INTAKE.md` §2。下面每一条都写了**过没过、为什么**，
因为图不进版本库（`.gitignore` 有意为之），这份文件就是唯一能重放的记录。

## 收下的图

### 🟡 有条件合格（必须裁出单台）　`stretch4-visuals-2026.jpg`

- **直链**：https://hello-robot.com/wp-content/uploads/2026/05/Stretch-4-Visuals-5.6.2026.jpg
- **出处页**：https://hello-robot.com/
- **版权方**：Hello Robot Inc.
- **授权**：厂商官网产品图，未标注明确许可
- **尺寸**：1920×1080
- **§2 核验**：纯白背景、平光无阴影、每一台都全身未裁切 —— §2 的背景/光/完整性三条全过。**但画面里并排 5 台 Stretch**，这正是 `196f527` 烧 credits 的那种多主体图。→ **裁出最右边那一台**（手臂完全伸出的姿态，轮廓最清楚），裁完约 400×1000，长边不足 1024 —— 所以要改用同页的 `Stretch-4-Visuals-5.6.2026-1-1.jpg`（同构图、同尺寸）或向 Hello Robot 索要原始分辨率。**现状：这张图本身不能直接进流水线。**

## 查过的来源（按 `docs/30` 的优先级）

### Hello Robot 媒体库（WP REST API）

`https://hello-robot.com/wp-json/wp/v2/media?search=stretch&per_page=40`

**这条最有用**：站点是 WordPress，媒体库可直接枚举，返回每张图的 width/height/source_url。换关键词、翻页就能把全部官方图列出来。已列过一页，白底单台的暂时没有。

### 同库里已排除的

`bould_stretch_grey.jpg`（1672×941）已核验：客厅场景（仙人掌、书架、椅子）。不过。`STRETCH-3-KEYSHOT-2024-HEAD-CLOSE-UP-1`：头部特写，不是整机。

## 怎么再抓一遍

按上面的直链 `curl -L -o <文件名> '<直链>'` 存进本目录即可。
存完先跑 `/dev/anchor.html` 目视确认（**不花 credits**），再进 `factory:generate`。
