# 芫荽 Iansui

| | |
|---|---|
| 来源 | https://github.com/ButTaiwan/iansui v1.020 |
| 作者 | But Ko（字嗨发起人）。基于 Fontworks 开源的 **Klee One** 改造 |
| 授权 | **SIL Open Font License 1.1**（全文见 `OFL.txt`）—— 可自由使用、散布、改作、与软件绑定发行 |
| 我们做了什么 | **子集化**：9.2 MB TTF → **206 KB WOFF**（211,148 字节，**769 个码位 / 770 个字形**）。去 hinting、去 layout features |
| 这几个数怎么来的 | `node scripts/font-coverage.mjs` 现场数出来的，不是手抄的。重跑它就能核对 |

OFL 的一条要注意：**禁止单独出售字型档**。我们没有出售任何东西，随作品一起分发是允许的。

## 为什么值得引入

站里原来的中文落在系统字体上（`type.css` 的 `--sb-grotesk` 栈尾）。
那意味着**同一页中文在不同机器上长得不一样** —— 而这件作品的排版立场是
"味道来自度量和留白"，度量一旦随机，那句话就不成立。

芫荽是楷书。楷书配 neo-grotesque 的拉丁是一个**很强**的搭配，
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

## 覆盖面：一句数字曾经是假的（2026-09-13 修）

这张表原来写着"1,321 个汉字"。**实测是 958。** 没人说谎 ——
子集化只做过一次，而文案一直在长；那句数字被当成事实抄了半年，
页面上于是有一批中文**半楷半黑**：「栖 究 竟」落回 grotesk，首屏那句立意句就破在这里。

所以现在**字表不是手写的，是算出来的**：`scripts/font-coverage.mjs`
扫 `packages/app` 下所有 CSS 找出真的在用 `var(--sb-kai)` 的选择器，
按登记表把对应文案（`ui/i18n.ts` 为主）的汉字取出来，再和子集的 cmap 对账。
**它同时是哨兵**：哪天有人给一个新元素挂上楷书而没登记，它会报"未登记"。

重新子集化（上游 9.2 MB TTF **不进仓库**，用完即弃）：

```sh
curl -L -o /tmp/iansui.zip https://github.com/ButTaiwan/iansui/releases/download/v1.020/iansui.zip
unzip -o /tmp/iansui.zip -d /tmp/iansui
node scripts/font-coverage.mjs --upstream=/tmp/iansui/Iansui-Regular.ttf --write=/tmp/kai-chars.txt
pyftsubset /tmp/iansui/Iansui-Regular.ttf --text-file=/tmp/kai-chars.txt \
  --output-file=assets/fonts/Iansui/Iansui-subset.woff --flavor=woff \
  --layout-features= --no-hinting --desubroutinize --drop-tables+=DSIG
```

字表带余量：不只是今天会走楷书的 354 个字，而是**整本文案总册**的中文
（`i18n.ts` 全部 + 物种名与一句话 + 中文标点、全角数字、基本拉丁）。
理由：改一句文案就得重跑一次子集化的字体，没有人会维护。

## ⚠️ 一条改不掉的边界：芫荽是繁体字身，站里的文案是简体

**「关 观 对 实 验 选 过 们 东 为 产 动 长 时 进 …」这些简体专用字，上游 v1.020 根本没有。**
上游 cmap 一共 12,666 个码位（芫荽改自日文的 Klee One，补的是繁体），
其中**今天会走楷书的 354 个字里有 81 个它给不出**。这不是子集化漏掉的，
**重跑一百遍子集化也救不回来** —— 这一点用 `--upstream=` 参数可以随时复核。

结果：这 81 个字仍然落回 grotesk，叙事中文仍然是半楷半黑，只是从 84 个字缩到 81 个。
真要根治只有换字（例如同样基于 Klee One、但补的是**简体** GB 字集的
**霞鹜文楷 LXGW WenKai**，同为 SIL OFL 1.1）—— 那是一次字体选型决定，
不是一次子集化，所以留在这里记着，没有顺手做掉。

## 怎么证明它真的上了（别再用无头截图）

无头 Chrome **根本不加载这个 webfont**，截出来的页面是齐齐整整的黑体，
看上去像"全站都没上楷书"，其实是仪器在朝着让你舒服的方向撒谎（`docs/02` P21）。
真正的量法是**在真浏览器里逐字比像素**：把同一个字分别用
`64px Iansui, <grotesk 栈>` 和 `64px <grotesk 栈>` 画进 canvas，
两张位图一样 = 这个字没走楷书。汉字的字宽在两边都是 1em，**比字宽量不出来**，只能比像素。

2026-09-13 实测（Chrome 152，`npm run dev`，`document.fonts` 里 Iansui = `loaded`）：

| 页面 | 楷书元素里的汉字 | 走楷书 | 落回 grotesk |
|---|---|---|---|
| `/`（首屏立意句） | 15 | **15** | 0（换字前是 12 / 3：「究 竟 栖」） |
| `/about`（立意句 + 作品陈述） | 78 | 61 | 17（全部是上游没有的简体字） |
