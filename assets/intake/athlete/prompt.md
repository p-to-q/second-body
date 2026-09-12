# prompt —— `athlete`（Atlas（Boston Dynamics））

> 🧍 人 / humanoid 极限运动

`geometry_instruct_mode: faithful`（docs/07 §2）下，prompt 是**方向性引导**不是描述；
真正定形状的是参考图和 `bbox_condition`。所以下面这段只说「往哪个方向偏」。

## 形态（英文，给 Rodin）

```
a bare electric-actuator humanoid limb assembly with exposed rotary actuator drums at every
joint, open truss-like structural links, no cosmetic outer shell, athletic tapered
proportions
```

拼接时在后面接 `STYLE_BASE`（`packages/factory/recipes/roster.ts`）—— 
`isolated single object on a plain background, one continuous solid part, …`。
**不要在这里重复 STYLE_BASE 里已有的词**，重复会让 faithful 模式过度收敛。

## 材质与工艺

裸机加工铝 + 阳极氧化深灰；关节处是外露的电机筒身（拉丝金属），连杆是镜面/磨砂交替的桁架；绝对不要有一整片光滑外壳 —— 它的表面就是结构本身。

## 它区别于其它 archetype 的那一点

别的人形都在用外壳把机械藏起来，只有它把执行器当造型；它的 uncanny 来自运动能力，不是脸。

## bbox_condition

用 docs/07 §2 默认槽位 bbox。`athlete` 的 bodyPlan 只改比例（limb 1.1），不需要偏差。
