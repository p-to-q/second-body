# 10 · Surfaces — 什么真的跑通了

> 这张表是项目状态的**唯一可信来源**。文档写了不等于跑通了。
> 状态只有五档：`stable`（跑通且有证据）/ `experimental`（能跑但没稳）/
> `stub`（只有占位/签名）/ `spec-only`（只有文档）/ `archived`。
>
> 规则：**动完代码就更新这张表。** 证据一栏必须是"跑过的命令"或"截图路径"，不能是"应该可以"。

最后更新：2026-09-12（T-16 kiosk 加固 + 录制页落地后）

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
| 部件对照表 `/dev/parts.html`（行=槽位，列=变体） | `stable` | 186 件全部渲出；对照表截图 `scratch/evidence/parts-sheet-2026-09-12.png`（红框=已 reject） |
| 素材策展 `curation.json` / `factory:curate` | `stable` | 第一遍人工过筛：10 件 reject（digitigrade 全 6 件多物体、wheelleg/autonomous 的 spine、head.softwear.a、joint.patrol.a），0 件 keep —— keep 是审美判断，留给项目负责人 |
| 装配预览 `/dev/figure.html`（合成 A-pose × 运行时 PartLibrary/Creature） | `stable` | 已改为驱动真正的运行时模块；`?theme=&seed=&tier=&debug=1`，porcelain/industrial/coral 截图见 `scratch/evidence/creature-*.png`；它抓到了「头被颈骨压扁」这个真 bug |
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
| `src/stage/stage.ts` 舞台最小版（相机/三点光/地面/在场明暗） | `experimental` | 同上两张截图。正经 look dev 仍欠 T-09 |
| `src/assets/library.ts` PartLibrary（parts.json + glb + 程序化占位） | `stable` | 把 `parts.json` 改名 → 页面照跑，30 个占位实例（`creature-fallback-no-partsjson.png`）；单个 glb 改名 → 只有那一个槽位退回占位，16/17 正常（`creature-one-glb-missing-head-fallback.png`）|
| `src/creature/assemble.ts` 纯装配（挂载 + 关节盖片） | `stable` | 30 个实例的 `M·(0,0,0)` 与 `bone.p0` 误差 0；stretch 槽位 `M·(0,1,0)` 与 `p1` 误差 0 |
| `src/creature/creature.ts` 实例化渲染 / remorph / graft | `experimental` | 30 实例 · 87k 三角 · 17 draw · `pose()` 0.06–0.21ms；换装最多 3 活并排队（18 槽位 438 帧 = 7.3s 排空）；`graft()` 热插拔 73 帧完成。**只在合成 A-pose 上跑过，没接过真骨架** |
| 摄像头采集 / MediaPipe（`src/capture/webcam.ts`） | `experimental` | 整条路跑通但**没见过真人**：headless Chrome + `--use-fake-device-for-media-stream` 下 GPU delegate 起来、wasm 与两个模型加载、mask 产出、`latest()` 不抛也不阻塞（`scratch/evidence/capture-webcam-fakecam.png`）；权限被拒时不白屏且 `lastError=NotAllowedError`（`capture-permission-denied.png`）。**fps ≥ 30 未验证**（headless 软件渲染只有个位数），U1/U2 未实测 |
| `/dev/capture.html` 调试页（33 点叠加 + fps/推理 Hz/置信度 + world xyz 量程/抖动） | `stable` | `scratch/evidence/capture-replay-demo.png`：33 点在位，fps 59 / 推理 31Hz |
| `?demo=1` 回放（`src/capture/replay.ts`） | `experimental` | 与 `WebcamCapture` 同接口、可直接互换，`capture-replay-demo.png` 是它在播。片段由 `/demo/index.json` 列出、`?clip=<name>` 指定（三种写法 + "真录制永远排在合成数据前"有单测：`packages/app/test/clip.test.ts`，随 `npm run check` 跑）。**但目前库里只有合成占位数据** `assets/demo/pose-synthetic.json`（程序生成，2 秒，不是录制）—— **所以现在没有真正的现场兜底** —— 断网 / 逆光 / 没人敢上台时，`?demo=1` 放出来的是一段 2 秒的程序生成数据，不是一个人。录制页已就绪（下一行），欠的只是一个站到摄像头前面的真人 |
| **`/dev/record.html` 真人 pose 录制页（T-16）** | `experimental` | 页面 UI 完整、六段录制脚本（走进→站定→挥手→蹲下→转身→走出）、定速 30Hz 采样、没人的帧记成 `world: []`（"走出画面"在数据里就长这样）。写回中间件 `/__demo` 五条路都用 curl 当场验过：正常写入 → `assets/demo/pose-writetest.json` + 自动重建 `index.json` 且真录制排到了合成数据前面（测试文件已删）；`synthetic:true` / 整段没人 / 坏片段名（`../evil`）/ GET 四条都被拒。摄像头分支只验到**报错不白屏**：浏览器面板里 `NotAllowedError: Permission denied`，headless 里看门狗 15s 后说人话（截图 `scratch/evidence/record-nocam-t16.png`）。**真正的录制没做 —— 本机有摄像头，缺的是一个站在它前面做完那六件事的真人** |
| kiosk 外壳无人降帧（`src/shell/idle.ts`） | `stable` | 无人 300s → 渲染降到 10fps，人一回来立刻满帧；采集端（webcam/replay 都改了）上报在场，鼠标键盘也算有人。手动步进 rAF 的单测证明"1 秒只跑 11 帧"而不是"打算降"（`packages/app/test/frame-loop.test.ts`、`idle.test.ts`，随 `npm run check` 跑）；`/dev/degrade.html` 上手动触发实测 fps 130 → 9.5（目标 10），记录在 `scratch/evidence/degrade-ladder-t16.log`。**阈值 300s/10fps 是 `shell/idle.ts` 的局部常量，没进 `tuning.ts`（要收口的人点头）** |
| **连续出错降级阶梯（`src/shell/degrade.ts` + `safe-frame.ts`）** | `stable` | 以前只打一行日志，现在真降：连续 N 帧出错 → 关后期（`readFlags().nopost` 翻真）→ 再错 N 帧 → 占位几何 → 再错 N 帧 → 重载（会话内最多 2 次，防重载循环）。三级在 `/dev/degrade.html` 注入"每帧抛异常"的假 tick 后逐级触发，事件日志与状态面板读数抄在 `scratch/evidence/degrade-ladder-t16.log`（`data-sb-degrade=reload`、nopost/placeholder 双真）；另有单测 `packages/app/test/degrade.test.ts`、`frame-loop.test.ts`。各级动作用 `registerDegradeHandler()` 认领，**舞台/creature 还没认领（要在 main.ts 收口时接）**，在那之前第 1/2 级只翻状态位 + 发 `sb:degrade` + 写 `<html data-sb-degrade>` |
| **`?selftest=1` 开场自检页（`src/shell/selftest.ts`）** | `experimental` | 逐条检查 WebGPU / 摄像头权限 / parts.json / demo 片段 / 本地模型，✓⚠✗ 各带一句人话；视觉按 `docs/23 §0`（等宽、两级字号、48px 安全边距、无圆角无图标）。不进主程序，主程序起不来也能开（独立 8.3KB chunk）。每条检查 8s 超时 —— **串行跑，一条挂住会把后面全部钉死在"检查中…"**（headless Chrome 的 `enumerateDevices()` 真的会挂）。实测截图 `scratch/evidence/selftest-t16.png`：parts.json ✓ 191 件/23 主题 · demo ⚠ 只有合成数据 · 本地模型 ⚠ 缺 · 摄像头 ⚠ 超时（headless）/ ✗ 权限被拒（浏览器面板） |
| `npm run kiosk` 一条命令进现场 | `stable` | = build + preview + 自动开 `/?kiosk=1`。实跑一遍：build ✓ → `http://localhost:4173/?kiosk=1` 200、`/?selftest=1` 200、`/demo/index.json` 200。`/demo/index.json` 现在由 vite 插件在 **build 时**（不只是 dev server 起来时）扫 `assets/demo/` 生成 —— 删掉它重新 build 会长回来，新机器 clone 下来直接 `npm run kiosk` 不会缺索引。另有 `npm run selftest` 直接开自检页 |
| 慢回路（代理 + 热插拔） | `spec-only` | T-17 |
| Stage / 后期 | `spec-only` | T-09 |
| 开场选择页（dither 轮播） | `experimental` | `/dev/choose.html`：6 张卡滚/选/进，`?theme=xeno` 跳过，数字键直选，空闲自动选（`?idle=6000` 验过）；截图 `scratch/evidence/choose-0*.png`。上游 `gl/` 已移植进 `src/vendor/dither-carousel/`（MIT + LICENSE 在位，`public/` 素材一张没拿）。未验：真实现场投影分辨率与触摸屏 |
| 选择页无 WebGL 降级（DOM 列表） | `experimental` | `/dev/choose.html?gl=off`：6 张卡列出、点选写 `?theme=`、键盘与自动选择照常；控制台 `mode=fallback`。真实的 context lost 分支 `Not run` |
| 形态空间排布（按 `axes` 绕质心成环） | `experimental` | `?roster=1` 下 23 个条目排成一圈（autonomous→wheelleg→patrol→field→…→orb）；旧版 parts.json 无 `axes` 时退回数组顺序，也验过 |
| Web 部署（Vercel + serverless 慢回路） | `spec-only` | T-19，检查单在 `docs/13` §6 |

## 明确还没验证的（见 `docs/09`）

U1 MediaPipe 轴向 · U2 单目深度可用性 · U3 现场灯光 · U4 material=None 的影响 · U6 主题内一致性（anchor 后）· U7 API 并发上限 · U9 目标机帧率 · U10 慢回路端到端耗时

已解决并回填：U5 bbox 约束 · U8 减面 · U11 百万面兜底 · U12 preview_render · U13 数组字段编码
