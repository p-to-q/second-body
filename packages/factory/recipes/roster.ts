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
import type { Tier } from '../../core/src/types.ts';

export type RosterKind = 'archetype' | 'guest' | 'character';
export type Clearance = 'own' | 'public-figure' | 'third-party-ip' | 'licensed';

export interface RosterEntry {
  id: string;
  kind: RosterKind;
  name: string;
  nameEn: string;
  tagline: string;
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
  /** 身体方案，见 docs/18。缺省 'rig' */
  bodyPlan?: string;
  tierOfVariant: Record<string, Tier>;
  /** 取材说明。取材 ≠ 复制，写清楚出处是为了让自己保持诚实 */
  reference?: string;
  /**
   * 换一批随机。seed 由 id 决定，原样重跑必然复现同一个坏结果；
   * 加 salt 是"我看过了，这个不行，换一个"的显式记录，比偷偷改 id 好。
   */
  seedSalt?: number;
  note?: string;
}

/** light 条目只生成这 6 个槽位 —— 决定剪影的那几件 */
export const SIGNATURE_SLOTS = ['spine', 'head', 'upperArm', 'shin', 'foot', 'joint'];

export const STYLE_BASE =
  'isolated single object on a plain background, one continuous solid part, ' +
  'symmetrical along its long axis, studio product render, neutral lighting, ' +
  'no text, no logo, no base, no stand, no character, no full body';

const A = (
  id: string, name: string, nameEn: string, tagline: string, tension: string,
  look: string, palette: string[], humanLike: number, lifeLike: number,
  reference: string, coverage: 'full' | 'light' = 'light', base = 'porcelain',
): RosterEntry => ({
  id, kind: 'archetype', name, nameEn, tagline, tension, look, palette,
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

/**
 * 哪些条目不是人形（docs/18-BODY-PLANS.md）。
 * 这一张表是 PRD §3 第三条主张（物种真的不同）成立与否的分界线 ——
 * 没有它，patrol / orb / furball 就只是穿着相应涂装的人。
 */
const BODY_PLAN: Record<string, string> = {
  patrol: 'quadruped',       // 四足机的语言长在人身上 —— 现在它真的是四足了
  digitigrade: 'quadruped',  // 鸟腿：反关节 + 四点着地
  wheelleg: 'quadruped',
  petbot: 'quadruped',       // 机器宠物本来就该是四条腿
  towering: 'towering',
  compact: 'stub',           // "人形，但只有一米三"
  droid: 'stub',             // 小怪物：大头短身
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
    tagline: '身体消失，只剩运动',
    tension: '唯一不靠生成的条目：只有关节球和它们之间的张力线。玩过前面那些之后，它让人意识到一直在动的是自己。',
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
    tagline: '（空位）把一个真实的人穿在身上',
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
  id, kind: 'character', name, nameEn, tagline, tension, look, palette,
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
    ['ceramic.pearl', 'paint.hazard', 'glow.signal'], 0.85, 0.6, 'compact'),
];

for (const e of ARCHETYPES) if (RE_ANCHOR[e.id]) e.seedSalt = RE_ANCHOR[e.id];
for (const e of ARCHETYPES) if (BODY_PLAN[e.id]) e.bodyPlan = BODY_PLAN[e.id];

export const ROSTER: RosterEntry[] = [...ARCHETYPES, ...GUESTS, ...CHARACTERS];

/** 公开构建允许打包的条目 */
export const PUBLIC_CLEARANCE: Clearance[] = ['own', 'licensed'];
export const isPublic = (e: RosterEntry): boolean => PUBLIC_CLEARANCE.includes(e.clearance);

export const entryById = (id: string): RosterEntry | undefined => ROSTER.find((e) => e.id === id);
/** 会真的去生成的条目：有 look、走 rodin、且没被 clearance 挡住 */
export const GENERATED = ROSTER.filter((e) => e.source === 'rodin' && e.look.length > 0);
export const GENERATED_PUBLIC = GENERATED.filter(isPublic);
