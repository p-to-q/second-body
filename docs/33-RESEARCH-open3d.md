# 33 · 开源真实 3D 资产 —— 调研与实测

> 2026-09-13。198 件部件目前**全部**是 Hyper3D Rodin 生成的。这一页问的是：
> 厂商和研究机构公开的**真实几何**能不能进这条流水线，以及值不值得进。
>
> **结论先写在这里：能，而且比预期便宜得多。**
> 10 件真实网格（7 件机器人 CAD + 3 件人体骨骼）已经跑通完整规范化流水线，
> 契约检查 0 错 0 警告，`normalize.ts` 只多了一行。
>
> 这一页只调研、只报告、只跑实证。**不改 `roster.ts`、不改 `parts.json`**（那两处别的线在动）。

## 0. 一句话的反直觉结论

**授权不是这条路的障碍，「细节频率」才是。**

我原以为难点在授权 —— 厂商会不会允许再分发。实测下来正相反：
MuJoCo Menagerie 的 **69 个机器人，69 份独立 LICENSE，全部是 MIT / BSD / Apache-2.0，
逐份正则扫过 `non-commercial`，零命中**。授权干净得超出预期。

真正的麻烦出现在拼进身体之后（§6）：真实 CAD 带着 1–3 mm 的面板分缝、螺栓孔、logo 凹槽，
而 Rodin 生成件在 2 cm 以下什么都没有。同屏放一起，一个像**拍的**，一个像**捏的**。
这是这条线唯一真正要解决的问题，而它跟授权、跟格式、跟流水线都无关。

---

## 1. 三档判定的口径

判定对象始终是这件作品的实际用法：**公开 GitHub 仓库 + 公开网页部署 + 非商业艺术装置**。

| 档 | 含义 | 我们要做的事 |
|---|---|---|
| ✅ 直接可用 | MIT / BSD-2/3 / Apache-2.0 / CC0 / 公有领域 | 保留版权声明；Apache-2.0 还要注明「改过」 |
| 🟡 有条件 | CC-BY / CC-BY-SA / GPL，或带非背书条款 | 署名、注明改动；BY-SA 的衍生网格必须同样 BY-SA |
| ❌ 不能用 | 含 NC 条款、无 LICENSE 文件、来源不明 | 不碰。**没有 LICENSE 文件 = ❌**，不是「大概没事」 |

两条容易搞错的地方，先说清楚：

- **「非商业装置」不等于可以用 NC 素材。** 我们把素材**再分发**给公网上任何人，
  包括商业使用者。所以 CC-BY-NC-* 一律判 ❌，不去争论。
- **share-alike 传染到网格，传染不到代码。** CC 的法律文本区分 *Adaptation*（改编）
  和 *Collection*（汇编）：仓库里放着 BY-SA 的网格 + 我们自己的代码，那是汇编，
  代码不因此变成 BY-SA。真正的风险边界是**熔接** —— 把网格烘成源码里的顶点数组字面量，
  或者把 BY-SA 和非 BY-SA 的几何 weld 进同一个 mesh。**所以取件池永远是松散的独立 glb 文件。**

---

## 2. 四条脉络的收获

### A. 机器人本体 —— **MuJoCo Menagerie 就是金矿，其余基本都是它的上游或残次品**

| 来源 | URL | 授权 | 几何 | 能落到槽位契约吗 |
|---|---|---|---|---|
| **MuJoCo Menagerie** | `google-deepmind/mujoco_menagerie` | ✅ 69/69 逐个 LICENSE，MIT/BSD/Apache，零 NC | 1244 STL + 1184 OBJ，5k–50k tris/件 | **能，已实测 7 件** |
| unitree_ros | `unitreerobotics/unitree_ros` | ✅ BSD-3 | DAE（go1/a1/b2）+ STL（g1） | 能，但 DAE 需新依赖（§5） |
| spot_description | `bdaiinstitute/spot_description` | ✅ MIT + BSD-3 | OBJ，按 link | 能（Menagerie 里已有同源） |
| franka_description | `frankarobotics/franka_description` | ✅ Apache-2.0 | DAE 视觉 + STL 碰撞 | 能 |
| UR ROS2 description | `UniversalRobots/Universal_Robots_ROS2_Description` | ✅ BSD-3 | DAE + STL | 能 |
| pal TIAGo / TALOS | `pal-robotics/*` | ✅ Apache-2.0 | STL，含 `femur.STL` | 能 |
| Hello Robot Stretch | `hello-robot/stretch_urdf` | ✅ Clear BSD | STL 按 link | 能（对应 roster 的 `manipulator`） |
| ANYmal C/B | `ANYbotics/anymal_c_simple_description` | ✅ BSD-3 | DAE，`shank_l` / `thigh` 命名干净 | 能 |
| Open Duck Mini | `apirrone/Open_Duck_Mini`（分支 **v2**） | ✅ Apache-2.0 | STL 按 link | 能 |
| K-Scale Z-Bot | `kscalelabs/zeroth-bot` | ✅ MIT | STL 按 link | 能（玩具尺度） |
| Poppy Humanoid | `poppy-project/poppy-humanoid` | 🟡 CC-BY-SA-4.0（硬件部分） | STL，`l_shin_visual.STL` 命名完美 | 能，但衍生件要 BY-SA |
| Berkeley Humanoid Lite | `HybridRobotics/berkeley-humanoid-lite-assets` | 🟡 CC-BY-SA-4.0（文件名拼作 `LICENCE`） | STL | 能 |
| `ros-industrial/universal_robot` | — | ❌ **整棵树没有 LICENSE 文本**（只有 package.xml 写 BSD） | — | 用 Menagerie 的 ur5e 代替 |
| fetch_ros | — | ❌ package.xml 声明 **CC-BY-NC-SA-4.0** | — | 不碰 |
| InMoov | inmoov.fr | ❌ 作者明确 **CC BY-NC** | — | 不碰 |
| Ghost Robotics | — | ❌ **公开的 URDF 里一个网格都没有**，全是方块和圆柱 | — | 不存在这个选项 |
| Agility Digit（`DigitRobot.jl`） | — | ❌ 无 LICENSE | OBJ 按 link | 用 Menagerie 的 cassie（MIT）代替 |
| K-Scale kscale-assets | — | ❌ 无 LICENSE，且 raw HTTP 只返回 LFS 指针 | — | 不碰 |
| 索引工具 | `robot-descriptions/awesome-robot-descriptions` | ✅ CC0 | 280 条，带授权列 | **分诊用它，别手查** |

**Menagerie 有一个别处没有的价值：它把上游的授权缺口补上了。**
`berkeley_humanoid_description` 和 `ros-industrial/universal_robot` 上游**都没有 LICENSE 文件**，
而 Menagerie 收录的是字节相同的网格，外加一份真实的 BSD-3 文本。
这不是转授权的魔法，是 DeepMind 逐个找厂商要了明确许可 —— 对我们来说，它把 ❌ 变成了 ✅。

### B. 人体解剖 / 骨骼

| 来源 | 授权 | 几何 | 判定 |
|---|---|---|---|
| **BodyParts3D / DBCLS** | 🟡 CC-BY-SA 2.1 **JP** | OBJ，**3210 个单骨**，按 FMA 本体拆好，多数 ≤5k tris | **最好的解剖来源**，已实测 2 件 |
| **NIH 3D** `3DPX-000168` 股骨 | ✅ **CC0 / 公有领域** | STL 34k tris | **授权最干净的一件解剖网格**，已实测 |
| NIH 3D 颅骨 `3DPX-012260` | 🟡 CC-BY-4.0 | GLB 11.6 MB | 能用。BodyParts3D 没有整块颅骨，这里补 |
| NIH 3D「Visible Human 衍生」腿骨/骨盆系列 | ❌ **CC-BY-NC-SA-4.0** | — | 陷阱：同一个站点里混着 NC，**必须逐条查** |
| Z-Anatomy | 🟡 CC-BY-SA-4.0 | .blend / FBX，几 GB | 能用但要跑 headless Blender 批导出，性价比低于 BodyParts3D |
| Visible Human Project | ✅ 公有领域（2019 起取消注册） | **只有断层图像，没有网格** | 不是网格来源 |
| Open Anatomy / SPL | ✅ 3D Slicer 的 BSD 式授权 | 几乎全是脑/软组织图谱 | 数据形状不对 |
| Wikimedia `High_quality_skull.stl` | 🟡 CC-BY-SA-4.0 | 41 MB | 能用，减面后比 NIH 颅骨细节好 |

⚠️ **BodyParts3D 是 CC-BY-SA 2.1 日本版**，它和 CC-BY-SA 4.0 **不是双向兼容**的。
所以：不要把 BodyParts3D 的衍生件标成 4.0，也**不要把 BodyParts3D 的骨头和 Z-Anatomy 的骨头 weld 进同一个 mesh** ——
那是真正的授权冲突。分开放成独立文件则完全没问题。

### C. 通用 CC0 三维

| 来源 | 授权 | 对我们有用吗 |
|---|---|---|
| Smithsonian Open Access 3D | ✅ CC0，有 API | 授权最干净，但**没有人体骨骼**，是化石/文物/雕塑 |
| Met Museum Open Access | ✅ CC0（2026 年起有 100+ 件 3D） | 同上，艺术品不是解剖 |
| Sketchfab CC0 筛选 | ✅ 单件 CC0 | 有解剖扫描，但**迁移到 Fab 后 CC0 这个类别不存在了 —— 要留就现在镜像**；且社区上传溯源不可靠 |
| Scan the World / MyMiniFactory | 🟡 混合，含大量 NC-SA | 雕塑，逐件查授权成本高 |
| Poly Haven / Quaternius / Kenney | ✅ CC0 | **没有解剖，也没有机器人**。对这条线无用 |
| Thingiverse / Printables | ❌ 作为系统来源 | 授权逐件且混乱，大量是别处素材改标授权后重传。审计成本超过价值 |

### D. 粒子 / 3DGS / 程序化外壳 —— 见 §7，那里有明确的可行性结论

---

## 3. 实测：10 件真实网格跑通了流水线

```
node scripts/harvest.mjs          # 下载 → 拆件 → 规范化 → 验收
node scripts/harvest.mjs --list   # 只看来源和授权
```

| id | 来源 | 授权 | tris | girth | 大小 |
|---|---|---|---|---|---|
| `shin.real.cassie.a` | Cassie `shin.obj` | ✅ MIT | 4999 | 0.208 | 24 KB |
| `foreArm.real.cassie.a` | Cassie `tarsus.obj` | ✅ MIT | 4980 | 0.295 | 24 KB |
| `thigh.real.anymal.a` | ANYmal C `thigh.obj` | ✅ BSD-3 | 1848 | 0.333 | 31 KB |
| `shin.real.anymal.a` | ANYmal C `shank_l.obj` | ✅ BSD-3 | 1602 | 0.622 | 31 KB |
| `shin.real.g1.a` | G1 `left_knee_link.STL` | 🟡 BSD-3 变体 | 5000 | 0.292 | 25 KB |
| `spine.real.g1.a` | G1 `torso_link_rev_1_0.STL` | 🟡 BSD-3 变体 | 4982 | 0.672 | 25 KB |
| `shin.real.spot.a` | Spot `front_left_lower_leg.obj` | ✅ BSD-3 | 4969 | 0.175 | 24 KB |
| `thigh.real.bone.a` | BodyParts3D 右股骨 | 🟡 CC-BY-SA 2.1 JP | 3102 | 0.254 | 15 KB |
| `spine.real.bone.a` | BodyParts3D 右髋骨 | 🟡 CC-BY-SA 2.1 JP | 2374 | 0.691 | 13 KB |
| `thigh.real.nih.a` | NIH 3D 股骨 | ✅ CC0 | 5000 | 0.177 | 23 KB |

```
取件池契约检查 — 10 件, 0 错, 0 警告
```

三个值得记下的实测事实：

1. **规范化流水线原封不动就接住了真实 CAD。** Z-up、原点在关节中心、多个 mesh
   这三个预期中的落差**一个都没有真正成为问题** —— 因为 `normalize.ts` 本来就
   「取 OBB 最长边转 +Y、最小端点挪到原点、按长度归一」，它不关心输入原本是什么坐标系。
   预判错了，这是好消息。
2. **为 Rodin 写的容差焊接救了真实网格。** STL 按定义是**完全不焊接**的三角形汤。
   G1 躯干 51410 tris 里焊掉了 114225 个重复顶点 —— 没有 `weldTolerant()` 这一步，
   meshoptimizer 一个面都收不动。那段代码当初是为「Rodin 偶尔返回未焊接网格」写的，
   在这里变成了**必经之路**。
3. **产物比生成件还小。** 13–31 KB / 件，而生成件平均 ~36 KB。硬表面 + 无贴图是 meshopt 的理想输入。

### 踩到的坑

- **`unitree_g1` 的 STL 是二进制的，但 80 字节文件头恰好以 `solid ` 开头**（SolidWorks 导出的怪癖）。
  任何用 `startswith('solid')` 判断 ASCII/二进制的解析器都会解错。three 的 `STLLoader`
  做的是「按三角形数反算文件长度」的判定，所以它是对的 —— 这也是不要自己写 STL 解析器的理由。
- **扩展名大小写不一致**：`unitree_g1` 用 `.STL`，`unitree_h1` 用 `.stl`。按 URL 取件会 404。
- **OBJ 是按材质组拆的，不是按 link 拆的**（`obj2mjcf` 干的）。但查过 MJCF：
  这些子网格挂在同一个 body 上且 **geom 不带 `pos`/`quat`**，所以合并是纯粹的顶点集求并，
  不需要任何变换 —— `normalize.ts` 的 `join()` 已经在做这件事。

---

## 4. 署名义务（真要入库时必须做的）

> **2026-09-13：已经入库了，这三条现在是已兑现的义务，不是待办。**
> `compact` / `patrol` / `digitigrade` 三个物种各 10 件真实网格进了 `assets/parts/`
> （`node scripts/harvest.mjs --adopt`）。第 1 条 → `assets/parts/licenses/*.LICENSE.txt`；
> 第 2 条 → `assets/parts/ATTRIBUTION.md`（脚本生成，不手写，所以不会和来源表分叉）
> 加 `/about` 的「署名与许可」第 4 条；第 3 条 → **一件 BY-SA 都没取**，
> BodyParts3D 那两件仍然只在探路池里。下面是当初写的判据，原样留着。

取件池当时**不进版本库**（`.gitignore` 里的 `assets/harvest/` 和 `assets/parts/harvest/`），
所以那时还没有再分发行为。**一旦决定把某件真实网格提交进仓库**，同时要做三件事：

1. 把来源仓库的 `LICENSE` 原文放到网格旁边（例如 `assets/parts/real/unitree_g1/LICENSE`）。
2. 加一份 `ATTRIBUTION.md`，逐件写：来源 URL、原授权、**以及我们做了什么改动** ——
   「转轴到 +Y、平移、按长度归一、减面、去材质」。这一句同时满足 Apache-2.0 §4(b)
   和 BSD/MIT 的声明保留要求。
3. BY-SA 的件（BodyParts3D）要额外标明衍生件同样 CC-BY-SA 2.1 JP，且**不与其他授权的几何熔接**。

BSD-3 的第 3 条是**非背书条款**：不能用 Unitree / ANYbotics / Clearpath / Boston Dynamics
的名义为这件作品背书。描述性地说「这是 G1 的躯干几何」没问题，暗示合作或赞助不行。

Menagerie 还**请求**（非强制）引用：`@software{menagerie2022github, ...}`。顺手加上。

---

## 5. 接真实网格要动的地方

改动总共两处，都是只增不改：

- **新文件 `packages/factory/src/mesh-import.ts`** —— STL / OBJ → glTF Document。
  用 three 自带的 `STLLoader` / `OBJLoader`，**没有新依赖**（three 已经是仓库的依赖，
  这两个 loader 不碰 DOM，Node 里直接可用，已验证）。
- **`normalize.ts` 一行** —— 读取时按扩展名分流。`.glb` 那条路一个字节没变，
  198 件已入库资产的行为不受影响（`npm run check` 在改前改后都是 192 件 0 错）。

`PartMeta` **够用，不需要加字段**。`source` 已经是自由形状的对象，
取件池写的是 `{ provider: 'harvest', model: <URL>, recipeId }`。
真要严格追溯授权，未来可以加一个**可选**的 `source.license` 字段 —— 可选字段不破坏冻结契约（docs/03 §2）。
现在不加，因为授权信息在 `scripts/harvest.mjs` 里跟着 URL 走，那里更不容易和现实分叉。

**没做的：DAE / Collada。** `ColladaLoader` 需要 `DOMParser`，Node 22 没有这个全局，
要支持得加 `@xmldom/xmldom` 之类的新依赖。**没加，也建议先不加** ——
Menagerie 全是 STL/OBJ，DAE 只在 `unitree_ros` / `franka_description` / ANYmal 上游那几个老 ROS 包里才是必须的，
而那些机器人在 Menagerie 里都有 STL/OBJ 版本。等到确实需要某个只有 DAE 的机器人再说。

---

## 6. 性价比表：哪些条目该换成真实网格

对 `docs/31` 那 16 个 archetype 逐行判断。**关键观察**：
docs/31 里参考图「❌ 未找到」的那几行，恰好就是 Menagerie 里有真机 CAD 的那几行 ——
**真实网格救的正是参考图采集失败的那些条目。**

| roster id | 代表机器人 | 参考图（docs/31） | Menagerie 有吗 | 建议 | 为什么 |
|---|---|---|---|---|---|
| `compact` | Unitree G1 | ❌ | ✅ `unitree_g1`，51 件按 link | **改用真实网格（首选）** | 见 §8 第 2 问 |
| `patrol` | Spot | ❌ | ✅ `boston_dynamics_spot` | **改用真实网格** | 四足硬表面，最吃真实比例；Rodin 编的 Spot 腿一直偏粗 |
| （新）Go2 | Unitree Go2 | ❌ | ✅ `unitree_go2` | **直接用真实网格建条目** | 还没花过 credits，从真几何起步最省 |
| `digitigrade` | Digit | ❌ | 🟡 Digit 本身无授权；**Cassie 是 MIT** | **用 Cassie 代 Digit** | 同厂同拓扑的鸟腿，授权干净 |
| `manipulator` | Stretch | 🟡 需裁切 | ✅ `hello_robot_stretch_3` | **改用真实网格** | 机械臂是纯几何物件，生成模型最不擅长 |
| `athlete` | Atlas | ✅ 有图 | ❌ Atlas 无公开网格 | **继续用 Rodin** | 已经有合格 anchor 图，没必要动 |
| `industrial` | Figure 03 | ❌ | ❌ | 继续 Rodin | 没有公开几何，只能生成 |
| `porcelain` | Optimus | 🟡 | ❌ | 继续 Rodin | 同上；且 `porcelain` 要的是被理想化的光滑感，真实 CAD 反而不对 |
| `softwear` | NEO | ❌ | ❌ | 继续 Rodin | 布面软体，CAD 表达不了 |
| `wheelleg` | LimX W1 | ❌（产品下架） | ❌ | 继续 Rodin | — |
| `droid` / `petbot` / `furball` / `screenface` / `orb` | 迪士尼 BDX / Aibo / Moflin / Loona / Ballie | ❌ | ❌ | **继续 Rodin** | 消费产品没有公开 CAD，且这几个要的是「可爱」不是「精确」 |
| `autonomous` | Waymo | ✅ 有图 | ❌ | 继续 Rodin | 已有 press kit 图 |
| `xeno` / `coral` | — | — | — | **继续 Rodin** | docs/31 §3：它们**故意**不像任何真实存在的东西。用真几何等于取消这个主张 |
| `field` | — | — | — | 不变 | `source: 'procedural'`，不生成 |
| 角色类 `char.*` | — | — | — | **继续 Rodin** | 角色是设计出来的，不是测量出来的 |
| （新）解剖骨骼 | — | — | BodyParts3D / NIH | **值得开一个新条目** | 见下 |

**一句话的分界线：条目的主张是「精确」就换真实网格，是「想象」就留 Rodin。**
`xeno` 和 `coral` 用真几何是在自毁；`compact` 和 `patrol` 用生成件是在假装。

**额外建议：解剖骨骼值得单独开一个条目**（而不是塞进 `xeno`）。
BodyParts3D 把 3210 块骨头按 FMA 本体拆好、单 mesh、无贴图、多数已经在 5k tris 预算内 ——
它几乎是照着我们的契约长的。而「一副真实人骨」对这件作品的主题（看我 / 看你 / 第二身体）
是有话要说的，比又一个机器人物种更值得占一个格子。唯一代价是 CC-BY-SA 的署名义务（§4）。

---

## 7. 粒子 / 3DGS：老实说可不可行

### 3DGS —— **落不到我们的刚体挂载契约上。**

不是「难」，是**类型不对**。splat 没有三角形；它的颜色烘在每个高斯的球谐系数里，
所以 docs/03 §4 那条「丢掉贴图、运行时统一套材质」对它**没有意义** ——
你没法在不重写颜色数据的前提下给一个 splat 换材质。而那条决定正是「看起来像一个作品」的关键。

好消息是授权干净：**three.js r186 已经把高斯 splat 渲染并进主干**（MIT，TSL，WebGL/WebGPU 都跑），
Spark（World Labs）、SuperSplat、splat-transform 也都是 MIT。
只有 Inria 原始的**训练**代码是研究/非商业授权 —— 那个我们不需要碰。
切一条腿出来也不是研究问题：SuperSplat 编辑器里套索选中、删除、重定位，一件十分钟。

**它需要的是哪一种新渲染器**（对应 `packages/app/src/creature/mass.ts` 那条 B 档路子）：

1. 一个**独立的图元与 pass** —— 从协方差在顶点着色器里展开的实例化四边形，不是索引三角形。
2. **每帧跨所有 splat 部件的全局深度排序。** 这是真正的成本：alpha 混合要求全局由远及近，
   23 个各自独立运动的肢体 splat，排序范围是它们高斯的并集，姿态或相机一动就得重排 —— 即每帧。
3. **和现有不透明网格的深度合成。** splat 不写可用的深度，所以「不透明遮挡 splat」能work，
   但任何需要深度缓冲的后处理会错，阴影/SSAO 别指望。
4. **预算单位要换。** 「5000 三角形」对 splat 没有对应物，要另立一条高斯数上限。

还有一条美学上的硬伤：**每个 splat 都带着它被拍摄时那个房间的烘焙光照**。
我们统一材质是为了让 23 个物种看起来像一件作品，splat 恰好在对着干。

「把 splat 转成网格再走老流水线」这条省事路子**不成立**：
好的提网格方法（SuGaR / 2DGS / GOF）要从原始多视角照片**重新训练**，而下载来的 splat 没有照片；
只从 PLY 点云做泊松重建，出来的是融化的蜡，**恰好丢掉你想要 splat 的那个质感**。

**判定：除非 splat 的观感本身就是作品的主张，否则不做。真要做，把它当成第二套平行契约，不要假装它是「另一种网格」。**

### 粒子 / metaball —— **这条可行，而且便宜。**

关键分界是「**什么时候生成网格**」：

| 做法 | 产出 | 合契约吗 |
|---|---|---|
| Node 里**离线**跑 marching cubes / surface nets → glb | 三角网格 | **完全合，零渲染器改动** |
| 浏览器**加载时**跑 | 同上 | 合，多一点加载时间，换来每场不同的形态 |
| **每帧**重新多边形化（three 的 `MarchingCubes`） | 每帧重建的网格 | 勉强 —— 是网格，但破坏「加载一次、刚性挂载」，且面数压不进 5000 |
| GPU 粒子（TSL/WebGPU compute） | 点/精灵，没有网格 | **不合**，要自己的 draw path |
| SDF raymarching | 什么都不产出，是个 fragment shader | **不合** |

**最省的路：离线 metaball → glb → 当成普通部件。** 工具链全是 MIT 且已有一半：
`isosurface`（MIT，用的是 Paul Bourke 的公有领域 marching cubes 表）做提取，
`meshoptimizer`（**仓库里已经有了**）减面到 5000，`GLTFExporter` 导出 ——
或者干脆不加依赖：marching cubes 的核心就是一张 256 项边表加一个体素循环，两百行，表是公有领域的。

这条路能给到项目负责人说的「基于粒子、有扩散和膨胀」的那个观感 ——
**作为凝固下来的形态**：形状看起来像长出来的、扩散出来的，因为它确实是，只不过是离线跑的。
把 metaball 的初始位置用一小段粒子扩散模拟播种，一个脚本就能长出一整套彼此不同的肢体外壳。

如果要的是**运行时真的在动**，那是渲染器改动。但更便宜也多半更好看的近似是：
外壳保持静态，用现有材质里的**顶点着色器**按姿态速度沿法线做噪声位移。零流水线改动，读起来就是「活的」。

---

## 8. 三个必答问题

### 1. MuJoCo Menagerie 到底能不能用？

**能用，而且它是整份调研里最该用的来源。**

- **授权**：69 个模型，69 份独立 LICENSE（仓库根的那份是脚本拼接出来的汇总，不是真授权）。
  全部 MIT / BSD-2/3 / Clear BSD / Apache-2.0。**逐份正则扫 `non-commercial`，零命中。**
  义务只有「保留声明」+「Apache-2.0 要注明改过」+「BSD-3 不得用厂商名背书」，都很轻。
  它甚至比上游更干净：`berkeley_humanoid` 和 UR 的上游仓库**根本没有 LICENSE 文件**，
  Menagerie 收的是同样的网格外加真实授权文本。
- **几何质量**：好。厂商自己的 CAD，已经过 MuJoCo 清理，5k–50k tris / 件。
  比例、关节位置、面板分缝全是对的 —— 这正是生成件编不出来的东西。
- **拆件难度**：**低到不像话。** STL 的模型严格一个 link 一个文件，
  「取出一条小腿」= 下载一个文件。OBJ 的模型按材质组拆，但查过 MJCF：
  子网格挂同一个 body 且 geom 不带变换，合并是纯顶点求并 —— `join()` 已经在做。
  唯一要绕的是两个格式坑（二进制 STL 的 `solid` 头、扩展名大小写），都已经在 §3 记下。

一条操作建议：**取件时把 `main` 换成固定的 commit SHA**，否则来源会在脚下变。

### 2. 如果只能换一个条目，换哪个？

**`compact`（Unitree G1）。** 四条理由，按重要性排：

1. **它的参考图一直没找到。** docs/31 §1 第 5 行是 ❌。没有 anchor 图，
   同物种内的风格一致性就只能靠 prompt 硬拉 —— 而 docs/31 §0 的结论是厂商图基本都不能用，
   这个缺口短期内补不上。**真实 CAD 直接跳过了整个参考图问题。**
2. **它是人形，拓扑和我们的槽位 1:1。** head / torso / knee / hip / shoulder / elbow / wrist
   在 G1 的 51 个 link 里全都有独立文件，不需要任何拆解创意。
   换成四足的 `patrol` 就要处理「四条腿怎么映射到两臂两腿」，那是另一个问题。
3. **它现在的投入最低。** `bodyPlan` 是 `'stub'` —— 还没有人在这个条目上花过心思，
   换掉的沉没成本接近零。
4. **G1 是这份谱系表里唯一「小人」。** 一米三的人形，比例本身就是这个条目的主张，
   而比例恰好是生成件最不准的维度。

`patrol`（Spot）是很接近的第二名 —— 剪影最有辨识度，授权同样干净（BSD-3 / Clearpath），
但四足映射多一层工作，所以排第二。

### 3. 真实网格和 Rodin 生成件放在同一具身体上，会不会打架？

**我拼了三具，答案是：会打架，但打架的不是「真实 vs 生成」，而是「硬表面 vs 软表面」。**

- **`real.g1`（真 G1 躯干 + 真 G1 膝下连杆 + Rodin `compact` 其余）—— 打架，而且明显。**
  真躯干是平直的机加工外壳，带面板分缝、logo 凹槽、端口圆环；
  同屏的 Rodin `compact` 件是圆滚滚的、2 cm 以下什么细节都没有。
  并排对照（同一 seed 的纯 Rodin `compact` 身体）看得很清楚：一个像**拍的**，一个像**捏的**。
  这就是 §0 说的**细节频率不匹配**。
- **`real.anymal`（真 ANYmal 大腿 + 小腿 + Rodin `patrol` 其余）—— 基本不打架。**
  因为 `patrol` 本来就是硬表面机械风格，两边的细节频率是接近的。
  真小腿比生成件瘦得多，反而把这具四足的比例**修正**了。
- **`real.bone`（真髋骨当躯干 + Rodin `xeno` 其余）—— 打架，但是另一种。**
  骨盆的闭孔和髂骨翼一眼就认得出是真的，而 `xeno` 的件是生物机械想象。
  这里冲突的是**语义**不是细节频率：真骨头在说「这是测量出来的」，xeno 在说「这是想象出来的」。

三件确定的事：

1. **契约层面完全不打架。** 挂载数学、`localGirth` 反算横向缩放、朝向判定，
   对真实网格**一个特例都没加**就工作了。`✓ 槽位齐全`，没有占位回退。
2. **「丢掉贴图、统一套材质」这个决定，是混搭能成立的唯一原因。**（docs/03 §4）
   两种来源共享同一套颜色和粗糙度，所以最坏情况也只是「细节疏密不均」，
   而不是「两张风格不同的贴图拼在一起」那种立刻崩掉的拼贴感。
   当初那条决定是为了统一 Rodin 内部的风格，**它顺带把这条路也铺好了**。
3. **所以混搭的规矩是：按物种整体换，不要按槽位交替换。**
   `real.anymal` 好看是因为整具身体的细节频率一致；`real.g1` 难看是因为真躯干孤零零地
   比周围精细一个数量级。要么一个条目整体用真实网格（推荐，见第 2 问），
   要么让真实件落在本来就硬表面的家族里。**最差的做法是随机穿插。**

---

## 9. 复现

```bash
node scripts/harvest.mjs --list      # 来源 + 授权，不下载
node scripts/harvest.mjs             # 下载 → 拆件 → 规范化 → 验收
node scripts/harvest.mjs --verify    # 只验收
node scripts/harvest.mjs --only=shin.real.g1.a
```

原料落 `assets/harvest/`，产物落 `assets/parts/harvest/`，两个都在 `.gitignore` 里。
脚本幂等：下过的文件不重下。

看混合身体（需要 `npm run dev`）：

```
/dev/figure.html?parts=/parts/harvest/&theme=real.g1      # 真 G1 躯干 + Rodin compact
/dev/figure.html?parts=/parts/harvest/&theme=real.anymal  # 真 ANYmal 腿 + Rodin patrol
/dev/figure.html?parts=/parts/harvest/&theme=real.bone    # 真髋骨 + Rodin xeno
/dev/figure.html?parts=/parts/harvest/&theme=compact      # 纯 Rodin 对照
```

`?parts=` 是这次给 `dev/figure.html` 加的可选参数，不给就是原来的 `/parts/`。
它指向的那份 `parts.json` 由 `harvest.mjs` 生成：192 件生成件（`file` 指回 `../`，不复制第二份）
\+ 取件池，外加几个 `base` 指向对应 archetype 的 theme —— 混合就是靠 genome 的 base 回退链实现的。
