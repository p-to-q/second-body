# 47 · 换页 —— 每一跳量出来是什么样、改了什么、没改成什么

> 2026-09-14。作品负责人：「页面之间的切换，有时候卡，有时候不舒服，有时候太突然……
> 像美术馆或设计过的装置那样克制简单，但交互要做好。」随后追加导航审计（§5），
> 再随后「你自己做」：原本列给负责人裁定的几条也在这条线里落地了（§5.2）。
>
> **结论（2026-09-14 第二轮）：跨页过渡开着。** 第一轮在无头 Chrome 上量到白帧、关掉过；
> 第二轮查到了根因（WebGPU 画布出了绘制它的任务就读不到，截图是透明的，透出叠层缺省的白），
> 修在根上，然后在这台 Mac 的**真窗口**里量：修完之后 9 轮有头跑，白帧只剩"离开开着摄像头的舞台"和"404 → 展签"
> 两类，这两类加了门槛（一刀切），之后 2 轮有头 30 跳 0 白。下面 §4.3 是全部数字，§6 是没做完的。

## 1. 怎么量的

| | |
|---|---|
| 浏览器 | Chrome 152 无头（`--headless=new --enable-unsafe-webgpu --use-angle=metal`），1280×800，假摄像头 |
| 协议 | 原生 CDP，不装依赖：`scratch/transitions/measure.mjs` |
| 服务 | `scratch/transitions/serve.mjs` —— **照着 `vercel.json` 发**：`cleanUrls`（`.html` 回 308）、`trailingSlash:false`、`headers` 表、平台缺省 `max-age=0, must-revalidate`、ETag/304、`404.html`。`vite preview` 这几样一样都不做，拿它量跳的代价是错的 |
| 网络 | `Network.emulateNetworkConditions` 40ms 延迟 / 25 Mbps。**服务端不压缩**，所以字节数是未压缩的，只拿来前后对比 |
| 画面 | `Page.startScreencast` PNG 320×200，每一帧算平均亮度、离散度、平均色；**离散度 < 3 = 空帧**；「跳变」= 相邻两帧亮度差的最大值（满量程 255） |
| 缓存 | 每轮新 profile（冷缓存）；一轮里二十几跳顺序走，跳与跳之间缓存是真的 |
| 前 / 后 | 前 = `8842a91` 的 dist（`scratch/transitions/dist-before/`）；后 = 本线最终代码（`dist-after/`），**连跑两轮** |

`ready` = 这一跳的目标状态成立的毫秒数（文档页：正文 > 200 字且 `complete`；舞台：`[main] running`；
展签：`.sb-entry` 在且纸底；选择页：`[loading] 加载完成`）。含悬停的两跳里包含 ~650ms 的停留。

## 2. 每一跳：机制与前后

机制：**重载** = 同一个 `index.html` 带着新 query 重新开（`location.assign`）；**跨页** = 另一张 html；
**原地** = 同一个文档里换 DOM；**往返缓存** = 浏览器后退从 bfcache 里恢复。

| # | 跳 | 机制 | ready 前→后 ms | 最大跳变 前→后 | 空帧 前→后 | 其他 |
|---|---|---|---|---|---|---|
| 01 | 冷开 `/`（展签） | 跨页（冷） | 851 → 672 | **240 → 5** | 深底 707ms → 纸 617ms | 深底那 700ms 是 `index.html` 写死的底色，纸要等脚本 |
| 02 | 展签 → 选择页 | 原地 | 1199 → 864 | 3 → 3 | — | 同一个环进入下一阶段，本来就连续 |
| 03 | 选择页 → 舞台 | 原地 | 1314 → 1278 | **198 → 66** | — | 前：纸一帧翻深，中间 ~450ms 没有帧；后：卡片留着直到舞台第一帧，同文档交叉淡化 |
| 04 | 舞台 → `/about`（目录） | 跨页 | 385 → 196 | 39 → 27 | — | |
| 05 | `/about` → 后退 → 舞台 | 往返缓存 | 79 → 45 | 27 → 18 | — | **恢复**，舞台不重开（回放驱动时） |
| 06 | 舞台 → 回到大厅 | 重载 | 268 → 287 | 202 → 205 | — | 后：落在**选择页**不再是展签（§5.2）。仍是一刀切（§4.3） |
| 07 | 展签 → `/about`（了解） | 跨页 | 98 → 61 | 230 → 230 | — | 一刀切，纸 → 深 |
| 08 | `/about` → `/making`（目录） | 跨页 | 175 → 143 | 10 → 10 | 深 75ms → 58ms | **308 1 → 0**（目录链接改干净地址） |
| 09h | `/about` → `/lineage`（悬停再点） | 跨页 | 977 → 858 | 10 → 10 | — | 308 1 → 0；悬停触发预取（§3.3） |
| 10 | `/about` → `/dev/figure`（旁注） | 跨页 | 169 → 198 | 16 → 14 | — | 仍有 1 次 308（§6） |
| 11 | `/dev/figure` → `/about`（devnav） | 跨页 | 111 → 66 | 13 → 13 | — | |
| 12 | `/about` → `/parts`（门） | 跨页 | 345 → 335 | 10 → 10 | 深 230 → 210ms | 那 200ms 是 247 个缩略图画布在建，不是跳本身 |
| 14 | `/about` → `/`（横带） | 重载 | 144 → 118 | 224 → 224 | — | 一刀切，深 → 纸 |
| 14a | 不存在的地址 | 跨页 | 56 → 109 | — | — | 前：平台一行 `NOT_FOUND`，**没有出口**；后：`404.html` |
| 14b | 404 → `/` | 跨页 | 无路 → 111 | — → 223 | — | §5.1 |
| 15 | 深链 `/?theme=porcelain`（冷，摄像头） | 跨页（冷） | 10494 → 10592 | — | 深 6.4s → 6.5s | 17.9 MB：MediaPipe wasm 11.5 MB + 姿态模型 5.6 MB（采集线的事，本线不动） |
| 15b | `/about` → 后退 → 舞台（摄像头开着） | 重开 | 778 → 667 | — | — | **不进往返缓存**：`LiveMediaStreamTrack`（§3.4） |
| 16 | 舞台 → 换物种 | 重载 | 1371 → 783 | 109 → 108 | — | 重新验证 13 → 4（§3.2） |
| 17 | 舞台 → 工作台（控件） | 跨页 | 207 → 206 | 103 → 111 | — | 1 次 308（§6） |
| 18 | 工作台 → 舞台（返回） | 重载 | 775 → 704 | 9 → 10 | — | 状态经 `?from=` 带回 |
| 19 | 现场 `/?kiosk=1` | 跨页 | 291 → 295 | 233 → 132 | 深 224ms → 纸 193ms | 剩下的 132 是上一页（舞台）到纸的那一刀，现场是地址栏打开的，没有上一页 |
| 20 | 现场：选择页 → 舞台 | 原地 | 1220 → 1276 | **167 → 69** | — | 同 03 |

原始数据：`scratch/transitions/{before,after,after-2}/results.json`（每跳还有请求表、堆、画布数、`frames.tsv` 逐帧亮度）。

## 3. 加载、缓存、内存

### 3.1 一跳一次的 308

`vercel.json` 开着 `cleanUrls`。线上 `curl -sI`（2026-09-14）：`/making.html`、`/lineage.html`、
`/passport.html`、`/dev/`、`/dev/figure.html` 全部 **308**。目录里三条正是 `.html`，每点一次多一个往返。
改成 `/making` `/lineage` `/passport`；空位深链 `/passport.html#stamp-iv` 同样改掉。
守卫 `test/hop-cost.test.ts`：`src/` 里不许再有指向根目录页面的 `.html` 链接（比较语句不算）。

### 3.2 每一页都要重新验证的静态文件

平台缺省 `max-age=0, must-revalidate`。线上实测字体（`LXGWWenKai-subset.woff` 227 KB 等三件）、
离散接触音（九件 `.webm`）都是缺省值 —— 每开一页、每重载一次舞台，各发一次条件请求。
`vercel.json` 加两条 `max-age=86400`（和 `/parts/*.glb`、`/refs/*` 同一档）。
舞台一次重载的重新验证 **13–15 → 4–6**。`/assets/*` 本来就是带哈希的永久缓存；
`parts.json` / `curation.json` **故意**每次验证（`library.ts` 用 `cache:'no-cache'` 取），没动。

> 量的时候踩过一次自己的坑：`serve.mjs` 第一版把 `vercel.json` 的 `(.*)` 先转义了点号，
> 于是 `/assets/*` 没吃到 `immutable`，第一轮「前」数据里重载显得慢得多（hall 491ms）。
> 修掉之后整轮重跑，上表是重跑的。`hop-cost.test.ts` 里同一个转换写的是修过的顺序。

### 3.3 预取

`ui/transitions.ts` 的 `speculationRules()`：**预渲染**只给四张文字页（`/about` `/making` `/passport` `/lineage`），
其余同源页只**预取** HTML，`/` 和 `/api/*` 连预取都不做；`moderate`（悬停约 200ms）。
只由目录、横带、工作台出口三处装上 —— 现场一处都不挂。
CDP 探针（`scratch/transitions/spec-probe.mjs`）：规则装上了，悬停 `/lineage` 触发了预取；
**预渲染在 DevTools 连着时被 Chrome 自己关掉**（`PrerenderingDisabledByDevTools`），所以预渲染的收益**没量到**。
`URLPattern('/')` 匹配 `/?theme=x` 为真，排除舞台那一条是对的。

### 3.4 离开舞台时留下什么

多页站点，离开就是整个文档被拆掉 —— 除了往返缓存：

- **回放驱动的舞台**（展签 → 开始 → 选择）：后退**从往返缓存恢复**（05，45ms），渲染器和身体原样都在。这是最快的回程，不该为了"释放"而破坏它。
- **摄像头开着的舞台**：Chrome 不收（`LiveMediaStreamTrack`），后退就是一次完整重开（15b，667–972ms）。离开时摄像头随文档一起释放，**什么都没有留下**。
- 想让摄像头舞台也能从往返缓存回来，需要离开时停摄像头、回来时重启 —— 那是 `Capture` 的启动路径，归采集线。**请求**：`Capture` 上一对 `pause()` / `resume()`（或等价的重启方法）。本线不改 `capture/`。
- 原地 选择页 → 舞台：环那个 WebGPU 渲染器在交棒的那一下 `dispose()`（原来是 180ms 之后），不和舞台的渲染器同时活着更久。

### 3.5 首屏字节

本线新增的模块未压缩约 +15 KB（01+02+03 三跳 4482 → 4497 KB，均未压缩）。
`docs/13` 的 < 3 MB 是压缩后、按线上量的；本线**没有重新按线上压缩量**（Not run：改动没有部署）。

## 4. 过渡

### 4.1 第一帧就是对的底色（落地）

`index.html` 在任何脚本之前，按 URL 判断这一次会不会进展签 / 选择页（没有 `theme`、不是自检），
是就给 `<html>` 挂上 `sb-first-screen`，行内一行 `#fafafa`。`main.ts` 的 `adoptPrepaint()` 把它登记成
首屏配色的一个 holder，展签 / 选择页各自 hold 住之后再放。判断在 `ui/transitions.ts` 的 `groundFor()`，
`index.html` 那几行是抄本，`test/transitions.test.ts` 拿真函数逐条对。

效果：冷开 `/` 的 707ms 深底没了（01：跳变 240 → 5），现场开机的 224ms 深底没了（19）。**不靠任何动画。**

### 4.2 选择页 → 舞台：等舞台画出来再交棒（落地）

原来：卡片涨满屏幕的那一刻就交棒，首屏配色一帧翻成深底，舞台还没画出来，中间 ~450ms 一帧都没有（03 前）。

现在：`choose.ts` 先把选定的 id 交给 `main.ts`，卡片留在原地；`main.ts` 在帧循环开跑后 `announceStageShown()`
（再过两帧）；`stageShown()` 等到它，**或者等满 5 秒**，然后 `handOff()`：同文档 `document.startViewTransition`，
截卡片那一帧 → 翻底色、拆环 → 平台淡到舞台（出 180 / 进 240）。看门狗 1260ms 强制收掉。
不支持 / `prefers-reduced-motion` 时退回原来那条 180ms 淡出。

03：跳变 198 → 66；20（现场）：167 → 69。六轮（前一次单跑、两对、最终一对）**0 次白帧**。
胶片：`scratch/transitions/filmstrips/{before,after}-03.png`。

### 4.3 跨页过渡：第一轮关掉，第二轮查到根因、开着

**第一轮（无头 Chrome，九次）**：跨页过渡第一帧整帧纯白（亮度 255、离散度 0），两次归因都被下一轮推翻，关掉了。
那两次归因（「藏掉 GPU 画布」「给叠层不透明的底」）各自只修了一半 —— 合起来才是根因，见下。

**根因。** `stage/ink-sampler.ts` 早就记着：WebGPU 画布出了绘制它的那个任务就读不到。平台给旧页截图时，
舞台和选择页的环都是透明的；叠层缺省也是透明的；于是透出来的是白。只藏画布 → 截到的是透明（照白）；
只给叠层底色 → 白变成新页的底色，读作一刀切。两样都要：

1. **冻画布**（`ui/page-transition.ts` 的 `registerFreezable` / `freezeCanvas`）：画面的主人登记一个 `render()`，
   `pageswap` 里在同一个任务中画一帧、`drawImage` 进一块 2D 画布、盖在原处。舞台（`main.ts`）和环（`ring/field.ts`）登记；
   选择页交棒时先冻再拆环。往返缓存恢复时 `pageshow` 解冻。
2. **叠层底 = 底色令牌**：`type.css` 的 `::view-transition { background: var(--sb-paper) }`，首页行内深 / 纸各一份。
3. **新页第一帧就是建好的页**：展出页与工作台页的入口脚本 `blocking="render"`（`build/render-blocking.ts`，首页除外）。
   不加时有头实测 `/making` `/lineage` 的第一帧早于模块，过渡淡到一块空底。
4. **舞台起 WebGPU 之前等过渡落定**（`revealSettled`）、**交棒等帧间隔稳住**（`framesSteady`）：着色器编译卡住合成器，
   240ms 的淡化一帧都画不出来。

**有头（真窗口）白帧计数**（`scripts/transitions/tally.mjs`，白帧 = 动作之后 #ffffff 且离散度 0 的截屏帧）：

| 跳 | 修根因后、加门槛前（7 轮） | 加门槛后（2 轮） |
|---|---|---|
| 01–13（冷开、原地交棒、舞台→陈述页、回到大厅、文档页之间、滚到页底、中途再跳、工作台 ↔ 文档页、侧室） | 全部 0/7 | 0/2 |
| 14b 404 → 展签 | **7/7** | 0/2（不过渡） |
| 15a 开着摄像头的舞台 → 陈述页 | **6/7** | 0/2（不过渡） |
| 16 开着摄像头的舞台 → 换物种 | **2/7** | 0/2（不过渡） |
| 17 开着摄像头的舞台 → 工作台 | **5/7** | 0/2（不过渡） |
| 18–20（工作台 → 舞台、现场开机、现场交棒） | 0/7 | 0/2 |

所以最后两条门槛是**量出来的**，不是猜的：活的摄像头流不在冻画布的管辖里，404 那一页原因未查。
回放驱动的同一个舞台（04）7/7 干净。

**无头 Chrome**：修根因后没有再跑完整的十轮（负责人要求停止占屏测试，§6）。第一轮的无头白帧不再作为判断依据。

**门槛（任何一条不满足都一刀切，`ui/transitions.ts` 的 `transitionAllowed`，测试逐条翻）**：
不支持 View Transitions（Firefox / 旧 Safari，第一帧底色照样对）· `prefers-reduced-motion` · `?vt=off`（给现场操作的人的总开关）·
现场 `?kiosk=1` · 前进 / 后退（含往返缓存恢复）· 这一页上有活的摄像头流 · 表里写了理由的 `none`（`label>label`、`missing>label`）。

**保护**：`pageswap` / `pagereveal` 同步、`try/catch` 里任何意外 → `skipTransition()`；看门狗 `SETTLE_MS` = 最长一档 × 1.5 = 630ms，
到点一刀切；`startViewTransition` 抛异常 → 交棒走原来那条 180ms 淡出；拿摄像头之前 `transitionIdle()`（最多 680ms）；
共享元素只在两侧都有、且在视口里时才挪，否则只是淡。

**边界实测（有头，9 轮）**：滚到 `/about` 页底再跳 `/making`（09s）—— 字标不在视口，没有从视口外飞进来，新页落在顶部（scrollY 0），0 白；
一次过渡进行中又跳一次（09r）—— 落在第二个目标、没有残留的 `view-transition-name` 或冻住的画布（`leftover` 9/9 为 0）；
后退回舞台（05）—— 往返缓存恢复、不过渡、画面活着。

### 4.3.1 有哪几样东西在挪

| 共享元素 | 声明处（`declareShared`） | 在哪几对之间挪 |
|---|---|---|
| 巨题（作品名那一行） | `shell/entry.ts`（展签）、`about/about.ts`（`.sb-zh`） | 展签 ↔ 陈述页 |
| 字标（两行 SEE-ME / SEE-U） | `ui/hero.ts`（横带）、`choose/choose.ts`（选择页左上） | 文档页 ↔ 文档页 / 侧室 / 404；展签按「开始」后巨题挪成它（同文档） |
| 「目录」那个词 | `ui/nav.ts` | 所有挂目录的页之间 |
| 工作台出口 | `dev/devnav.ts` | 工作台页之间 |
| 页脚那张图 | `ui/footer-mark.ts` | 文档页 / 侧室 / 工作台目录之间（只在视口里时） |

### 4.4 一把尺子

`MOTION`（`ui/transitions.ts`）= `type.css` 的 `--sb-dur-leave` 180ms / `--sb-dur-enter` 240ms / `--sb-dur-move` 420ms / 两条缓动，
= docs/23 §0 那一行（测试逐字对）。
过渡的关键帧只挂在 `::view-transition-*` 上（叠层过渡完就消失）；`prefers-reduced-motion: reduce` 下交棒不动。

## 5. 导航审计

### 5.1 逐页

判定：**OK** / **fix-light**（本线修了）/ **owner**（原本要请负责人裁定，负责人授权后本线做了，见 §5.2）。

| 页 | 怎么进来 | 怎么出去 / 回去 | 告诉人"在哪" | 问题 | 判定 |
|---|---|---|---|---|---|
| `/` 展签 | 地址栏、目录「作品」、陈述页横带、devnav「回到作品」、404、自检 | 开始、了解这件作品、目录（铺开） | 巨题 | 无 | OK |
| 选择页（`/`） | 开始、回到大厅、现场 | 选定、目录（收起；现场无） | 左上字标、物种名 | 「回到大厅」原来落回**展签**，要再按一次开始；`exits.ts` 自己写的是「S3 → S2」 | owner → 已改 |
| 舞台（`/?theme=`） | 选定、深链、换物种 / 随机、工作台返回、后退 | 回到大厅、目录、控件里的工作台链接 | 物种名 4 秒 | 无（现场不挂出口是设计） | OK |
| `/about` | 了解、目录、各页横带、404 目录、工作台目录 | 横带「回到作品 → /」、目录、门、旁注 | 巨题、目录当前页 | 从 `/dev` 点进来回不到 `/dev` | fix-light |
| `/making` `/passport` `/lineage` | 目录 | 横带、目录 | 巨题、目录当前页 | 横带写「回到作品」却指向 `/about` —— 字和点下去发生的不是一件事；从 `/dev` 来回不去 | fix-light |
| `/parts` `/roster` `/marks` | `/about` 的门、工作台目录 | **只有**横带「回到作品 → /about」 | 巨题 | 从 `/dev` 点进来被送去一个没去过的地方；没有目录，去不了别的面；`/parts` 开页控制台一条红色 400（写回探针） | fix-light + owner |
| `/dev` 工作台目录 | 目录「工作台」、自检 | devnav「退出 · 回到作品」 | 页头 | 行不带来处 | fix-light |
| `/dev/*` 仪器页 | 工作台目录、旁注（带 `from`）、控件链接（带 `from`） | devnav 返回来处 / 工作台 / 作品，Escape | 页头 | 英文「Workbench」不是一个动作 | fix-light |
| `/?selftest=1` | 工作台目录 | 进现场、回放兜底、录制页 | 页头 | 三条都是"再开一次"，没有一条是离开 | fix-light |
| `/?kiosk=1` | 现场开机 | 无 | 无 | 无出口是设计（装置没有地址栏） | OK |
| 不存在的地址 | 手滑、旧链接 | **无**：平台一行 `NOT_FOUND` | 无 | 死路 | fix-light |
| 目录本身 | 各页 | — | 当前页不可点 | 三条链接 `.html` → 308；当前页对读屏不是「当前页」 | fix-light |

### 5.2 改了什么

| 改动 | 文件 | 守卫（先红后绿，红的输出在 `scratch/transitions/red/`） |
|---|---|---|
| 每一张 html 顺着 import 走到一个出口构件；自检页多「工作台 /dev」「作品 /」 | `shell/selftest.ts` | `test/page-exits.test.ts` 第 1、2 条（第 1 条对旧代码是绿的，拿掉 `dev/figure.html` 的 devnav 挂载当场红） |
| `/dev` 进来处白名单，名字「工作台」；工作台目录的行带 `?from=/dev`；四张文档页横带都读 `from` | `ui/return-to.ts` `dev/index.ts` `about/making/passport/lineage` | `page-exits` 第 3、4 条；`asides.test.ts` 从「拒掉」名单里拿掉 `/dev/` |
| **侧室挂目录**（收起） | `rooms/room.ts` | `page-exits` 第 5 条 |
| 目录当前页 `aria-current="page"` | `ui/nav.ts` | `page-exits` 第 6 条 |
| 横带回 `/about` 时写「返回作品陈述」 | `ui/hero.ts` | `page-exits` 第 7 条 |
| **回到大厅 = 选择页**：`?hall=1`，展签不立、仍回放起步不问摄像头；选定后从地址里拿掉 | `ui/exits-url.ts` `shell/kiosk.ts` `shell/entry.ts` `main.ts` `choose/choose.ts` | `page-exits` 第 8 条 |
| devnav 英文「Back to the workbench」 | `ui/i18n.ts` | — |
| 404 页（横带 + 目录） | `404.html` `notfound/page.ts` | `page-exits` 第 1 条扫到它 |
| 目录 / 空位深链干净地址；字体、接触音缓存一天 | `ui/nav.ts` `shell/vacancy.ts` `vercel.json` | `test/hop-cost.test.ts` 两条 |
| `/__curate` 探针改 `?probe` → 204，不再每次一条红色 400 | `vite.config.ts` `rooms/parts.ts` | — （dev server 中间件，没有单测） |
| 第一帧底色、选择页交棒、尺子、过渡表 | `index.html` `ui/transitions.ts` `ui/page-transition.ts` `choose/ring/first-screen.ts` `ui/type.css` | `test/transitions.test.ts` |

## 6. 没做的，和计划

| | 为什么没做 | 下一步 |
|---|---|---|
| 修根因之后的**无头**十轮 | 负责人要求停止测试（占屏、额度） | `node scripts/transitions/measure.mjs … ` 不带 `HEADED` 跑十轮，`tally.mjs` 对比有头 |
| 有头**十轮**（只跑了 7 + 2） | 同上 | `HEADED=1` 再跑 ≥3 轮补齐；重点看 03 / 06 / 07 的最大跳变 |
| 减少动态效果、无 View Transitions 的有头实跑 | 同上；靠单测（门槛表逐条翻）和第一帧底色守卫 | `REDUCED=1` / `NOVT=1` 各跑一轮 |
| 404 → 展签、摄像头舞台离开时的白帧**原因** | 查到门槛为止 | 冻 `<video>` 的当前帧（`drawImage(video)`）再试开 15a；404 对比 200 页 |
| 前后胶片（有头）| 同上 | `scratch/transitions/runs/headed/r0*/<跳>/strip.png` 已有，没挑图 |
| 预渲染收益 | CDP 连着时 Chrome 关预渲染 | 真窗口里用 Performance 面板量 `activationStart` |
| `/dev/*.html` 链接仍 308 | vite dev server 不认 `/dev/figure` | dev / preview 挂 `/dev/x` → `/dev/x.html` 中间件 |
| 摄像头舞台进往返缓存 | 要动 `Capture`（采集线） | 采集线给 `pause()/resume()` |
| 首屏压缩字节 | 没部署 | 部署后照 docs/13 重量（本线新增模块未压缩 < 20 KB） |

## 7. 证据

- 胶片（前 / 后，每张从左到右按变化取帧，`*.txt` 是每帧的毫秒与平均色）：
  `scratch/transitions/filmstrips/before-01.png` / `after-01.png`（冷开 `/`）、
  `before-03.png` / `after-03.png`（选择页 → 舞台）、
  `before-06.png` / `after-06.png`（回到大厅）、
  `before-07.png` / `after-07.png`（展签 → 陈述页）、
  `before-08.png` / `after-08.png`（目录的 308）
- 逐跳数据：`scratch/transitions/{before,after,after-2}/results.json`（第一轮无头）；
  `scratch/transitions/runs/headed/r01–r09/results.json`（第二轮有头），计数 `scratch/transitions/runs/tally-headed-7.txt`、`tally-headed-final.txt`
- 可复现：`scripts/transitions/{serve,measure,tally,png,summary}.mjs`
- 白帧那九轮的中间数据：`scratch/transitions/{probe-cam,probe-cam2,white}/`
- 守卫的红：`scratch/transitions/red/*.txt`
- 预取探针：`scratch/transitions/spec-probe.mjs`
