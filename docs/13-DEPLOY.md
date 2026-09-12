# 13 · Web 部署

> 两个形态共用一套代码：**现场装置**（本机、全屏、有摄像头）和 **公开网页**（任何人打开）。
> 差别只在配置，不在代码路径。

## 1. 两个形态

| | 现场装置 | 公开网页 |
|---|---|---|
| 入口 | `npm run dev` / 本机 build，kiosk 全屏 | `https://<project>.vercel.app` |
| 摄像头 | 固定机位、可控灯光 | 用户自己的摄像头，环境不可控 |
| 慢回路 | localhost 代理（`packages/factory`） | Serverless function |
| 主题 | 轮播选择 or `?theme=` 锁定 | 轮播选择 |
| 兜底 | `?demo=1` 回放 | 无摄像头权限 → 自动进 `?demo=1` |

**网页版的第一原则：不要求授权也能看见东西。** 打开先播 demo 回放，
页面上一个"用我的摄像头"按钮，点了才请求权限。直接弹权限会流失绝大多数人。

## 2. 构建产物

```
packages/app/dist/          静态站点（vite build）
  index.html
  assets/…                  js/css
  parts/*.glb  parts.json   191 件，5.7 MB（meshopt 压缩后，平均 28 KB/件）
  refs/*/_anchor.png        轮播卡片图，21 张 1.3 MB（768² / 256 色）
```

`publicDir` 指向仓库的 `assets/`，所以部件和参考图会被原样拷进 `dist`。

> **2026-09-12 实测**：第一次真跑 `npm run build`，产物是 **975 MB** ——
> `publicDir` 指向 `assets/`，把 `assets/raw/`（929 MB）整个打进去了。
> 本文档 §2 早就写了"raw 绝不进 dist"，但没人验证过。
> 现在由 `vite.config.ts` 的 `shipAssets()` 只复制 `parts / refs / demo`。
> **规格写了不等于做到了。** 产物当时降到 45 MB（后来压到 20 MB，见下面的体积预算）。

### 体积预算

| | 目标 | 2026-09-12 实测 |
|---|---|---|
| 产物总量 | — | **38 MB → 20 MB** |
| 到「第一具身体出现」的字节 | < 3 MB | **8.58 MB → 3.14 MB** |
| 同上的请求数 | — | 36 → 36 |
| 单个部件 glb | ≤ 1.5 MB | 平均 130 KB → **28 KB** |
| 21 张 anchor 图合计 | < 1.5 MB | 6.12 MB → **1.27 MB** |

- 首屏只需要：`parts.json` + 被选主题的 tier≤1 部件 + 卡片图 → **目标 < 3 MB**。
- 其余部件**懒加载**：选完主题再拉该主题的，tier 升级时再拉更复杂的。
- `assets/raw/` 绝不进 dist（.gitignore 已排除）。

> **2026-09-12 实测二**：「首屏 1.9 MB」这个数字只数了 `index + JS + parts.json`。
> 真按「观众打开页面到第一具身体出现」量，是 **9.4 MB / 46 个请求** ——
> 因为 `src/choose/choose.ts` 在出卡片**之前**要把**所有** 21 张 anchor 图拉齐（6.1 MB），
> 那比部件本身还重，而且以前没人把它算进首屏。
> **没有基线就没有优化，而基线要按观众的那条路径量，不是按目录量。**

三件事把它压下来（每件都能单独重跑，都是幂等的）：

1. **部件 meshopt 压缩** —— `npm run factory:compress`（出口逻辑在
   `packages/factory/src/normalize.ts` 的 `writePart()`，`normalize` 也走它）。
   191 件 **19.4 MB → 5.4 MB（3.6×）**，顶点最大偏移 5.8e-5 m，`check:parts` 仍然 0 错。
   **代价**：运行时 `GLTFLoader` 必须挂 `MeshoptDecoder`（`src/assets/library.ts` 已挂）。
   忘了挂不会报错，只会 191 件全部回退占位几何 —— 由
   `packages/app/test/library-meshopt.test.ts` 守着。
2. **anchor 图瘦身** —— `npm run factory:refs`：1024² 真彩 → 768² / 256 色调色板，
   **6.12 MB → 1.27 MB（−79%）**。URL 仍是 `_anchor.png`（`choose.ts` 里写死的），
   容器不变，只降分辨率和色深；卡片是 1024×512 的 cover 裁切，而轮播本身就在抖动，
   看不出差别（对比图见提交说明）。
3. **tier 分档预取** —— `library.preload()` 只 await tier ≤ 1 的件，tier ≥ 2 进后台队列；
   选择页展示期间预取轮播最前面几个主题的 tier ≤ 1 件；某家族 tier T 被预取时顺手
   预热 T+1。策略全在 `src/assets/library.ts` 里，见该文件的 §预取策略。

### 持久缓存：**暂时不做**

评估过 Cache Storage + 版本键（`parts.json` 里有现成的 `generatedAt`，
`version` 是写死的 1，真要用得改成每次生成递增）。结论是**现在不值得**：

- 压缩之后**整个部件库只有 5.4 MB**，单个主题的 tier≤1 那一档是 0.23 MB。
  省下来的那点字节买不回一层缓存的复杂度。
- `max-age=86400` 已经覆盖了真正的重复访问场景：现场装置是同一台机器跑一整天，
  24 小时内二次加载根本不发请求；公开网页的访客绝大多数是一次性的。
- 代价是新增一个**独立于 HTTP 缓存的真相来源**，而它失效时的症状正是
  `immutable` 被禁掉的那个症状：部件重生成后旧访客永远看见旧几何。
- 什么时候回头做：部件总量超过 ~30 MB，或者现场需要**离线**跑。
  那时再做，并且用 `generatedAt` 当 cache name，不要用 `version`。

## 3. Vercel

```
配置已经落在仓库根的 `vercel.json` 里（buildCommand / outputDirectory / 缓存头），
不需要在面板上手填。Node 版本必须是 **22.x** —— 我们靠 type stripping 直接跑 `.ts`。

缓存策略（依据见 `docs/20` 调研）：
- `/assets/*`（vite 产出、文件名带 hash）→ `max-age=31536000, immutable`
- `/parts/*.glb`、`/refs/*`（**文件名不带 hash**，重生成后同名）→ `max-age=86400`，
  **不能用 `immutable`** —— 那会让重生成的部件在旧访客那里永远不更新
- `/parts/parts.json`（索引，必须新）→ `max-age=0, must-revalidate`
```

### 慢回路的 serverless 版本

`api/slow/submit.ts`、`api/slow/status.ts`、`api/slow/part.ts`，
协议与本地代理完全一致（`docs/06-SPEC` §5），换的只是宿主。

- `RODIN_API_KEY` 放 Vercel 环境变量，**只在 function 里读**（P8）。
- 公开网页上慢回路必须**限流**：每 IP 每小时 1 次 + 全局每日上限，
  否则一次分享就能把 credits 烧光。在 function 里硬编码上限，不要只靠前端冷却。
- 生成结果存 Vercel Blob（或任何对象存储），function 返回签名 URL。
- **默认关闭**：公开版用 `SLOW_LOOP_ENABLED` 环境变量控制，现场演示前再打开。

## 4. 浏览器兼容

- WebGPU：Chrome / Edge / Firefox 桌面、Safari 26+（含 iOS）、Android 12+ Chrome。
  three.js 的 `WebGPURenderer` 在不支持时自动回退 WebGL2 backend —— **必须真的测过回退路径**（P3）。
- MediaPipe：`@mediapipe/tasks-vision` 需要 WASM + 摄像头；iOS Safari 要用户手势才能开摄像头。
- 移动端：竖屏 + 前置摄像头其实很适合这件作品（全身入镜要退后一点）。
  移动端默认降到 tier ≤ 2、实例上限 32。

## 5. 隐私（网页版必须写在页面上）

- 视频**不离开浏览器**：姿态推理全在本地 WASM/GPU 里跑。
- 唯一会上传的是慢回路那**一张剪影 mask**，而且是用户主动触发的；
  不上传原始画面、不保存、不关联身份。
- 页面上要有一行说明 + 一个"不参与"开关。这不是合规姿态，是作品的一部分：
  一件关于身体的作品，对身体数据的态度就是它的态度。

## 6. 上线检查单

- [ ] `npm run check` 通过
- [ ] `dist` 首屏 < 3 MB（`du -sh` + network 面板确认）
- [ ] 部件真的解出来了（不是 191 件全回退占位几何）—— `npm run test -w @sb/app` 里那条
      meshopt 测试是门；现场再用 `?debug=1` 看一眼 HUD 的 loaded 数
- [ ] 无摄像头权限时自动进 demo 回放，不白屏
- [ ] WebGL2 回退路径实测过（Chrome 关掉 WebGPU flag）
- [ ] 慢回路默认关闭，或限流上限已硬编码
- [ ] `assets/raw/` 没有被打进去
- [ ] 隐私说明在页面上


## 部署地址的真实状态（2026-09-13 实测）

**`second-body.vercel.app` 不是我们的。** 它返回一个 React Native Web 应用，
标题也叫 "Second Body"。所以那个默认子域**已经被别人占了** ——
我们的部署会落在 `second-body-<hash>-<team>.vercel.app` 这种带哈希的地址上。

这把域名这件事从"风格一致"变成了**必需**：
`second-body.ptoq.io`（`scripts/set-domain.sh`，需要项目负责人的 `VERCEL_TOKEN`）。
在那之前，线上地址是不可记、不可念、也不适合印在说明牌上的。

**我核不到我们自己的部署地址** —— 本机 `~/.vercel` 的两个凭据文件都是 0 字节，
而这个会话跑不了 OAuth。所以下面这些是在**本机生产构建**（`npm run build` + `vite preview`）上验的：

| 检查 | 结果 |
|---|---|
| `RODIN_API_KEY` 出现在 dist 里 | **没有**（逐字符串 grep 过） |
| `/__slow/*` 在生产下可达 | **404**，正确（`apply:'serve'` 的中间件不进产物） |
| `/__anchor` `/__curate` 返回 200 | 那是 **vite preview 的 SPA 兜底**，不是真端点。Vercel 上没有对应 rewrite，会是 404 |
| `/`、`/about`、`/making.html`、`/passport.html` | 全部 200 |
| dist 体积 | 23 MB |

**`/making` `/passport` 这种不带扩展名的地址只在 Vercel 上成立**（`cleanUrls: true`），
本机 `vite preview` 不支持 —— 本机测要带 `.html`。这不是 bug，但每次都会让人愣一下，
所以记在这里。
