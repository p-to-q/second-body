/**
 * 身体方案的**标记**。`/about` 散点图与它下面的图例共用这一份。
 *
 * ## 它修的是什么
 *
 * 这张表原来是 `about.ts` 里一个四分支的 `switch`：只有 `quadruped` / `mass` /
 * `stub` 有自己的形状，`rig` / `towering` / `inverted` / `radial` / `column` /
 * `swarm` **六个方案共用同一个空心圆**。图例只有三四行的时候这还能过，
 * 而 `BODY_PLANS` 现在是真实的九个、图例九行全印 —— 于是同一页上出现
 * 六个不同的名字配同一个记号。**那比不画记号更坏**：不画只是没说，
 * 画成一样是在断言"它们是一类"，而这句话是假的（docs/02 P21）。
 *
 * ## 为什么是数据，不是一段 `document.createElementNS`
 *
 * 拆成这张表，"九个方案九个记号、而且两两不同"才**测得到** ——
 * `about.ts` 第一行 import 了 CSS，在 node 里根本 import 不进来。
 * 守卫见 `packages/app/test/body-plans.test.ts`，它读的就是下面这张表，
 * 所以加第十个方案却不给记号，`tsc` 与那条测试**两处都红**。
 *
 * ## 画法的边界
 *
 * 这是**记号，不是图标**（docs/26 §F 的反面清单：不用卡片、阴影、圆角、图标）。
 * 所以只有两种画笔，就是 `about.css` 里本来那两条：
 * `plot-mark`（描边、不填充）与 `plot-mark-fill`（填充、无描边）。
 * 每个记号说的都是那个方案的**拓扑**，不是它的名字：
 * 读法逐条写在下面，来源是 `core/src/bodyplan.ts` 与 `app/src/creature/{mass,swarm}.ts`。
 *
 * 坐标一律**以记号中心为原点**，尺度按散点图上 ~10px 那一档定。
 * 摆到哪里是 `about.ts` 的事。
 */
import type { BodyPlanId } from '../../../core/src/bodyplan.ts';

/** 记号的一笔。`cls` 只能是 about.css 已有的那两条画笔 */
export interface MarkPart {
  tag: 'circle' | 'rect' | 'line' | 'polygon';
  cls: 'plot-mark' | 'plot-mark-fill';
  attrs: Readonly<Record<string, string | number>>;
}

/** 一片点：`swarm` 的固定撒点。写死而不是随机 —— 记号每次渲染必须一模一样 */
const FIELD: readonly (readonly [number, number])[] = [
  [-4.4, -2.6], [-1.3, -4.6], [2.6, -3.4], [-3.2, 1.4],
  [0.4, -0.2], [3.8, 0.8], [-0.6, 4.2], [3.0, 3.8],
];

/**
 * 方案 → 记号。**`Record<BodyPlanId, …>`**，所以 `BODY_PLANS` 多一个成员而
 * 这里没跟上，`tsc` 当场红 —— 这正是它不写成 `Record<string, …>` 的全部理由。
 */
export const PLAN_MARKS: Record<BodyPlanId, readonly MarkPart[]> = {
  // 人形：空心圆。它是缺省的那一具，所以记号也是最没有主张的那一个
  rig: [{ tag: 'circle', cls: 'plot-mark', attrs: { cx: 0, cy: 0, r: 5 } }],

  // 四足：横的、矮的。躯干被拉长 1.9 倍横过来，四个插座钉在它上面（`quadruped()`）
  quadruped: [{
    tag: 'rect', cls: 'plot-mark',
    attrs: { x: -7, y: -3.5, width: 14, height: 7, rx: 3.5 },
  }],

  // 高耸：同一具人形被抻长（limb 1.55 / torso 0.85，`PRESETS.towering`）。
  // 所以它是四足那根横杆立起来、收窄 —— 拓扑没变，比例变了
  towering: [{
    tag: 'rect', cls: 'plot-mark',
    attrs: { x: -2.5, y: -5.5, width: 5, height: 11 },
  }],

  // 矮壮：方的、墩的（limb 0.55 / torso 1.25 / head 1.2，`PRESETS.stub`）
  stub: [{
    tag: 'rect', cls: 'plot-mark',
    attrs: { x: -4.5, y: -4.5, width: 9, height: 9 },
  }],

  // 倒置：**它是挂着的**。`inverted()` 把整具骨架绕 pelvis 上下翻过来，
  // 脚朝天、头成了最低点，落地基准也因此改成整体最低关节（`PLANS_WITHOUT_FEET`）。
  // 所以记号上宽下尖：重量吊在上缘，触地的是那一个点
  inverted: [{
    tag: 'polygon', cls: 'plot-mark',
    attrs: { points: '-5.5,-4 5.5,-4 0,5.5' },
  }],

  // 环绕：**没有前面**。四条肢被摊到绕同一个核心的四条轨道弧上（`RADIAL.arcs`），
  // 核心压扁了悬在中间。所以是一圈断成四段的弧 + 中间那个核 ——
  // 断开的圈说的是"四条轨道"，旋转对称说的是"哪边是前没有意义"
  radial: [
    {
      tag: 'circle', cls: 'plot-mark',
      // 周长 2π·5 ≈ 31.4；5.2 + 2.65 一组正好四组 = 四段弧
      attrs: { cx: 0, cy: 0, r: 5, 'stroke-dasharray': '5.2 2.65' },
    },
    { tag: 'circle', cls: 'plot-mark-fill', attrs: { cx: 0, cy: 0, r: 1.8 } },
  ],

  // 单柱：**没有腿**。两条腿的六节被首尾串成一根从地面长上来的桅杆（`MAST`），
  // 躯干接在它顶上。所以记号是一根竖线，一笔宽度都没有 ——
  // 和 towering 那个立起来的**框**的差别，正好是"还有四肢"与"没有四肢"
  column: [{ tag: 'line', cls: 'plot-mark', attrs: { x1: 0, y1: -6, x2: 0, y2: 6 } }],

  // 团块：实心。一件槽位件都不实例化，整具身体是一个 MarchingCubes 网格
  // （`creature/mass.ts`）—— 没有接缝可画，所以它是填满的
  mass: [{ tag: 'circle', cls: 'plot-mark-fill', attrs: { cx: 0, cy: 0, r: 5 } }],

  // 点场：一片点。同样一件槽位件都不实例化，但和团块正好相反 ——
  // 它没有表面，只有跟着骨架走的一片各自延迟不同的点（`creature/swarm.ts`）。
  // 所以记号是散开的、没有轮廓的：轮廓正是这个物种声称自己没有的东西
  swarm: FIELD.map(([cx, cy]) => ({
    tag: 'circle' as const, cls: 'plot-mark-fill' as const, attrs: { cx, cy, r: 1.5 },
  })),
};

/**
 * 记号查表。**未知的 kind 画成 `rig`** —— 不是偷懒，是诚实：
 * `remapSkeleton` 对未知值走 default、原样返回人体骨架（P2），
 * 于是画面上站着的**就是**一具人形。记号跟着画面走，不跟着字符串走。
 *
 * 声明侧那条路已经堵死了（`ThemeDef.bodyPlan` 收成 `BodyPlanId`、
 * `check:parts` 判错、`body-plans.test.ts` 两头对账），所以这条兜底应当永不生效。
 */
export function markShape(kind: string): readonly MarkPart[] {
  return PLAN_MARKS[kind as BodyPlanId] ?? PLAN_MARKS.rig;
}
