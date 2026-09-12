# prompt —— `_new/consumer-quadruped`（Go2（Unitree））

> 🐕 消费机器狗 / 四足商品化

`geometry_instruct_mode: faithful`（docs/07 §2）下，prompt 是**方向性引导**不是描述；
真正定形状的是参考图和 `bbox_condition`。所以下面这段只说「往哪个方向偏」。

## 形态（英文，给 Rodin）

```
a consumer quadruped robot limb segment: a slim white composite thigh shell over a visible
dark actuator drum at the hip end, a tapering shank, a small black rubber foot cap
```

拼接时在后面接 `STYLE_BASE`（`packages/factory/recipes/roster.ts`）—— 
`isolated single object on a plain background, one continuous solid part, …`。
**不要在这里重复 STYLE_BASE 里已有的词**，重复会让 faithful 模式过度收敛。

## 材质与工艺

哑光白/浅灰复合外壳 + 深灰关节筒 + 黑色橡胶脚垫；机身侧面有一条内嵌的灯带；比 `patrol` 干净得多 —— 没有防撞肋、没有外露螺栓、没有工程黄。

## 它区别于其它 archetype 的那一点

`patrol`（Spot）是**工业设备**，它是**消费品**：同样的四足拓扑，但外壳从「能挨撞」变成「能摆在客厅」。这两个条目的分野在**表面处理**，不在骨架。

## bbox_condition

同 `patrol`：`spine` 用 `[260,220,520]`（四足躯干拉长）。
