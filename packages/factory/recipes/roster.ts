/**
 * ROSTER —— 观众可以变成的那些"身体"。
 *
 * 三种 kind，共用同一套槽位/挂载/演化机制，区别只在造型语言与版权状态：
 *
 *   archetype  机器人物种。过去二十年真正形成了视觉 archetype 的那些形态。
 *   guest      嘉宾：现实世界可辨认的人物客串。
 *   character  角色：虚构形象。
 *
 * ── 为什么要分 kind ──
 * 不是为了分类学好看。archetype 是设计语言取材（合法且正当，就像所有工业设计都互相取材）；
 * guest / character 涉及**他人的肖像与著作权**，这是完全不同性质的东西。
 * 混在一个数组里而不加区分，就会在某个深夜被不小心部署出去。
 *
 * ── clearance 门 ──
 *   own             我们自己的造型，公开构建默认包含
 *   public-figure   真实在世人物的可辨认形象 —— 默认 **不** 进公开构建
 *   third-party-ip  他人角色 IP        —— 默认 **不** 进公开构建
 *   licensed        已取得授权，附 note 说明来源
 * 公开构建只打包 `own` 与 `licensed`，见 docs/14-SPEC-roster.md §4。
 *
 * ── 形态空间 ──
 * 每个条目有两个 0..1 坐标，开场轮播据此排布，也是我们自己的地图：
 *   humanLike  0 = 完全不像人        1 = 人形
 *   lifeLike   0 = 像工具/家具       1 = 像活的
 */
import type { ThemeDef, Tier } from '../../core/src/types.ts';
import type { BodyPlanId, BodyPlanSpec } from '../../core/src/bodyplan.ts';

export type RosterKind = 'archetype' | 'guest' | 'character';
export type Clearance = 'own' | 'public-figure' | 'third-party-ip' | 'licensed';

import { INVITED } from './invited.ts';

export interface RosterEntry {
  id: string;
  kind: RosterKind;
  name: string;
  nameEn: string;
  tagline: string;      // 中文是原文
  taglineEn: string;    // 对照
  tension: string;
  /** 喂给生成模型的造型语言段 */
  look: string;
  palette: string[];
  source: 'rodin' | 'procedural';
  clearance: Clearance;
  /** 形态空间坐标 */
  axes: { humanLike: number; lifeLike: number };
  /**
   * full  = 10 个槽位都自己生成（20 件）
   * light = 只生成 6 个标志性槽位，其余继承 base（6 件）
   * 这条让"再加一个物种"的成本从 10 credits 降到 3 —— 物种数量本身就是这件作品的内容。
   */
  coverage: 'full' | 'light';
  /** light 条目缺件时从哪个条目借 */
  base?: string;
  /**
   * 身体方案，见 docs/18。字符串 = 拓扑预设；对象 = 拓扑 + 比例。
   *
   * **这里原来是 `string`**，于是下面那张 `BODY_PLAN` 表里一个拼错的方案名
   * （或者一个被改过名的方案）完全合法：类型过、测试绿、`check:parts` 不响，
   * 而运行时 `remapSkeleton` 走 default，这个物种**静默地按人形出场**。
   * 谱系表是这件事的源头数据，所以门必须开在这里 —— `ThemeDef.bodyPlan`
   * 是同一个类型，`index-parts.ts` 把这里的值原样写进 parts.json。
   */
  bodyPlan?: BodyPlanId | BodyPlanSpec;
  tierOfVariant: Record<string, Tier>;
  /** 取材说明。取材 ≠ 复制，写清楚出处是为了让自己保持诚实 */
  reference?: string;
  /**
   * 取材自哪台真实存在的机器。表在下面（`MACHINE`），字段定义在
   * `ThemeDef.machine`（冻结契约），裁定在 docs/42 §7 第 3 条。
   * `reference` 是**写给人看的一句话**，这个字段是**给机器查的几条事实** ——
   * 两者不重复：一句话查不了，几条事实读不动。
   */
  machine?: ThemeDef['machine'];
  /**
   * 换一批随机。seed 由 id 决定，原样重跑必然复现同一个坏结果；
   * 加 salt 是"我看过了，这个不行，换一个"的显式记录，比偷偷改 id 好。
   */
  seedSalt?: number;
  note?: string;
}

/** light 条目只生成这 6 个槽位 —— 决定剪影的那几件 */
export const SIGNATURE_SLOTS = ['spine', 'head', 'upperArm', 'shin', 'foot', 'joint'];

/**
 * 英文对照。中文是原文 —— 这件作品的思考是用中文进行的，英文是对照不是源。
 * 所以这里允许换说法：`furball` 的中文是"它放弃了腿、手和任务"，
 * 英文写成 "gave up limbs, hands, and usefulness" —— usefulness 比 tasks 准。
 */
const TAGLINE_EN: Record<string, string> = {
  "porcelain": "An idealised version of you",
  "industrial": "It came to work, not to keep you company",
  "patrol": "Something that should not stand, standing",
  "xeno": "It is imitating you, and getting it wrong",
  "coral": "Neither human nor machine",
  "athlete": "The body is human. The motion is not.",
  "softwear": "A stranger who lives in your house",
  "compact": "Human-shaped, but only 130 cm",
  "digitigrade": "Human hands on animal legs",
  "wheelleg": "It walks and it rolls",
  "droid": "It does not perform tasks. It has a character.",
  "petbot": "Not like a dog — but you will think it is alive",
  "furball": "It gave up limbs, hands, and usefulness",
  "screenface": "A few degrees of freedom are enough for a personality",
  "orb": "Why would a robot need legs",
  "manipulator": "The species the humanoid hype buried",
  "autonomous": "Also a robot. Just much larger.",
  "field": "The body disappears. Only motion remains.",
  "guest.founder": "(vacant) Wear a real person",
  "char.dumpling": "Something soft, round, and breathing",
  "char.ghost": "Translucent, unsure whether it is here",
  "char.paper": "A body that was folded",
  "char.idol": "You, made into merchandise"
};

export const STYLE_BASE =
  'isolated single object on a plain background, one continuous solid part, ' +
  'symmetrical along its long axis, studio product render, neutral lighting, ' +
  'no text, no logo, no base, no stand, no character, no full body';

const A = (
  id: string, name: string, nameEn: string, tagline: string, tension: string,
  look: string, palette: string[], humanLike: number, lifeLike: number,
  reference: string, coverage: 'full' | 'light' = 'light', base = 'porcelain',
): RosterEntry => ({
  id, kind: 'archetype', name, nameEn, tagline, taglineEn: TAGLINE_EN[id] ?? nameEn, tension, look, palette,
  source: 'rodin', clearance: 'own', axes: { humanLike, lifeLike },
  coverage, base: coverage === 'light' ? base : undefined,
  tierOfVariant: coverage === 'full' ? { a: 1, b: 2 } : { a: 1 },
  reference,
});

// ── 机器人物种谱系 ──────────────────────────────────────────────────────────
/**
 * 第一遍 anchor 就是坏的（多物体 / 碎片 / 薄壳），换一批随机重来。
 * 记在这里而不是偷偷改 id：下一个人要知道"这个条目试过一次，不行"。
 */
const RE_ANCHOR: Record<string, number> = { digitigrade: 1, wheelleg: 1, autonomous: 1 };

/** 取件来源一律钉 SHA，和 `scripts/harvest.mjs` 是同一个数（那里是权威，这里跟着它走）。 */
const MENAGERIE = 'https://raw.githubusercontent.com/google-deepmind/mujoco_menagerie/8161bba264d7fa7c99ca301e91e7fb44737676ad';

/**
 * 每个条目取材自哪台**真实存在的**机器（docs/42 §1 的对表，§7 第 3 条的裁定）。
 *
 * 三档，分界线是 docs/26 §H 加的那一档（docs/42 §0 第一条）：
 *
 *   实·有几何   `geometry: 'real'` —— 真机存在，索引里的件就是那台机器的原厂网格
 *   实·无几何   `geometry: 'generated'` —— 真机存在，但世界上没有一份可再分发的几何，
 *               所以 `source` / `license` 缺席，身上是生成件。**它仍然记着自己是谁**，
 *               而这正是它和「虚」的区别：第二档是一条**可以被推翻的记录**，
 *               哪天厂商放出描述文件，这一行就升到第一档；写成「想象」它就永远不会被重查。
 *   虚          **没有这个字段**：`porcelain` / `xeno` / `coral` / `field`。
 *               `porcelain` 在这一档是 docs/42 §7 第 1 条的裁定 —— 它是形态空间的原点，
 *               原点不该同时是一件产品。
 *
 * `geometry: 'generated'` 而 `source` 在的那几条（athlete / wheelleg / manipulator）说的是
 * 第三件事：**路已经探到，件还没取。** 取了就把这一格改成 'real'，`check:parts` 当场验。
 */
const MACHINE: Record<string, ThemeDef['machine']> = {
  compact: {
    name: 'G1', maker: 'Unitree Robotics', geometry: 'real',
    source: `${MENAGERIE}/unitree_g1/`,
    license: 'BSD-3-Clause（Unitree 变体）',
    note: '非背书条款：不得以 Unitree 的名义为本作品背书',
  },
  patrol: {
    name: 'Spot', maker: 'Boston Dynamics', geometry: 'real',
    source: `${MENAGERIE}/boston_dynamics_spot/`,
    license: 'BSD-3-Clause',
    // 2026-09-13 重取：这一格此前写着 Spot，身上穿的却是 ANYmal C，
    // 而换掉 Spot 的那句理由（「Spot 只给了腿」）在钉住的 SHA 上是假的（docs/42 §7 第 2 条）。
    note: '描述包由 Clearpath Robotics 发布；非背书条款同样适用',
  },
  digitigrade: {
    name: 'Digit', maker: 'Agility Robotics', geometry: 'real',
    source: `${MENAGERIE}/agility_cassie/`,
    license: 'MIT',
    // Digit 自己没有可用授权（docs/33 §2 A，docs/42 复核仍然成立）。
    note: '几何取自同厂同拓扑的 Cassie —— Digit 本身没有可再分发的描述文件',
  },
  // 下面三条 2026-09-14 取件，从 'generated' 升到 'real'。source 钉整串 SHA，和 harvest.mjs 同一个数。
  athlete: {
    name: 'Atlas', maker: 'Boston Dynamics', geometry: 'real',
    source: 'https://raw.githubusercontent.com/RobotLocomotion/models/3bd1111011ea8c9813a66bf5cc21f31067f2e1ef/atlas/meshes/',
    license: 'BSD-3-Clause',
    // 版权人是 MIT CSAIL 的 Robot Locomotion Group 而不是 Boston Dynamics；
    // 那是 DRC/v5 液压那一代，不是 tagline 唤起的 2025 电动版（docs/42 §3、§7 第 5 条）。
    note: '版权人是 MIT CSAIL Robot Locomotion Group，非 Boston Dynamics；DRC/v5 液压那一代，非 2025 电动版',
  },
  wheelleg: {
    name: 'W1', maker: 'LimX Dynamics', geometry: 'real',
    source: 'https://raw.githubusercontent.com/limxdynamics/tron1-robot-description/5b97add1f3b461c9ed26ff2ff2f5025cc6ee4316/wheellegged/WL_P311D/meshes/',
    license: 'Apache-2.0',
    // W1 本身没有描述文件（逐个仓库查过 45 个）。和 Cassie 代 Digit 同类（docs/42 §7 第 6 条）。
    note: '代用件：几何取自同厂轮足四足 WL_P311D，不是 W1',
  },
  manipulator: {
    name: 'Stretch 3', maker: 'Hello Robot', geometry: 'real',
    source: `${MENAGERIE}/hello_robot_stretch_3/`,
    license: 'Apache-2.0',
    note: 'Apache-2.0：再分发注明改动，见 assets/parts/ATTRIBUTION.md',
  },

  // ── 实·无几何：真机存在，没有任何一份授权干净的几何（docs/42 §3 逐个 URL 查过）──
  industrial: { name: 'Figure 03', maker: 'Figure', geometry: 'generated', note: '无公开描述文件' },
  softwear: {
    name: 'NEO', maker: '1X Technologies', geometry: 'generated',
    // 反向建议：即使哪天拿到 CAD 也不该换 —— 这条流水线第一件事就是丢掉贴图统一套材质，
    // 一件被剥掉表面的 NEO 只剩一具普通人形骨架（docs/42 §4 末）。
    note: '无公开描述文件；即使拿到也不该换 —— 它的意义在那件针织外套上',
  },
  droid: {
    name: 'BDX Droid', maker: 'Disney Research', geometry: 'generated',
    // 社区复刻（Open Duck Mini，Apache-2.0）授权干净、几何可用，但用它填这一格
    // 等于让「真实机器用真实网格」去接受一件模仿另一台机器的东西（docs/42 §7 第 7 条）。
    note: '只有社区复刻件 —— 复刻不是那台机器',
  },
  petbot: { name: 'aibo', maker: 'Sony', geometry: 'generated', note: '只有第三方商业素材，来源不可核' },
  furball: { name: 'Moflin', maker: 'Casio', geometry: 'generated', note: '无任何公开三维' },
  screenface: { name: 'Loona', maker: 'KEYi Tech', geometry: 'generated', note: '无任何公开三维' },
  orb: { name: 'Ballie', maker: 'Samsung', geometry: 'generated', note: '只有第三方商业素材，来源不可核' },
  autonomous: {
    name: 'Waymo Driver', maker: 'Waymo', geometry: 'generated',
    note: 'Open Dataset 是传感器数据不是网格，且另有条款',
  },
};

/**
 * 哪些条目不是人形（docs/18-BODY-PLANS.md）。
 * 这一张表是 PRD §3 第三条主张（物种真的不同）成立与否的分界线 ——
 * 没有它，patrol / orb / furball 就只是穿着相应涂装的人。
 */
const BODY_PLAN: Record<string, RosterEntry['bodyPlan']> = {
  // ── 换拓扑 ────────────────────────────────────────────────────────────
  patrol: 'quadruped',                                  // 四足机的语言长在人身上
  // 鸟腿：细长的反关节腿 + 人的上半身。
  // **它曾经是 `quadruped`，那是一个实质性错判**（docs/31 §4.1）：Digit 和
  // 同拓扑的 Cassie 都是**两足**。做成四足，`arm: 1.1` 这个参数就没有落点了
  // （四足没有手臂），而"人的手 / 鸟的腿"这句 tagline 也就没有对比了 ——
  // 四足本来就都是兽腿。改回两足（kind 缺省即 'rig'）只留比例：腿拉长、手臂略长。
  // 这一轮它整具换成了 Cassie 的真实几何，正好一起把拓扑改对。
  digitigrade: { leg: 1.28, arm: 1.1 },
  wheelleg: { kind: 'quadruped', limb: 0.85, torso: 1.1 },
  petbot: { kind: 'quadruped', limb: 0.7, torso: 1.12 },   // 机器宠物：小一号的四足
  compact: 'stub',                                      // "人形，但只有一米三"
  droid: { kind: 'stub', head: 1.5 },                   // 小怪物：大头短身

  // ── 换表达：团块（docs/18 B 档）。不实例化任何槽位件，只有一个连续的体 ────
  // 实测 res40：1.85ms / 2,484 三角 / 1 draw；同骨架刚体版 87,844 三角 / 17 draw。
  // 选这四个是因为它们的 tension 本来就不是"机器"：珊瑚不可归类、异形是生物机械、
  // 团子是软的、幽灵是半透明的 —— 手办式的刚体件恰恰是它们最不该有的读法。
  coral: { kind: 'mass', torso: 1.15, limb: 0.9 },
  'char.dumpling': { kind: 'mass', limb: 0.35, torso: 1.7, head: 0.8 },
  'char.ghost': { kind: 'mass', limb: 1.15, torso: 1.05 },
  // 充气 —— 2026-09-14 从刚体改到团块。
  //
  // **不是为了省钱，是因为它本来就该在这一档。** 这个条目的技术轴写着
  // 「封闭的软体积」，而它的原型是一具被气撑起来的乙烯基身体：
  // 团块就是封闭软体积，刚体件是"一节一节焊出来的气囊"——
  // 那是配方当时的一句自我说服，做出来六件里只成了一件，
  // 渲染出来是一具瓷身体顶着一个飘在空中的头（docs/39）。
  //
  // 那一件付过钱的 `spine` 就此作废。留着它不会让画面变好，
  // 只会让"这个物种有件"这句话在统计上成立而在画面上不成立。
  'char.inflate': { kind: 'mass', limb: 0.5, torso: 1.45, head: 0.95 },

  // ── 换拓扑：无躯干（docs/18 §2 A 档 radial）。部件绕核心成笼，没有脊柱也没有四肢链 ──
  // 这两个条目在物种谱系里的全部意义就是"一个球"。给它们比例（巨大躯干 + 退化四肢）
  // 只会得到一个胖人；给它们环绕拓扑，才第一次真的不是人。
  // 选 radial 而不是 mass，是因为 radial **仍然用它们自己的刚体部件** —— 换成 mass
  // 那 12 件已经花过 credits 的资产就永远用不上了，而球体并不需要"融成一团"的读法。
  orb: { kind: 'radial', limb: 1.15 },                  // 球：环张得开，核心小
  furball: { kind: 'radial', limb: 0.75, torso: 1.15 }, // 毛球：环盘得紧，核心大 —— 同一个拓扑，两种身材

  // ── 换拓扑：单柱（docs/18 §2 A 档 column）。腿骨串成一根桅杆，双臂是顶端的分支 ──
  // 这两个条目的共同点是"底盘 + 上面一套作业机构"，本来就不该有腿。
  manipulator: { kind: 'column', arm: 1.45, leg: 0.92 },  // 移动机械臂：高桅杆 + 长分支
  screenface: { kind: 'column', head: 1.9, arm: 0.6, leg: 0.5 }, // 桌宠：矮柱 + 一张大脸

  // ── 换拓扑：四足底盘 ────────────────────────────────────────────────────
  // 无人车不是"会走的车身"，是一个贴地的底盘 —— 四个短支撑比两条腿准得多。
  autonomous: { kind: 'quadruped', limb: 0.45, torso: 1.35 },

  // ── 换表达：点场（docs/18 B 档的 swarm）。一件槽位件都不实例化 ──────────
  // 「场」此前**没有** bodyPlan，于是走默认的刚体装配、沿 base 链向别的物种借满
  // 一整套四肢 —— 一个 tagline 写着「身体消失，只剩运动」的物种，在画面上是一具
  // 用别人零件拼出来的普通机器人。**它是全 roster 里唯一 `source:'procedural'` 的
  // 条目**，自己一件部件都没有，所以挂 swarm 不作废任何已花过 credits 的资产
  // （这是 docs/18 §8 第 3 条对 B 档的顾虑，这一条恰好不适用）。
  field: 'swarm',

  // ── 换拓扑：倒置 ────────────────────────────────────────────────────────
  // 异形的 tension 是"它在模仿你，但模仿错了"。把人体整个翻过来正是"模仿错了"，
  // 而且它 20 件全 coverage 的部件一件都不浪费。
  xeno: { kind: 'inverted', limb: 1.18, head: 1.15 },

  // ── 只换比例（零素材成本，但物种一眼不同） ──────────────────────────────
  athlete: { limb: 1.1, torso: 1.05, arm: 1.05 },       // 运动员：四肢有力
  softwear: { limb: 0.95, torso: 1.12, head: 1.05 },    // 穿衣的：柔软的体量
  industrial: { torso: 1.08, limb: 0.98 },              // 工业：宽一点的躯干
  'char.idol': { head: 1.35, limb: 0.9 },               // 偶像：手办比例
  'char.paper': 'towering',                             // 纸人：折出来的东西本来就该又高又薄
  // porcelain 保持标准比例 —— 需要有一个基准，否则"不同"就没有参照
};

export const ARCHETYPES: RosterEntry[] = [
  // 已生成的五个（full coverage，各 20 件）
  A('porcelain', '瓷', 'Porcelain', '一个被理想化过的你',
    '干净、无品牌、无磨损 —— 它的不安来自太完美。',
    'a smooth minimal exoskeleton shell, closed volume, very few seams, matte off-white pearl polymer panel with soft chamfered edges and a dark grey joint collar, calm minimal industrial design',
    ['matte.bone', 'matte.ash', 'ceramic.pearl'], 0.95, 0.35,
    '产品化人形的白色聚合物面板 + 黑关节罩语言', 'full'),
  A('industrial', '工业', 'Industrial', '它是来上班的，不是来陪你的',
    '真实在仓库里干活的机器，没有为讨好人做过任何设计。',
    'an industrial humanoid robot component: matte black composite outer panel with internal cable routing, an exposed silver-grey machined actuator housing at the joint end, bolt-down service panels, sensor-dense surfaces, load-bearing ribs, utilitarian',
    ['metal.graphite', 'matte.ash', 'metal.brass'], 0.9, 0.2,
    '工业人形：哑光黑内走线 / 极简轻量肢 / 银灰机身黑关节', 'full'),
  A('patrol', '巡逻', 'Patrol', '一个不该直立的东西直立了',
    '四足机的语言长在人身上。每个人都见过它趴着走。',
    'a quadruped field-robot derived component: boxy machined housing, a slim tubular actuator segment with a bulging knee-motor drum at one end, protective bumper ribs, engineering yellow and black, rugged, no face, exposed hex bolts and a small sensor port',
    ['paint.hazard', 'metal.graphite', 'glow.signal'], 0.45, 0.45,
    '机器狗谱系：黄身体 + 黑关节 + 无头四足，这一代最成立的新物种', 'full'),
  A('xeno', '异形', 'Xeno', '它在模仿你，但模仿错了',
    '比例像人，材质不像 —— 恐怖谷不在脸上，在关节上。',
    'a biomechanical xenomorph-like segment: chitinous ribbed carapace over an exposed internal strut, elongated tapering forms, sinewy tendon-like channels, wet-looking dark blue-grey shell, organic but hard-surfaced',
    ['chitin.deep', 'metal.graphite', 'glow.signal'], 0.7, 0.75,
    '生物机械造型传统', 'full'),
  A('coral', '珊瑚', 'Coral', '既不是人，也不是机器',
    '观众说不出它像什么，这就是目的。最接近原作。',
    'a hybrid organic-mechanical segment: dense layered overlapping plates like scales, fine ribbed fins along its length, a slender internal armature visible through the gaps between plates, high-frequency surface detail, pale bone and soft coral tint',
    ['matte.bone', 'chitin.deep', 'metal.brass'], 0.35, 0.7,
    '—', 'full'),

  // 新增物种（light coverage，各 6 件 ≈ 3 credits）
  A('athlete', '运动员', 'Athlete', '身体是人，运动不是',
    '肌肉型机械生物。它不尊重人体关节极限 —— 最好的 uncanny 来自运动而不是长相。',
    'a muscular electric-actuator limb segment: exposed linear actuators and hydraulic-looking cylinders along an athletic tapered form, bare machined aluminium and dark grey, cables bundled along the spine of the part, no outer cosmetic shell',
    ['metal.graphite', 'matte.ash', 'glow.signal'], 0.85, 0.5,
    '电动人形的裸机械美学：外壳更少、执行器外露'),
  A('softwear', '穿衣的', 'Softwear', '一个住在家里的陌生室友',
    '给机器人穿上织物，它就从工业机械变成了"家里那个人"。这是最大的一次跨越。',
    'a limb segment wrapped in soft knitted fabric over a slim rigid core, visible stitched seams and a ribbed cuff at the joint end, warm greige textile, matte and domestic, no exposed machinery',
    ['matte.bone', 'paint.hazard', 'matte.ash'], 0.9, 0.55,
    '软覆盖家用人形：织物覆盖改变了整台机器的社会属性'),
  A('compact', '小人', 'Compact', '人形，但只有一米三',
    '它改变的不是技术，是尺度想象。头不是脸，是一个黑色 sensor pod。',
    'a compact humanoid robot part with chunky friendly proportions, glossy white shell with a matte black sensor visor band, short and stout, rounded corners, consumer-electronics finish',
    ['ceramic.pearl', 'metal.graphite', 'glow.signal'], 0.9, 0.45,
    '小型人形：紧凑比例 + 黑色 sensor pod 头部'),
  A('digitigrade', '鸟腿', 'Digitigrade', '人的手，鸟的腿',
    'human manipulation envelope + animal locomotion morphology —— 最有辨识度的工业机器人形态。',
    'ONE single connected solid part, not a scene and not several separate objects: a reverse-jointed digitigrade leg segment with a long slender bird-like shank, a backward-bending knee housing fused to it, carbon-dark strut with a pale grey actuator pod, all volumes merged into one continuous body',
    ['metal.graphite', 'matte.bone', 'paint.hazard'], 0.6, 0.6,
    '鸟腿/兽脚类步态形态'),
  A('wheelleg', '轮足', 'Wheelleg', '它既走也滑',
    '腿末端长轮子。轮 × 腿的混种是这几年最被低估的一支。',
    'ONE single connected solid part with thick closed volumes, no thin shells and no loose fragments: a wheel-leg hybrid limb segment, a rigid strut terminating in a fat rubber-tyred wheel hub with a drive motor fused to it, suspension linkage merged into the same body, industrial grey and black with a hazard-orange accent ring',
    ['metal.graphite', 'paint.hazard', 'matte.ash'], 0.35, 0.35,
    '轮足四足：腿末端驱动轮 + 悬挂连杆'),
  A('droid', '小怪物', 'Droid', '它不执行任务，它有性格',
    '别人卷灵巧度，这一支卷 believability。头的倾斜、落脚的方式，全都服务于"让你相信它活着"。',
    'a stylised character-robot part: a big rounded head-pod with a single large lens eye and antenna nubs, weathered painted metal in cream and rust-orange, friendly proportions, film-prop craftsmanship, scuffs and panel wear',
    ['paint.hazard', 'matte.bone', 'metal.brass'], 0.5, 0.85,
    '角色机器人：先是角色，然后才是技术'),
  A('petbot', '宠物', 'Petbot', '它不像狗，但你会觉得它活着',
    '机器人不需要逼真，机器人需要让人投射生命。二十多年前就想明白了这件事。',
    'a glossy white pet-robot body part with pearlescent finish, rounded organic-electronic forms, a smooth articulated ear or tail element, small OLED-like lens detail, toy-grade precision, warm and friendly',
    ['ceramic.pearl', 'matte.bone', 'glow.signal'], 0.25, 0.9,
    '娱乐机器人宠物：用眼睛/耳朵/尾巴表达情绪而不是拟真'),
  A('furball', '毛球', 'Furball', '它放弃了腿、手和任务',
    '触摸 → 声音 → 微小动作 → 依恋。机器人在这里已经不是仆人，接近人造生物。',
    'a soft furry creature-blob part: dense short fur surface, no limbs, no face, gently rounded organic volume, warm beige and cream, tactile and huggable, seamless',
    ['matte.bone', 'paint.hazard', 'ceramic.pearl'], 0.1, 0.95,
    '情感型毛绒机器生物'),
  A('screenface', '桌宠', 'Screenface', '几个自由度就够它有人格',
    '4–8 个执行器就能让人觉得它有生命 —— 这是跟 40+ DoF 人形完全不同的机器人经济学。',
    'a desktop companion robot part: glossy white rounded shell with a large flat dark screen panel as its face, two small expressive ear flaps, a chunky two-wheel base module, consumer product finish',
    ['ceramic.pearl', 'metal.graphite', 'glow.signal'], 0.3, 0.8,
    '屏幕脸桌面机器人：巨大屏幕脸 + 少量自由度'),
  A('orb', '球', 'Orb', '机器人为什么一定要有腿',
    '一个球在家里滚来滚去。没有恐怖谷，也没有"人形机器闯进家里"的威胁感。',
    'a spherical rolling robot shell segment: a smooth seamless sphere section in warm yellow with a single dark sensor band, minimal joins, soft matte finish, ambient home-device aesthetic',
    ['paint.hazard', 'matte.bone', 'glow.signal'], 0.05, 0.6,
    '环境家用球形机器人谱系'),
  A('manipulator', '移动机械臂', 'Manipulator', '被人形热潮盖住的那个真正重要的物种',
    '如果地面本来就是平的，为什么要花巨大能量去模拟两条腿。',
    'a mobile-manipulator component: an extruded aluminium rail segment with a black cable track running along it, a compact gripper joint housing, lab-grade utilitarian finish, white and anodised grey',
    ['matte.ash', 'metal.graphite', 'matte.bone'], 0.4, 0.15,
    '轮式底盘 + 躯干 + 双臂的移动操作平台'),
  A('autonomous', '无人车', 'Autonomous', '它也是机器人，只是大了很多',
    '一旦不再把具身智能等于人形，这个领域突然变得特别丰富。',
    'ONE single connected solid part, thick and closed, no thin shells, no holes and no separate pieces: an autonomous-vehicle derived body volume, a smooth white automotive clamshell form with a black sensor dome fused on top and a ring of lidar apertures, automotive paint finish, large-radius curves',
    ['ceramic.pearl', 'metal.graphite', 'glow.signal'], 0.2, 0.25,
    '自动驾驶车辆：传感器穹顶 + 汽车级曲面'),

  // 程序化，不花 credits
  {
    id: 'field', kind: 'archetype', name: '场', nameEn: 'Field',
    tagline: '身体消失，只剩运动', taglineEn: TAGLINE_EN['field'],
    tension: '唯一不靠生成的条目：一片跟着骨架走的点，每一个点落后的时间都不一样 —— 站住不动它几乎重新聚成一个人，一动起来就只剩轨迹。玩过前面那些之后，它让人意识到一直在动的是自己。',
    look: '', palette: ['glow.signal', 'matte.ash', 'ceramic.pearl'],
    source: 'procedural', clearance: 'own', axes: { humanLike: 0.5, lifeLike: 0.5 },
    coverage: 'light', tierOfVariant: { a: 1 },
    reference: '—',
  },
];

// ── 嘉宾与角色 ──────────────────────────────────────────────────────────────
/**
 * 这两组默认 **不进公开构建**（见文件头的 clearance 门）。
 * 机制是通的：填 look / 放参考图到 assets/refs/<id>/ 就能生成、能选、能穿。
 * 但真实在世人物的可辨认形象、以及他人角色 IP，公开展出是另一回事 ——
 * 要么取得授权（clearance 改 'licensed' 并在 note 里写清来源），
 * 要么做成"不可辨认的致敬"（那它就该是一个 archetype，不是 guest）。
 *
 * 下面留的是**空位**，不是名单：id 和 tension 说明这个位置想要什么样的存在，
 * look 留空表示还没有人往里填造型。
 */
export const GUESTS: RosterEntry[] = [
  {
    id: 'guest.founder', kind: 'guest', name: '创始人', nameEn: 'The Founder',
    tagline: '（空位）把一个真实的人穿在身上', taglineEn: TAGLINE_EN['guest.founder'],
    tension: '当你抬手，一个你认得出的人也抬手 —— 这是这件作品能做的最冒犯也最有力的一件事。正因为有力，才不该随手做。',
    look: '', palette: ['matte.bone', 'metal.graphite', 'ceramic.pearl'],
    source: 'rodin', clearance: 'public-figure',
    axes: { humanLike: 1.0, lifeLike: 0.9 }, coverage: 'light', base: 'porcelain',
    tierOfVariant: { a: 1 },
    note: '需要本人授权，或改为不可辨认的抽象化处理。未授权前不进公开构建。',
  },
];

/**
 * 角色。这里全部是**原创造型**，所以 clearance 是 own，可以公开构建。
 * 想用现成 IP：新开条目、clearance 填 'third-party-ip'，拿到授权后改 'licensed' 并在 note 写来源。
 */
const C = (
  id: string, name: string, nameEn: string, tagline: string, tension: string,
  look: string, palette: string[], humanLike: number, lifeLike: number, base: string,
): RosterEntry => ({
  id, kind: 'character', name, nameEn, tagline, taglineEn: TAGLINE_EN[id] ?? nameEn, tension, look, palette,
  source: 'rodin', clearance: 'own', axes: { humanLike, lifeLike },
  coverage: 'light', base, tierOfVariant: { a: 1 },
});

export const CHARACTERS: RosterEntry[] = [
  C('char.dumpling', '团子', 'Dumpling', '一个软的、圆的、会喘气的东西',
    '观众对可爱形象的投射速度远快于对机器的投射速度 —— 这是最容易让人"认领"这具身体的一条路。也是最容易让人放下戒备之后突然发现"这是我在动"的一条路。',
    'a soft rounded creature body part: plush pale cream surface with a faint blush gradient, no visible face, tiny stubby proportions, gentle seams like a sewn toy, matte fuzzy finish',
    ['matte.bone', 'paint.hazard', 'ceramic.pearl'], 0.3, 0.95, 'furball'),
  C('char.ghost', '幽灵', 'Ghost', '半透明的、不确定自己在不在的东西',
    '它是唯一一个不完全在场的身体。观众会不自觉地做更大的动作去确认它还在 —— 交互强度反而最高。',
    'a translucent ghostly body segment: frosted milky glass-like volume with soft internal glow, smooth teardrop forms, no hard edges, faint cool blue tint, weightless',
    ['ceramic.pearl', 'glow.signal', 'matte.bone'], 0.55, 0.7, 'coral'),
  C('char.paper', '纸人', 'Paper', '一具折出来的身体',
    '硬边、平面、可折叠。它让"刚体挂载"这件事从技术妥协变成了明确的造型语言 —— 缝隙是故意的。',
    'a folded-paper body segment: crisp flat facets with visible fold creases and cut edges, warm off-white cardstock, layered planes with small gaps, origami construction, matte paper fibre surface',
    ['matte.bone', 'matte.ash', 'paint.hazard'], 0.75, 0.4, 'porcelain'),
  C('char.idol', '偶像', 'Idol', '一个被做成周边的你',
    '光滑、饱和、无瑕疵 —— 玩具化的身体。它问的是：把自己变成商品是什么感觉。',
    'a glossy vinyl figure body part: highly saturated candy-coloured plastic with a thick clear-coat sheen, chunky toy proportions, visible mould parting line, collectible figure finish',
    // base 从 compact 改成 porcelain：compact 已经整具换成 G1 的真实几何（docs/26 §H），
    // 再从它借件，就等于把真 CAD 穿插进一个**想象出来的**角色身上 ——
    // 那正是"按物种整体换，不按槽位穿插"要避免的事。角色只能从生成件借。
    ['ceramic.pearl', 'paint.hazard', 'glow.signal'], 0.85, 0.6, 'porcelain'),
];

for (const e of ARCHETYPES) if (RE_ANCHOR[e.id]) e.seedSalt = RE_ANCHOR[e.id];
for (const e of ROSTER_ALL_FOR_PLAN()) if (BODY_PLAN[e.id]) e.bodyPlan = BODY_PLAN[e.id];
for (const e of ROSTER_ALL_FOR_PLAN()) if (MACHINE[e.id]) e.machine = MACHINE[e.id];

function ROSTER_ALL_FOR_PLAN(): RosterEntry[] { return [...ARCHETYPES, ...GUESTS, ...CHARACTERS]; }

// 受邀角色自带 bodyPlan，所以**不**经过上面那轮 BODY_PLAN 覆盖 ——
// 加人只改 recipes/invited.ts 一个文件（「后面还会有其他的」）。
export const ROSTER: RosterEntry[] = [...ARCHETYPES, ...GUESTS, ...CHARACTERS, ...INVITED];

/** 公开构建允许打包的条目 */
export const PUBLIC_CLEARANCE: Clearance[] = ['own', 'licensed'];
export const isPublic = (e: RosterEntry): boolean => PUBLIC_CLEARANCE.includes(e.clearance);

export const entryById = (id: string): RosterEntry | undefined => ROSTER.find((e) => e.id === id);
/** 会真的去生成的条目：有 look、走 rodin、且没被 clearance 挡住 */
export const GENERATED = ROSTER.filter((e) => e.source === 'rodin' && e.look.length > 0);
export const GENERATED_PUBLIC = GENERATED.filter(isPublic);
