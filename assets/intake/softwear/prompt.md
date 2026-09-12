# prompt —— `softwear`（NEO（1X））

> 🧥 家庭人 / soft humanoid

`geometry_instruct_mode: faithful`（docs/07 §2）下，prompt 是**方向性引导**不是描述；
真正定形状的是参考图和 `bbox_condition`。所以下面这段只说「往哪个方向偏」。

## 形态（英文，给 Rodin）

```
a limb segment fully wrapped in a seamless knitted textile sleeve over a slim rigid core, a
ribbed knit cuff marking the joint, soft warm greige, no visible mechanism anywhere
```

拼接时在后面接 `STYLE_BASE`（`packages/factory/recipes/roster.ts`）—— 
`isolated single object on a plain background, one continuous solid part, …`。
**不要在这里重复 STYLE_BASE 里已有的词**，重复会让 faithful 模式过度收敛。

## 材质与工艺

整体织物包覆（羊毛感针织，暖灰米色），罗纹收口在关节处；内部刚体只透过织物的张力显形；唯一的硬表面是那张椭圆的面罩 —— 也是织物覆面的。

## 它区别于其它 archetype 的那一点

给机器人穿上衣服，它就从「工业机械」变成「家里那个人」—— 这是 16 个里唯一靠**材质**而不是靠拓扑完成的跨越。

## bbox_condition

用默认。织物包覆让体量比裸机稍胖，但 `softwear` 的 bodyPlan 已经给了 torso 1.12 / limb 0.95。
