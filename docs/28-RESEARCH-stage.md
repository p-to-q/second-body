# 28 · Research — 舞台美学：同类作品做了什么，我们该改哪个数

> 写这份文档的起因：项目负责人看了实拍截图，评语是"不好看"。
> 所以这份文档不是观后感。**每一节的结构都是「他们做了 X → 所以我们把 Y 改成 Z」**，
> 改不到具体参数的观察一律不写。
>
> 取证图：`scratch/evidence/stage-*.png`。第一轮的两张（`stage-before-default.png` /
> `stage-before-idle.png`）是本文引用的"改前"。

---

## 0 · 先把"不好看"翻译成数字

审美判断没法直接改代码，先量。`scratch/scan.py` 把一张截图按行求平均亮度
（后期里有 ±5/255 的颗粒，单像素采样量不出东西）。对改前的空场图
`stage-before-idle.png` 取第 40–480 列：

| 现象 | 实测 | 说明 |
|---|---|---|
| 地平线硬边 | y=240→249，**9 个像素内跳 +5.6/255**，单调 | 这就是"一条硬边地平线"。不是错觉 |
| 天空渐变 | 上半屏 225 行总共只有 **4.2/255** | 这就是"死灰"。几乎是一块纯色 |
| 地面 | y=250 的 37.4 → y=425 的 33.7 → y=725 的 38.7 | 先暗后亮，读不出任何纵深 |

同一把尺子量改后的 `stage-after-idle.png`（同样第 40–480 列）：
原来那条边所在的 y=200–284 一带，整段**单调平滑，总变化 0.26/255**；
整张图（除身体外）最大的 4 像素跳变只有 **2.65/255**，而且出现在页头文字上，不在地平线上。
**那条边不是被调淡了，是不存在了。**

顺带得到一个**几何事实**，它后面反复出现：相机水平架在眼高 1.58m，
所以**地平线以下全是地面**。1600×900 的画面里"天"只有最上面约 25%，
其余 75% 是地板。**背景的功夫大部分要花在地面上，不是天上。**

另一个必须记下来的坑：改前代码的注释写着"地面远端的颜色**正好等于**背景布的颜色，
所以看不到盘子的边"。**这句话在纸面上成立，在管线里不成立** ——
地面是 `MeshPhysical` 的 emissive，背景布是 `MeshBasic` 的 color，
两条着色路径并不保证输出同一个数值，实测差 5.6/255。
结论提前：**任何"两个材质必须输出同一个颜色"的设计都会在某个 three 版本上裂开。**

---

## 1 · Universal Everything：为什么"纯色虚空 + 一个发光体"就够了

`Future You`（2019，Barbican「AI: More than Human」开场作品）把观众的动作映射到一个
"合成的、更敏捷的你"身上，一次会话生成 47,000 种可能形态之一。
`Walking City`（2014）是同一条语言的另一头：**白色背景，一个持续行走的形体在画面正中**，
"焦点是材质本身在演化、自己讲出一段叙事"。

三份材料里能反复读到的共同点，以及它落到我们哪个数上：

| 他们做的 | 我们改的 |
|---|---|
| 背景是**一个颜色**（白 / 黑），没有场景、没有地平线、没有道具 | 天幕改成 `skyTop` + 一团晕两个颜色，**删掉上下分色的背景布渐变**（那条分界线就是地平线）|
| 形体**永远在画面正中**，构图不靠位置制造张力，靠形体自己的变化 | 保留 `FRAMING.centerLift`，**不去搞偏心构图**；改为让场景用 `frameLift` 微调留白（±0.05 身高）|
| 每个观众得到一个**独有**的形体 | 已经有了（genome）。舞台这边对应的是：场景要按物种变，见 §5 |
| 亮底（`Walking City`）和暗底（`Future You` 展场照）**两种都成立**，但**从不混合** | 四套场景里 `gallery` 是亮底、其余三套是暗底；**没有一套是中灰**。改前那张恰恰是中灰 |

> 关键的一条反推：一个纯色虚空之所以成立，是因为**它没有第二个信息**。
> 改前那张图有三个互相打架的信息：上半灰蓝、下半浅灰、中间一条边。
> 删掉其中两个，剩下的那个才开始像"场"。

参考：
- [Universal Everything — Future You](https://www.universaleverything.com/artworks/future-you)
- [Colossal：Futuristic Shapes Mirror Human Movement](https://www.thisiscolossal.com/2019/05/future-you-universal-everything/)
- [Universal Everything — Walking City](https://www.universaleverything.com/artworks/walking-city)
- [Google Arts & Culture：Barbican 展场照](https://artsandculture.google.com/asset/installation-photo-from-the-barbican-s-ai-more-than-human-exhibition-featuring-universal-everything-s-future-you-barbican-centre/5gEzOZMH83Xsqg)

---

## 2 · 影棚的 cyclorama（无缝背景纸）：地平线是**被造出来的**，不是天然的

摄影棚解决"背景里不能有线"这个问题已经一百年了，做法叫 cyclorama / infinity cove：
一面**弧形转折**的墙，墙与地板之间没有角，
"seamless cyclorama walls eliminate horizon lines"；
布光是"两侧向内打的大面积光源，重叠开来，让衰减从一边到另一边都是平滑的"。

两条能直接抄的结论：

**(a) 不要让两个面在一条线上相遇。** 现场的做法是弧形转折；我们的等价做法是
**让地面在到达几何地平线之前就化掉**。于是引入距离雾：

```
scene.fogNode = fog(skyNode, densityFogFactor(uFogDensity))
```

雾色**是一个节点**（`fog(color, factor)` 的 color 可以是 Node），所以直接喂天幕函数本身。
这样地面不是"淡成一个正好相等的颜色"，而是**被雾化进天幕**——
同一个表达式、同一个输出阶段，**结构上不可能出现接缝**。

密度怎么定：地面圆盘的边在 48m。密度 0.021 时那里只雾掉 64%，
剩下 36% 的受光地面就是一条新的地平线。要让 30m 处就雾到 ~99%（`(d·30)² ≈ 5`）需要 `d ≥ 0.074`。
四套场景取 0.078 / 0.105 / 0.120 / 0.130，上限 `STAGE.fogDensityMax = 0.16` ——
身体在 2.8m 处，密度 0.16 时它已经损失 ~18% 对比度，再高雾就开始吃身体了
（`test/scenes.test.ts` 把这条钉住）。

**(b) 光的衰减要"从一边到另一边平滑"，不是上下分层。**
所以天幕不再是 `mix(bgBottom, bgTop, y)`（一条横向分界线 = 一条地平线），
而是**身体背后的一团圆晕**：

```
halo = clamp(1 - dist(screenUV, glowCenter)/radius)^glowSoft
sky  = mix(skyTop, skyGlow, halo)
```

圆的东西没有分界线，而且自带一个视觉重心 —— 正好钉在身体背后。

> **踩过的坑（写下来免得再来一次）**：晕心有一条**几何下限**。
> 相机水平架在 1.58m，晕心如果放在胸口（世界 1.16m），它整团都在地平线以下、
> 被地面完全挡住，观众一点都看不到。必须 `centerY + lift×height > eyeHeight`，
> 对 1.57m 的人形就是 `glowLift > 0.49`。第一版取 0.18–0.34，全部白做。
> 现在这条有单测（`scenes: 晕心必须高过眼高`）。

参考：
- [Infinity cove（Wikipedia）](https://en.wikipedia.org/wiki/Infinity_cove)
- [Cyclorama (Cyc Wall) Photography Guide](https://www.fdphotostudio.com/cyclorama-cyc-wall-photography-all-you-need-to-know/)
- [Lighting Cyclorama Backdrops for Seamless Sets](https://www.videomaker.com/article/c13/17957-lighting-cyclorama-backdrops-for-seamless-sets/)

---

## 3 · 接触阴影：为什么"影子很长很虚"反而让人飘起来

VFX 合成里这件事有专门的名字（occlusion shadow / contact shadow）：
"Occlusion shadows help ground our CG characters and really connect them with the environment";
没有它，角色"looks like they're floating above the ground"。
实时端的标准解法是 SSAO / contact shadow —— 在**物体与地面相接的地方**加暗。

我们改前的情况恰好是这条的反面教材，两个具体原因：

**(a) 主光太低。** `STAGE.keyDir = [1.5, 2.35, 1.85]`，仰角
`atan(2.35 / √(1.5²+1.85²)) = 44.6°` → 投影长度 ≈ 身高 × 1.0 ≈ **1.7m**。
一条和人一样长的虚影子，视线自然跟着它走到两米外，脚下反而没有东西。
→ 四套场景各自把主光仰角提到 **68°–78°**（`keyDir` 现在归场景管，`STAGE.keyDir` 保留作缺省）。
投影缩到 0.2–0.4× 身高，注意力回到脚下。

**(b) "接触阴影"画错了地方。** 改前那一项是**世界原点上一个半径 0.62m 的圆斑**：
它不跟脚走，而且 1.24m 宽的一摊读作"地上有块污渍"，不读作"接触"。
→ 拆成两项：
- **大而淡的一摊**（`contactStrength` / `contactRadius`）：中心改为跟着身体的落点质心走，
  读作"这里有东西挡住了环境光"。
- **脚下紧的一圈**（`contactCore` / `contactCoreRadius`，半径 0.20–0.26m，
  上限 `STAGE.contactCoreRadiusMax = 0.34`）：读作"它**踩在**地上"。

落点从骨架来（`framing.ts` 的 `contactPoints()`，`stage.frame(skeleton)` 每帧喂进来），
所以两足给 2 个点、四足给 4 个。两条踩出来的规则：

- **一只脚只出一个落点。** 参考站姿里脚踝 (0.10, 0) 与脚尖 (0.10, 0.16) 相距 0.16m，
  两脚之间相距 0.20m。阈值必须落在这两个数之间：取 0.12 会让每只脚下面出现
  **两个黑圆斑**；取 0.22 又会把另一只脚一起吞掉。现值 **0.19**。
- **离地超过 `STAGE.contactLiftRange = 0.22m` 的端点不算落点。**
  不加这条的话，A-pose 的手尖（离地 0.73m、在 xz 上离脚很远，去重挡不住）会占掉名额，
  画面上两只手底下各多出一摊阴影。半径随离地高度连续收到 0 ——
  **抬起的脚不该还拖着一摊黑影**，那比没有接触阴影更假。

两条都有单测。

参考：
- [Ben McEwan — Occlusion shadows ground CG characters](https://benmcewan.com/blog/2019/10/07/create-your-own-ambient-occlusion-in-nuke-using-rayrender/)
- [Fast Soft Shadow with SSAO for Real Time Rendering (ACM)](https://dl.acm.org/doi/pdf/10.1145/3038884.3038896)

---

## 4 · 地面反射：为什么我们只映天幕，不映身体

评语点名要求"要么真做反射，要么彻底不做，不要中间态"。三条路各自算过：

| 方案 | 代价 | 判决 |
|---|---|---|
| 平面反射（`three` 的 `reflector()`）| **把整个场景再渲一遍**。实测 draw 17 → ~35，而 `BUDGET.maxDrawCalls = 40` | ❌ P5 说超了就是 bug，不是"以后再优化" |
| 屏幕空间反射（`SSRNode`）| 一条全屏 pass。但它**活在后期链里** | ❌ `?nopost=1` 时整条消失 —— 那就不是"降级"，是**构图变了**。降级阶梯必须只掉画质，不掉内容 |
| **映天幕**（现选）| 一次额外的天幕求值，**零额外 pass、零额外 draw** | ✅ |

映天幕的做法是把天幕绕地平线**翻折**再采一次：

```
mirrored = vec2(screenUV.x, horizonY*2 - screenUV.y)
```

这不是一个近似。针孔相机里，屏幕纵坐标到地平线的偏移正比于 `tan(俯仰角)`，
而镜面反射就是把俯仰角取反 —— 所以**线性翻折在屏幕空间里是精确的**（对无穷远的天幕而言）。
菲涅耳用 `smoothstep(0.15, 3.5, 地面距离)` 近似：脚边几乎看不到反射，远处才越来越像镜子，
于是倒影是从身体脚下**长出去**的，不是糊在脚上。

四套里 `gallery` / `void` 的 `groundReflect` 是 **0**（彻底不做），
`tide` 0.95、`backlit` 0.55。单测 `地面反射只有"真做"和"彻底不做"两种` 挡住中间态。

> **另一个踩出来的结论：不要靠降低地面粗糙度来"做湿"。**
> 第一版给 `tide` 的地面 `roughness = 0.10`，结果画面左下出现一团巨大的白斑 ——
> 那是**轮廓光在近镜面地板上的高光**，它既不跟身体走也不跟天幕走，纯属噪音
> （`wip-tide` 那几轮全被它毁掉）。让地面读作"湿"的是**映出来的那张图**，不是高光点。
> 现在四套的 `groundGlossNear` 都 > 0.6，单测挡住。
> `tide` 的"水"靠另一件事：`groundRipple` 给倒影的采样坐标加两列不同频率的波
> （同频会变成搓衣板）。**一张不动的镜面读作"抛光地板"，动起来才读作"水"。**

---

## 5 · 多套场景：teamLab / Random International 的共同前提是"暗"

`Rain Room`（Random International, 2012）的视觉全部来自一件事：
**大灯从侧面垂直于落水打**，把每一滴照亮；而这只有在**暗房里**才成立。
teamLab / Refik Anadol 的展场记录也是同一个前提 —— 先有黑，才有光可言。

对我们的含义不是"全都做成黑的"，而是：**一套场景必须对"亮"这件事表态。**
改前那张中灰既没表态亮也没表态暗，所以什么都托不住。四套场景各自表态：

| 场景 | 天幕 | 布光 | 服务于 | 情绪 |
|---|---|---|---|---|
| `gallery` 白展厅 | 亮（`skyGlow` 0.78 线性）| 漫射为主，`rim < key`，主光 73° | 亮而无彩的物种（porcelain / coral / field）| 被展出的标本；临床的、无处躲藏的注视 |
| `void` 深空 | 近黑 + 头后一团紧的晕 | `key` 顶光 78°，`hemi` 压到 0.22 | 深色甲壳与工业物种（xeno / industrial）| 孤立的样本；没有房间也没有出口 |
| `tide` 夜潮 | 深蓝 + 一轮月晕 | `rim` 1.6，地面映月晕 + 涟漪 | 会发光会流动的物种（coral / glow / mass 团块）| 夜里独自站在没到脚踝的水里 |
| `backlit` 逆光 | 身后一块亮盘（`skyGlow` 0.62）| **`rim / key = 11.4`**，前脸几乎不打光 | 机械感强、轮廓好看的（`humanLike` 低）| 门开了，那个东西正从光里走出来 |

挑选规则只有三条（23 个 roster 条目不可能有 23 个 if，判据和 `look.ts` 同源）：

```
luma > 0.30              → gallery   亮物种放进深空会消失在自己的高光里
humanLike < 0.35         → backlit   像机器 → 轮廓是它最好看的地方
lifeLike  > 0.62         → tide      像活物 → 倒影给它重量
其余                      → void
```

`?scene=<id>` 覆盖；认不出来的值**不静默退到某一套**，而是当作没指定（单测钉住）。

参考：
- [Random International — Rain Room](https://www.random-international.com/rain-room)
- [Rain Room | MoMA](https://www.moma.org/calendar/exhibitions/1352)
- [Rain Room（Wikipedia）](https://en.wikipedia.org/wiki/Rain_Room)

---

## 6 · 粒子为什么"几乎看不见"——它不是淡，是**存不下来**

改前 `uSize = 0.016`（公告牌半宽，米）。在 2.8m 外、45° fov、1600×900 的画面上，
一颗粒子约 **7 像素**；再乘上 `opacityNode` 的基础系数 0.35，
单颗粒子对一个像素的贡献不到 **1/255** —— 它不是"淡"，是在 8bit 输出里**根本存不下来**。

→ `STAGE.particleSize` 提到 tuning 里，场景用 `particleSize` 在它上面乘：
`void` 1.9、`tide` 1.7、`backlit` 2.1。
`gallery` 是 **0**：加性混合的粒子在亮底上等于不存在，
与其给一个看不见的值，不如明说这套没有粒子（它的空场靠明亮的无缝背景本身不黑屏）。

`backlit` 的粒子最重（2.2 增益 × 2.1 尺寸），因为**逆光是唯一能让尘埃真的被看见的布光**
—— 这也正是 `Rain Room` 的那条原理。

另外确认一件事：ALIVE 时粒子淡到 0 是**规格**（docs/23 §S4：共舞时满屏只有身体、地面、影子），
不是 bug。所以"粒子几乎看不见"这条只对 IDLE / ENTERING 生效。

---

## 7 · 一条非审美的结论：`screenUV.y` 在这条管线里是从上往下的

天幕是屏幕空间的，所以晕心要从世界坐标换算到 `screenUV`。这里有两个坑，都花了时间：

1. **不能用 `Vector3.project(camera)`。** 相机的 `matrixWorldInverse` 要到渲染那一刻才更新，
   在 `fitCamera()` 里它还是上一帧（首帧是单位阵）的 —— 算出来的晕心落在画面左下角。
   而这套取景本来就是**自己算出来的**（画面正好框住以 `centerY` 为中心、高 `h` 的一块世界），
   所以有闭式解，不需要问相机：`screenY = 0.5 − (worldY − centerY) / h`。
2. **那个减号是实测出来的。** `screenUV.y` 在这条管线上 **0 在顶端**。
   按"0 在下"写的时候，晕心永远出现在画面**底部**，而调试探针读出来的 `uGlow.y`
   和手算完全一致 —— 差的只有这一个符号。上游文档两种约定都找得到，
   所以代码里那条注释写明"以实测为准，别按记忆改回去"。

---

## 8 · 改了什么（对照表）

| 症状（项目负责人的原话） | 根因 | 改动 |
|---|---|---|
| 死灰的默认渐变 + 一条硬边地平线 | 上下分色的背景布 + "两个材质输出同一颜色"的假设不成立（实测差 5.6/255）| 天幕改成屏幕空间函数（天顶色 + 身体背后一团晕）；地面靠**距离雾**化进同一个函数 |
| 地面反射弱到几乎没有，又不是完全没有 | 中间态 | 明确二选一：`gallery`/`void` 为 0；`tide`/`backlit` 映天幕（精确的屏幕空间翻折，零额外 pass），`tide` 再加涟漪 |
| 影子长而虚，脚底下没有接触阴影 | 主光仰角 44.6° → 影长 1.0×身高；接触阴影画在世界原点、半径 0.62m | 主光提到 68–78°；接触阴影拆成"大而淡的一摊"+"脚下紧的一圈"，落点由骨架给 |
| 人贴着画面上半部，底下空一大片 | 底下那一片**没有东西**（不是位置问题）| 地面拿到雾梯度、接触阴影、（部分场景）倒影；场景另有 `frameLift` 微调留白 |
| 粒子几乎看不见 | 7px × 0.35 不透明度 ≈ 存不进 8bit | `particleSize` 场景可调，暗场景 1.7–2.1×；亮场景明确为 0 |

---

## 9 · 还没做 / 故意没做

- **真的身体倒影**（平面反射 / SSR）：见 §4，被 `BUDGET.maxDrawCalls` 和降级阶梯否掉。
  如果哪天预算放宽，第一个该加的是 `reflector()` 而不是 SSR（SSR 会在 `?nopost=1` 时消失）。
- **体积光 / god rays**：`three` 自带 `GodraysNode`，`backlit` 那套用它会更好看。
  没做的理由是它是一条额外的全屏 pass，而 `backlit` 现在靠雾 + 粒子已经有体积感；
  等真人现场看过再决定值不值这条 pass。
- **脚部件离骨架落点约 14cm**：`scene-gallery.png` 里接触阴影落在脚尖的世界位置（y=0.03），
  而渲染出来的脚部件停在 y≈0.17。这是**部件那条线**的事（`src/creature/` 本轮不许碰），
  舞台这边把落点画在骨架说的地方是对的。这个缝合上之后"不再浮空"才算完全兑现。
- **真人输入**：全部取证图都是合成 A-pose。现场逆光、投影亮度都还没验过（docs/09 U14）。
