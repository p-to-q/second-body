# 署名与许可 —— `assets/parts/` 里的真实网格

<!-- 由 `node scripts/harvest.mjs --adopt` 生成，不要手改。 -->

这些件不是生成的，是**真实存在的机器的原厂几何**。它们进了版本库，
所以这构成**再分发**，下面三件事必须同时成立（docs/33 §4）：

1. 每个来源的 LICENSE 原文在 [`licenses/`](./licenses/)，随件入库。
2. 下表逐件写清来源与改动。
3. CC-BY-SA 的源**一件都没有取**。BodyParts3D 的人体骨骼留在探路池里
   （`assets/parts/harvest/`，.gitignore），因为 BY-SA 的传染要求衍生件同样 BY-SA，
   和这个仓库 MIT 的代码熔接不了。处理不了就不用 —— 这是 docs/33 §4 第 3 条的落点。

## 来源钉死在 commit SHA

全部取自 MuJoCo Menagerie，**`8161bba264d7fa7c99ca301e91e7fb44737676ad`**。
指向分支的后果不是报错，是来源在脚下变，而 `check:parts` 照样 0 错。
重新取一遍：`node scripts/harvest.mjs --adopt`。

| 来源 | 版权 | 授权 | 附加条件 |
|---|---|---|---|
| Unitree G1 | HangZhou YuShu TECHNOLOGY CO.,LTD. ("Unitree Robotics") | BSD-3-Clause（Unitree 变体） | 非背书：不得以 Unitree 的名义为本作品背书 |
| Boston Dynamics Spot | Clearpath Robotics Inc. | BSD-3-Clause | 非背书：不得以 Boston Dynamics / Clearpath 的名义为本作品背书 |
| ANYbotics ANYmal C | ANYbotics AG | BSD-3-Clause | 非背书：不得以 ANYbotics 的名义为本作品背书 |
| Agility Robotics Cassie | Agility Robotics | MIT | — |

**非背书条款是真的。** 说「这是 G1 的躯干几何」是描述，可以；
暗示 Unitree / ANYbotics 与本作品有合作或赞助关系，不行。本作品与上述任何公司无关。

## 我们做了什么改动

**每一件都改过**，改动对所有件是同一套（`packages/factory/src/normalize.ts`）：

1. 合并成单 mesh，烘掉节点变换；
2. **丢掉全部材质与贴图**（运行时统一套本仓库自己的材质）；
3. 超过 5000 三角形的做容差焊接 + 减面；
4. 把 OBB 最长边**转到 +Y**，粗端朝下；
5. 平移到「一端在原点」，**按长度归一到 1.0**，横向居中。

换句话说：几何被重新定向、重新缩放、简化过，颜色和材质全部丢弃。
这满足 Apache-2.0 §4(b) 的「注明改动」，也满足 BSD/MIT 的声明保留要求。

## 逐件

| 部件 id | 机器 | 上游文件 | 授权 | 为什么是这一件 |
|---|---|---|---|---|
| `spine.compact.real` | Unitree G1 | `unitree_g1/assets/torso_link_rev_1_0.STL` | BSD-3-Clause（Unitree 变体） | 躯干。剪影里最先被认出来的一块；也是生成件最容易编错比例的一块 |
| `head.compact.real` | Unitree G1 | `unitree_g1/assets/head_link.STL` | BSD-3-Clause（Unitree 变体） | 头。roster 说 compact 的"头不是脸，是一个黑色 sensor pod" —— G1 的头正是那个 pod |
| `clavicle.compact.real` | Unitree G1 | `unitree_g1/assets/left_shoulder_pitch_link.STL` | BSD-3-Clause（Unitree 变体） | 肩座。四肢从躯干伸出去的那一节 |
| `upperArm.compact.real` | Unitree G1 | `unitree_g1/assets/left_shoulder_yaw_link.STL` | BSD-3-Clause（Unitree 变体） | 上臂。G1 的上臂就是 shoulder_yaw 这一节连杆 |
| `foreArm.compact.real` | Unitree G1 | `unitree_g1/assets/left_elbow_link.STL` | BSD-3-Clause（Unitree 变体） | 前臂 |
| `hand.compact.real` | Unitree G1 | `unitree_g1/assets/left_rubber_hand.STL` | BSD-3-Clause（Unitree 变体） | 手。标配的三指橡胶手 —— 连指手套一样的剪影，比灵巧手更"是 G1" |
| `thigh.compact.real` | Unitree G1 | `unitree_g1/assets/left_hip_yaw_link.STL` | BSD-3-Clause（Unitree 变体） | 大腿。髋 yaw 到膝之间那一节 |
| `shin.compact.real` | Unitree G1 | `unitree_g1/assets/left_knee_link.STL` | BSD-3-Clause（Unitree 变体） | 小腿。探路池验过的那一件 |
| `foot.compact.real` | Unitree G1 | `unitree_g1/assets/left_ankle_roll_link.STL` | BSD-3-Clause（Unitree 变体） | 脚掌 |
| `joint.compact.real` | Unitree G1 | `unitree_g1/assets/left_ankle_pitch_link.STL` | BSD-3-Clause（Unitree 变体） | 关节。踝 pitch 的叉形关节块，girth 0.961 ≈ 槽位中位数 0.993 |
| `spine.patrol.spot` | Boston Dynamics Spot | `boston_dynamics_spot/assets/front_left_hip.obj` | BSD-3-Clause | 机身髋座。**不是 `body_0.obj`**：那块机身实测 0.857×0.234×0.192 m，归一化后 girth 0.273 = spine 中位数 0.842 的 0.32×，而 spine 是 uniform 槽位（SLOT_WIDTH/localGirth），放进去会被撑成一块 1.6 m 长的板子。髋座 girth 0.707 ≈ 0.84×，是这台机器上最大的一块合身的壳 |
| `head.patrol.spot` | Boston Dynamics Spot | `boston_dynamics_spot/assets/arm_link_wr1.obj` | BSD-3-Clause | 头。腕节 —— Spot 唯一带相机的那一块，也是这台机器唯一能被叫做"脸"的地方；girth 0.915 ≈ head 中位数 0.941 |
| `clavicle.patrol.spot` | Boston Dynamics Spot | `boston_dynamics_spot/assets/arm_link_sh0.obj` | BSD-3-Clause | 肩座。机械臂从机身伸出去的那一节 |
| `upperArm.patrol.spot` | Boston Dynamics Spot | `boston_dynamics_spot/assets/front_left_upper_leg_1.obj` | BSD-3-Clause | 前腿上节。真机四条腿同形，前腿当上肢 |
| `foreArm.patrol.spot` | Boston Dynamics Spot | `boston_dynamics_spot/assets/front_left_lower_leg.obj` | BSD-3-Clause | 前腿下节 |
| `hand.patrol.spot` | Boston Dynamics Spot | `boston_dynamics_spot/assets/arm_link_fngr_0.obj` | BSD-3-Clause | 手。夹爪的指节 —— 这台机器真的有手；girth 0.668 ≈ hand 中位数 0.624 |
| `thigh.patrol.spot` | Boston Dynamics Spot | `boston_dynamics_spot/assets/rear_left_upper_leg_1.obj` | BSD-3-Clause | 后腿上节 |
| `shin.patrol.spot` | Boston Dynamics Spot | `boston_dynamics_spot/assets/rear_left_lower_leg.obj` | BSD-3-Clause | 后腿下节 |
| `foot.patrol.spot` | Boston Dynamics Spot | `boston_dynamics_spot/assets/front_jaw.obj` | BSD-3-Clause | 足垫。Spot 的脚是腿末端的一个橡胶球，没有单独的网格；取夹爪前颚那一片扁板当平底的脚 —— 这是挑，不是编（和 ANYmal 那次取检修盖板同一类决定） |
| `joint.patrol.spot` | Boston Dynamics Spot | `boston_dynamics_spot/assets/arm_link_wr0.obj` | BSD-3-Clause | 关节。腕 roll 关节块，girth 0.927 ≈ joint 中位数 0.991 —— 它本来就是一个关节 |
| `spine.patrol.real` | ANYbotics ANYmal C | `anybotics_anymal_c/assets/top_shell.obj` | BSD-3-Clause | （已被 Spot 换下）机身上壳 |
| `head.patrol.real` | ANYbotics ANYmal C | `anybotics_anymal_c/assets/face.obj` | BSD-3-Clause | （已被 Spot 换下）前脸传感器面板 |
| `clavicle.patrol.real` | ANYbotics ANYmal C | `anybotics_anymal_c/assets/hip_l.obj` | BSD-3-Clause | （已被 Spot 换下）髋座 |
| `upperArm.patrol.real` | ANYbotics ANYmal C | `anybotics_anymal_c/assets/thigh.obj` | BSD-3-Clause | （已被 Spot 换下）前腿上节 |
| `foreArm.patrol.real` | ANYbotics ANYmal C | `anybotics_anymal_c/assets/shank_r.obj` | BSD-3-Clause | （已被 Spot 换下）前腿下节 |
| `hand.patrol.real` | ANYbotics ANYmal C | `anybotics_anymal_c/assets/drive.obj` | BSD-3-Clause | （已被 Spot 换下）ANYdrive 执行器代前肢末端 —— 那台机器没有手 |
| `thigh.patrol.real` | ANYbotics ANYmal C | `anybotics_anymal_c/assets/thigh.obj` | BSD-3-Clause | （已被 Spot 换下）后腿上节 |
| `shin.patrol.real` | ANYbotics ANYmal C | `anybotics_anymal_c/assets/shank_l.obj` | BSD-3-Clause | （已被 Spot 换下）后腿下节 |
| `foot.patrol.real` | ANYbotics ANYmal C | `anybotics_anymal_c/assets/hatch.obj` | BSD-3-Clause | （已被 Spot 换下）机腹检修盖板代足垫 |
| `joint.patrol.real` | ANYbotics ANYmal C | `anybotics_anymal_c/assets/lidar.obj` | BSD-3-Clause | （已被 Spot 换下）顶上那颗旋转激光雷达 |
| `spine.digitigrade.real` | Agility Robotics Cassie | `agility_cassie/assets/pelvis.obj` | MIT | 骨盆。Cassie 的"躯干"就是这一块，两条腿直接挂上去 |
| `head.digitigrade.real` | Agility Robotics Cassie | `agility_cassie/assets/hip-yaw.obj` | MIT | 头（代）。Cassie 无头，用同机的髋 yaw 执行器罩当 sensor pod |
| `clavicle.digitigrade.real` | Agility Robotics Cassie | `agility_cassie/assets/knee-spring.obj` | MIT | 肩座（代膝弹簧板）。girth 0.542 ≈ clavicle 中位数 0.548 |
| `upperArm.digitigrade.real` | Agility Robotics Cassie | `agility_cassie/assets/hip-pitch.obj` | MIT | 上臂（代髋 pitch 壳） |
| `foreArm.digitigrade.real` | Agility Robotics Cassie | `agility_cassie/assets/tarsus.obj` | MIT | 前臂。跗骨连杆，细长、两端轴承座 —— 探路池验过它当前臂比当小腿更像 |
| `hand.digitigrade.real` | Agility Robotics Cassie | `agility_cassie/assets/foot-crank.obj` | MIT | 手（代足曲柄）。girth 0.530 ≈ hand 中位数 0.624 |
| `thigh.digitigrade.real` | Agility Robotics Cassie | `agility_cassie/assets/knee.obj` | MIT | 大腿。膝壳连着大腿，反关节的那个折点就在这里 |
| `shin.digitigrade.real` | Agility Robotics Cassie | `agility_cassie/assets/shin.obj` | MIT | 小腿。真机就叫 shin；girth 0.208 —— 鸟腿的细全在这一件上 |
| `foot.digitigrade.real` | Agility Robotics Cassie | `agility_cassie/assets/foot.obj` | MIT | 脚。一片着地的刀，没有脚掌 —— 鸟腿的读法全在这里 |
| `joint.digitigrade.real` | Agility Robotics Cassie | `agility_cassie/assets/hip-roll.obj` | MIT | 关节。髋 roll 壳，girth 0.929 ≈ joint 中位数 0.993 |

## 被换下来的生成件（32 件）

这三个物种原来的 Rodin 生成件**文件一件都没删**，还在 `assets/parts/` 里，
只是不再进 `parts.json`（规则在 `packages/factory/src/index-parts.ts`：
一个物种只要有一件真实网格，它的生成件就整批不进索引）。

它们不是坏件 —— 坏件在 `curation.json` 里，那是另一回事。
它们是被一个策展决定换下来的（docs/26 §H），而那个决定可能会变。

- `clavicle.patrol.a`
- `clavicle.patrol.b`
- `foot.compact.a`
- `foot.digitigrade.a`
- `foot.patrol.a`
- `foot.patrol.b`
- `foreArm.patrol.a`
- `foreArm.patrol.b`
- `hand.patrol.a`
- `hand.patrol.b`
- `head.compact.a`
- `head.digitigrade.a`
- `head.patrol.a`
- `head.patrol.b`
- `joint.compact.a`
- `joint.digitigrade.a`
- `joint.patrol.a`
- `joint.patrol.b`
- `shin.compact.a`
- `shin.digitigrade.a`
- `shin.patrol.a`
- `shin.patrol.b`
- `spine.compact.a`
- `spine.digitigrade.a`
- `spine.patrol.a`
- `spine.patrol.b`
- `thigh.patrol.a`
- `thigh.patrol.b`
- `upperArm.compact.a`
- `upperArm.digitigrade.a`
- `upperArm.patrol.a`
- `upperArm.patrol.b`

## 顺手引用

Menagerie 请求（非强制）引用：

```bibtex
@software{menagerie2022github,
  author = {Zakka, Kevin and Tassa, Yuval and {MuJoCo Menagerie Contributors}},
  title = {{MuJoCo Menagerie: A collection of high-quality simulation models for MuJoCo}},
  url = {https://github.com/google-deepmind/mujoco_menagerie},
  year = {2022},
}
```
