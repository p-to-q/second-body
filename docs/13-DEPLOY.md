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
  parts/*.glb  parts.json   ~5.5 MB（50→100 件后约 11 MB）
  refs/*/_anchor.png        轮播卡片图，~1.5 MB
```

`publicDir` 指向仓库的 `assets/`，所以部件和参考图会被原样拷进 `dist`。

> **2026-09-12 实测**：第一次真跑 `npm run build`，产物是 **975 MB** ——
> `publicDir` 指向 `assets/`，把 `assets/raw/`（929 MB）整个打进去了。
> 本文档 §2 早就写了"raw 绝不进 dist"，但没人验证过。
> 现在由 `vite.config.ts` 的 `shipAssets()` 只复制 `parts / refs / demo`。
> **规格写了不等于做到了。** 产物现在 45 MB，首屏 1.9 MB。

### 体积预算
- 首屏只需要：`parts.json` + 被选主题的 tier≤1 部件 + 6 张卡片图 → **目标 < 3 MB**。
- 其余部件**懒加载**：选完主题再拉该主题的，tier 升级时再拉更复杂的。
- `assets/raw/` 绝不进 dist（.gitignore 已排除）。

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
- [ ] 无摄像头权限时自动进 demo 回放，不白屏
- [ ] WebGL2 回退路径实测过（Chrome 关掉 WebGPU flag）
- [ ] 慢回路默认关闭，或限流上限已硬编码
- [ ] `assets/raw/` 没有被打进去
- [ ] 隐私说明在页面上
