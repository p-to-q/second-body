# prompt —— `patrol`（Spot（Boston Dynamics））

> 🐕 机器狗 / 定义 quadruped archetype

`geometry_instruct_mode: faithful`（docs/07 §2）下，prompt 是**方向性引导**不是描述；
真正定形状的是参考图和 `bbox_condition`。所以下面这段只说「往哪个方向偏」。

## 形态（英文，给 Rodin）

```
a quadruped field-robot limb segment: a boxy machined thigh housing with a bulging knee-
motor drum at one end, a slim tubular shank, protective bumper ribs along the outer face, a
small rubber foot pad
```

拼接时在后面接 `STYLE_BASE`（`packages/factory/recipes/roster.ts`）—— 
`isolated single object on a plain background, one continuous solid part, …`。
**不要在这里重复 STYLE_BASE 里已有的词**，重复会让 faithful 模式过度收敛。

## 材质与工艺

工程黄的注塑外罩 + 哑光黑的机加工关节筒；外罩上有一圈防撞加强肋和几个外露六角螺栓；没有脸、没有装饰面 —— 每一个面都在承力或防撞。

## 它区别于其它 archetype 的那一点

它定义了「四足」这个 archetype 本身：黄身体 + 黑关节 + 无头。腿那样折（膝盖朝后、髋部外张）是因为要在窄通道里原地转身并且摔了能自己爬起来。

## bbox_condition

**建议偏差**。四足躯干是长条不是立方：`spine` 从 `[420,500,260]` 改成 `[300,240,620]`（Z 为长轴，宽扁的机身）。注意 docs/30 §6 记的坑：近立方 bbox 会把躯干参考图抄成「小躯干」，四足躯干必须显式拉长。
