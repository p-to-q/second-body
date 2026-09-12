# 11 · Tasks — 可分派任务卡

> 格式固定（见 `docs/02` P6）。一张卡 = 一个文件 + 一条验收命令。
> 领卡的人：先读 `AGENTS.md` 的读取路线，只读你这张卡点名的文档。
> 交卡时用 `AGENTS.md` 里的 5 字段停止块。**跑过才能说通过。**

图例：🔴 阻塞别人 · 🟡 并行 · ⚪ 可延后

---

## lane B · core 纯逻辑（无浏览器，node --test 秒级验证）

### 🔴 T-02 骨架构建 `mediapipeToWorld` + `buildSkeleton`
- 文件：`packages/core/src/skeleton.ts`（+ `test/skeleton.test.ts`）
- 读：`docs/04-SPEC` §1 §2（**只读这两节**）
- 契约：从 `types.ts` import `RawPose / Skeleton / Bone / BoneId / Vec3`，不要自己定义
- 做什么：
  1. `mediapipeToWorld(raw)` —— 唯一的坐标转换点：镜像 + Y/Z 翻转 + 落地平移（让最低的脚 y=0）
  2. `buildSkeleton(joints)` —— 按 §2 的表派生关节、组出 17 根骨头，填 `confidence`
  3. `height` = 头顶到最低脚的 y 差
- 不要做：滤波（T-03 已有）、骨长稳定（T-04）、任何 three.js
- 验收：`node --test "packages/core/test/skeleton.test.ts"` 且测试必须覆盖
  (a) 一副合成的 T-pose landmarks → 17 根骨头全部有限、长度 > 0
  (b) 镜像正确：输入左手抬起 → 输出 `handL` 在世界 +X 侧（**写死这条断言**）
  (c) 缺失/低 visibility 的 landmark 不产生 NaN
  (d) 落地：`min(footL.p1.y, footR.p1.y) ≈ 0`

### 🔴 T-04 骨长稳定化
- 文件：`packages/core/src/stabilize.ts`
- 读：`docs/04-SPEC` §3
- 做什么：`createStabilizer()` → `apply(sk, dt)`。每骨 90 帧 `rollingMedian`（用 `filter.ts` 里的），
  然后从 pelvis 出发按稳定长度做前向运动学重建；前 30 帧 `warmingUp = true` 直接透传
- 不要做：改变方向，只改长度
- 验收：喂 200 帧"方向不变、长度 ±15% 抖动"的合成骨架 → 输出骨长标准差 < 输入的 1/5，
  且关节位置仍在原方向上（夹角 < 1e-6）

### 🟡 T-06 运动特征
- 文件：`packages/core/src/motion.ts`
- 读：`docs/05-SPEC` §2
- 做什么：`createMotion()` → `update(sk, dt) → MotionFeatures`。全部除以 `sk.height` 归一化；
  所有 EMA 用 `emaAlpha(dt, τ)`；confidence < 0.4 的关节不参与统计
- 验收：静止输入 → `stillness > 0.9 && energy < 0.05`；大幅挥手 → `energy > 0.5`；
  同一段动作用 30fps 和 60fps 喂进去，`energy` 终值相差 < 10%（**帧率无关性，必测**）

### 🟡 T-08 genome 抽取
- 文件：`packages/core/src/genome.ts`
- 读：`docs/05-SPEC` §1
- 做什么：`makeGenome(seed, tier, index) → Genome`，按 §1 的算法。随机只能来自 `mulberry32(seed ^ tier*0x9E3779B9)`
- 验收：同参数调 100 次结果深度相等；空 index 也返回完整槽位（占位）；
  tier 升高时 `family` 不变

---

## lane A · runtime 浏览器

### 🔴 T-01 摄像头采集
- 文件：`packages/app/src/capture/webcam.ts`（+ `replay.ts`）
- 读：`docs/06-SPEC` §2
- 做什么：MediaPipe `PoseLandmarker`（GPU delegate，`runningMode: VIDEO`）+ `ImageSegmenter`；
  实现 `Capture` 接口；`latest()` 非阻塞、绝不抛异常；统计 `fps`
- 不要做：任何姿态处理（那是 core 的事）
- 验收：`/dev/capture.html` 打开能看到 33 个点叠在视频上 + 左上角 fps ≥ 30；
  拔掉摄像头权限时页面不白屏、`lastError` 有值。**附一张截图到 `scratch/evidence/`**
- 顺带解掉 `docs/09` 的 U1/U2：在页面上打印 pelvis/wrist 的 xyz，人前后走动记录 z 的变化范围，
  把结论写回 `docs/09` 并更新 `docs/04` §1 的轴向表

### 🔴 T-07 Creature：实例化渲染 + 挂载
- 文件：`packages/app/src/creature/creature.ts`
- 读：`docs/04-SPEC` §4、`docs/06-SPEC` §4；用 `core/attach.ts`，**不要重写挂载数学**
- 做什么：每种部件一个 `InstancedMesh`；每帧写 `attachMatrix` 的结果；关节盖片；
  `remorph` 的 crossfade（最多同时 3 个槽位）；`graft` 热插拔
- 不要做：自己算矩阵、自己做滤波
- 验收：`?debug=1&demo=1` 下 64 个实例稳定 60fps（`docs/02` P5 预算），
  切 `?tier=0..3` 外观明显不同；**录 10 秒屏到 `scratch/evidence/`**

### 🟡 T-09 Stage：灯光/地面/后期
- 文件：`packages/app/src/stage/stage.ts`
- 做什么：影棚三点光 + 软阴影 + 与虚拟地面对齐的接触阴影；轻 bloom / 微 DOF / AO；
  IDLE 时的呼吸粒子团
- 验收：静帧截图放进 `scratch/evidence/`，**不加说明也像作品**（这是主观验收，让第二个人看）

### ⚪ T-16 kiosk 与自恢复 + `?demo=1` 回放
- 文件：`packages/app/src/kiosk.ts`、`packages/app/public/demo/pose-*.json`
- 做什么：全屏、隐藏光标、无人 5 分钟降帧、WebGL context lost 自动重建、
  顶层 `safeFrame()`；录一段 60 秒 pose 数据存成 json
- 验收：连续跑 30 分钟不崩（留日志）；断网 + 遮住摄像头，`?demo=1` 仍能演示

### 🟡 T-17 慢回路
- 文件：**服务端已落地** `packages/factory/src/slow.ts` + `slow-http.ts` + `vite.config.ts` 的 `/__slow`
  （不是 `proxy.ts`：不另起进程，理由见 `docs/17 §1`）；**前端待做** `packages/app/src/slowloop/*`
- 读：`docs/17-SLOW-LOOP.md`（协议 + §8 前端接口）、`docs/06-SPEC` §5、`docs/07-HYPER3D-API.md` §4B
- 做什么：~~localhost 代理（key 留 Node 侧）~~ + 血统池 + 预算闸门 ✅；前端提交/轮询/热插拔；冷却与静默失败
- 验收：~~端到端跑通一次~~（`SLOW_FAKE=1` 下跑通，取证 `scratch/evidence/slow-loop-dev.log`）；
  **还欠**：真 Rodin 打一次并记录耗时（回填 `docs/09` U10）、**拔网线时快回路帧率不受影响**（要前端接上才能测）

---

## lane C · 资产

### 🟡 T-13 全量部件库复检
- 做什么：`/dev/parts.html` 逐个看 50 件：比例、朝向（红点必须在"靠近躯干"的一端）、风格一致性；
  朝向错的在 `recipes/catalog.ts` 里填 `flip`，风格崩的记下来重抽 seed
- 验收：更新 `docs/10-SURFACES.md` 里"全量 50 件部件库"那一行；附对照表截图

### ⚪ T-14 材质系统
- 文件：`packages/app/src/creature/materials.ts` + `assets/parts/parts.json` 的 `materials[]`
- 读：`docs/03-SPEC` §4
- 做什么：4–6 套 `MaterialDef`，按 tier 解锁；统一覆盖所有部件
- 验收：同一 seed 切不同材质组，截 4 张图对比

---

## lane E · 主题与网页

### 🔴 T-18 开场选择页（移植 dither-blur-carousel）
- 文件：`packages/app/src/choose/*` + `packages/app/src/vendor/dither-carousel/*`
- 读：`docs/12-SPEC-themes.md` §5（**只读这一节**）
- 做什么：
  1. 把上游 `gl/`（scene / post / trail / shaders / config）原样搬进 `vendor/dither-carousel/`，
     **连同 LICENSE 原文一起**（MIT，必须保留版权声明）
  2. 用 ~60 行原生 TS 替掉 React 的 `components/Carousel.jsx`
  3. 卡片图 = `/refs/<theme>/_anchor.png`（我们自己渲的）；`field` 用程序化卡片
  4. 选中 → 写 `?theme=<id>` → 进入身体；30 秒无操作自动随机；键盘 1–6 直选
- **不要做**：把上游 `public/` 里的任何图片或字体搬进来（不在 MIT 范围内，作者明确说了不得复用）
- 不要做：把 `gsap` 加进依赖，除非先试过自己写缓动（P6）
- 验收：六张卡片能滚、能选、能进；`?theme=xeno` 直接跳过选择页；
  **录 10 秒屏到 `scratch/evidence/`**；`npm run check` 通过

### ⚪ T-19 Web 部署
- 文件：`vercel.json`、`api/slow/*.ts`、`docs/13-DEPLOY.md` 的检查单
- 读：`docs/13-DEPLOY.md`
- 做什么：Vercel 静态部署 + 慢回路 serverless 版（协议同 `docs/06` §5）+ 懒加载分包
- 不要做：把 key 放进任何前端可见的地方；不做用户账号；不存视频
- 验收：走完 `docs/13` §6 的上线检查单，逐条附证据

---

## 交卡前自查

- [ ] `npm run check` 通过（或写明哪一步 `Not run` + 理由）
- [ ] 没有碰冻结契约（`docs/03` / `docs/04` / `types.ts`）
- [ ] 没有新增依赖（或在报告里申请了）
- [ ] 更新了 `docs/10-SURFACES.md` 里对应那一行
- [ ] 证据在 `scratch/evidence/`
