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
import { float, normalLocal, positionLocal } from 'three/tsl';

/**
 * 描边 / 平涂的三个旋钮。
 *
 * ⚠️ **它们本该在 `packages/core/src/tuning.ts`** —— AGENTS.md 的不变量写着
 * 「每一个可调的数都住在 tuning.ts，调在别处就是放错了地方」，而这三个数正是现场要调的。
 * 放在这里只有一个理由，而且是一个临时理由：写这一版时 `tuning.ts` 正被另一条线
 * 在同一个工作树里改（docs/15 §6 的并行纪律，P20），维护者明确要求这条线不要碰它。
 *
 * > **交接**：下一个动这个文件的人，把这个 `TOON` 整块搬进 `tuning.ts`
 * > （放在 `PALETTE` 之后、`FOOT` 之前），这里改成 import。搬完删掉这段注释。
 *
 * 单位：线宽是**米**，和 tuning.ts 其余部分一致 —— 不是像素。
 * 为什么是米而不是屏幕空间的恒定像素，见下面 `createOutlineMaterial` 的说明。
 * 1.7m 标准身材上 12mm 约等于参考图里那一圈墨线的粗细。
 */
export const TOON = {
  /** 反向外壳沿法线外推多少米。再粗会在细手指处糊成一团，再细在 1440p 上读不出来 */
  outlineMeters: 0.012,
  /** 墨色。不是纯黑：纯黑在深空场景里会和背景连成一片，轮廓反而消失 */
  outlineColor: [0.06, 0.055, 0.06] as [number, number, number],
  /**
   * 平涂的色阶。**3 级，不是连续的 Lambert** —— 两级太像开关，四级以上就看不出是平涂了。
   * 值是"这一级有多亮"的乘数，喂给 MeshToonNodeMaterial 的 gradientMap。
   */
  bands: [0.55, 0.78, 1.0] as readonly number[],
};

/** `physical` = 此前所有物种走的那条 PBR 路径；`toon` = 平涂 + 反向外壳描边 */
export type ShadingId = 'physical' | 'toon';

export const SHADING_IDS: readonly ShadingId[] = ['physical', 'toon'];

/**
 * 物种 → 着色语言。**没有写在这里的物种一律 `physical`，一个像素都不变。**
 * 这是这次改动最重要的一条：描边是 opt-in 的，不是新的默认。
 */
export const SHADING_OF_THEME: Readonly<Record<string, ShadingId>> = {
  // 线 —— 它是被画出来的，不是被造出来的。见 `factory/recipes/invited.ts` 的那一条
  'char.line': 'toon',
};

export function isShadingId(v: unknown): v is ShadingId {
  return typeof v === 'string' && (SHADING_IDS as readonly string[]).includes(v);
}

/**
 * 这一具身体用哪种着色语言。
 * @param override 控件条 / `?shading=` 给的强制值；`null` = 按物种自己的声明走。
 */
export function resolveShading(themeId: string | null | undefined, override?: ShadingId | null): ShadingId {
  if (override) return override;
  return (themeId && SHADING_OF_THEME[themeId]) || 'physical';
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
 *  - 硬边（法线被拆开的顶点）处外壳会裂开一道缝。归一化过的部件基本是光滑的，
 *    真遇上了把 `TOON.outlineMeters` 调小，不要去改几何。
 *  - draw call 翻倍（见 `creature.ts` 的 `stats.drawCalls`，那个数把外壳算进去了 ——
 *    HUD 上读到的必须是**真的提交了多少次**，不是我们希望是多少，P21）。
 *
 * ## 推挤为什么写在 `positionNode` 上
 *
 * `NodeMaterial.setupPosition()` 的顺序是：先 `instancedMesh(object)` 把实例矩阵
 * **写进** `positionLocal` / `normalLocal`，**然后**才 `positionLocal.assign(this.positionNode)`。
 * 所以在 `positionNode` 里拿到的这两个量已经是实例变换之后的，单位是 creature 组的米。
 * 好处正是这次要的：部件在 `attachMatrix` 里被**非均匀**缩放过（粗细一套、长度一套），
 * 若在这之前推挤，胖部件的线就粗、细部件的线就细 —— 一具身体上会出现几种不同粗的墨线。
 * 反过来若用 `vertexNode`（three 自带 `toonOutlinePass` 的写法），整段顶点计算被接管，
 * 实例矩阵就丢了 —— 一整个桶的外壳会全部叠在原点。这是这个文件里最贵的一条信息。
 */
export function createOutlineMaterial(): THREE.MeshBasicNodeMaterial {
  const c = TOON.outlineColor;
  const m = new THREE.MeshBasicNodeMaterial({
    color: new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace),
    // 外壳只画背面：正面被填充网格挡住，剩下能看见的正是剪影外那一圈
    side: THREE.BackSide,
  });
  m.positionNode = positionLocal.add(normalLocal.normalize().mul(float(TOON.outlineMeters)));
  m.name = 'toon-outline';
  return m;
}
