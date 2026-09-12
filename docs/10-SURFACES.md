# 10 · Surfaces — 什么真的跑通了

> 这张表是项目状态的**唯一可信来源**。文档写了不等于跑通了。
> 状态只有五档：`stable`（跑通且有证据）/ `experimental`（能跑但没稳）/
> `stub`（只有占位/签名）/ `spec-only`（只有文档）/ `archived`。
>
> 规则：**动完代码就更新这张表。** 证据一栏必须是"跑过的命令"或"截图路径"，不能是"应该可以"。

最后更新：2026-09-13（声音四层落地后）
最后更新：2026-09-13（T-17 慢回路服务端落地后）
最后更新：2026-09-13（A 档新拓扑 `radial` / `column` 落地、六个条目重新分配之后）
最后更新：2026-09-12（T-16 kiosk 加固 + 录制页落地后）
最后更新：2026-09-12（T-09 Stage 落地后）

## 资产流水线

| 表面 | 状态 | 证据 |
|---|---|---|
| Rodin 客户端（提交/轮询/下载/错误码/429/并发闸门） | `stable` | `npm run factory:generate -- --pilot`：6/6 成功，21–47s/件 |
| 幂等台账 `ledger.json` | `stable` | 第二次 `--dry-run` 报 "需要生成 0 个" |
| 预算闸门（单次 ≤40 credits、余额检查） | `stable` | 代码路径已走通；超额分支 `Not run` |
| 规范化（主轴 +Y / socketA 原点 / 长度 1 / 去贴图 / 单 mesh） | `stable` | `npm run factory:normalize`：6/6 无 warning；2.3MB → ~110KB |
| 长轴朝向自动判定（粗端朝下） | `experimental` | 186 件复检：9 个槽位方向一致（少数反例都是 lo≈hi 的 near-symmetric 件，无所谓）。**`foot` 是 12:12 对半分**，槽位级 `flip` 布尔值无论取 true/false 都只能对一半 —— 需要逐件 flip 或给 foot 反转启发式，**不花 credits**（T-13） |
| 容差焊接 + 逐级减面兜底 | `stable` | 对 Rodin 返回的 1.5M 面未焊接网格：1,515,338 → 4,884 tris，文件 66 MB → 148 KB |
| 部件契约检查 `npm run check:parts` | `stable` | 186 件 0 错 1 警告；唯一的警告是「10 件已 reject 但仍在 parts.json」—— 按 docs/14 §5 是故意的（genome 排除、文件保留）。捕获过一次"prune 没跑导致 66 MB"的真实回归 |
| **部件档案 `/dev/parts.html`**（目录 kind→条目→槽位 · 每条目一栏 · 按槽位分组列件） | `stable` | 接触表升级成可以直接给人看的档案。23 条目 / 191 件全部列出，anchor 图缺失时整列不占位（不出破图），缩略图 IntersectionObserver 懒渲（一个共享 renderer，渲完拷进 2D canvas）、无 WebGL 或单件加载失败退到**比例剪影**。策展绿框红框与"点一下循环 未评→keep→reject"原样保留；`POST /__curate` 探针（无 id 的 POST，中间件在时回 400）决定可评级还是**只读**——生产构建下页头如实写「只读」，格子不可点、不发失败请求。截图 `scratch/evidence/ui-parts-archive.png`（dev，可评级）、`ui-parts-archive-readonly.png`（`vite preview` 打的 dist，只读）、改前改后对照 `ui-before-after-parts.png` |
| **页面目录 `/dev/index.html`** | `stable` | 列出全部可见页面，每条一句"它能回答什么问题"，分 作品 / 档案 / 工作台 三组。截图 `scratch/evidence/ui-index.png` |
| **`/dev/*.html` 真的进 dist** | `stable` | 以前 vite 只把根 `index.html` 当入口，`/dev/*` **从来没进过产物** —— 本机好好的，部署上去全 404。现在 `build.rollupOptions.input` 扫 `dev/` 自动收全部 html（新增一页不用改配置）。`npm run build` 后 `dist/dev/` 有 10 个 html，`vite preview` 上 `/dev/parts.html` 实打开 |
| 素材策展 `curation.json` / `factory:curate` | `stable` | 第一遍人工过筛：10 件 reject（digitigrade 全 6 件多物体、wheelleg/autonomous 的 spine、head.softwear.a、joint.patrol.a），0 件 keep —— keep 是审美判断，留给项目负责人 |
| 装配预览 `/dev/figure.html`（合成 A-pose × 运行时 PartLibrary/Creature） | `stable` | 已改为驱动真正的运行时模块；`?theme=&seed=&tier=&plan=&pose=&angle=&still=&debug=1`，porcelain/industrial/coral 截图见 `scratch/evidence/creature-*.png`；它抓到了「头被颈骨压扁」这个真 bug。新增 `?pose=apose\|raise\|crouch\|open`（换一副合成姿态，用来证明因果还在）、`?angle=`（冻结转台，取证图之间才能比较）、`?still=N`（headless 必须，否则 rAF 吊住 `--virtual-time-budget`）|
| **形体并排 `/dev/lineup.html`** | `stable` | 把若干条目同时摆一排，各用各自的 `bodyPlan`，验证 `docs/PRD.md §5` 第 3 条。摆位靠**平移骨架本身**，所以两种渲染器都管用。`?ids=&pose=&tier=&seed=&still=`。截图 `scratch/evidence/lineup-six.png`（orb·furball·manipulator·screenface·xeno·autonomous 六具剪影互不相同）|
| 主题 anchor 渲染 `/dev/anchor.html` | `stable` | 21 个条目的 `_anchor.png` 全部生成，截图 `scratch/evidence/anchors-2026-09-12.png`；`guest.founder` 无 `look` 故无几何、渲染失败是预期 |
| image-to-3D（以 anchor 图为参考） | `stable` | 14 个 light 条目 × 5 件跑完：70/70 成功 0 失败，35 credits。**已知偏差**：bbox 细长的槽位（upperArm/foreArm/shin/thigh）成形好；bbox 近立方的 `joint` / `foot` / 部分 `head` 会把躯干 anchor 的轮廓照抄成"小躯干"—— 需要改 prompt/bbox，花 credits，留给人决定 |
| 186 件部件库（5 个 full × 20 + 16 个 light × 6） | `stable` | `factory:plan` 全部 done；`check:parts` 186 件 0 错。`wheelleg` / `autonomous` 只有 anchor 一件：它们的 `spine.<id>.a` 生成坏了，phase 2 已主动跳过，没烧那 5 credits |

## Core（纯逻辑）

| 表面 | 状态 | 证据 |
|---|---|---|
| `types.ts` 冻结契约 | `stable` | 被 core / factory / app 三处共同引用 |
| `attach.ts` 挂载数学（stretch / uniform 双模式） | `stable` | 9 个测试，含 1000 次随机不变式 + 4 种退化输入 + 两种模式 |
| `filter.ts`（OneEuro / emaAlpha / rollingMedian） | `stable` | 4 个测试，含帧率无关性与抗离群值 |
| `presence.ts` 生命周期状态机 | `stable` | 3 个测试，含"离开途中回来不清零" |
| `evolution.ts` 演化 | `stable` | 3 个测试，含阈值抖动与首次升档时机 |
| `rng.ts` / `vec.ts` | `stable` | 被上述测试间接覆盖 |
| `slots.ts`（BoneId→Slot、SLOT_WIDTH） | `stable` | 纯表；已被 `app/src/creature/assemble.ts` 实际消费 |
| `genome.ts` 抽取 | `stable` | 同 seed 两次刷新 genome 深度相等（`/dev/figure.html?seed=1234` 实测）|
| `skeleton.ts` / `stabilize.ts` / `motion.ts` | `spec-only` | 见 `docs/11-TASKS.md` T-02/T-04/T-06 |

## Runtime（浏览器）

| 表面 | 状态 | 证据 |
|---|---|---|
| Vite + `three/webgpu` 渲染栈 | `stable` | `/dev/parts.html` 在 WebGPU 下正常出图 |
| **主程序 `src/main.ts`（整条链收口）** | `experimental` | `/?demo=1&debug=1&theme=patrol&seed=99&tier=2` 装出整具真部件身体：**120fps · CPU 0.8ms · 30 实例 · 89k 三角 · 13 draw · 推理 30Hz**，全部在 `BUDGET` 内（`scratch/evidence/main-chain-patrol.png`）。tier 0 时如设计般是素几何（`main-chain-tier0.png`）。**只在回放数据上跑过，没接过真人** |
| **玩法扩展点 `src/acts/`（Act / Director）** | `experimental` | `/?demo=1&debug=1&act=echo` → HUD 显示 `act echo 回声: 延迟 1.2s`，120fps / CPU 0.5ms。出错隔离（连续 3 次抛异常自动禁用并回落 follow）的分支 `Not run` |
| `src/stage/stage.ts` 舞台（等身相机 / 三点光 / 影子 / 背景布 / 空场粒子 / 升档脉冲） | `experimental` | `/dev/stage.html`：4 个条目 + 空场 + 后期开关 + 脉冲 + 身体方案对照共 11 张取证图 `scratch/evidence/stage-*.png`，30 实例 / 87k 三角 / 14–17 draw（随 genome 变），都在 `BUDGET` 内；后期本身不进 creature 的 draw 统计。**只在合成 A-pose 上跑过，没接过真人、没接进 main.ts** |
| `src/stage/framing.ts` 按身体包围盒取景（人形严格等身，非人形有限插值） | `stable` | `test/framing.test.ts` 6 条：`PLAN_BOUNDS` 每次跑都和 `remapSkeleton` 的实测值比对；人形画面高度仍是 2.45m；四足/stub/towering/inverted 都不出画。截图 `stage-plan-a-rig.png` / `stage-plan-b-quadruped.png`（同一套灯光，两种身体方案） |
| `src/stage/look.ts` 每个条目一套灯光/后期（`palette` + `axes` 推导，无 23 个 if） | `stable` | `test/look.test.ts` 11 条：六个主题的冷暖次序、23 个条目无 NaN / 不纯黑 / 地面远端 == 背景 |
| `src/stage/post.ts` 轻 bloom / 微 DOF / GTAO / 暗角 / 颗粒（three addons，无新依赖） | `experimental` | `stage-post-on.png` vs `stage-post-off.png`（同 seed 同条目）。**踩过的坑**：scene pass 继承渲染器 MSAA 会让 GTAO 的 `textureGather` 无重载、整条 AO 管线静默失效 → 改 `samples:0` + 末尾 FXAA。建链失败会退回直出，那条降级路径 `Not run` |
| `src/stage/particles.ts` 空场呼吸粒子（相位由累计时间驱动，无循环） | `experimental` | `stage-idle-attract.png`：IDLE 不黑屏。**连续数小时不露循环**只是设计如此（uTime 单调累加），`Not run` |
| 升档视觉事件 `stage.pulse(tier)`（600ms / 全身 +8% / 0.15s 内 dt×0.4） | `experimental` | `stage-pulse-before.png` vs `stage-pulse-peak.png`：HUD 现场读数 **全身 +7.1%**（截图那一刻的包络值，峰值 +7.6%），被照亮像素的线性亮度实测 +6.4%；`timeScale` 轨迹 0.40 → 0.47 → 0.67 → 0.87 → 1（0.15s 恢复）。**没接进 main.ts**：停滞要生效，收口时要把 `stage.timeScale` 乘进 creature/act 的 dt |
| `src/assets/library.ts` PartLibrary（parts.json + glb + 程序化占位） | `stable` | 把 `parts.json` 改名 → 页面照跑，30 个占位实例（`creature-fallback-no-partsjson.png`）；单个 glb 改名 → 只有那一个槽位退回占位，16/17 正常（`creature-one-glb-missing-head-fallback.png`）|
| `src/creature/assemble.ts` 纯装配（挂载 + 关节盖片） | `stable` | 30 个实例的 `M·(0,0,0)` 与 `bone.p0` 误差 0；stretch 槽位 `M·(0,1,0)` 与 `p1` 误差 0 |
| **A 档新拓扑 `radial`（无躯干）/ `column`（单柱）** | `stable` | 纯函数，`packages/core/src/bodyplan.ts`。`radial`：四条肢摊成四条绕核心的轨道弧，弦长 = 骨长（部件不被拉伸），半径 = 末端离中心的距离、高度 = 末端相对中心的高度、朝向 = 肩轴；核心压到 0.40。`column`：六块腿骨首尾串成一根桅杆，双臂是顶端分支，蹲下按之字折叠（只改方向不改长度）。`test/bodyplan.test.ts` 新增 10 条，覆盖"真的没有躯干/没有腿"与三条因果（抬手 / 蹲下 / 张开），共 110 条全绿。取证 `scratch/evidence/plan-radial-*.png`、`plan-column-*.png`。**只在合成骨架上跑过，没接过真人** |
| `inverted` 的落地基准修正 | `stable` | 原来按"最低的脚"贴地，而倒过来之后脚在最上面 → 头被按到地板以下。改成 `PLANS_WITHOUT_FEET`（`radial` / `inverted`）按**整体最低点**贴地，且出口的比例遍沿用同一基准。这是 `xeno` 换成 `inverted` 时抓到的 |
| 六个条目重新分配身体方案 | `stable` | orb/furball→`radial`，manipulator/screenface→`column`，autonomous→`quadruped`，xeno→`inverted`，char.paper→`towering`（`towering` 与 `inverted` 从此不再是零使用）。改的是 `roster.ts` 的 `BODY_PLAN`，跑 `factory:index` 只重写 `parts.json` 的 themes；**191 件 parts 数组逐字节未变**（改前后 JSON 比对），`check:parts` 191 件 0 错 |
| `src/creature/body.ts` `BodyInstance` 接口（身体方案的插拔点，docs/18 §3） | `stable` | 纯提取，`creature.ts` 一行没动。编译期断言 `Creature extends BodyInstance` 在 `npm run typecheck` 里（把 `pose` 签名改坏会立刻红）；`mass.ts` 是第二个实现 |
| **`src/creature/mass.ts` 团块身体（B 档 · MarchingCubes metaball）** | `experimental` | `/dev/mass.html` 实测（M4 / Chrome WebGPU，合成 A-pose 17 骨 = **87 球**，`pose()` 连续 200 次）：**res40 = 1.85ms avg / 3.4ms p95 · 2,484 三角 · 1 draw call**。res 阶梯 16/24/32/40/48/64 → 0.27 / 0.61 / 0.89 / 1.85 / 3.97 / 9.64ms，三角 594 / 1152 / 1740 / 2484 / 3340 / 5928，**全部 1 draw**。大动作姿势（92 球）res40 = 2.98ms avg / 6.6ms p95。降级旋钮（`setRes`）实测有效。**CPU 比刚体贵、GPU 比刚体便宜**：同一副骨架下刚体版 `pose()` 0.17ms / 87,844 三角 / 17 draw，团块 1.85ms / 2,484 三角 / 1 draw。截图 `scratch/evidence/mass-still-res40.png`、`mass-big-res40.png`、`mass-lowres-res16.png`、`mass-highres-res64.png`。**只在合成骨架上跑过，没接过真骨架，也还没有任何条目真的用它**（见下） |
| 团块 vs 刚体并排对照 | `stable` | `scratch/evidence/mass-vs-rig-compare.png`（`/dev/mass.html?mode=compare&pose=big`）：团块是一具连续的身体，刚体版在同一姿势下读作一堆悬空零件。这张图是「像不像原作那种流过身体的物质」的判断依据 |
| `/dev/mass.html` 团块调试页（合成 A-pose ↔ 大动作 · HUD · 方向键调 res · 三模式） | `stable` | 上述全部数字与截图都出自它。`?mode=mass\|rig\|compare&pose=a\|big\|anim&res=&angle=&still=`；`?still=N` 是 headless 取证用（永不停的 rAF 会把 `--virtual-time-budget` 吊住） |
| 团块的降级路径（`presence` 进出场 / 退化骨架 / 出界） | `experimental` | 浏览器控制台逐条跑过，**全部不 throw**：IDLE 与 LEAVING t=1 → 0 三角 0 draw 且隐藏；ENTERING 0→0.5→1 → 0 / 964 / 2,274 三角（物质向质心收回去）；`null` 骨架、空 bones、全 NaN 关节、confidence=0、height=0、length=0、身体被挪到盒外 50m、`dt=NaN`、`dt=10s` 逐个跑过均正常返回，且 15 帧内恢复正常出图 |
| `src/creature/creature.ts` 实例化渲染 / remorph / graft | `experimental` | 30 实例 · 87k 三角 · 17 draw · `pose()` 0.06–0.21ms；换装最多 3 活并排队（18 槽位 438 帧 = 7.3s 排空）；`graft()` 热插拔 73 帧完成。**只在合成 A-pose 上跑过，没接过真骨架** |
| 摄像头采集 / MediaPipe（`src/capture/webcam.ts`） | `experimental` | 整条路跑通但**没见过真人**：headless Chrome + `--use-fake-device-for-media-stream` 下 GPU delegate 起来、wasm 与两个模型加载、mask 产出、`latest()` 不抛也不阻塞（`scratch/evidence/capture-webcam-fakecam.png`）；权限被拒时不白屏且 `lastError=NotAllowedError`（`capture-permission-denied.png`）。**fps ≥ 30 未验证**（headless 软件渲染只有个位数），U1/U2 未实测 |
| **`/dev/accuracy.html` 精度基准台** | `experimental` | 三路并排跑同一份输入（A 原始 / B 现有=`main.ts` 今天的 / C 新=分组 One-Euro+遮挡补全+质量兜底+最小折叠角），逐关节 visibility/世界坐标/1 秒抖动 σ、逐骨长变异 σ/μ、相对 A 的跟随偏差，外加常驻的**"无法测量"清单**。「⇪ 载入片段」直接读 `/demo/` 离线重跑（不走 rAF —— 页面不可见时 rAF 被掐到 1Hz，实时数字会全是 0，那不是"很稳"是没有数据）。合成片段上的实测数字与读法见 `docs/24 §5`。**它证明的第一件事是"现有输入测不了精度"**：合成片段 z 恒为 0、无噪声、左前臂长度变异 65.7%（人体做不到）|
| **`packages/core/src/refine.ts` 姿态精修** | `experimental` | 分组 One-Euro（基线 = MediaPipe 自己的 world 档 `0.1/40/1.0`）+ visibility 低通 + 遮挡时序补全（20 帧缺口上限，超时放手把 visibility 归零）+ 质量兜底（score 低时压低截止频率）+ `clampFold()` 最小折叠角。9 条单测随 `npm run check` 跑（降噪、遮挡保持、超时放手、兜底斜坡、抗 NaN、不改写输入、骨长守恒）。**没接进 `main.ts`**（那个文件这次不许碰），所以现场行为一点没变；要接需要先把参数提进 `tuning.ts` —— 那是冻结契约，见 `docs/24 §0` |
| **`?model=lite\|full\|heavy` 换档**（`shell/kiosk.ts` + `capture/webcam.ts`）| `experimental` | 三个档位的模型 URL 已就位，认不出来的值退成 null 而不是静默变 lite；采集端把实际档位暴露成 `.model`，`/dev/accuracy.html` 显示出来。**只验到 lite 这条路真的加载过**；full/heavy 没有在真人输入上跑过（`docs/24 §3` 有官方 model card 的 45mm→39mm→36mm） |
| `/dev/capture.html` 调试页（33 点叠加 + fps/推理 Hz/置信度 + world xyz 量程/抖动） | `stable` | `scratch/evidence/capture-replay-demo.png`：33 点在位，fps 59 / 推理 31Hz |
| `?demo=1` 回放（`src/capture/replay.ts`） | `experimental` | 与 `WebcamCapture` 同接口、可直接互换，`capture-replay-demo.png` 是它在播。片段由 `/demo/index.json` 列出、`?clip=<name>` 指定（三种写法 + "真录制永远排在合成数据前"有单测：`packages/app/test/clip.test.ts`，随 `npm run check` 跑）。**但目前库里只有合成占位数据** `assets/demo/pose-synthetic.json`（程序生成，2 秒，不是录制）—— **所以现在没有真正的现场兜底** —— 断网 / 逆光 / 没人敢上台时，`?demo=1` 放出来的是一段 2 秒的程序生成数据，不是一个人。录制页已就绪（下一行），欠的只是一个站到摄像头前面的真人 |
| **`/dev/record.html` 真人 pose 录制页（T-16）** | `experimental` | 页面 UI 完整、六段录制脚本（走进→站定→挥手→蹲下→转身→走出）、定速 30Hz 采样、没人的帧记成 `world: []`（"走出画面"在数据里就长这样）。写回中间件 `/__demo` 五条路都用 curl 当场验过：正常写入 → `assets/demo/pose-writetest.json` + 自动重建 `index.json` 且真录制排到了合成数据前面（测试文件已删）；`synthetic:true` / 整段没人 / 坏片段名（`../evil`）/ GET 四条都被拒。摄像头分支只验到**报错不白屏**：浏览器面板里 `NotAllowedError: Permission denied`，headless 里看门狗 15s 后说人话（截图 `scratch/evidence/record-nocam-t16.png`）。**真正的录制没做 —— 本机有摄像头，缺的是一个站在它前面做完那六件事的真人** |
| kiosk 外壳无人降帧（`src/shell/idle.ts`） | `stable` | 无人 300s → 渲染降到 10fps，人一回来立刻满帧；采集端（webcam/replay 都改了）上报在场，鼠标键盘也算有人。手动步进 rAF 的单测证明"1 秒只跑 11 帧"而不是"打算降"（`packages/app/test/frame-loop.test.ts`、`idle.test.ts`，随 `npm run check` 跑）；`/dev/degrade.html` 上手动触发实测 fps 130 → 9.5（目标 10），记录在 `scratch/evidence/degrade-ladder-t16.log`。**阈值 300s/10fps 是 `shell/idle.ts` 的局部常量，没进 `tuning.ts`（要收口的人点头）** |
| **连续出错降级阶梯（`src/shell/degrade.ts` + `safe-frame.ts`）** | `stable` | 以前只打一行日志，现在真降：连续 N 帧出错 → 关后期（`readFlags().nopost` 翻真）→ 再错 N 帧 → 占位几何 → 再错 N 帧 → 重载（会话内最多 2 次，防重载循环）。三级在 `/dev/degrade.html` 注入"每帧抛异常"的假 tick 后逐级触发，事件日志与状态面板读数抄在 `scratch/evidence/degrade-ladder-t16.log`（`data-sb-degrade=reload`、nopost/placeholder 双真）；另有单测 `packages/app/test/degrade.test.ts`、`frame-loop.test.ts`。各级动作用 `registerDegradeHandler()` 认领，**舞台/creature 还没认领（要在 main.ts 收口时接）**，在那之前第 1/2 级只翻状态位 + 发 `sb:degrade` + 写 `<html data-sb-degrade>` |
| **`?selftest=1` 开场自检页（`src/shell/selftest.ts`）** | `experimental` | 逐条检查 WebGPU / 摄像头权限 / parts.json / demo 片段 / 本地模型，✓⚠✗ 各带一句人话；视觉按 `docs/23 §0`（等宽、两级字号、48px 安全边距、无圆角无图标）。不进主程序，主程序起不来也能开（独立 8.3KB chunk）。每条检查 8s 超时 —— **串行跑，一条挂住会把后面全部钉死在"检查中…"**（headless Chrome 的 `enumerateDevices()` 真的会挂）。实测截图 `scratch/evidence/selftest-t16.png`：parts.json ✓ 191 件/23 主题 · demo ⚠ 只有合成数据 · 本地模型 ⚠ 缺 · 摄像头 ⚠ 超时（headless）/ ✗ 权限被拒（浏览器面板） |
| `npm run kiosk` 一条命令进现场 | `stable` | = build + preview + 自动开 `/?kiosk=1`。实跑一遍：build ✓ → `http://localhost:4173/?kiosk=1` 200、`/?selftest=1` 200、`/demo/index.json` 200。`/demo/index.json` 现在由 vite 插件在 **build 时**（不只是 dev server 起来时）扫 `assets/demo/` 生成 —— 删掉它重新 build 会长回来，新机器 clone 下来直接 `npm run kiosk` 不会缺索引。另有 `npm run selftest` 直接开自检页 |
| **慢回路服务端 `/__slow`（提交/轮询/glb/血统池）** | `experimental` | dev server 中间件（`vite.config.ts` 登记，逻辑在 `packages/factory/src/slow.ts` + `slow-http.ts`），协议与数据形状见 `docs/17-SLOW-LOOP.md`。`SLOW_FAKE=1 npm run dev:slow` 下 curl 端到端跑通：POST → submitted → 4s 后 ready → `/__slow/part/<id>.glb` 200 `model/gltf-binary` 24,928 B，件的 aabb `y∈[0,1]`、X/Z 关于 0 居中（= 规范化契约本身），`localGirth=0.8524` / 2,890 tris；血统池 `lineage.json` 记下了 session / 时间 / 物种 / 槽位。拒绝路径六条各打一遍全是结构化 JSON（429 BUDGET_SESSION · 400 非 PNG · 400 槽位不在 targetSlots · 404 路径穿越 · 404 无此任务 · 405 GET 提交）——取证 `scratch/evidence/slow-loop-dev.log`。8 条测试随 `npm run check` 跑（`packages/app/test/slow.test.ts`）：端到端、HTTP 外壳、看门狗超时、Rodin 报错+退款、两条预算闸门、**未焊接的 6000 面网格走减面兜底仍然 ready**。**没打过一次真的 Rodin**（这个 worktree 里没有 `.env`，见 Risks）；`/about` 上那个「规格」标记因此只能摘一半 |
| **生产构建里没有慢回路** | `stable` | `apply:'serve'` + `configurePreviewServer` 显式 404。`npm run build` 后 `grep -rl "__slow\|slow-http\|RODIN_API_KEY" dist/` 是空的；`vite preview` 上 `/__slow` `/__slow/<id>` `/__slow/lineage` `/__slow/part/*.glb` GET 与 POST 全部 404 + `{code:'DISABLED'}`，而 `/` 与 `/dev/parts.html` 照常 200。**踩到的坑**：preview 带 SPA 回退，一开始 GET 拿到的是 200 + index.html —— 前端会在 JSON.parse 上炸掉，「不存在」读起来像 bug 而不是降级。取证 `scratch/evidence/slow-loop-prod.log` |
| 慢回路前端（提交/轮询/热插拔/血统抽取） | `spec-only` | T-17 的前端一半。接口清单在 `docs/17 §8` |
| Stage / 后期 | 见上面四行 | T-09 已落地；仍欠：接进 `main.ts`（`stage.render()` / `stage.frame()` / `stage.timeScale`）、真人实测、现场投影亮度 |
| 开场选择页（dither 轮播） | `experimental` | `/dev/choose.html`：6 张卡滚/选/进，`?theme=xeno` 跳过，数字键直选，空闲自动选（`?idle=6000` 验过）；截图 `scratch/evidence/choose-0*.png`。上游 `gl/` 已移植进 `src/vendor/dither-carousel/`（MIT + LICENSE 在位，`public/` 素材一张没拿）。未验：真实现场投影分辨率与触摸屏 |
| 选择页无 WebGL 降级（DOM 列表） | `experimental` | `/dev/choose.html?gl=off`：6 张卡列出、点选写 `?theme=`、键盘与自动选择照常；控制台 `mode=fallback`。排版已并入 `type.css`（等宽、同底色、卡片图 —— docs/23 §S2「降级路径也是作品的一部分」），列表模式下底部常驻名牌收起、提示语改写成"点一行即确认"。截图 `scratch/evidence/ui-choose-fallback.png`。真实的 context lost 分支 `Not run` |
| **选择页 30 秒自动选的倒计时（docs/23 §S2）** | `stable` | 规格要的是"最后 **5** 秒、中心卡下方一条**极细的进度线**"；原来是右上角一行"10s 后自动选择"的文字。现在是 1px 横线，60ms 步进（200ms 肉眼能看出台阶）。截图 `scratch/evidence/ui-choose-countdown.png`（`?idle=7000`，快门落在倒计时中段） |
| **可选条目 < 3 → 螺旋退化成横向一排（docs/23 §S2）** | `stable` | 以前没做：两个条目也照样进螺旋，看起来像一个转不动的轮子。现在走同一条 DOM 列表路径（键盘/自动选择/退出动画全照常），只是排成一排。用新开关 `/dev/choose.html?n=2` 当场跑得到 —— 没有这个开关这条降级路径永远不会被验证。截图 `scratch/evidence/ui-choose-row-under3.png` |
| **全部页面共用 `src/ui/type.css` + 极简页头（`src/ui/page.ts`）** | `stable` | `/dev/{index,parts,figure,mass,choose,stage,capture,degrade,anchor}.html` 与 `?selftest=1` 全部改成 `<link>` type.css，各自的字号/颜色常量删光（自检页原本把 §0 那一套抄了第二遍）。页头两种形态：文字页在文档流里，满屏 canvas 页压进左上角安全区并在 4 秒后淡下去（截图里不留调试文字）。截图 `scratch/evidence/ui-{index,selftest,figure,mass,stage,capture,degrade}.png` |
| 形态空间排布（按 `axes` 绕质心成环） | `experimental` | `?roster=1` 下 23 个条目排成一圈（autonomous→wheelleg→patrol→field→…→orb）；旧版 parts.json 无 `axes` 时退回数组顺序，也验过 |
| **声音四层（`src/sound/`，docs/29）** | `experimental` | 在场 / 运动 / 升档 / 慢回路等待，全部 Web Audio 合成，**零素材文件**（`assets/sound/README.md` 里论证了为什么）。离线取证 8 张：`scratch/evidence/sound-{presence,motion,tier,wait,act-follow,act-echo,act-resist,act-facing}.png`（波形 + 对数频谱，跑的是 `buildSoundGraph` 那一份图本身）。实测：运动层静止 −29.4 → 峰值 −20.3 dBFS（+9.1dB）；在场 −34.8 → −30.2；升档 −29.2 → −18.0；四个玩法在同一条运动曲线下 −19.0 ~ −21.8 各不相同。两段可听的 wav：`sound-motion.wav` / `sound-tier.wav`。**只在合成信号上跑过，没接过真人；也没在现场音响上放过**（docs/09 里因此多一条未知：房间声学） |
| **声音靶场 `/dev/sound.html`** | `stable` | 上半手推每一个信号 + 四层电平表，下半 `OfflineAudioContext` 取证。截图 `scratch/evidence/sound-range.png`（静止）与 `sound-range-live.png`（speed 1.4 / jerk 15 / resist / 等待中 → 身体 1.00、等待 1.00）。`?mute=1` 下劫持 `window.AudioContext` 计数，点遍所有按钮后仍是 **0** |
| **自动播放策略 / 现场关声** | `stable` | 主程序 `/?demo=1&debug=1&theme=patrol&seed=99` 开机日志 `sound=locked`，控制台**没有任何被拦截的音频警告**；点一下后转 `running`；按 `m` 打出「静音」「恢复」各一行。帧开销：一次控制 tick 中位 **4µs / p95 8µs**（真实 AudioContext，20×50 次取分位），`controlHz=30` 下两帧才发生一次 |
| Web 部署（Vercel + serverless 慢回路） | `spec-only` | T-19，检查单在 `docs/13` §6 |

## 慢回路

| 表面 | 状态 | 证据 |
|---|---|---|
| **`/__slow` 服务端（提交 / 轮询 / 规范化 / 血统池 / 预算闸门）** | `experimental` | `SLOW_FAKE=1` 下 dev server curl 端到端：POST → submitted → ready → `/__slow/part/<id>.glb` 200 `model/gltf-binary`；aabb y∈[0,1]、X/Z 居中（= 规范化契约）。六条拒绝路径全是结构化 JSON。8 条测试。生产构建下 grep dist 无 `__slow`，preview 上四个端点全 404 |
| **慢回路前端（`src/slow/slow.ts`）** | `experimental` | 靶场 `/dev/slow.html` 实跑：剪影 → 提交 → 轮询 → 取 glb → `graft()`，6.3 秒闭合；**第二次跑抽到了第一次留下的那件**，跨会话血统持久一并验掉。截图 `scratch/evidence/slow-frontend-e2e.png`。只有 mask 是画出来的，其余全是真路径 |
| **血统（前人的件进下一个人的候选池）** | `experimental` | `lineage.json` 记 session（匿名）/ 时间 / 物种 / 槽位；`GET /__slow/lineage` 连跑两次分别返回 1 件、2 件 |
| **一次真实的 Rodin 调用** | `spec-only` | **从没打过。** 离线端到端验的是**回路**，不是**生成**。"把实时 AI 3D 生成放进交互回路"这句主张里，被验证的是"回路"那半。docs/09 U10（端到端真实耗时）因此仍空着 |
| 现场 kiosk 跑生产构建 = 没有慢回路 | — | 要让它活着得跑 `npm run dev`（或给 preview 也接一份）。这是个**待裁决**的部署选择，不是 bug |

## 展陈层（作品自己讲自己的那几页）

| 表面 | 状态 | 证据 |
|---|---|---|
| **《共生护照》`/passport.html`** | `experimental` | 做成一本**签证页**而不是记录表：两枚章，I 拒入（人类否掉 100 件批次的前提，逐字引用）、II 准入（Rodin 两个没焊的网格）。II 保留的理由写明是**能力不是产物** —— 容差焊接这条路是它逼出来的。进构建产物（`dist/passport.html`）。页面已在浏览器里实渲并全页截图 `scratch/evidence/passport-full.png`（1280×2600）；页上 5 处存证逐条核过：`19880ae` / `4860281` 两个 hash 解得开、`docs/09 U11` 在、`weldTolerant()` 在。核出并修掉一处引用错误（未焊接网格指到了 `docs/07 §3`，那节是错误码与重试，正确的是 §3 第 3 条）|
| **共创过程档案 `/making.html`** | `stable` | 28 个 commit hash 逐个 `git log -1` 核过全部解得开、印在页上的时间与 `%ad` 一致。六件互相纠正、编排者自己的四个错、有代价的三次判断，全部指到提交。专列一节写**想写但没挖到证据所以没写的四件事**（九条线的名单、每条线的时长与 token、被驳回的提议、作品成立与否）。截图 `scratch/evidence/making-0{0..5}.png`（整页 1440×12136） |
| **构建入口自动发现（根 `*.html` + `dev/*.html`）** | `stable` | 展陈层的页面分几条线并行加，写死 input 表既是冲突点也会漏页。现在 `pages()` 扫两处目录，放一个 html 进来就是一页，没有第二处登记。`npm run build` 后 `dist/` 有 `index/passport/making` + `dist/dev/` 10 个 |
| **启动失败屏（docs/23 §S0）** | `stable` | 原来贴红色 `<pre>` + `err.message`。这是观众唯一会撞上的错误界面 —— 现在是满屏底色 + 居中并置的「稍等一下 / One moment」，详情全部进控制台。样式内联、不用 `innerHTML`：走到这里说明启动链断了，样式表本身可能就是断掉的那一环 |
| **`/about` 作品陈述页** | `stable` | 一屏之内答"它是什么"（五格的观众 90 秒带），再答"和 2019 年那件的区别在哪"（快回路 16ms / 慢回路 30–90s 并排）。慢回路一栏现在是**第三种状态「现场限定 ON-SITE ONLY」**：既不是"只写了设计"（两端都接上了、有测试有取证），也不是"已实现"（真实生成调用一次没打过，且线上版里是 404）。用同一个标记盖这两种情况，盖哪边都是撒谎 —— 所以加了一个。独立 chunk（6 KB JS + 4 KB CSS），不拖 1.5 MB 的 main。截图 `scratch/evidence/about-main.png`（1280×3900） |
| **品牌字体规范 `docs/27-BRAND.md` + 规范页 `/poster/brand.html`** | `stable` | 规范页由它所描述的那套系统**自己渲染**：每一条字号/行高/字距/颜色都从 `type.css` 的 computed style 现读。§6 把卡片、图标、进度条、toast 画出来再划掉。§1 当场量字体回退：字号/行高/字距/行框完全一致，**字形实宽 293.56 vs 311.03px 不一致** —— 值得守的主张从来不是"字形宽度一样"。截图 `assets/brand/brand-spec-page.png` |
| **四张海报 `packages/app/poster/`** | `experimental` | A1 说明（把逆向结论掉头对准自己：印 1,642,496，再说它是原作 47,000 的 35 倍、而这正是它不值一提的原因，然后印分母 —— 10 件被人删掉的部件和逐条手写理由，全页唯一的颜色就在那 10 个 id 上）/ A1 阵列（21 张 anchor 其实全是同一个部位，海报就认这件事，并引 `docs/18` 的"辨识度住在整体剪影里，不在零件里"把局限变成来现场的理由；两个空格画对角线 —— 那两个条目的内容恰好就是"没有"）/ A1 立场（自评 1/6，收尾"这张海报会过期。那一天我们就换一张"）/ A4 票根（seed 栏空着，因为 `genome.ts` 保证同 seed 长回同一具身体 —— 它不是截图，是配方）。全部 PNG 在 `assets/brand/`，长边 ≥2000px。**`@page` 尺寸按规范写，但没有人真的导出过一张 PDF、也没有人真的印过** |
| **海报数字不许手打（`poster/build-data.mjs`）** | `stable` | 数字只有一个来源且是跑出来的。槽位表 `import` 自 `core/src/slots.ts` 正本，不留抄本 —— 去掉抄本时输出一字未变，这既说明它此刻是对的，也说明这类错**不会在出现的时候被发现**。脚本自己冒出来两条没人要求的结论并留在了海报上：`digitigrade`（自有 6 件）和 `wheelleg`（自有 1 件）的自有部件**全部被人工剔除**，现在整具身体借着 `porcelain` |

## 明确还没接上的

- **慢回路在现场（kiosk）是关着的。** `npm run kiosk` = 生产构建 = `/__slow` 404。
  要让这条回路在装置上活着，现场那台机器得跑 `npm run dev`，或者由收口的人决定
  给 preview 也接一份 —— 那是一个产品判断，不是技术障碍（`docs/17 §1`）。
- **慢回路从没打过一次真的 Rodin。** 整条链在 `SLOW_FAKE=1` 下端到端跑通，
  但 image-to-3D 那一段（剪影当参考图、`creative` 模式、真实耗时）是 `Not run`：
  这个 worktree 里没有 `.env`，一次真调用要 0.5 credits。`docs/09` U10 因此还空着。

- **`mass` 的三个条目（coral / char.dumpling / char.ghost）不用它们自己的刚体件。**
  B 档换的是渲染器，一个槽位件都不实例化 —— 那 32 件花过 credits 的资产在画面上看不见。
  这是 mass 落地那一轮的取舍，不是新账。A 档的新拓扑没有这个代价（docs/18 §6）。
- **`radial` / `column` 没接过真人骨架。** 合成 A-pose 与三副合成姿态下因果成立，
  但真人追踪的抖动会怎么进到"弧半径"和"折叠角"里，没见过。
- `mass` 里的旋钮（`res` 默认值、球间距、半径系数、`isolation`/`subtract`）按 `tuning.ts`
  的规矩本该住在 `tuning.ts`，同样因为冻结契约暂时留在模块里。

## 明确还没验证的（见 `docs/09`）

U1 MediaPipe 轴向 · U2 单目深度可用性 · U3 现场灯光 · U4 material=None 的影响 · U6 主题内一致性（anchor 后）· U7 API 并发上限 · U9 目标机帧率 · U10 慢回路端到端耗时

已解决并回填：U5 bbox 约束 · U8 减面 · U11 百万面兜底 · U12 preview_render · U13 数组字段编码
