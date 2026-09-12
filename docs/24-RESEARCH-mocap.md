# 24 · 调研 · 动作捕捉精度（MediaPipe Pose）

> 2026-09-12。问题："很多地方不够准，有没有开源项目做过优化可以直接移植。"
> 规则：**每条结论指到 repo:文件或 issue 号**。查不到出处的一律标 `未证实`。
> 背景文档，不是契约。相关：`docs/04 §1 §3`（坐标与骨长）、`docs/09 U1/U2/U3`。

## 0. 先说最要紧的三件事

1. **`FILTER` 是死代码。** 全仓 grep：`packages/core/src/filter.ts` 的 `oneEuro` /
   `oneEuroVec3` 与 `tuning.ts` 的 `FILTER` **一个调用点都没有**。
   `main.ts:151` 的流水线是 `raw → mediapipeToWorld → buildSkeleton → stabilizer`，
   **中间没有任何时序滤波**。"已有 One-Euro 滤波"这句话，在代码里不成立。
   骨长稳定化只锁长度，锁不住方向抖动 —— 而方向抖动就是"手在抖"的那部分。
2. **`FILTER` 的参数量级也是错的**（见 §2）。就算接上去也会把手焊死。
3. **`assets/demo/pose-synthetic.json` 连"能不能当基准"都不用讨论了**：
   它的左前臂长度在 60 帧里从 2.2cm 变到 26.1cm（变异系数 **65.7%**，实测见 §5）。
   人体做不到这件事。它既不能校准轴向，也不能量精度。

## 1. MediaPipe 已知弱点（上游 issue，全部仍 open）

| 弱点 | 出处 | 对我们的意义 |
|---|---|---|
| world landmark 几何自相矛盾：左右膝 x 不对称（+0.195 vs −0.125），腿长不随身高缩放 | google-ai-edge/mediapipe **#4917** | 骨长中位数 + FK 正是对这条的正确回应。**我们已经做了** |
| **背身时 visibility 谎报 0.99**：拍人后脑勺，鼻/眼的 visibility 仍是 0.99 | google-ai-edge/mediapipe **#5197** | 任何基于 `visibility` 的遮挡/背身判断在背身时**静默失效**。要判背身得靠几何（肩向量叉积符号），不能靠置信度。**我们没做** |
| 反向失效：快速运动时明明看得见的关节 visibility 被钉在 0 | google-ai-edge/mediapipe **#5159** | visibility 两头都坏 → 不要做硬门限，要做**带滞回的软门限** |
| Tasks API 砍掉了 legacy 的 `smoothLandmarks`，用户报告 VIDEO 模式抖动明显变差 | google-ai-edge/mediapipe **#4507**；官方 web 指南的配置项里确实只剩三个 confidence 阈值 | 我们用的正是 Tasks API。**上游帮我们做的平滑已经没了**，自己补不是可选项 |
| 多人靠太近（3.5m 处相距 ~75cm）时低置信度的那个人直接被取消，且 API 不给 track id | google-ai-edge/mediapipe **#4681** | `numPoses: 1` 正好躲开。要提就得自己写 IoU 跟踪器 |
| 模型卡自己声明的 out-of-scope：多人、**超过 4 米**、头不在画面里、**需要度量级深度的应用** | `pose_model_card.pdf` p.3 | 现场地面位置线要保证观众在 4m 内、头在画面里。**"深度不准"是 Google 自己写下的，不是我们的 bug** |
| world z 来自把合成 GHUM 模型拟合到 2D 标注，"not metric, up to scale" | 同上 p.2；BlazePose GHUM 论文 arXiv:2206.11678 | z 的误差是**结构性的**，不是噪声。滤波治不了它，只有先验（骨长、IK）能治 |
| 训练数据里深度前后关系本身就错 25%，专门标注一轮之后才降到 3% | arXiv:2206.11678 | 连监督信号都弱。任何拟合里 z 都该比 x/y 权重低 |

## 2. 可以直接移植的后处理

### 2.1 One-Euro 参数（本次最有用的一条）

MediaPipe **自己的产线图**对三路信号用三组参数，`geaxgx/depthai_blazepose`
的 `BlazeposeDepthai.py` 独立复刻了同一组数：

| 信号 | min_cutoff | beta | derivate_cutoff | 备注 |
|---|---|---|---|---|
| 屏幕归一化 landmark | 0.05 | 80 | 1.0 | |
| **world landmark** | **0.1** | **40** | **1.0** | `disable_value_scaling: true` |
| ROI / auxiliary | 0.01 | 10 | 1.0 | |
| visibility 本身 | `LowPassFilter alpha: 0.1` | | | 置信度也要低通 |

出处：`mediapipe/modules/pose_landmark/pose_landmark_filtering.pbtxt`。
调参顺序写在 `mediapipe/calculators/util/landmarks_smoothing_calculator.proto` 的注释里：
**"先固定 beta=0 调 min_cutoff，再抬 beta 消滞后"**（Casiez 原文的流程）。

> **`tuning.ts` 的 `FILTER`（minCutoff 1.0 / beta 0.02）和这组数差三个量级。**
> 不是谁抄错了：One-Euro 的 beta 乘的是速度，速度的单位跟着信号走。
> 0.02 那组是像素/归一化坐标的量级；world landmark 是**米**。
> 手以 1 m/s 挥动时，beta=0.02 只把截止频率抬到 1.02 Hz —— 等于把手焊死。
> `disable_value_scaling: true` 说的就是同一件事：米制信号不要再按像素尺度缩放 cutoff。

信号本身已经是归一化/米制时，别人用的又是另一组数，可以当交叉验证：
`open-mmlab/mmpose` 0.x `configs/_base_/filters/one_euro.py` = `min_cutoff 0.004 / beta 0.7`
（实现在 `mmpose/core/post_processing/temporal_filters/one_euro_filter.py`，
标了 `_shareable=False` —— **每个被跟踪的人一份滤波器状态**，不能共用）；
`perfanalytics/Pose2Sim` 的 `Config.toml` = `cut_off 4.0 / beta 1.5`。

**没有任何一个 repo 做按关节分组的 One-Euro。** 上游分的是"屏幕/世界/ROI"三路信号，
不是按关节分。我们的 torso/limb/extremity 三档是**自创**，所以它必须被
`/dev/accuracy.html` 量出来才算数（见 §5：目前还量不出来）。

### 2.2 其它滤波（大部分不适用，但值得知道为什么）

| 方法 | 出处 | 参数 | 结论 |
|---|---|---|---|
| 零相位 Butterworth（`filtfilt`），生物力学的标准做法 | Pose2Sim `Config.toml [filtering]` | **6 Hz / 4 阶**（慢动作 3–6、跑步 6–15） | 非因果，实时用不了。但 **"人体运动只需要 6Hz 带宽"** 是个有用的判据 |
| Savitzky-Golay | mmpose 0.x `configs/_base_/filters/savizky_golay.py` | `window 11 / polyorder 2` | 同上，离线 |
| Kalman + RTS 平滑 | Pose2Sim `Config.toml` | `trust_ratio 500` | One-Euro 的**替代**不是补充。已有 One-Euro 就不值得换 |
| **Hampel 剔野值 + 缺口插值** | Pose2Sim `Config.toml [triangulation]` | **`interp_if_gap_smaller_than = 20` 帧**，超过就不插 | **这是"遮挡补全"的现成答案，还带一个具体数字。我们缺** |
| SmoothNet（学出来的时序精修） | cure-lab/SmoothNet README | 窗口 32 | 加速度误差 33.19→4.17，但 **MPJPE 几乎不变**，且**没有 ONNX 导出**。浏览器跑不了，放弃 |
| `gaus1d / oneeuro / savgol / smoothnet` 四件套 | open-mmlab/mmhuman3d `docs/getting_started.md` | — | 说明这四个就是业界的全集，没有第五种魔法 |

> mmpose 1.x **删掉了**这些滤波（issue #2726），上面的路径只在 `0.x` 分支有。

### 2.3 骨长 / IK / 关节角

| 方法 | 出处 | 我们的状态 |
|---|---|---|
| 恒定骨长 + IK 拟合，对抗单目 z 漂移 | Pose2Sim README（自动缩放 + OpenSim IK） | **已做**（`stabilize.ts` 中位数 + FK） |
| **解算后对关节角做硬钳位** | `yeemachine/kalidokit` `src/PoseSolver/calcArms.ts`：上臂 X ∈ [−0.5, π]，**下臂 X ∈ [−0.3, 0.3]（肘反折保护）**，下臂 Z ∈ [−2.14, 0]，手 Y ∈ [−0.6, 0.6] | **缺**。但见下面的警告 |
| 生物力学 ROM + 时序优化 IK | `KevGildea/KinePose` | 不用 MediaPipe（YOLOv8+MotionBert），移植成本高。只当参考 |
| 只信**一个**根锚点的深度，绝不逐末端取深度 | `geaxgx/depthai_blazepose` README：推断出来的关键点常落在对齐深度图的物体之外，"尤其是末端"，逐点取深度"实践中不是好主意" | **已做**（落地平移就是单锚点的单目版） |

> ⚠️ **kalidokit 的钳位不能照抄。** 它钳的是解算出来的**欧拉角**，隐含了屈曲轴的朝向；
> 我们 v1 没有 roll（`docs/04 §5`），无符号夹角对"正常弯 30°"和"反着弯 30°"给出同一个数。
> 照抄会得到一个**看起来在工作、实际随机生效**的约束。
> 所以 `core/refine.ts` 的 `clampFold()` 只做**最小折叠角**（挡住"手臂折成一根针"这类崩溃），
> 反折留给 v2 —— 它真正的前置条件是 roll，不是一个更聪明的钳位公式。

## 3. 换模型：这是最便宜的一档

官方 model card（`pose_model_card.pdf` p.7）+ arXiv:2206.11678 Table 1：

| | lite | full | heavy |
|---|---|---|---|
| 体积 | 3 MB | 6 MB | 26 MB |
| Pixel 3 TFLite GPU | ~49 FPS | ~40 FPS | ~19 FPS |
| PDJ（PCK@0.2） | 90.3–95.4 | 94.6–97.8 | 97.4–99.0 |
| **3D MAE（yoga，17 点）** | **45 mm** | **39 mm** | **36 mm** |

- lite→full：2D 指标 +4 点，3D 误差 45→39mm，GPU 代价约 +20%。**一个字符串的事。**
- lite→heavy：3D 只再好 3mm，GPU 掉一半。注意 **3D 的改善远小于 2D** ——
  因为 z 受限于 GHUM 拟合出来的真值，不是受限于模型容量（§1）。
- 网上流传的 Yoga/Dance/HIIT mAP 表：**未证实**，我们没在官方来源里找到。

已做：`?model=lite|full|heavy`（`shell/kiosk.ts` + `capture/webcam.ts`）。
默认仍是 lite —— 目标机器的 GPU 余量还没压测过（U9）。

**RTMPose / onnxruntime-web：不建议。**
`open-mmlab/mmpose` `projects/rtmpose/README.md` 的数字很好看（RTMPose-t 68.5 AP / 3.2ms CPU），
但它是**纯 2D、17 个 COCO 点，没有 z、没有脚、没有手**。要用就得再接一个 3D lifter
和一个人体检测器（RTMDet），我们真正需要的那一半反而丢了。
浏览器部署确实存在（`konyshevgmbh/pose_estimation_flutter` 用 RTMPose-t ONNX，
`FatemeZamanian/YOLOv8-pose-onnxruntime-web`），但**没有一个给出浏览器里的实测延迟**：
任何"能跑多少帧"的说法目前都是猜。加 onnxruntime-web 是一条新运行时依赖，
按 AGENTS 的规矩要先停下来报告 —— 而以上证据不足以支撑那次报告。

## 4. 查过但没用的

- `digital-standard/ThreeDPoseTracker`：自家 ONNX + Unity Barracuda，**不用 MediaPipe**，已停维护。
- `Kazuhito00` / `PINTO0309`：是手部追踪与 TFLite→ONNX 转换（`PINTO_model_zoo`），不是姿态后处理。
- `ButzYung/SystemAnimatorOnline`（XR Animator）：确实是浏览器里的 MediaPipe→VRM 项目、确实用 One-Euro，
  但**参数值没拿到** —— 标 `未证实`。

## 5. 我们这边量到了什么（以及量不到什么）

工具：`/dev/accuracy.html`（A 原始 / B 现有 / C 新 三路并排 + 离线重跑）。

在**唯一存在的输入** `assets/demo/pose-synthetic.json`（60 帧 / 2.0s）上离线重跑：

| 路 | 逐帧位移 RMS (mm/帧) | 仅 Z | 骨长变异 σ/μ 均值 | 最差骨头 | 跟随偏差 (mm) |
|---|---|---|---|---|---|
| A 原始 | 5.96 | 0.00 | 5.83% | foreArmL 66.3% | — |
| B 现有 | 6.12 | 0.62 | 5.40% | foreArmL 64.3% | 5.5 |
| C 新 | 6.08 | 0.62 | 5.48% | foreArmL 64.1% | 7.9 |

**这组数字证明的不是"C 没用"，而是"这段输入测不了精度"：**

- 合成片段的 **z 恒为 0**（逐帧位移的 Z 分量在 A 路就是 0.00）。深度那一维根本不存在。
- 合成片段**没有噪声** —— 它是一条光滑的 2 秒挥手循环。没有噪声，降噪当然测不出收益，
  只测得出代价（C 比 A 迟 7.9mm）。
- 合成片段的**骨长本身就不守恒**：左前臂 0.022m → 0.261m，变异系数 65.7%
  （`node`/`python` 直接读文件复算，与页面一致）。真人做不到，MediaPipe 也抖不到这个程度
  （`docs/04 §3` 说的是 ±15%）。

所以：**在有真人录制之前，"改进前后"没有可信的对比。** 这不是工具的缺陷，
是输入的缺陷 —— 而工具的价值恰恰是把这件事在一屏之内证明出来。

滤波器本身的降噪能力另有一条可复现的表征（不是姿态基准，是受控信号）：
`packages/core/test/refine.test.ts` 用固定伪随机序列注入 ±2cm 噪声，
默认档（MediaPipe world 参数）把噪声功率降到 **< 0.6 倍**。
这只说明"滤波在工作"，**不说明**它在真人身上抖多少毫米。

### 还是测不到（需要真人 / 现场）

`docs/09` 的 **U1 轴向 / U2 深度可用性 / U3 现场灯光**三条一条都没动；
再加上：MPJPE（没有真值）、遮挡与侧身背身表现（合成数据里没有遮挡）、
lite vs full 的真实差异（换档开关有了，缺一段真人输入跑两次）。
这些在 `/dev/accuracy.html` 右下角常驻列出，**故意留空**（P17）。
