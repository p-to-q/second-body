# `assets/demo/` 的来源

`?demo=1` 回放的每一段 `pose-*.json` 从哪来、凭什么可以用。

**这里的 pose JSON 是真实录制**，不是合成数据：MediaPipe 在真人视频上的输出就是真实录制 ——
真的人、真的关节抖动、真的遮挡、真的深度噪声。人只是不在我们这台机器前面。
（`/__demo` 写回口明确拒收带 `synthetic` 标记的数据，见 `packages/app/vite.config.ts`。）

**原料视频不进仓库**（体积，且各来源授权不同）。放在 `assets/capture-src/`，已 gitignore。
照着下面的 URL 能重新取一遍，跑法见每段末尾的那行命令。

---

## `pose-jumpingjacks.json`

| | |
|---|---|
| 来源 | https://commons.wikimedia.org/wiki/File:Jumping_jacks_and_burpees.webm |
| 文件 | https://upload.wikimedia.org/wikipedia/commons/5/57/Jumping_jacks_and_burpees.webm |
| 授权 | CC BY-SA 4.0 |
| 作者 | Taco Fleur（Wikimedia Commons 用户 `Taco_fleur`） |
| 原片 | 45.3s · 640×480 · 29.97fps |
| 截取 | **整段**，未裁剪 |
| 本地 | `assets/capture-src/jumpingjacks.webm` |

覆盖到的量程：站定 → 开合跳（两手举过头、双臂张到最开）→ 波比跳（蹲到底、手撑地、整个人接近水平）。
一个人、全身在画面里（脚踝和脚尖都在）、正面、固定机位、背景里没有第二个人。

跑法：`/dev/record.html?video=/capture-src/jumpingjacks.webm&name=jumpingjacks&save=1`

## `pose-walkturn.json`

| | |
|---|---|
| 来源 | https://commons.wikimedia.org/wiki/File:Kettlebell_Farmer_Walks.webm |
| 文件 | https://upload.wikimedia.org/wikipedia/commons/1/1c/Kettlebell_Farmer_Walks.webm |
| 授权 | CC BY-SA 4.0 |
| 作者 | Taco Fleur（Wikimedia Commons 用户 `Taco_fleur`） |
| 原片 | 20.4s · 640×480 · 29.97fps |
| 截取 | **整段**，未裁剪 |
| 本地 | `assets/capture-src/farmerwalk.webm` |

它管的是另一件事：**前后位移与转身**。人背对镜头走远（在画面里从大变小）→ 转身 → 提着壶铃走回来。
这是我们唯一一段能拿来问"人走远走近，数据里有没有这件事"的素材（docs/09 U2）。
代价是中间有一段是背面 —— 那不是疏忽，走远本来就只能背对镜头。

跑法：`/dev/record.html?video=/capture-src/farmerwalk.webm&name=walkturn&save=1`

---

## 怎么跑（两个踩过的坑）

1. **先转成全关键帧**。视频路是逐帧 `seek`，而普通 webm/mp4 的 seek 要从最近的关键帧解起，
   越往后越慢 —— 实测原片跑到第 4 秒时已经是每帧 10 秒，全片要 3 小时。
   `ffmpeg -i in.webm -c:v libx264 -g 1 -keyint_min 1 -sc_threshold 0 -crf 18 -pix_fmt yuv420p -an out.mp4`
   之后 seek 是常数时间。
2. **软件 OpenGL 上要 `&delegate=cpu`**。无头 Chrome 用 SwiftShader，
   MediaPipe 的 "GPU" delegate 在它上面每帧 8 秒；CPU delegate 是 0.4 秒。
   有真显卡的机器不要加这个参数。

两段都是 `model=full`（默认）。不是实时，没有理由省那 20% GPU。

---

## 质量报告（`scratch/` 里的 `analyze.mjs`，判据同 docs/24 §5）

| | `pose-jumpingjacks` | `pose-walkturn` | `pose-synthetic`（对照） |
|---|---|---|---|
| 帧数 / 时长 | 1357 @30fps · 45.2s | 609 @30fps · 20.3s | 60 @30fps · 2.0s |
| 有人的帧 | 1357（**100%**） | 576（**94.6%**） | 60（100%） |
| `score` 中位（p10→p90） | 0.873（0.805→0.979） | 0.951（0.883→0.968） | 0.950（恒定） |
| 左前臂骨长 中位 | 0.236m | 0.238m | 0.098m |
| **左前臂变异系数 CV** | **9.2%** | **11.1%** | **65.7%** |
| 稳健 CV（MAD/中位） | **4.7%** | **5.9%** | **63.3%** |
| 骨长 < 0.15m 的帧 | 11（0.8%） | 9（1.6%） | 37（**61.7%**） |

真录制的骨长变异系数比合成占位数据低 **一个数量级**（9.2% / 11.1% vs 65.7%）。
剩下的那点变化是真的：单目估计在手臂朝向镜头（前缩）时会把前臂估短，
这正是我们想要的那种噪声 —— 它在合成数据里根本不存在。

`pose-walkturn` 有 5.4% 的帧完全没检出人（人走到最远、只占画幅十几个像素时）。
那不是缺陷，那是数据里"人走远了"长的样子；`ReplayCapture` 看到空 `world` 会返回 null，
和现场真的没人走开是同一条路。

### 深度（docs/09 U2）

`pelvis.z` 在这两段里都恒等于 0 —— **这是定义不是测量**：MediaPipe 的 `worldLandmarks`
原点就是胯中点。`pose-walkturn` 里人明明走远又走近（画幅内肩宽 0.001→0.133，
最大/最小 211×），而 `world` 里的胯一动不动。
**整具身体的前后位移不在我们消费的数据里**，详见 docs/09 U2。

能测的是**各关节相对胯的 z**，两段的结论一致：

| 关节 | 量程（jumpingjacks） | 逐帧 \|Δz\| 中位 | 跨度/抖动 |
|---|---|---|---|
| 鼻 | 0.938m | 0.014m | 68× |
| 左腕 | 0.723m | 0.014m | 51× |
| 右腕 | 1.208m | 0.015m | 83× |
| 左踝 | 1.061m | 0.012m | 91× |

抖动比变化小 **1.5 到 2 个数量级** —— 按 docs/09 U2 自己写的判据，
**四肢相对躯干的深度是可用的**（可以 3D 挂载），不用退 2.5D。

## 署名怎么走

CC BY-SA 4.0 要求署名。装置本身不播这两段视频，只播从它们算出来的骨架坐标，
但坐标是衍生物 —— 所以署名留在这个文件里，并在 `docs/09` 里链过来。
真要把画面放进展陈（现在没有这个打算），署名和 ShareAlike 要一起跟上。


## 为什么录制里没有 `screen`

`RawPose` 有 `world` / `screen` / `score` / `t` 四个字段。全仓库搜下来，
**`screen` 只在 `core/refine.ts` 里被原样传过去，没有任何消费者**。

而网页版默认就跑 `?demo=1`（观众按下「用我的摄像头」之前都是回放），
所以多数访客真的会下载这个文件。存一份没人读的数据，等于让每个访客
为它多等一半的时间。

去掉 `screen`、坐标保留三位小数之后：4.75 MB → 2.28 MB，gzip 后 365 KB。
哪天 `screen` 真的有了消费者，重跑一遍录制就有了 —— 原料视频的 URL 在上面。
