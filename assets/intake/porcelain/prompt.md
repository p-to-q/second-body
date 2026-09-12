# prompt —— `porcelain`（Optimus（Tesla））

> 🧍 劳工人 / 大众想象最强

`geometry_instruct_mode: faithful`（docs/07 §2）下，prompt 是**方向性引导**不是描述；
真正定形状的是参考图和 `bbox_condition`。所以下面这段只说「往哪个方向偏」。

## 形态（英文，给 Rodin）

```
a smooth closed humanoid shell segment in satin silver-white polymer, large uninterrupted
surfaces with soft chamfers, a matte black structural collar exposed at the joint end,
minimal seams
```

拼接时在后面接 `STYLE_BASE`（`packages/factory/recipes/roster.ts`）—— 
`isolated single object on a plain background, one continuous solid part, …`。
**不要在这里重复 STYLE_BASE 里已有的词**，重复会让 faithful 模式过度收敛。

## 材质与工艺

缎面银白注塑面板（不是亮面，是低反射的缎光）+ 哑光黑关节罩；面板之间是宽而均匀的缝；整条肢体只有两种材质，这是它「太完美」的来源。

## 它区别于其它 archetype 的那一点

它是这 16 个里被**看过**次数最多的一个 —— 大众想象里的「机器人」现在长这样；白面板 + 黑关节罩这套语言就是它定的。

## bbox_condition

用默认。`porcelain` 是全套比例的基准条目，不能动。
