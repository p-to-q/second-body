# 31 · 机器人谱系 ↔ roster —— 16 个 archetype 的对表

> 2026-09-13。项目负责人给的那张真实机器人谱系表，逐行对到 `packages/factory/recipes/roster.ts`
> 的现有条目上，配参考图来源与 prompt。
>
> **这一页只对表、只报告，不改 roster。** `roster.ts` 由身体方案那条线负责。
> 每个条目的详细来源记录在 `assets/intake/<id>/SOURCES.md`，prompt 在同目录 `prompt.md`。
> 图不进版本库（`.gitignore` 有意为之），所以那两份文件就是唯一能重放的东西。

## 0. 先说一个反直觉的结论

**厂商官方图基本上都不能直接用。**

我逐张目视核验了 20 多张候选图。失败模式高度一致：厂商的英雄图是**电影感**的 ——
暗背景、强轮廓光、真人模特、场景道具、九宫格拼图、参数标注。
这跟 `docs/30` §2 要的「平光、干净背景、单主体」正好相反。

过关的那三张来自两个地方，都不是营销物料：

- **政府/公有领域的技术存档**（DARPA 拍的 2013 Atlas）—— 为了记录，所以是白底棚拍
- **为经销/媒体准备的产品渲染图**（Waymo press kit 的带 alpha PNG）—— 为了让别人拿去合成，所以背景是透明的

这条经验值得写进 `docs/30` §3：**找「为了被二次使用而拍的图」，不要找「为了好看而拍的图」。**

## 1. 对表

`bodyPlan` 一列是 `roster.ts` 里 `BODY_PLAN` 的现状；空 = 标准人形比例。

| # | archetype | 代表机器人 | roster id | 参考图 | 现在的 `bodyPlan` |
|---|---|---|---|---|---|
| 1 | 🧍 人 | Atlas (Boston Dynamics) | `athlete` | ✅ **1 张**（DARPA, PD, 3738×5147） | `{limb:1.1, torso:1.05, arm:1.05}` |
| 2 | 🧍 产品人 | Figure 03 (Figure AI) | `industrial` | ❌ 未找到 | `{torso:1.08, limb:0.98}` |
| 3 | 🧍 劳工人 | Optimus (Tesla) | `porcelain` | 🟡 **1 张有条件**（Commons, PD） | —（基准比例） |
| 4 | 🧥 家庭人 | NEO (1X) | `softwear` | ❌ 未找到 | `{limb:0.95, torso:1.12, head:1.05}` |
| 5 | 🧒 小人 | G1 (Unitree) | `compact` | ❌ 未找到 | `'stub'` |
| 6 | 🦿 鸟腿人 | Digit (Agility) | `digitigrade` | ❌ 未找到（但**拿到了官方 press kit ZIP**） | `{kind:'quadruped', leg:1.28, arm:1.1}` |
| 7 | 🐕 机器狗 | Spot (Boston Dynamics) | `patrol` | ❌ 未找到 | `'quadruped'` |
| 8 | 🐕 消费机器狗 | Go2 (Unitree) | **无条目** → `_new/consumer-quadruped/` | ❌ 未找到 | — |
| 9 | 🛞🐕 轮足兽 | W1 (LimX) | `wheelleg` | ❌ 未找到（**产品已下架**） | `{kind:'quadruped', limb:0.85, torso:1.1}` |
| 10 | 🤖 小怪物 | BDX droid (Disney) | `droid` | ❌ 未找到（**且建议不喂**，见 §4） | `{kind:'stub', head:1.5}` |
| 11 | 🐶 宠物 | Aibo (Sony) | `petbot` | ❌ 未找到 | `{kind:'quadruped', limb:0.7, torso:1.12}` |
| 12 | 🐹 毛球 | Moflin (Casio) | `furball` | ❌ 未找到 | `{limb:0.25, torso:2.0, head:0.6}` |
| 13 | 🐱 桌宠 | Loona (KEYi) | `screenface` | ❌ 未找到 | `{head:1.9, torso:0.95, limb:0.8}` |
| 14 | 🟡 球 | Ballie (Samsung) | `orb` | ❌ 未找到 | `{limb:0.2, torso:2.2, head:0.4}` |
| 15 | 🦾 移动机械臂 | Stretch (Hello Robot) | `manipulator` | 🟡 官方白底图，但一张里 5 台，需裁切 | `{arm:1.5, leg:0.82, torso:0.95}` |
| 16 | 🚗 无人车 | Waymo | `autonomous` | ✅ **2 张**（press kit, 带 alpha, 15188px） | `{limb:0.5, torso:1.6, head:0.7}` |

**16 行全部有交代：找到 3 张合格 + 2 个有条件 + 11 个未找到。**

## 2. roster 里没有对应条目的（需要新建）

只有一个：

- **Go2（消费机器狗）**。`patrol` 已经被 Spot 占了，而 Go2 跟 Spot 的差别是真的：
  同一套四足拓扑，外壳从「能挨撞的工程黄 + 防撞肋 + 外露螺栓」变成「能摆在客厅的哑光白」。
  这个分野在**表面处理**不在骨架，所以它应该是一个 `light` coverage 的新条目、
  `base: 'patrol'`，只生成 6 个标志性槽位就够（≈3 credits，见 `docs/14` §3）。
  材料已经放在 `assets/intake/_new/consumer-quadruped/`（含 `note.txt`）。

## 3. 孤儿：roster 里有、谱系表里没有的

这三个都是 `archetype`，都不是错误 —— 它们是这件作品自己的主张，不是取材自现实产品：

| id | 为什么它不在谱系表里 |
|---|---|
| `xeno` | 生物机械造型传统。取材自电影美术，不是某台真机器人 |
| `coral` | roster 自己的注释写着 `reference: '—'` ——「最接近原作」。它**故意**不像任何东西 |
| `field` | `source: 'procedural'`，不生成、不花 credits。只有关节球和张力线 |

另有 `guest.founder`（空位，`clearance: public-figure`）和 4 个 `character`
（`char.dumpling` / `char.ghost` / `char.paper` / `char.idol`），
按 `docs/14` §1 它们本来就是另一种 kind，不该出现在 archetype 谱系表里。

## 4. `bodyPlan` 和 archetype 明显不符的

**只列出来，不改。** 排序按「离谱程度」。

### 4.1 `digitigrade` 是 `quadruped`，但 Digit 是**两足** —— 2026-09-13 已改

> **已修正。** 现在是 `{ leg: 1.28, arm: 1.1 }`（`kind` 缺省 = 两足）。
> 顺手一起做的：这个条目整具换成了 Agility Cassie 的真实几何。
> 换网格和改拓扑是同一件事的两面 —— 参考图找不到、拓扑又写错，
> 根子都是"没有真的去看那台机器长什么样"。下面是当初的判断，原样留着。

```ts
digitigrade: { kind: 'quadruped', leg: 1.28, arm: 1.1 }
```

这是最实质的一个错。Digit 的全部意义是 **human manipulation envelope + animal locomotion
morphology** —— 上半身有躯干和两条手臂（去够人的货架），下半身是两条反关节鸟腿。
把它做成四足，`arm: 1.1` 这个参数就没有落点了，而「鸟腿」这个卖点也消失了
（四足本来就都是兽腿，不构成对比）。它应该是**两足 + 反关节小腿**。

### 4.2 `orb` / `furball` 是人形骨架，但球和毛球没有肢体

```ts
orb:     { limb: 0.2, torso: 2.2, head: 0.4 }
furball: { limb: 0.25, torso: 2.0, head: 0.6 }
```

两个都只改了比例，拓扑还是人形。`limb: 0.2` 是「把四肢缩到很短」，不是「没有四肢」——
观众看到的会是一个抱着自己的小人，不是一个球。

对照：`char.dumpling`（也是软的圆的）已经拿到了 `{kind:'mass', …}`，
`coral` 和 `char.ghost` 也是。**`orb` 和 `furball` 是同一类，却没有拿到 `mass`。**
`roster.ts` 的注释自己说了理由 ——「手办式的刚体件恰恰是它们最不该有的读法」——
这句话对球和毛球一样成立。

### 4.3 `autonomous` 是人形骨架，但 Waymo 是一辆车

```ts
autonomous: { limb: 0.5, torso: 1.6, head: 0.7 }
```

一个会走的车身。比例改了，但它仍然有两条腿两条手臂。
这是 16 个里**形态偏离最远**的一个：真实的 Waymo 没有任何肢体，
它的「运动」是四个轮子和一个转动的传感器穹顶。

### 4.4 `manipulator` 有两条腿，但 Stretch 没有腿

```ts
manipulator: { arm: 1.5, leg: 0.82, torso: 0.95 }
```

Stretch 是**轮式底盘 + 一根伸缩立柱 + 一条水平伸缩臂**。
`leg: 0.82` 把腿缩短了 18%，但腿还在。而这个条目的 tagline 恰恰是
「如果地面本来就是平的，为什么要花巨大能量去模拟两条腿」——
现在的 bodyPlan 正在做它自己反对的那件事。

### 4.5 `screenface` 有两条腿，但 Loona 是轮式

```ts
screenface: { head: 1.9, torso: 0.95, limb: 0.8 }
```

比上面几个轻。桌宠的下半身是一个两轮底座，不是腿。
但它的辨识度确实主要在那张大脸上，`head: 1.9` 抓住了要害，所以这一条优先级最低。

## 5. 现在最不像的几个

见报告。简短版：**`orb` / `autonomous` / `furball` / `digitigrade` 四个**，
理由是 §4 的拓扑不符 × `docs/18` 那句「辨识度住在整体剪影里」——
剪影错了，零件做得再好也救不回来。

## 6. 下一步（给素材工厂）

1. `athlete` 和 `autonomous` 的图已经落到 `assets/intake/` 里了，**可以直接跑 `/dev/anchor.html`**（不花钱）
2. `porcelain` 的图有一根隔离带绳横穿小腿 —— 先在 anchor 上看一眼再决定
3. `digitigrade`：解开 Agility 的官方 press kit ZIP（链接在它的 `SOURCES.md` 里，已验证可下载）
4. 剩下 11 个：`SOURCES.md` 里逐条写了查过哪些路、为什么不行、下一步该开浏览器手动存哪一张
5. `autonomous` 和 `wheelleg` 的 `seedSalt` 都是 1（第一遍就是坏的）。
   `autonomous` 现在有了带 alpha 的高质量参考图 + `prompt.md` 里建议的车身 bbox，值得重锚一次
