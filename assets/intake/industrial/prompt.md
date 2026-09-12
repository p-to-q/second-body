# prompt —— `industrial`（Figure 03（Figure AI））

> 🧍 产品人 / 工业 humanoid 产品化

`geometry_instruct_mode: faithful`（docs/07 §2）下，prompt 是**方向性引导**不是描述；
真正定形状的是参考图和 `bbox_condition`。所以下面这段只说「往哪个方向偏」。

## 形态（英文，给 Rodin）

```
a product-grade industrial humanoid limb segment with a seamless soft-touch outer shell in
light grey, a recessed dark structural core visible at the joint gap, integrated cable
routing, no exposed bolts
```

拼接时在后面接 `STYLE_BASE`（`packages/factory/recipes/roster.ts`）—— 
`isolated single object on a plain background, one continuous solid part, …`。
**不要在这里重复 STYLE_BASE 里已有的词**，重复会让 faithful 模式过度收敛。

## 材质与工艺

哑光软触感注塑外壳（浅灰/米白）包住深灰结构芯；关节缝是故意留的一道深色沟；表面没有螺栓、没有外走线 —— 这是它跟 `athlete` 最大的分野。

## 它区别于其它 archetype 的那一点

它是第一批把人形机器人当**消费电子产品**做的：外壳连续、接缝对齐、走线全内藏。

## bbox_condition

用默认。`industrial` 的 bodyPlan 是 torso 1.08 / limb 0.98，默认 bbox 足够。
