# 27 · 品牌字体规范与物料

> 这不是一本 brand book，是**一份可以照着排版的规范**。
> 每一条都指向 `packages/app/src/ui/type.css` 里的一个具体的值，
> 而那个文件是唯一真相 —— 这份文档不复制它的值，只解释它为什么是那个值。
>
> 看得见的版本：`/poster/brand.html`（跑 `npm run dev -w @sb/app`，开 `http://localhost:5173/poster/brand.html`）。
> 那一页把下面每一条都**显示出来**，而且能当场测的数字是当场测的。
> 截图：`assets/brand/brand-spec-page.png`。

参照的气质是 ZKM / Ars Electronica 这一类机构的展览印刷品：
International Typographic Style，极强的排版纪律，几乎没有装饰，**留白比图形承担更多工作**。

---

## 1 · 字体栈

```
ZKMSerendipity → Helvetica Neue → Neue Haas Grotesk Display → Suisse Int'l
→ Univers → Helvetica → Arial → Segoe UI → system-ui → sans-serif
```

**栈的顺序是有讲究的**，不是随手排的回退链：

| 落到哪 | 平台 | 为什么可以接受 |
|---|---|---|
| ZKMSerendipity | 仓库自带 woff | ZKM 的字，来源与授权见 `assets/fonts/ZKMSerendipity/NOTICE.md` |
| Helvetica Neue | macOS / iOS | International Typographic Style 的**本尊** |
| Arial | Windows | 同一套骨架的另一次实现 |
| system-ui | Linux / 其他 | 系统 grotesk，骨架仍然对 |

**为什么回退时排版不塌。** 要保证的从来不是"字形宽度一样"——
字形宽度当然会变。要保证的是**字号 / 行高 / 字距 / 栅格全部定义在 CSS 里、与字体文件无关**：

- `line-height` 全部是无单位倍数，所以行盒高度只由 `font-size` 决定；
- `letter-spacing` 用 `em`，跟着字号走；
- 栅格与安全区用 `px` / `mm` 常量。

所以 `font-display: swap` 在字体到位那一刻换字形，**行盒高度和版心不动，不会有回流跳动**。

**怎么验证这一点（`?font=system`）。** `type.css` 定义了 `html.font-system`，
它把 `--sb-grotesk` 换成纯系统栈。给任意一页加 `?font=system`，版面不应该跳。
`/poster/brand.html` §1 把这件事做成了一张当场测出来的表：

| 属性 | 栈首 | 系统栈 | |
|---|---|---|---|
| `font-size` / `line-height` / `letter-spacing` | 相同 | 相同 | ✅ 一致 |
| 行盒高度 line box | 相同 | 相同 | ✅ 一致 |
| 文字实际宽度 | 293.56px | 311.03px | ❌ 本来就该不同 |

> 最后一行是**故意留在规范里的**。一份声称"完全一致"的规范会在第一次有人拿尺子量的时候垮掉。

---

## 2 · 字号级差、行高、字距

**只有两级正文 + 两级标题。三级以上就开始像后台系统。**

### 屏幕（`type.css`，单位 rem）

| 角色 | 变量 | 字号 | 行高 | 字距 |
|---|---|---|---|---|
| h1 | `--sb-size-h1` | 2rem | 1.15 | **−0.02em** |
| h2 | `--sb-size-h2` | 1.5rem | 1.25 | **−0.01em** |
| h3 / 正文 | `--sb-size-body` | 1rem | 1.5 | 0 |
| 数据 / 标注 | `--sb-size-small` | 0.8125rem | 1.5 | 0 |
| 全大写标签 | `.sb-label` | 0.8125rem | — | **+0.08em** |

`html` 基准 100%，`min-width: 1200px` 时 105%。正文行长上限 `--sb-measure: 68ch`。

### 字距的那条规则

> **grotesk 在大字号下要收紧，在小字号下要放开。**
> 这是这套风格最容易被忽略的一半 —— 大多数人只抄了字号，没抄字距。

大字号下字与字之间的空隙在视觉上被放大，不收紧就散；
全大写的小标签没有小写字母的升降部帮忙断词，不放开就糊成一团。
`−0.02em → −0.01em → 0 → +0.08em` 是一条**单调**的曲线，新增字级必须落在这条曲线上。

### 印刷（`poster/poster.css`，单位 mm）

海报是印刷品：纸张是 mm，观看距离是米，正文 16px 在 A1 上等于看不见。
所以海报层加了一套印刷级差 —— **规则完全一样，只是基准换了**：

| 角色 | 变量 | A1 字号 | 字距 |
|---|---|---|---|
| mega（一张海报只许有一个） | `--p-mega` | 86mm | −0.035em |
| display | `--p-display` | 34mm | −0.03em |
| h1 | `--p-h1` | 15mm | −0.025em |
| h2 | `--p-h2` | 8.4mm | −0.015em |
| h3 | `--p-h3` | 5.6mm | −0.015em |
| 正文 | `--p-body` | 4.2mm | 0 |
| 标注 | `--p-small` | 3.2mm | 0 |
| 出处行 | `--p-micro` | 2.6mm | 0 |
| 全大写标签 | `.p-label` | 3.2mm | **+0.08em** |

A4 票根那张把整套基准降一档（在 `.p-sheet` 上局部覆盖），因为它是**拿在手里看的**。

---

## 3 · 中英对照：并置，不切换

**没有 `setLang()`，只有 `bi()`。这是一个设计决定，不是省事。**

语言切换器要求观众先做一个选择，然后**看不到另一半**。并置是美术馆和档案的做法：
不打断、不要求选择，而且双语本身构成排版的一部分 ——
两行不同灰度的文字，本来就是这套风格的常见构型。

| | 值 | 为什么 |
|---|---|---|
| 中文 `.sb-zh` | `--sb-ink`，正常字号 | **中文是原文** |
| 英文 `.sb-en` | `--sb-ink-dim`，**0.82em** | 对照，不是并列 |
| 英文上边距 | **0.15em** | 英文比中文矮一截，基线对不齐；这个值是**靠眼睛调的，不是算出来的** |
| 英文字距 | +0.01em | 小一号了，要放开一点（见 §2 的曲线） |
| 标题里的英文 | 跟 `--sb-tracking-h2` 走，字重 400 | 否则大字号下英文那行会散开 |

行内并置用 `.sb-bi-inline`：中英之间一条 1px 细竖线，不是斜杠也不是括号。

**纪律**（来自 `i18n.ts`）：

- 面向观众的字符串**一律从 `COPY` 取**，海报和纸品也不例外；
- 英文不要翻译腔 —— **宁可换一个说法，也不要逐字对应**；
- 调试 / 开发者面向的文字不进 `COPY`。

---

## 4 · 颜色的语义分配

**全套物料里，颜色只编码一组对立。其余一切靠灰阶。**

| 变量 | 值 | 角色 |
|---|---|---|
| `--sb-paper` | `#0e0f12` | 纸 |
| `--sb-ink` | `#dfe4ea` | 标题、强调、数据 |
| `--sb-ink-dim` | `#9aa0a6` | 正文、英文对照、标注 |
| `--sb-rule` | `#2a3038` | 线。**代替卡片和阴影的那个东西** |
| `--sb-accent` | `#7fb3d5` | **语义：准入 / 保留 / 成立** |
| `--sb-warn` | `#e0455a` | **语义：拒入 / 剔除 / 不成立** |

这一组对立在不同物料上换名字，但含义永远是同一个：

| 场景 | 警示色 | 强调色 |
|---|---|---|
| 素材策展 | `reject` 剔除 | `keep` 保留 |
| 判据自评 | 不成立 | 成立 |
| 缺口清单 | 缺失 | 已具备 |

**不许做的**：用颜色区分类别、用颜色做装饰、用颜色表示"品牌色出现了"。
一张海报上如果有第三种颜色在表达第三件事，那张海报就排错了。

> 落地检查：`poster-01` 的颜色只出现在"人工剔除的十件"那一块；
> `poster-03` 的颜色只出现在状态列和四个缺口的左竖线上。其余整张全是灰阶。

---

## 5 · 栅格与安全区

| | 屏幕 | 印刷 |
|---|---|---|
| 安全区 | `--sb-safe: 48px` | `--p-safe: 24mm`（≈91px） |
| 栏距 | `--sb-gutter: 24px` | `--p-gutter: 8mm` |
| 行长上限 | `--sb-measure: 68ch` | 62ch（`.p-measure`） |
| 细线 | 1px | `--p-rule: 0.35mm` |

**投影会切边，安全区不能小于 48px** —— 两者取更大的那个。
海报上**没有一个字**可以越过安全区（`.p-safe` 是 `position:absolute; inset: var(--p-safe)`，
越界会直接被 `.p-sheet` 的 `overflow:hidden` 切掉，所以排错了看得见）。

细线宽度 `0.35mm` 是有下限的：印刷上低于 0.25mm 会断，高于 0.5mm 就从"分区"变成"装饰"。

海报栅格：A1 用 4 / 5 / 6 栏（`.p-c4` / `.p-c6`），按内容选，不按好看选。

---

## 6 · 反面清单

`/poster/brand.html` §6 把下面每一样都**真的画出来，然后划掉** ——
一张只有文字的禁令清单太容易被忽略。

| 不用 | 为什么 |
|---|---|
| **卡片 / 圆角 / 阴影** | Typographic Style 用**线**分区。卡片把每块内容装进小盒子，页面就变成后台仪表盘 —— 而这是一件作品的物料 |
| **图标** | 图标是给"扫一眼就要点"的界面用的。这里每句话都值得读完，而且中英并置已经在承担识别工作 |
| **进度条** | 它在承诺一个我们无法兑现的确定性。启动慢就说「稍等一下」，出错就说「出了点问题，正在恢复」 |
| **toast** | 观众站在一台装置前面，不是在用 app。飘出来又消失的小黑条会把语域从"作品"拉回"软件" |
| **渐变 / 玻璃拟态 / 大圆角按钮** | 同上，全部是 app 的语域 |
| **写死的数字** | 见 §7。海报上写死的数字第二天就会变成谎 |

---

## 7 · 数字只有一个来源

**海报上没有一个数字是手打的。**

`packages/app/poster/build-data.mjs` 读 `assets/parts/parts.json` 与
`assets/parts/curation.json`，算出每一个数字，写成 `poster/data.js`（`window.SB_POSTER`）。
海报只引用它。

```
node packages/app/poster/build-data.mjs     # 重出 data.js
```

槽位表和键序**直接从 `packages/core/src/slots.ts` import**（node 22 直接跑 .ts，不需要构建步骤）。
原先这里手抄了一份 `SLOT_OF_BONE`：抄本和正本对上的那天数字是对的，但 `genome` 改了这边不会报错，
数字会静默漂移 —— 而这几张海报的全部说服力恰恰是"数字是跑出来的"。去掉抄本那次，输出一字未变，
这说明它当时是对的，也说明这种错**不会**在出现的时候被发现。

组合数的算法仍与 `packages/core/src/genome.ts` 逐条对齐：
18 个挂载键各自独立抽件（左右肢是两次独立抽取）· 沿 `base` 链借件 ·
`curation.json` 里 reject 的件不进池 · 不含 tier 3 的跨主题杂交。

**空位不计入容量**：`field`（程序化身体）和 `guest.founder`（`docs/14 §2` 明说的空位）
从来没有为自己生成过一件部件，把它们算进去会让总数多出十几个百分点，
而那十几个百分点背后一件部件都没有 —— 这正是这几张海报要拒绝的那种数字。

> 这条纪律的理由：`docs/18 §5` 已经记过一次"工程指标全绿、作品没成立"的教训。
> 宣发物料是同一类陷阱的另一个入口 —— 它天然想把数字说大、说圆、说定。

---

## 8 · 怎么出片

```bash
npm run dev -w @sb/app                       # 1. 起 dev server（publicDir 指向 assets/）
# 2a. 印刷：浏览器打开海报 → 打印 → 存为 PDF
#     纸张选「A1 594×841mm」，边距 0，**必须勾选「背景图形」**
# 2b. 截图：
node packages/app/poster/shot.mjs --port=5173
```

`shot.mjs` 用本机已装的 Chrome 无头模式，**不加任何依赖**。
必须跑 dev server 而不是直接开 `file://`：dev 下 `publicDir` 指向仓库的 `assets/`，
`/fonts/ZKMSerendipity/*.woff` 和 `/refs/<id>/_anchor.png` 才解析得到。

---

## 9 · 物料索引

源文件在 `packages/app/poster/`，导出的 PNG 在 `assets/brand/`（另见那里的 `README.md`）。

| 文件 | 尺寸 | 用途 | 里面的数据来自哪 |
|---|---|---|---|
| `poster-01-academic-a1.png` | 594 × 841 mm · 2245×3179px | **说明海报**。组合数的逆向结论 / 形态空间散点 / 系统结构 / 人工剔除的十件 | `parts.json` + `curation.json`，经 `build-data.mjs` |
| `poster-02-array-a1.png` | 594 × 841 mm · 2245×3179px | **宣传海报**。23 个条目的躯干参考件阵列，按形态空间排序 | 图 `assets/refs/<id>/_anchor.png`；名称 / 对照 / 坐标来自 `parts.json` |
| `poster-03-position-a1.png` | 594 × 841 mm · 2245×3179px | **立场海报**。`PRD §5` 六条判据的逐条自评 | 判据 `docs/PRD.md §5`；对照 `docs/25-COMPLETENESS.md §A/§B1`；第 3 条证据与"全借"条目现算 |
| `print-04-ticket-a4.png` | 210 × 297 mm · 1588×2246px | **留念票根**，三联，现场裁开发放 | 文案逐字取自 `src/ui/i18n.ts` 的 `COPY.leave` / `COPY.privacy` |
| `brand-spec-page.png` | 屏幕页 · 1440×5600px | **规范页**，本文档的可看版本 | `type.css` 的计算样式，当场读出 |

源文件：

```
packages/app/poster/
├── build-data.mjs        数字的唯一来源 → data.js
├── data.js               生成物，不要手改
├── poster.css            印刷级差 + 纸张 + 反面清单的落地（只增不改 ui/）
├── shot.js               ?shot → 窗口尺寸 = 纸张尺寸
├── shot.mjs              无头 Chrome 出图
├── brand.html            规范页（/poster/brand.html）
├── 01-academic-a1.html
├── 02-array-a1.html
├── 03-position-a1.html
└── 04-ticket-a4.html
```

---

## 10 · 已知的偏差

诚实地记下来，免得下一个人以为是自己看错了：

1. **`docs/26-ARTWORK-STANDARD.md` 不存在。** 立场海报原计划用它那张"五种不可替代的角色"表，
   仓库里没有这份文档，也没有那张表。海报改用 `docs/25-COMPLETENESS.md §A` 的六条判据自评 ——
   同样是诚实的自我评估，而且是仓库里真实存在的那一份。**没有编造那张表。**
2. **`packages/app/src/ui/pages.css` 不存在。** 展陈层的版式原语目前只有 `type.css`。
   `poster.css` 因此自己定义了印刷层的原语，没有依赖一个不存在的文件。
3. **`packages/app/src/passport/` 不存在**，全仓库搜不到 `passport`。
   纸质小物改成票根，内容建立在真实存在的 `COPY.leave.seed` / `COPY.leave.keepsake`
   和 `genome.ts` 的可复现不变式之上。
4. **深色底的印刷成本**。全套物料沿用 `type.css` 的深色调色板（那是品牌本身，不该为了印刷另发明一套浅色）。
   代价是 A1 满版深色吃墨，且存 PDF 时必须勾「背景图形」。哪天决定出浅色版，
   那是一个**品牌决定**，要改 `type.css`，不是在海报里偷偷反色。
