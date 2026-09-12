# prompt —— `digitigrade`（Digit（Agility Robotics））

> 🦿 鸟腿人 / 非人腿 humanoid

`geometry_instruct_mode: faithful`（docs/07 §2）下，prompt 是**方向性引导**不是描述；
真正定形状的是参考图和 `bbox_condition`。所以下面这段只说「往哪个方向偏」。

## 形态（英文，给 Rodin）

```
ONE single connected solid part, not a scene and not several separate objects: a reverse-
jointed digitigrade leg segment, a long slender bird-like shank tapering downward, a
backward-bending knee housing fused to its upper end, all volumes merged into one continuous
body
```

拼接时在后面接 `STYLE_BASE`（`packages/factory/recipes/roster.ts`）—— 
`isolated single object on a plain background, one continuous solid part, …`。
**不要在这里重复 STYLE_BASE 里已有的词**，重复会让 faithful 模式过度收敛。

## 材质与工艺

碳纤维/深灰复合材料的细长小腿杆 + 浅灰机加工的执行器筒包；膝部是一整块封闭的壳，看不到连杆；脚是一块很小的平板 —— 整条腿的质量都往上堆，这是反关节腿的力学要求。

## 它区别于其它 archetype 的那一点

人的手 + 鸟的腿。它是唯一一个把**运动形态**和**操作形态**拆开各自最优的条目 ——上半身要够到人的货架，下半身不必假装是人的腿。

## bbox_condition

**建议偏差**。默认 `shin` 是 `[100,320,100]`，对鸟腿还不够细长。建议 `[80,400,80]`；`foot` 从 `[160,200,320]` 改成 `[140,120,300]`（更扁更小的脚板）。理由：反关节腿的辨识度全在「小腿极细 + 脚极小」这个对比上，bbox 是控制这个对比最直接的手段（docs/07 §5 U5：bbox 对 Gen-2.5-Low 的比例误差 <3%）。
