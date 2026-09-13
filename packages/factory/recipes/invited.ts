/**
 * 受邀角色 —— 由项目负责人指名、从**真实存在的角色**抽象出来的体型原型。
 *
 * ## 为什么单开一个文件
 *
 * 「后面还会有其他的」。每来一个就去改 `roster.ts` 的三个地方（数组、比例表、
 * 身体方案表），迟早会漏掉一处，而且那个文件同时被好几条线动。
 * 这里每个条目**自带** `bodyPlan`，`roster.ts` 只负责把它们拼进 `ROSTER` ——
 * 加人只改这一个文件。
 *
 * ## 为什么是"原型"而不是角色本身
 *
 * 这不是一句免责声明，是这件作品的逻辑要求的。
 *
 * 法务上：仓库是公开的、部署是公开的、还要交给评委看，生成物是**被分发**的。
 * 大白（迪士尼）和 Chiikawa（ナガノ）是强保护角色，做出可识别的复制品再发布，
 * 和拿它们当参考不是一回事。初音未来反而不同 —— Piapro 角色许可明确允许
 * 非商业二次创作，它是这三个里唯一可以直接做的，但为了三条线一致，同样抽象化。
 *
 * 更重要的是作品上：这件作品讲的是「观众变成那一类身体」，不是「这里有一个大白」。
 * 一个可识别的角色会把观众的注意力从"那是我在动"拽到"那是我认识的那个东西"——
 * 而前者正是全部意义所在。抽象成体型原型，观众才认领得了它。
 *
 * 所以每一条各自压住一个**不同的技术轴**，而不是三个可爱的东西：
 * 充气 = 封闭软体积；歌姬 = 半透明自发光；线 = 描边而非体积。
 */
import type { RosterEntry } from './roster.ts';

const I = (
  id: string, name: string, nameEn: string, tagline: string, taglineEn: string,
  tension: string, look: string, palette: string[],
  humanLike: number, lifeLike: number, base: string,
  bodyPlan: RosterEntry['bodyPlan'],
): RosterEntry => ({
  id, kind: 'character', name, nameEn, tagline, taglineEn, tension, look, palette,
  source: 'rodin', clearance: 'own', axes: { humanLike, lifeLike },
  coverage: 'light', base, tierOfVariant: { a: 1 }, bodyPlan,
});

export const INVITED: RosterEntry[] = [
  /**
   * 充气 —— 软体照护者的体型。
   * 技术轴：**封闭的软体积**。它没有一条硬边，全身是被气撑起来的曲面，
   * 四肢退化成短管。
   *
   * 这里原来写着「刚体挂载在它身上反而成立：气囊本来就是一节一节焊出来的」——
   * 那句话是一次自我说服。实际做出来六件只成了一件，画面上是一具瓷身体
   * 顶着一个飘在空中的头（`docs/39`）。**封闭的软体积就是团块**，
   * 它 2026-09-14 改走 `bodyPlan: 'mass'`（`roster.ts` 的 BODY_PLAN）。
   * 下面这段提示词保留，因为团块的颜色与材质仍然从它来。
   */
  I('char.inflate', '充气', 'Inflate',
    '一个被气撑起来的看护者', 'A caretaker held up by air',
    '它的体积全部来自空气，所以它不可能伤到人 —— 这是唯一一个观众会想靠近的身体。' +
    '而它越无害，"它在模仿我"这件事就越难被当成威胁，观众放下戒备的速度也最快。',
    'an inflated soft-robotics body segment: seamless welded vinyl bladder, matte chalk-white, ' +
    'large smooth bulging volume with a single faint welded seam line, no hard edges, no panel gaps, ' +
    'slightly translucent at thin sections, soft studio light',
    ['matte.bone', 'ceramic.pearl', 'matte.ash'],
    0.55, 0.8, 'porcelain',
    // 躯干吞掉体积，四肢退化成短管 —— 这正是充气体型的全部辨识度
    { limb: 0.55, torso: 1.95, head: 0.85, arm: 0.75 }),

  /**
   * 歌姬 —— 投影出来的表演者。
   * 技术轴：**半透明自发光**。它是这一批里唯一一个不完全是实体的身体，
   * 也是唯一一个"光比形更重要"的。长条拖曳件是它的签名，靠 towering 的比例给出来。
   */
  I('char.diva', '歌姬', 'Diva',
    '一个被投影出来的人', 'A person made of projected light',
    '它不在房间里，它只是被打在空中。观众会不自觉地绕到侧面去确认它有没有厚度 ——' +
    '这是唯一一个靠"不在场"制造走近动作的身体。',
    'a holographic performer body segment: frosted translucent acrylic volume with internal teal ' +
    'emissive glow along thin channels, slender elongated forms, long trailing ribbon-like element, ' +
    'polished edges catching stage light, weightless',
    ['glow.signal', 'ceramic.pearl', 'matte.ash'],
    0.8, 0.45, 'char.ghost',
    // 拉长 + 细 —— 舞台身体的比例。towering 只改比例不改拓扑，正合适
    { kind: 'towering', limb: 1.35, torso: 0.88, head: 0.95 }),

  /**
   * 线 —— 一个被画出来的生物。
   * 技术轴：**描边而不是体积**。这一条是这批里最有意思的：它要求渲染回答
   * "一个由轮廓线定义的东西，做成 3D 之后还成不成立"。
   * 白面 + 深色粗轮廓 + 极小的四肢，整具身体几乎只有一个头。
   */
  I('char.line', '线', 'Line',
    '一个被画出来的东西', 'Something that was drawn, not built',
    '它是二维的东西被迫长出了厚度。观众第一眼会觉得它不该存在于三维里 ——' +
    '而当它跟着自己动起来，那种"不该存在的东西活了"的不适感，是这一批里最强的。',
    'a minimal drawn-creature body segment: flat chalk-white surface with a thick dark ink outline ' +
    'along every silhouette edge, extremely simplified rounded form, tiny stub limb, ' +
    'no surface detail, no shading, looks like a line drawing given thickness',
    ['matte.bone', 'matte.ash', 'paint.hazard'],
    0.25, 0.9, 'char.dumpling',
    // 头就是全部，四肢是两根小棍 —— 这是"被画出来"的体型逻辑
    { kind: 'stub', head: 2.1, limb: 0.3, torso: 0.9 }),

  /**
   * 发布会 —— 舞台上那具身体。
   *
   * 项目负责人给了 Sam Altman 和 Tim Cook 两张照片。**它们是同一具身体**：
   * 同样的站姿、同样的素色针织衫、同样的深裤、同样的白球鞋、同样摊开到胸前的手。
   * 那不是两个人，那是一套制服 —— 所以这里是**一个**条目，不是两个。
   *
   * 做成制服而不是做成谁，有一条硬理由：这两位是真实在世的人。
   * 做出可识别的三维像再公开发布，和拿照片当参考不是一回事。
   * 而 roster 里的 `guest.founder` 早就把这件事写清楚了 ——
   * 「当你抬手，一个你认得出的人也抬手，这是这件作品能做的最冒犯也最有力的一件事。
   * 正因为有力，才不该随手做。」那个条目是一个**故意的空位**。
   * 这一条是那个空位的答案：**站上去的不是某个人，是那身衣服。**
   *
   * 技术轴：**织物**。这是全谱系里唯一一个身体由布构成的 —— 针织的起伏、
   * 袖口的罗纹、裤子的垂坠。刚体挂载在布上最难，正因为难才值得做。
   */
  I('guest.keynote', '发布会', 'Keynote',
    '舞台上的那套制服', 'The uniform worn on stage',
    '所有人都穿成这样站在同一束光里。观众认得出这具身体属于谁 ——' +
    '但它谁也不是，它是一个位置。这是全谱系里唯一一个用"衣服"而不是"结构"定义的身体。',
    'a knitwear-clad torso segment: fine-gauge merino sweater in muted heather grey-green, ' +
    'soft fabric folds and gentle drape, ribbed cuff texture, matte wool fibre surface, ' +
    'no logo no text, calm studio key light on a dark stage',
    ['matte.ash', 'matte.bone', 'metal.graphite'],
    1.0, 0.55, 'porcelain',
    // 标准比例。它的不同全在材质上 —— 一旦改比例，"制服"这件事就散了
    undefined),

  /**
   * 特摄 —— 被巨大化的光之战士。
   *
   * 技术轴：**镀铬 + 三原色**。这是全谱系里唯一一个高饱和、高反射的身体，
   * 也是唯一一个明确"里面有人"的身体 —— 特摄的全部前提就是一件人穿的衣服。
   * 那层"知道里面是人"的意识，和这件作品要观众感觉到的东西正好同构。
   */
  I('char.tokusatsu', '特摄', 'Tokusatsu',
    '一件被人穿着的光', 'A light with a person inside it',
    '所有人都知道里面是人，但所有人都愿意不去想它 —— 这正是这件作品每一秒都在发生的事。' +
    '它是唯一一个把"这是一具被穿上的身体"直接说出口的物种。',
    'a suited hero body segment: mirror-polished chrome armour plate over a smooth red and ' +
    'cobalt-blue bodysuit, sharp angular silver crest lines, high-gloss lacquer finish, ' +
    'crisp colour boundaries, no weathering, studio rim light',
    ['metal.graphite', 'paint.hazard', 'glow.signal'],
    0.95, 0.5, 'industrial',
    { limb: 1.08, torso: 1.05, head: 0.92 }),

  /**
   * 画 —— 一幅画站了起来。
   *
   * 技术轴：**油画表面**。它不是被做出来的，是被**画**出来的：
   * 罩染的暖褐、看不见边界的过渡、厚重的织物褶。
   * 和「线」正好是一对 —— 一个是轮廓给了厚度，一个是笔触给了厚度。
   *
   * 蒙娜丽莎本身是公有领域（达·芬奇，1503），所以这一条是这批里
   * 唯一可以直接依据原作做的。参考取自画，不取自任何一件衍生商品的产品照。
   */
  I('char.painting', '画', 'Painting',
    '一幅画站了起来', 'A painting that stood up',
    '它被看了五百年，现在它反过来跟着你动。观众第一次意识到"被看"这件事是双向的 ——' +
    '而这正是这件作品的名字在说的事。',
    'an oil-painted figure body segment: aged varnish surface with warm umber and olive glazing, ' +
    'soft sfumato transitions with no hard edges, heavy draped fabric folds, ' +
    'fine craquelure across the surface, dim gallery light from the left',
    ['matte.ash', 'matte.bone', 'ceramic.pearl'],
    1.0, 0.65, 'porcelain',
    { torso: 1.12, limb: 0.95, head: 0.95 }),
];
