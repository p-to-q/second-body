# vendor/dither-carousel

开场选择页那条会抖动溶解的螺旋轮播。**不是我们写的** —— 移植自：

> **dither-blur-carousel** — https://github.com/Yousuf-developer/dither-blur-carousel
> © 2026 Yousuf Soomro，MIT License（原文在同目录 [`LICENSE`](./LICENSE)）
> 移植自 commit `c5bdbdf`（`main`，2026-08-06 "including entry animation"）

MIT 允许使用、修改、商用，**条件是保留版权声明** —— 所以 `LICENSE` 必须一直在这里，
每个移植过来的文件头也都写了出处。改这个目录的时候别把那些头注释删掉。

## ⚠️ 上游 `public/` 一个字节都没拿

作者在 `CREDITS.md` 与 `LICENSE` 末尾写得很清楚：`public/` 里的图片是从 Behance 收集的
**来源不明的占位素材**，不在 MIT 范围内，他自己也无权转授；字体 `Panchang-Medium.otf`
由 Indian Type Foundry 单独授权。

我们因此**一张图、一个字体文件都没有搬**：

- 卡片图 = `assets/refs/<id>/_anchor.png`，我们自己渲的（docs/12 §3），版权自有；
  没有 anchor 图的条目用程序化卡片（`src/choose/cards.ts`）。
- 字体 = 系统字体栈。

上游的 `IMAGES` / `PROJECTS` 两个占位数组在移植时**直接删掉了**，不是留着注释掉 ——
留着就迟早有人把它取消注释。

## 搬了什么

| 上游 | 这里 | 改动 |
|---|---|---|
| `gl/shaders/dither.js` | `shaders/dither.ts` | 只改扩展名与 import 路径，GLSL 逐字未动 |
| `gl/shaders/card.js` | `shaders/card.ts` | 同上 |
| `gl/shaders/composite.js` | `shaders/composite.ts` | 同上 |
| `gl/shaders/trail.js` | `shaders/trail.ts` | 同上 |
| `gl/color.js` | `color.ts` | 加类型注解 |
| `gl/scroll.js` | `scroll.ts` | 加类型注解；逻辑逐行未动 |
| `gl/cardbuffer.js` | `cardbuffer.ts` | 加类型注解 |
| `gl/post.js` | `post.ts` | 加类型注解 |
| `gl/trail.js` | `trail.ts` | 加类型注解 |
| `gl/config.js` | `config.ts` | 加类型；删掉 `IMAGES` / `PROJECTS`（见上）；旋钮注释保留 |
| `gl/scene.js` | `scene.ts` | **有实质改动，见下** |
| `gl/gui.js` | — | **没搬**（lil-gui 依赖） |
| `components/Carousel.jsx` | — | **没搬**，用 `src/choose/choose.ts` 的原生 TS 外壳替掉 |
| `app/`、`public/`、构建配置 | — | 没搬（Next.js 外壳 / 不可用素材） |

## `scene.ts` 相对上游的改动

1. **贴图由调用者给**。上游在 `scene.js` 里用 `TextureLoader` 加载 `IMAGES`，并为此有一套
   "等最后一张图到位再开场 / 5 秒超时兜底"的机制。我们的卡片是先在 2D canvas 上合成好的
   （anchor 图 + kind 角标），同步就绪，所以那套等待机制连同 `IMAGES` 一起去掉了；
   等图与超时挪到了 `src/choose/cards.ts`。
2. **不要 lil-gui**（docs/02 P6 依赖纪律）。`gui.js` 没搬，`config.ts` 成了改完刷新的常量；
   上游面板上的 `replay` 按钮变成 handle 上的 `replayEntry()`。
3. **随机数注入**。`shuffleEntryOrder()` 原本调 `Math.random()`；现在从 `options.random` 进来，
   全应用共用一个种子化的 `Rng`（AGENTS.md 不变量）。
4. **新增 `exit(index)`**：选中的卡片冲向镜头、整组溶回抖动（docs/12 §5.1 要求的
   "卡片冲向镜头 → 溶解"）。实现上是把上游的入场反过来跑，共用同一条 Bayer 前沿，
   外加一个相机推近。这是唯一一段我们自己写进 vendor 的效果代码。
5. **点击语义**：上游点任意卡片都是"把它转到中间"。我们保留这个，但**点已经在中间的那张
   等于确认**（`onPick`）。现场单击即确认太容易误触。
6. **帧循环不许抛异常**（docs/02 P2）：`tick()` 包了 try/catch，出事就自己停下并通过
   `onError` 交回上层 —— `choose.ts` 接到后切到 DOM 降级列表。
7. `window.__carousel` 调试钩子去掉了（上游用 `process.env.NODE_ENV` 判断，我们没有那个变量）；
   同样的对象从返回的 handle 的 `internals` 上拿。

## 没动的地方

`gl/` 的算法本身一行没改：螺旋几何、shingle 半径、运动弯曲、四层 streak 模糊链、
Bayer 有序抖动的三套调色板、光标拖尾的 ping-pong 缓冲、入场的 dither 前沿、
滚动的吸附弹簧与贝塞尔缓动 —— 全是上游的。默认旋钮值也原样保留，
作者那些解释"为什么是这个值"的注释一并留着，因为它们比值本身有用。

## 升级上游时

`git clone https://github.com/Yousuf-developer/dither-blur-carousel` 到 `scratch/`（别提交），
diff `gl/`，把改动手工搬过来。别把上游整个仓库合进来 —— 那会把 `public/` 一起带进来。
