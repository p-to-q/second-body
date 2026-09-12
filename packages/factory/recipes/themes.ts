/**
 * 主题（theme）= 观众在开场轮播里选的那个"世界"。
 * 主题决定：部件的造型语言、材质调色板、以及它在作品里承担的那种张力。
 *
 * 设计意图（docs/12-SPEC-themes.md）：六个主题沿着一条轴排开 ——
 *   理想人形 → 真实工业机器 → 不该直立的四足机 → 生物机械 → 不可归类 → 无实体
 * 观众选的不是"皮肤"，是"你愿意变成哪一种非人"。
 *
 * 造型语言参考的是真实产品的设计语言（见文末 References），不是复制某个型号：
 * 我们要的是"看得出出身"，不是"认得出品牌"。
 */
import type { Tier } from '../../core/src/types.ts';

export interface ThemeDef {
  id: string;
  name: string;          // 中文名，轮播上显示
  nameEn: string;
  tagline: string;       // 一行，轮播卡片上显示
  tension: string;       // 它在作品里承担什么 —— 写给我们自己看的
  look: string;          // 喂给 Rodin 的造型语言段
  palette: string[];     // materialId，[primary, secondary, accent]
  /** procedural = 不走生成，运行时用程序化几何 */
  source: 'rodin' | 'procedural';
  /** 该主题下 variant → tier 的映射 */
  tierOfVariant: Record<string, Tier>;
}

/** 所有主题共享的约束段：保证产出是"一个可挂载的零件"而不是"一张概念图" */
export const STYLE_BASE =
  'isolated single object on a plain background, one continuous solid part, ' +
  'symmetrical along its long axis, studio product render, neutral lighting, ' +
  'no text, no logo, no base, no stand, no character, no full body';

export const THEMES: ThemeDef[] = [
  {
    id: 'porcelain',
    name: '瓷',
    nameEn: 'Porcelain',
    tagline: '一个被理想化过的你',
    tension: '最接近"更好的自己"。干净、无品牌、无磨损 —— 它的不安来自太完美。',
    look:
      'a smooth minimal exoskeleton shell, closed volume, very few seams, ' +
      'matte off-white pearl polymer panel with soft chamfered edges and a dark grey joint collar, ' +
      'calm minimal industrial design',
    palette: ['matte.bone', 'matte.ash', 'ceramic.pearl'],
    source: 'rodin',
    tierOfVariant: { a: 1, b: 2 },
  },
  {
    id: 'industrial',
    name: '工业',
    nameEn: 'Industrial',
    tagline: '它是来上班的，不是来陪你的',
    tension: '真实在仓库里干活的机器。没有为讨好人做过任何设计 —— 这是它最冒犯的地方。',
    look:
      'an industrial humanoid robot component: matte black composite outer panel with ' +
      'internal cable routing, an exposed silver-grey machined actuator housing at the joint end, ' +
      'bolt-down service panels, sensor-dense surfaces, load-bearing ribs, utilitarian',
    palette: ['metal.graphite', 'matte.ash', 'metal.brass'],
    source: 'rodin',
    tierOfVariant: { a: 1, b: 2 },
  },
  {
    id: 'patrol',
    name: '巡逻',
    nameEn: 'Patrol',
    tagline: '一个不该直立的东西直立了',
    tension: '四足机器的语言长在人身上。每个人都见过它趴着走，所以它站起来时很不对劲。',
    look:
      'a quadruped field-robot derived component: boxy machined housing, ' +
      'a slim tubular actuator segment with a bulging knee-motor drum at one end, ' +
      'protective bumper ribs, engineering yellow and black, rugged, no face, ' +
      'exposed hex bolts and a small sensor port',
    palette: ['paint.hazard', 'metal.graphite', 'glow.signal'],
    source: 'rodin',
    tierOfVariant: { a: 1, b: 2 },
  },
  {
    id: 'xeno',
    name: '异形',
    nameEn: 'Xeno',
    tagline: '它在模仿你，但模仿错了',
    tension: '生物机械。比例像人，材质不像 —— 恐怖谷不在脸上，在关节上。',
    look:
      'a biomechanical xenomorph-like segment: chitinous ribbed carapace over an exposed ' +
      'internal strut, elongated tapering forms, sinewy tendon-like channels, ' +
      'wet-looking dark blue-grey shell, organic but hard-surfaced',
    palette: ['chitin.deep', 'metal.graphite', 'glow.signal'],
    source: 'rodin',
    tierOfVariant: { a: 1, b: 2 },
  },
  {
    id: 'coral',
    name: '珊瑚',
    nameEn: 'Coral',
    tagline: '既不是人，也不是机器',
    tension: '最接近原作《Future You》的那种不可归类。观众说不出它像什么，这就是目的。',
    look:
      'a hybrid organic-mechanical segment: dense layered overlapping plates like scales, ' +
      'fine ribbed fins along its length, a slender internal armature visible through the gaps ' +
      'between plates, high-frequency surface detail, pale bone and soft coral tint',
    palette: ['matte.bone', 'chitin.deep', 'metal.brass'],
    source: 'rodin',
    tierOfVariant: { a: 1, b: 2 },
  },
  {
    id: 'field',
    name: '场',
    nameEn: 'Field',
    tagline: '身体消失，只剩运动',
    tension:
      '唯一不靠生成的主题：只有关节球和它们之间的张力线。' +
      '当观众玩过前面五个之后，这个会让他们意识到 —— 一直在动的是他们自己，不是那个身体。',
    look: '',                         // 程序化，不生成
    palette: ['glow.signal', 'matte.ash', 'ceramic.pearl'],
    source: 'procedural',
    tierOfVariant: { a: 1 },
  },
];

export const themeById = (id: string): ThemeDef | undefined => THEMES.find((t) => t.id === id);
export const GENERATED_THEMES = THEMES.filter((t) => t.source === 'rodin');

/**
 * References（造型语言取材，不复制型号）：
 * - Tesla Optimus Gen 2/3：白/珍珠聚合物面板 + 黑色关节罩 + 银色金属点缀 → porcelain
 * - Figure 02：哑光黑外壳 + 线缆全部内走 → industrial
 * - Agility Digit：刻意极简、轻量四肢、传感器密集的躯干 → industrial
 * - Fourier GR-2：银灰机身 + 黑关节 + 克制细节，"machine-first identity" → industrial
 * - Unitree Go2 / Boston Dynamics Spot / ANYbotics ANYmal：方盒躯干、细管执行器、
 *   膝部电机鼓包、工程黄黑、无脸只有传感器 → patrol
 */
