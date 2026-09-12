# prompt —— `compact`（G1（Unitree））

> 🧒 小人 / 小型 humanoid

`geometry_instruct_mode: faithful`（docs/07 §2）下，prompt 是**方向性引导**不是描述；
真正定形状的是参考图和 `bbox_condition`。所以下面这段只说「往哪个方向偏」。

## 形态（英文，给 Rodin）

```
a compact humanoid limb segment with chunky friendly proportions, glossy pearl-white outer
shell over a machined silver-grey inner frame, short and stout, generous corner radii
```

拼接时在后面接 `STYLE_BASE`（`packages/factory/recipes/roster.ts`）—— 
`isolated single object on a plain background, one continuous solid part, …`。
**不要在这里重复 STYLE_BASE 里已有的词**，重复会让 faithful 模式过度收敛。

## 材质与工艺

亮面珍珠白注塑壳 + 银灰机加工内架；头部是一整块哑光黑罩壳，上面一条发光的弧形灯带；手脚是纯黑软胶。玩具级的表面精度，不是工业级。

## 它区别于其它 archetype 的那一点

它改变的不是技术是**尺度** —— 人形只有 130cm 高，于是「机器人闯进家里」的威胁感消失了。

## bbox_condition

用默认。`compact` 的 bodyPlan 是 `stub`（短肢），拓扑层已经处理了矮壮比例，bbox 不必再压。
