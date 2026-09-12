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
   * 四肢退化成短管。刚体挂载在它身上反而成立：气囊本来就是一节一节焊出来的。
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
];
