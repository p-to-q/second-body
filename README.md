# SECOND BODY

[![check](https://img.shields.io/badge/check-typecheck%20%2B%20103%20tests%20%2B%20parts%20contract-brightgreen)]()
[![parts](https://img.shields.io/badge/parts-191-blue)]()
[![bodies](https://img.shields.io/badge/body%20plans-rig%20%7C%20quadruped%20%7C%20mass%20%7C%20stub-blue)]()

实时交互艺术装置。摄像头认出你的身体，一具合成的身体跟随你；
你动得越多它越复杂；同时它把你此刻的剪影送给一个 3D 生成模型，
一分钟后，属于你的那块零件长在它身上。

对标 Universal Everything《Future You》(Barbican, 2019) 的逆向复刻，
并把 2019 年不存在的那一层 —— 实时 AI 3D 生成 —— 放进交互回路。

## 快速开始

```bash
npm install
npm run doctor          # 环境自检
npm run dev             # → http://localhost:5173
```

没有资产也能跑（会用占位几何）。部件对照表在 `/dev/parts.html`。

## 资产工厂（需要 Hyper3D key，写进 .env）

```bash
npm run factory:balance                  # 看余额
npm run factory:plan                     # 看 50 个配方的状态
npm run factory:generate -- --pilot      # 先跑 6 件验证（3 credits）
npm run factory:generate -- --all        # 全量（25 credits）
npm run factory:normalize                # 规范化：主轴+Y / socketA原点 / 长度1 / 去贴图
npm run factory:index                    # 生成 parts.json
```

幂等：已完成的配方不会重复花钱。改 `flip` 之类的规范化参数不触发重新生成。

## 合并门

```bash
npm run check           # typecheck + test + 部件契约检查
```

## 状态

**跑通了什么以 `docs/10-SURFACES.md` 为准**，不以本文件为准。

## 这个仓库值得看的三件事

1. **身体方案是可插拔的**（[`docs/18`](docs/18-BODY-PLANS.md)）。人体骨架 → 四足 / 团块 / 矮胖
   只是一个纯函数加一个字段。四足那条保留了四肢的世界方向，所以"你抬手 → 它抬前腿"的因果没断。
2. **玩法扩展点自带故障隔离**（[`docs/16`](docs/16-SPEC-acts.md)）。一个 Act 连续 3 次抛异常就被
   永久禁用并回落 —— 让"随便试新玩法"变安全，是那块空间能成立的前提。
3. **工程原则都附着教会我们的那件事**（[`docs/02`](docs/02-ENGINEERING-PRINCIPLES.md) P11–P20）。
   没有故事的原则活不过三天。

## 文档

从 `AGENTS.md` 的读取路线开始，不要一次读完 `docs/`。索引在 `docs/index.md`。

## 结构

```
packages/core      纯逻辑（滤波/骨架/挂载/演化/基因），零依赖，node --test 直接跑
packages/app       浏览器运行时（vite + three.js WebGPU + MediaPipe）
packages/factory   Node（Hyper3D 客户端 + 资产流水线 + 慢回路代理）
assets/parts       规范化后的部件 + parts.json    ← 运行时与工厂之间唯一的接口
assets/raw         Rodin 原始产物 + ledger.json   （gitignore）
```
