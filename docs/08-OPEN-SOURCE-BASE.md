# 08 · 开源底座清单与取舍

> 原则：**追踪层直接用 commodity，绝不自研；渲染层自己写，因为那是作品本身。**

## 1. 采用（进依赖）

| 包 | 版本 | 用途 | 为什么是它 |
|---|---|---|---|
| `@mediapipe/tasks-vision` | latest | PoseLandmarker（33 点，含 world 3D）+ ImageSegmenter | 2026 年浏览器内姿态的默认解；Apache-2.0；第一方 JS 绑定；WASM + WebGPU 加速；无需服务端 |
| `three` | latest | 渲染（`three/webgpu` + `three/tsl`） | WebGPU 全平台可用（Chrome/Edge/Firefox 桌面、Safari 26、Android 12+）；TSL 一套源码编译到 WGSL/GLSL，天然带 WebGL2 回退 |
| `@gltf-transform/core` + `/functions` | latest | 资产规范化、weld/dedup/prune/simplify | 纯 Node，**免掉 Blender 依赖**（ADR-3）；simplify 走 meshoptimizer |
| `meshoptimizer` | latest | 减面 | 同上 |
| `vite` | latest | dev server / 打包 | 无脑选择 |

**依赖纪律（P6）**：以上之外，新增任何 runtime 依赖都要在任务输出里申请。

## 2. 参考实现（读，不 fork）

| 项目 | 看什么 |
|---|---|
| `cruxbetalabs/reconstruct` | MediaPipe → three.js 的坐标转换与时序平滑写法，可对照我们的 `mediapipeToWorld` |
| `kschaer/poseToThree` | webcam → pose → 形变的最小闭环，概念参考 |
| `torinmb/mediapipe-touchdesigner` (MIT, 2.7k★) | 如果 Web 路线在现场翻车，这是 **plan B 的底座**：内嵌 Chromium 跑 MediaPipe → WebSocket → TouchDesigner |
| `sygnalinc/Apple-Frameworks-for-TouchDesigner` | plan B 的更优追踪源：Apple Vision Pose3D，17 joints 真 3D，60fps，Apple Silicon 原生 |
| `VAST-AI-Research/UniRig` (SIGGRAPH 2025) | **P3 备选**：若最终想让某些部件变形而非刚体，用它自动出骨架+蒙皮权重。v1 不用 |
| `VAST-AI-Research/SkinTokens` | UniRig 后继，同上 |

## 3. 明确不用

| 候选 | 不用的理由 |
|---|---|
| Unity / Unreal（还原原作） | 48h 内配置和打包的时间成本 > 收益；产出物不可分享 |
| OpenPose / RTMPose / ViTPose | 精度提升对身体尺度的作品不可见，但要自己搭 ONNX 推理、自己做浏览器集成 |
| SMPL / SMPLest-X 等人体网格 | SMPL 模型文件有许可限制；而且我们要的是"非人的合成身体"，拟合真人网格反而走错方向 |
| 任何云端推理 | P10 现场优先，不依赖网络 |
| 自动绑骨/蒙皮（v1） | ADR-1 已用刚体挂载绕开 |

## 4. Plan B（现场翻车时的 2 小时切换方案）

若 WebGPU / 摄像头 / 浏览器在现场出问题：
1. `?demo=1` 回放模式（录好的 pose 数据）——**先用这个顶住**，30 秒切换。
2. 仍不行 → TouchDesigner 路线：`mediapipe-touchdesigner` 出 33 点 → 用同一套 `parts/*.glb`
   做 instancing。挂载数学是同一套（04 §4），移植成本主要在渲染。
   **前提**：`parts.json` 里的规范化契约是引擎无关的，所以资产可以直接复用。这是 ADR-2 的额外收益。
