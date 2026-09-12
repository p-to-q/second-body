# 00 · Project Brief — SEE-ME SEE-YOU

> 工作代号 `second-body`。对标并逆向 Universal Everything《Future You》(Barbican, 2019)，
> 但把 2019 年不存在的那一层——**实时 AI 3D 生成**——真正放进交互回路。

## 1. 一句话

> 你站到屏幕前，一个原始的合成身体认出你、跟随你；你动得越多，它越复杂；
> 与此同时它正在用你此刻的剪影，向一个 3D 生成模型索取属于你的零件——
> 一分钟后，那块零件长在你身上。

## 2. 逆向结论（驱动全部架构决策）

| 观察 | 结论 | 对我们的含义 |
|---|---|---|
| 官方称 "47,000 possible robot reflections"，ACMI 描述 "randomly assigns different material qualities, colours and textures" | 47,000 是**组合数**，不是 47,000 个模型 | 我们也用「槽位 × 部件 × 材质」的组合，不追求逐帧生成 |
| 原作机器人部件互相分离、有间隙、随关节转动拆合 | 部件是**刚体挂载**到骨头上，没有蒙皮 | **不做 skinning**。这砍掉了整个项目 80% 的难度 |
| "starts as primitive form... learns from your movements to adapt and evolve" | 不是学习，是**累积运动能量驱动的状态机** | tier 0→3，阈值可调，人离场重置 |
| Unity + body-tracking sensor (2019) | 追踪是 commodity，价值不在这里 | 用 MediaPipe，把时间花在 look dev 和叙事上 |

完整依据见 `docs/09-RISKS-AND-UNKNOWNS.md` §A。

## 3. 与原作的差异（这是作品成立的理由）

原作是「身体 → 形态」的闭环，回路里没有 AI。
我们加一条**慢回路**：

```
快回路 (16ms)  : pose → skeleton → 部件挂载 → 渲染        ← 预生成部件池，零延迟
慢回路 (30-90s): 剪影 → Hyper3D Rodin → 你的专属零件 → 热插拔到身上
```

慢回路的延迟不是缺陷，是叙事：**"它正在思考如何成为你"**。
观众亲眼看到自己被一块一块重新制造。

## 4. 非目标（明确不做）

- ❌ 逐帧/实时 3D 生成（技术上不存在，别浪费时间）
- ❌ 网格蒙皮 / 自动绑骨（刚体挂载已足够，UniRig 只作为 P3 备选）
- ❌ 多人同时交互（v1 单人。多人检测到了就选面积最大的那个）
- ❌ 手部/面部细节追踪（身体尺度的作品，手指没人看得见）
- ❌ 训练任何模型

## 5. 成功判据

1. 连续运行 30 分钟不崩、不需要人工干预、无人时自动回到 idle。
2. 陌生人无需任何提示，站上去 5 秒内知道"那是我"。
3. 截一张静帧发出去，看起来像作品而不是 demo。
4. 慢回路端到端跑通至少一次，现场可复现。
5. 评委能自己上去玩。

## 6. 参考

- Universal Everything, *Future You* (2019) — https://www.universaleverything.com/media-art/future-you
- ACMI collection record — https://www.acmi.net.au/works/122578--future-you/
- MIT Media Lab, *Future You* (2024, Pataranutaporn et al.) — 同名但不同作品；"叙事 → 未来自我"。
  我们的慢回路在概念上离它更近。https://www.media.mit.edu/projects/future-you/
