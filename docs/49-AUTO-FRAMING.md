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
