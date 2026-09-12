# prompt —— `wheelleg`（W1（LimX Dynamics））

> 🛞🐕 轮足兽 / wheel-leg hybrid

`geometry_instruct_mode: faithful`（docs/07 §2）下，prompt 是**方向性引导**不是描述；
真正定形状的是参考图和 `bbox_condition`。所以下面这段只说「往哪个方向偏」。

## 形态（英文，给 Rodin）

```
ONE single connected solid part with thick closed volumes, no thin shells and no loose
fragments: a wheel-leg hybrid limb, a rigid strut terminating in a fat rubber-tyred wheel
hub with the drive motor fused into the hub, suspension linkage merged into the same body
```

拼接时在后面接 `STYLE_BASE`（`packages/factory/recipes/roster.ts`）—— 
`isolated single object on a plain background, one continuous solid part, …`。
**不要在这里重复 STYLE_BASE 里已有的词**，重复会让 faithful 模式过度收敛。

## 材质与工艺

深灰机加工的腿杆 + 黑色橡胶胎面的轮子 + 轮毂上一圈警示橙；轮和腿之间**没有可见的分界** —— 电机就在轮毂里，这是轮足的全部要点。

## 它区别于其它 archetype 的那一点

它既走也滑。腿末端长轮子不是折中，是两套运动模式在同一条肢体上共存。

## bbox_condition

**建议偏差**。`foot` 槽位这里承载的是轮子，不是脚：从 `[160,200,320]` 改成 `[280,280,160]`（一个厚圆盘）。`shin` 保持 `[100,320,100]`。注意 roster 里 `wheelleg` 已有 `seedSalt: 1`（第一遍生成是坏的），这个条目对参考图质量特别敏感。
