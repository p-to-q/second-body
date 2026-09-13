/**
 * 环的那一个片元着色器 —— **整个画面只有这一个 draw call**。
 *
 * 环、卡片、卡片之间的丝、屏幕上下两条玻璃唇，全都是同一个有向距离场（SDF）
 * 里的形状，逐像素求值。数学移植自 Viscose-carousel 的
 * `components/shaders/planeShaders.js`（MIT，出处与授权判定见 `docs/35-VISCOSE.md`），
 * 从 GLSL 改写成 TSL —— **移植的是数学，不是它的技术栈**。
 *
 * ## 为什么非得是一个 SDF 才行
 *
 * 两个 `<img>` 永远不会融在一起，`filter: blur()` 凑出来的"融"一放大就露馅。
 * 但一旦每个形状都是一个**距离函数**而不是一个对象，"融合"就变成了算术：
 * 取两个距离的 min 得到硬边并集，取 **smooth min** 得到的接缝会鼓成一段圆角 ——
 * 靠得够近的两张卡于是成为一个连续的表面。`RING.goo` 那一个数就是"蜂蜜有多稠"。
 *
 * smin 只给出"融"，给不出"断"。所以丝是**自己的形状**（`sdBridge`），
 * 一条在两张卡之间扫出来的扁盒，四个属性跟着分离度 `v`（0 = 面贴着面，1 = 落到静止间距）走：
 * 宽度衰减、中间掐出颈、随距离下垂、以及最后那一条 `dissolve` ——
 * 把半径推到 0 以下，让丝**走出抗锯齿的范围**而不是细成半个像素然后消失。
 * 前者读作"断了"，后者读作"一根发丝闪了一下"。
 *
 * ## 和 GLSL 原版的差异（每一条都是被迫的，或者是被我们的约束要求的）
 *
 *  1. **不 discard、不用 alpha 混合**，直接在着色器里把 `uPage`（页面底色）合成进去。
 *     这一块画布就是这一页的背景，没有"后面还有别的东西"这回事；
 *     顺带也绕开了 WGSL 对 discard 之后求导数的那些不确定性。
 *  2. **色散那三次采样不放在 if 里**。WGSL 要求纹理采样处在一致控制流中，
 *     用 uniform 做条件虽然合法却脆。改成无条件三次采样：`uFringe * bend` 为 0 时
 *     三次采样落在同一个纹素上，画面**逐像素等价**，只多两次命中缓存的取样。
 *  3. **光标那枚玻璃标签没有移植**。它在上游是画在同一个 pass 里的（所以能反读
 *     身下的像素做反色）。我们的字必须是 ZKMSerendipity、必须中英并置
 *     （`docs/23 §0`、`ui/i18n.ts`），那要一整套字形图集 —— 抄过来就等于放弃我们的字。
 *     名字与 tagline 因此留在 DOM 层。见 `docs/35-VISCOSE.md`。
 *  4. 贴图**不再声明 NoColorSpace**：上游"读不解码、写不编码"是为了自己收口，
 *     我们走 three 的标准色管（图集标 sRGB、线性空间里算、渲染器负责编码）。
 */
import * as THREE from 'three/webgpu';
import type Node from 'three/src/nodes/core/Node.js';
import {
  Break, Continue, Fn, If, Loop, abs, clamp, cos, exp, float, floor, fwidth, max, min, mix,
  mod, pow, sign, sin, smoothstep, sqrt, texture, uniform, uniformArray, uv, vec2, vec3,
} from 'three/tsl';

type F = Node<'float'>;
type V2 = Node<'vec2'>;

/**
 * 一次能上场多少张卡 / 多少条丝。
 * 29 个物种是当前的花名册（docs/14），32 留一点余量；再多就该换成 storage buffer，
 * 而不是把这个数字往上推 —— uniform 数组是有代价的。
 */
export const MAX_PLANES = 32;
export const MAX_LINKS = 32;

/**
 * 建一组初值合理的 uniform，外加 CPU 这一侧那几个**被复用的**向量数组。
 *
 * 类型是**推出来的**（见文件末 `RingUniforms`）而不是手写的：手写一遍
 * `ReturnType<typeof uniform>` 会把 `.x` / `.value` 的具体类型全丢掉，
 * 于是着色器里每一次取分量都要加一次断言 —— 那种类型不如没有。
 */
export function createRingUniforms() {
  const pos = Array.from({ length: MAX_PLANES }, () => new THREE.Vector2());
  const rot = Array.from({ length: MAX_PLANES }, () => 0);
  const scale = Array.from({ length: MAX_PLANES }, () => new THREE.Vector4(0, 0, 1, 0));
  const linkA = Array.from({ length: MAX_LINKS }, () => new THREE.Vector2());
  const linkB = Array.from({ length: MAX_LINKS }, () => new THREE.Vector2());
  const linkPar = Array.from({ length: MAX_LINKS }, () => new THREE.Vector4(-100, -100, 0, 0));

  const u = {
    resolution: uniform(new THREE.Vector2(1, 1)),
    /** 卡片静止尺寸 px（长边 × 短边） */
    size: uniform(new THREE.Vector2(100, 50)),
    radius: uniform(6),
    count: uniform(0),
    pos: uniformArray<'vec2'>(pos, 'vec2'),
    rot: uniformArray<'float'>(rot, 'float'),
    /** xy = 各轴 0..1 的出生缩放，z = 明暗（1 亮 0 黑），w = 图集第几格 */
    scale: uniformArray<'vec4'>(scale, 'vec4'),
    linkCount: uniform(0),
    linkA: uniformArray<'vec2'>(linkA, 'vec2'),
    linkB: uniformArray<'vec2'>(linkB, 'vec2'),
    /** (两端半径, 颈部半径, 下垂, 圆角) */
    linkPar: uniformArray<'vec4'>(linkPar, 'vec4'),
    k: uniform(0),
    wobble: uniform(0),
    time: uniform(0),
    /**
     * 无图时的纯色（展签背后那一团），以及页面底色。
     * **存的是线性值**，不是 THREE.Color：色管走 three 的标准路线
     * （sRGB 字符串 → `THREE.Color` 转成线性 → 这里 → 渲染器负责编码回 sRGB），
     * 转换发生在 `field.ts` 的 `readPaper()` 一处，着色器里只管算。
     */
    color: uniform(new THREE.Vector3(0.02, 0.023, 0.028)),
    /**
     * 把卡片形状按回圆的程度，0..1。见着色器里用到它的那一处。
     * 它是**展签那一段专用**的，入场一开始就被 `launch` 淡回 0。
     */
    round: uniform(0),
    page: uniform(new THREE.Vector3(0.004, 0.005, 0.006)),
    grid: uniform(new THREE.Vector2(1, 1)),
    blend: uniform(1),
    textured: uniform(0),
    /** 光标 xy px、存在度 0..1、在光标处额外加的融合 px */
    mouse: uniform(new THREE.Vector4()),
    /** 影响半径 px、尾波振幅 px、尾波频率、尾波速度 */
    melt: uniform(new THREE.Vector4()),
    bandTop: uniform(0),
    bandBottom: uniform(0),
    /** 折射 px、挤压、波纹 px、波纹频率 */
    glass: uniform(new THREE.Vector4()),
    fringe: uniform(0),
    sheen: uniform(0),
  };
  return { u, pos, rot, scale, linkA, linkB, linkPar };
}

export type RingUniforms = ReturnType<typeof createRingUniforms>['u'];

// ── SDF 小工具 ──────────────────────────────────────────────────────────────

/**
 * smooth minimum —— **让这些形状读作液体的就是这一个函数**。
 * 注意它在 `a` 还是 1e6 那个哨兵值时退化成普通的 min，所以循环不需要特判第一张卡。
 */
const smin = Fn(([a, b, k]: [F, F, F]) => {
  const kk = max(k, float(0.0001));
  const h = clamp(float(0.5).add(b.sub(a).mul(0.5).div(kk)), 0, 1).toVar();
  return mix(b, a, h).sub(kk.mul(h).mul(float(1).sub(h)));
});

const sdRoundBox = Fn(([p, b, r]: [V2, V2, F]) => {
  const q = abs(p).sub(b).add(r).toVar();
  return min(max(q.x, q.y), 0).add(max(q, vec2(0, 0)).length()).sub(r);
});

/**
 * 两张卡之间的那条糖浆：一条从中心扫到中心的扁盒，宽度等于它离开的那条边，
 * 中间掐细，并随自重下垂。
 *
 * **故意不是 capsule。** capsule 的截面是圆的，完全融合时会从卡片平直的侧面鼓出去；
 * 扫成盒就一直待在卡片内部，剪影读作一张完整的平卡。
 */
const sdBridge = Fn(([p, a, b, rEnd, rMid, sag]: [V2, V2, V2, F, F, F]) => {
  const ba = b.sub(a).toVar();
  const len = max(ba.length(), float(0.001)).toVar();
  const dir = ba.div(len).toVar();
  const nrm = vec2(dir.y.negate(), dir.x).toVar();

  const q = p.sub(a.add(b).mul(0.5)).toVar();
  const along = q.dot(dir).toVar();
  const across = q.dot(nrm).toVar();

  const h = clamp(along.div(len).add(0.5), 0, 1);
  const bell = sin(h.mul(Math.PI)).toVar();     // 两端 0，中间 1

  // 下垂：世界 -Y，投到法线轴上
  const acrossSag = across.add(sag.mul(bell).mul(nrm.y));

  const taper = pow(float(1).sub(bell), 1.7);   // 两端 1，中间 0
  const r = mix(rMid, rEnd, taper);

  // 两端是方的，而且埋在卡片里面，所以永远露不出来
  const outside = max(abs(along).sub(len.mul(0.5)), abs(acrossSag).sub(r));
  // 两点重合时（出生时所有卡都叠在种子上）给哨兵值，等于这条丝不存在
  return ba.length().lessThan(0.001).select(float(1e6), outside);
});

/**
 * 玻璃唇：屏幕上下两条带，像一片厚玻璃的圆边。
 * 因为**整个场都是从 p 求值的**，在这里把 p 掰弯，卡片和糖浆就一起被折射了 ——
 * 不需要第二个 pass，也不需要 render target。
 *
 * 返回 (掰弯后的 p.x, p.y, 这个像素陷进唇里多深 0..1)。
 */
function glassBend(u: RingUniforms, p: V2) {
  return Fn(() => {
    const px = p.x.toVar();
    const py = p.y.toVar();
    const bend = float(0).toVar();

    const band = p.y.greaterThan(0).select(u.bandTop, u.bandBottom).toVar();
    If(band.greaterThan(0.5), () => {
      const dy = abs(p.y).sub(u.resolution.y.mul(0.5).sub(band)).toVar();
      If(dy.greaterThan(0), () => {
        const t = clamp(dy.div(band), 0, 1).toVar();
        // 圆弧剖面：内沿几乎不弯，到最边上陡然落下 —— 这才读作"厚度"而不是一道渐变
        bend.assign(float(1).sub(sqrt(max(float(0), float(1).sub(t.mul(t))))));
        const s = sign(p.y);
        // 往画面中心采样 = 把内容甩向外侧，于是图像向唇里拉长并在边缘胀大。
        // 两项都是有符号的：给负数就等于把唇翻过来，改成压缩。
        py.assign(p.y.sub(s.mul(bend).mul(u.glass.x.add(sin(p.x.mul(u.glass.w)).mul(u.glass.z)))));
        px.assign(p.x.mul(float(1).sub(bend.mul(u.glass.y))));
      });
    });
    return vec3(px, py, bend);
  })();
}

/** 图集取样：把一格里的局部 uv 换算成整张图集的 uv */
function atlasUV(u: RingUniforms, local: V2, idx: F) {
  const col = mod(idx, u.grid.x);
  const row = floor(idx.div(u.grid.x));
  return vec2(col, row).add(local).div(u.grid);
}

// ── 主体 ────────────────────────────────────────────────────────────────────

/**
 * 造出那一块全屏矩形的材质。
 *
 * 输出是**不透明**的：底色已经在着色器里合成进去了（见文件头第 1 条）。
 */
export function createRingMaterial(u: RingUniforms, atlas: THREE.Texture): THREE.NodeMaterial {
  const color = Fn(() => {
    // 屏幕坐标，px，原点在屏幕中心，+y 向上 —— 着色器全程用这个空间，
    // CPU 那边（field.ts）也用同一个，所以没有任何一处需要换算两次。
    const ps = uv().sub(0.5).mul(u.resolution).toVar();

    const bent = glassBend(u, ps).toVar();
    const p = bent.xy.toVar();
    const bend = bent.z.toVar();

    // 在掰弯之后读光标：它于是和环处在同一个被折射的空间里 ——
    // 光标被拖进唇里时，它的影响也跟着一起折射，而不是平铺在上面。
    const toMouse = p.sub(u.mouse.xy).length().toVar();

    // 融合强度在光标周围抬高：环**只在被碰到的地方**变软，别处照旧是硬的。
    // 每像素解一次，不是每卡解一次 —— 代价只有一个 length()。
    const k = float(u.k).toVar();
    If(u.mouse.z.greaterThan(0.001), () => {
      const t = float(1).sub(smoothstep(0, max(u.melt.x, float(1)), toMouse)).toVar();
      k.addAssign(u.mouse.w.mul(u.mouse.z).mul(t).mul(t));
    });

    const d = float(1e6).toVar();

    // 离这个像素最近的两张卡，跟着场一起记下来，颜色于是不需要第二个 pass。
    // 两张卡之间的糖浆里两张都很近 —— 那正是该做交叉淡化的地方。
    const d0 = float(1e6).toVar();
    const d1 = float(1e6).toVar();
    const uv0 = vec2(0.5, 0.5).toVar();
    const uv1 = vec2(0.5, 0.5).toVar();
    const im0 = float(0).toVar();
    const im1 = float(0).toVar();
    const dm0 = float(1).toVar();
    const dm1 = float(1).toVar();

    const halfSpan = u.size.length().mul(0.5).toVar();

    Loop(MAX_PLANES, ({ i }) => {
      If(float(i).greaterThanEqual(u.count), () => { Break(); });

      const st = u.scale.element(i).toVar();
      const sc = st.xy.toVar();
      const grown = max(sc.x, sc.y).toVar();
      If(grown.lessThanEqual(0.0001), () => { Continue(); });

      const q = p.sub(u.pos.element(i)).toVar();
      // 比这还远的卡不可能影响到这个像素，直接跳过 —— **32 张卡付得起就靠这一条**。
      // 用卡片自己的尺寸算而不是一个定值：光标下胀大的卡伸得更远，它周围的软化也是。
      const cull = halfSpan.mul(grown).add(k).add(u.wobble).add(8).toVar();
      If(q.dot(q).greaterThan(cull.mul(cull)), () => { Continue(); });

      // 换进卡片自己的坐标系
      const a = u.rot.element(i).toVar();
      const ca = cos(a);
      const sa = sin(a);
      const ql = vec2(q.x.mul(ca).add(q.y.mul(sa)), q.x.negate().mul(sa).add(q.y.mul(ca))).toVar();

      const halfSize = max(u.size.mul(0.5).mul(sc), vec2(0.0001, 0.0001)).toVar();

      // 出生时是个圆（半径 = 半边长），长大过程中松弛成圆角矩形
      const rMax = min(halfSize.x, halfSize.y).toVar();
      const relaxed = mix(rMax, u.radius, smoothstep(0.3, 1.0, min(sc.x, sc.y))).toVar();
      // `u.round` 把它按回圆的那一头。**只有展签那一段会用到**：
      // 那时候场上只有一张卡，而一张卡解不出黏稠 —— 糖浆是两张卡之间的事。
      // 一张长大完的卡就是一块圆角矩形，在白底上慢慢斜着转，读起来是块板砖，
      // 不是"有个东西在里面"。按回圆之后它才是一团**质量**；
      // 转动仍然看得见，因为 wobble 那点表面张力抖动不是各向同性的。
      const r = min(rMax, mix(relaxed, rMax, u.round)).toVar();

      const di = sdRoundBox(ql, halfSize, r).toVar();
      d.assign(smin(d, di, k));

      // 局部 uv。夹紧，好让卡片外面的糖浆带着**这张卡边缘的颜色**，
      // 而不是重复采样或者串到图集的下一格去。
      const raw = ql.div(halfSize.mul(2)).add(0.5);
      const luv = clamp(vec2(raw.x, float(1).sub(raw.y)), 0.004, 0.996).toVar();

      If(di.lessThan(d0), () => {
        d1.assign(d0); uv1.assign(uv0); im1.assign(im0); dm1.assign(dm0);
        d0.assign(di); uv0.assign(luv); im0.assign(st.w); dm0.assign(st.z);
      }).ElseIf(di.lessThan(d1), () => {
        d1.assign(di); uv1.assign(luv); im1.assign(st.w); dm1.assign(st.z);
      });
    });

    // 相邻卡分开时之间挂着的丝
    Loop(MAX_LINKS, ({ i }) => {
      If(float(i).greaterThanEqual(u.linkCount), () => { Break(); });

      const par = u.linkPar.element(i).toVar();
      // 半径允许为负：那把丝的场整体抬离表面，于是它淡出，而不是卡在 0 变成
      // 一根盖住半个像素的发丝。只有当它远到抗锯齿都够不着时才真的跳过。
      If(par.x.lessThanEqual(-3.0), () => { Continue(); });

      const a = u.linkA.element(i).toVar();
      const b = u.linkB.element(i).toVar();
      const mid = a.add(b).mul(0.5).toVar();
      const reach = b.sub(a).length().mul(0.5).add(par.x).add(par.w).add(8).toVar();
      const dm = p.sub(mid).toVar();
      If(dm.dot(dm).greaterThan(reach.mul(reach)), () => { Continue(); });

      d.assign(smin(d, sdBridge(p, a, b, par.x, par.y, par.z), par.w));
    });

    // 表面张力的抖动，衰减到 0 —— 静止的卡片必须是死平的
    If(u.wobble.greaterThan(0.001), () => {
      // 上游用的是 simplex noise（Ashima / Gustavson，MIT）。这里换成两条正弦的乘积：
      // 它同样是**无方向、随时间漂移**的低频扰动，而这个扰动只在出生那一秒可见、
      // 幅度 3px —— 为这一秒搬一份第三方噪声进来不值得（AGENTS.md 依赖纪律）。
      const n = sin(p.x.mul(0.013).add(u.time.mul(0.22)))
        .mul(sin(p.y.mul(0.011).sub(u.time.mul(0.17))));
      d.addAssign(n.mul(u.wobble));
    });

    // 光标拖出来的毛细尾波，振幅由它移动得多快决定。
    // 以和"软化"同一个半径散开并死去，所以一次快速划过会在表面留下一圈
    // 比这个动作本身活得更久的涟漪。
    If(u.melt.y.greaterThan(0.001), () => {
      d.addAssign(
        sin(toMouse.mul(u.melt.z).sub(u.time.mul(u.melt.w)))
          .mul(u.melt.y)
          .mul(exp(toMouse.div(max(u.melt.x, float(1))).negate())),
      );
    });

    // 夹紧而不只是取下限：上面那条距离剔除在场里留下一个台阶，
    // 不夹的话 fwidth 跨过台阶会沿着每一条剔除边界画出一道半透明的轮廓线。
    const aa = clamp(fwidth(d), 0.5, 2.0).toVar();
    const alpha = float(1).sub(smoothstep(aa.negate(), aa, d)).toVar();

    // 最近的两张卡等距时各占一半，超出 uBlend 就解析成明显更近的那一张。
    // 图和明暗都骑在它上面，所以谁都没法在糖浆中间留下一道缝。
    const nearest = smoothstep(u.blend.negate(), u.blend, d1.sub(d0)).toVar();

    const col = vec3(u.color).toVar();
    If(u.textured.greaterThan(0.5), () => {
      // 色散：越陷进玻璃唇里，三个通道分得越开。bend 为 0 时三次采样落在同一个
      // 纹素上 —— 所以这里没有分支（见文件头第 2 条）。
      const fr = vec2(u.fringe.mul(bend).div(max(u.size.x, float(1))), 0).toVar();
      const c0 = vec3(
        texture(atlas, atlasUV(u, uv0.add(fr), im0)).r,
        texture(atlas, atlasUV(u, uv0, im0)).g,
        texture(atlas, atlasUV(u, uv0.sub(fr), im0)).b,
      );
      const c1 = vec3(
        texture(atlas, atlasUV(u, uv1.add(fr), im1)).r,
        texture(atlas, atlasUV(u, uv1, im1)).g,
        texture(atlas, atlasUV(u, uv1.sub(fr), im1)).b,
      );
      col.assign(mix(c1, c0, nearest));
    });

    // 站在被指着的那张旁边的卡被调暗，于是那一张读作"被拿起来的"而不只是"高亮的"
    col.mulAssign(mix(dm1, dm0, nearest));

    // 唇最陡的地方提一点亮，让那条带读作一个正在接光的表面，而不只是一次扭曲
    col.addAssign(bend.mul(u.sheen));

    // 不透明输出：这块画布就是这一页的背景
    return mix(u.page, col, alpha);
  });

  const material = new THREE.NodeMaterial();
  material.colorNode = color();
  material.depthTest = false;
  material.depthWrite = false;
  material.transparent = false;
  material.toneMapped = false;
  return material;
}
