#!/usr/bin/env node
/**
 * 取件脚本 —— 从开源仓库下载真实机器人/解剖网格，拆成单件，过规范化流水线。
 *
 * 为什么脚本是交付物而下载的网格不是：各来源授权不同（BSD-3 / Apache-2.0 / MIT 都要保留声明），
 * 而且原始 CAD 动辄几 MB。把网址和授权写进代码、让任何人能重新取一遍，
 * 比把二进制塞进仓库更诚实也更可维护。原料落到 `assets/harvest/`（.gitignore）。
 *
 * 为什么每条来源带一行授权注释：这件作品是公开仓库 + 公开部署。
 * 授权判断必须跟着 URL 走，不能只写在文档里 —— 文档会和代码分叉，这里不会。
 *
 * 用法：
 *   node scripts/harvest.mjs            下载 + 规范化 + 验收
 *   node scripts/harvest.mjs --list     只列来源和授权，不下载
 *   node scripts/harvest.mjs --only=shin.real.cassie.a
 *   node scripts/harvest.mjs --verify   只对已有产物验收（不重新下载）
 */
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HARVEST = resolve(ROOT, 'assets/harvest');          // 下载的原始网格
const OUT = resolve(ROOT, 'assets/parts/harvest');        // 规范化产物

/**
 * 契约阈值 —— 和 `packages/factory/src/check-parts.ts` 逐字一致。
 * 为什么在这里复述而不是 import：那个文件是合并门，只认 `assets/parts/parts.json`，
 * 而 parts.json 由别的线在动（AGENTS.md：不碰）。取件池是独立的池子，
 * 就像慢回路的 `assets/parts/lineage/` 一样 —— 但**验收标准必须是同一套数字**。
 */
const EPS = 2e-3, MAX_TRIS = 5000, MAX_BYTES = 1_500_000;

/**
 * 来源一律钉死在 commit SHA，不要指向 `main`。
 *
 * 指向分支的后果不是报错，是**来源在脚下变**：今天取到的和明天取到的可能不是同一个网格，
 * 而 `check:parts` 照样 0 错 —— 你不会知道它变过。
 * 这和海报数字漂掉是同一类错（`assets/brand/README.md` 记过一次）：
 * 没人在说谎，只是没人负责重新核对。
 *
 * 要升级来源：改 SHA，重跑，**在提交信息里写清楚为什么升**。
 */
const MENAGERIE_SHA = '8161bba264d7fa7c99ca301e91e7fb44737676ad';   // 2026-09-13
const BODYPARTS_SHA = 'fd527e6f4daf732fd814314d9257df5877b844bc';   // 2026-09-13
const MENAGERIE = `https://raw.githubusercontent.com/google-deepmind/mujoco_menagerie/${MENAGERIE_SHA}`;

/**
 * 来源清单。
 *
 * `license` 一列是**对这件作品的判定**（公开仓库 + 公开部署 + 非商业艺术装置），
 * 不是泛泛的授权名。三档见 docs/33 §1：✅ 直接可用 / 🟡 有条件 / ❌ 不能用。
 * 这里只放 ✅ 和 🟡 —— ❌ 的来源根本不该出现在可执行的取件路径上。
 *
 * MuJoCo Menagerie 的关键事实：**每个机器人子目录带自己的 LICENSE**，
 * 仓库根的 Apache-2.0 管的是 MJCF 和工具，不是厂商的几何。所以判定必须逐个机器人做。
 */
const SOURCES = [
  {
    id: 'shin.real.cassie.a', slot: 'shin', family: 'real.cassie',
    // MIT（Agility Robotics 自己发布）—— 保留版权声明即可，无 share-alike。这是最干净的一档。
    license: '✅ MIT · Agility Robotics · mujoco_menagerie/agility_cassie/LICENSE',
    url: `${MENAGERIE}/agility_cassie/assets/shin.obj`,
    note: 'Cassie 小腿。真机就叫 shin，几何直接对上我们的 shin 槽位',
  },
  {
    id: 'foreArm.real.cassie.a', slot: 'foreArm', family: 'real.cassie',
    license: '✅ MIT · Agility Robotics · mujoco_menagerie/agility_cassie/LICENSE',
    url: `${MENAGERIE}/agility_cassie/assets/tarsus.obj`,
    note: 'Cassie 跗骨连杆。细长、两端有轴承座，当前臂用比当小腿更像',
  },
  {
    id: 'thigh.real.anymal.a', slot: 'thigh', family: 'real.anymal',
    // BSD-3-Clause（ANYbotics AG, 2020）—— 保留版权 + 免责声明，可再分发。
    license: '✅ BSD-3-Clause · ANYbotics AG · mujoco_menagerie/anybotics_anymal_c/LICENSE',
    url: `${MENAGERIE}/anybotics_anymal_c/assets/thigh.obj`,
    note: 'ANYmal C 大腿。带驱动器外壳，分缝和散热筋是真的',
  },
  {
    id: 'shin.real.anymal.a', slot: 'shin', family: 'real.anymal',
    license: '✅ BSD-3-Clause · ANYbotics AG · mujoco_menagerie/anybotics_anymal_c/LICENSE',
    url: `${MENAGERIE}/anybotics_anymal_c/assets/shank_l.obj`,
    note: 'ANYmal C 小腿。碳纤维管 + 端头，比生成件瘦得多 —— 正是生成模型编不出来的比例',
  },
  {
    id: 'shin.real.g1.a', slot: 'shin', family: 'real.g1',
    // Unitree 的 BSD-3 变体：保留版权 + 免责声明，禁止用 Unitree 名义背书。
    // 我们不声称背书，判定为可用；但**必须**在 docs/33 和 credits 里写明来源。
    license: '🟡 BSD-3 变体 · Unitree Robotics · 需署名且不得暗示背书',
    url: `${MENAGERIE}/unitree_g1/assets/left_knee_link.STL`,
    note: 'G1 膝下连杆。roster 的 compact 条目就是 G1，而它的参考图一直没找到（docs/31 §1 第 5 行）',
  },
  {
    id: 'spine.real.g1.a', slot: 'spine', family: 'real.g1',
    license: '🟡 BSD-3 变体 · Unitree Robotics · 需署名且不得暗示背书',
    url: `${MENAGERIE}/unitree_g1/assets/torso_link_rev_1_0.STL`,
    note: 'G1 躯干。人形躯干的真实比例，生成件最容易编错的就是这个',
  },
  {
    id: 'shin.real.spot.a', slot: 'shin', family: 'real.spot',
    // BSD-3-Clause（Clearpath Robotics 发布的 Spot 描述包）。
    license: '✅ BSD-3-Clause · Clearpath Robotics · mujoco_menagerie/boston_dynamics_spot/LICENSE',
    url: `${MENAGERIE}/boston_dynamics_spot/assets/front_left_lower_leg.obj`,
    note: 'Spot 前左小腿。roster 的 patrol 条目就是 Spot',
  },

  // ── 解剖骨骼（docs/33 §2 B 脉络）───────────────────────────────────────────
  // 这两件是 🟡：CC-BY-SA 要求署名 + 注明改动 + 衍生件同样开源。
  // 我们做的改动恰恰全是 CC-BY-SA 眼里的「改动」：转轴、挪原点、归一长度、减面、去材质。
  // 所以取件池**不进版本库**（.gitignore），署名写在 docs/33 §4 —— 分享传染到网格，传染不到代码。
  {
    id: 'thigh.real.bone.a', slot: 'thigh', family: 'real.bone', ext: '.obj',
    license: '🟡 CC-BY-SA 2.1 JP · BodyParts3D / DBCLS · 需署名 + 注明改动 + 衍生件同样 BY-SA',
    url: `https://media.githubusercontent.com/media/olivercase/body_parts_3d_api/${BODYPARTS_SHA}/meshes/FJ3365_BP23346_FMA24474_Right%20femur.obj`,
    note: '右股骨。3102 tris，已经在预算内 —— 解剖数据天生就是单 mesh、无贴图，比 CAD 还合规',
  },
  {
    id: 'spine.real.bone.a', slot: 'spine', family: 'real.bone', ext: '.obj',
    license: '🟡 CC-BY-SA 2.1 JP · BodyParts3D / DBCLS · 需署名 + 注明改动 + 衍生件同样 BY-SA',
    url: `https://media.githubusercontent.com/media/olivercase/body_parts_3d_api/${BODYPARTS_SHA}/meshes/FJ3152_BP23294_FMA16586_Right%20hip%20bone.obj`,
    note: '右髋骨。BodyParts3D 没有整块颅骨也没有整副胸廓 —— 它按 FMA 本体拆到单骨，这对我们正好',
  },
  {
    id: 'thigh.real.nih.a', slot: 'thigh', family: 'real.nih', ext: '.stl',
    // CC0：署名都不要求。整份调研里授权最干净的一件解剖网格。
    license: '✅ CC0 / 公有领域 · NIH 3D · entry 3DPX-000168',
    url: 'https://3d.nih.gov/api/submissions/162/runs/4e6c5ffb-a687-4992-ac61-198998d7fbcf/output-files/1333',
    note: '人股骨，34k tris 的扫描件。留着它是为了压测减面那一段：CAD 是硬表面，扫描件不是',
  },
];

// ══ 入库：按物种整体换（docs/26 §H 的策展决定）═════════════════════════════
//
// 上面那张 SOURCES 是**探路**用的取件池：一个槽位取一件，不进版本库，只回答
// 「真实网格能不能过流水线」和「和生成件混在一起会不会打架」。答案是能、会。
//
// 下面这张 ADOPTED 是**入库**：三个物种各 10 个槽位，整具换成真实网格，产物进
// `assets/parts/`。分界线是 docs/26 §H 那一句：**真实存在的机器用真实网格，
// 不存在的东西用生成件。** 混搭打的不是「真实 vs 生成」，是「硬表面 vs 软表面」——
// 所以不按槽位穿插，按物种整体换。
//
// 进了版本库就构成**再分发**，所以 docs/33 §4 那三项义务从这一刻起是真的：
// 原始 LICENSE 随件入库（`assets/parts/licenses/`）、逐件写清改了什么
// （`assets/parts/ATTRIBUTION.md`，本脚本生成）、BY-SA 的件一件都不要
// （BodyParts3D 那两件**故意**留在探路池里不入库 —— 它的传染性和 MIT 的代码熔接不了）。

/**
 * 上游来源。一个物种一条，授权判定跟着仓库目录走而不是跟着物种走 ——
 * Menagerie 的关键事实是**每个机器人子目录带自己的 LICENSE**（docs/33 §2 A）。
 */
const ORIGINS = {
  'unitree_g1': {
    dir: 'unitree_g1',
    robot: 'Unitree G1',
    holder: 'HangZhou YuShu TECHNOLOGY CO.,LTD. ("Unitree Robotics")',
    license: 'BSD-3-Clause（Unitree 变体）',
    // BSD-3 第 3 条是**非背书条款**：描述性地说「这是 G1 的躯干几何」可以，
    // 暗示 Unitree 合作或赞助不行。/about 的署名段和这份注释是同一句话的两处落点。
    caveat: '非背书：不得以 Unitree 的名义为本作品背书',
  },
  'anymal_c': {
    dir: 'anybotics_anymal_c',
    robot: 'ANYbotics ANYmal C',
    holder: 'ANYbotics AG',
    license: 'BSD-3-Clause',
    caveat: '非背书：不得以 ANYbotics 的名义为本作品背书',
  },
  'cassie': {
    dir: 'agility_cassie',
    robot: 'Agility Robotics Cassie',
    holder: 'Agility Robotics',
    license: 'MIT',
    caveat: '—',
  },
};

/**
 * 槽位的对称性。和 `recipes/catalog.ts` 的 SLOTS 表逐字一致 ——
 * 成对槽位用 X 镜像复用右件，中轴件不镜像。抄在这里是因为取件走的是
 * `normalizeOne` 的覆盖项而不是 recipe（这些件没有配方，也不该有）。
 */
const SYM = {
  head: 'none', spine: 'none', joint: 'none',
  clavicle: 'mirror', upperArm: 'mirror', foreArm: 'mirror',
  hand: 'mirror', thigh: 'mirror', shin: 'mirror', foot: 'mirror',
};

/**
 * 挑件的原则是**剪影**（docs/18：辨识度住在整体剪影里），不是"把 link 搬全"。
 * G1 在 Menagerie 里有 51 个 link，我们只有 10 个槽位 —— 挑的是那些让人
 * 一眼认出"这是 G1"的件，不是那些解剖学上最对得上的件。
 *
 * **挑之前必须量 girth。** `head` / `spine` / `hand` / `foot` / `joint` 这五个槽位在运行时是
 * **uniform 缩放**（`core/attach.ts`：三轴同比例 = `SLOT_WIDTH/localGirth`，完全忽略骨长）。
 * 所以一件归一化后 girth = 0.167 的细长件放进 `foot`，会被整件放大 3.2 倍 ——
 * 得到的不是一只脚，是一根一米长的杆子（实测：ANYmal 的 `foot.obj` 就是这样，
 * 它把足和一段护套捆在一个文件里，长宽比 6:1）。这条和 `curation.json` 里
 * 「girth 0.43 = 槽位中位数的 0.43×」那几条剔件理由是同一件事，只是这次发生在真实件上。
 * 规矩：**uniform 的五个槽位，girth 必须落在槽位中位数的 0.7×–1.3× 之间**；
 * 四肢（stretch）只用 girth 定粗细，偏一点只是胖瘦，不会炸。
 *
 * `tier: 1` 而不是 docs/33 建议的 2：tier 是**最低出现阶段**（docs/03 §3.2）。
 * 这三个物种的 Rodin 件全部退役之后，真实件是它们**仅有的**件 ——
 * 给 tier 2 等于让这三个物种在 tier 1 整个消失（`themeIsUsable` 返回 false），
 * 或者沿 base 链退回 porcelain，那正是本次要消灭的「按槽位穿插」。
 * 真实件不是细节升级，它就是这个物种本身。
 */
const ADOPTED = [
  // ── compact = Unitree G1 ──────────────────────────────────────────────────
  // docs/33 §8 第 2 问点名它：参考图一直没找到（docs/31 标 ❌），真 CAD 直接绕过
  // 整个参考图问题；人形拓扑与槽位 1:1；`bodyPlan` 还是 'stub'，沉没成本接近零。
  { id: 'spine.compact.real',    slot: 'spine',    family: 'compact', origin: 'unitree_g1', asset: 'torso_link_rev_1_0.STL',  why: '躯干。剪影里最先被认出来的一块；也是生成件最容易编错比例的一块' },
  { id: 'head.compact.real',     slot: 'head',     family: 'compact', origin: 'unitree_g1', asset: 'head_link.STL',           why: '头。roster 说 compact 的"头不是脸，是一个黑色 sensor pod" —— G1 的头正是那个 pod' },
  { id: 'clavicle.compact.real', slot: 'clavicle', family: 'compact', origin: 'unitree_g1', asset: 'left_shoulder_pitch_link.STL', why: '肩座。四肢从躯干伸出去的那一节' },
  { id: 'upperArm.compact.real', slot: 'upperArm', family: 'compact', origin: 'unitree_g1', asset: 'left_shoulder_yaw_link.STL',   why: '上臂。G1 的上臂就是 shoulder_yaw 这一节连杆' },
  { id: 'foreArm.compact.real',  slot: 'foreArm',  family: 'compact', origin: 'unitree_g1', asset: 'left_elbow_link.STL',     why: '前臂' },
  { id: 'hand.compact.real',     slot: 'hand',     family: 'compact', origin: 'unitree_g1', asset: 'left_rubber_hand.STL',    why: '手。标配的三指橡胶手 —— 连指手套一样的剪影，比灵巧手更"是 G1"' },
  { id: 'thigh.compact.real',    slot: 'thigh',    family: 'compact', origin: 'unitree_g1', asset: 'left_hip_yaw_link.STL',   why: '大腿。髋 yaw 到膝之间那一节' },
  { id: 'shin.compact.real',     slot: 'shin',     family: 'compact', origin: 'unitree_g1', asset: 'left_knee_link.STL',      why: '小腿。探路池验过的那一件' },
  { id: 'foot.compact.real',     slot: 'foot',     family: 'compact', origin: 'unitree_g1', asset: 'left_ankle_roll_link.STL', why: '脚掌' },
  // joint 是 uniform 槽位，中位数 0.993。shoulder_roll 的鼓（0.594）虽然更"像关节"，
  // 放进去会被放大 1.7 倍，18 个关节全变成大鼓，整具身体被关节吃掉。ankle_pitch 的叉形
  // 关节块 girth 0.961，几乎正好 —— 而且它本来就是一个关节。
  { id: 'joint.compact.real',    slot: 'joint',    family: 'compact', origin: 'unitree_g1', asset: 'left_ankle_pitch_link.STL', why: '关节。踝 pitch 的叉形关节块，girth 0.961 ≈ 槽位中位数 0.993' },

  // ── patrol = ANYmal C ────────────────────────────────────────────────────
  // 上一条线实测：real.anymal 的小腿配 patrol **基本不打架**，而且修正了比例
  // （Rodin 编的机器狗腿一直偏粗）。选 ANYmal 而不是 Spot，是因为 ANYmal 在
  // Menagerie 里给了整机每一块（含 base/face/drive），Spot 只给了腿。
  { id: 'spine.patrol.real',    slot: 'spine',    family: 'patrol', origin: 'anymal_c', asset: 'top_shell.obj', why: '机身上壳。四足机的躯干是一个水平的箱子，不是胸廓' },
  { id: 'head.patrol.real',     slot: 'head',     family: 'patrol', origin: 'anymal_c', asset: 'face.obj',      why: '前脸。传感器面板 —— 这台机器唯一能被叫做"脸"的部分' },
  { id: 'clavicle.patrol.real', slot: 'clavicle', family: 'patrol', origin: 'anymal_c', asset: 'hip_l.obj',     why: '髋座。四条腿从机身伸出去的那一节，四条一模一样' },
  { id: 'upperArm.patrol.real', slot: 'upperArm', family: 'patrol', origin: 'anymal_c', asset: 'thigh.obj',     why: '前腿上节。**和 thigh 是同一个文件**，因为真机的四条腿就是同一条腿' },
  { id: 'foreArm.patrol.real',  slot: 'foreArm',  family: 'patrol', origin: 'anymal_c', asset: 'shank_r.obj',   why: '前腿下节。右小腿' },
  // 这台机器的 `foot.obj` 把足和护套捆在一个文件里，归一化后 6:1（girth 0.167）——
  // 放进 uniform 的 hand/foot 会被放大 3 倍变成杆子（见 ADOPTED 上方那条规矩，有截图为证）。
  // 所以这两个槽位取同机上尺度对得上的件，并在这里说明白：这是挑，不是将就，也不是它真的没有脚。
  { id: 'hand.patrol.real',     slot: 'hand',     family: 'patrol', origin: 'anymal_c', asset: 'drive.obj',     why: '前肢末端。四足机没有手；ANYdrive 执行器 girth 0.681 ≈ hand 中位数 0.624' },
  { id: 'thigh.patrol.real',    slot: 'thigh',    family: 'patrol', origin: 'anymal_c', asset: 'thigh.obj',     why: '后腿上节' },
  { id: 'shin.patrol.real',     slot: 'shin',     family: 'patrol', origin: 'anymal_c', asset: 'shank_l.obj',   why: '后腿下节。碳纤维管 + 端头，比生成件瘦得多' },
  { id: 'foot.patrol.real',     slot: 'foot',     family: 'patrol', origin: 'anymal_c', asset: 'hatch.obj',     why: '足垫。机腹检修盖板，扁平 —— 平底的脚；girth 0.706 ≈ foot 中位数 0.534 的 1.3×' },
  { id: 'joint.patrol.real',    slot: 'joint',    family: 'patrol', origin: 'anymal_c', asset: 'lidar.obj',     why: '关节。顶上那颗旋转激光雷达，girth 0.999 ≈ joint 中位数 0.993 —— 圆柱形，正好当关节领环' },

  // ── digitigrade = Cassie ─────────────────────────────────────────────────
  // docs/33 §6：Digit 本身没有可用授权，Cassie 是同厂同拓扑的鸟腿且是 MIT。
  // 用 Cassie 代 Digit 不是退而求其次 —— 反关节鸟腿这个主张，Cassie 表达得更纯粹
  // （它连躯干和手臂都没有，只剩那对腿）。
  { id: 'spine.digitigrade.real',    slot: 'spine',    family: 'digitigrade', origin: 'cassie', asset: 'pelvis.obj',     why: '骨盆。Cassie 的"躯干"就是这一块，两条腿直接挂上去' },
  // Cassie 真的没有头。不拿别的机器人的头来凑（那就是穿插），而是用髋 yaw 的执行器罩
  // 当 sensor pod —— 同一台机器上的几何，同一种加工语言。这是挑，不是编。
  { id: 'head.digitigrade.real',     slot: 'head',     family: 'digitigrade', origin: 'cassie', asset: 'hip-yaw.obj',    why: '头（代）。Cassie 无头，用同机的髋 yaw 执行器罩当 sensor pod' },
  { id: 'clavicle.digitigrade.real', slot: 'clavicle', family: 'digitigrade', origin: 'cassie', asset: 'knee-spring.obj', why: '肩座（代膝弹簧板）。girth 0.542 ≈ clavicle 中位数 0.548' },
  { id: 'upperArm.digitigrade.real', slot: 'upperArm', family: 'digitigrade', origin: 'cassie', asset: 'hip-pitch.obj',  why: '上臂（代髋 pitch 壳）' },
  { id: 'foreArm.digitigrade.real',  slot: 'foreArm',  family: 'digitigrade', origin: 'cassie', asset: 'tarsus.obj',     why: '前臂。跗骨连杆，细长、两端轴承座 —— 探路池验过它当前臂比当小腿更像' },
  { id: 'hand.digitigrade.real',     slot: 'hand',     family: 'digitigrade', origin: 'cassie', asset: 'foot-crank.obj', why: '手（代足曲柄）。girth 0.530 ≈ hand 中位数 0.624' },
  { id: 'thigh.digitigrade.real',    slot: 'thigh',    family: 'digitigrade', origin: 'cassie', asset: 'knee.obj',       why: '大腿。膝壳连着大腿，反关节的那个折点就在这里' },
  { id: 'shin.digitigrade.real',     slot: 'shin',     family: 'digitigrade', origin: 'cassie', asset: 'shin.obj',       why: '小腿。真机就叫 shin；girth 0.208 —— 鸟腿的细全在这一件上' },
  { id: 'foot.digitigrade.real',     slot: 'foot',     family: 'digitigrade', origin: 'cassie', asset: 'foot.obj',       why: '脚。一片着地的刀，没有脚掌 —— 鸟腿的读法全在这里' },
  // heel-spring（girth 0.401）当关节会被放大 2.5 倍，18 个关节全变成大平板（截过图）。
  // hip-roll 的壳 0.929 ≈ 槽位中位数 0.993，是这台机器上唯一接近各向同性的件。
  { id: 'joint.digitigrade.real',    slot: 'joint',    family: 'digitigrade', origin: 'cassie', asset: 'hip-roll.obj',   why: '关节。髋 roll 壳，girth 0.929 ≈ joint 中位数 0.993' },
];

const adoptedUrl = (a) => `${MENAGERIE}/${ORIGINS[a.origin].dir}/assets/${a.asset}`;

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const only = args.find((a) => a.startsWith('--only='))?.slice(7);
const picked = SOURCES.filter((s) => !only || s.id === only);

if (has('--list')) {
  for (const s of SOURCES) console.log(`${s.id.padEnd(24)} ${s.license}\n${' '.repeat(25)}${s.url}\n${' '.repeat(25)}${s.note}\n`);
  console.log('── 入库件（--adopt）─────────────────────────────');
  for (const a of ADOPTED) console.log(`${a.id.padEnd(28)} ${ORIGINS[a.origin].license.padEnd(24)} ${a.asset}`);
  process.exit(0);
}

if (has('--adopt')) process.exit(await adopt());

async function download(src) {
  // NIH 3D 的下载地址没有扩展名（/output-files/1333），所以来源可以显式声明 `ext`。
  const ext = src.ext ?? src.url.slice(src.url.lastIndexOf('.')).toLowerCase();
  const path = resolve(HARVEST, src.id + ext);
  if (existsSync(path)) return path;                     // 幂等：取过就不再取，别白占别人带宽
  const r = await fetch(src.url);
  if (!r.ok) throw new Error(`${r.status} ${src.url}`);
  mkdirSync(HARVEST, { recursive: true });
  writeFileSync(path, Buffer.from(await r.arrayBuffer()));
  return path;
}

/** 验收：用和 check:parts 同一套数字，对取件池独立跑一遍。 */
async function verify() {
  const { glbStats } = await import(resolve(ROOT, 'packages/factory/src/glb-stats.ts'));
  const idxPath = resolve(OUT, '_harvest.json');
  if (!existsSync(idxPath)) { console.log('还没有产物，先跑一次不带 --verify 的取件'); return 1; }
  const metas = JSON.parse(readFileSync(idxPath, 'utf8'));
  const errs = [], warns = [];
  for (const m of metas) {
    const f = resolve(OUT, `${m.id}.glb`);
    if (!existsSync(f)) { errs.push(`${m.id}: 文件缺失`); continue; }
    const s = glbStats(f);
    if (Math.abs(s.size[1] - 1) > EPS) errs.push(`${m.id}: 长度 ${s.size[1].toFixed(4)} ≠ 1.0`);
    if (Math.abs(s.min[1]) > EPS) errs.push(`${m.id}: socketA 不在原点 y=${s.min[1].toFixed(4)}`);
    if (s.triangles > MAX_TRIS) errs.push(`${m.id}: ${s.triangles} tris > ${MAX_TRIS}`);
    if (s.bytes > MAX_BYTES) errs.push(`${m.id}: ${(s.bytes / 1e6).toFixed(1)} MB 超预算`);
    if (s.hasAnimation || s.hasSkin) errs.push(`${m.id}: 含动画/骨骼`);
    if (s.meshes !== 1) warns.push(`${m.id}: ${s.meshes} 个 mesh`);
    if (s.images > 0) warns.push(`${m.id}: 仍带 ${s.images} 张贴图`);
    if (Math.abs((s.min[0] + s.max[0]) / 2) > EPS * 5) warns.push(`${m.id}: X 未居中`);
    console.log(`  ${errs.length ? ' ' : '✓'} ${m.id.padEnd(24)} ${String(s.triangles).padStart(5)} tris  ` +
      `girth=${m.localGirth.toFixed(3)}  len=${s.size[1].toFixed(5)}  y0=${s.min[1].toFixed(5)}  ${(s.bytes / 1024).toFixed(0)}KB`);
  }
  for (const w of warns) console.warn('  ⚠ ' + w);
  for (const e of errs) console.error('  ✗ ' + e);
  console.log(`\n取件池契约检查 — ${metas.length} 件, ${errs.length} 错, ${warns.length} 警告`);
  return errs.length ? 1 : 0;
}

if (has('--verify')) process.exit(await verify());

const { normalizeOne } = await import(resolve(ROOT, 'packages/factory/src/normalize.ts'));
const metas = [];
for (const src of picked) {
  try {
    const raw = await download(src);
    const { meta, warnings, orient } = await normalizeOne(src.id, raw, {
      outDir: OUT,
      file: `harvest/${src.id}.glb`,      // 运行时按 `/parts/` + file 取件
      slot: src.slot,
      tier: 2,                            // 真机几何是机械化/关节化的，按 docs/03 §3.2 归 tier 2
      family: src.family,
      symmetry: 'mirror',
      source: { provider: 'harvest', model: src.url, recipeId: src.id },
    });
    metas.push(meta);
    console.log(`  ✓ ${src.id.padEnd(24)} ${String(meta.triCount).padStart(5)} tris  girth=${meta.localGirth.toFixed(3)}  ${orient}` +
      (warnings.length ? `\n      ⚠ ${warnings.join('; ')}` : ''));
  } catch (e) {
    console.error(`  ✗ ${src.id}: ${e.message}`);
  }
}

// 和 normalizeAll 一样：定向取件（--only）必须合并进已有索引，不能整个重写。
const idxPath = resolve(OUT, '_harvest.json');
let merged = metas;
if (only && existsSync(idxPath)) {
  const byId = new Map(JSON.parse(readFileSync(idxPath, 'utf8')).map((m) => [m.id, m]));
  for (const m of metas) byId.set(m.id, m);
  merged = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}
mkdirSync(OUT, { recursive: true });
writeFileSync(idxPath, JSON.stringify(merged, null, 2));
console.log(`\n取件 ${metas.length} 件；索引共 ${merged.length} 件 → assets/parts/harvest/`);

writeMixedIndex(merged);
console.log(`混合索引 → /dev/figure.html?parts=/parts/harvest/&theme=real.g1\n`);
process.exit(await verify());

/**
 * 写一份**混合索引**：192 件 Rodin 生成件 + 取件池，放进同一个 PartLibrary。
 *
 * 为什么要这个：验收问的是「真实网格和生成件放在同一具身体上会不会打架」。
 * 这个问题只能看出来，不能想出来 —— 所以必须真的拼一具。
 *
 * 为什么不直接改 `assets/parts/parts.json`：那个文件由别的线在动（AGENTS.md：不碰）。
 * 这里另写一份，`file` 指回 `../`，同一批 glb 不复制第二遍。
 *
 * 混合是靠 genome 的 `base` 回退链实现的（core/genome.ts 的 baseChain）：
 * `real.g1` 这个 theme 只有 shin 和 spine 两个槽位有件，其余槽位自动回退到
 * `base: 'compact'` 的 Rodin 件。于是一具身体里两种来源**天然**并存。
 */
function writeMixedIndex(harvestMetas) {
  const basePath = resolve(ROOT, 'assets/parts/parts.json');
  if (!existsSync(basePath)) { console.warn('没有 assets/parts/parts.json，跳过混合索引'); return; }
  const base = JSON.parse(readFileSync(basePath, 'utf8'));

  // 每个真实来源挂到 docs/31 对表里那个对应的 archetype 上。
  // 挂错了这具身体就没有意义：Cassie 的腿必须落在鸟腿人身上，不是落在瓷上。
  // 解剖骨骼挂到 xeno 上：那是 roster 里唯一一条生物机械的线（docs/31 §3）。
  const BASE_OF = { 'real.g1': 'compact', 'real.spot': 'patrol', 'real.anymal': 'patrol',
                    'real.cassie': 'digitigrade', 'real.bone': 'xeno', 'real.nih': 'xeno' };
  const themes = [...base.themes];
  for (const [fam, baseId] of Object.entries(BASE_OF)) {
    if (!harvestMetas.some((m) => m.family === fam)) continue;
    const b = base.themes.find((t) => t.id === baseId);
    themes.push({
      ...(b ?? {}), id: fam, base: baseId, kind: 'archetype', source: 'harvest',
      name: `真实·${fam.split('.')[1]}`, nameEn: `Real ${fam.split('.')[1]}`,
      tagline: '这是那台机器真正的几何', taglineEn: 'The actual geometry of the actual machine',
    });
  }

  writeFileSync(resolve(OUT, 'parts.json'), JSON.stringify({
    ...base,
    generatedAt: new Date().toISOString(),
    themes,
    parts: [
      ...base.parts.map((p) => ({ ...p, file: `../${p.file}` })),   // 同一批 glb，不复制第二份
      ...harvestMetas.map((m) => ({ ...m, file: `${m.id}.glb` })),
    ],
  }, null, 2));
}

// ══ 入库流程（--adopt）═════════════════════════════════════════════════════
/**
 * 和上面那条探路流程的差别只有一个：**产物落到 `assets/parts/`，进版本库。**
 * 这一步就是再分发，所以它同时负责把 docs/33 §4 的三项义务做掉：
 * 原始 LICENSE 随件入库、`ATTRIBUTION.md` 逐件可追溯、BY-SA 的件一件不取。
 *
 * 幂等：重跑一次结果一样（下载有缓存，规范化是纯函数，索引按 id 合并）。
 */
async function adopt() {
  const { normalizeOne } = await import(resolve(ROOT, 'packages/factory/src/normalize.ts'));
  const { buildIndex } = await import(resolve(ROOT, 'packages/factory/src/index-parts.ts'));
  const PARTS = resolve(ROOT, 'assets/parts');
  const LICENSES = resolve(PARTS, 'licenses');

  // 1) 原始 LICENSE 原文随件入库（docs/33 §4 第 1 条）。
  //    BSD-3 的第 1/2 条要求再分发时保留版权声明与免责声明 —— 保留的方式就是把原文放在这里。
  mkdirSync(LICENSES, { recursive: true });
  for (const [key, o] of Object.entries(ORIGINS)) {
    const path = resolve(LICENSES, `${key}.LICENSE.txt`);
    if (existsSync(path)) continue;
    const url = `${MENAGERIE}/${o.dir}/LICENSE`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`取不到 ${o.robot} 的 LICENSE：${r.status} ${url}`);
    writeFileSync(path, `# ${o.robot} · ${o.license}\n# 原文取自 ${url}\n\n${await r.text()}`);
    console.log(`  ✓ LICENSE  ${key}`);
  }

  // 2) 逐件取 + 规范化，直接写进 assets/parts/
  const metas = [];
  for (const a of ADOPTED) {
    try {
      const raw = await download({ id: a.id, url: adoptedUrl(a) });
      const { meta, warnings } = await normalizeOne(a.id, raw, {
        outDir: PARTS,
        file: `${a.id}.glb`,
        slot: a.slot,
        tier: 1,                       // 见 ADOPTED 上方注释：真实件不是细节升级，它就是这个物种
        family: a.family,
        symmetry: SYM[a.slot],
        source: { provider: 'harvest', model: adoptedUrl(a), recipeId: a.id },
      });
      metas.push(meta);
      console.log(`  ✓ ${a.id.padEnd(28)} ${String(meta.triCount).padStart(5)} tris  girth=${meta.localGirth.toFixed(3)}`
        + (warnings.length ? `\n      ⚠ ${warnings.join('; ')}` : ''));
    } catch (e) {
      console.error(`  ✗ ${a.id}: ${e.message}`);
      return 1;                        // 缺件比错件更难查：宁可整批失败，也不要半具身体悄悄入库
    }
  }

  // 3) 并进 _metas.json（parts.json 由 buildIndex 从它生成，那里执行"整具换"的规则）
  const metaPath = resolve(PARTS, '_metas.json');
  const byId = new Map(JSON.parse(readFileSync(metaPath, 'utf8')).map((m) => [m.id, m]));
  for (const m of metas) byId.set(m.id, m);
  writeFileSync(metaPath, JSON.stringify([...byId.values()].sort((a, b) => a.id.localeCompare(b.id)), null, 2));

  // 4) 重出 parts.json
  await buildIndex();

  // 5) 署名（docs/33 §4 第 2 条）
  writeFileSync(resolve(PARTS, 'ATTRIBUTION.md'), attribution([...byId.values()]));
  console.log(`\n入库 ${metas.length} 件 → assets/parts/；署名 → assets/parts/ATTRIBUTION.md`);
  return 0;
}

/**
 * 逐件署名表。**生成的，不是手写的** —— 手写的署名会和 ADOPTED 分叉，
 * 而分叉的署名等于没有署名（和海报数字漂掉是同一类错）。
 */
function attribution(allMetas) {
  const retired = allMetas
    .filter((m) => ADOPTED.some((a) => a.family === m.family) && m.source?.provider !== 'harvest')
    .map((m) => m.id).sort();

  const rows = ADOPTED.map((a) => {
    const o = ORIGINS[a.origin];
    return `| \`${a.id}\` | ${o.robot} | \`${o.dir}/assets/${a.asset}\` | ${o.license} | ${a.why} |`;
  }).join('\n');

  return `# 署名与许可 —— \`assets/parts/\` 里的真实网格

<!-- 由 \`node scripts/harvest.mjs --adopt\` 生成，不要手改。 -->

这些件不是生成的，是**真实存在的机器的原厂几何**。它们进了版本库，
所以这构成**再分发**，下面三件事必须同时成立（docs/33 §4）：

1. 每个来源的 LICENSE 原文在 [\`licenses/\`](./licenses/)，随件入库。
2. 下表逐件写清来源与改动。
3. CC-BY-SA 的源**一件都没有取**。BodyParts3D 的人体骨骼留在探路池里
   （\`assets/parts/harvest/\`，.gitignore），因为 BY-SA 的传染要求衍生件同样 BY-SA，
   和这个仓库 MIT 的代码熔接不了。处理不了就不用 —— 这是 docs/33 §4 第 3 条的落点。

## 来源钉死在 commit SHA

全部取自 MuJoCo Menagerie，**\`${MENAGERIE_SHA}\`**。
指向分支的后果不是报错，是来源在脚下变，而 \`check:parts\` 照样 0 错。
重新取一遍：\`node scripts/harvest.mjs --adopt\`。

| 来源 | 版权 | 授权 | 附加条件 |
|---|---|---|---|
${Object.values(ORIGINS).map((o) => `| ${o.robot} | ${o.holder} | ${o.license} | ${o.caveat} |`).join('\n')}

**非背书条款是真的。** 说「这是 G1 的躯干几何」是描述，可以；
暗示 Unitree / ANYbotics 与本作品有合作或赞助关系，不行。本作品与上述任何公司无关。

## 我们做了什么改动

**每一件都改过**，改动对所有件是同一套（\`packages/factory/src/normalize.ts\`）：

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
${rows}

## 被换下来的生成件（${retired.length} 件）

这三个物种原来的 Rodin 生成件**文件一件都没删**，还在 \`assets/parts/\` 里，
只是不再进 \`parts.json\`（规则在 \`packages/factory/src/index-parts.ts\`：
一个物种只要有一件真实网格，它的生成件就整批不进索引）。

它们不是坏件 —— 坏件在 \`curation.json\` 里，那是另一回事。
它们是被一个策展决定换下来的（docs/26 §H），而那个决定可能会变。

${retired.map((id) => `- \`${id}\``).join('\n')}

## 顺手引用

Menagerie 请求（非强制）引用：

\`\`\`bibtex
@software{menagerie2022github,
  author = {Zakka, Kevin and Tassa, Yuval and {MuJoCo Menagerie Contributors}},
  title = {{MuJoCo Menagerie: A collection of high-quality simulation models for MuJoCo}},
  url = {https://github.com/google-deepmind/mujoco_menagerie},
  year = {2022},
}
\`\`\`
`;
}
