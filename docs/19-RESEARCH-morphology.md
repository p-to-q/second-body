# 19 · 调研 · 成熟项目怎么表达「身体方案」与做重定向

> 2026-09-12。为 `docs/18-BODY-PLANS.md` 找证据。只读真实代码/规范，每条结论都指得到文件。
> 结论先放这里：**身体方案是数据，重定向算法是代码，中间必须有一层「目标静止骨架」——
> 而 docs/18 的 `BodyPlan` 接口恰好漏掉了第三样东西。**

## 看了什么

| 项目 | 具体文件 | 许可 | 它解决的是什么 |
|---|---|---|---|
| erwincoumans/motion_imitation | `retarget_motion/retarget_motion.py`、`retarget_config_laikago.py`（另有 `_a1` `_vision60`） | Apache-2.0 | 狗 mocap → 四足机器人。**1 份算法 + 3 份 per-robot 配置** |
| YanjieZe/GMR | `general_motion_retargeting/motion_retarget.py`、`ik_configs/*.json`（30 份） | MIT | 人 → 20+ 种人形机器人。**30 份 JSON + 1 份算法** |
| kevinzakka/mink | `examples/quadruped_go1.py`、`examples/hand_shadow.py`、`src/mink/solve_ik.py` | Apache-2.0 | MuJoCo 上的可微 IK；四足只用 5 个 frame 目标驱动 |
| google-deepmind/mujoco_menagerie | `unitree_go2/go2.xml`、`unitree_h1/h1.xml`、各目录独立 `LICENSE` | 按目录：Go2/A1/ANYmal/Spot = BSD-3，Barkour = Apache-2.0 | 同一套 `<body>/<joint>` 词汇描述任意形态 |
| google-deepmind/dm_control | `dm_control/suite/quadruped.xml`（329 行，无网格）、`fish.xml`、`swimmer.xml` | Apache-2.0 | **最小可用的四足/非人形骨架，数字直接可抄** |
| isaac-sim/IsaacLab | `source/isaaclab_assets/.../robots/anymal.py` `unitree.py`、`.../velocity/velocity_env_cfg.py`、`utils/string.py` | BSD-3 | 同一个控制器挂到不同形态：**靠关节名正则** |
| mrdoob/three.js（我们 `node_modules/three@0.186`） | `examples/jsm/utils/SkeletonUtils.js` L476-489 + `retarget()` L32-212 | MIT | 我们手上唯一现成的重定向实现 |
| EpicGames/UnrealEngine | `Rig/IKRigDefinition.h` L134、`Retargeter/IKRetargeter.h` L32、`IKRetargetProcessor.cpp`、`RetargetOps/PelvisMotionOp.cpp` | Epic EULA（**只读，不可抄代码**） | 工业界最完整的跨体型重定向数据结构 |
| Unity Mecanim | `ScriptReference/HumanPose.html` / `HumanPoseHandler.html` / `HumanDescription.html` | 文档，只读 | 唯一真正「无骨长」的归一化中间层 |
| Bath 大学 · Dog Code (MIG '24) | 摘要（`researchportal.bath.ac.uk`；ACM 正文 403 读不到） | 论文 | 人 → 四足具身，**直说了纯规则做不到** |
| LeCAR-Lab/ASAP、robfiras/loco-mujoco | `humanoidverse/config/robot/g1/g1_29dof_anneal_23dof.yaml` L306、`loco_mujoco/smpl/robot_confs/defaults.yaml` | MIT | 映射表住在 YAML 里的又两个独立样本 |
| VAST-AI-Research/UniRig | `configs/skeleton/mixamo.yaml`、`src/system/skin.py` | MIT | **解决的是另一个问题**（给网格自动生骨架），不是姿态重定向 |

没找到证据的：MJCF 本身没有任何「把人体姿态映射到这具身体」的概念 —— 对 `mujoco/src/xml/xml_native_reader.cc`（10 万字节的完整 MJCF 解析器）`grep -i retarget` 命中 0。
ozz-animation（MIT）也没有重定向。Rigify 没有重定向。Anymate 找不到权威仓库。
VRM 1.0 的 `VRMC_vrm.humanoid.humanBones.schema.json` 是一张固定 55 键的角色名词表，但该仓库**没有 LICENSE 文件**，不碰。

## 关键机制

### 1. 「身体方案」一致是**数据**，算法是**代码**。五个独立样本，无一例外

- motion_imitation：`retarget_motion.py` 一份算法，`retarget_config_{laikago,a1,vision60}.py` 三份数据。
  配置里全是数字：`SIM_HIP_JOINT_IDS = [4, 12, 0, 8]`、`SIM_TOE_JOINT_IDS = [7, 15, 3, 11]`、
  `DEFAULT_JOINT_POSE = np.array([0, 0.67, -1.25, ...])`、`REF_POS_SCALE = 1`。
- GMR：`ik_configs/` 下 **30 份 JSON**，`motion_retarget.py` 一份代码。
  `smplx_to_bhl.json` 的形状就是一张表：`"ik_match_table1": { "leg_left_hip_roll": ["left_hip", 1, 1, [0,0,0], [0,0.707,0,0.707]] }`
  —— 目标骨名 → [人体关节名, 位置权重, 旋转权重, 局部位移偏移, 局部旋转偏移]。
- Isaac Lab：躯体树根本不在 Python 里，是外部 USD；Python 只有 `ArticulationCfg` + 正则。
  `anymal.py` L34 `joint_names_expr=[".*HAA", ".*HFE", ".*KFE"]`；`unitree.py` L159 换成 `".*_hip_joint"`。
  环境本身是个洞：`velocity_env_cfg.py` L64 `robot: ArticulationCfg = MISSING`。
- three.js：`RetargetOptions.names` 就是 `Object<string,string>`（我们本地 `SkeletonUtils.js` L479）。
- Unreal：`FBoneChain{ChainName, StartBone, EndBone, IKGoalName}`（`IKRigDefinition.h` L134）
  + `FRetargetChainPair{TargetChainName, SourceChainName}`，全是资产里的数据。

**为什么这么做**：形态数量是内容，算法数量不是。每加一个物种应该只加一条数据。

### 2. 人 → 非人 **不是**纯坐标变换，但「不是纯变换」的原因跟我们无关

motion_imitation `retarget_motion.py` 的 `retarget_pose()` 把两件事分得很干净：

```python
# 躯干位姿：纯坐标构造，没有 IK
forward_dir = neck_pos - pelvis_pos
left_dir = 0.5 * (dir_shoulder + dir_hip);  up_dir = cross(forward_dir, left_dir)
root_pos = 0.5 * (pelvis_pos + neck_pos)

# 四肢：先做 delta 传递（这一步才是「纯 remap」）
ref_hip_toe_delta = ref_toe_pos - ref_hip_pos
sim_tar_toe_pos   = sim_hip_pos + ref_hip_toe_delta
sim_tar_toe_pos[2] = ref_toe_pos[2]            # ← 高度取绝对值，不取 delta
# 然后才解 IK，因为机器人是按关节角参数化的
joint_pose = pybullet.calculateInverseKinematics2(robot, config.SIM_TOE_JOINT_IDS, tar_toe_pos, ...)
```

**IK 存在，是因为目标被「关节角 + 关节限位」参数化。我们的目标是 `bone.p0/p1`（`types.ts` 的 `Bone`），
就是 delta 传递直接产出的那个空间 —— 我们不需要解 IK。**
Unreal 也印证这个分层：FK 链先跑，IK 后跑（`retargeting-operation-stack-in-unreal-engine-5-8`：
"These operations run before the IK pass to establish the base pose for each joint."）。我们只要前半段。

反面证据要记住：Dog Code 摘要说他们「先用一个依赖正/逆运动学的规则重定向器，把人体动作重定向到
**一个与四足共用同一具骨架的中间动作域**」，然后还得再上一层神经 codebook 才够好看 ——
因为他们要的是「像真狗在走路」。我们要的是「一眼看出不是人形，而且你抬手它抬前腿」，门槛低两个数量级。

### 3. 归一化中间层：真的存在，而且有两种；**我们已经有半层了**

- **Unity（最彻底）**：`HumanPose` = `bodyPosition` + `bodyRotation` + `muscles[]`。
  文档原话：*"Retargetable humanoid pose. Represents a humanoid pose that is completely abstracted from
  any skeleton rig."*；`muscles` = *"A muscle value moves a bone for one axis in the range [min,max]
  define in Humanoid Rig."* —— **这个表示里一根骨长都没有**，所以换体型天然不用管比例。
  重定向原语就是 `HumanPoseHandler.GetHumanPose`（从 rig A 读）/ `SetHumanPose`（写到 rig B）。
  （注意：常被引用的「-1..1」「95 条 muscle」在官方文档页里**查证过、查不到**，别当事实写进注释。）
- **Unreal（按链归一化）**：`IKRetargetProcessor.cpp` 的 `CalculateBoneParameters`
  把每根骨在链上的累计长度除以链总长，得到 `param ∈ [0,1]`，再用
  `GetTransformAtChainParam` 在源链的相邻两骨之间插值 —— 拓扑不同、骨数不同都被这一层吃掉。
  根节点另算：`PelvisMotionOp.cpp` 的 `ScaleFactor = Source.InitialHeightInverse * Target.InitialHeight`。
- **GMR（最省事）**：`motion_retarget.py` L62-70 一个全局比例 `ratio = actual_human_height /
  ik_config["human_height_assumption"]`，再乘上 per-part 的 `human_scale_table`
  （`smplx_to_bhl.json` 里腿 0.5、臂 0.8）；`scale_human_data()` 只把**根相对位置**逐点乘系数。
- **我们已经有的那半层**：`packages/core/src/stabilize.ts` L78-95 做的正是
  「方向取当帧测得的、长度取另一张表、从 pelvis 做 FK 重建、再 `ground()` 落地」。
  这就是一台重定向引擎，只是长度表恰好来自这个人自己的滑动中位数。
  `SKELETON.referenceHeight = 1.7` + `bodyScale` 也已经是 GMR 那个全局比例。

### 4. 四足的 body plan 长什么样（以及它跟人体的真实差距）

`mujoco_menagerie/unitree_go2/go2.xml`：`base`（`<freejoint/>`）→ `FL_hip` → `FL_thigh` → `FL_calf`，
脚是 `<geom>` 不是 body。四条腿结构完全相同，关节顺序恒为 **hip(外展) → thigh → calf**，
外展绕 **X**、thigh/calf 绕 **Y**（`<default class="abduction"><joint axis="1 0 0"/>`）；执行器顺序 FL, FR, RL, RR。
几何数字：髋 `(±0.1934, ±0.0465, 0)`、thigh `(0, ±0.0955, 0)`、calf 与足都是 `(0, 0, -0.213)`，静止 `qpos` 每腿 `(0, 0.9, -1.8)`。
`dm_control/suite/quadruped.xml`（Apache-2.0，无网格）更省事：`torso` 起四条腿，每腿 4 关节 `yaw/pitch/knee/ankle`，
髋被 `euler="0 0 ±45"` 掰成八字，外展是 **Z(yaw)** 而不是 X。

**对我们最关键的一条**：`mink/examples/quadruped_go1.py` 驱动一只四足只用 **5 个目标** ——
躯干 `FrameTask(frame_name="trunk", frame_type="body")` + 四个足端
`FrameTask(frame_name=foot, frame_type="site", orientation_cost=0.0)`。
而 MuJoCo 的 `<site>` 按 XML reference 是「无质量、无碰撞的兴趣点」，go2.xml 全文只有 1 个 site。
**四足的控制面是「1 个躯干位姿 + 4 个足端位置」，不是 17 根骨头。**

### 5. 四个独立项目都有的第三样东西：**目标静止骨架 / 重定向静止姿势**

- Unreal `FIKRetargetPose`（`IKRetargeter.h` L32）：`RootTranslationOffset` + `TMap<FName, FQuat> BoneRotationOffsets`。
- three.js `RetargetOptions.localOffsets`：`Object<string, Matrix4>`（我们本地 `SkeletonUtils.js` L488）。
- ASAP `g1_29dof_anneal_23dof.yaml`：`smpl_pose_modifier: - Pelvis: "[np.pi/2, 0, np.pi/2]"`。
- Unity：Avatar 必须配在 T-pose（`ConfiguringtheAvatar.html`：*"The required pose for the character
  to be in, in order to make an Avatar."*）。

`docs/18` §3 的 `BodyPlan` 只有 `remap?(sk: Skeleton): Skeleton`。**没有目标静止骨架这一项。**
没有它，「躯干转成水平」就只能写成一串魔法欧拉角，而且没法单测「站直时四只脚是否都在 y=0」。

## 对我们的具体建议

### B1. 新增 `packages/core/src/bodyplan.ts`，不动任何冻结契约

数据（一张表）和算法（一个纯函数）放同一个新文件，理由见「关键机制 1」：
形态数量是内容，加一个物种应该只加一条数据。

```ts
// 数据：每个 plan 一条。参照 motion_imitation 的 retarget_config_*.py / GMR 的 ik_configs/*.json
export interface BodyPlanDef {
  id: string;
  /** 目标静止骨架：每根骨在「这个物种站好时」的方向与长度比例。缺的那一项，见关键机制 5 */
  rest: Partial<Record<BoneId, { dir: Vec3; lengthScale: number }>>;
  /** 哪些骨头是着地端 —— 落地时看它们，不再写死 footIdx/ankle */
  contacts: BoneId[];
  /** 整具骨架的额外抬高（米），对应 Go2 的 base pos z=0.445 */
  standHeight: number;
}
export const BODY_PLANS: Record<string, BodyPlanDef>;

// 算法：一份，所有 plan 共用
export function remapSkeleton(sk: Skeleton, plan: BodyPlanDef): Skeleton;
```

`remapSkeleton` 的三步，每步都有出处：
1. **构造根框架**（纯坐标，无 IK）—— 抄 `retarget_motion.py:retarget_root_pose()` 的
   `forward = neck - pelvis` / `left = 0.5*(dir_shoulder + dir_hip)` / `up = cross`；
   四足里把这个正交框整体绕 X 转 90°，躯干就水平了。
2. **按 `rest` 重建 17 根骨**：方向 = 人体骨方向经根框架变换，长度 = `stableLength × rest[id].lengthScale`。
   这一步跟 `stabilize.ts` L78-95 的 FK 循环**结构完全一样**，照抄那段 `for (const [id, aName, bName] of BONES)`。
3. **按 `contacts` 重新落地**：抄 `stabilize.ts` 的 `ground()`，只是候选点换成 `plan.contacts`。
   依据：`retarget_motion.py` 的 `sim_tar_toe_pos[2] = ref_toe_pos[2]`（高度取绝对值而非 delta）。

四足的 `rest` 表直接用 Go2 的数字（BSD-3，保留 Unitree 版权声明）或
`dm_control/suite/quadruped.xml`（Apache-2.0，加一行 NOTICE 更省事）。
**骨头映射**（我们 17 根正好一一对应，这是 A 档能成立的根本原因）：
`upperArm→前腿 thigh`、`foreArm→前腿 calf`、`hand→前足`、`thigh→后腿 thigh`、`shin→后腿 calf`、
`foot→后足`、`spine→水平躯干`、`neck+head→从 chest 前伸`、`clavicleL/R→前髋外展段`。

**冻结契约影响：零。** `types.ts` 的 `Skeleton`/`Bone`/`BoneId` 一个字段不动（还是 17 根骨），
`docs/03` 的 `parts.json` 不动，`docs/04` §4 的挂载数学不动 —— 这正是 docs/18 A 档的卖点，成立。

### B2. 插入点是 `packages/app/src/main.ts:133`，**在 `stabilizer.apply()` 之后**

```ts
lastSkeleton = stabilizer.apply(buildSkeleton(mediapipeToWorld(raw), raw.world, raw.t), dt);
// ↓ 新增一行
if (plan) lastSkeleton = remapSkeleton(lastSkeleton, plan);
```
必须在之后：稳定器要看真人的骨长中位数，看不能是被拉长 1.6 倍的假骨长，否则中位数窗口永远收敛不了。
`packages/app/src/creature/assemble.ts` 与 `creature.ts:259` **一行都不用改**。

### B3. `towering` / `stub` 几乎是白送的

`stabilize.ts` L88 那行 `p1 = add(p0, scale(norm(d), stable.get(id) ?? mm.len))` 已经是
「长度从表里来、方向从模型来」。`rest[id].lengthScale` 乘在同一个位置即可，
对应 Unreal 的 `StretchBoneLengthUniformly`（`StretchRatio = SourceChainLengthCurrent / SourceChainLengthInitial`）
和 GMR 的 `human_scale_table`（腿 0.5 / 臂 0.8 那种 per-part 系数）。
**不要改 `stabilize.ts` 本身**（它归 `docs/04` §3 管），在 `bodyplan.ts` 里重跑一遍同样的循环。

### B4. `RosterEntry` 加 `bodyPlan?: string`，加在 `packages/factory/recipes/roster.ts`

`roster.ts:33` 的 `RosterEntry` 不是冻结契约，随便加。
`types.ts` 的 `ThemeDef` 若也要带这个字段，按 P0「只允许新增可选字段」加 `bodyPlan?: string`——
这是 P0 明文允许的唯一一种改法，**仍需在任务输出里写明**。

### B5. 横向比例：不要动 `tuning.ts`

四足的前腿是从 `upperArm` 来的，`SLOT_WIDTH['upperArm']` 比 `thigh` 细，
直接跑会得到「前腿细后腿粗」的鬣狗。解法是在 `bodyplan.ts` 里带一张
`girthScale: Partial<Record<Slot, number>>`，在 `assemble.ts:` 计算 `g` 的地方乘进去，
而不是给 `tuning.ts` 的 `SLOT_WIDTH` 再开一层 per-plan 分支 —— 保持「基准宽度只有一处」。

### B6. A 档会在哪里翻车（四条，都有对照证据）

1. **没有目标静止骨架** → 只能写魔法欧拉角，且无法单测。见关键机制 5。**这是 docs/18 最大的漏洞。**
2. **落地**：`stabilize.ts` 的 `ground()` 只看 `footIdxL/R`、`ankleL/R`。四足有 4 个接触端
   （手 + 脚），人抬手时前腿离地，整只兽会被抬起来。必须换成 `plan.contacts`。
3. **前后腿不等长**：人的上臂+前臂 ≈ 0.55m，大腿+小腿 ≈ 0.85m → 四足前低后高。
   Go2 的四条腿是等长的（calf 全是 `0 0 -0.213`）。必须靠 `lengthScale` 归一化，
   这正是 Unreal 的 arc-length param / GMR 的 `human_scale_table` 在解决的事。
4. **`clavicleL/R` 在四足里没有对应物**（前腿直接长在躯干上），两根骨会变成多余零件。
   建议 `rest` 里把它们的 `lengthScale` 压到 ~0.2 当作髋部外展段。

附带一条不是 bug 的事：躯干水平后 `attachMatrix` 的 `dir ≈ -Y` 退化分支会常态触发
（`docs/04` §4 已规定、`attach.test.ts` 用例 3 已覆盖），不用改代码，但心里要有数。

## 明确不要抄的

| 不抄 | 出处 | 为什么对 48 小时装置太重 |
|---|---|---|
| 每帧解 QP/IK | mink `solve_ik.py`、GMR `motion_retarget.py` L181、loco-mujoco 每帧 25 次 `mj_step` | 我们的目标是 `bone.p0/p1`，不是关节角。IK 是为「关节角 + 限位」参数化的机器人准备的，我们没有这个约束 |
| 神经 codebook / FSQ 潜空间 | Dog Code (MIG '24) | 要训练数据、要训练、要推理预算。它解决的是「像真狗走路」，不是「一眼看出不是人」 |
| SMPL shape 拟合标定 | PBHC `fit_smpl_shape.py`（Adam 1000 iter 拟合 β + scale） | 需要一个离线标定环节。现场观众站上来就要动 |
| Unity muscle space 全套 | `HumanTrait` / `HumanLimit`（55 骨 + N muscle + per-bone 限位） | 我们只有 17 根骨、`roll` 恒为 0（`docs/04` §5）。上 muscle 空间要先补齐 roll 与限位表 |
| Isaac Lab 的正则间接层 | `utils/string.py` `resolve_matching_names` + `re.fullmatch` | 它解决的是「几十个机器人 × 几十个任务」的组合爆炸。我们 `BoneId` 是 17 个字面量联合类型，直接查表更快更安全 |
| URDF / MJCF 解析器 | 任何一个 | 我们不做动力学。要的只是那几十个数字，手抄成 TS 常量即可 |
| UniRig / RigAnything | `configs/skeleton/mixamo.yaml` | 解决的是「给一个网格自动生成骨架+蒙皮」。我们的问题反过来：骨架已知，缺的是身体方案 |
| Blender Rigify 的四足 metarig | `rigify/metarigs/Animals/{wolf,horse}.py` | **GPL-2.0-or-later，许可不兼容**。命名习惯（front/hind × thigh/shin/foot/toe）可以参考，坐标表不要抄 |
| `docs/18` §4 的 monolith 离线切分 | 我们自己 | 它是对的，但它是管线活。先做 B1–B3（纯函数 + 测试），剪影问题往后放 |
