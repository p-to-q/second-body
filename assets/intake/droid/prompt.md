# prompt —— `droid`（BDX droid（Disney））

> 🤖 小怪物 / character robotics

`geometry_instruct_mode: faithful`（docs/07 §2）下，prompt 是**方向性引导**不是描述；
真正定形状的是参考图和 `bbox_condition`。所以下面这段只说「往哪个方向偏」。

## 形态（英文，给 Rodin）

```
a stylised character-robot head-pod: a big rounded dome with a single large lens eye, two
short antenna nubs, weathered painted metal, friendly oversized proportions
```

拼接时在后面接 `STYLE_BASE`（`packages/factory/recipes/roster.ts`）—— 
`isolated single object on a plain background, one continuous solid part, …`。
**不要在这里重复 STYLE_BASE 里已有的词**，重复会让 faithful 模式过度收敛。

## 材质与工艺

做旧的手绘金属漆（奶油白 + 锈橙），边角有磨损露底；镜头眼是一块凸出的深色玻璃；工艺参照的是电影道具而不是量产件 —— 允许不对称、允许脏。

## 它区别于其它 archetype 的那一点

别的条目卷灵巧度，这一支卷 believability。头的倾斜、落脚的节奏，全部服务于「让你相信它活着」。

## bbox_condition

**建议偏差**。`droid` 的 bodyPlan 是 `{kind:'stub', head:1.5}` —— 大头短身。`head` 从 `[260,280,300]` 改成 `[320,300,320]`（更圆更大的头罩）。
