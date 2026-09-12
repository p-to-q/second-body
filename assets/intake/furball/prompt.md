# prompt —— `furball`（Moflin（Casio））

> 🐹 毛球 / emotional creature

`geometry_instruct_mode: faithful`（docs/07 §2）下，prompt 是**方向性引导**不是描述；
真正定形状的是参考图和 `bbox_condition`。所以下面这段只说「往哪个方向偏」。

## 形态（英文，给 Rodin）

```
a soft furry creature-blob: dense long fur covering a gently rounded limbless volume, no
face, no visible seams, warm beige and cream, a single continuous organic mass
```

拼接时在后面接 `STYLE_BASE`（`packages/factory/recipes/roster.ts`）—— 
`isolated single object on a plain background, one continuous solid part, …`。
**不要在这里重复 STYLE_BASE 里已有的词**，重复会让 faithful 模式过度收敛。

## 材质与工艺

长绒人造毛（3–5mm，有方向性），底下是一个没有任何硬边的软体；没有眼睛、没有嘴、没有四肢；唯一的结构暗示是它能微微弓起的那条背脊。

## 它区别于其它 archetype 的那一点

它放弃了腿、手和任务。触摸 → 声音 → 微小动作 → 依恋，这条链上没有任何一环是「有用」的。

## bbox_condition

**建议偏差**。`furball` 的 bodyPlan 是 limb 0.25 / torso 2.0 —— 躯干吞掉一切。`spine` 建议 `[420,380,460]`（接近球但略扁）。⚠️ 这正好撞上 docs/30 §6 记的「近立方 bbox 会把躯干抄成小躯干」——**先在 `/dev/anchor.html` 试，不行就改 prompt 不要改图**。
