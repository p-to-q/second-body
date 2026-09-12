# prompt —— `petbot`（Aibo ERS-1000（Sony））

> 🐶 宠物 / artificial life

`geometry_instruct_mode: faithful`（docs/07 §2）下，prompt 是**方向性引导**不是描述；
真正定形状的是参考图和 `bbox_condition`。所以下面这段只说「往哪个方向偏」。

## 形态（英文，给 Rodin）

```
a glossy pet-robot body segment: rounded organic-electronic volumes, a smooth articulated
ear or tail element, a small dark OLED lens detail, pearlescent white, toy-grade surface
precision
```

拼接时在后面接 `STYLE_BASE`（`packages/factory/recipes/roster.ts`）—— 
`isolated single object on a plain background, one continuous solid part, …`。
**不要在这里重复 STYLE_BASE 里已有的词**，重复会让 faithful 模式过度收敛。

## 材质与工艺

珠光亮面白色注塑（分模线清晰、公差极小）；耳朵/尾巴是同材质的薄片；眼睛是两块黑色椭圆 OLED；关节处露出一点点深灰橡胶。整体是**消费电子**的做工，不是机械的。

## 它区别于其它 archetype 的那一点

它二十多年前就想明白了一件事：机器人不需要逼真，机器人需要**让人投射生命**。所以它不像狗，它只保留了狗的几个情绪出口 —— 眼睛、耳朵、尾巴。

## bbox_condition

**建议偏差**。同 `patrol`：四足躯干要拉长，`spine` 用 `[260,220,520]`。`head` 因为是宠物比例，建议 `[280,260,300]`（略大略圆）。
