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
- [ ] 部件真的解出来了（不是 191 件全回退占位几何）—— `npm run test -w @smu/app` 里那条
      meshopt 测试是门；现场再用 `?debug=1` 看一眼 HUD 的 loaded 数
- [ ] 无摄像头权限时自动进 demo 回放，不白屏
- [ ] WebGL2 回退路径实测过（Chrome 关掉 WebGPU flag）
- [ ] 慢回路默认关闭，或限流上限已硬编码
- [ ] `assets/raw/` 没有被打进去
- [ ] 隐私说明在页面上


## 7. 域名

作品的地址是 **`u-see.me`**。不是风格问题 —— `second-body.vercel.app`
**已经被别人占了**（它返回一个同名的 React Native Web 应用），我们的默认地址
是 `second-body-one.vercel.app`，那串东西印不进说明牌。

### 架构：Vercel 出内容，Cloudflare 出解析

两层各管一件事，分开的理由是**大陆**：Vercel 的 `cname.vercel-dns.com`
在国内解析不稳，而 Cloudflare 的权威 DNS 在大陆有可用的 anycast 出口。
所以**域名的 NS 指 Cloudflare，Cloudflare 的记录指 Vercel**。

```
u-see.me  ──NS──▶  Cloudflare（权威 DNS）
                      │
                      ├─ A    @    76.76.21.21           代理关闭（灰云）
                      └─ CNAME www cname.vercel-dns.com  代理关闭（灰云）
                                        │
                                        └──▶ Vercel 项目 second-body
```

**橙云必须关掉。** Cloudflare 的代理会终止 TLS，Vercel 就拿不到
`.well-known/acme-challenge` 的回源，证书永远签不出来 —— 站点会挂在
"Invalid Configuration"。要 CDN 的话那是 Cloudflare 自己的事，不能同时。

### Vercel 项目仍然叫 `second-body`，这是故意的

仓库改名成 `see-me-see-u` 之后，**Vercel 项目名没有跟着改**。

改它会断三样东西：项目名决定 `second-body-one.vercel.app`；
`useeme.ptoq.io` 是别人按项目挂上去的；而域名验证记录也绑在项目上。
GitHub 那边的集成按**仓库 ID** 关联，改仓库名它自己跟着走 ——
所以"改仓库名"和"改 Vercel 项目名"是两件不相干的事，
只有后者会弄断线上地址。

下面所有写着 `second-body` 的地方指的都是**那个 Vercel 项目**，不是仓库。

### Vercel 侧（已完成，2026-09-13）

两个域名都已挂到项目 `second-body` 上，且 `verified: true`
（这个域名不在别的 Vercel 账号下，所以**不需要 TXT 验证**）：

```bash
curl -X POST -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  https://api.vercel.com/v10/projects/second-body/domains \
  -d '{"name":"u-see.me"}'
```

要什么记录由 `/v6/domains/<name>/config` 说了算，别背：

| 名称 | 类型 | 值 | 代理 |
|---|---|---|---|
| `@` | A | `76.76.21.21` | 关 |
| `www` | CNAME | `cname.vercel-dns.com` | 关 |

### 线上地址（2026-09-13 起）

**https://useeme.ptoq.io** —— 由有 `ptoq.io` 权限的人在他们那边挂好的。
推 `main` 就会更新，不需要我们这边再做任何事。核过一次：它服务的就是 `f29cb27`。

`u-see.me` 是作品自己的域名，还没接上（下面那一步）。两个地址并存不冲突：
`ptoq.io` 那个是 p-to-q 的作品列表里的位置，`u-see.me` 是这件作品自己的门牌。

### 还没做的那一步：把 NS 从 Spaceship 换到 Cloudflare

实测 `u-see.me` 的 NS 仍是 `launch1.spaceship.net` / `launch2.spaceship.net`，
A 记录指着 `54.149.79.189` / `34.216.117.25`（Spaceship 的停放页）。
这一步**必须在浏览器里做**，本机没有 Cloudflare 凭证。

1. Cloudflare → Add a site → `u-see.me` → Free。它会分配一对
   `xxx.ns.cloudflare.com`。
2. Spaceship → 域名 → Nameservers → Custom → 填那一对，保存。
3. 回 Cloudflare，DNS 里按上表加两条，**代理一律灰云**；
   Spaceship 扫过来的停放 A 记录删掉。
4. SSL/TLS 模式选 **Full (strict)**。Flexible 会和 Vercel 的强制 HTTPS
   撞成重定向循环。

NS 生效通常十几分钟到两小时。生效后 Vercel 会自己签证书，核一句：

```bash
dig +short u-see.me NS && curl -sI https://u-see.me | head -1
```

---

## 部署地址的真实状态（2026-09-13 实测）

**`second-body.vercel.app` 不是我们的。** 它返回一个 React Native Web 应用，
标题也叫 "Second Body"。所以那个默认子域**已经被别人占了** ——
我们的部署会落在 `second-body-<hash>-<team>.vercel.app` 这种带哈希的地址上。

这把域名这件事从"风格一致"变成了**必需**。落点见 §7：`u-see.me`。

下面这张表是在**本机生产构建**（`npm run build` + `vite preview`）上验的 ——
写它的时候还核不到线上地址。后来核到了：生产是 `second-body-one.vercel.app`，
再后来是 `useeme.ptoq.io`（见 §7；`u-see.me` 还没接上）。表里的结论仍然成立，但**它验的是产物不是线上**，
这个区别在 P21 的意义上是真的区别，所以不改成"线上实测"。

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

