# prompt —— `autonomous`（Waymo（Jaguar I-PACE + 5th-gen Waymo Driver））

> 🚗 无人车 / 巨型具身智能

`geometry_instruct_mode: faithful`（docs/07 §2）下，prompt 是**方向性引导**不是描述；
真正定形状的是参考图和 `bbox_condition`。所以下面这段只说「往哪个方向偏」。

## 形态（英文，给 Rodin）

```
ONE single connected solid part, thick and closed, no thin shells and no holes: an
autonomous-vehicle body volume, a smooth white automotive clamshell form with a black sensor
dome fused on top and a ring of lidar apertures, large-radius curves throughout
```

拼接时在后面接 `STYLE_BASE`（`packages/factory/recipes/roster.ts`）—— 
`isolated single object on a plain background, one continuous solid part, …`。
**不要在这里重复 STYLE_BASE 里已有的词**，重复会让 faithful 模式过度收敛。

## 材质与工艺

汽车级白色烤漆（高光、大曲率、无接缝）+ 顶上一整块黑色亮面的传感器穹顶 + 一圈发蓝的灯带；车门把手和轮拱是哑光黑。白 / 黑 / 一条蓝 —— 三个层次而已。

## 它区别于其它 archetype 的那一点

它也是机器人，只是大了很多。一旦不再把具身智能等于人形，这个领域突然变得特别丰富。

## bbox_condition

**建议偏差，必须改**。默认 `spine` `[420,500,260]` 是竖长的人躯干，会把车生成成一个立柜。`spine` 用 `[440,260,760]`（宽 × 矮 × 长 —— 车身的比例）。roster 里 `autonomous` 已有 `seedSalt: 1`，说明第一遍就是坏的；现在有了带 alpha 的高质量参考图 + 正确的 bbox，重锚的成功率应该高很多。
