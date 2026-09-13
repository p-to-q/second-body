# 35 · 首屏那个环 —— 移植自 Viscose-carousel

> 这一份回答四个问题：**授权能不能用**、**借了什么没借什么**、
> **那套 SDF 数学怎么从 GLSL 搬到 TSL**、**签名效果做到了几成**。
>
> 实现在 `packages/app/src/choose/ring/`（`sdf.ts` / `field.ts` / `atlas.ts` /
> `first-screen.*`），外壳是 `src/choose/choose.ts`，开屏那一半是 `src/shell/entry.ts`。
> 旋钮全在 `packages/core/src/tuning.ts` 的 `RING`。

## 0. 参考作品

| | |
|---|---|
| 名字 | **Viscose-carousel** |
| 作者 | Yousuf Soomro（`Yousuf-developer`） |
| 仓库 | https://github.com/Yousuf-developer/Viscose-carousel |
| 线上 | https://viscose-carousel.vercel.app |
| 读的是 | `main`，2026-08-15（仓库创建与最后一次 push 是同一天） |
| 作者的一句话 | "A wheel of work that never quite sets. Cards fuse as they meet, and draw into threads as they part." |

它的技术栈是 Next.js 16 + React 19 + GSAP + Tailwind v4 + 原生 GLSL。
**我们一个都没有引进来**（见 §2）。

## 1. 授权判定

**源码 MIT，署名保留即可；`public/` 里的东西一律不能碰。**

作者把边界写得很清楚（`LICENSE` 正文之后那一段，逐条）：

| 东西 | 授权 | 我们 |
|---|---|---|
| 源码（`components/`、`app/`、`shader`） | **MIT** © 2026 Yousuf Soomro | ✅ 可以移植、可以改、必须保留版权声明 |
| `public/*.webp`（18 张作品图） | **不是他的**。从 Behance 随手收集的，"我不主张任何权利，也不授权任何人再用" | ❌ 一张没拿 |
| `public/ppneuemontreal-book.otf` | Pangram Pangram 的**商业字体**，仓库里只为本地开发/评估捆绑，"不得商用" | ❌ 没拿 |
| `public/Satoshi-*.otf` | Indian Type Foundry 免费授权（Fontshare） | ❌ 没拿（我们有自己的字） |
| `public/Geist-Regular.ttf` | SIL OFL 1.1 | ❌ 没拿 |
| `planeShaders.js` 里的 simplex noise | Ashima Arts / Stefan Gustavson，**MIT**（第三方，作者转述了它的声明） | ❌ 没拿（见 §3 第 6 条，我们换了做法） |

**结论：机制和代码都可以借，条件是保留版权声明；素材一律不借。**
所以 `sdf.ts` / `field.ts` / `atlas.ts` 的文件头都写了出处，这一份文档就是那份"版权声明"的落点。
GitHub 把仓库的 license 字段识别成 `NOASSERTION`（因为 `LICENSE` 文件在 MIT 正文后面
附了那几段例外说明），**这不是"没有授权"** —— 正文逐字就是 MIT，例外只针对 `public/`。

> 和上一版（`dither-blur-carousel`，同一位作者）是同一套判断，同一条边界：
> 代码可以搬，`public/` 一个字节都不能搬。那一版的 vendor 目录已经随这次重做删掉。

### 为什么这次没有 `vendor/` 目录

上一版是**逐文件移植**（`gl/*.js` → `vendor/dither-carousel/*.ts`，GLSL 逐字未动），
所以需要一个 vendor 目录 + 一份 LICENSE 原文 + 每个文件头的出处。

这一次不一样：**上游是 GLSL + React，我们是 TSL + 原生 TS**，没有一行可以逐字搬过来 ——
搬的是数学和时序，落地的代码全是重写的。逐文件对照的关系不存在了，
一个"vendor"目录会谎称这里面的文件是上游的原样。所以出处集中写在这一份文档和三个文件头里。
**这不是少写一份授权，是把它写在唯一说得通的地方。**

## 2. 借了什么，没借什么

### 借了（机制，不是代码）

| 机制 | 上游在哪 | 我们在哪 |
|---|---|---|
| 整个环是**一个**全屏片元着色器里的 SDF，一个 draw call | `shaders/planeShaders.js` | `ring/sdf.ts` |
| `smin` 融合 —— "一个 `k` 决定整个世界有多稠" | 同上 | 同上 |
| 丝是**自己的形状**（扫成扁盒的 `sdBridge`），四个属性跟分离度走 | 同上 | 同上 |
| `dissolve`：把半径推到 0 **以下**，让丝走出抗锯齿范围 —— "断"和"闪没了"的分界 | 同上 | 同上 |
| 上下两条玻璃唇：直接在**同一个 p** 上做折射，没有第二个 pass | 同上 | 同上 |
| 光标是**一个力，不是一个指针**：局部软化、邻居让路、毛细尾波 | `Carousel.jsx` + shader | `ring/field.ts` + `sdf.ts` |
| 扇面入场：每张卡从前一张里剥出来，各代相位错开 | `Carousel.jsx` 的 `cum[]` / `travel[]` | `field.ts` 的同名数组 |
| 惯性 + 吸附：甩出去先不管，快停了才接管并指数收尾 | `Carousel.jsx` | `field.ts` 的 `spinStep()` |
| 按**环上的槽位**发图，不按卡片下标（不然每隔一张并排） | `Carousel.jsx` 的 `cellOf` | `field.ts` 的 `deal()` |
| 一张图集 + `flipY = false` | `ring/atlas.js` | `ring/atlas.ts` |
| 参数表的分组与命名 | `ring/params.js` | `tuning.ts` 的 `RING` |

### 没借

| 没借的 | 为什么 |
|---|---|
| Next.js / React / GSAP / Tailwind | 我们是纯 TS + `three/webgpu`。GSAP 那条时间线换成六行算术（`field.ts` 的 `advanceEntry`）；依赖纪律见 AGENTS.md |
| `lil-gui` 调试面板 | 同上。旋钮改完刷新即可，读数走 `RingField.debug()` |
| 它的字体与排版 | **这一条是硬要求**：排版一比一走我们自己的 `ui/type.css`（ZKMSerendipity + grotesk 回退、中英并置）。参考作品抄的是它的**运动与场**，不是它的字 |
| 光标上那枚玻璃标签（"View"） | 它在上游是画在同一个 pass 里的 —— 所以标签能反读身下的像素做逐像素反色。要复刻就得把我们的字做成字形图集，等于**放弃我们的字**。名字与 tagline 因此留在 DOM 层（`choose.ts` 的 HUD） |
| 环两侧那套会"融化"的 DOM 文字（双层模糊 + alpha 阈值） | 同上：它是为它自己的字排的。我们的名字用中英并置的静态排版 |
| simplex noise（Ashima/Gustavson，MIT） | 它在上游只用来做出生时那一秒、振幅 3px 的表面张力扰动。为这一秒搬一份第三方噪声进来不值得 —— 换成两条正弦的乘积，同样是无方向、随时间漂移的低频扰动 |
| `public/` 里的一切 | 见 §1 |

## 3. GLSL → TSL：逐条差异

数学一比一，写法不得不变的地方只有这些。**每一条都是被迫的，或者是被我们自己的约束要求的。**

1. **不 discard、不用 alpha 混合。** 上游 `discard` 掉空像素、输出带 alpha 的颜色，让页面透过去。
   我们直接在着色器里把 `uPage`（页面底色）合成进去，输出不透明 —— 这块画布**就是**这一页的背景。
   顺带绕开 WGSL 在 `discard` 之后求导数的那些不确定性。
2. **色散那三次采样不放在 `if` 里。** WGSL 要求纹理采样处在一致控制流中；用 uniform 做条件
   虽然合法却脆。改成无条件三次采样：`uFringe * bend` 为 0 时三次落在同一个纹素上，
   画面**逐像素等价**，只多两次命中缓存的取样。
3. **循环。** `for (int i = 0; i < MAX; i++)` → `Loop(MAX, ({ i }) => …)`，
   `break` / `continue` → `Break()` / `Continue()`。生成的 WGSL 和手写的一样
   （`renderer.debug.getShaderAsync()` 可以拉出来对着读 —— 排查那次"正面那张卡不见了"
   靠的就是它）。
4. **uniform 数组。** `uniform vec2 uPos[32]` → `uniformArray(pos, 'vec2')`。
   three 会把每个元素补齐到 `vec4`（和 GLSL ES 的 uniform 数组一样"每元素一行"），
   所以上游那条"把三样东西打包进一个 vec4，反正 zw 的钱已经付了"的理由在这边同样成立，
   `uScale` 照样是 `(sx, sy, dim, cell)`。
5. **变量。** 所有会被重新赋值的量都要 `.toVar()`，赋值是 `.assign()` / `.addAssign()`；
   `if/else if` 是 `If(...).ElseIf(...)`。函数用 `Fn(([a, b, k]) => …)`，
   **参数要显式标类型**（`@types/three` 的节点类型是有泛型的，标松了会一路塌成 `any` 的替身）。
6. **噪声**换成两条正弦的乘积（见 §2）。
7. **色彩管理反过来。** 上游刻意"读不解码、写不编码"（图集标 `NoColorSpace`，着色器不做输出编码），
   自己收口。我们走 three 的标准路线：图集标 `SRGBColorSpace`、在线性空间里算、渲染器负责编码。
   两条都自洽，混用才会得到一张发灰的图。
8. **不生成 mipmap**（上游生成）。相邻两个像素可能落在图集的不同格子上，那一步的导数会让
   自动 mip 选到最粗的一层，格子边界上出现一圈糊。单格已经缩到 512，没有 mip 也不会闪。

> ⚠️ **`texture.flipY = false` 是必须的**（`atlas.js:42` 写了，我们第一版漏了）。
> 默认的 `true` 会把整张图集上下翻过来：uv 的第 0 行取到画布**最后**一排格子，
> 于是所有卡片错位一整排，而第 0 张卡取到一格从来没画过的空白 ——
> 它照样被画出来、剪影和丝都在，**只是颜色恰好等于底色**。
> 症状是"正面那张卡不见了，别的都在"，查了很久。

## 4. 旋钮对照（`RING` ↔ 上游 `params.js`）

同名的直接对得上（`goo` / `thin` / `pinch` / `sag` / `dissolve` / `fillet` / `melt` /
`meltReach` / `reach` / `swell` / `pull` / `grab` / `release` / `web` / `webReach` /
`wave*` / `side*` / `glass` 那一组 / `stagger` / `launchTime` / `spreadTime` / `stageAt` /
`spinTurns` / `spinTime` / `moveTime` / `posX` / `scrollSpeed` / `damping` / `maxSpeed` /
`snapTime` / `snapFrom` / `pickTime` / `wobble` / `blend` / `radius` / `seed` / `refWidth` /
`narrowAt` / `tightAt` …）。**值也照抄**，除了下面四个 —— 每个都是被我们自己的内容逼出来的：

| 旋钮 | 上游 | 我们 | 为什么 |
|---|---|---|---|
| `ringRadius` | 340 | **500** | 丝只活在"两张卡的面分开多少"这段量程里：静止间距 = `2R·sin(π/N) − 卡片短边`。上游 18 个项目、3:2 的卡，这段有 ~0.64 张卡宽；我们 **29 个物种、2:1 的卡**，照抄 340 只剩 ~0.26 —— 丝会从"粗板"直接跳到"没有"，中间**越拉越细然后断掉**那一段根本没机会发生，而那正是签名。按 0.64 反解得 504，取 500 |
| `endScale` | 4.46 | **3.05** | 和 `posX = −2` 绑死：环心被推到左边整整一个视口宽，**放大后的半径必须约等于视口宽**，正面那张才落在屏幕中央。半径改了，这个数必须按同一个等式回来（500 × 3.05 ≈ 1525） |
| `narrowEndScale` | 4.22 | **2.90** | 同上，窄屏那一档 |
| `planeSize` | 90（3:2） | **96（2:1）** | 卡片比例由 `choose/cards.ts` 画出来的 anchor 图决定，不是旋钮 |

多出来的一个：`attractSpin`（0.045 rad/s）。上游没有"展签"这一段 —— 它在等图的时候
种子是完全静止的。我们的开屏是一块展签，背后那颗种子必须**活着**，所以它绕自己慢慢转，
并保留一点出生时的表面张力抖动（`field.ts` 的 `attractWeight`）。

`count` 那一个上游有、我们没有：卡片数由花名册决定（`docs/14`），不是调参。

## 5. 融合与拉丝，做到了几成

**融合：十成。** 同一个 `smin`、同一个 `k`、同一条"糖浆取最近那张卡边缘颜色"的规则。
剥离途中那一帧（几张卡还是一整团、颈粗细各不相同）和上游 `docs/entry.png` 是同一件事。

**拉丝：八成。** 四个属性（宽度衰减、颈、下垂、`dissolve` 过零）全在，
悬停时两张卡之间挂出细丝、跟着光标动、松手慢慢收回去，都成立。差的那两成是**我们内容的**，
不是实现的：

- 29 个物种排在一个环上，静止间距只有卡片长边的 0.6 倍（上游 18 个项目是 0.64，接近，
  但我们是靠把半径从 340 抬到 500 换来的 —— 环因此更大更平，一屏看到的卡更少）。
  再多几个物种就得再抬半径，或者接受更短的丝。
- anchor 图是**不透明**的棚拍渲染，背景接近白。首屏是白底，卡片和底色差不到 2% ——
  卡片没有剪影，**丝会跟着一起消失**（糖浆是最近那张卡边缘的颜色）。
  所以整张卡走了一道 multiply 压到 `#e2e0dc`（`cards.ts` 的 `CARD_STOCK`），
  等于把同一张图印在一张略带调子的纸上。上游的卡是满幅的彩色作品图，没有这个问题。

**没做的一件**：光标上那枚玻璃标签（见 §2）。它是上游"光标是一个力"的第三条表现
（软化、让路、**标签逐像素反色**），我们只做到前两条。理由是字，不是难度。

## 6. 升级上游时

`git clone https://github.com/Yousuf-developer/Viscose-carousel` 到 `scratch/`（别提交），
diff `components/shaders/planeShaders.js` 与 `components/ring/params.js`，
把改动**按 §3 的对照表手工搬**过来。别把仓库整个合进来 —— 那会把 `public/` 一起带进来，
而 `public/` 是这一份文档里唯一一条红线。
