# prompt —— `orb`（Ballie（Samsung））

> 🟡 球 / ambient home robot

`geometry_instruct_mode: faithful`（docs/07 §2）下，prompt 是**方向性引导**不是描述；
真正定形状的是参考图和 `bbox_condition`。所以下面这段只说「往哪个方向偏」。

## 形态（英文，给 Rodin）

```
a seamless spherical rolling robot shell: one continuous sphere in warm yellow, a single
dark recessed sensor-and-projector band across the front, a shallow parting line, matte
soft-touch finish
```

拼接时在后面接 `STYLE_BASE`（`packages/factory/recipes/roster.ts`）—— 
`isolated single object on a plain background, one continuous solid part, …`。
**不要在这里重复 STYLE_BASE 里已有的词**，重复会让 faithful 模式过度收敛。

## 材质与工艺

暖黄色哑光软触感涂层，整个球面只有一条深色凹进去的传感带和一道极浅的分模线；内部的驱动轮只在球体边缘露出一点点深灰。

## 它区别于其它 archetype 的那一点

机器人为什么一定要有腿。球形去掉了「人形机器闯进家里」的威胁感 —— 也就没有恐怖谷了。

## bbox_condition

**建议偏差，而且这一条最要紧**。默认 `spine` `[420,500,260]` 会生成一个竖长的躯干，球会变成蛋。`spine` 用 `[500,500,500]`（真正的等比球）。⚠️ 同时注意 docs/30 §6：近立方 bbox 是**已知会翻车**的那一档。球形物种和「近立方 bbox 已知偏差」正面相撞 —— 这是整份表里技术风险最高的一个条目。
