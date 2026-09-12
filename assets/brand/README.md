# assets/brand — 宣发物料导出

海报与规范页的 PNG 导出。**源文件在 `packages/app/poster/`**，规范在 `docs/27-BRAND.md`。

这里的 PNG 是**给人看的副本**，不是印刷母版。要印刷就开源文件，
浏览器「打印 → 存为 PDF」，纸张按 `@page` 选，边距 0，**必须勾选「背景图形」**。

重出全部：

```bash
npm run dev -w @sb/app                       # publicDir 指向仓库 assets/，字体与 anchor 图才解析得到
node packages/app/poster/build-data.mjs      # 先重算数字
node packages/app/poster/shot.mjs --port=5173
```

---

## 清单

| 文件 | 像素 | 印刷尺寸 | 用途 |
|---|---|---|---|
| `poster-01-academic-a1.png` | 2245 × 3179 | A1 594 × 841 mm | 学术 / 说明海报 |
| `poster-02-array-a1.png` | 2245 × 3179 | A1 594 × 841 mm | 宣传海报（物种阵列） |
| `poster-03-position-a1.png` | 2245 × 3179 | A1 594 × 841 mm | 立场海报（自评） |
| `print-04-ticket-a4.png` | 1588 × 2246 | A4 210 × 297 mm | 留念票根，三联，现场裁开发放 |
| `brand-spec-page.png` | 1440 × 5600 | 屏幕页 | 品牌字体规范页（`/poster/brand.html`） |

导出用本机 Chrome 无头模式，1mm = 96/25.4 px。A4 那张用 2× 缩放，
否则长边只有 1123px；其余 1×，长边已经远超 2000px。

---

## 每张里面的数据来自哪

> **没有一个数字是手打的。** 全部由 `packages/app/poster/build-data.mjs`
> 从 `assets/parts/parts.json` + `assets/parts/curation.json` 现算，写进 `poster/data.js`。
> 槽位表取自 `packages/core/src/slots.ts` 本身（不是抄本）；组合数的算法与
> `packages/core/src/genome.ts` 逐条对齐（见 `docs/27-BRAND.md §7`）。

### `poster-01-academic-a1.png` — 说明海报

| 版面上的东西 | 来源 |
|---|---|
| 1,642,496 具可能的身体 | 算出来的：21 个有自有部件的条目，18 个挂载键各自的候选池连乘再求和，tier ≤ 2，已排除 `curation.json` 里 reject 的 10 件 |
| 18 项的乘法式 | `data.js` 的 `entries[].perSlot`，取第一个 `coverage: full` 的条目（瓷 / Porcelain）摊开 |
| 191 件 / 剔除 10 件 / 在池 181 件 | `parts.json` 的 `parts` 数组 + `curation.json` 的 reject 计数 |
| 10 个槽位 / 18 个挂载键 / 9 种材质 / 562,638 三角形 | `parts.json` |
| 形态空间散点（23 点） | `parts.json` 每个条目的 `axes.humanLike × axes.lifeLike` **实值**，不是为排版摆的位置 |
| 空心的两个点 | `field` 与 `guest.founder` —— 从没为自己生成过部件的两个空位 |
| 身体方案 人形 14 / 四足 4 / 团块 3 / 矮壮 2 | `parts.json` 的 `bodyPlan` 字段，按 `main.ts:105` 的规则归一（字符串取本身，对象取 `.kind`，缺省 `rig`） |
| 人工剔除的十件 + 理由 | `assets/parts/curation.json` 的 `note`，**人写的原话，一字未改** |
| "47,000 possible robot reflections" | 参照作品的官方措辞，记录在 `docs/00-PROJECT-BRIEF.md` / `docs/09-RISKS-AND-UNKNOWNS.md A1` |

### `poster-02-array-a1.png` — 宣传海报

| 版面上的东西 | 来源 |
|---|---|
| 21 张图 | `assets/refs/<id>/_anchor.png`，每个条目的**躯干参考件**，本项目自行渲染（`vite.config.ts` 的 `/__anchor` 回写口） |
| 2 个画着对角线的空格 | `field` 与 `guest.founder` 没有 anchor 图 —— 按文件系统实数判定，不是写死的名单 |
| 每格的中英名称与一句话 | `parts.json` 的 `name` / `nameEn` / `tagline` / `taglineEn` |
| 格子的排列顺序 | 按 `axes.humanLike` 升序（同值再按 `lifeLike`）—— 网格是 01 号那张散点图被拉成一条线 |
| 第 24 格的 23 / 物种 18 / 角色 4 / 嘉宾 1 / 空位 2 | `parts.json` 的 `kind` 计数 + 空位计数 |

### `poster-03-position-a1.png` — 立场海报

| 版面上的东西 | 来源 |
|---|---|
| 六条判据原文 | `docs/PRD.md §5`（英文对照是本次为海报写的，不是文档里的） |
| 每条的状态与"差在哪" | `docs/25-COMPLETENESS.md §A`，记录于 2026-09-12 |
| 第 3 条的证据（4 种身体方案的实际分布） | **现算**，不抄文档里的旧数 —— 文档会过期，`parts.json` 不会 |
| 四个缺口（慢回路 / 真人录制 / 声音 / 留念） | `docs/25-COMPLETENESS.md §B1` |
| "为什么会这样" | `docs/25-COMPLETENESS.md §C` |
| 右下"此刻正穿着别人身体的两个条目" | **现算**：`digitigrade` 自有 6 件、`wheelleg` 自有 1 件，全部被 `curation.json` 标为 reject，两者现在整具身体都借自 `porcelain` |

> ⚠️ 原计划这张用 `docs/26-ARTWORK-STANDARD.md` 那张"五种不可替代的角色"表。
> **仓库里没有 `docs/26`，也没有那张表**，所以改用 `docs/25` 的六条判据自评。
> 没有编造那张表。详见 `docs/27-BRAND.md §10`。

### `print-04-ticket-a4.png` — 留念票根

| 版面上的东西 | 来源 |
|---|---|
| 「带走这具身体 / Take this body with you」 | `src/ui/i18n.ts` `COPY.leave.keepsake`，逐字 |
| 「编号 / Seed」 | `COPY.leave.seed` |
| 「画面不离开你的浏览器 / Video never leaves your browser」 | `COPY.privacy.short` |
| "同一个编号永远长回同一具身体" | `packages/core/src/genome.ts` 的不变式：同样的 `(seed, tier, index)` 永远得到同样的 Genome |
| 23 物种 · 4 身体方案 · 181 件部件 | `data.js` |

> 编号、物种、身体方案、阶段四栏**故意是空的** —— 现场用笔写或盖章。

> ⚠️ 原计划参照 `packages/app/src/passport/`。**那个目录不存在**，全仓库搜不到 `passport`。
> 票根的内容改为建立在真实存在的 `COPY.leave` 与 `genome.ts` 的可复现不变式之上。

### `brand-spec-page.png` — 规范页

`/poster/brand.html` 的整页截图。页面上的字号 / 行高 / 字距 / 颜色值
**全部由 JS 从 `type.css` 的计算样式当场读出**，没有一个是抄进 HTML 的；
§1 的字体回退对照表也是当场量的（用 Range 框住文本节点量文字实宽，
不是量块级元素的栏宽 —— 那样两边永远一样，什么都证明不了）。
