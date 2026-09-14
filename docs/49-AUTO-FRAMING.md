# 49 · 自动取景（auto framing）—— 它叫什么、怎么做的、这件作品该不该要

> 2026-09-14。研究线，**没有改任何代码**。回答作品负责人的三个问题：
> ① Zoom / Meet 那种"人往边上走、画面跟过去把人留在中间"的功能到底叫什么；
> ② 有没有开源实现可以拆来看；③ 在 SEE-ME SEE-U 里做它合不合理。
>
> 标记：**[一手]** = 厂商文档 / 规范 / 源码；**[二手]** = 博客、社区帖、评测；
> **[未验证]** = 找过但没找到一手来源。源码条目是抓取 GitHub / googlesource 原文后读的，
> 引到的函数名与参数名来自原文，但**没有在本机编译或逐行复核**。

---

## 0 · 一句话结论

这类功能的通用名是 **auto framing / 自动取景**（Apple 叫 Center Stage，W3C 叫 `faceFraming`）。
它绝大多数是**数字裁切**：传感器拍得比输出宽，软件在里面挪一个小窗口；只有云台摄像头才真的转。
**它帮不了"人已经出画"**——裁切窗口不能伸到传感器外面去，而这件作品的问题恰恰是整个人（含脚）进不进画。
所以：**不要给 MediaPipe 的输入做自动取景**；左上角小屏幕的"跟随放大"可以以后再看；
**现在就该做的是反过来——现场把操作系统和摄像头自带的自动取景关掉**，因为它们对准的是**脸**，会把腿裁掉。

---

## 1 · 叫什么、各家怎么做

### 1.1 分类

| 做法 | 原理 | 代价 | 能不能救"出画" |
|---|---|---|---|
| **数字裁切（digital crop / digital window）** | 超广角或高分辨率传感器拍全景，软件裁一个窗口放大输出 | 窗口越小越糊；需要检测模型持续在跑 | 不能。只能在传感器视野**之内**挪 |
| **机械云台（motorised PTZ / gimbal）** | 电机真的转镜头 | 专门硬件；移动有延迟和噪声 | 能，在云台行程内 |
| **一次性取景（one-shot）** | 开始时框一次，之后不动 | 最便宜，不分散注意力 | 不能 |

### 1.2 各家叫法与实现

| 产品 / 名字 | 做法 | 需要什么 | 普通摄像头能用吗 | 网页能拿到吗 | 来源 |
|---|---|---|---|---|---|
| **Apple Center Stage** | 超广角前摄 + 人脸检测，数字裁切跟随 | 支持的 iPad / iPhone 17 系、MacBook Pro 2024+ / MacBook Air 2025+ / iMac 2024+、Studio Display；或 iPhone 11+ 做 Continuity Camera | 否（要超广角硬件） | 系统级：用户在控制中心打开后**对所有 app 生效**（`centerStageControlMode` 有 user / app / cooperative 三档）；网页没有专门的开关 | [一手] [Apple 支持](https://support.apple.com/en-us/111102)、[`CenterStageControlMode`](https://developer.apple.com/documentation/avfoundation/avcapturedevice/centerstagecontrolmode-swift.enum) |
| **Zoom（桌面客户端）"Auto framing"** | 软件裁切；有 Group / Individual 两档 | 客户端里 Settings › Video & effects | 是（软件） | 否 | [二手] [社区](https://community.zoom.com/meetings-2/video-auto-framing-glitch-18984)、[askdavetaylor](https://www.askdavetaylor.com/get-starting-using-auto-framing-in-zoom-meetings/)。**客户端这一项没找到 support.zoom.com 的一手文章** |
| **Zoom Rooms** Auto-Framing / Speaker Focus / Multi-Focus / **Intelligent Director** / Boundary Framing | 会议室模式；部分模式在认证摄像头硬件里跑，Intelligent Director 用多台摄像头选最佳画面 | Zoom Rooms 认证摄像头，部分模式要 presets | 部分 | 否 | [一手] [Zoom KB0073484](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0073484) |
| **Google Meet "Framing"**（网页版） | 浏览器里跑的软件裁切。**不用虚拟背景时只框一次、不再跟**；用虚拟背景时持续居中 | Chrome / Edge M91+、WebGL、硬件加速 | 是 | 是 Meet 自己在页面里做的，不是对外 API | [一手] [Meet 帮助](https://support.google.com/meet/answer/9302964?hl=en&co=GENIE.Platform%3DDesktop)、[Workspace 博客 2024-11](https://workspaceupdates.googleblog.com/2024/11/google-meet-automatic-framing-virtual-background-improvements.html) |
| **ChromeOS auto-framing / Meet 硬件** | ChromeOS 相机服务里的 `AutoFramingCrOS`（闭源引擎）；Logitech Rally Bar 系列在机内做连续取景 | 支持的 Chromebook / 会议室硬件 | 否 | 否 | [一手] [platform2 源码](https://chromium.googlesource.com/chromiumos/platform2/+/HEAD/camera/features/auto_framing/)、[Workspace 博客 2025-04](https://workspaceupdates.googleblog.com/2025/04/continuous-framing-logitech-series-one-room-kits-google-meet.html) |
| **Windows Studio Effects "Automatic Framing"**（Teams 等所有 app 吃到的就是它） | NPU 上跑，挂在摄像头驱动链末尾；"检测到人就裁切/放大"。对 app 暴露为 KS 属性 `KSPROPERTY_CAMERACONTROL_EXTENDED_DIGITALWINDOW` 的 `AUTOFACEFRAMING` 标志 | Windows 11 22H2+、受支持 NPU、OEM 装了 Studio Effects 驱动；目前只管前置摄像头 | 否（要 NPU） | Chromium 已把 `faceFraming` 映射到这个属性（见 1.3）。**打开后对所有 app 默认生效** | [一手] [Studio Effects](https://learn.microsoft.com/en-us/windows/apps/develop/windows-integration/studio-effects)、[DIGITALWINDOW](https://learn.microsoft.com/en-us/windows-hardware/drivers/stream/ksproperty-cameracontrol-extended-digitalwindow)。Teams 自己另有的取景功能**[未验证]** |
| **NVIDIA Broadcast "Auto Frame"** | GPU 上跟踪头部，裁切并放大；出一路虚拟摄像头 | GeForce RTX 2060+ | 是（摄像头随便，GPU 不随便） | 只能当虚拟摄像头被选中 | [一手] [NVIDIA 页面](https://www.nvidia.com/en-us/geforce/broadcasting/broadcast-app/) |
| **Logitech RightSight** | 会议室机型（Rally / MeetUp）上：检测参会者 + 机械 PTZ 或数字裁切 | Logitech 会议摄像头 | 否 | 否 | [二手] [Logitech 设计博客](https://medium.com/logitech-design-guide/rightsight-technologies-explained-266df3263faf)、[Logi 支持](https://support.logi.com/hc/en-my/articles/20713215679511-What-is-RightSight) |
| **OBSBOT Tiny / Insta360 Link** | 两轴云台 + 机内 AI 跟踪；变焦是数字的 | 这台摄像头本身 | 否 | 跟踪在固件里；PTZ 能否被网页控制取决于它报不报 UVC 绝对 PanTilt（**逐台[未验证]**） | [二手] [评测对比](https://www.essentialphoto.co.uk/blogs/obsbot/obsbot-tiny-2-vs-insta360-link-hd-1080p-smart-webcam-battle) |

### 1.3 网页平台上现在能拿到什么

| 接口 | 现状（2026-09） | 对我们意味着什么 | 来源 |
|---|---|---|---|
| `faceFraming` 约束（`getCapabilities` / `applyConstraints`） | 写在 **Media Capture Extensions** 草案里（W3C 非正式提案）。Chrome Platform Status：**In development / prototyping**，没有 origin trial、没有发布里程碑；Intel 提的，Apple / Mozilla 口头支持。Chromium Windows 采集层已把它映射到 `DIGITALWINDOW_AUTOFACEFRAMING`（`video_capture_device_mf_win.cc`） | **稳定版浏览器上拿不到**。即使拿到，它也是"裁到**脸**"——规范原话就是 cropping to human faces，不适合全身 | [一手] [规范](https://w3c.github.io/mediacapture-extensions/)、[chromestatus 5129939115835392](https://chromestatus.com/feature/5129939115835392)、[Intent to Prototype](https://groups.google.com/a/chromium.org/g/blink-dev/c/LyQu9L_Iv58)、[Chromium 源码](https://chromium.googlesource.com/chromium/src/+/main/media/capture/video/win/video_capture_device_mf_win.cc)、[explainer](https://github.com/riju/faceFraming/blob/main/explainer.md) |
| `VideoFrameMetadata.backgroundBlur`（只读"系统特效开着没"） | chromestatus：in development，桌面 M134 列为首发目标；说明里写了以后扩到 auto face framing | 以后**可能**能从网页侧知道"系统在帮倒忙"。今天不能依赖 | [一手] [chromestatus 5098450535055360](https://chromestatus.com/feature/5098450535055360) |
| `pan` / `tilt` / `zoom` 约束 | Chrome 87 起桌面可用（Android 只有 zoom）；要求摄像头报 UVC **PanTilt (Absolute)** / **Zoom (Absolute)**，相对控制不支持；权限框多一项"控制摄像头移动"；页面不可见时拒绝。Firefox / Safari 不支持 | 普通笔记本内置摄像头基本没有；C920 这类只有数字变焦 [二手]；要看某台有没有，打开 `about://media-internals` 的 Video Capture 页 | [一手] [web.dev](https://web.dev/articles/camera-pan-tilt-zoom)；浏览器支持 [二手] [Dynamsoft](https://www.dynamsoft.com/codepool/camera-zoom-control-on-web.html) |

---

## 2 · 它是怎么做的：通用流水线 + 拆开的四份源码

### 2.1 通用流水线

```
检测（脸 / 身体 / 物体）→ 目标框（边距、宽高比）→ 死区 + 滞回 → 平滑（PID / 弹簧 / lerp / One Euro）
→ 缩放上下限 → 夹进传感器边界 → 裁切重采样（或发给云台电机）
```

真正决定"好不好用"的全在中间三步：**死区**让人小动时画面不动（否则晕），
**平滑**让大动时画面追得像摄影师而不是像弹簧，**夹边界**让窗口永远不露出画外的黑边。

### 2.2 拆开看的实现

| 项目 | 许可 | 看的文件 | 检测 | 平滑与约束（原文里的写法） |
|---|---|---|---|---|
| **norihiro/obs-face-tracker**（OBS 插件：Source / Filter / PTZ 三种形态） | GPLv2 [一手 README] | [`src/face-tracker.cpp`](https://github.com/norihiro/obs-face-tracker/blob/main/src/face-tracker.cpp)（`calculate_error` / `tick_filter` / `ensure_range`）、`src/face-tracker-ptz.cpp`、[`doc/properties.md`](https://github.com/norihiro/obs-face-tracker/blob/main/doc/properties.md) | dlib 人脸检测**隔一段跑一次**，中间用 dlib 相关跟踪器 | 误差 `e = (目标框 − 当前窗口) × score`，三维（x、y、**z = 尺寸**）。**PID**：Kp、Ki、Td，Td 前面有一阶低通。**死区 + 非线性带**：`|x| ≤ d → 0`；`d < |x| < d+n → (|x|−d)² / 2n`（二次过渡接到线性段，没有台阶）；z 轴另有衰减系数让缩放比平移慢。`scale_max` 限最大放大；`ensure_range` 把窗口夹在源画面内。**是四份里最完整的一份** |
| **royshil/obs-detect** | GPL-2.0 [一手 README] | [`src/detect-filter.cpp`](https://github.com/royshil/obs-detect/blob/master/src/detect-filter.cpp) | EdgeYOLO 物体 / YuNet 人脸 + **SORT** 多目标跟踪；可选 single / biggest / oldest / all（并集） | 目标框按画面宽高比外扩，`zoomFactor` 决定留白；每帧 **lerp**：`rect += zoomSpeedFactor × (target − rect)`，跟丢时系数 ×0.2（慢慢停）。**没有死区，也没有夹边界**（按帧率变的 lerp 也不是帧率无关的） |
| **hamidzr/webcam-mods** | GPL-2.0 [一手 README] | [`src/webcam_mods/entry.py`](https://github.com/hamidzr/webcam-mods/blob/master/src/webcam_mods/entry.py)、`geometry.py` | MediaPipe 人脸，Python，输出到 v4l2loopback / pyvirtualcam | 脸框外扩 x×2、y×2.5 后裁切；检测失败沿用上一帧的框。**没有平滑、没有死区**——README 说的"smooth"在这两个文件里找不到 |
| **ChromiumOS `auto_framing_client.cc`**（Google 自家） | BSD 风格 [一手源码头] | [`camera/features/auto_framing/auto_framing_client.cc`](https://chromium.googlesource.com/chromiumos/platform2/+/HEAD/camera/features/auto_framing/auto_framing_client.cc) | 调闭源的 `AutoFramingCrOS` 引擎；检测输入缩到 **569×320 灰度**，按 `detection_rate` 节流 | 输入输出都是 0–1 归一化的 ROI 与裁切窗口；`kCropWindowStabilizationPeriod = 1s`。**真正的平滑算法在闭源引擎里，看不到** |

另外两份是"接口层"而不是算法：Chromium Windows 采集层把 `faceFraming` 翻成
`KSCAMERA_EXTENDEDPROP_DIGITALWINDOW_AUTOFACEFRAMING`（算法在 Windows Studio Effects 里，闭源）；
Windows 的 `DIGITALWINDOW` 结构本身就是一个 Q24 定点的 `OriginX / OriginY / WindowSize`——**所有平台最后都收敛到"一个归一化的方窗口"这一个数据结构**。

**许可提醒**：前三份是 GPL。拿来**读思路**没问题，**不抄代码**。要用的那部分（死区 + 非线性带 + 帧率无关平滑 + 夹边界）五十行以内，
`packages/core/src/filter.ts` 里已经有 `oneEuro` / `emaAlpha`。

---

## 3 · 放进这件作品：分三种用法说清楚

我们每一次推理都已经有 33 个点的 `RawPose.screen`（0–1 图像坐标），检测这一步是白送的。
问题是**裁谁**。

| 用法 | 它会做什么 | 帮到什么 | 伤到什么 | 判断 |
|---|---|---|---|---|
| **A · 裁 MediaPipe 的输入** | 在 `detectForVideo` 之前把 1280×720 裁成跟着人走的小窗 | 人离得很远、在画面里很小时，**检测器**（224×224 看整幅）也许更容易先找到人 [一手：[BlazePose GHUM model card](https://arxiv.org/pdf/2206.11678) 的输入尺寸] | ① **不增加关节模型的像素**：PoseLandmarker 本来就是 detector → 从上一帧关节推 ROI → 在 ROI 上跑 256×256 的关节模型 [一手：[MediaPipe Pose 文档](https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/pose.md)]，它已经在自己裁了。② **反馈环**：裁切跟着检测走、检测吃裁切后的图；一帧检错 → 窗口挪歪 → 下一帧更容易错。③ **救不了出画**，反而会把"快出画"藏起来。④ `screen` 坐标要反算回原图，preview 骨架、`outOfFrame()`、WRN12 都要跟着改——而 `capture/webcam.ts` 现在是另一条线（docs/48）在动 | **不做** |
| **B · 只裁左上角小屏幕的显示** | 推理照旧看全图；小屏幕里用 CSS transform（或 `drawImage` 子矩形）把人放大居中 | 装置用广角镜头、观众站 2.5–3m 时，168×126 的小屏里人只有一小条；放大后"骨架贴在我身上"更看得清 | 小屏幕存在的**唯一理由**是回答"它有没有看见我"（`ui/preview.ts` 文件头）。跟随居中会让一个**已经半个人出画**的观众在小屏里看起来依然居中——正好删掉「往后退一点，整个人进画面」那句话的证据。所以只能在**画内且质量好**的时候放大，一出现 `outOfFrame` / WRN12 / 质量不够就**退回 1×**，让画框边缘重新可见 | **以后再说**，要现场证据先说明小屏里人太小 |
| **C · 舞台相机跟着人** | 身体在世界里左右走，相机平移跟过去 | 观众走到画面边上时身体不出屏 | `stage/framing.ts` 的第一条主张是**等身 + 相机距离不动**（"现场地面上是贴了位置线的"）。这是一面镜子：人往左走，身体就该往左走；相机一跟，这个位移就被抵消了，镜像的因果变弱。身体会不会出**屏**应当由取景的有限插值和站位线管，不由跟随管 | **不做** |

### 3.1 真正会伤到我们的是"系统自带的自动取景"

上面的表格里所有平台方案都对准**脸**（Center Stage、Studio Effects 的 `AUTOFACEFRAMING`、`faceFraming` 规范原话、NVIDIA 的"track your head"、云台摄像头的人脸跟踪）。
而 PoseLandmarker 要的是**整个人包括脚**。任何一种在我们上游打开，结果都一样：

- 观众一动，送进 MediaPipe 的画面就被悄悄裁到半身 → 腿出画 → WRN12 / 「往后退一点」在观众没动的时候亮起；
- 画面缩放在变 → `screen` 坐标系在变，但我们以为它是固定机位；
- 在 macOS 上它是**用户在控制中心开的、对所有 app 生效**，在 Windows 上是**设置里开的、对所有 app 默认生效**——页面里什么都不改，现场就坏了；
- 网页侧今天**检测不到**（`faceFraming` 与特效状态元数据都还没发布，见 1.3）。

这对 kiosk 是一个现场检查项，对网页观众是一个无法控制的风险（只能在「站到亮一点的地方 / 往后退一点」之外，无从提示）。

### 3.2 kiosk 与网页观众

| | kiosk（`npm run kiosk`，固定机位） | 网页观众（笔记本内置摄像头） |
|---|---|---|
| 视野 | 可以选广角镜头、站位线在地上 | 窄、近，经常只拍到上半身 |
| 自动取景的意义 | 小屏放大（用法 B）也许有点用 | 问题是**画幅不够宽**，裁切只会更窄——无意义 |
| 系统自动取景的风险 | 可控：开机前关掉 | 不可控：Center Stage 机型、Studio Effects 机型上可能默认或被用户打开 |
| 硬件 PTZ | 可以买一台报 UVC 绝对 PanTilt 的云台，但 Chrome 会多一次权限、页面不可见时拒绝；而且云台一动，"固定机位 + 地面站位线"这个前提就没了 | 基本没有 |

### 3.3 代价

- 用法 B：一个 CSS `transform` 写到已经在 DOM 里的 `<video>` 和骨架画布的共同容器上，4Hz 以下更新也够——**帧时间可忽略**，不碰采集。
- 用法 A：每次推理多一次 `drawImage` 到 OffscreenCanvas 再交给 MediaPipe，多一次 GPU 上传；而且要改 `capture/webcam.ts`，与正在进行的相机平滑线（docs/48）撞同一个文件。**本文不建议、也没有碰那个文件。**
- 附注：本机 `@mediapipe/tasks-vision@1.0.1` 的 `vision.d.ts` 里 `PoseLandmarker.detectForVideo` **接受** `ImageProcessingOptions`（含 `regionOfInterest`），但同一文件里 ImageSegmenter 的注释明写 ROI "NOT supported and will result in an error"。PoseLandmarker 是否真的认 ROI **[未验证]**——若以后真要做 A，应先试这个参数，而不是自己裁图。

---

## 4 · 计划（如果要做）

### 阶段 0 · 现在，零代码：把系统自动取景关掉，写进现场表

- `docs/38-RUNNING-THE-PIECE.md` 的开机检查、`docs/46-FIELD-CHECK.md` 的"开始之前"各加一行：
  macOS 控制中心 › 视频效果 › **Center Stage 关**；Windows 设置 › 相机 › Studio Effects › **Automatic Framing 关**；
  不用 NVIDIA Broadcast 虚拟摄像头；云台摄像头（OBSBOT / Insta360）**关人脸跟踪、锁定云台**。
- 检查方法：站到画面一侧慢慢走，左上角小屏里的**背景**不应该跟着动。背景动了 = 上游有人在裁。

### 阶段 1 · MVP：只作用于小屏幕的跟随放大（用法 B），默认关

触发条件：现场检查表里有人写"小屏里我太小，看不清骨架贴没贴"。

| 放哪 | 做什么 |
|---|---|
| `packages/core/src/autoframe.ts`（纯函数，不碰 window） | `frameTarget(screen, aspect, opts) → {cx, cy, size}`：取可信点包围盒 + 边距；任何出画 / 质量不够 / 没人 → 返回 `size = 1` 的全图窗口。`stepFrame(cur, target, dt, opts)`：死区（窗口中心差 < `deadZone` 不动）+ 非线性带（照 obs-face-tracker 的二次过渡）+ **帧率无关**的临界阻尼弹簧（或 `emaAlpha(dt, τ)`）；缩放比平移慢；最后夹进 [0,1] |
| `packages/core/src/tuning.ts` 新增 `AUTOFRAME` | `enabled`（默认 false）、`margin`、`maxZoom`（建议 ≤ 1.6，小屏上再放大就糊）、`deadZone`、`band`、`panHalfLife`、`zoomHalfLife`、`releaseToFullOnWarn: true` |
| `packages/app/src/ui/preview.ts` | 每帧把 `stepFrame` 的结果写成 `.sb-see-screen` 内层的 `transform`；镜像类照旧加在外层。`?autoframe=on\|off` 按 `?preview=` 的规矩判值 |
| 测试 `packages/core/test/autoframe.test.ts` | 死区内窗口一动不动；60Hz 与 20Hz 步进到同一时刻窗口差 < ε（帧率无关）；任何输入下窗口不出 [0,1]；`outOfFrame ≥ PREVIEW.outOfFramePoints` 时一定回到 1×；**用真录制 `assets/demo/pose-walkturn.json` 数窗口大跳次数**（照 `preview-state.test.ts` 数"说法变了几次"的做法） |

### 阶段 2 · 只有证据要求时：推理输入 ROI（用法 A）

前提是**现场录到**"人远到检测器找不到"的片段。先试 `detectForVideo(video, t, { regionOfInterest })`，在 `/dev/accuracy.html` 上对同一段录制比较检出率与关节 CV；
必须等 docs/48 那条线落地之后再碰 `capture/webcam.ts`；`screen` 坐标的反算只许在一处发生。

### 建议：**阶段 0 现在做；阶段 1 以后再说；阶段 2 和舞台跟随不做。**

这件作品需要的是"整个人进画"，而自动取景解决的是"脸在不在中间"——它是给已经在画里的人**缩小**视野的技术，对一个要看脚的系统，它最多是在小屏幕上的锦上添花，最坏是在上游悄悄把腿裁掉。
我们手上已经有每一帧的全身关节，所以真要做，成本很低（一个纯函数 + 一个 CSS transform），但小屏幕的职责是说真话，跟随放大必须在任何告警时让出位置，而这一点只有现场观众告诉我们"看不清"时才值得付。
真正该立刻付的代价是一行现场检查：Center Stage、Studio Effects、Broadcast 和云台自带的跟踪，任何一个在上游开着，都会让「往后退一点」在观众没动的时候亮起来，而网页侧今天还看不见它们。

---

## 5 · 落地（2026-09-14，同日第二轮：作品负责人改了方向）

> 上面 §0–§4 是研究线的结论（"舞台不跟随、小屏以后再说"）。同一天作品负责人看过之后给了新方向：
> **自动取景适合我们** —— 只露上半身是正当的，下半身站着不动、上半身照常动；
> 人一退后（想被看见全身）就切回全景；只露上半身、或者有人要调某个模式时开自动取景。
> 下面是照这个方向落地的版本。§3 表里"用法 A 不做"这一条**没有变**，其余两条按下面的裁定改。

### 5.1 原则

**一、首要观众。** 网页上最常见的观众是**笔记本前只露头、肩、胯的人**，所以网页的默认必须让"上半身"看起来是有意为之、而且好看。
装置的首要观众是**站在站位线上的全身观众**，所以现场**全身优先**（仍然是 `auto`，但进中景要憋 3 秒，网页 1 秒；人刚出现时网页只憋 0.35 秒）。
「你的身体在驱动它」这一条主张两种观众都成立 —— 上半身的人驱动上半身，下半身站着不是在撒谎，是在说"这一半没有读到"。

**二、判据只在输出侧。** 分类器读 MediaPipe 在**整幅**画面上给的可见度和位置；它的结论只改四件事：舞台景别、腿、小屏裁切、引导。
采集端一个像素都不动（§3 用法 A 的反馈环照旧成立）。

**三、切得快，但不来回跳。** 所有"连续成立多久"都是**漏桶**（成立一帧加一帧，不成立一帧扣两帧）：门限上 50/50 颤动的证据永远攒不满，
真变化 1 秒内切过去。每次切换后 1.2 秒冷却；两种切换不等冷却 —— 头肩被切（诚实优先）和"退后完成"（不惩罚照做的人）。

**四、看得见。** 操作员：`?debug=1` 的 HUD 多两行 `framing`，模式、理由、在模式里的秒数、膝踝数与门限、尺度趋势与门限、头肩出画数、冷却；非全身时整行变琥珀色。
工作台：`/dev/framing.html` 画 33 个点（实心 = 可信）和最近 20 秒的模式时间线，没有摄像头时播和 node 测试同一段合成时间线。
观众：**不加字**。中景本身就是那个提示 —— 镜头推近到上半身，读得出"它知道你只露了上半身"；小屏在上半身里轻轻放大跟着你。
（考虑过第一次进上半身时出一句双语提示，否决：作品负责人不喜欢冗余提示，而这件事画面已经说了。）

**五、"等身"的一处例外，登记在案。** `stage/framing.ts` 文件头那条主张写的是全景。上半身模式下画面收成中景：**同一个机位、同一个距离，只收窄视野**
（fov 变小，不推相机；画面高 = 身高 × 0.64，人形约放大 2.2 倍）。例外只在人形上成立（身体方案一开始漂移就给全景），人一退后就恢复；
`test/framing-mode.test.ts` 钉住中景插值在 t = 0 时和等身全景**逐字相同**。裁定写进了 `stage/framing.ts` 的 `upperFit()` 注释。

### 5.2 模式

| 层 | 值 | 谁决定 | 意思 |
|---|---|---|---|
| 分类器状态 | `full` | `core/src/autoframe.ts` | 膝踝在画里（或者还没有证据：开机、人走了 4 秒） |
| | `upper` | 同上 | 头肩在画里、膝踝持续不在（≤ 1 个） |
| | `stepping-back` | 同上（过渡态） | 上半身时膝踝开始冒出来（≥ 2 个），或者**肩宽与躯干同时**比 0.8 秒窗口里的最大值缩了 12%。舞台立刻给全景，腿先别放开；腿进画 0.5 秒 → `full`；3 秒没结论 → 腿明确不在回 `upper`，否则 `full` |
| 策略 | `auto`（默认） | `?framing=` / 控件条「取景」· C | 听分类器 |
| | `full` | 同上 | 永远等身全景。腿照样听分类器（选了全景的笔记本观众不该因此拿到一双坏腿），引导照旧为腿说话 |
| | `upper` | 同上 | 永远中景、腿永远站姿（桌面演示） |

三个策略都是**叠加**：控件条上再选「自动」就交回分类器，没有一个按钮能锁住系统（docs/23 §S4.1）。热切，不重载。

### 5.3 典型场景

| 场景 | 分类器 | 舞台 | 左上角小屏 | 引导 | 身体 |
|---|---|---|---|---|---|
| 笔记本前坐着 | 0.35 秒内 `upper` | 1 秒推到中景，小范围跟随（死区 4cm、横 ±12cm、竖 ±8cm） | 放大到 1.3×，跟着上半身 | 不为腿说话 | 腿 0.5 秒混成站姿，上半身照常镜像 |
| 笔记本前站起来（头出了上边） | 0.5 秒内 `full`（`abnormal`） | 回全景 | 当帧退回整幅 | 「往后退一点」 | 腿还在站姿（分类器不是 `full(legs-in)` 前不放开） |
| 站着往后退 | `stepping-back`（尺度在缩，~0.6 秒）→ 腿进画 `full` | 退的过程中就回全景 | 当帧退回整幅 | 退后中照常说话（那正是他在做的事） | 腿进画后 0.5 秒混回追踪 |
| 装置：从远处走到站位线 | `full` 全程 | 等身全景 | （现场默认不挂） | 照旧 | 追踪 |
| 装置：走到镜头跟前 | 腿不在持续 3 秒才 `upper` | 中景 | — | — | 站姿 |
| 画里两个人 | 尺度一帧跳 > 35% 视为换人，清空趋势窗口，不当成退后；腿的证据照常 | 按证据 | 按证据 | 按证据 | 按证据 |
| 人走了 | 4 秒内保持；4 秒后 `full(absent)` | 回全景（下一位从等身开始） | 「站到画面里」 | — | 空场 |

### 5.4 边界（每条一个决定、一个测试）

| 边界 | 决定 | 测试 |
|---|---|---|
| 腿在画面底边上一帧进一帧出 | 漏桶攒不满，不切 | `core/test/autoframe.test.ts`「腿在画面底边上一帧进一帧出」：全身起步 10 秒 0 次、上半身起步 ≤ 1 次且停在 `upper` |
| 前倾（肩变宽、躯干透视变短）再坐直 | 不是退后：两个量**都**缩才算缩 | 「前倾…再坐直」 |
| 转身（肩宽缩到 0.4） | 不是退后：躯干没缩 | 「转身」 |
| 中途坐下、腿被桌子挡住 | 1 秒后 `upper`，只切一次 | 「中途坐下」 |
| 桌椅部分遮挡 | 同上：被挡的膝踝可见度低 = 不在 | 同上 |
| 光线塌了（score < 0.65） | **保持当前模式**：坏光下腿的可见度会跟着塌，看起来像只露上半身 | 「光线塌了」 |
| 摄像头自己在裁（Center Stage / Studio Effects） | 放大不是退后（尺度在涨）；腿被裁掉就是上半身 —— 系统优雅地适应，但**现场仍然要关**（5.6） | 「摄像头自己在裁」 |
| 小孩 / 个子矮 | 全身在画里就是全身，判据不看身高 | 「小孩」 |
| 两个人 | 见上表 | 「两个人」 |
| 回放 / `?demo=1` | 录制没有 `screen`：只看 world 的腿可见度，没有"在不在画内"和尺度。真录制 `pose-walkturn` 全程 `full`；把膝踝可见度压到 0.1 → `upper` | 「回放录制」 |
| `prefers-reduced-motion` | 景别 0.15 秒到位，中景不跟随 | 「景别：…减少动态 0.15 秒」 |
| 调速器在砍工作量 | 放到「后期」那一级（阶梯第 4 级）或降级 / 无人降帧时：景别直接切到位、跟随冻结 | 「景别：…治理在砍工作量时直接切」 |
| 头被切但上半身取景 | 小屏和 WRN12 照样说 | `app/test/framing-mode.test.ts` |

### 5.5 实现

| 做什么 | 在哪 | 测试 |
|---|---|---|
| 证据、分类器、策略、跟随弹簧（死区 + 二次过渡带 + 闭式临界阻尼 + 夹住）、景别步进、小屏裁切步进 | `packages/core/src/autoframe.ts`；数全在 `tuning.ts` 的 `AUTOFRAME` | `core/test/autoframe.test.ts` 18 条 |
| 腿换成站姿，按脚重新落地；身高按站姿算 | `packages/core/src/leghold.ts`，帧循环里在 `clampFold` 之后、`motion.update` 之前 | `core/test/leghold.test.ts` 4 条 |
| 中景取景与插值 | `stage/framing.ts` 的 `upperFit` / `blendFit`；`stage.ts` 的 `setShot()`，每帧按时间推，`setViewOffset` 平移视锥（横向跟随也是移轴，不转相机） | `app/test/framing-mode.test.ts` |
| 引导与 WRN12 | `ui/preview-state.ts` 的 `outOfFrame(screen, upperIsIntended)`：上半身取景时**只从下边出去的点**不算出画（腿、放在桌上的手）；上、左、右照算 | 同上 |
| 小屏裁切 | `ui/preview.ts` 一个 `applyCrop()` + 一处调用；每帧写 transform，不用 CSS transition | 纯逻辑在 core 测 |
| `?framing=`、控件「取景」、HUD 两行、工作台 | `shell/kiosk.ts`、`ui/control-table.ts`、`shell/hud.ts`、`dev/framing.html` | `app/test/framing-mode.test.ts`；`control-table.test.ts` 的读回 |

**和原设计不同的一处，理由写在这里。** 任务卡写的是"中景跟随观众在画面里的横竖偏移"。但 MediaPipe 的 world 坐标是**以胯为原点**的：
观众在画面里往左走，舞台上那具身体并不往左走。相机跟着画面偏移去挪，就是在挪向一具没动的身体。
所以跟随的目标是**舞台上那具身体的上半身**：头胸的横向位置、颅顶低于站姿身高多少（前倾、塌腰）。观众在画面里的位移只由小屏裁切跟随 —— 那里坐标系就是画面。

### 5.6 现场检查（阶段 0，照旧必须做）

开机前关掉上游的自动取景：macOS 控制中心 › 视频效果 › **人物居中（Center Stage）关**；Windows 设置 › 相机 › Studio Effects › **自动取景关**；
不用 NVIDIA Broadcast 的虚拟摄像头（Auto Frame）；云台摄像头关人脸跟踪、锁定云台。
检查法：站到画面一侧慢慢走，左上角小屏里的**背景**不该跟着动。已写进 `docs/38` §2 和 `docs/46` §0。
分类器能适应它（腿被裁掉就是上半身），但装置的首要观众是全身 —— 在上游裁掉腿等于替每个人选了中景。

### 5.7 顺手查到的（相关部分还能怎么做）

1. **稳定器的腿长中位数会吃进上半身时的乱帧。** 腿看不见的那几十秒里，`stabilize.ts` 的 90 帧滚动中位数照样在更新腿长；人退后腿进画，腿从站姿混回追踪时用的是被污染的骨长，最多 3 秒才洗干净。修法：腿骨 `confidence` 低于门限时不更新那几根的中位数。本轮没做（`stabilize.ts` 不在这条线的范围）。
2. **`skeleton.ts` 的落地在一只脚都不可信时退到"最低的可见点"。** 全景策略下、腿被桌子挡住的人，整具身体会随那个点上下跳。上半身模式用站姿绕开了它；`?framing=full` 那一条路上它还在。
3. **`observedHeight()` 用脚算身高。** 只露上半身的人身高是乱的，而动能除以身高 —— 读数里的「动能」在笔记本观众身上一直是错的量级。站姿模式下改成按站姿算（`leghold.ts`），全景下没动。
4. **`assets/demo/` 的两段真录制没有 `screen`。** 所以回放下分类器只有可见度，没有"在不在画内"和尺度，也就没法在 `?demo=1` 上演示"退后"。下一次录制（`/dev/record.html`）应当把 `screen` 一起存下。
5. **分类器假定摄像头是 16:9。** 趋势用的是比值，不受影响；绝对肩宽只用于"换人"判断的比值，也不受影响。4:3 摄像头上没有已知问题，但没实测。
6. **`numPoses = 1`。** 两个人时 MediaPipe 在两人之间跳，分类器只能做到"不误判成退后"；真正的多人是另一件事。

### 5.8 先红后绿（每条守卫拿掉它守的那一行再跑，21 发 21 中）

| 拿掉什么 | 红了哪条 |
|---|---|
| 漏桶改成"不成立时不扣" | 腿在底边上颤 |
| 头在不在（鼻子 / 耳朵）那一条 | 证据、时间线（画外的头可见度只有 0.2，数画外可信点数不出来） |
| 退后要两个量都缩 → 一个缩就算 | 前倾再坐直 |
| 一帧跳 > 35% 清空趋势窗口 | 两个人 |
| 光不够保持模式 | 光线塌了 |
| 头肩被切不等冷却 → 等冷却 | 时间线 |
| 现场 3 秒 → 和网页一样 | 现场全身优先 |
| 跟随的目标夹住（和出界后的夹） | 跟随不出范围、景别 |
| 死区 | 跟随：死区里一动不动 |
| 调速器保持镜头 | 景别 |
| 减少动态 0.15 秒 | 景别 |
| 小屏告警当帧退回整幅 | 小屏裁切 |
| 站姿按脚落地 | 腿：脚踩在 y=0（2 条） |
| 膝在髋正下方 | 腿：竖直站姿 |
| 引导：画面下边的豁免 | 引导 / 读数 / 引导 × 分类器（3 条） |
| 引导：豁免扩大到所有边 | 头被切照样说、WRN12（2 条） |
| 读数不接那个开关 | WRN12 |
| `?framing=` 永远 auto | 控件读回、`?framing=` 读回（2 条） |
| 控件把 auto 写进地址栏 | `?framing=` |
| 中景插值在 t = 0 时偏一点 | 中景：t = 0 逐字等于等身全景 |

第一轮里"跟随不出范围"那一发没有红：只拿掉了出界后的夹，而目标先被夹过、临界阻尼又不过冲，出界后的夹是多余的 —— 真正在守的是目标的那一次夹，第二轮拿掉它才红。站姿落地那一发第一轮删掉整行循环、留下一个悬空的 `if`，红的是语法错误不是断言，第二轮改成 `-= 0` 才是真红。

### 5.9 浏览器里的证据（无头 Chrome，raw CDP，截图在工作树 `scratch/evidence/`，不进仓库）

回放片段是从真录制 `pose-walkturn` 派生的两段，**只在取证时放进 `assets/demo/`，取完删掉**（`SOURCES.md`：合成数据不进那个目录）：
`upperwalk` = 同一段录制把膝踝脚（25–32）可见度压到 0.1、坐标加上"桌子底下乱猜"的抖动；`stepback` = 前 8 秒 `upperwalk`、后 8 秒原录制。
URL 都是 `/?demo=1&debug=1&theme=porcelain&seed=7&theseus=off&arc=900&nopost=1&clip=…`；"改前"是同一个 URL 开在 `main`（02d84ed）上。

| 场景 | 改前（main） | 改后 | HUD 读到的 |
|---|---|---|---|
| 只露上半身（`upperwalk`，6 秒） | `before-upper-06s.png`：等身全景，一条腿横甩在地上，两摊影子 | `after-upper-06s.png`：中景，上半身占满画面，腿站着不动 | `upper ← legs-out 5.2s · 景 100% · 腿 1.00 · 膝踝 0/4` |
| 退后（`stepback`，第 8 秒腿回来） | `before-stepback-07s.png` / `-10s.png` | `after-stepback-07s.png`（中景）→ `-09s.png`（正在拉回，景 48%、腿 0.97）→ `-10s.png`（全景，腿追踪） | 7s `upper ← legs-out 6.2s` → 9s `full ← legs-in 0.0s · 景 48%` → 10s `full ← legs-in 1.0s · 景 0% · 腿 0.00` |
| 全身（`walkturn`，8 秒） | `before-full-08s.png` | `after-full-08s.png`：和改前同一个等身全景 | `full ← start 7.7s · 膝踝 4/4` |
| 工作台 `/dev/framing.html` | — | `workbench-02s/04s/08s/12s.png`：合成时间线上琥珀段（upper）两侧是灰段（full），切换处白竖线 | 8s `full ← abnormal 4.2s` |

退后那一段在回放里走的是 `upper → stepping-back(legs-appearing) → full(legs-in)`，从腿回来到景别开始拉回不到 1 秒、拉回走完 1 秒。
回放没有 `screen`，所以"尺度在缩"那一支只在 node 时间线里跑过，浏览器里没有。**小屏裁切在浏览器里没有取证**：`?demo=1` 不挂小屏，而无头 Chrome 的假摄像头要一段只露上半身的 y4m，这一轮没做。

**首屏字节。** 两份 `vite build` 逐个 chunk 比（`dev-*` / worker / wasm 除外）：JS+CSS 合计 gzip **551.1 → 556.2 KB（+5.1 KB）**。
分类器落在 `intent` 这个共享 chunk（9.1 → 12.9 KB gz），`main` 23.4 → 23.8 KB gz，`stage` 13.3 → 13.6 KB gz。docs/13 §6 口径的首屏是 2.06 MB，
+5 KB 之后仍远在 3 MB 之下 —— **但这一轮没有按 docs/13 的口径重走一遍网络量**，这个结论是由 chunk 差值推出来的。
