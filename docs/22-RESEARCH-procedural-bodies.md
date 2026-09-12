# 22 · 调研：程序化身体（把「流过身体的物质」拿回来）

> docs/18 §2 B 档的四种表达（`mass`/`swarm`/`ribbon`/`fur`）在 three r186 `WebGPURenderer` + TSL 下怎么做。
> 预算 1440p/60fps、≤250k 三角、≤40 draw call、CPU ≤4ms/帧（`core/src/tuning.ts` `BUDGET`）；
> 输入只有每帧 17 根骨头（`Bone{p0,p1,length,roll,confidence}`）。本地 three = **0.186.0**。

## 四种表达的对比

| 表达 | 实现路径 | 顶点/粒子规模 | draw call | 帧代价（实测/估算） | 难度 | 像不像原作 |
|---|---|---|---|---|---|---|
| **mass**（CPU MC） | `three/addons/objects/MarchingCubes.js`，每根骨头撒 5 个球 → 85 球 | res=40 → **10.4k tri**（res=32 → 6.6k） | **1** | **CPU 2.43ms**（res32 1.68ms / res48 4.03ms），GPU≈0 | 低 | ★★★★★ 团块、会融合、会拉丝 |
| **mass**（raymarch SDF） | 全屏 quad + TSL `Loop`/`Break`，17 个 capsule SDF + smin | 0 顶点（像素级） | 1 | 1440p×~64 step×17 SDF ≈ 4G ALU/帧 → **半分辨率才现实** | 中 | ★★★★★ 但不和现有光照/深度合成 |
| **swarm** | TSL compute：`instancedArray` 粒子 + `uniformArray` 骨段吸引子 | 100k sprite = **200k tri**（贴预算上限） | 1（`InstancedMesh`+`SpriteNodeMaterial`） | 1 dispatch(100k) ≈ 0.2ms GPU；CPU ≈ 0 | 中 | ★★★★ 只对 `field` 那一路对味 |
| **ribbon** | 静态管状拓扑 + `positionNode` 在顶点着色器里按骨线摆放 | 17×(8环×12边) ≈ **3.3k tri** | 1 | 可忽略；**不要**每帧重建 `TubeGeometry` | 低 | ★★★ 偏「布 / 飘带」 |
| **fur** | 壳层：`InstancedMesh(mass 的几何, N 壳)`，`positionNode` 沿法线外推 | 16 壳 × 10k = **160k tri** | **1** | 16× 过绘制，1440p 下 alpha-test 填充率是瓶颈 | 中高 | ★★★★ 但**必须先有 mass** |

实测来自本机 Node 跑 `MarchingCubes`（纯 JS，和 Chrome 同一个 V8），85 球 / 60 帧平均：
res24 0.84ms、res32 1.68ms、res40 2.43ms、res48 4.03ms、res64 9.20ms；17 球时 res40 只要 1.23ms / 2.7k tri。
**res=40、每骨 5 球是甜点。**

## 推荐先做哪一个

**`mass`，用官方 `MarchingCubes` addon 的 CPU 路线。** 理由：

1. **投入产出比**：一个文件约 120 行、不写一行 shader，就把 coral/xeno/dumpling 三条从「手办」变成「物质」。
2. **代价已知且可调**：res 就是一个旋钮，2.43ms→1.68ms 只需把 40 改成 32。
3. **零 TSL 风险**：输出普通 `BufferGeometry`，WebGL2 回退下一样能跑；raymarch/compute 的回退坑见下文。
4. **它是 fur 的地基**：壳层毛必须长在连续表面上，先 mass 再 fur，顺序不能反。

raymarch SDF 更美，但画在全屏 quad 上，**不参与现有 `MeshPhysicalNodeMaterial` 的光照与深度**，先不做。

### 可以照着写的骨架

`packages/app/src/creature/mass.ts`（新文件，不动 `creature.ts`）：

```ts
import * as THREE from 'three/webgpu';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { positionWorld, time, mx_noise_float, mix, color, vec3 } from 'three/tsl';
import type { Presence, Skeleton } from '../../../core/src/types.ts';

const RES = 40;             // 实测 2.43ms/帧 @85 球；吃紧就降到 32
const MAX_POLY = 16_000;    // 缓冲区别开太大，needsUpdate 会整块上传
const BALLS_PER_BONE = 5;

export function createMassBody() {
  const material = new THREE.MeshPhysicalNodeMaterial({
    roughness: 0.35, metalness: 0.05, side: THREE.FrontSide,
  });
  // 让表面读起来像"流动的物质"而不是黏土：三维噪声随时间在世界坐标里漂
  const flow = mx_noise_float(positionWorld.mul(3.0).add(vec3(0, time.mul(0.35), 0)));
  material.colorNode = mix(color(0x2b2f3a), color(0xc9d1dc), flow.mul(0.5).add(0.5));

  const mc = new MarchingCubes(RES, material, false, false, MAX_POLY);
  mc.isolation = 60;
  mc.frustumCulled = false;          // 场域跟着人跑，交给 three 算只会误剔（同 creature.ts）
  mc.castShadow = true;

  const box = new THREE.Box3(), size = new THREE.Vector3(), center = new THREE.Vector3();
  const p = new THREE.Vector3();
  const object = new THREE.Group(); object.add(mc);

  function pose(sk: Skeleton, pres: Presence, _dt: number) {
    // 1. 把骨架塞进 MarchingCubes 的单位立方体：字段坐标是 0..1，几何是 -1..1
    box.makeEmpty();
    for (const b of sk.bones) {
      box.expandByPoint(p.fromArray(b.p0));
      box.expandByPoint(p.fromArray(b.p1));
    }
    box.getSize(size); box.getCenter(center);
    const half = Math.max(size.x, size.y, size.z) * 0.5 + 0.35;  // 给团块半径留边
    mc.position.copy(center); mc.scale.setScalar(half);

    // 2. 撒球。半径公式来自 MarchingCubes.js:570 的注释：radius² = strength / subtract
    const alive = pres.state === 'ENTERING' ? pres.transition
      : pres.state === 'LEAVING' ? 1 - pres.transition : pres.state === 'IDLE' ? 0 : 1;
    mc.reset();
    if (alive <= 0.001) { mc.update(); return; }
    const inv = 1 / (2 * half);                     // 世界米 → 0..1 字段坐标
    for (const b of sk.bones) {
      const rWorld = 0.075 * b.length * 3.0 * alive; // 团块粗细：按骨长走
      const rField = Math.max(0.02, rWorld * inv);
      const strength = 0.5 * b.confidence;
      const subtract = strength / (rField * rField);
      for (let k = 0; k < BALLS_PER_BONE; k++) {
        const t = k / (BALLS_PER_BONE - 1);
        const x = (b.p0[0] + (b.p1[0] - b.p0[0]) * t - center.x) * inv + 0.5;
        const y = (b.p0[1] + (b.p1[1] - b.p0[1]) * t - center.y) * inv + 0.5;
        const z = (b.p0[2] + (b.p1[2] - b.p0[2]) * t - center.z) * inv + 0.5;
        mc.addBall(x, y, z, strength, subtract);
      }
    }
    mc.update();

    // 3. 只上传真正写过的那一段。MarchingCubes 自己不设 updateRange，
    //    默认会把整个 MAX_POLY 缓冲区推一遍（WebGPUAttributeUtils.js:225）。
    for (const name of ['position', 'normal'] as const) {
      const a = mc.geometry.getAttribute(name) as THREE.BufferAttribute;
      a.clearUpdateRanges();
      a.addUpdateRange(0, mc.count * 3);
    }
  }

  return { object, pose, dispose: () => { mc.geometry.dispose(); material.dispose(); } };
}  // → 满足 docs/18 §3 的 BodyInstance 形状
```

`swarm` 的核心 TSL（等真要做时照抄 `webgpu_tsl_compute_attractors_particles`，把「点吸引子」换成「线段吸引子」）：

```ts
import { Fn, Loop, instancedArray, uniformArray, instanceIndex, vec3, float } from 'three/tsl';
const bonePts = uniformArray(Array.from({ length: 34 }, () => new THREE.Vector3()), 'vec3'); // p0,p1 交错
const boneConf = uniformArray(new Array(17).fill(0), 'float');
const pos = instancedArray(COUNT, 'vec3'), vel = instancedArray(COUNT, 'vec3');
const update = Fn(() => {
  const p = pos.element(instanceIndex), v = vel.element(instanceIndex);
  const force = vec3(0).toVar();
  Loop(17, ({ i }) => {                       // 17 是编译期常量，别用 uniform 当上界
    const a = bonePts.element(i.mul(2)), b = bonePts.element(i.mul(2).add(1));
    const ab = b.sub(a);
    const t = ab.dot(p.sub(a)).div(ab.dot(ab).max(1e-4)).clamp(0, 1);
    const to = a.add(ab.mul(t)).sub(p);        // 粒子 → 骨段最近点
    const d = to.length().max(0.02);
    force.addAssign(to.div(d).mul(boneConf.element(i)).div(d.mul(d).add(0.05)));
  });
  v.addAssign(force.mul(dt)); v.mulAssign(float(0.94)); p.addAssign(v.mul(dt));
})().compute(COUNT);
// 每帧：写 bonePts.array[i].set(...)（自动上传，见下），然后 renderer.compute(update)
```

## 每种的证据

- **mass / CPU**：`node_modules/three/examples/jsm/objects/MarchingCubes.js`。
  `addBall` 取 0..1 字段坐标（:541），`update()` 全网格扫描后 `setDrawRange(0, count)`（:940）。
  本机实测数据见上表 —— 证明 res≤48、85 球在 4ms CPU 预算内。
- **mass / raymarch**：three 官方 `examples/jsm/tsl/utils/Raymarching.js` 提供 `RaymarchingBox(steps, cb)`
  （box 内 ray march，用在 `webgpu_volume_cloud` / `webgpu_volume_perlin`）。
  可移植的 smin/SDF/法线 TSL 写法见 Codrops《Liquid Raymarching with TSL》（**注意它是 r168，
  `timerLocal`→`time`、`viewportResolution`→`screenSize` 已改名，照抄编译不过**）。
- **swarm**：three example **`webgpu_tsl_compute_attractors_particles`** —— 它就是
  「`uniformArray` 吸引子 + `Loop` 累加力 + `instancedArray` 位置/速度 + `SpriteNodeMaterial`
  以 `positionBuffer.toAttribute()` 渲染」这套骨架，只差把点换成线段。
  **`webgpu_compute_particles`** 证明规模：`const particleCount = 200000;`，一个 `renderer.compute()` + 一次 draw。
- **ribbon**：`three/examples/jsm/lines/webgpu/Line2.js` + `Line2NodeMaterial`（`NodeMaterials.js:8`）是现成的胖线；
  但 `LineSegmentsGeometry.setPositions()`（:97）每次新建 `InstancedInterleavedBuffer`，逐帧调用即逐帧重分配。
- **fur**：**没找到** three.js 官方或 pmndrs 生态里现成的 WebGPU/TSL shell fur 实现。
  最近的可用积木是 `webgpu_instance_uniform`（`InstancedMesh` + 逐实例 node）：
  把 N 层壳做成 N 个实例、在 `positionNode` 里按 `instanceIndex/N` 沿 `normalLocal` 外推，
  即可 1 draw call 出 N 层。这条要自己写。
- **raymarcher 参考**：`danielesteban/three-raymarcher`（GitHub）有 box/capsule/sphere + union/blend，
  但是 **WebGL** 实现，只能当算法参考。

## 对我们架构的影响

- **`Skeleton` 不用改。** `Bone{p0,p1,length,roll,confidence}` 对 mass / swarm / ribbon 都够用：
  团块半径从 `length` 推、权重从 `confidence` 推、切向就是 `p1-p0`。
  `types.ts` 顶上写着「FROZEN CONTRACT，只允许新增可选字段」—— 本方案**不触碰它**。
  以后若要逐骨粗细曲线，加一个 `radius?: number` 是合法的可选新增，但现在不需要。
- **ribbon 唯一的额外需求**是沿骨链的稳定法向帧（否则带子绕轴抖）。这个**不要**进 `Skeleton`：
  在 body plan 模块内用平行传输从上一帧递推即可。`roll` 现在恒为 0（docs/04 §5），别指望它。
- **需要一个新接口 `BodyInstance`**（docs/18 §3）：把 `creature.ts` 已有的
  `{ object, pose(sk,p,dt), stats, dispose() }` 抽出来，`Creature extends BodyInstance` 再加 `remorph/graft`。
  纯提取，`creature.ts` 一行逻辑都不用动。
- **预算账**：mass 占 1 draw call + 10k tri + 2.4ms CPU。现在刚体路线是 ≤40 draw / 64 实例；
  mass 是**替换**而不是叠加（`bodyPlan: 'mass'` 的条目不实例化刚体件），所以总账只会变轻。

## TSL 的坑（WebGL2 回退时会静默失效或变慢）

1. **`workgroupBarrier()` / `storageBarrier()` 在 WebGL 后端被编译成一行注释** ——
   `three/src/nodes/gpgpu/BarrierNode.js:49`：`if (renderer.backend.isWebGLBackend) builder.addFlowCode('// ...')`。
   任何依赖 workgroup 共享内存的算法（前缀和、bitonic sort、邻域网格）在回退时**结果错误且不报错**。
   → swarm 只写「每个粒子独立读骨线」的形式，不要写粒子间交互。
2. **WebGL 的 "compute" 是 transform feedback**（`webgl-fallback/WebGLBackend.js:950-982`，
   `beginTransformFeedback(gl.POINTS)`）：只能「一个输入元素 → 写自己那一格」。散写、原子加、
   `storageTexture` 写入全部只在 WebGPU 下成立。
3. **`uniformArray(vec3)` 会被填充成 vec4**（`UniformArrayNode.getPaddedType`）。
   直接读它底层 `value` 那个 Float32Array 会错位；只通过 `.array[i]`（Vector3 对象）读写。
   好消息：它 `updateType = NodeUpdateType.RENDER`（`UniformArrayNode.js:118`）会自动上传，
   而且 `renderer.compute()` 内部会 `nodes.updateForCompute()`（`Renderer.js:2956-2958`），
   **所以 compute 里读到的骨头位置不会晚一帧**，不需要手动 needsUpdate。
4. **别照抄 r16x 的 TSL 教程**：`timerLocal`→`time`、`viewportResolution`→`screenSize`（本地已确认
   `src/nodes/utils/Timer.js` / `display/ScreenNode.js`）。这类改名不是 deprecate 警告，是直接 undefined。
5. **动态 buffer 的上传范围**：`attribute.needsUpdate = true` 不带范围时整块上传；
   `clearUpdateRanges()/addUpdateRange()` 在 WebGPU 后端是被真正尊重的
   （`WebGPUAttributeUtils.js:223-263`）。MarchingCubes 自己不设，我们必须设。
6. **`Loop` 的上界写常量**：17 是编译期已知的，直接 `Loop(17, …)`；用 uniform 当上界在 GLSL 回退下
   会退化成不可展开的循环（没有实测数据，但写常量零成本，没有理由不写）。

## 明确不要做的

- **不要每帧 `new THREE.TubeGeometry(...)` 或 `LineSegmentsGeometry.setPositions()`** ——
  两者都每帧重新分配 GPU buffer（`LineSegmentsGeometry.js:111` 每次 new `InstancedInterleavedBuffer`）。
  ribbon 要做就做「静态拓扑 + `positionNode`」。
- **不要上 GPU marching cubes**（compute + 前缀和 + `IndirectStorageBufferAttribute`）。
  CPU 版实测 2.43ms 就够，而前缀和正好踩第 1 条坑（回退时静默出错）。**省的 2ms 不值这个风险。**
- **不要先做 fur**。壳层毛必须长在连续表面上；现在没有连续表面。
- **不要把 raymarch SDF 当主体**。它不进深度/光照，会和现有的刚体条目对不上；
  真要做，做成 mass 的一个「远景/低配」降级路径，半分辨率 + upscale。
- **不要为这些新增 `Skeleton` 字段**：切向/法向/半径都能从现有字段推出来，动冻结契约收益为零。
- **不要一次做四种**。docs/18 §6 的优先级是对的：mass 单独一条就够养活三个条目。
