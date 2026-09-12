# 12 · SPEC · Themes & the Choosing Screen

## 1. 什么是 theme

**theme = 观众在开场轮播里选的那个"世界"。** 它决定：
部件的造型语言、材质调色板、以及这具身体在作品里承担的那种张力。

`theme` 与 `tier` 是**正交的两条轴**，不要混：

```
theme  ← 观众选的        （决定它是什么）
tier   ← 观众的动作挣来的  （决定它有多复杂）
```

权威定义在 `packages/factory/recipes/roster.ts`，运行时从 `parts.json` 的 `themes[]` 读。
`PartMeta.family` 就是 theme id（历史字段名，语义相同）。

## 2. 有哪些条目 → 见 `docs/14-SPEC-roster.md`

> ⚠️ 本节原来是一张六主题表，已被 **`docs/14-SPEC-roster.md`** 取代。
> 现在是 18 个机器人物种 + 4 个原创角色 + 1 个嘉宾空位，
> 并且多了 `kind` / `clearance` / `coverage` / 形态空间坐标这几个维度。
> 权威定义在 `packages/factory/recipes/roster.ts`。
>
> 本文档剩下的 §3（anchor 一致性流程）、§4（人工参考图）、§5（开场选择页）、§6（运行时作用点）**仍然有效**，
> 只是把"主题"读作"roster 条目"。

## 3. 主题内的一致性靠 anchor 图，不靠形容词

一个主题 20 件部件如果各自从文字生成，风格只能碰运气（docs/09 U6）。流程是：

```
1. text-to-3D 生成 spine.<theme>.a                     （造型语言的第一次落地）
2. /dev/anchor.html 把它渲染成 assets/refs/<theme>/_anchor.png
3. 该主题剩余 19 件全部以这张图做 image-to-3D
```

这三步在 `factory:generate --theme=<id>` 里是**两阶段**的：第一次跑生成几何并停下，
提示你去开 anchor 页面；再跑一次才批量生成。显式化这一步是故意的 ——
风格一致性是主题成不成立的关键，不该悄悄退回纯文字生成。

`--no-anchor` 可以跳过（知道自己在放弃什么再用）。

**为什么不用 Rodin 的 `preview_render`**：实测在本账号/Gen-2.5-Low 与 Medium 上，
渲染 job 都会单独 Failed（docs/09 U12）。所以参考图由我们自己渲。

## 4. 人工参考图

把任何图片放进 `assets/refs/<theme>/`（不以 `_` 开头），该主题就改用这些图。
**注意 image-to-3D 的目标是还原图里那个物体** —— 喂真实产品照，产出就是那台机器的三维复制。
细节与取舍见 `assets/refs/README.md`。

## 5. 开场选择页（Choosing Screen）

### 5.1 交互

```
进入 → 六张卡片在一条竖直螺旋上滚动，远离的卡片溶解成有序抖动(dither)
     → 选中一个主题 → 卡片冲向镜头 → 溶解 → 直接进入身体
     → 30 秒无操作 → 自动随机选一个（现场不能停在菜单上）
```

- 卡片图 = 该主题的 `_anchor.png`（我们自己渲的，版权自有）。
- `field` 没有 anchor，用程序化的粒子卡片。
- 选择结果写进 URL（`?theme=patrol`），刷新可复现；现场遥控器/键盘数字键 1–6 直选。

### 5.2 实现：移植 `dither-blur-carousel`

- 来源：https://github.com/Yousuf-developer/dither-blur-carousel
- **代码 MIT** © 2026 Yousuf Soomro —— `gl/`、`components/`、`app/` 都可用、可改、可商用，
  **必须保留版权声明**（我们把 LICENSE 原文放进 `packages/app/src/vendor/dither-carousel/LICENSE`）。
- **`public/` 里的图片和字体不在 MIT 范围内**，作者明确说了是占位、来源不明、不得复用。
  → 我们一张都不用。卡片图用自己的 anchor 渲染，字体用系统字体或自己有授权的。
- 移植范围：`gl/` 是框架无关的 three.js 代码（scene / post / trail / shaders / config），
  直接搬；`components/Carousel.jsx` 是 React 外壳，我们用一个 ~60 行的原生 TS 替代。
- 依赖差异：它用 `lil-gui`（调参面板）和 `gsap`（缓动）。
  lil-gui 只在 dev 需要 → devDependency；gsap 的用法很轻，能用自己的缓动函数替掉就替掉（P6 依赖纪律）。

### 5.3 验收

见 `docs/11-TASKS.md` T-18。

## 6. theme 在运行时的作用点

| 位置 | 怎么用 theme |
|---|---|
| `genome.ts` | 候选部件先按 `family === genome.theme` 过滤；tier 3 允许 1–2 个槽位跨主题"杂交" |
| `materials.ts` | `ThemeDef.palette` 给出 `[primary, secondary, accent]` |
| `stage.ts` | 每个主题一套灯光/背景/后期微调（porcelain 偏冷白，patrol 偏工业黄，xeno 偏冷蓝） |
| `creature.ts` | `field` 主题走程序化几何分支，不读 `parts.json` |
| 慢回路 | 观众剪影 + **该主题的 anchor 图**一起提交 → 生成的零件天然落在主题风格里 |

最后一条很重要：慢回路如果只喂剪影，长出来的零件会和身体格格不入。
把主题 anchor 作为第二张参考图一起送，是让"你的零件"仍然属于这个世界的关键。
