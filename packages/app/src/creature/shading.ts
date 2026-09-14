/**
 * 着色语言 —— 一具身体的表面**怎么被画出来**，而不是它长什么形状。
 *
 * ## 为什么要有这一层
 *
 * `char.line`（线）这一条的全部辨识度是**轮廓上那一圈粗黑线**，而参考图送不到它：
 * `docs/03 §4` 规定流水线去贴图、统一套自己的材质，所以生成器只交几何。
 * `docs/12-SPEC-themes.md` 那一节已经把结论写死了 ——
 * **描边是着色属性，不是几何属性，它活在着色器里，网格载不动它。**
 * 在这一层出现之前，「线」和其他二十几个物种走同一条 PBR 路径，
 * 于是它是一个圆润的白胖子，一条线都没有：**这个物种的身份此前是缺席的。**
 *
 * ## 为什么是一张表，不是 `if (id === 'char.line')`
 *
 * 因为下一个需要平涂的角色明天就会来（`invited.ts` 的文件头写着「后面还会有其他的」）。
 * 一个写死的 id 判断会让第二个角色去改渲染器，而它应该只改这张表。
 * 表本身是**看出来的**，不是推出来的 —— 没有"humanLike < 0.3 就上描边"这种规则（P15）。
 *
 * ## 为什么这张表在这里，而不是 `ThemeDef` 上
 *
 * 它**本该**在 `ThemeDef` 上（物种自带一个 `shading` 字段，`index-parts.ts` 原样抄过来，
 * 和 `bodyPlan` 完全同构）。但 `packages/core/src/types.ts` 是三条冻结契约之一
 * （AGENTS.md「change discipline」），而且加一个字段还要重跑一次 `factory:index`
 * 去重写 `parts.json` —— 那是一个已经生成好的产物（P9：跑过的配方不再重跑）。
 * 所以这里先立一张运行时的表，并把这件事记下来：
 *
 * > **contract change needed**：`ThemeDef` 少一个 `shading?: 'physical' | 'toon'` 字段。
 * > 契约主人加上它、`index-parts.ts` 从 `RosterEntry` 抄过去之后，
 * > 这张表就该被删掉，`resolveShading()` 改读 `themeDef.shading`。
 * > 在那之前这张表是唯一的落点，删掉它「线」就又变回白胖子。
 */
import * as THREE from 'three/webgpu';
import { add, float, mul, normalLocal, positionGeometry, positionLocal, sin } from 'three/tsl';
import { TOON } from '../../../core/src/tuning.ts';

/** `physical` = 此前所有物种走的那条 PBR 路径；`toon` = 平涂 + 反向外壳描边 */
export type ShadingId = 'physical' | 'toon';

export const SHADING_IDS: readonly ShadingId[] = ['physical', 'toon'];

/**
 * 缺省的着色语言。**2026-09-13 由 `physical` 翻成 `toon`**（作品负责人：
 * 「描边要普遍开着」）。
 *
 * 这个文件原来写着"描边是 opt-in 的，不是新的默认"，而那句话当时是对的：
 * 它防的是**没有人量过就把描边铺开**。翻这个默认之前先量了，数在下面，
 * 那句话因此不是被推翻的，是被满足的。
 *
 * 量到的（`test/outline-budget.test.ts` 现在守着它，29 个物种 × tier 1–3
 * × 8 个 seed）：**每一个物种都是 18 个桶**。桶数是槽位拓扑定的，不随
 * 抽中的件变 —— 各档抽中的件从 10 到 16 种不等，桶数一直是 18。
 * 于是描边之后一律 36 draw，`BUDGET.maxDrawCalls` 是 40，全数通过，
 * 余量 4 次提交（10%）。
 *
 * 余量小是真的，所以那条测试从"只测已声明的物种"改成了**测全部 29 个**：
 * 以后是哪一个物种先顶到 40，它会在这里红，不在现场红。
 *
 * 不用付这笔钱的两类身体：`bodyPlan` 为 `mass` 的（`creature/mass.ts`）和
 * `swarm` 的（`creature/swarm.ts`，例如「场」）**一件槽位件都不实例化**，
 * 外壳无处可套，它们的描边成本是 0。上面那 29 行里它们的 18 是按刚体装配
 * 算出来的，偏保守 —— 真实开销只会更低。
 */
export const DEFAULT_SHADING: ShadingId = 'toon';

/**
 * 物种 → 着色语言的**例外表**。写在这里的物种**覆盖** `DEFAULT_SHADING`。
 *
 * 翻了默认之后它的角色也翻了：它原来是"谁要描边"，现在是"谁不要"。
 * 目前是空的 —— 29 个物种全部走默认。留着它不是占位：
 * 一个物种的辨识度如果**恰恰**建立在连续的高光上（瓷、金属那一类），
 * 平涂会把它抹平，那时该在这里给它写一行 `'physical'`，
 * 而不是回去把默认翻回来、把另外二十八个一起带走。
 *
 * > **contract change needed** 仍然成立：`ThemeDef` 少一个
 * > `shading?: 'physical' | 'toon'` 字段。契约主人加上它、`index-parts.ts`
 * > 从 `RosterEntry` 抄过去之后，这张表和上面那个默认就该一起被删掉，
 * > `resolveShading()` 改读 `themeDef.shading ?? DEFAULT_SHADING`。
 */
export const SHADING_OF_THEME: Readonly<Record<string, ShadingId>> = {};

export function isShadingId(v: unknown): v is ShadingId {
  return typeof v === 'string' && (SHADING_IDS as readonly string[]).includes(v);
}

/**
 * 这一具身体用哪种着色语言。
 * @param override 控件条 / `?shading=` 给的强制值；`null` = 按默认与例外表走。
 *
 * 没有物种（开场还没选）也必须有答案 —— 帧循环里不许有洞，所以这里的
 * 兜底是 `DEFAULT_SHADING`，不是 `undefined`。
 */
export function resolveShading(themeId: string | null | undefined, override?: ShadingId | null): ShadingId {
  if (override) return override;
  return (themeId && SHADING_OF_THEME[themeId]) || DEFAULT_SHADING;
}

/** 一块材质要长什么样。从 `MaterialDef` 调和之后的结果，两条着色路径读同一份 */
export interface FillSpec {
  color: THREE.Color;
  roughness: number;
  metalness: number;
  clearcoat?: number;
  emissive?: THREE.Color;
  name: string;
}

/**
 * 色阶贴图：`TOON.bands` 每一级一个像素，**NearestFilter**。
 *
 * 陷阱：这张图是一组**乘数**，不是颜色。给它 sRGB 色彩空间的话 three 会把
 * 0.55 解码成 0.27，整具身体暗一倍 —— 而且看起来只是"灯没打够"，很难联想到贴图。
 * DataTexture 默认 `NoColorSpace`，这里只是把这件事写下来，别有人"顺手"改成 sRGB。
 */
let gradientMap: THREE.DataTexture | null = null;

function bandedGradient(): THREE.DataTexture {
  if (gradientMap) return gradientMap;
  const bands = TOON.bands.length ? TOON.bands : [1];
  const data = new Uint8Array(bands.length * 4);
  for (let i = 0; i < bands.length; i++) {
    const v = Math.round(Math.max(0, Math.min(1, bands[i]!)) * 255);
    data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, bands.length, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  tex.name = 'toon-bands';
  gradientMap = tex;
  return tex;
}

/** 只给 dispose 用 —— 色阶贴图是进程级共享的，最后一个 creature 走的时候才释放 */
export function disposeShading(): void {
  gradientMap?.dispose();
  gradientMap = null;
  for (const m of outlineMaterials.values()) m.dispose();
  outlineMaterials.clear();
}

/** 正面（填充）材质。`physical` 走原来那条路，一个参数都没改 */
export function createFillMaterial(shading: ShadingId, spec: FillSpec): THREE.Material {
  if (shading === 'toon') {
    const m = new THREE.MeshToonNodeMaterial({
      color: spec.color,
      // 生成的部件不保证是封闭实体，单面渲染会露出破洞（和 PBR 路径同一个理由）
      side: THREE.DoubleSide,
    });
    m.gradientMap = bandedGradient();
    if (spec.emissive) { m.emissive = spec.emissive; m.emissiveIntensity = 1; }
    m.name = spec.name;
    return m;
  }
  const phys = new THREE.MeshPhysicalMaterial({
    color: spec.color,
    roughness: spec.roughness,
    metalness: spec.metalness,
    side: THREE.DoubleSide,
  });
  if (spec.clearcoat) phys.clearcoat = spec.clearcoat;
  if (spec.emissive) { phys.emissive = spec.emissive; phys.emissiveIntensity = 1; }
  phys.name = spec.name;
  return phys;
}

/**
 * 反向外壳（inverted hull）描边材质：把网格沿法线外推一圈，只画背面。
 *
 * ## 为什么是反向外壳，不是屏幕空间的法线/深度边缘检测
 *
 * 屏幕空间那条路更"正确"（内部折边也能出线、线宽天然恒定），**但它是一个后期 pass**，
 * 而这件作品里后期是**可以被关掉的**：`?nopost=1` 会关，
 * 而且降级阶梯第 1 级（`shell/degrade.ts`）在掉帧时会自动把它翻掉。
 * 也就是说：机器一慢，「线」就悄悄变回一个白胖子 —— **身份在最需要它的时候消失。**
 * 一个物种的辨识度不该挂在一个会被自动关掉的开关上（P10：会在现场坏的方案不选）。
 * 反向外壳只是每个桶多一次 draw，和后期链、和 `stage.render()` 走哪条路完全无关。
 *
 * 代价老实写在这里：
 *  - 内部折边不出线，只有剪影出线。参考图要的就是剪影那一圈，够用。
 *  - 硬边（法线被拆开的顶点）处外壳会裂开、叠出更重的墨。躯干 / 四肢 / 头上
 *    **这一条不修**：实测 `spine` / `foot` / `hand` 各有上千个拆开的法线（最大 169°），
 *    而它们正是"形体交叠处墨变厚"的来源 —— 那是**有方向的**线，是这套语言要留的东西。
 *    把法线抹平会把这些一起削掉，所以**不做平滑法线**（那是"把它磨平"，不是"把它修好"）。
 *
 *    **手和脚是另一件事，已修**（2026-09-13）：同样宽的 12mm 外壳套在手和脚上时
 *    不再是"变粗的线"，而是**碎片** —— 一块白团上挂着几片脱落的黑渣，没有起笔收笔，
 *    读不出任何方向。判据就是这一句：**会变粗的是线，碎成片的是坏的。**
 *    修法是按槽位收窄墨（`TOON.outlineSlotScale`），**只收窄手和脚**；
 *    其余九个槽位乘 1，逐像素不变 —— 所以躯干的轮廓不会因此变得更"匀"。
 *    为什么不是按某个标量自动判，见 `tuning.ts` 的 `outlineSlotScale`。
 *  - draw call 翻倍（见 `creature.ts` 的 `stats.drawCalls`，那个数把外壳算进去了 ——
 *    HUD 上读到的必须是**真的提交了多少次**，不是我们希望是多少，P21）。
 *
 * ## 推挤为什么写在 `positionNode` 上
 *
 * `NodeMaterial.setupPosition()` 的顺序是：先 `instancedMesh(object)` 把实例矩阵
 * **写进** `positionLocal` / `normalLocal`，**然后**才 `positionLocal.assign(this.positionNode)`。
 * 所以在 `positionNode` 里拿到的这两个量已经是实例变换之后的，单位是 creature 组的米。
 * 好处正是这次要的：部件在 `attachMatrix` 里被**非均匀**缩放过（粗细一套、长度一套），
 * 若在这之前推挤，胖部件的线就粗、细部件的线就细 —— 而那种粗细差是"被缩放出来的"，
 * 不是"这件东西该有多重的墨"。
 * 反过来若用 `vertexNode`（three 自带 `toonOutlinePass` 的写法），整段顶点计算被接管，
 * 实例矩阵就丢了 —— 一整个桶的外壳会全部叠在原点。这是这个文件里最贵的一条信息。
 *
 * 全场只有一块：线宽是统一的（理由见 `tuning.ts` 的 `TOON`），墨色不随物种变，
 * 所以每个桶各建一块只是多几条一模一样的 GPU 管线。
 */
const outlineMaterials = new Map<string, THREE.MeshBasicNodeMaterial>();

/**
 * @param meters 这一块外壳推多远。缺省是全场那一个值；
 *               `手 / 脚`按 `TOON.outlineSlotScale` 收窄（见那一条的理由）。
 *
 * 按线宽缓存，不是按桶：`outlineSlotScale` 目前只有两档，所以全场最多两块外壳材质
 * （= 两条 GPU 管线）。**draw call 一次都没多** —— 外壳 mesh 的数量没变，
 * 换的只是其中几块挂的材质。
 */
export function createOutlineMaterial(meters: number = TOON.outlineMeters): THREE.MeshBasicNodeMaterial {
  const w = Number.isFinite(meters) ? Math.max(0, meters) : TOON.outlineMeters;
  const key = w.toFixed(5);
  const hit = outlineMaterials.get(key);
  if (hit) return hit;
  const c = TOON.outlineColor;
  const m = new THREE.MeshBasicNodeMaterial({
    color: new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace),
    // 外壳只画背面：正面被填充网格挡住，剩下能看见的正是剪影外那一圈
    side: THREE.BackSide,
  });
  m.positionNode = outlinePositionNode(w, TOON.outlineWeightVariation, TOON.outlineWeightFrequency);
  m.name = `toon-outline@${key}`;
  outlineMaterials.set(key, m);
  return m;
}

/**
 * 墨的轻重起伏写成一段**对"数"泛型的算式**：同一份代码，喂 JS 数字给测试量边界，
 * 喂 TSL 节点给着色器。于是测试量到的就是着色器算的，不是一份照抄的副本 ——
 * 副本会和本体各自漂，而这条的全部意义是"不许变粗"，漂不起。
 */
export interface InkOps<T> {
  num(v: number): T;
  add(a: T, b: T): T;
  mul(a: T, b: T): T;
  sin(a: T): T;
}

/**
 * 这一点的墨宽乘数，∈ [1 − amount, 1]。**只会变细。**
 *
 * `n` 是三支不同走向、不同疏密的正弦的平均，映到 [0,1]：
 * 两支主要沿主轴（y）走 —— 线沿着走向有轻重，这是手画线最先被认出来的那一点；
 * 一支绕着截面（x/z）走 —— 同一根肢体左右两条边的墨不一样重。
 * 频率比取无理数（黄金比）是为了不出现一眼看得出的周期。
 *
 * @param x,y,z 部件**自己**的几何坐标（规范化后主轴长 1），不是实例变换之后的
 */
export function inkWeight<T>(
  o: InkOps<T>, x: T, y: T, z: T, amount: number, cyclesPerPart: number,
): T {
  const f = o.num(2 * Math.PI * cyclesPerPart);
  const along1 = o.sin(o.add(o.mul(f, o.add(y, o.mul(o.num(0.35), x))), o.num(1.3)));
  const along2 = o.sin(o.add(o.mul(o.mul(f, o.num(1.618)), o.add(y, o.mul(o.num(-0.5), z))), o.num(4.1)));
  const around = o.sin(o.add(o.mul(o.mul(f, o.num(2.6)), o.add(x, z)), o.num(2.2)));
  // n = 0.5 + (s1+s2+s3)/6 ∈ [0,1]；乘数 = 1 − amount·n
  const n = o.add(o.num(0.5), o.mul(o.num(1 / 6), o.add(o.add(along1, along2), around)));
  return o.add(o.num(1), o.mul(o.num(-amount), n));
}

/** JS 数字那一份：测试和探针用 */
export const INK_NUMBERS: InkOps<number> = {
  num: (v) => v, add: (a, b) => a + b, mul: (a, b) => a * b, sin: Math.sin,
};

/* eslint-disable @typescript-eslint/no-explicit-any -- TSL 节点的静态类型在 r186 里是一张联合网，泛型走 any */
const INK_NODES: InkOps<any> = {
  num: (v) => float(v), add: (a, b) => add(a, b), mul: (a, b) => mul(a, b), sin: (a) => sin(a),
};

/**
 * 外壳的顶点位置。`amount` 不是正数时**原样返回原来那一句**（恒宽），
 * 不是乘一个 1 —— 关掉之后的着色器和 2026-09-14 之前逐字相同。
 */
export function outlinePositionNode(w: number, amount: number, cyclesPerPart: number): any {
  const a = Number.isFinite(amount) ? Math.min(0.9, amount) : 0;
  if (!(a > 0)) return positionLocal.add(normalLocal.normalize().mul(float(w)));
  // 起伏读的是 positionGeometry（部件自己的坐标），推挤仍然沿 positionLocal / normalLocal
  // （实例变换之后的）走 —— 两者分工见上面「推挤为什么写在 positionNode 上」
  const k = inkWeight(INK_NODES, positionGeometry.x, positionGeometry.y, positionGeometry.z, a, cyclesPerPart);
  return positionLocal.add(normalLocal.normalize().mul(float(w).mul(k)));
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * 把墨色推向一个颜色（`t` = 推多少，0 = 原样的墨）。给 `null` 或 0 就是复位。
 *
 * 这是第 IV 乐章的那一句（docs/41 §3）：**那条线不再是我们画的。**
 * 描边是"这是一张画"的标记 —— 它是**我们**替这具身体描的边。走到"他者"的时候，
 * 让这条线换成它自己的颜色，比让它消失更准：线还在（作品负责人要它普遍在），
 * 但它已经属于那个东西，不再属于我们的画法。
 *
 * 全场只有一两块外壳材质（按线宽缓存），所以这是一两个 uniform 的事，不重编译。
 */
export function setOutlineTint(rgb: readonly [number, number, number] | null, t: number): void {
  const k = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0;
  const c = TOON.outlineColor;
  const r = rgb && k > 0 ? c[0] + (rgb[0] - c[0]) * k : c[0];
  const g = rgb && k > 0 ? c[1] + (rgb[1] - c[1]) * k : c[1];
  const b = rgb && k > 0 ? c[2] + (rgb[2] - c[2]) * k : c[2];
  for (const m of outlineMaterials.values()) m.color.setRGB(r, g, b, THREE.SRGBColorSpace);
}

/** 这个槽位的墨该有多粗（米）。写死的两档来路见 `TOON.outlineSlotScale` */
export function outlineMetersFor(slot: string | null | undefined): number {
  const k = slot ? (TOON.outlineSlotScale as Record<string, number>)[slot] : undefined;
  return TOON.outlineMeters * (Number.isFinite(k) ? (k as number) : 1);
}
