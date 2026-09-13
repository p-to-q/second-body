# 39 · 物种自查 —— 它渲染出来的，是不是它声称的那一个

> `field`／「场」被发现自相矛盾并修好之后，**其余 28 条没有人看过**。
> 这份文档把 29 条逐条量了一遍：`tagline` / `source` / `coverage` / `bodyPlan` /
> `kind` / `palette` 写的是一回事，运行时实例化出来的是另一回事的，有几条。
>
> 量的尺子是 `docs/26-ARTWORK-STANDARD.md` 的 §E（五秒判据）、§H（真实网格与生成网格）、
> §I（身份住在表面还是拓扑），以及 `docs/14 §3`（`coverage` 与 base 链）。
> 结论一句话：**29 条里有 3 条在运行时根本不存在，8 条名不副实，14 条成立。**

## 0. 方法与「什么算证据」

每一条都渲染过再判：`/dev/figure.html?theme=<id>&tier=2&seed=1&still=90&angle=0.35&debug=1`，
headless Chrome（`--enable-unsafe-webgpu`），帧落在 `scratch/evidence/`（不进版本库）。
并排那三张走 `/dev/lineup.html?ids=…`，因为 §F 说**物种靠整体剪影辨识** ——
一具一具单看会持续高估差异，四具摆在一起才看得见「这两个是同一个东西」。

三点必须先说清楚，否则下面的表会被读成比它更硬的东西：

1. **`mass` 那三条（`coral` / `char.ghost` / `char.dumpling`）的比例没有被验证。**
   `/dev/mass.html` **不调用 `remapSkeleton`** —— 它把团块长在原始 A-pose 骨架上，
   于是三条的 `bodyPlan` 比例（团子 `torso:1.7`、珊瑚 `torso:1.15`）在那一页上
   一点都没有生效。那一页拍到的是「团块本身长什么样」，不是「这个物种长什么样」。
   `figure.ts` 的文件头为 `swarm` 写过同一条规矩 ——
   **取证图和现场不是同一具身体，它就不是证据** —— `mass.html` 还欠这一条。
2. **headless 下的 fps 与毫秒不是真实读数**（`docs/18 §7.5`）。下表不引用任何帧率。
3. 判「成立 / 不成立」的是 §E 的五秒判据，而 §E 自己写着这一条**只能由人回答**。
   这份表给的是一个代理的判断加一张可复核的图，不是那个人的判断。

## 1. 逐条判决

`own` 列 = 这个条目自己有多少个槽位在索引里还活着（过完策展）／`coverage` 承诺的数。
`成立` = 渲染出来的东西和它声称的是同一个；`勉强` = 不矛盾，但辨识度不由它自己承担；
`名不副实` = tagline 或 bodyPlan 承诺了画面上没有的东西；`不存在` = 运行时点不到它。

| id | kind · coverage | bodyPlan | own | 判决 | 依据（帧在 `scratch/evidence/`） |
|---|---|---|---|---|---|
| `porcelain` | archetype · full | —（基准） | 10/10 | **成立** | 基准身体，其余条目的参照。`probe-porcelain.png` |
| `industrial` | archetype · full | 比例 | 10/10 | **成立** | 深色、带肋、无装饰的人形，「来上班的」读得出。`fig-industrial.png` |
| `patrol` | archetype · full | `quadruped` | 10/10 真网格 | **名不副实（tagline）** | 画面上它**四足着地**，而 tagline 是「一个不该直立的东西直立了」—— 换成四足拓扑正好把这句话要的张力抹掉了。另：`spine` 0.61×、`head` 0.62× 越过 §H 的 girth 带。`fig-patrol.png` |
| `xeno` | archetype · full | `inverted` | 10/10 | **成立** | 倒置，头在地面附近、腿朝天，剪影独一份。`fig-xeno.png` |
| `coral` | archetype · full | `mass` | 10/10（不实例化） | **勉强 · 部分未核实** | 团块把「层叠鳞片」这个身份全部吃掉：它和 `char.ghost`／`char.dumpling` 在画面上是同一具光滑人形团块。比例未核实（见 §0.1）。`mass-coral.png` |
| `athlete` | archetype · light | 比例 | 6/6 | **勉强** | 剪影与 `porcelain` 同级，差别在部件表面与配色，不在形体。`fig-athlete.png`、`lineup-humanoid.png` |
| `softwear` | archetype · light | 比例 | 5/6（head 被 reject） | **名不副实** | 「住在家里的陌生室友」渲染成一具**黄黑工业机器人**（palette 里有 `paint.hazard`），织物一点没有；头是借来的、悬在肩上方。`fig-softwear.png` |
| `compact` | archetype · light | `stub` | 10/10 真网格 | **成立** | 认得出是那台真机。胸口凹槽放大复核过：是接插件面板，**不是字标**（§I 的那句话我重新验了一遍）。`fig-compact.png` |
| `digitigrade` | archetype · light | 比例 | 10/10 真网格 | **成立** | 细长反关节腿成立。脚是尖的（那件网格自身的形状，不是 girth 造成的）。`fig-digitigrade.png` |
| `wheelleg` | archetype · light | `quadruped` | 0/6 | **名不副实** | 唯一一件自有件被 reject，整具借 `porcelain` —— 画面上是一只黄色四足，**没有轮子**，而 tagline 是「它既走也滑」。和 `petbot` 并排几乎同形。`fig-wheelleg.png`、`lineup-quadruped.png` |
| `droid` | archetype · light | `{kind:'stub', head:1.5}` | 6/6 | **名不副实** | 「大头短身」两头都没拿到：`head:1.5` 被 `bodyplan.ts` 丢掉（见 §2.2），而 `head` 是 uniform 槽位、本来也不吃这个系数（§2.3）。画面是小头长腿。`fig-droid.png` |
| `petbot` | archetype · light | `quadruped` | 6/6 | **成立** | 白亮四足 + 大镜头头部，「不像狗但你觉得它活着」成立。`fig-petbot.png` |
| `furball` | archetype · light | `radial` | 6/6 | **名不副实** | tagline 是「它放弃了腿、手和任务」，画面上它有**四条最显眼的腿**（radial 把四肢摊成一圈）。而且与 `orb` 同形。`fig-furball.png`、`lineup-radial-column.png` |
| `screenface` | archetype · light | `{kind:'column', head:1.9, …}` | 6/6 | **名不副实** | 声称「矮柱 + 一张大脸」，渲染出来是**高桅杆 + 一个很小的头**。`fig-screenface.png` |
| `orb` | archetype · light | `radial` | 6/6 | **名不副实** | tagline 是「机器人为什么一定要有腿」，画面上它是全 roster 里腿最张扬的一个。`fig-orb.png` |
| `manipulator` | archetype · light | `column` | 6/6 | **勉强** | 桅杆 + 双臂读得出，但与 `screenface` 共用一个剪影，差别只有臂长与配色。`fig-manipulator.png` |
| `autonomous` | archetype · light | `quadruped` | 5/6（spine 被 reject） | **名不副实** | 躯干（那块「汽车壳 + 激光雷达穹顶」）正是被 reject 的那一件，改借 `porcelain`；tagline 说「只是大了很多」，画面上它是四足里**最小最细**的一具。`fig-autonomous.png`、`lineup-quadruped.png` |
| `field` | archetype · light | `swarm` | 0（程序化，本该如此） | **成立** | 1400 点跟着骨架走，站住聚成人形。这是上一轮修好的那一条，复核通过。`fig-field.png` |
| `guest.founder` | guest · light | — | 0/6 | **不存在 → 明确缺席（2026-09-13）** | 索引里一件自有件都没有 → `makeGenome` 的名单里没有它 → `?theme=guest.founder` **静默渲染成 `porcelain`**（HUD 显示「瓷 · Porcelain」）。另：`clearance='public-figure'` 却已经写进 parts.json。`fig-guest.founder.png`。**已改**：`buildIndex()` 现在只写 `ROSTER.filter(isPublic)`，它整个不在 parts.json 的条目表里了 —— 一个故意的空位应当**看得见地缺席**（docs/14 §2） |
| `char.dumpling` | character · light | `mass` | 6/6（不实例化） | **勉强 · 部分未核实** | 与 `coral`／`char.ghost` 同一具团块。比例未核实（§0.1）。`mass-char.dumpling.png` |
| `char.ghost` | character · light | `mass` | 6/6（不实例化） | **勉强 · 部分未核实** | 同上。「半透明」在材质里没有落点，团块也不自发光。`mass-char.ghost.png` |
| `char.paper` | character · light | `towering` | 6/6 | **成立** | 又高又薄，折面与硬边读得出来。`fig-char.paper.png` |
| `char.idol` | character · light | `{head:1.35, limb:0.9}` | 6/6 | **勉强** | 手办比例的那个「大头」拿不到（§2.3），剩下的是一具配色更亮的人形。`fig-char.idol.png` |
| `char.inflate` | character · light | 比例 | **1/6** | **名不副实** | 只生成了 `spine` 一件，其余九个槽位全借 `porcelain`：画面上是一具瓷的身体 + 一块悬空的深色头 + 被 `limb:0.55` 压成一条横杆的双臂。「被气撑起来」的封闭软体积一点没有。`fig-char.inflate.png` |
| `char.diva` | character · light | `{kind:'towering', …}` | 0/6 | **不存在 → 空壳（2026-09-13）** | 同 `guest.founder`：`?theme=char.diva` 渲染出来的是 `porcelain`，连名字都是「瓷」。`fig-char.diva.png`。**已改**：不再换物种 —— `?theme=char.diva` 现在**就是** `char.diva`，全部槽位沿 base 链（`char.ghost`）借件并 warn 一行；选择页把它挡在轮播外。**它仍然是一个只剩配色的物种**，生成与否是 §4 第 1 条那个裁定 |
| `char.line` | character · light | `{kind:'stub', head:2.1, …}` | 5/6（head 被 reject） | **名不副实（形体）· 成立（表面）** | 描边着色是真的在工作（§I 说对了一半：它的身份确实住在表面）。但「几乎只有一个头」三重落空：spec 被 `stub` 丢掉、`head` 系数对 uniform 槽位无效、它自己的头件被 reject 后借的是**团子的头**。`fig-char.line.png` |
| `guest.keynote` | **character** · light | — | 0/6 | **不存在 → 空壳（2026-09-13）** | 渲染出来是 `porcelain`。另有一处名实不符：id 前缀是 `guest.`，`kind` 却是 `character` —— 档案页按 kind 分组，它会出现在「角色」里。`fig-guest.keynote.png`。**已改**：同 `char.diva`（base 是 `porcelain`）。id 与 kind 的那处名实不符**没动**，它是 §4 第 7 条 |
| `char.tokusatsu` | character · light | 比例 | 6/6（借 `industrial`） | **勉强** | 「镀铬 + 三原色」是一条**材质**轴，而材质库里没有它：渲染出来是配色偏暖的人形。`lineup-humanoid.png` |
| `char.painting` | character · light | 比例 | 6/6 | **勉强偏成立** | 躯干那件的垂坠褶读得出来，是「比例组」里唯一自己承担了辨识度的一条。`lineup-humanoid.png` |

**合计：成立 8（含 `field`）· 勉强 8 · 名不副实 10 · 不存在 3。**

## 2. 五个系统性成因（不是十三个孤立问题）

### 2.1 三条物种在运行时点不到 —— 而且是**静默**换成别的

`makeGenome` 的可选物种名单是 `parts.json` 里**出现过的 `family`**：

```ts
const themes = [...new Set(inTier.map((p) => p.family))].sort();
const theme = opt.theme && themes.includes(opt.theme) ? opt.theme : rng.pick(themes);
```

`char.diva` / `guest.keynote` / `guest.founder` 一件自有件都没有生成过，
于是 `themes.includes()` 是 false，**第二个分支无声地换了一个物种**。
三张帧是同一具瓷，连 HUD 的名字都是「瓷 · Porcelain」。

这不是「缺素材」那一类问题。缺素材的表现应该是**借件**（base 链本来就为此存在）；
这里的表现是**换物种**。`figure.ts` 已经为 `field` 单独打过一个补丁并在注释里写明
「`main.ts` 那边根本没有这条过滤」—— 那条注释说的正是这三条今天还在的处境。

**✅ 已闭（2026-09-13）。修在源头，不是修这三条。**

`makeGenome` 里那一行被拆成 `resolveTheme()`，三种情况各有一个不一样的读数：

| 点名的是 | 以前 | 现在 |
|---|---|---|
| 有自有件的条目 | 就是它 | 就是它（一字未改） |
| **声明过但零自有件** | **静默换成另一个物种** | **仍然是它**：身份留着，槽位沿 base 链借，并 `console.warn` 一行 |
| 索引里没有的 id | 静默随机 | 随机，并 `console.warn` 一行 |

随机那一支仍然只从**有自有件**的名单里抽 —— 自动挑身体不该挑到一个空条目。
于是「缺素材」重新表现为**借件**（base 链本来就是为这件事存在的），而不是换物种；
HUD 上的名字从此是观众点的那一个。

选择页那一侧同时收紧：上场判据拆到 `choose/wearable.ts`，并拿掉了
「∪ 有 anchor 图的」那一条 —— anchor 图是一张参考渲染，不是一件可以穿的零件。
**今天的真索引上这一改一个条目都没多没少**（26 张卡；这三条本来就因为没有 anchor 图
而没进轮播）。它防的是下一次：谁给一个零自有件的条目补一张 anchor 图，
它立刻进轮播，而装配那一侧一件自有件都没有。
`packages/app/test/choose-wearable.test.ts` 拿真的 parts.json 钉住那条一致性命题：
**上场的每一个条目，`makeGenome` 在 tier 1/2/3 下都装配成它自己。**

> 仍然**没做**的那一半：`char.diva` 与 `guest.keynote` 现在是「空壳物种」——
> 不再骗人，但画面上仍然只剩配色。生成还是撤掉是 §4 第 1 条的裁定，不是工程决定。

### 2.2 `bodyPlan` 的比例字段被 `stub` / `towering` 丢掉

`bodyplan.ts` 的 switch 对这两个 kind 走的是**预设**而不是条目自己的 spec，
出口那一遍又被 `FIXED_PROPORTION` 挡住：

```
'stub' (preset)                                 head 0,1.325,0  neck 1.145  knee 0.264
{kind:'stub', head:1.5}            (droid)      head 0,1.325,0  neck 1.145  knee 0.264
{kind:'stub', head:2.1, limb:0.3,…}(char.line)  head 0,1.325,0  neck 1.145  knee 0.264
'towering' (preset)                             head 0,1.987,0  neck 1.837  knee 0.744
{kind:'towering', limb:1.35,…}     (char.diva)  head 0,1.987,0  neck 1.837  knee 0.744
```

关节坐标**逐位相同**。`droid` / `char.line` / `char.diva` 三条在 `parts.json` 里
写着的身材是装饰 —— 它们拿到的是通用预设。

### 2.3 `head` / `torso` 系数对 uniform 槽位**结构性无效**

`head` / `spine` / `hand` / `joint` 运行时是 uniform 缩放：
`girth = SLOT_WIDTH[slot] × bodyScale / localGirth`，**与骨长无关**。
而 `bodyPlan` 的 `head:` / `torso:` 只移动**关节**。于是：

- 头件的大小完全由 `SLOT_WIDTH.head` 决定 —— `head:2.1` / `1.9` / `1.5` / `1.35` / `1.15`
  五条声明，一条都没有让头变大，只是把头**推得离脖子更远**；
- `char.inflate`（`torso:1.95`）和 `softwear`（`head:1.05`）画面上那颗
  **脱离肩膀、悬在空中的头**，就是这条的直接后果。

「大头」这件事目前在这套挂载数学里**没有表达手段**。这不是一个数调错了，
是一个表达轴缺席 —— 所以它在 §3 里，不在这里改。

### 2.4 `coverage: light` 借到最后，物种就只剩配色

`light` 承诺 6 个标志性槽位。实际：`char.inflate` 1 个、`wheelleg` 0 个、
`softwear` / `autonomous` / `char.line` 各 5 个。借件本身是设计（`docs/14 §3` 明写），
但借到 9/10、10/10 的时候，§F 那句「物种靠整体剪影辨识」就失效了 ——
剪影是 base 的，只有颜色是自己的。`lineup-quadruped.png` 里 `wheelleg` 和 `petbot`
是同一具身体的两种配色，而 §E 的原话是：**两个物种看起来一样，其中一个就不是物种。**

同一张图还给出三对同形：`orb` ↔ `furball`（radial）、`manipulator` ↔ `screenface`（column）、
`coral` ↔ `char.ghost` ↔ `char.dumpling`（mass）。这些不是借件造成的，是**拓扑只有七种**
而条目有二十九条造成的 —— 同一个拓扑下，剩下能区分的只有比例和颜色。

### 2.5 §H 的 girth 带确实被越过了，而且越过它的是**真实网格**

| 件 | 槽位 | girth | 中位数的 | 后果 |
|---|---|---|---|---|
| `spine.patrol.real` | spine | 0.5142 | **0.61×** | uniform 下躯干被放大到 ≈0.86m（`porcelain` 是 ≈0.52m） |
| `head.patrol.real` | head | 0.5813 | **0.62×** | 头被拉成一个长形体 |
| `spine.coral.a` | spine | 0.5300 | **0.63×** | 当前**不实例化**（coral 是 `mass`），暂时无后果 |

§H 自己写着「真实几何不能免检」，然后那三件真网格就是免检进来的 ——
因为**当时没有任何检查在执行那条规矩**。这正是 P21 的形状。

顺带纠一条**过期的规格**：§H 把 `foot` 列进 uniform 五槽位，但 `assemble.ts` 现在给脚传
`axisLength`（脚长由骨长算，`tuning.ts` 的 `FOOT`），横向又被 girth 归一化回
`SLOT_WIDTH.foot` —— 两个方向都把 `localGirth` 除干净了，**它对成品没有影响**。
所以新加的检查**不查 foot**，理由写在代码里；§H 的那句话该跟着改（§3 第 6 条）。
**✅ 已改文档（2026-09-13，§4 第 6 条裁定为「改文档不改代码」）**：`docs/26 §H` 的
uniform 名单从五个改成四个（`head` / `spine` / `hand` / `joint`），并在 §H 末尾留了一段
写明这句话当年为什么是对的、`FOOT` 落地之后为什么不再对。代码一行未动 —— 它是对的，而且有测试。

## 3. P21：哪些坏法，现有的仪表一条都看不见

> 判据只有一句：**如果这件事悄悄坏了，我的仪表会不会变样。**

`check:parts` 数的是件数、长度、三角数、字节数。上面十三条里，
**没有一条会让件数少一件** —— 它们全部发生在「件都在，但装配出来不是那个物种」这一层。

已经补上的（都在 `packages/factory/src/check-parts.ts`，本次改动）：

| 新检查 | 它问的问题 | 今天报几条 |
|---|---|---|
| uniform 槽位 girth 带 | 这件东西被 uniform 放大之后还是原来那个比例吗（§H） | 3（中位数**每次现算**，不写死 —— P21 第 2 条） |
| `stub` / `towering` 丢比例 | 条目声明的身材，是不是运行时真的那一具 | 3 |
| 零自有件 | 点这个物种，`makeGenome` 会不会静默换成别的 | 3 → **2**（2026-09-13：不再是静默换种，`guest.founder` 也不在条目表里了；剩下两条问的是「它在画面上是不是只剩配色」） |
| `coverage` 兑现 | `light` 说好的 6 个标志性槽位，实际还剩几个 | 5 |
| `clearance` 门 | 不该进公开构建的条目，是不是已经在 parts.json 里了 | 1 → **0**（2026-09-13：门移进 `buildIndex()`，这条降级成第二道闸，应当永远不响） |

它们**全部是警告，不是错误** —— 每一条背后都是一个策展决定（§4），
在人做出决定之前把合并门变红，只会让人去关掉这个门。
**做完决定之后，前三条应该升成错误。**

仍然没有仪表、也不容易有的（诚实列出来）：

1. **「这看起来像另一种动物」**。`orb` 和 `furball` 的 JSON 完全不同，像素几乎相同。
   能自动测的只有代理指标（拓扑 + 比例 + palette 三元组撞车就报警），
   而撞车恰恰有时是对的（`patrol` 和 `petbot` 同为四足是设计）。**这一条只能由人看。**
   可做的是把它变便宜：`/dev/lineup.html` 已经能一次摆四具，
   下一步是把那四张图**钉进取证目录并在每次改 roster 时重拍**。
2. **tagline 与身体的矛盾**。`orb` 的「为什么一定要有腿」对着四条腿 ——
   没有任何机器能读出这层反讽。这一类只能靠这份文档这样的人工复核。
3. **`mass.html` 不是现场**（§0.1）。这是一个**能修**的仪表缺陷：
   那一页少一句 `remapSkeleton(sk, theme.bodyPlan)`。它不在这一轮的改动范围里
   （`packages/app/dev/` 不归这条线），但它应该被修 —— 在那之前，
   `mass` 三条的比例判决一律记作**未核实**。
4. **材质轴的缺席不会报错**。`char.tokusatsu` 要镀铬、`char.ghost` 要半透明、
   `guest.keynote` 要针织 —— 材质库里都没有，而"没有对应材质"这件事
   在任何检查里都不是异常，因为 palette 里的每一个 id 都真实存在。
5. **tier 会把 palette 抽掉**。`compact` / `screenface` / `autonomous` / `xeno` 的
   三个材质**全部**是 tier ≥ 2，tier 1 下它们的配色是从通用材质里随机补的 ——
   同一个物种在低 tier 下不是同一个颜色。这是不是设计，需要一句裁定。

## 4. 需要策展裁定的（我没有动，也不该由我决定）

每一条都会改变某个物种的身份，按 AGENTS.md 的改动纪律，它们不是工程决定。

1. **`char.diva` / `guest.keynote` / `guest.founder`：生成，还是从 roster 撤掉？**
   现状是第三种，也是最坏的一种 —— 它们在档案页和数字上都在，在画面上是瓷。
   三条各 3 credits。`guest.founder` 是**故意的空位**（`docs/14 §2` 写明），
   那么它至少应该在选择页上明确地缺席，而不是静默变成别的物种。

   **2026-09-13：最坏的那一半已经拆掉，裁定本身还在这里等。**
   `guest.founder` 按 `clearance` 挡在 parts.json 之外（明确缺席，不再是静默替换）；
   另外两条不再换物种、也不进轮播，但仍然是空壳。**生成它们要什么**：
   两条都是 `coverage: 'light'` = 6 个标志性槽位 × 1 变体 = **各 3 credits，合 6**，
   跑 `factory:generate` → `factory:normalize` → `factory:compress` → `factory:index`
   （两条的 `look` 都已经写好了，在 `recipes/invited.ts` 里，不用再想造型）。
   生成之后它们**自己就会出现在轮播里** —— 上场判据读的就是「库里有没有自有件」。
   两件顺带要知道的事：`char.diva` 的 `{kind:'towering', …}` 比例仍然会被 §2.2 丢掉，
   而 `guest.keynote` 要的「针织」在材质库里没有落点（§3 第 4 条）——
   花了这 6 credits，它们大概率还是落在「勉强」那一档。
2. **`char.inflate` 补齐 5 件（3 credits），还是改成 `mass`？**
   它的技术轴是「封闭的软体积」—— 那正是 `mass` 在做的事。
   改 `mass` 零成本，但会作废它已经花过的那一件 `spine`。
3. **`wheelleg`：重抽一批，还是撤掉？** 它现在是 `petbot` 的黄色版本。
   它唯一的自有件在 `2026-09-12` 被 reject（碎片状薄片），从那天起这个物种就空了。
4. **`patrol` 的 tagline 与 `quadruped` 二选一。**「一个不该直立的东西直立了」
   要的是四足语言长在**直立**的身体上；`bodyPlan: 'quadruped'` 把它放回四脚着地。
   要么改 tagline，要么改身体方案 —— 现在这两句话在互相取消。
   同类：`orb` / `furball` 的 tagline 都在否定腿，而 `radial` 给了它们腿。
5. **`spine.patrol.real` / `head.patrol.real` 越过 §H 的 girth 带，要不要 reject？**
   我**没有**动 `curation.json`：reject 掉这两件，`patrol` 的躯干和头就会退回生成件，
   而 §H 的分界线说「真实的机器用真实网格」—— 那是在撤销一条已经立过的规矩。
   `spine.coral.a`（0.63×）当前不实例化，可以先放着。
6. **§H 的 uniform 名单要不要把 `foot` 去掉。** 规格与代码已经分岔（§2.5），
   两者必有一处要改。我倾向改文档，因为 `FOOT` 那组数是后加的、而且更准。
   **✅ 已裁定并执行（2026-09-13）：改文档，不改代码。** 见 `docs/26 §H` 末尾那一段。
7. **`guest.keynote` 的 id 与 kind。** 它是 `character`，id 却是 `guest.`。
   `invited.ts` 的理由（站上去的是那身衣服，不是某个人）我认为成立，
   那么 id 应该跟着改成 `char.keynote` —— 但改 id 会让已经发出去的 seed 码对不上。

## 5. 这一轮改了什么

- `packages/factory/src/check-parts.ts`：加了五条检查（见 §3 的表），全部是警告。
  `npm run check` 仍然 0 错通过（core 159 / app 196 / parts 208 件 0 错 17 警告）。
- **没有**改 `assets/parts/parts.json`（没有跑 `factory:index`）、
  **没有**改 `assets/parts/curation.json`、没有改任何物种的造型或比例。
  §4 里的每一条都是策展决定，这份文档只负责把它们摆到桌面上。
