# 10 · Surfaces — 什么真的跑通了

> 这张表是项目状态的**唯一可信来源**。文档写了不等于跑通了。
> 状态只有五档：`stable`（跑通且有证据）/ `experimental`（能跑但没稳）/
> `stub`（只有占位/签名）/ `spec-only`（只有文档）/ `archived`。
>
> 规则：**动完代码就更新这张表。** 证据一栏必须是"跑过的命令"或"截图路径"，不能是"应该可以"。

最后更新：2026-09-13（网格落地补完：`vitality` 认身体方案 + 团块自己落地）

最后更新：2026-09-13（真人录制进库：`assets/demo/` 不再只有合成数据）

最后更新：2026-09-13（声音四层落地后）

最后更新：2026-09-13（身体好看那条线：脚的挂载 + 镜像法线 + 材质统一）最后更新：2026-09-13（T-17 慢回路服务端落地后）
最后更新：2026-09-13（A 档新拓扑 `radial` / `column` 落地、六个条目重新分配之后）
最后更新：2026-09-13（加载态 + 目录 + 全流程走查后）
最后更新：2026-09-13（舞台美学：四套场景 + 地平线/接触阴影/粒子修好之后）最后更新：2026-09-13（T-17 慢回路服务端落地后）
最后更新：2026-09-12（B 档身体方案 `mass` 落地后）最后更新：2026-09-12（T-16 kiosk 加固 + 录制页落地后）
最后更新：2026-09-12（T-09 Stage 落地后）

## 资产流水线

| 表面 | 状态 | 证据 |
|---|---|---|
| Rodin 客户端（提交/轮询/下载/错误码/429/并发闸门） | `stable` | `npm run factory:generate -- --pilot`：6/6 成功，21–47s/件 |
| 幂等台账 `ledger.json` | `stable` | 第二次 `--dry-run` 报 "需要生成 0 个" |
| 预算闸门（单次 ≤40 credits、余额检查） | `stable` | 代码路径已走通；超额分支 `Not run` |
| 规范化（主轴 +Y / socketA 原点 / 长度 1 / 去贴图 / 单 mesh） | `stable` | `npm run factory:normalize`：6/6 无 warning；2.3MB → ~110KB |
| 长轴朝向自动判定（粗端朝下） | `experimental` | 186 件复检：9 个槽位方向一致（少数反例都是 lo≈hi 的 near-symmetric 件，无所谓）。**`foot` 是 12:12 对半分** —— 现在知道为什么了：`endRadii` 问的是「哪一端更粗」，而脚的两端是脚跟和脚尖，谁粗谁细本来就没有定论，所以它必然是硬币。这条对**摆放**已经不再要紧（脚不再按端点挂，见下面「脚长在腿上」那行）；剩下的只是脚**前后可能朝反**这一件事，仍然要逐件 flip，**不花 credits**（T-13） |
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
| `attach.ts` 挂载数学（stretch / uniform 双模式 + `axisLength` / `anchor`） | `stable` | 13 个测试，含 1000 次随机不变式 + 4 种退化输入 + 两种模式 + 新增的长轴覆盖与锚点（`anchor` 缺省 / NaN / 越界都退回老行为；老的 9 条一条没改） |
| `filter.ts`（OneEuro / emaAlpha / rollingMedian） | `stable` | 4 个测试，含帧率无关性与抗离群值 |
| `presence.ts` 生命周期状态机 | `stable` | 3 个测试，含"离开途中回来不清零" |
| `evolution.ts` 演化 | `stable` | 3 个测试，含阈值抖动与首次升档时机 |
| **`palette.ts` 材质统一（次要/点缀色向物种主色收敛）** | `stable` | 6 个测试。护栏那条最重要：同一个 `matte.ash` 挂在瓷身上和挂在异形身上，明度仍然差 0.1 以上 —— 统一材质**不许**把物种统一掉（docs/PRD §5 第 3 条）。自发光材质（`glow.signal`）原样放行，它是信号不是配色 |
| `rng.ts` / `vec.ts` | `stable` | 被上述测试间接覆盖 |
| `slots.ts`（BoneId→Slot、SLOT_WIDTH） | `stable` | 纯表；已被 `app/src/creature/assemble.ts` 实际消费 |
| `genome.ts` 抽取 | `stable` | 同 seed 两次刷新 genome 深度相等（`/dev/figure.html?seed=1234` 实测）|
| **`ground.ts` 网格落地（`lowestPointOf` / `groundLift` / `liftMatrixInPlace` / `MAX_LIFT`）** | `stable` | 纯几何：每件部件的局部 aabb 过它自己的挂载矩阵，取全身最低角，整体抬到 y=0。骨架那一层只保证最低的**脚关节**在 y=0，而脚这个部件绕骨轴长出来 → 底面还在骨轴下方半个脚厚（29 个条目实测沉 3~6cm，最深 `digitigrade` −0.059m）。`packages/core/test/ground.test.ts` 量的是真的 `foot.porcelain.a` 包围盒 + 真的挂载参数；端到端由 `packages/app/test/ground.test.ts` 跑真的 `assemble()` × 七种方案证。消费者：`app/src/creature/assemble.ts` 的 `groundToFloor()`，以及 `mass.ts`（只借 `MAX_LIFT` 这条安全阀） |
| **`vitality.ts` 末尾的再落地认身体方案（`apply(..., plan)`）** | `stable` | 它在 `remapSkeleton` **之后**跑，末尾会再落一次地，而那一次原来写死 `footIdxL/R, ankleL/R` —— 对 `PLANS_WITHOUT_FEET`（`radial` / `inverted`）等于拿一组长在身体**顶上**的关节往下拽。参考站姿实测：`inverted` 整具骨架被埋到 **−1.290m**、`radial` **−0.601m**。网格落地会把递给它的东西原样抬回来，所以**画面上看不见**；但读关节的那些人（接触阴影 `framing.ts`、取景、截图）读到的全是这具沉下去的骨架。谓词只有一个：`bodyplan.ts` 的 `groundsByLowestJoint()`（`PLANS_WITHOUT_FEET` 的唯一判据函数，**不许再建第二张表**）。`core/test/vitality.test.ts` 新增 3 条：两个无脚方案各钉 10 帧最低关节在 y=0，外加一条反向护栏（人形蹲下摸地、手尖低于脚尖时，基准**仍然是脚**）。注释掉修复 → 那两条立刻红成上面两个数 |
| `skeleton.ts` / `stabilize.ts` / `motion.ts` | `spec-only` | 见 `docs/11-TASKS.md` T-02/T-04/T-06 |

## Runtime（浏览器）

| 表面 | 状态 | 证据 |
|---|---|---|
| Vite + `three/webgpu` 渲染栈 | `stable` | `/dev/parts.html` 在 WebGPU 下正常出图 |
| **主程序 `src/main.ts`（整条链收口）** | `experimental` | `/?demo=1&debug=1&theme=patrol&seed=99&tier=2` 装出整具真部件身体：**120fps · CPU 0.8ms · 30 实例 · 89k 三角 · 13 draw · 推理 30Hz**，全部在 `BUDGET` 内（`scratch/evidence/main-chain-patrol.png`）。tier 0 时如设计般是素几何（`main-chain-tier0.png`）。**只在回放数据上跑过，没接过真人** |
| **玩法扩展点 `src/acts/`（Act / Director）** | `experimental` | `/?demo=1&debug=1&act=echo` → HUD 显示 `act echo 回声: 延迟 1.2s`，120fps / CPU 0.5ms。出错隔离（连续 3 次抛异常自动禁用并回落 follow）的分支 `Not run` |
| `src/stage/stage.ts` 舞台（等身相机 / 三点光 / 影子 / **屏幕空间天幕 + 距离雾** / 接触阴影 / 空场粒子 / 升档脉冲） | `experimental` | **地平线那条硬边已经不存在了**（不是调淡了）：改前 `stage-before-idle.png` 第 240→249 行整行平均亮度 9px 内跳 **+5.6/255**；改后 `stage-after-idle.png` 同一带（y=200–284）单调平滑、总变化 **0.26/255**，整张图最大 4px 跳变 2.65/255 且落在页头文字上（量法 `scratch/scan.py`）。做法不是"让两个材质输出同一个颜色"（那条路实测证伪），而是天幕变成一个屏幕空间函数、地面靠 `scene.fogNode` 化进同一个函数。**仍然只在合成 A-pose 上跑过，没接过真人** |
| **舞台场景 `src/stage/scenes.ts`（5 套完整视觉世界，`?scene=` 切换，按物种自动挑）** | `experimental` | `paper` 纸 / `gallery` 白展厅 / `void` 深空 / `tide` 夜潮 / `backlit` 逆光，各一张取证：`scratch/evidence/stage-scene-{gallery,void,tide,backlit}.png`（同 seed 同条目，差别全部来自场景）。同一套场景换物种 `stage-scene-void-xeno.png` 证明**灯的颜色仍归主题、场景只换世界**。切换复用 `lerpLook` 那条交叉淡入（`STAGE.sceneFade = 1.6s`，**不是硬切**），中间帧 `stage-transition-mid.png`。单测 `test/scenes.test.ts` 11 条：五套性格次序、晕心几何下限、雾密度上限、**地面反射不许有中间态**、`applyScene` 不动物种颜色、`pickScene` 分支、未知 `?scene=` 不静默兜底 |
| 接触阴影（脚下那一圈，落点由骨架给） | `experimental` | `framing.ts` 的 `contactPoints()` + `stage.frame(skeleton)` 每帧喂。去重阈值 **0.19m** 是量出来的（脚踝↔脚尖 0.16m、两脚 0.20m，取 0.12 会让每只脚下面出现两个黑圆斑）；离地上限 `STAGE.contactLiftRange = 0.22m` 挡掉手尖（A-pose 手尖离地 0.73m，去重挡不住）。截图 `stage-scene-void.png` / `stage-scene-void-xeno.png` 脚下可见。接触阴影的"地面"取 **y=0**（不是身体自己的最低点）：陷进地里的脚照常有接触阴影，**真跳起来时接触阴影正确消失**（单测两条都钉住）。**未兑现的那一半**：脚的网格最低点在 y=−0.025（装配线实测，真实运行时 `ground()` 归零后再沉 ~3cm），身体整体陷进地里约 5cm —— 修法要装配时的 `aabb`，归 `src/creature/` 那条线；**他们加的 Y 偏移必须同时加在喂给 `stage.frame()` 的骨架上**，否则网格挪了影子留在原地 |
| 地面反射（映天幕，不映身体） | `experimental` | 只有 `tide` / `backlit` 非零，`gallery` / `void` 是 **0**（docs/28 §4：不做中间态）。平面反射 `reflector()` 被否：draw 17 → ~35 而 `BUDGET.maxDrawCalls = 40`；SSR 被否：`?nopost=1` 时整条消失 = 构图变了而不是画质降了。现做法是天幕绕地平线线性翻折 —— 对无穷远的天幕这是**精确**的，零额外 pass。`stage-scene-tide.png`（含 `groundRipple` 涟漪） |
| `src/stage/framing.ts` 按身体包围盒取景（人形严格等身，非人形有限插值） | `stable` | `test/framing.test.ts` 6 条：`PLAN_BOUNDS` 每次跑都和 `remapSkeleton` 的实测值比对；人形画面高度仍是 2.45m；四足/stub/towering/inverted 都不出画。`FRAMING` 的字段**一个没动**，场景的构图票走新增的 `frameLift`（叠加，缺省 0）|
| `src/stage/look.ts` 每个条目一套灯光/后期（`palette` + `axes` 推导，无 23 个 if） | `stable` | `test/look.test.ts` 11 条原样通过（场景字段是**只增**的，`deriveLook` 的老字段一个没改）。`groundFar === bgBottom` 那条断言还在，但它**不再是地平线的成因**——雾才是 |
| `src/stage/post.ts` 轻 bloom / 微 DOF / GTAO / 暗角 / 颗粒（three addons，无新依赖） | `experimental` | 暗角与颗粒改由场景给（`look.vignette` / `look.grain`）：逆光几乎不要暗角（画面本来只有中间亮），白展厅反过来要重暗角否则亮底会一路铺到画框边。降级阶梯第 1 级实拍 `stage-nopost.png`（`?nopost=1` 照常出画，只掉后期）。**踩过的坑**：scene pass 继承渲染器 MSAA 会让 GTAO 的 `textureGather` 无重载、整条 AO 管线静默失效 → `samples:0` + 末尾 FXAA |
| `src/stage/particles.ts` 空场呼吸粒子（相位由累计时间驱动，无循环） | `experimental` | `stage-after-idle.png`：IDLE 不黑屏，而且**这次真的看得见**。改前看不见不是"淡"：0.016m 的公告牌在 1600×900 上只有 ~7px，乘 0.35 基础不透明度后对单像素的贡献不到 1/255，**存不进 8bit**。尺寸提到 `STAGE.particleSize` + 场景倍率（暗场景 1.45–1.8×；`gallery` 明确为 **0**，加性混合在亮底上等于不存在）。对照 `stage-before-idle.png` |
| 升档视觉事件 `stage.pulse(tier)`（600ms / 全身 +8% / 0.15s 内 dt×0.4） | `experimental` | `stage-pulse-before.png` vs `stage-pulse-peak.png`：HUD 现场读数 **全身 +7.1%**（截图那一刻的包络值，峰值 +7.6%），被照亮像素的线性亮度实测 +6.4%；`timeScale` 轨迹 0.40 → 0.47 → 0.67 → 0.87 → 1（0.15s 恢复）。**没接进 main.ts**：停滞要生效，收口时要把 `stage.timeScale` 乘进 creature/act 的 dt |
| `src/assets/library.ts` PartLibrary（parts.json + glb + 程序化占位） | `stable` | 把 `parts.json` 改名 → 页面照跑，30 个占位实例（`creature-fallback-no-partsjson.png`）；单个 glb 改名 → 只有那一个槽位退回占位，16/17 正常（`creature-one-glb-missing-head-fallback.png`）|
| **运行时读 `/parts/curation.json`**（`library.ts` 的 `loadCuration()` → `makeGenome({ rejected })`） | `stable` | 人眼剔掉的件真的不进池：`npm run check` 里 `packages/core/test/genome-curation.test.ts` 拿**真的** `parts.json` × `curation.json` 跑穷举 —— 所有 theme × tier 1/2/3 × 60 seed，10 件 reject 一次都没抽到；同一组里还钉住"没有物种因为策展消失"（可选物种名单加不加 `rejected` 完全相同）。`npm run check:parts` 当场复述这个集合：`策展: keep 0 · reject 10`，其中 3 件仍留在 `parts.json` 里是故意的（docs/14 §5：genome 排除、文件保留）。取不到时**不拖垮资产层**：`loadCuration()` 与 `parts.json` 分开 fetch，失败只是"没有人工品控这一层"，`console.warn` 一行后退成空集合（ADR-4 / P3）|
| `src/creature/assemble.ts` 纯装配（挂载 + 关节盖片） | `stable` | 30 个实例的 `M·(0,0,0)` 与 `bone.p0` 误差 0；stretch 槽位 `M·(0,1,0)` 与 `p1` 误差 0 |
| **A 档新拓扑 `radial`（无躯干）/ `column`（单柱）** | `stable` | 纯函数，`packages/core/src/bodyplan.ts`。`radial`：四条肢摊成四条绕核心的轨道弧，弦长 = 骨长（部件不被拉伸），半径 = 末端离中心的距离、高度 = 末端相对中心的高度、朝向 = 肩轴；核心压到 0.40。`column`：六块腿骨首尾串成一根桅杆，双臂是顶端分支，蹲下按之字折叠（只改方向不改长度）。`test/bodyplan.test.ts` 新增 10 条，覆盖"真的没有躯干/没有腿"与三条因果（抬手 / 蹲下 / 张开），共 110 条全绿。取证 `scratch/evidence/plan-radial-*.png`、`plan-column-*.png`。**只在合成骨架上跑过，没接过真人** |
| `inverted` 的落地基准修正 | `stable` | 原来按"最低的脚"贴地，而倒过来之后脚在最上面 → 头被按到地板以下。改成 `PLANS_WITHOUT_FEET`（`radial` / `inverted`）按**整体最低点**贴地，且出口的比例遍沿用同一基准。这是 `xeno` 换成 `inverted` 时抓到的 |
| 六个条目重新分配身体方案 | `stable` | orb/furball→`radial`，manipulator/screenface→`column`，autonomous→`quadruped`，xeno→`inverted`，char.paper→`towering`（`towering` 与 `inverted` 从此不再是零使用）。改的是 `roster.ts` 的 `BODY_PLAN`，跑 `factory:index` 只重写 `parts.json` 的 themes；**191 件 parts 数组逐字节未变**（改前后 JSON 比对），`check:parts` 191 件 0 错 |

| **脚长在腿上（`foot` 的挂载 + `FOOT` 三个旋钮）** | `stable` | **改之前脚是躺在地上的**：`foot` 按 uniform 挂，长轴尺寸 = `SLOT_WIDTH.foot / localGirth` = **0.39m**，和 0.17m 的脚骨毫无关系；而部件契约把 socketA 放在长轴端点，于是整只脚从脚踝**往前平铺**出去、戳穿地板，脚踝以下是空的。现在脚长由脚骨算（`FOOT.lengthOfBone` 补上踝后面那截脚跟，带钳位），踝钉在脚长三成处（`FOOT.anchor`），`SLOT_WIDTH.foot` 改读「脚宽」0.115。取证 `scratch/evidence/body-feet-before-after.png`（同机位同 seed 的脚部特写）与 `body-{porcelain,xeno,manipulator}-{before,after}.png` |
| 关节盖片盖住接缝 | `experimental` | `MORPH.jointCapScale` 0.75 → 0.95。0.75 时盖片比它要盖的那根骨头还细，肩/胯/膝的穿插照样露在外面 —— 盖了等于没盖。取证同上那六张图。**审美判断，没有量化判据** || `src/creature/body.ts` `BodyInstance` 接口（身体方案的插拔点，docs/18 §3） | `stable` | 纯提取，`creature.ts` 一行没动。编译期断言 `Creature extends BodyInstance` 在 `npm run typecheck` 里（把 `pose` 签名改坏会立刻红）；`mass.ts` 是第二个实现 |
| **`src/creature/mass.ts` 团块身体（B 档 · MarchingCubes metaball）** | `experimental` | `/dev/mass.html` 实测（M4 / Chrome WebGPU，合成 A-pose 17 骨 = **87 球**，`pose()` 连续 200 次）：**res40 = 1.85ms avg / 3.4ms p95 · 2,484 三角 · 1 draw call**。res 阶梯 16/24/32/40/48/64 → 0.27 / 0.61 / 0.89 / 1.85 / 3.97 / 9.64ms，三角 594 / 1152 / 1740 / 2484 / 3340 / 5928，**全部 1 draw**。大动作姿势（92 球）res40 = 2.98ms avg / 6.6ms p95。降级旋钮（`setRes`）实测有效。**CPU 比刚体贵、GPU 比刚体便宜**：同一副骨架下刚体版 `pose()` 0.17ms / 87,844 三角 / 17 draw，团块 1.85ms / 2,484 三角 / 1 draw。截图 `scratch/evidence/mass-still-res40.png`、`mass-big-res40.png`、`mass-lowres-res16.png`、`mass-highres-res64.png`。**只在合成骨架上跑过，没接过真骨架，也还没有任何条目真的用它**（见下） |
| **团块也落地（`mass.ts` `pose()` 第 6 步 + `stats.lift`）** | `stable` | 团块身体**不走 `assemble()`**（它一个槽位件都不实例化），所以网格落地那条路从来没管到它 —— coral / char.dumpling / char.ghost 和每个人的 tier 0 开场形态（`nascent.ts`）一直沉在地板里。量的是 `MarchingCubes.update()` 之后 geometry 里**这一帧真要画的顶点**（不是球心+半径：融合会让表面胖出球半径之外，胖多少不是一个能写下来的数 —— 那是估计不是测量，P21），世界最低点 = `center.y + lift + localY·half`，令其为 0。`packages/app/test/mass-ground.test.ts` 3 条：站姿修前 **−0.0620m**、蹲姿修前 **−0.0467m**，修后两者 \|y\| < 1e-6；第三条钉住"进出场那几帧冻结抬升"（`shrink` 把物质收向质心，那时重算会让团块一边化开一边往地上掉）。测试读 `geometry.drawRange.count` 而不是 `mc.count`，绕开文件头 §3 那个字段名坑。钳位复用 `core/ground.ts` 的 `MAX_LIFT`。**仍欠**：抬升只改渲染网格，喂给 `stage.frame()` 的骨架没同步，所以团块的接触阴影仍落在骨架的落点上（刚体那条路也一样，见「明确还没接上的」）|
| **`src/creature/swarm.ts` 点场身体（B 档 · 跟着活骨架走的公告牌点云）** | `experimental` | 修的是一个**物种自我矛盾**：`field`／「场」的 tagline 是「身体消失，只剩运动」、`source:'procedural'`、自己一件部件都没有，但它**没有 `bodyPlan`** → `main.ts` 算出 `planKind='rig'` → 走刚体装配、沿 base 链向别的物种借满一整套四肢。改前取证 `scratch/evidence/field-before-rig.png`：一具黄色人形机器人，**30 实例 / 28,043 三角 / 18 draw**。改后是一片 1400 点的云：`scratch/evidence/field-after-swarm-{apose,raise,crouch,open,front}.png`（四副姿态证明因果还在）、`field-main-demo-motion-{a,b}.png`（主程序回放里动起来的样子）。实现**不新造渲染器**：复用 `stage/particles.ts` 的呼吸粒子团，只把「聚拢位置」从写死的 tier 0 站姿换成一个 16 格的**运动历史环**（17 骨 × 2 端点 = 34 个 vec3／格，`SWARM.trailStep` = 35ms 定速推进），每个点按自己的延迟（`rand^SWARM.lagCurve`，多数贴着「现在」、少数拖在后面）在环里插值取自己那一刻的位置 —— 于是站住时点叠回同一个姿势（形短暂出现），一动就沿轨迹拉开（形被运动吃掉）。每帧 CPU 只有 34 次 `Vector3.set`（而且只在环推进的那一帧）加逐点量一次最低点，**帧循环里不写大数组**（P5）。成本（真时钟，页面自己的 `?debug=1` HUD，`/?demo=1&theme=field&tier=2&debug=1`）：**draws 1 · tris 2.8k · cpu 1.4ms · instances 0**；同一台机器同一分钟的刚体对照（porcelain）**draws 18 · tris 85k · cpu 2.2ms · instances 30** —— 三个轴都更便宜。⚠ fps 两边都读 60，但这是 headless Chrome（日志里有 `CVDisplayLinkCreateWithCGDisplay failed`，rAF 退到 60Hz 兜底定时器）：**两边都顶在这个上限上，所以这组数只证明「没掉下来」，不证明「不花钱」**；按 `docs/18 §7.5` 它不是真实帧率读数，**没有拿到带窗口的交互式读数**。落地是点云自己量的（`core/swarm.ts` 的 `lowestSwarmY`，**逐点**，不是「骨头最低点减抖动半径」那个包络 —— 按包络落地会让看得见的那片点浮在空中一层抖动半径），`SWARM.liftTau` 平滑，钳位复用 `core/ground.ts` 的 `MAX_LIFT`。`packages/core/test/swarm.test.ts` 10 条（红→绿实测：去掉抖动 2 红、延迟改均匀 1 红、骨长加权改等权 1 红）。**只在合成骨架与回放数据上跑过，没接过真人** |
| `/dev/figure.html` 认得点场 | `stable` | 这一页此前对 `field` 有两个洞：`themeIsUsable` 把它整个滤掉（打开 `?theme=field` 会静默退回列表第一个条目「瓷」——**这一页看不见的那个物种，恰好是问题最大的那个**），而且它只驱动 `createCreature`。现在不实例化部件的方案（`mass` / `swarm`）不再被可用性过滤挡住，`swarm` 由这一页直接渲染，HUD 换成「点 N · 三角 · draw/上限 · 抬升 Nm」并明说「无槽位：整具身体是一片点」。`mass` 仍不在这一页上路由 —— 它有自己的 `/dev/mass.html` |
| 团块 vs 刚体并排对照 | `stable` | `scratch/evidence/mass-vs-rig-compare.png`（`/dev/mass.html?mode=compare&pose=big`）：团块是一具连续的身体，刚体版在同一姿势下读作一堆悬空零件。这张图是「像不像原作那种流过身体的物质」的判断依据 |
| `/dev/mass.html` 团块调试页（合成 A-pose ↔ 大动作 · HUD · 方向键调 res · 三模式） | `stable` | 上述全部数字与截图都出自它。`?mode=mass\|rig\|compare&pose=a\|big\|anim&res=&angle=&still=`；`?still=N` 是 headless 取证用（永不停的 rAF 会把 `--virtual-time-budget` 吊住） |
| 团块的降级路径（`presence` 进出场 / 退化骨架 / 出界） | `experimental` | 浏览器控制台逐条跑过，**全部不 throw**：IDLE 与 LEAVING t=1 → 0 三角 0 draw 且隐藏；ENTERING 0→0.5→1 → 0 / 964 / 2,274 三角（物质向质心收回去）；`null` 骨架、空 bones、全 NaN 关节、confidence=0、height=0、length=0、身体被挪到盒外 50m、`dt=NaN`、`dt=10s` 逐个跑过均正常返回，且 15 帧内恢复正常出图 |
| `src/creature/creature.ts` 实例化渲染 / remorph / graft | `experimental` | 30 实例 · 85–88k 三角 · **18 draw**（左右分桶后比原来多一点，仍远在 `BUDGET.maxDrawCalls` 40 内）· `pose()` 0.06–0.21ms；换装最多 3 活并排队（18 槽位 438 帧 = 7.3s 排空）；`graft()` 热插拔 73 帧完成。**只在合成 A-pose 上跑过，没接过真骨架** |
| **左右不再像两种材质（镜像改走预镜像几何）** | `stable` | 左侧肢体原来靠矩阵里的负 X 缩放做。负行列式把左半身的三角形**全部变成背面**，而 `DoubleSide` 会把背面片元的法线取反 —— 左半身于是「从内部被照亮」，比右半身暗一大截。实拍图里「一只手白、一只手深色带斑」根本不是材质问题，是这个。现在由 `library.mirrored()` 给一块 X 取反**且绕序也翻回来**的几何，行列式保持为正。3 条测试守住它（闭合网格的有向体积镜像后仍为正，索引 / 非索引两种几何都测）。取证 `scratch/evidence/body-feet-before-after.png` 的左右对照 |
| **描边 / 平涂着色（`src/creature/shading.ts`）** | `experimental` | `char.line`（线）的全部辨识度是轮廓上那圈粗黑线，而它此前和另外二十几个物种走同一条 PBR 路径 —— **这个物种的身份是缺席的**（docs/12 早已写明：描边是着色属性，不是几何属性，网格载不动它）。现在每个桶多挂一块**反向外壳**（`BackSide` + 沿法线外推 `TOON.outlineMeters`=12mm），填充换成 3 级平涂（`MeshToonNodeMaterial` + 色阶贴图）。**不走屏幕空间边缘检测**：那是一个后期 pass，而后期会被 `?nopost=1` 和降级阶梯第 1 级自动关掉 —— 机器一慢身份就消失。opt-in 由 `SHADING_OF_THEME` 一张表决定（表里只有 `char.line`，其余物种一个像素不变），`?shading=toon|physical` 与控件条「渲染」组的 `O` 键可在**任何**物种上当场热切（实测：porcelain 默认 18 draw / 86k 面，按 O 变 36 draw / 172k 面，不重载）。推挤写在 `positionNode` 而不是 `vertexNode` 上 —— 后者会接管整段顶点计算、丢掉实例矩阵，一整桶外壳叠在原点。实测（`?demo=1&theme=char.line&tier=2&seed=12345&nopost=1`，同一分钟内 A/B，读页面自己的 rAF 帧率）：physical 120fps / 0.9–1.5ms / 18 draw / 88k 面，toon 120fps / 1.0–2.7ms / **36 draw** / 177k 面 —— **两边都顶在垂直同步上限，所以这组数只证明「没掉到 120 以下」，不证明「不花钱」**。36/40 已经贴着 `BUDGET.maxDrawCalls`，`test/outline-budget.test.ts` 守住它（最坏 18 桶，再多 2 个桶就红）。取证 `scratch/evidence/outline-char-line-{on-f60,on-f150,off}.png`、`outline-porcelain-off.png`、对照裁切 `outline-compare-{head,feet,hand,chest}.png`。稳定性用像素差量过：冻结机位下第 60 帧与第 150 帧**除 HUD 文字外逐像素相同**，墨不闪、不脱离剪影。**已知：`head.char.line.a` 的格栅被墨吃掉**（`outline-compare-head.png`），那是资产问题不是着色问题 —— 该件的配方写的是 「extremely simplified rounded form, no surface detail」，长出来却是一团格栅，和 `curation.json` 里已 reject 的「炸开的尖刺团」同类；量过三个判据（拆开的法线数 / 世界平均边长 / 表面积比）都分不开它和脚，所以不为一件坏资产弯渲染器，建议走策展 reject |
| **一具身体读起来是一个物种（材质统一）** | `experimental` | 三个材质角色原来各取一个全局材质、彼此没有关系（白瓷躯干 + 深蓝灰四肢 + 白手白脚 = 装错了零件）。现在次要 / 点缀色向**这个物种自己的主色**收敛（`core/palette.ts` + `PALETTE` 旋钮），明度差按 `valueKeep` 留一部分（全抹平身体就没有体积了），表面响应按 `surfaceMix` 靠拢。物种之间的差别由并排图自证：`scratch/evidence/body-three-species-after.png`（瓷 / 异形 / 机械臂，形体与色调都分得开）。**审美判断，没有量化判据** |
| 摄像头采集 / MediaPipe（`src/capture/webcam.ts`） | `experimental` | 整条路跑通但**没见过真人**：headless Chrome + `--use-fake-device-for-media-stream` 下 GPU delegate 起来、wasm 与两个模型加载、mask 产出、`latest()` 不抛也不阻塞（`scratch/evidence/capture-webcam-fakecam.png`）；权限被拒时不白屏且 `lastError=NotAllowedError`（`capture-permission-denied.png`）。**fps ≥ 30 未验证**（headless 软件渲染只有个位数），U1/U2 未实测 |
| **`/dev/accuracy.html` 精度基准台** | `experimental` | 三路并排跑同一份输入（A 原始 / B 现有=`main.ts` 今天的 / C 新=分组 One-Euro+遮挡补全+质量兜底+最小折叠角），逐关节 visibility/世界坐标/1 秒抖动 σ、逐骨长变异 σ/μ、相对 A 的跟随偏差，外加常驻的**"无法测量"清单**。「⇪ 载入片段」直接读 `/demo/` 离线重跑（不走 rAF —— 页面不可见时 rAF 被掐到 1Hz，实时数字会全是 0，那不是"很稳"是没有数据）。合成片段上的实测数字与读法见 `docs/24 §5`。**它证明的第一件事是"现有输入测不了精度"**：合成片段 z 恒为 0、无噪声、左前臂长度变异 65.7%（人体做不到）|
| **`packages/core/src/refine.ts` 姿态精修** | `experimental` | 分组 One-Euro（基线 = MediaPipe 自己的 world 档 `0.1/40/1.0`）+ visibility 低通 + 遮挡时序补全（20 帧缺口上限，超时放手把 visibility 归零）+ 质量兜底（score 低时压低截止频率）+ `clampFold()` 最小折叠角。9 条单测随 `npm run check` 跑（降噪、遮挡保持、超时放手、兜底斜坡、抗 NaN、不改写输入、骨长守恒）。**没接进 `main.ts`**（那个文件这次不许碰），所以现场行为一点没变；要接需要先把参数提进 `tuning.ts` —— 那是冻结契约，见 `docs/24 §0` |
| **`?model=lite\|full\|heavy` 换档**（`shell/kiosk.ts` + `capture/webcam.ts`）| `experimental` | 三个档位的模型 URL 已就位，认不出来的值退成 null 而不是静默变 lite；采集端把实际档位暴露成 `.model`，`/dev/accuracy.html` 显示出来。**只验到 lite 这条路真的加载过**；full/heavy 没有在真人输入上跑过（`docs/24 §3` 有官方 model card 的 45mm→39mm→36mm） |
| **`?cam=<序号\|deviceId>` 选摄像头**（`shell/kiosk.ts` + `capture/camera-select.ts` + `capture/webcam.ts`）| `experimental` | 在这之前 `getUserMedia` 不带 `deviceId`，现场"外接对着观众、内置对着墙"两台里用哪台**完全由浏览器决定**，操作员唯一的办法是拔线或改系统设置。现在两种写法：`?cam=1` 按 videoinput 序号（人站在现场一台台试用的），`?cam=<deviceId 或唯一前缀>` 钉死一台（开机脚本用的、唯一可复现的那种）。认不出来的值（`?cam=1.5` / `?cam=-1`）退成 null 而不是静默挑一台（和 `?scene=` / `?shading=` 同一条规矩）。**设备表只在 stream 已经开起来之后才枚举**：`enumerateDevices()` 本身不弹权限框，但权限之前它不给 label，而为了凑一张表提前要权限会正好毁掉入口层存在的理由（`shell/entry.ts` 文件头）；所以 `?debug=1` 的 HUD 多一行 `cam <label>`，控制台另打一次全表（每行都写着 `?cam=<序号>` 和 `?cam=<id 前缀>`，直接能抄进 URL）。**要的那台不在时大声回落**：照常开默认那台（`latest()` 仍不抛，文件头第 2 条），但 HUD 那一行变红并写「用的不是你要的那台」——判据取自 `track.getSettings().deviceId`（现实）而不是我们请求的那个 id（意图），否则拔掉外接之后仪表会显示得和一切正常时一模一样（P21）。证据：`packages/app/test/camera-select.test.ts` 13 个用例随 `npm run check` 跑 —— `npm run test -w @sb/app` 由 **110 → 123 pass / 0 fail**，`npm run check` 整条绿（core 146 pass、`check:parts` 208 件 0 错）。红-绿都验过：把 `describeCamera()` 改回"报我们请求的那个 id"（静默回落那种实现）→ **13 中 3 红**（外接被拔掉 / 序号错位 / 拿不到实际 deviceId 三条）；把 `cam` 退成 `q.get('cam')` 原样透传（不校验）→ **13 中 1 红**。两次都 `git checkout --` 还原后回到 13 绿。**没有在真有两台摄像头的机器上跑过** —— 序号顺序、`deviceId: {exact}` 被拒时的实际错误码、以及 Safari 的 deviceId 稳定性都还是纸面的 |
| `/dev/capture.html` 调试页（33 点叠加 + fps/推理 Hz/置信度 + world xyz 量程/抖动） | `stable` | `scratch/evidence/capture-replay-demo.png`：33 点在位，fps 59 / 推理 31Hz |
| `?demo=1` 回放（`src/capture/replay.ts`） | `experimental` | 与 `WebcamCapture` 同接口、可直接互换，`capture-replay-demo.png` 是它在播。片段由 `/demo/index.json` 列出、`?clip=<name>` 指定（三种写法 + "真录制永远排在合成数据前"有单测：`packages/app/test/clip.test.ts`，随 `npm run check` 跑）。**2026-09-13：库里有真录制了。** `pose-jumpingjacks`（45.2s，100% 帧有人）与 `pose-walkturn`（20.3s，94.6% 帧有人）都是真人视频跑 MediaPipe 得到的，来源与质量报告在 `assets/demo/SOURCES.md`；左前臂骨长 CV 9.2% / 11.1%（合成数据是 65.7%）。`/demo/index.json` 实测顺序 `pose-jumpingjacks` → `pose-walkturn` → `pose-synthetic`，**`?demo=1` 默认已经挑不到假数据**。仍是 `experimental`：这两段是别人拍的素材，不是"我们的机位、我们的灯光下的一个人"，逆光那一档仍未覆盖（U3） |
| **`/dev/record.html` 真人 pose 录制页（T-16）** | `experimental` | 页面 UI 完整、六段录制脚本（走进→站定→挥手→蹲下→转身→走出）、定速 30Hz 采样、没人的帧记成 `world: []`（"走出画面"在数据里就长这样）。写回中间件 `/__demo` 五条路都用 curl 当场验过：正常写入 → `assets/demo/pose-writetest.json` + 自动重建 `index.json` 且真录制排到了合成数据前面（测试文件已删）；`synthetic:true` / 整段没人 / 坏片段名（`../evil`）/ GET 四条都被拒。摄像头分支只验到**报错不白屏**：浏览器面板里 `NotAllowedError: Permission denied`，headless 里看门狗 15s 后说人话（截图 `scratch/evidence/record-nocam-t16.png`）。<br>**2026-09-13 加了第二条路：视频文件**（`?video=<url>` 或选文件，另有 `&name=` `&save=1` `&delegate=cpu` `&model=`）。逐帧 `seek`、不跟实时播放，所以序列完整；其余（PoseLandmarker、`world: []` 的空帧语义、写回 `/__demo`）与摄像头路共用同一段代码。**跑通过两段**：`pose-jumpingjacks`（1357 帧）与 `pose-walkturn`（609 帧）都由它产出并写回，骨架叠加线贴在人身上的截图见 `scratch/evidence/`。摄像头那条路仍然欠一个真人 |
| kiosk 外壳无人降帧（`src/shell/idle.ts`） | `stable` | 无人 300s → 渲染降到 10fps，人一回来立刻满帧；采集端（webcam/replay 都改了）上报在场，鼠标键盘也算有人。手动步进 rAF 的单测证明"1 秒只跑 11 帧"而不是"打算降"（`packages/app/test/frame-loop.test.ts`、`idle.test.ts`，随 `npm run check` 跑）；`/dev/degrade.html` 上手动触发实测 fps 130 → 9.5（目标 10），记录在 `scratch/evidence/degrade-ladder-t16.log`。**阈值 300s/10fps 是 `shell/idle.ts` 的局部常量，没进 `tuning.ts`（要收口的人点头）** |
| **连续出错降级阶梯（`src/shell/degrade.ts` + `safe-frame.ts`）** | `stable` | 以前只打一行日志，现在真降：连续 N 帧出错 → 关后期（`readFlags().nopost` 翻真）→ 再错 N 帧 → 占位几何 → 再错 N 帧 → 重载（会话内最多 2 次，防重载循环）。三级在 `/dev/degrade.html` 注入"每帧抛异常"的假 tick 后逐级触发，事件日志与状态面板读数抄在 `scratch/evidence/degrade-ladder-t16.log`（`data-sb-degrade=reload`、nopost/placeholder 双真）；另有单测 `packages/app/test/degrade.test.ts`、`frame-loop.test.ts`。各级动作用 `registerDegradeHandler()` 认领，**舞台/creature 还没认领（要在 main.ts 收口时接）**，在那之前第 1/2 级只翻状态位 + 发 `sb:degrade` + 写 `<html data-sb-degrade>` |
| **`?selftest=1` 开场自检页（`src/shell/selftest.ts`）** | `experimental` | 逐条检查 WebGPU / 摄像头权限 / parts.json / demo 片段 / 本地模型，✓⚠✗ 各带一句人话；视觉按 `docs/23 §0`（等宽、两级字号、48px 安全边距、无圆角无图标）。不进主程序，主程序起不来也能开（独立 8.3KB chunk）。每条检查 8s 超时 —— **串行跑，一条挂住会把后面全部钉死在"检查中…"**（headless Chrome 的 `enumerateDevices()` 真的会挂）。实测截图 `scratch/evidence/selftest-t16.png`：parts.json ✓ 191 件/23 主题 · demo ⚠ 只有合成数据 · 本地模型 ⚠ 缺 · 摄像头 ⚠ 超时（headless）/ ✗ 权限被拒（浏览器面板） |
| `npm run kiosk` 一条命令进现场 | `stable` | = build + preview + 自动开 `/?kiosk=1`。实跑一遍：build ✓ → `http://localhost:4173/?kiosk=1` 200、`/?selftest=1` 200、`/demo/index.json` 200。`/demo/index.json` 现在由 vite 插件在 **build 时**（不只是 dev server 起来时）扫 `assets/demo/` 生成 —— 删掉它重新 build 会长回来，新机器 clone 下来直接 `npm run kiosk` 不会缺索引。另有 `npm run selftest` 直接开自检页 |
| **慢回路服务端 `/__slow`（提交/轮询/glb/血统池）** | `experimental` | dev server 中间件（`vite.config.ts` 登记，逻辑在 `packages/factory/src/slow.ts` + `slow-http.ts`），协议与数据形状见 `docs/17-SLOW-LOOP.md`。`SLOW_FAKE=1 npm run dev:slow` 下 curl 端到端跑通：POST → submitted → 4s 后 ready → `/__slow/part/<id>.glb` 200 `model/gltf-binary` 24,928 B，件的 aabb `y∈[0,1]`、X/Z 关于 0 居中（= 规范化契约本身），`localGirth=0.8524` / 2,890 tris；血统池 `lineage.json` 记下了 session / 时间 / 物种 / 槽位。拒绝路径六条各打一遍全是结构化 JSON（429 BUDGET_SESSION · 400 非 PNG · 400 槽位不在 targetSlots · 404 路径穿越 · 404 无此任务 · 405 GET 提交）——取证 `scratch/evidence/slow-loop-dev.log`。8 条测试随 `npm run check` 跑（`packages/app/test/slow.test.ts`）：端到端、HTTP 外壳、看门狗超时、Rodin 报错+退款、两条预算闸门、**未焊接的 6000 面网格走减面兜底仍然 ready**。**没打过一次真的 Rodin**（这个 worktree 里没有 `.env`，见 Risks）；`/about` 上那个「规格」标记因此只能摘一半 |
| **生产构建里没有慢回路** | `stable` | `apply:'serve'` + `configurePreviewServer` 显式 404。`npm run build` 后 `grep -rl "__slow\|slow-http\|RODIN_API_KEY" dist/` 是空的；`vite preview` 上 `/__slow` `/__slow/<id>` `/__slow/lineage` `/__slow/part/*.glb` GET 与 POST 全部 404 + `{code:'DISABLED'}`，而 `/` 与 `/dev/parts.html` 照常 200。**踩到的坑**：preview 带 SPA 回退，一开始 GET 拿到的是 200 + index.html —— 前端会在 JSON.parse 上炸掉，「不存在」读起来像 bug 而不是降级。取证 `scratch/evidence/slow-loop-prod.log` |
| 慢回路前端（提交/轮询/热插拔/血统抽取） | `spec-only` | T-17 的前端一半。接口清单在 `docs/17 §8` |
| Stage / 后期 / 场景 | 见上面那一组 | T-09 已落地，舞台美学这一轮把地平线/接触阴影/粒子/多场景做完；仍欠：接进 `main.ts`（`stage.render()` / `stage.frame()` / `stage.timeScale` / `stage.setScene()`）、真人实测、现场投影亮度、脚部件与骨架落点的 14cm 缝 |
| 开场选择页（SDF 环） | `experimental` | `/dev/choose.html`：6 张卡滚/选/进，`?theme=xeno` 跳过，数字键直选，空闲自动选（`?idle=6000` 验过）；截图 `scratch/evidence/choose-0{1-settled,2-entry,3-hover-trail}.png`。实现在 `packages/app/src/choose/ring/`（`sdf.ts` / `field.ts` / `atlas.ts` / `first-screen.*`），移植自 **Viscose-carousel**（MIT，署名保留；`public/` 素材一张没拿）。**没有 `src/vendor/` 目录，也不该有**：上游是 GLSL + React，这边是 TSL + 原生 TS，没有一行逐字搬过来，所以出处写在三个文件头和 `docs/35-VISCOSE.md`，而不是一个会谎称"这些文件是上游原样"的 vendor 目录。上一版 `dither-blur-carousel` 的 `src/vendor/dither-carousel/` 已随那次重做删掉。未验：真实现场投影分辨率与触摸屏 |
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
| **加载态 `src/shell/loading.{ts,css}`（docs/23 §S0）** | `experimental` | 在这之前从"打开 URL"到"身体出现"之间观众看到的是**一块黑屏**（`/dev/figure.html` 是一行裸 `loading…`）。现在是三档真实进度：`正在点亮画面`（渲染器造出来 0.4 → `init()` 完成 1）/ `正在准备零件`（`parts.json` 0.15 + 选择页 anchor 图到货数）/ `正在认识你的身体`（采集端自报的启动里程碑，webcam 3 件、replay 2 件）。**600ms 宽限期内一帧都不画**，快的时候观众仍然看不见它。慢网取证（Chrome DevTools Protocol 真限速、禁缓存，`vite preview` 打的 dist）：`scratch/evidence/ui-loading-1-early.png`（14%，40% / 15% / 等一下）、`-2-mid.png`（25%，好了 / 18% / ···）、`-3-late.png`（55%）、`-4-slow-first.png`（8 秒后「再等一下，网有点慢」）、`-5-slow-second.png`（20 秒后换第二句）、`-6-fastnet.png`（不限速）、`-7-handoff-to-choose.png`（选择页一上来它就让位，螺旋构图未动）。**两条硬规矩写在文件头**：进度必须来自真实信号；没有真信号的地方宁可停住（显示 `···`）也不许用定时器往上爬 |
| **`library.load()` 与 `renderer.init()` 并行** | `stable` | 原来资产排在 `renderer.init()` 后面，而它俩毫无依赖关系 —— `init()` 是首次 pipeline 编译，那几秒里管子完全是空的。同一条 350 kbps 限速下端到端 **21.6s → 13.0s**（两次 `[loading] 加载完成，耗时` 读数）|
| **目录 `src/ui/nav.{ts,css}`（docs/23 §S9）** | `stable` | 在这之前首页上没有任何入口通向 `/about` 和 `/making`，而且那几页之间一条链接都没有。右上角一个词 + 一条线，展开是「名字 + 它能回答什么问题」的表，当前页标「在这里」且不是链接。挂在 `/`、`/about`、`/making.html`、`/passport.html` 四处。`?kiosk=1` 下 `readFlags().nav` 为 false，**根本不挂**；满屏画布页 4 秒后淡到 0.18。截图 `ui-nav-1-entry-closed.png` / `-2-entry-open.png`（压在入口展签之上）/ `-3-about-open.png` / `-4-making.png` / `-5-kiosk-absent.png`（现场模式下确实一个字都没有）。踩过一个实测出来的坑：靠 `text-align:right` 对齐时，展开会把「目录」两个字从右上角甩到表的左上角（实测 x 1484→1072），改成 flex + `align-items:flex-end` |
| **自己会消失的一行 `src/shell/notice.{ts,css}`** | `experimental` | 把 docs/23 里写了很久没做的两条落地：§S4 左下角物种名（截图 `ui-notice-species.png`：「异形 / Xeno」）、§S0 右下角「降级渲染」（**只有 DOM 取证**：`.sb-notice--bottom-right` 在、`opacity: 1`、rect `[1437,804,114,47]`；无头浏览器在这条路径上合成不稳，没拍到可信的图）。降级那句**故意等加载态收掉之后才说** —— 说早了会被那一层盖住。另外修掉一个会静默吃掉元素的坑：带 `fill-mode: both` 的入场动效在文档时间线不推进的页面上停在 `currentTime: 0`，元素永远透明；规矩写进 docs/23 §0 |
| **启动失败屏（docs/23 §S0）** | `stable` | 原来贴红色 `<pre>` + `err.message`。这是观众唯一会撞上的错误界面 —— 现在是满屏底色 + 居中并置的「稍等一下 / One moment」，详情全部进控制台。样式内联、不用 `innerHTML`：走到这里说明启动链断了，样式表本身可能就是断掉的那一环 |
| **`/about` 作品陈述页** | `stable` | 一屏之内答"它是什么"（五格的观众 90 秒带），再答"和 2019 年那件的区别在哪"（快回路 16ms / 慢回路 30–90s 并排）。慢回路一栏现在是**第三种状态「现场限定 ON-SITE ONLY」**：既不是"只写了设计"（两端都接上了、有测试有取证），也不是"已实现"（真实生成调用一次没打过，且线上版里是 404）。用同一个标记盖这两种情况，盖哪边都是撒谎 —— 所以加了一个。独立 chunk（6 KB JS + 4 KB CSS），不拖 1.5 MB 的 main。截图 `scratch/evidence/about-main.png`（1280×3900） |
| **品牌字体规范 `docs/27-BRAND.md` + 规范页 `/poster/brand.html`** | `stable` | 规范页由它所描述的那套系统**自己渲染**：每一条字号/行高/字距/颜色都从 `type.css` 的 computed style 现读。§6 把卡片、图标、进度条、toast 画出来再划掉。§1 当场量字体回退：字号/行高/字距/行框完全一致，**字形实宽 293.56 vs 311.03px 不一致** —— 值得守的主张从来不是"字形宽度一样"。截图 `assets/brand/brand-spec-page.png` |
| **叙事中文的楷书 `assets/fonts/LXGWWenKai/` + 覆盖面脚本 `scripts/font-coverage.mjs`** | `stable` | 两件事，一根因。**一：字表是算出来的，不是手抄的。** `NOTICE.md` 原来写「子集里 1,321 个汉字」，实测 **958** —— 子集化只做过一次，文案一直在长，叙事中文于是半楷半黑。现在脚本扫 `packages/app` 下的 CSS 找出所有用 `var(--sb-kai)` 的选择器（六条），按登记表取对应文案的汉字，与子集 cmap 对账；多一条没登记的选择器就报警。**二：字体本身换了。** 原来的芫荽 Iansui 是**繁体字身**（改自日文 Klee One），站里的文案是简体，「关 观 对 实 验 选 过 们 …」这 81 个字**上游 v1.020 的 cmap 里根本没有** —— 不是子集化漏掉的，重跑一百遍也救不回来。2026-09-13 换成**霞鹜文楷 LXGW WenKai Lite v1.522**（同为 SIL OFL 1.1，同样改自 Klee One，但补的是 GB 简体）：同一把尺子量出来**严格层 354/354、余量层 970/970，一个不缺**；子集 **232,124 字节 / 970 个码位 / 971 个字形**（比芫荽的 211,148 大 21 KB，换来的是那 81 个字），字表带整本 `i18n.ts` 的余量。**换字前必跑** `node scripts/font-coverage.mjs --upstream=<候选 TTF>`：「上游没有的·严格层」不是 0 就不要换进来。取证是**真浏览器逐字比像素**（Chrome 152，自开 `vite --port 5219` —— 机器上常年挂着的 dev server 可能是另一个 checkout，先 `curl -sI` 确认服务端给的是 232,124 字节；`document.fonts` 里 `LXGW WenKai` = `loaded`；同一个字用 `64px "LXGW WenKai", <grotesk>` 与 `64px <grotesk>` 画进 canvas，位图相同 = 没走楷书 —— 汉字两边都是 1em，比字宽量不出来；无头 Chrome 根本不加载这个 webfont，截图会骗人）：`/` 首屏立意句 **15/15**，`/about` **78/78**（换字前 61/78）。负对照「龘 鼯 麤」如期报落回，说明这把尺子会不及格 |
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

- **docs/23 里三处"规格写了但没做到"**（2026-09-13 全流程走查找出来的，本轮只修了前两条的邻居，
  这三条**没修**，因为它们各自要动别的线正在改的文件）：
  - **§S4「往后一点」**：`COPY.live.stepBack` 写好了，一个调用点都没有。判定"全身不入镜"
    要读 `stage/framing.ts` 的取景结果 —— 那条线这轮不归 UI 动。
  - **§S7 留念（6 秒 · `物种名 · seed 码` · 二维码 / 网页版分享卡片）**：
    `COPY.leave.keepsake` / `COPY.leave.seed` 写好了，没有调用点。溶解那一半是有的
    （`presence` 的 LEAVING），留念那一半整个不存在。这是一个功能，不是一处 UI 缺口。
  - **§S1 网页版「站到画面里」**：`COPY.attract.invite` / `inviteWeb` 没有调用点。
    目前网页版的对应物是入口展签的「开始」和运行中的「用我的摄像头」，
    覆盖了这条的大部分意图，但空场里没有那一行邀请。
  - 另外 **§S0「冷启动 > 8 秒 → 粒子团聚拢成人形轮廓」**：慢网上现在是加载态那三行，
    不是粒子。两者不冲突，但粒子那一版没做。

## 明确还没验证的（见 `docs/09`）

U1 MediaPipe 轴向 · U2 单目深度可用性 · U3 现场灯光 · U4 material=None 的影响 · U6 主题内一致性（anchor 后）· U7 API 并发上限 · U9 目标机帧率 · U10 慢回路端到端耗时

已解决并回填：U5 bbox 约束 · U8 减面 · U11 百万面兜底 · U12 preview_render · U13 数组字段编码
