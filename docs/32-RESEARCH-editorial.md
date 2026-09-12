# 32 — 作品集版面：实测与落点

这一份不是观后感。它是**去抓真实站点的样式表**得到的数值，和我们据此改了哪个变量、
从多少改到多少。每一条的格式都是「他们做了 X → 我们改 Y」。

## 0 方法与它的边界

2026-09-13，抓了 11 个站的 HTML，解析出 `<link rel=stylesheet>` 和内联 `<style>`，
再下载 CSS 源文件做提取：

> Serpentine Galleries · RCA · UAL Showcase（覆盖 CSM / UAL 毕业展）·
> Studio Dumbar · ZKM · Universal Everything · FIELD.io ·
> Design Academy Eindhoven · Bureau Borsche · Ars Electronica · Random International

标 **(实测)** 的是样式表里的字面值；标 **(换算)** 的是按各站根字号 / 视口自己算出来的。

**没拿到的部分，写清楚没拿到**（P12：没跑过就不许说通过，这里同理）：

- **进场动画的"类型"拿不到。** 是逐行遮罩上移、还是整块淡入、还是逐字 —— 这些由
  GSAP / Framer / Lenis 在 JS 里驱动，CSS 里看不见。所以下面关于动效只写**时长和缓动**，
  那两样在 CSS 里是实测的。
- **视差在 11 个站的 CSS 里 0 命中。** 要么没做，要么在 JS 里。所以"克制的视差"这一条
  我们没有可对标的数值 —— 于是干脆**不做视差**，见 §G。
- Rhizome.org 被 Cloudflare 拦（403）。RCA / DAE 的独立毕业展微站已下线（DNS 无解析），
  用了两校主站 + UAL Showcase 代替。
- **他们的站**没有在浏览器里跑过，所以那 11 列数是样式表里的声明，不是 computed style。
  我们自己这一侧是跑过的（§G 末尾那张 computed style 对照）。

---

## A 主标题：多大才算"异常的大"

**他们做了什么（实测）**

| 站点 | h1 桌面 | 表达式 |
|---|---|---|
| Serpentine | **100px**（`--text-large` 变体 **175px**） | `clamp(3.124rem, …, 6.25rem)`，流体区间锚在 **320→1530px** |
| RCA | **90px** | 三档 px：44 / 78 / 90 |
| Ars Electronica | 88px（display-2） | 三档 px |
| Studio Dumbar | **80px** | `calc(32px + 48*(100vw-480)/760)` |
| UAL Showcase | **76px** | `clamp(2.75rem, -1.92rem+7.41vw, 4.75rem)` @≥1008 |
| FIELD.io | **72px** | `3rem` × 根字号 24px |
| DAE | 68.8px | `4.3rem` @≥768 |
| ZKM | 64.4px | `3.5rem` × 根 115% |
| Universal Everything | 43.2px @1440 | `3vw` |
| Bureau Borsche | 25.9px @1440 | `1.8vw` |
| Random International | **16px** | `1rem`（Squarespace tweak value=1） |

做巨题的一派落在 **64–100px**，中位 **76–80px**；超大 hero 到 **175px**。
另有三家（UE / Borsche / RI）**故意不做巨题**，靠满屏影像和网格叙事 —— 那条路我们走不了，
因为陈述页上没有影像可放。

**我们改了什么**

`src/ui/type.css`

```
新增  --sb-size-display: clamp(3.25rem, 10.5vw, 10rem)
```

1440 视口下 = **151px**。落在 Serpentine 常规 hero（100px）与其 `--text-large`（175px）之间。
取上半段是有理由的：那 11 个站的巨题旁边**都有图**，我们的首屏只有字，
字必须自己把那一屏撑满。

**这不是把一个数调大，是把级差重排。**

```
改  --sb-size-h1: 2rem → clamp(1.875rem, 3.1vw, 2.75rem)
改  --sb-size-h2: 1.5rem → 1.25rem      ← 往回收
新  --sb-size-micro: 0.6875rem          ← 全大写标签专用
```

h2 **调小**是关键的一步：原来 2 / 1.5 / 1 相邻只差 1.33 倍，是"档案"的级差 ——
它假设读者会从上往下读完，层级只需要可分辨。扫视只认得两样东西：最大的那个，和其余。
所以 display 与 h1 之间**刻意不放中间级**；有了中间级，眼睛沿阶梯慢慢下来，
于是没有任何一级是"大"的。

`.sb-display` **故意不绑在 `h1` 上** —— h1 是语义，display 是版面动作。
dev 工具页每一页都有 h1，它们不该变巨。

---

## B 级差倍数（h1 ÷ 正文）

**他们做了什么（换算）**

| 区间 | 站点 |
|---|---|
| 1.0–2.0×（反巨题） | Random International 1.0 · Borsche 1.85 · UE 1.96 |
| 3.5× | ZKM |
| **4.3–4.8×（主流）** | DAE 4.3 · FIELD 4.3 · UAL 4.75 |
| **5.0–5.4×（大反差）** | RCA 5.0 · Ars 5.2 · Serpentine 5.26 · Dumbar 5.33 |

正文基准实测 **15–22px**（Dumbar 15 / Ars 17 / RCA 18 / Serpentine 19 / UE 22）——
**11 个站没有一个用 14px 正文。**

**我们改了什么**

我们的正文原来在 ≥1200 下是 16.8px，压在区间下沿。ZKM 自己的做法是
**根字号随断点整体缩放**（实测 100 / 105 / 110 / 115%），整组 rem 一起走，比例不变。照抄：

```
改  html { font-size: 100% }
    @media (min-width: 768px)  { 105% }   ← 新增这一档
    @media (min-width: 1200px) { 105% → 110% }
```

≥1200 下正文 = **17.6px**，进区间。没有跟到 115%：那会把 dev 工具页那些很密的表撑开，
而那些页面不需要"读起来舒服"，需要"一屏塞得下"。

级差结果：display 151 / body 17.6 = **8.6×**。高于 h1 那一栏的 4.3–5.3×，
但对得上 Serpentine 的 `--text-large`：175 / 19 = **9.2×**。同一个量级。

---

## C 字距：一条被证伪的直觉

`type.css` 原来的注释写着"大字号收紧"，方向是对的，**但收到哪里为止是我凭感觉定的**。
我第一版写了 `-0.045em`。实测把它否掉了。

**他们做了什么（实测）**

| 做法 | 站点数 | 值 |
|---|---|---|
| 大标题**不动（0）** | **5 / 11** | RCA · Serpentine · ZKM · DAE · Ars |
| 大标题收紧 | 3 / 11 | UAL **−0.02em** · Dumbar **−2px @80px = −0.025em** · UE −0.025em |
| 大标题**放松** | 2 / 11 | FIELD **+0.01em** · RI +0.01em |
| −0.04em 作为主值 | **0 / 11** | Dumbar 样式表里存在一条 `-.04em`，但不是标题主值 |

分野不是随机的：**衬线 / 自有字体的机构站倾向 0**（Serpentine 的 Noe Text、ZKM 的
Serendipity、RCA），**Helvetica / Neue Haas 系的商业设计站才收到 −0.02 ~ −0.025em**。

全大写小标签实测 **+0.01 ~ +0.067em，典型 +0.05em**。
ZKM 是 `letter-spacing: 0.05rem`，落在 `0.75rem` 的字号上 ≈ **+0.067em**。

**我们改了什么**

```
改  --sb-tracking-display: -0.045em → -0.025em    （我自己写的数，被实测否掉）
改  --sb-tracking-h1:      -0.02em  → -0.02em     （不动，本来就在区间里）
改  --sb-tracking-label:   0.08em   → 0.07em
```

我们的字体栈第一位是 ZKMSerendipity，回退是 Helvetica Neue —— 骑在两派中间，
所以取收紧那一派的**下界**而不是中值。
标签取 0.07em：ZKM 换算出来是 +0.067em，取整，方向是"小字号放开"那一条没变。

---

## D 大标题行距

**他们做了什么（实测）**

| 区间 | 站点 |
|---|---|
| **0.95–1.0625**（真·display） | FIELD **0.95** · Serpentine 1.00 · ZKM 1.00 · Dumbar 1.05 · UE 1.0625 |
| 1.15–1.22（机构 / 易读） | ZKM 移动 1.15 · DAE 1.2 · UAL 1.20 · RCA 1.22 |

规律很干净：**≥60px → 0.95–1.05；40–60px → 1.15–1.22。**
Serpentine 的写法最省事：把 line-height 的 clamp 写成和 font-size **完全一样**的 clamp，
等于恒定 lh = 1。

**我们改了什么**

```
新  --sb-lh-display: 0.95      （我第一版写的 0.9 在区间之外）
改  --sb-lh-h1: 1.15 → 1.08
```

0.9 不只是"不够典型" —— 我们的巨题是中英并置，英文那一行带降部，0.9 会把降部压进下一行。

---

## E 版面结构：左右排的实际比例

**他们做了什么（实测）**

| 项 | 值 |
|---|---|
| 栅格列数 | 12 栏主流（UE / FIELD / Serpentine / Dumbar）；UAL **25 栏**；ZKM `11rem auto 11rem` |
| **左右分栏比** | **DAE `1fr 3fr`（25/75）与 `4fr 1fr`；RCA `2fr 3fr`（40/60）与 `1fr 1fr 27.5%`** |
| 固定侧导轨 | ZKM **11rem（176px）**；RCA 左右各 **16.74%** |
| 容器 max-width | ZKM 1200（出现 46 次）· Ars 1200 · RCA 1440 · **Serpentine 1530** · FIELD 1800 · Dumbar 2800 |
| 正文测量 | 40ch–85ch / 700–1120px |
| gutter | **20–40px**，响应式 20→30px 最常见 |
| 左右边距 | Serpentine 四档 **20 / 40 / 50 / 60px**；UAL / RI **4vw** |

"左标签 / 右正文"有两种写法：**固定 rem 导轨**（ZKM 11rem）和**百分比分栏**（RCA / DAE）。

**我们改了什么** — 新文件 `src/ui/editorial.css`

```
新  .ed            max-width: 1530px          （Serpentine 的 95.625rem）
新  --ed-edge      clamp(20px, 4.2vw, 60px)   （Serpentine 四档 20→60 的连续版）
新  .ed-section    grid-template-columns: 2fr 3fr   （RCA / DAE 实测同款）
新  .ed-hero__lede grid-template-columns: 2fr 3fr，内容只占第 2 栏
```

原来 `/about` 是 `12rem 1fr` + `max-width: 1100px` —— 固定 rem 导轨那一派，
但 12rem（192px）的标签栏配 1100px 的版心，比例是 17/83：标签栏太窄，
"左右排"读不出来，只读作"缩进"。改成 2:3 之后左栏是真的一栏。

`/passport` 的记录行同样从 `minmax(7rem,12ch) 1fr` 换成 `2fr 3fr`，
**三页共用同一条竖切线** —— 这是它们像同一件作品的三个房间的原因。

---

## F 留白

**他们做了什么（实测）**

| 项 | 值 |
|---|---|
| 首屏标题区 padding-top | **RCA 110 / 180 / 240px 三档** |
| 首屏标题区 padding-bottom | RCA 60 / 80px；Dumbar h1 `margin-bottom: 60 → 120px` |
| 章节上下 padding | **Serpentine `clamp(1.25rem → 4.375rem)` = 20 → 70px** |
| 大区块间距 | Serpentine 80 → 160px；Dumbar 工具类 **40 / 80 / 120 / 160px** 四档 |
| **vh 的使用** | **11 个站，0 个用 vh 做首屏留白** |

最后一条是这次研究里最值得记的一条，因为它推翻了我写的第一版。

**我们改了什么**

```
改  .ed-hero__title padding:
      clamp(3rem, 11vh, 8rem) 0 clamp(2.5rem, 9vh, 6rem)        ← 我的第一版
    → clamp(6.875rem, 9.5vw, 15rem) 0 clamp(3.75rem, 5vw, 7.5rem)
      （= 110→240px 上 / 60→120px 下，RCA 与 Dumbar 的实测区间）

改  .ed-section padding: clamp(2.5rem, 4.5vw, 4.375rem) 0       （Serpentine 20→70 的上半段）

全文  vh → vw     about.css / passport.css / editorial.css 里所有的 vh 都换掉了
```

为什么他们都不用 vh：**移动端地址栏收放会改 vh**，于是巨题会在滚动过程中自己跳一下。
vw 不会。这不是审美偏好，是一个 bug 的避让。

---

## G 动效：时长、缓动，以及我们故意比他们多做的一件事

**他们做了什么（实测）**

| 项 | 值 |
|---|---|
| 微交互（hover / 颜色） | **100–250ms**，最典型 200–250ms（RCA 全站 `.25s`；Borsche 全站 `200ms`；UE 默认 `.15s`） |
| 元素进场 | **200–500ms** |
| stagger 步长 | **50ms**（Dumbar 的 `transition-delay` 从 0 一路排到 2700ms） |
| 招牌缓动 | 各家一条、全站复用：**Dumbar `cubic-bezier(0,0,0,1)` 出现 285 次** · RCA `(.24,.26,.2,1)` · Serpentine `(.46,.03,.52,.96)` · UE `(.4,0,.2,1)` |
| hover 语言 | Serpentine `text-decoration:underline` **×43**；Dumbar / Borsche / DAE 完全不用下划线 |
| `position: sticky` | **8 / 10** 的站在用 |
| **`prefers-reduced-motion`** | **仅 2 / 11。** RCA ×5（`scroll-behavior:auto` + 多处 `transition:none`）；UAL ×1（只关了 smooth scroll）。其余 9 家 **0 次** |

**我们改了什么**

```
新  --ed-ease: cubic-bezier(0, 0, 0, 1)      一条缓动全站复用（Dumbar 那条）
改  进场时长 720 / 760ms → 400ms             （我的第一版在 200–500 区间之外）
改  stagger  90ms → 50ms
新  链接 hover: background-size 200ms         下划线从左生长，不用 border 换色
```

挑了**三个**动作做透，不是每样沾一点：

1. **进场 · 一条线从左展开**（`.ed-rule--heavy`，`scaleX 0→1`）。一条线画开一页，
   比任何淡入都更像开幕。
2. **进场 · 巨题分段揭示**（`.ed-rise`，中文 / 英文各一段，50ms 错开）。
   分段而不是整块：整块淡入读作"网页加载完了"，分段才读作"有人在把它揭开"。
3. **滚动 · 章节标签吸顶**（`.ed-section__tag`，`position: sticky`）。纯 CSS，不监听滚动。
   它让长页面不再需要导航条 —— 位置感由版面自己给出。
   `/passport` 上同一个原语让**那枚章跟着记录一起滚**：读到「后果」那一段时，
   是哪一次裁定还在左边看得见。

**视差没有做。** 11 个站的 CSS 里 0 命中，我们拿不到任何可对标的参数 ——
在没有依据的地方"克制地做一点"，做出来的一定是凭感觉的那一版。

**`prefers-reduced-motion` 我们做得比 10/11 的样本认真**，而且写法是反过来的：

```css
@media (prefers-reduced-motion: no-preference) { /* 动效整个在这里面 */ }
```

不是"先写好动效再去 `reduce` 里覆盖"。默认态（不动）写在常规规则里，
所以关掉动效不是另一条代码路径，是**少执行**一段。
这条纪律的实际后果：降级态是**已经揭示好**的页面，而不是停在起始帧的空白页
—— 后者才是绝大多数"支持 reduced-motion"的站真正的样子。

证据：`scratch/evidence/editorial-motion-computed-{on,reduce}.png` —— 同一份**打包产物的
CSS**，用 `--force-prefers-reduced-motion` 开关跑两遍，把 computed style 印在页面上截图：

| | reduce = false | reduce = true |
|---|---|---|
| `.ed-rule--heavy` animation-name | `ed-draw` | **`none`** |
| `.ed-rise > *` animation-name | `ed-rise` | **`none`** |
| `.ed-rise > *` opacity | `0`（起始帧） | **`1`** |
| `.ed-rule--heavy` transform | `matrix(0,0,0,1,0,0)`（scaleX 0） | **`none`** |

最后两行才是重点：关掉之后不是"动画跑到一半停住"，是**根本没有起始帧**。
另有 `editorial-motion-reduce.png`：`reduce` 下的整页长图，内容完整。

为什么不给"动画跑到一半"的对照图：我们选的缓动是 `cubic-bezier(0,0,0,1)`，
它在时间过半时视觉上已经走完 97% —— 任何一张中途截图看起来都和终态一样。
这是那条曲线的性质，不是动效没生效。所以证据取 computed style，不取时序截图。

---

## H 三页各自的关键视觉

实测里最值得注意的一点：**做巨题的站，巨题旁边都有图**（Serpentine 的 feature
`min-height: 580px`、RCA 的 image-video-block、UE 的满屏影像）。
我们没有影像，所以每一页必须自己长出一个视觉锚点。

| 页 | 锚点 | 改了什么 |
|---|---|---|
| `/about` | 23 个物种的形态空间散点 | viewBox 900×520 → **1600×620**（扁画幅才读作"一条谱系"，方画幅读作"插图"）；横跨两栏、突破版心贴到视口边；标记 stroke 1.5→1.75，编号 9px→11px |
| `/passport` | 两枚章 | `.pp-mark` —— 3px 粗框、全大写裁定 clamp(1.75rem, 3.2vw, 2.75rem)、编号 + 日期，整体 `rotate(-2.5deg)`。**歪是全部的说服力来源**：正的框是 UI，歪的框才是手按上去的痕迹 |
| `/making` | 巨大的开场 + 数字带 | 档案的密度**没有动**（它就该密）；前面加 `.ed-hero`，并把数字从 1.75rem 提到 `clamp(1.75rem, 3.4vw, 3rem)` —— 巨题说"这是什么"，数字带说"有多少" |

`/passport` 的章是全站唯一一处出现"图形"而不是纯排版的地方。
它不违反 `docs/23 §0` 的禁止清单（卡片 / 阴影 / 圆角 / 图标）：它没有阴影、没有圆角、
不是卡片。它是这一页的内容本身 —— 页面叫护照，形式和内容是同一件事。

---

## I 没有采纳的实测结论，以及为什么

| 他们做了 | 我们没照做 | 为什么 |
|---|---|---|
| ZKM 根字号走到 **115%** | 只走到 110% | 115% 会撑开 dev 工具页那些密表。type.css 是**全站共用**的，展陈页的舒适不能拿工具页的信息密度去换 |
| UAL **25 栏**栅格 | 用 2fr 3fr | 25 栏是给"很多作品卡片"的站的。我们三页都是长文，用不到那个分辨率 |
| Dumbar stagger 排到 **2700ms** | 队列只有 2 段、总计 200ms | 那是给一屏几十个卡片的。我们首屏只有中英两段，长队列会变成"等" |
| Serpentine `text-decoration:underline` ×43 | 用 `background-size` 生长 | 语义一样，但 `text-decoration` 做不出"从左长出来"这个动作 |
| Dumbar 容器 **2800px** | 1530px | 我们没有满幅影像要摊开；1530 之上正文会散 |

---

## I-2 无头截图的 500px 地板（一条工具的事实，记下来省得下次重踩）

`--window-size=420,N` 在 macOS 的 headless Chrome（new 和 old 都一样）上**拿不到 420 的视口**：
窗口被钳到最小 500px，页面按 500 排版，截图再裁到 420 —— 于是右边距看起来被吃掉了，
像是版面溢出。实测见 `probe.html`：`innerWidth` 报 `500 | 500`。

所以窄屏证据是 **500px** 的长图（`editorial-*-narrow500.png`）。
420px 的验证走真浏览器：视口 420 下 `scrollWidth === clientWidth === 420`，
`getBoundingClientRect().right > clientWidth` 的元素数 = **0**。

这一趟不是白走的 —— 它顺手抓出了一个真 bug：`/about` 的满幅散点带在窄屏下
仍然带着 `margin: 0 calc(var(--ed-edge) * -1)`，把文档撑宽到 460px。
已修（`about.css` 的 `@media (max-width: 860px)`）。

---

## J 五秒问题

> 一个评委只在 `/about` 上停留 5 秒，他会记住什么？

**改之前：什么都记不住。** 首屏是 2rem 的标题（32px）压在一堆同样大小的章节标题
之间，十几段灰字均匀铺满 1100px 的版心，没有任何一个元素比别的更响。
五秒之后他带走的是一个印象 —— "一份文档" —— 而不是一件作品的名字。
这是**档案的排版**用在了**要被扫的页面**上。

**改之后：他带走三样，按拿到的先后排：**

1. **「看我看你 / SEE-ME SEE-YOU」** —— 151px，占掉首屏近一半，旁边是空的。
   五秒里第一秒就够了。
2. **一条横贯视口的线，把题和内容切开。** 它给出"这是一个有版面的地方"这个判断，
   而这个判断决定了他要不要往下看。
3. **那张 23 个物种的散点图** —— 如果他滚了一下的话。它横贯整幅，
   是这件作品**唯一一张只有它自己能画出来的图**（别的都可以用文字说，这张不行）。

第 1 条是这次改动的全部目的。第 2、3 条是为了让第一条之后还有东西接住。
