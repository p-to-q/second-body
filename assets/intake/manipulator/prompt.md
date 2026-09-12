# prompt —— `manipulator`（Stretch（Hello Robot））

> 🦾 移动机械臂 / mobile manipulation

`geometry_instruct_mode: faithful`（docs/07 §2）下，prompt 是**方向性引导**不是描述；
真正定形状的是参考图和 `bbox_condition`。所以下面这段只说「往哪个方向偏」。

## 形态（英文，给 Rodin）

```
a mobile-manipulator component: a single slender extruded aluminium telescoping mast section
with a black cable track running along one face, a compact white joint housing at one end,
lab-grade utilitarian finish
```

拼接时在后面接 `STYLE_BASE`（`packages/factory/recipes/roster.ts`）—— 
`isolated single object on a plain background, one continuous solid part, …`。
**不要在这里重复 STYLE_BASE 里已有的词**，重复会让 faithful 模式过度收敛。

## 材质与工艺

阳极氧化铝的细长立柱（拉丝、有一条沟槽）+ 白色注塑的关节包 + 黑色拖链；底盘是白壳包黑色胎面轮。整机只有白/银/黑三色，没有任何装饰。

## 它区别于其它 archetype 的那一点

如果地面本来就是平的，为什么要花巨大能量去模拟两条腿。它是被人形热潮盖住的那个真正在用户家里干活的物种。

## bbox_condition

**建议偏差**。默认槽位没有「立柱」这种形态。把 `spine` 当立柱用：`[120,640,120]`（极细极长）。`upperArm`/`foreArm` 用 `[90,360,90]`，比默认更细 —— 它的臂是伸缩杆不是肌肉。
