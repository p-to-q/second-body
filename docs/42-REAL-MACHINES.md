# 42 · 真实机器 —— 十六台机器、十八个条目、一条不够用的分界线

> 2026-09-13。项目负责人点名的十六台真实机器人，逐台找**可以再分发的三维几何**，
> 逐条对回 `packages/factory/recipes/roster.ts` 的 18 个 `archetype`。
>
> **这一页只调研、只报告、只留证据。**
> 不改 `roster.ts`、不改 `assets/`、不跑 `harvest.mjs`、不跑 `factory:*`、不花 credits。
> 取件是第二步，由维护者在读完 §5 的命名裁定之后派发。
>
> 上游：`docs/26 §H`（真实/生成的分界）、`docs/26 §I`（身份住在哪里）、
> `docs/31`（16 台机器 ↔ roster 的第一次对表）、`docs/33`（开源三维调研与授权口径）、
> `docs/39`（物种自查）。这一页**不重写**它们，只补上它们缺的那一列：**几何在哪、授权是什么。**

## 0. 三个结论，先写在前面

**一 · `docs/26 §H` 的二分不够用，缺第三档。**

§H 写的是「真实存在的机器用真实网格，不存在的东西用生成件」。
它默认了第三种情况不存在：**真实存在、但世界上没有一份可以合法再分发的几何。**
十六台里有**八台**落在这一档（Figure、Optimus、NEO、Aibo、Moflin、Loona、Ballie、Waymo）。
把它们留在「生成」那一侧没有错，但**理由完全不同** ——
`xeno` 用生成件是因为它不该有原件，`petbot` 用生成件是因为索尼不发 CAD。
两者写在同一格里，「想象」这个类别就变成了垃圾桶，而 §H 那条分界线的全部力量来自它**不是**垃圾桶。

所以这一页给出三档，并建议写回 §H：

| 档 | 含义 | 条目 |
|---|---|---|
| **实 · 有几何** | 真机存在，且有可再分发的网格 | `compact` `patrol` `digitigrade` `athlete` `manipulator` `wheelleg` |
| **实 · 无几何** | 真机存在，但没有任何一份授权干净的几何 | `industrial` `softwear` `droid` `petbot` `furball` `screenface` `orb` `autonomous` |
| **虚** | 世界上没有可取的原件，生成模型是**唯一**来源 | `porcelain` `xeno` `coral` `field` |

第二档不是失败，它是一条**可以被推翻的记录**：哪天 Figure 开源了描述文件，这一行就从第二档升到第一档。
写成「想象」，它就永远不会被重新查一遍。

**二 · `patrol` 现在穿的不是 Spot，是 ANYmal —— 而 Spot 其实取得到。**

`docs/31` 把 `patrol` 对到 Boston Dynamics Spot；`scripts/harvest.mjs` 实际取的是 ANYbotics ANYmal C，
并在注释里给了理由：「选 ANYmal 而不是 Spot，是因为 ANYmal 在 Menagerie 里给了整机每一块，**Spot 只给了腿**」。

**这句话是错的。** 在同一个钉死的 SHA 上逐个文件数过：
`boston_dynamics_spot/assets/` 有 `body_0/1.obj`（机身）、四条腿各自的 `*_hip.obj`
`*_upper_leg_0/1.obj` `*_lower_leg.obj`，外加一整条机械臂（`arm_link_sh0` → `wr1` → `fngr`）共 53 个文件。
**整机每一块都在，而且比 ANYmal 多一条手臂。**

这不是一个考据问题。`patrol` 的 tagline 是「一个不该直立的东西直立了」，
而「那个东西」在观众脑子里是 Spot —— 它是这一代唯一一台普通人见过的机器狗。
现在这个物种叫 Spot、写着 Spot、穿的是另一家公司的机器。**要么改几何，要么改记录，不能两句话并存。**

**三 · 名字不要改，真机写进元数据。** 理由和唯一的例外见 §5。

## 1. 18 条对表

`代表机器` 一列的证据是三处合看：`roster.ts` 的 `tagline` + `look` + `reference`、
`docs/31 §1` 的谱系表、以及 `docs/39` 的渲染判决。三处互相矛盾的地方在「证据」列里写明。

| # | roster id | 名 | 代表机器 | 档 | 几何现状 | 证据 |
|---|---|---|---|---|---|---|
| 1 | `porcelain` | 瓷 | ~~Optimus~~ **无** | **虚** | 生成件 10/10 | `docs/31` 把它对到 Optimus，但**三处证据都不支持**：tagline「一个被理想化过的你」、`reference` 写的是「产品化人形的白色聚合物面板」这类**语言**而不是某台机器、`roster.ts` 自己注明它是「基准比例」参照系。见 §2 |
| 2 | `industrial` | 工业 | Figure 03 | 实·无几何 | 生成件 10/10 | `docs/31 §1` 第 2 行；tagline「它是来上班的」 |
| 3 | `patrol` | 巡逻 | **Boston Dynamics Spot** | 实·有几何 | **真网格 10/10，但取自 ANYmal C** | `docs/31 §1` 第 7 行 = Spot；`harvest.mjs` `ADOPTED` = `anymal_c`。见 §0 第二条 |
| 4 | `xeno` | 异形 | 无 | **虚** | 生成件 10/10 | `reference`：「生物机械造型传统」= 电影美术。`docs/31 §3` 明列为孤儿 |
| 5 | `coral` | 珊瑚 | 无 | **虚** | 生成件 10/10 | `reference: '—'`，注释写「最接近原作」。**故意**不像任何东西 |
| 6 | `athlete` | 运动员 | **Boston Dynamics Atlas** | 实·有几何 | **真网格 10/10 已落地（2026-09-14，DRC/v5，版权人 MIT CSAIL）** | `docs/31 §1` 第 1 行；tagline「身体是人，运动不是」。取件见 §8 |
| 7 | `softwear` | 穿衣的 | 1X NEO | 实·无几何 | 生成件 5/6 | `docs/31 §1` 第 4 行；tagline「一个住在家里的陌生室友」。**即使有 CAD 也不该换**，见 §4 末 |
| 8 | `compact` | 小人 | **Unitree G1** | 实·有几何 | **真网格 10/10 已落地** | `harvest.mjs` `ADOPTED`；`docs/26 §I` 专门为它写过裁定 |
| 9 | `digitigrade` | 鸟腿 | Agility **Digit** | 实·有几何（代） | **真网格 10/10 已落地，取自 Cassie** | Digit 无授权（`docs/33 §2 A`，本页复核仍然成立），同厂同拓扑的 Cassie 是 MIT |
| 10 | `wheelleg` | 轮足 | LimX **W1** | 实·有几何（代） | **真网格 10/10 已落地（2026-09-14），取自同厂 WL_P311D** | `docs/31 §1` 第 9 行标「产品已下架」；`docs/39` 判「名不副实 —— 画面上没有轮子」。现在四条腿末端都是轮子，见 §8 |
| 11 | `droid` | 小怪物 | Disney **BDX** | 实·无几何（有复刻） | 生成件 6/6 | `docs/31 §1` 第 10 行且「建议不喂」。只有社区复刻品，见 §3 |
| 12 | `petbot` | 宠物 | Sony **aibo** | 实·无几何 | 生成件 6/6 | `docs/31 §1` 第 11 行 |
| 13 | `furball` | 毛球 | Casio **Moflin** | 实·无几何 | 生成件 6/6 | `docs/31 §1` 第 12 行 |
| 14 | `screenface` | 桌宠 | KEYi **Loona** | 实·无几何 | 生成件 6/6 | `docs/31 §1` 第 13 行 |
| 15 | `orb` | 球 | Samsung **Ballie** | 实·无几何 | 生成件 6/6 | `docs/31 §1` 第 14 行 |
| 16 | `manipulator` | 移动机械臂 | Hello Robot **Stretch** | 实·有几何 | **真网格 10/10 已落地（2026-09-14，Stretch 3）** —— 件是真的，剪影还不是，见 §8 | `docs/31 §1` 第 15 行；`docs/33 §6` 已建议换 |
| 17 | `autonomous` | 无人车 | **Waymo** | 实·无几何 | 生成件 5/6（`spine` 被 reject） | `docs/31 §1` 第 16 行 |
| 18 | `field` | 场 | 无 | **虚** | `source: 'procedural'`，不实例化任何件 | tagline「身体消失，只剩运动」。给它几何等于取消它 |

**十六台机器全部有交代，18 个条目全部有档位。** 另有一台谱系表里有、roster 里没有的：
**Unitree Go2**（`docs/31 §2` 已经提议新建条目）。它在 Menagerie 里有整机，见 §3。

## 2. 真正「想象出来的」只有四条 —— 不要把第五条塞进来

`xeno` / `coral` / `field` 三条 `docs/31 §3` 已经判过，本页复核无异议。
争议只在第四条：

**`porcelain` 应该从 Optimus 那一格里放出来。**

`docs/31 §1` 第 3 行把它对到 Tesla Optimus，理由是谱系表上「劳工人」这一档需要一个落点。
但回到条目本身，三处证据都指向别处：

- **tagline**：「一个被理想化过的你」。这不是一台机器的描述，是**对观众的一句话**。
  十八条里只有它的 tagline 完全不提机器。
- **`reference`**：「产品化人形的白色聚合物面板 + 黑关节罩语言」—— 它写的是一套**造型语言**，
  和 §H 那句「一个叫机器狗的物种，它的腿应该是那条腿」不是同一种指认。
- **`roster.ts` 自己的注释**：「porcelain 保持标准比例 —— 需要有一个基准，否则『不同』就没有参照」。
  它是这套形态空间的**原点**。原点不该同时是一台具体的机器。

`docs/33 §6` 其实已经说过同一件事，只是说法更软：「`porcelain` 要的是被理想化的光滑感，
真实 CAD 反而不对」。本页把它升成判断：**`porcelain` 是第四条「虚」，不是第九条「实·无几何」。**

**这一条要维护者点头**（§7 第 1 条），因为它改的是 `docs/31` 的一行对表。
但不点头的代价是具体的：只要 Optimus 还挂在它头上，哪天特斯拉放出了 CAD，
就会有人拿真 CAD 去换掉这件作品的**基准身体** —— 而基准身体一变，其余十七条的「不同」全部失去参照。

## 3. 十六台机器：几何在哪、授权是什么

**授权是硬门，不是偏好。** 口径照抄 `docs/33 §1`：判定对象是「公开仓库 + 公开部署 + 再分发」，
`✅` = MIT/BSD/Apache/CC0，`🟡` = 有条件（署名、非背书、share-alike），
`❌` = 含 NC、无 LICENSE 文件、或来源不可核。**没有 LICENSE 文件 = ❌，不是「大概没事」** ——
这个项目为这条规矩退掉过整份 BodyParts3D 解剖数据集（`docs/33 §4`），标准不为机器人降低。

来源一律**钉 commit SHA**，理由见 `harvest.mjs` 文件头：指向分支的后果不是报错，是来源在脚下变。

| 机器 | roster id | Menagerie 有？ | 来源 URL（钉 SHA） | 授权 | 判定 |
|---|---|---|---|---|---|
| **Unitree G1** | `compact` | ✅ `unitree_g1` | `google-deepmind/mujoco_menagerie@8161bba` `/unitree_g1/` | 🟡 BSD-3 变体（Unitree）· 非背书 | **已入库** |
| **Spot** | `patrol` | ✅ `boston_dynamics_spot` | 同上 `/boston_dynamics_spot/` | ✅ BSD-3-Clause · Clearpath Robotics Inc. | **可取，整机 53 件** |
| **Go2** | （无条目） | ✅ `unitree_go2` | 同上 `/unitree_go2/` | 🟡 BSD-3 变体（Unitree）· 非背书 | **可取，整机 16 件** |
| **Stretch** | `manipulator` | ✅ `hello_robot_stretch_3`（另有 `hello_robot_stretch`） | 同上 `/hello_robot_stretch_3/` | ✅ Apache-2.0 · 需注明改动 | **可取，整机 100+ 件** |
| **Digit** | `digitigrade` | ❌ 本体无；**Cassie 有** | 同上 `/agility_cassie/` | ✅ MIT · Agility Robotics | **已入库（Cassie 代）** |
| **Atlas** | `athlete` | ❌ | `RobotLocomotion/models@3bd1111` `/atlas/meshes/` | ✅ **BSD-3-Clause**，`atlas/LICENSE.TXT` 与网格同目录 · © Robot Locomotion Group @ CSAIL | **可取，10 个槽位全覆盖**（见下方警告） |
| **LimX W1** | `wheelleg` | ❌ 本体无；**同厂轮足四足有** | `limxdynamics/tron1-robot-description@5b97add` `/wheellegged/WL_P311D/meshes/` | ✅ Apache-2.0 · LimX Dynamics | **可取（代）**，`hip`/`thigh`/`calf`/**`wheel`**/`base_link` |
| **Disney BDX** | `droid` | ❌ | `apirrone/Open_Duck_Mini@b23317a`（分支 `v2`） | ✅ Apache-2.0 | **❌ 不建议**：这是社区**复刻**，不是那台机器。见下 |
| **Figure 03** | `industrial` | ❌ | — | — | ❌ 无公开描述文件 |
| **Optimus** | （建议解绑） | ❌ | — | — | ❌ 无公开描述文件；第三方模型站是商业素材，来源不可核 |
| **1X NEO** | `softwear` | ❌ | — | — | ❌ 无公开描述文件 |
| **Sony aibo** | `petbot` | ❌ | — | — | ❌ 只有 GrabCAD / TurboSquid 等第三方与商业素材 |
| **Casio Moflin** | `furball` | ❌ | — | — | ❌ 无任何公开三维 |
| **KEYi Loona** | `screenface` | ❌ | — | — | ❌ 无任何公开三维 |
| **Samsung Ballie** | `orb` | ❌ | — | — | ❌ 只有第三方商业素材 |
| **Waymo** | `autonomous` | ❌ | — | — | ❌ Waymo Open Dataset 是**传感器数据不是网格**，且另有条款；其余是商业素材 |

**Menagerie 收录十六台里的四台**（G1、Spot、Go2、Stretch），外加一台代件（Cassie）。
本页新找到两条 Menagerie 之外、授权可核的路（Atlas、LimX 轮足）。**其余八台一条都没有。**

### 三条必须写清楚的保留意见

**Atlas：授权干净，但那不是今天那台 Atlas。**
`RobotLocomotion/models/atlas/` 的 `LICENSE.TXT` 是一份完整的 BSD-3-Clause，就放在网格旁边 ——
这正是这个项目认的那种形式（和 Menagerie 逐个机器人带 LICENSE 是同一个模式）。
但两件事要记在 `ATTRIBUTION.md` 里而不是含糊过去：

1. **版权人是 MIT CSAIL 的 Robot Locomotion Group，不是 Boston Dynamics。**
   这份几何是 DRC 时代经多方使用的模型，不是厂商发布的官方 CAD。
2. **它是液压的那一代 Atlas**（DRC / v5），不是 2025 年那台电动的。
   `athlete` 的 tagline 是「身体是人，运动不是」，而让这句话成立的那段影像多半是电动 Atlas。
   拿 v5 的几何去承担那句 tagline，是**一次真实的错位** —— 可以接受，但要写出来。

技术上还有一条：那批网格是 `.gltf` **外挂 `.bin`**（约 940 KB 顶点数据 + 每件 2 KB 的 json），
而 `normalize.ts` 现在按扩展名分流 `.glb` / `.stl` / `.obj`。
`.gltf` + 外部 buffer 需要多一步（或者改用 drake 旧 SHA 上的 `.obj` 版本，
但那个位置**没有**同目录 LICENSE，只有仓库根的 —— **选授权更明确的那条，多写十行代码**）。

**LimX：拿到的是轮足四足，不是 W1。**
`limxdynamics` 名下没有 W1 的描述文件（逐个仓库查过 45 个）。
`tron1-robot-description` 的 `wheellegged/WL_P311D` 是同厂的轮足四足开发平台，Apache-2.0，
`hip` / `thigh` / `calf` / **`wheel`** / `base_link` 齐全。
用它代 W1 和用 Cassie 代 Digit 是同一类决定，而且这一次更有必要：
`wheelleg` 现在是全 roster 里唯一一个**零自有件**的 archetype（`docs/39`），
它的 tagline 是「它既走也滑」，画面上却是一只没有轮子的黄色四足。
**这条线上真正缺的东西就是一个轮子，而那个轮子在 `WL_P311D/meshes/LF_wheel.STL` 里。**

**Disney BDX：有 Apache-2.0 的几何，但那不是那台机器。**
`Open_Duck_Mini` 是社区做的 BDX **复刻**（作者自述 "Making a mini version of the BDX droid"）。
授权干净，几何可用 —— 但用它填 `droid`，等于让一个写着「真实机器用真实网格」的规矩，
去接受一件**别人想象出来的、模仿另一台机器的东西**。那比生成件更远，不是更近。
**判定：`droid` 留在第二档（实·无几何），继续用生成件。** 复刻品这条路记在这里，免得下次再查一遍。

## 4. 取件要做什么 —— 逐台的工作量与字节

口径和 `docs/33 §3` 一致：原料落 `assets/harvest/`（`.gitignore`），
产物 13–31 KB / 件。**下载的字节不进版本库，入库的字节才算数。**

| 机器 | 槽位 | 下载（原料） | 入库（产物） | 工程量 |
|---|---|---|---|---|
| **Spot** → `patrol` | 10（整机足够，四条腿同形，手臂可当上肢） | ≈ **28 MB** | ≈ 200 KB + LICENSE | **零新代码**。`.obj`，和 ANYmal 走同一条路 |
| **Stretch** → `manipulator` | 10（底盘/桅杆/升降/五节臂/腕/夹爪/云台） | ≈ **14 MB**（避开 22 MB 的 `base_link_8` 和 11.5 MB 的 `link_head_0`） | ≈ 200 KB + LICENSE | 零新代码。Apache-2.0 多一条「注明改动」，`ATTRIBUTION.md` 已经在写这一句 |
| **Go2** → 新条目 | 6（`light`：只需标志性槽位） | ≈ **17 MB** | ≈ 120 KB + LICENSE | 零新代码。**但要先建 roster 条目**，那是 roster 那条线的事 |
| **LimX 轮足** → `wheelleg` | 6（`base_link` / `hip` / `thigh` / `calf` / `wheel` ×2） | ≈ **12 MB** | ≈ 120 KB + LICENSE | 零新代码（`.STL`）。注意 `realsense_d435.stl` 是 11.5 MB 的第三方件，**不取** |
| **Atlas** → `athlete` | 10（`utorso`/`head`/`r_clav`/`r_uarm`/`r_farm`/`r_hand`/`r_uleg`/`r_lleg`/`r_foot`/`r_talus`） | ≈ **1 MB**（整套最小的一份） | ≈ 200 KB + LICENSE | **`.gltf` + 外部 `.bin` 要多一条分流**（`mesh-import.ts`），十几行 |

**五台全取：下载约 72 MB，入库约 840 KB + 五份 LICENSE。**
对照：现在 `assets/parts/` 里 208 件生成件。真实网格比生成件小（硬表面、无贴图是 meshopt 的理想输入）。

**四条取件前必须执行的既有规矩**，一条都不能因为「这是真 CAD」而免检：

1. **uniform 四槽位的 girth 带**（`head` / `spine` / `hand` / `joint`，`docs/26 §I`）：
   取来的件 `localGirth` 必须落在该槽位中位数的 0.7×–1.3×。
   `docs/39 §2.5` 记着这条被越过的实例 —— 而越过它的正是已入库的真网格。
2. **缺槽位在同一台机器上挑，不去别的机器借**（`docs/26 §H`）。Spot 有手臂，这一条这次很好办；
   Stretch 没有腿、LimX 没有头，要按 Cassie 那次的办法挑并在 `ATTRIBUTION.md` 里写明是代的。
3. **按物种整体换，不按槽位穿插**（`docs/26 §H`）。
4. **`tier: 1`**，理由见 `harvest.mjs`：真实件不是细节升级，它就是这个物种本身。

**一条反向建议：`softwear`（1X NEO）即使哪天拿到了 CAD 也不该换。**
NEO 的全部意义是**针织外套**，而这条流水线做的第一件事就是丢掉贴图、统一套材质（`docs/03 §4`）。
一件被剥掉表面的 NEO，剩下的是一具普通人形骨架 —— 换真网格会**减少**它的辨识度。
这一条和 `docs/26 §I` 是同一句话的反面：**身份住在表面时，照搬几何什么都搬不到。**

## 5. 名字 —— 建议保留，把真机写进元数据

项目负责人的原话是「把真实的机器人命名好」，而 `docs/39` 指出的问题是真的：
「工业」「巡逻」「球」「移动机械臂」「无人车」这些名字，**没有一个告诉观众它是哪台机器**。
但「名字不说」和「作品不说」是两回事，而修的应该是后者。

### 先说一条不是判断的事：`id` 永远不改

`docs/39 §4` 第 7 条记着：`guest.keynote` 的 id 与 kind 名实不符，
但**改 id 会让已经发出去的 seed 码对不上**。seed 码是观众带走的那个物理痕迹（`docs/26 §D`）。
所以无论 §5 怎么裁，**`roster.ts` 的 `id` 一个都不动**。下面讨论的只是 `name` / `nameEn` 这两列。

### 建议：保留诗意名，新增 `machine` 字段，在档案页上作为第二行显示

```
巡逻 · Patrol
一个不该直立的东西直立了
── 取材：Boston Dynamics Spot（几何：ANYbotics ANYmal C，BSD-3）
```

四条理由：

1. **名字是这件作品的第三处主张，和形体、表面并列。**
   `docs/26 §I` 把身份分给了「表面」和「拓扑」，漏了第三处：**那一行字**。
   「一个不该直立的东西直立了」说的不是 Spot 是什么，是**观众看见它时心里那一下**。
   把它换成「Spot」，作品就从提出一个命题退回成陈列一件产品。
2. **BSD-3 的非背书条款让「产品名当物种名」更危险，不是更诚实。**
   `harvest.mjs` 和 `docs/33 §4` 都写着：描述性地说「这是 G1 的躯干几何」可以，暗示合作或赞助不行。
   一个叫「Spot」的物种卡片，观众读到的是一次品牌露出；
   一个叫「巡逻」、底下写着「取材：Boston Dynamics Spot」的卡片，读到的是一次**注明出处**。
   同一份事实，后者才是署名，前者是冒用。
3. **这个缺口的形状是「一页」，不是「一个名字」。**
   `docs/26 §C1` 刚刚记过同一件事：慢回路的机制写完了却不成立，
   缺的不是代码，是一页能看见它的界面 —— 「**下一次出现『做完了但作品不成立』，先问缺的是不是一个能看见它的界面。**」
   十五个条目「没说自己是哪台机器」，缺的同样是那一行显示，不是一次改名。
4. **元数据是能被检查的，名字不能。** 真机写进 `machine: { name, maker, source, license }`，
   `check:parts` 就能问一个新问题：**声称取自某台机器的条目，索引里的件是不是真的来自那台机器。**
   §0 第二条那个 `patrol` = Spot / 穿 ANYmal 的矛盾，就是这样一条检查能自动抓到的
   —— 而它整整存在了一轮，因为没有任何仪表在看（`docs/39 §3`，P21）。

### 被否掉的两个方案，以及否掉的理由

- **全部改成产品名**（「Spot」「G1」「Atlas」）：把十八条的语气从命题拉平成目录。
  而且只有六条有真机几何，剩下十二条改不了 —— 结果是一份**一半产品名一半诗意名**的名单，
  比现在更难读。
- **加副标题**（「巡逻 Spot」）：名字变长，形态空间轮播那一行排不下（`docs/14 §4`），
  而且它把「取材」和「就是」这两件不同的事压进同一个字符串。

### 唯一的例外：`patrol` 要的是一次事实更正，不是改名

它不在命名的范畴里 —— 记录说 Spot、穿的是 ANYmal，两句话互相取消。
两条路，都不动名字：

- **(a) 重取 Spot 的 10 件**（≈ 28 MB 下载，零新代码，授权 ✅ BSD-3）。推荐这条：
  谱系表、tagline 和几何第一次全部对上，而且 ANYmal 那 10 件按 `curation.json` 的规矩**文件不删**。
- **(b) 把 `docs/31` 和 `reference` 改成 ANYmal C**。零成本，但要承认这个物种代表的
  不是那台观众见过的机器。

## 6. 成本

**credits：零。** 这一页提的每一条路都是取件，不经过 Rodin。
`harvest.mjs` 走的是 HTTP 下载 + 本地规范化，没有任何 API 调用，没有任何计费。

唯一会花 credits 的是**第二档那八台的现状维持或改善**，而那不是这一页在提议的事：

| 假设的动作 | credits | 备注 |
|---|---|---|
| 五台全部取件（Spot / Stretch / Go2 / LimX / Atlas） | **0** | 只花带宽 |
| 新建 Go2 条目并生成 | 3 | `docs/31 §2` 的提议；**但有真几何，生成没必要** |
| 重抽 `wheelleg` 的 6 件生成件 | 3 | **建议不做** —— 同样 3 credits 买不到一个轮子，而取件能 |
| `char.diva` / `guest.keynote` 补生成 | 6 | `docs/39 §4` 第 1 条的旧账，与本页无关 |

**字节**：下载 ≈ 72 MB（不进版本库），入库 ≈ 840 KB 网格 + 5 份 LICENSE 文本（各 1–11 KB）。

## 7. 裁定（2026-09-14，维护者）

七条全部裁了，不挂着。挂着的待决会变成"下一个人也不敢动"的东西。

| # | 裁定 | 理由 |
|---|---|---|
| 1 | **`porcelain` 解绑 Optimus,归「虚」** | 它是形态空间的**原点**（`roster.ts` 里它就是基准比例），而原点不该同时是一件产品。`docs/31` 的「劳工人」那一档空出来是对的——空位是诚实的，`docs/14 §2` 本来就允许空位存在 |
| 2 | **重取 Spot** | 记录说 Spot、身上穿 ANYmal，而"Spot 只出腿"在钉住的 SHA 上是假的。**两个说法互相抵消时，去看实物再改记录，不要改记录去迁就实物** |
| 3 | **保名 + 加 `machine` 字段** | §5 那四条理由我全部认同，最硬的是第四条：**元数据可查，名字不可查**。加了字段之后 `check:parts` 能自己问"声称是某台机器的条目，身上有没有那台机器的件"——`patrol` 那个矛盾本该被它当场抓到（P21） |
| 4 | **§H 加第三档「实·无几何」** | 项目负责人明确批了（「我们已经有 character 和 guest 这两个东西了，你多一个这个种类也无所谓」）。八个条目挤进"想象"会把那一档变成垃圾桶，而 §H 的力量恰恰来自它不是垃圾桶 |
| 5 | **Atlas 用 v5，但写清楚是哪一代** | 授权干净。版权人是 MIT CSAIL 不是 Boston Dynamics、那是液压那一代而不是 `athlete` 的 tagline 唤起的 2025 电动版——这两件事**都要写进 `machine.note`**。这件作品的诚实标准不允许"看起来像就行" |
| 6 | **LimX 代 W1，标注为代用** | 和 Cassie 代 Digit 同类：同厂、同拓扑、Apache-2.0。`machine.note` 写明它是代用件 |
| 7 | **不接受社区复刻件** | §H 现在的措辞不支持复刻品，而我不打算为了填一个槽位去松动它。`droid` 留在「实·无几何」那一档 |

### 第三档怎么写进 §H

不是加一个形容词，是**加一个位置**：

> **实 · 有几何** → 真网格。**实 · 无几何** → 生成，但 `machine` 字段记着它是谁，
> 并且**明说几何是生成的**。**虚** → 生成，没有 `machine` 字段。

第二档和第三档的区别不在画面上，在**它敢不敢说自己是谁**。
一个记着 `machine: Figure 03` 却用生成几何的条目，是在承认一件事；
一个什么都不记的条目，是在假装没有这个问题。

### 契约变更（我作为契约所有者发起，按 `AGENTS.md` 的规矩广播）

`ThemeDef` 加一个可选字段。`packages/core/src/types.ts` 是冻结契约，
所以这条变更由维护者做并广播，而不是某条 lane 顺手加上：

```ts
/** 这个条目取材自哪台真实机器。没有 = 它是想象出来的（docs/26 §H 的「虚」） */
machine?: {
  name: string;          // 'Spot'
  maker: string;         // 'Boston Dynamics'
  source: string;        // 取到网格的那个 URL，钉到 SHA
  license: string;       // 'BSD-3-Clause'
  /** 几何是真的还是生成的。第三档就靠这一个字段说实话 */
  geometry: 'real' | 'generated';
  note?: string;         // 'DRC/v5 液压那一代，非 2025 电动版'
};
```

`id` 不动 —— `docs/39 §4.7` 记着改 id 会让已经发出去的 seed 码失效。

## 8. 取件记录（2026-09-14）—— 「实·有几何」六条全部落地

§7 裁完之后，第一档六条里还剩三条只有路没有件：`athlete` / `manipulator` / `wheelleg`。
这一节是取件那一轮的记录。落地提交：`bbc32ca`（件、LICENSE、索引），
取件代码在它前面的 `3a46c85` / `c5d5c9d` / `4528e78`（`harvest.mjs` 的 `ORIGINS` 支持 Menagerie 之外的来源、`.gltf` 外挂 `.bin`、
一个 link 多份 OBJ），joint 面数上限在 `0a64b95` / `71c8007`。**Menagerie 的 SHA 没有动**，仍是 `8161bba`。

### 授权 —— 在钉住的 SHA 上重新取原文核过

| 机器 | 来源（整串 SHA） | LICENSE 原文 | 判定 |
|---|---|---|---|
| Atlas → `athlete` | `RobotLocomotion/models@3bd1111011ea8c9813a66bf5cc21f31067f2e1ef` `/atlas/meshes/` | `atlas/LICENSE.TXT`，BSD-3-Clause，© 2012-2022 Robot Locomotion Group @ CSAIL | ✅ 取 |
| LimX WL_P311D → `wheelleg` | `limxdynamics/tron1-robot-description@5b97add1f3b461c9ed26ff2ff2f5025cc6ee4316` `/wheellegged/WL_P311D/meshes/` | 仓库根 `LICENSE`，Apache-2.0；无 NOTICE | ✅ 取 |
| Stretch 3 → `manipulator` | `mujoco_menagerie@8161bba` `/hello_robot_stretch_3/assets/` | 子目录 `LICENSE`，Apache-2.0；无 NOTICE | ✅ 取 |

三条都过。**授权门以前只写在注释里**（`ORIGINS` 的 ✅/🟡），这一轮把它变成了代码：
`--adopt` 取到 LICENSE 原文之后必须认得出是 BSD-3 / Apache-2.0 / MIT，而且和 `ORIGINS.license` 声明的一致，
否则整台机器一件都不取。原文随件入库：`assets/parts/licenses/{atlas,wl_p311d,stretch3}.LICENSE.txt`。

### 件、面数、字节

所有件 ≤ `BUDGET.maxPartTris` 5000、远低于 `maxPartBytes` 1.5 MB。超过 5000 面的原始网格由 `normalize.ts` 的容差焊接 + 减面兜住
（LimX 的 `base_link` 132,464 → 4,928）。

**单件预算够，整具不够。** 第一次落地时 `outline-budget.test.ts` 当场红：`joint` 一具身体里有 14 个实例，
LimX 每件都减到刚好 4984 面，整具 149,448 面，描边翻倍 298,896 > `BUDGET.maxTriangles` 250,000；
Stretch 同理到 239,294（没红，但只剩 4%）。修法不动预算：`normalizeOne` 多一个只许往低压的 `maxTris`，
这两个物种的 `joint` 压到 1500 面。之后整具最坏是 wheelleg 100,420 面（描边 200,840）、manipulator 70,563 面（141,126）。

| 物种 | 件 | 三角形（逐件） | 入库 | 下载原料 |
|---|---|---|---|---|
| `athlete` | 10 | spine 4998 · thigh 2464 · shin 1494 · head 935 · clavicle 556 · upperArm 546 · foot 540 · hand 292 · foreArm 196 · joint 48（共 12,069） | 118 KB | 0.5 MB |
| `wheelleg` | 10 | spine 4928 · head 4952 · clavicle 4952 · upperArm 4976 · foreArm 5000 · hand 5000 · thigh 4968 · shin 5000 · foot 5000 · joint 1482（共 46,258） | 225 KB | 17.9 MB |
| `manipulator` | 10 | spine 4993 · head 4982 · clavicle 4999 · hand 4992 · foot 4999 · foreArm 2472 · upperArm 2268 · joint 1492 · thigh/shin 60（共 31,317） | 189 KB | 22.5 MB |

`manipulator` 故意没取 `base_link_8.obj`（22 MB）和 `link_head_0.obj`（11.5 MB），§4 说过避开它们；
代价是底盘和头罩各少一份材质分件。`wheelleg` 没取第三方的 `realsense_d435.stl`。

### girth —— 两件落在 §H 带外

中位数按落地后的 `parts.json` 现算：head 0.934 · spine 0.841 · hand 0.634 · joint 0.991。

| 件 | girth | 比 | 为什么还是它 |
|---|---|---|---|
| `spine.wheelleg.limx` | 0.588 | **0.698×** | 这台机器的剪影就是一块扁机身挂四条轮腿；髋座（0.85×）在带内，但它不是机身 |
| `hand.wheelleg.limx` | 0.999 | **1.58×** | 四足的前腿末端就是手，而这台机器的腿末端是轮子 |

其余 28 件（带内槽位 12 件）全部在 0.74×–1.18× 之间。越界件照 `core/src/girth.ts` 只给自己的物种用，**不借给别人**。
`check:parts`：247 件，0 错，12 警告（上面两条是新增的，其余十条是既有的）。

### 被换下的件

照 `patrol` 那次的规矩：生成件**一件不删**。`index-parts.ts` 那条规则（一个 family 只要有一件真实网格，
它的生成件整批不进索引）自动把 `athlete` 6 件、`manipulator` 6 件、`wheelleg` 1 件退出索引；
文件还在 `assets/parts/`，名单在 `ATTRIBUTION.md` 末尾。`curation.json` 没有改 ——
它的 `reject` 是「用眼睛看过剔掉的」，这些件不是。

### 渲染 —— 它们读不读得出是那台机器

`/dev/figure.html?theme=<id>&still=120&angle=…`，无头 Chrome + WebGPU，逐个串行。
截图在 `scratch/evidence/real-machines-2026-09-14/`（gitignore，脚本 `still.ts` 同目录）。三具都是 `✓ 槽位齐全`，控制台无警告。

- **`athlete`：读得出，是 DRC 那一代。** 正面：背包式的宽上躯干、方盒子传感器头、骨架感的四肢 —— 就是 2013–2015 年那台液压 Atlas。
  它**不是** tagline 唤起的 2025 电动版，这一条 §3 已经写过，现在画面上也是这样。手偏小、偏细。
- **`wheelleg`：正面读得出，侧面不行。** 正面是一只扁机身、四条黄腿、每条腿末端一个轮子的轮足四足 ——
  `docs/39` 那句「画面上没有轮子」不再成立。侧面有两处毛病：代头（前左髋执行器座）**悬在机身前面**，
  前腿和机身之间**断开一段**。这是 `quadruped` 方案的插座摆位和一块 0.70× 的长机身叠出来的，不是件的问题；
  没有在这一轮修（`core/bodyplan.ts` 和 `SLOT_WIDTH` 不在这条线的范围里）。
- **`manipulator`：件是 Stretch 的，剪影不是。** A 姿态下是一根细杆身体、两条下垂的手臂，看不出是 Stretch；
  `?pose=open` 两臂平伸时，升降滑架 + 头罩 + 两条伸缩臂**开始像** Stretch 那条水平伸出的臂。
  桅杆读成一摞木板（0.030 的铝型材被 stretch 槽位撑到 `SLOT_WIDTH`），底盘在最下面几乎看不见（脚按骨长算，太小）。
  **诚实的判定：这一条「实·有几何」在记录上成立，在画面上还没有成立。** 要成立缺的是 `column` 方案的比例或槽位宽度，
  不是换件。

---

**这一页没有做的事**（照 `docs/26 §G` 的规矩，只说一次，不在每节末尾重复）：
没有下载任何网格、没有跑 `harvest.mjs`、没有改 `roster.ts` / `assets/` / `curation.json`。
所有授权判定来自逐个 URL 取到的 LICENSE 原文；取不到 LICENSE 的一律记 ❌，没有一条写成「大概可以」。
