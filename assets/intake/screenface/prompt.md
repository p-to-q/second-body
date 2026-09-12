# prompt —— `screenface`（Loona（KEYi Tech））

> 🐱 桌宠 / screen-face creature

`geometry_instruct_mode: faithful`（docs/07 §2）下，prompt 是**方向性引导**不是描述；
真正定形状的是参考图和 `bbox_condition`。所以下面这段只说「往哪个方向偏」。

## 形态（英文，给 Rodin）

```
a desktop companion robot body: a glossy white rounded shell dominated by one large flat
dark screen panel as its face, two small expressive ear flaps, a chunky two-wheel base fused
underneath
```

拼接时在后面接 `STYLE_BASE`（`packages/factory/recipes/roster.ts`）—— 
`isolated single object on a plain background, one continuous solid part, …`。
**不要在这里重复 STYLE_BASE 里已有的词**，重复会让 faithful 模式过度收敛。

## 材质与工艺

亮面白色注塑壳 + 一整块黑色玻璃面板（脸）；耳朵是同色薄片；轮子是深灰软胶。只有两种颜色、三种材质 —— 桌面产品的克制。

## 它区别于其它 archetype 的那一点

4–8 个自由度就够它有人格。这是跟 40+ DoF 人形**完全不同的机器人经济学**：表情跑在屏幕上，身体只要能转头和滑动。

## bbox_condition

**建议偏差**。`screenface` 的 bodyPlan 是 head 1.9 —— 脸就是全部。`head` 从 `[260,280,300]` 改成 `[380,320,260]`（宽、扁、浅 —— 一块屏的形状）。
