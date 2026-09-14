/**
 * 身体方案的**记号** —— 一个方案一个形状。
 *
 * ## 为什么它从 `/about` 里搬出来住
 *
 * 这几笔原来是 `about/about.ts` 里的一个私有函数 `planMark()`，`/about` 的散点图
 * 和它下面那排图例各用一次。现在多了第三个消费者：侧室 `/marks`（`rooms/marks.ts`），
 * 它要把九个方案一字排开当标本看。
 *
 * 三个地方画同一套记号，就必须只有一处画得出它们 —— 否则散点上的「四足」和
 * 标本行里的「四足」迟早不是同一个形状，而这件事**没有任何仪表会报**：
 * 两边各自看都对，只有把两页并排放才看得出来，而没有人会那么做。
 *
 * ## 形状编码方案，颜色一律不参与
 *
 * `docs/26 §F`：全站只有一处用颜色承担语义，这里不是那一处。
 * 而且形状在黑白印刷和投影上都活得下来，颜色不一定 —— 海报那条线已经验过。
 *
 * ## ⚠️ 并行改动：九枚记号
 *
 * 写这个文件的时候，另一条线正在把 `BODY_PLANS` 的**九个**方案各配一枚记号
 * （现在这里只认得四种形状，其余落到 `default` 的空心圆）。那条线落地之后，
 * 新的九枚就落在**下面这一个 switch 里**，两个消费者同时亮起来，
 * `/marks` 不需要改一行 —— 它本来就是照着 `BODY_PLANS` 逐条渲的。
 * 在那之前 `/marks` 会如实显示"这几个方案还共用同一枚记号"，
 * 那不是它画错了，是记号本身还没画完。
 */

import './plan-mark.css';

const SVG = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K, attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/**
 * 一枚记号，画在给定的坐标上。
 *
 * 保持「传 x / y」而不是「永远画在原点再用 transform 挪」，因为散点图上它要落在
 * 数据点上，而 `<g transform>` 会多出一层节点、也会让那张图的 DOM 读起来不再是
 * "一个点一个形状"。标本行那边由 `planMarkNode()` 兜住。
 */
export function planMark(kind: string, x: number, y: number): SVGElement {
  switch (kind) {
    case 'quadruped':   // 横的、矮的 —— 和它在场上的剪影一致
      return svg('rect', { class: 'plot-mark', x: x - 7, y: y - 3.5, width: 14, height: 7, rx: 3.5 });
    case 'mass':        // 实心：团块没有槽位件，是一整坨
      return svg('circle', { class: 'plot-mark-fill', cx: x, cy: y, r: 5 });
    case 'stub':        // 方的、墩的
      return svg('rect', { class: 'plot-mark', x: x - 4.5, y: y - 4.5, width: 9, height: 9 });
    default:            // rig：空心圆
      return svg('circle', { class: 'plot-mark', cx: x, cy: y, r: 5 });
  }
}

/** 记号自己的画幅。散点图上一枚记号最宽 14、最高 10，留一圈呼吸就是这个数 */
export const MARK_BOX = 20;

/**
 * 一枚独立的记号 —— 自带 `<svg>` 画幅，可以直接摆进一行文字或一张标本行里。
 *
 * `aria-hidden`：记号旁边永远写着方案的名字（`COPY.plans`），
 * 读屏念一遍形状的描述只会把同一件事说两次。
 */
export function planMarkNode(kind: string, size = MARK_BOX): SVGSVGElement {
  const root = svg('svg', {
    class: 'sb-plan-mark',
    width: size, height: size,
    viewBox: `0 0 ${MARK_BOX} ${MARK_BOX}`,
    'aria-hidden': 'true',
  });
  root.append(planMark(kind, MARK_BOX / 2, MARK_BOX / 2));
  return root;
}
