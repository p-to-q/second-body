# 霞鹜文楷 LXGW WenKai

| | |
|---|---|
| 来源 | https://github.com/lxgw/LxgwWenKai-Lite v1.522（`LXGWWenKaiLite-Regular.ttf`） |
| 作者 | 落霞孤鹜 @lxgw。基于 Fontworks 开源的 **Klee One** 改造，补的是 **GB 简体**字集 |
| 授权 | **SIL Open Font License 1.1**（全文见 `OFL.txt`，与上游逐字节一致）—— 可自由使用、散布、改作、与软件绑定发行 |
| 我们做了什么 | **子集化**：13.8 MB TTF → **227 KB WOFF**（232,124 字节，**970 个码位 / 971 个字形**）。去 hinting、去 layout features |
| 这几个数怎么来的 | `node scripts/font-coverage.mjs` 现场数出来的，不是手抄的。重跑它就能核对 |

OFL 的两条要注意：

1. **禁止单独出售字型档。** 我们没有出售任何东西，随作品一起分发是允许的。
2. 上游对保留字名（`霞鹜` / `LXGW`）给了一条**额外许可**，正好覆盖我们这种用法：
   为网页字体投递而做的**子集化 / 转 WOFF** 可以继续用保留字名，前提是
   **不把它作为可安装的桌面字体发布**。我们发的是 WOFF，符合。
   （原文在 `OFL.txt` 第一段，别把它删掉。）

## 为什么值得引入

站里原来的中文落在系统字体上（`type.css` 的 `--sb-grotesk` 栈尾）。
那意味着**同一页中文在不同机器上长得不一样** —— 而这件作品的排版立场是
"味道来自度量和留白"，度量一旦随机，那句话就不成立。

文楷是楷书。楷书配 neo-grotesque 的拉丁是一个**很强**的搭配，
但正因为强，**不能全站铺开**。

## 它用在哪（这条比字体本身重要）

**只给叙事性的中文，不给标签和数据。**

| 用 | 不用 |
|---|---|
| 物种的一句话（`tagline`） | 全大写标签、房间号 |
| 页面的立意句、引文、护照上的"原话" | 数字、槽位名、part id |
| 作品陈述里的段落 | HUD、dev 工具页 |

理由：楷书有**手的温度**，它适合"一个人说的话"；而标签和数据要的是中性和等宽感，
上了楷书会变得像在抒情。这正是 `docs/26 §F` 那条"物质语言"要防的事 ——
一种语汇一旦到处都是，它就不再表达任何东西。

**这条边界在换字时一个字没动。** 换的是字身，不是规矩。

## 为什么是这一套：上一套根本渲染不了这个站（2026-09-13）

这里原来挂的是**芫荽 Iansui**（https://github.com/ButTaiwan/iansui v1.020，同为 OFL、
同样改自 Klee One）。它渲染不了这个站，而且**不是子集化没做好，是改不掉的**：

> 芫荽是**台湾的字体，字身是繁体**；站里的文案是**简体**。
> 上游 v1.020 的 cmap 一共 12,666 个码位，
> 「关 观 对 实 验 选 过 们 东 为 产 动 长 时 进 …」这类**简体专用字不在里面**。
> 今天会走楷书的 **354 个字里，它给不出 81 个**。
> 这 81 个字不是子集化漏掉的 —— **重跑一百遍子集化也救不回来。**

代价是叙事中文**半楷半黑**：`/about` 的作品陈述那句「关 观 对 实 验」全部落回 grotesk。
当时的另一条路是把"叙事中文用楷书"这条排版规矩撤掉 —— 没走那条路，
因为撤掉只会让一条规矩死在第一个不方便的地方。

换成霞鹜文楷之后，同一把尺子量出来：**严格层 354 / 354，余量层 970 / 970，一个不缺。**

**别再换回芫荽。** 任何一支候选楷体在换进来**之前**都要先过这一关：

```sh
node scripts/font-coverage.mjs --upstream=<候选 TTF>
# 「上游**没有**的 … 严格层」不是 0 的字体，不要换进来
```

顺带记一句选型：Lite 版与完整版的**覆盖面完全一样**（严格层、余量层都是满的），
子集化出来的 WOFF 差 12 字节；选 Lite 是因为上游 13.8 MB 对 25.6 MB ——
下一个重跑子集化的人少下一半。

## 重新子集化

上游 TTF **不进仓库**（13.8 MB），用完即弃：

```sh
curl -L -o /tmp/LXGWWenKaiLite-Regular.ttf \
  https://github.com/lxgw/LxgwWenKai-Lite/releases/download/v1.522/LXGWWenKaiLite-Regular.ttf
node scripts/font-coverage.mjs --upstream=/tmp/LXGWWenKaiLite-Regular.ttf --write=/tmp/kai-chars.txt
pyftsubset /tmp/LXGWWenKaiLite-Regular.ttf --text-file=/tmp/kai-chars.txt \
  --output-file=assets/fonts/LXGWWenKai/LXGWWenKai-subset.woff --flavor=woff \
  --layout-features= --no-hinting --desubroutinize --drop-tables+=DSIG
```

字表不是手写的，是算出来的：`scripts/font-coverage.mjs` 扫 `packages/app` 下所有 CSS
找出真的在用 `var(--sb-kai)` 的选择器，按登记表把对应文案（`ui/i18n.ts` 为主）的汉字
取出来，再和子集的 cmap 对账。**它同时是哨兵**：哪天有人给一个新元素挂上楷书
而没登记，它会报"未登记" —— 上一次出事的机制正是"排版规矩长了，字表没长"。

字表带余量：不只是今天会走楷书的 354 个字，而是**整本文案总册**的中文
（`i18n.ts` 全部 + 物种名与一句话 + 中文标点、全角数字、基本拉丁）。
理由：改一句文案就得重跑一次子集化的字体，没有人会维护。

## 怎么证明它真的上了（别再用无头截图）

无头 Chrome **根本不加载这个 webfont**，截出来的页面是齐齐整整的黑体，
看上去像"全站都没上楷书"，其实是仪器在朝着让你舒服的方向撒谎（`docs/02` P21）。
真正的量法是**在真浏览器里逐字比像素**：把同一个字分别用
`64px "LXGW WenKai", <grotesk 栈>` 和 `64px <grotesk 栈>` 画进 canvas，
两张位图一样 = 这个字没走楷书。汉字的字宽在两边都是 1em，**比字宽量不出来**，只能比像素。

还有一条：先确认**服务端给的是哪个文件**。机器上常年挂着的那个 dev server
可能是**另一个 checkout**，量到的是别人的字体。开自己的端口，
先 `curl -sI` 看一眼字节数对不对，再开始量。

2026-09-13 实测（Chrome 152，自开 `vite --port 5219`，
服务端 `/fonts/LXGWWenKai/LXGWWenKai-subset.woff` = 232,124 字节，
`document.fonts` 里 `LXGW WenKai` = `loaded`）：

| 页面 | 楷书元素里的汉字 | 走楷书 | 落回 grotesk |
|---|---|---|---|
| `/`（首屏立意句） | 15 | **15** | 0 |
| `/about`（立意句 + 作品陈述） | 78 | **78** | 0（换字前是 61 / 17） |
