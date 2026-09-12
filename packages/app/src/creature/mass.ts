/**
 * Mass —— B 档身体方案「团块」（docs/18-BODY-PLANS.md §2 B 档）。
 *
 * 它不是"在刚体身体外面再套一层"，它是**替换**：`bodyPlan:'mass'` 的条目
 * 一个槽位件都不实例化。整具身体是**一个** MarchingCubes 网格、**一个** draw call。
 * 总账因此变轻，不是变重。
 *
 * 表达上要拿回来的是原作《Future You》那层：形体是**流过身体的物质**，
 * 不是"一根骨头挂一个手办件"。所以这里没有部件、没有接缝、没有槽位 ——
 * 只有沿骨线撒出去的一串 metaball，被 SDF 融成一个连续的团块。
 *
 * 技术路线（**不是 GPU 版、不是 raymarch**）：three 官方 CPU addon
 * `three/addons/objects/MarchingCubes.js`。选它的理由是**分辨率是一个可降的旋钮** ——
 * 帧率掉了就降 res，画面从"光滑的肉"退化成"粗糙的团"，但永不掉帧（docs/02 P3）。
 *
 * 它**不改 `Skeleton`、不碰冻结契约**：
 *  - 球的半径从 `SLOT_OF_BONE` + `SLOT_WIDTH`（tuning.ts 里已有的身体比例表）推；
 *  - 球的密度从 `bone.length` 推；
 *  - 球的权重从 `bone.confidence` 推（追踪不确定的骨头自己淡出，而不是抽搐）。
 *
 * ⚠️ 已知的契约缺口：下面 `MASS` 里的那些数（res 默认值、球间距、半径系数、isolation）
 * 按 `tuning.ts` 的规矩本该住在 `tuning.ts`。`tuning.ts` 是冻结契约，我没有自行修改，
 * 所以它们暂时是本模块常量 + `MassOptions` 覆盖。见收尾报告「需要变更契约」。
 *
 * 两个必须知道的实现细节：
 *  1. **不要每帧重建对象。** 每帧的开销就是 `reset()` + N 次 `addBall()` + `update()`，
 *     三者都在同一个常驻的 MarchingCubes 上就地做。
 *  2. MarchingCubes 默认整块上传 position/normal 缓冲区（按 `maxPolyCount` 开的，几 MB），
 *     它没设 updateRange。WebGPU 后端是尊重 `addUpdateRange` 的
 *     （`WebGPUAttributeUtils.js:223`），所以这里每帧补上实际用到的那一段。
 */
import * as THREE from 'three/webgpu';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { SLOT_OF_BONE } from '../../../core/src/slots.ts';
import { SKELETON, SLOT_WIDTH } from '../../../core/src/tuning.ts';
import type { MaterialDef, Presence, Skeleton, Vec3 } from '../../../core/src/types.ts';
import type { PartLibrary } from '../assets/library.ts';
import type { BodyInstance, BodyStats } from './body.ts';

// ─────────────────────────── 旋钮 ───────────────────────────

/**
 * 见文件头的契约缺口说明。**改这些数之前先开 `/dev/mass.html`，改完再开一次。**
 */
const MASS = {
  /** 体素分辨率。降它就是这个方案的降级路径 */
  res: 40,
  resMin: 16,
  resMax: 64,
  /** 沿骨轴每隔多少米撒一个球（米，标准身材）。全身骨长合计 ≈4.45m → ~85 个球 */
  ballSpacing: 0.055,
  /** 单根骨头最多几个球（免得某帧骨长被追踪冲飞时爆掉预算） */
  maxBallsPerBone: 10,
  /** 全身球数硬顶。超了丢弃，不是"以后再优化"（docs/02 P5） */
  maxBalls: 128,
  /**
   * 球半径 = SLOT_WIDTH[slot]/2 × bodyScale × 这个系数。
   * SLOT_WIDTH 是**宽度**（直径），所以先除以 2 —— 忘了这个 2 会得到一个土豆。
   * 系数比 1 小是因为相邻球的场会叠加，融出来的表面比单球半径胖一圈。
   */
  radiusScale: 0.85,
  /** 半径的体素下限：细过这个数的骨头会在体素网格里整根消失 */
  minRadiusVoxels: 1.15,
  /**
   * 少数槽位对 SLOT_WIDTH 的修正。**只有两条，而且都有理由：**
   * - `spine`：SLOT_WIDTH 0.44 说的是胸廓的**宽**，但球是球，直接拿它当直径会得到一个
   *   前后 44cm 的蛋，把头和肩全吞进去。契约里没有"厚度"这一项，只能在这里补。
   * - `head`：躯干收窄之后头要能从肩上探出来，否则整个人读作"戴了个兜帽"。
   * 其余槽位一律 1（不列在这里）。
   */
  slotScale: { spine: 0.72, head: 1.15 } as Partial<Record<string, number>>,
  /** 场盒半边长 = 身高 × 这个系数。盒子越小体素越细，但抬手会被切掉 */
  boxHalfOfHeight: 0.62,
  /** 等值面阈值。调高 = 团块变瘦、更容易断开 */
  isolation: 80,
  /**
   * addBall 的衰减项。它同时决定每个球要遍历多少体素：
   * 截断半径 / 表面半径 = sqrt((isolation+subtract)/subtract)。
   * 调小 → 融得更柔但更慢；调大 → 更快但球与球之间的过渡更硬。
   */
  subtract: 30,
  /** position/normal 缓冲区按这个开。res=64 的实测三角数远在它之下 */
  maxPolyCount: 60_000,
  /** 场盒中心跟随身体质心的 EMA 时间常数（秒）。0 = 硬跟随，会让整个团块抖 */
  centerTau: 0.10,
};

// ─────────────────────────── 接口 ───────────────────────────

export interface MassStats extends BodyStats {
  /** 当前体素分辨率 */
  resolution: number;
  /** 这一帧真正喂给场的球数 */
  balls: number;
  /** reset + addBall + update 的 CPU 开销（毫秒，EMA） */
  cpuMs: number;
}

export interface MassBody extends BodyInstance {
  readonly stats: MassStats;
  /** 当前分辨率 */
  readonly res: number;
  /** 降级/升级旋钮。会重开场缓冲区，别在每帧里调 */
  setRes(res: number): void;
  /** 换条目：重新取 palette 的 primary 材质 */
  setTheme(themeId: string): void;
}

export interface MassOptions {
  /** 取 palette / MaterialDef 用。缺省时用内置的中性色 */
  library?: PartLibrary;
  /** 条目 id。它的 `palette[0]`（primary）决定团块的颜色 */
  theme?: string;
  /** 初始分辨率，默认 MASS.res */
  res?: number;
}

// ─────────────────────────── 实现 ───────────────────────────

const DEFAULT_COLOR: Vec3 = [0.78, 0.77, 0.75];

/**
 * `geometry.getAttribute()` 的类型是 `BufferAttribute | InterleavedBufferAttribute`，
 * 只有前者有 updateRange。MarchingCubes 用的是前者。
 */
interface UpdatableAttribute {
  itemSize: number;
  needsUpdate: boolean;
  clearUpdateRanges(): void;
  addUpdateRange(start: number, count: number): void;
}

const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
const smoothstep = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

export function createMassBody(opt: MassOptions = {}): MassBody {
  const library = opt.library;

  const object = new THREE.Group();
  object.name = 'mass';

  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(),
    roughness: 0.55,
    metalness: 0.05,
  });
  material.name = 'mass';

  let res = clamp(Math.round(opt.res ?? MASS.res), MASS.resMin, MASS.resMax);

  // 常驻对象：每帧只 reset + addBall + update，绝不重建（见文件头 §2）。
  // MarchingCubes 来自 `three` 主构建，我们的场景是 `three/webgpu`——
  // 两份构建里的 Object3D 是不同的类，但运行时全靠 `isMesh` 之类的鸭子类型，
  // 所以这里只需要在类型上过一道桥，运行时没有转换。
  const mc = new MarchingCubes(res, material as unknown as THREE.Material, false, false, MASS.maxPolyCount);
  const blob = mc as unknown as THREE.Object3D;
  blob.frustumCulled = false;        // 包围球跟着骨架跑，交给 three 算只会误剔
  blob.castShadow = true;
  blob.receiveShadow = true;
  object.add(blob);

  const stats: MassStats = { triangles: 0, drawCalls: 0, resolution: res, balls: 0, cpuMs: 0 };

  /** 场盒中心（世界，米）。第一帧直接吸附，之后 EMA 跟随 */
  const center: Vec3 = [0, 0.95, 0];
  let seeded = false;

  function applyTheme(themeId: string | undefined) {
    let def: MaterialDef | undefined;
    if (library && themeId) {
      const theme = library.index.themes?.find((t) => t.id === themeId);
      const primary = theme?.palette?.[0];
      if (primary) def = library.index.materials?.find((m) => m.id === primary);
    }
    const c = def?.baseColor ?? DEFAULT_COLOR;
    material.color.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
    material.roughness = Number.isFinite(def?.roughness) ? def!.roughness : 0.55;
    material.metalness = Number.isFinite(def?.metalness) ? def!.metalness : 0.05;
    material.clearcoat = def?.clearcoat ?? 0;
    if (def?.emissive) {
      material.emissive.setRGB(def.emissive[0], def.emissive[1], def.emissive[2], THREE.SRGBColorSpace);
      material.emissiveIntensity = 1;
    } else {
      material.emissive.setRGB(0, 0, 0);
    }
    material.needsUpdate = true;
  }
  applyTheme(opt.theme);

  function setRes(next: number) {
    const r = clamp(Math.round(next), MASS.resMin, MASS.resMax);
    if (r === res) return;
    res = r;
    mc.init(res);                  // 重开 field / normal_cache / position / normal 缓冲区
    mc.isolation = MASS.isolation; // init() 会把 isolation 重置回 80，这里重新贴上
    stats.resolution = res;
  }
  mc.isolation = MASS.isolation;

  const body: MassBody = {
    get object() { return object; },
    get stats() { return stats; },
    get res() { return res; },
    setRes,
    setTheme(themeId: string) { applyTheme(themeId); },

    pose(sk: Skeleton, presence: Presence, dt: number) {
      if (!sk || !sk.bones?.length) return;
      const t0 = performance.now();

      // 1. 在场：ENTERING 长出来、LEAVING 缩回去（docs/05 §5）。
      //    团块没有"槽位"可以逐个装配，所以进出场表达成**物质向质心收回去**：
      //    球半径 × pres，球位置向质心收 (1-pres)。整团化开而不是整具消失。
      const pres = presence?.state === 'ENTERING' ? smoothstep(presence.transition)
        : presence?.state === 'LEAVING' ? 1 - smoothstep(presence.transition)
        : presence?.state === 'IDLE' ? 0
        : 1;
      if (pres <= 0.001) {
        blob.visible = false;
        stats.triangles = 0; stats.drawCalls = 0; stats.balls = 0;
        return;
      }
      blob.visible = true;

      // 2. 场盒：边长由身高定（恒定 → 体素大小恒定 → 团块不会随身体位移忽胖忽瘦），
      //    中心 EMA 跟随骨架质心。
      const height = Number.isFinite(sk.height) && sk.height > 0.2 ? sk.height : SKELETON.referenceHeight;
      const bodyScale = height / SKELETON.referenceHeight;
      const half = height * MASS.boxHalfOfHeight;

      let cx = 0, cy = 0, cz = 0, n = 0;
      for (const b of sk.bones) {
        cx += (b.p0[0] + b.p1[0]) * 0.5; cy += (b.p0[1] + b.p1[1]) * 0.5; cz += (b.p0[2] + b.p1[2]) * 0.5;
        n++;
      }
      if (!n || !Number.isFinite(cx + cy + cz)) return;
      cx /= n; cy /= n; cz /= n;
      if (!seeded) { center[0] = cx; center[1] = cy; center[2] = cz; seeded = true; }
      else {
        const step = Number.isFinite(dt) ? clamp(dt, 0, 1 / 15) : 1 / 60;
        const a = 1 - Math.exp(-step / Math.max(1e-3, MASS.centerTau));
        center[0] += (cx - center[0]) * a;
        center[1] += (cy - center[1]) * a;
        center[2] += (cz - center[2]) * a;
      }

      blob.position.set(center[0], center[1], center[2]);
      blob.scale.setScalar(half);          // 局部空间是 [-1,1]³ → 世界边长 2·half

      // 3. 撒球。addBall 的坐标是 0..1 的场空间；强度由想要的世界半径反解：
      //    单个球的等值面在 strength/d² - subtract = isolation → d = sqrt(strength/(iso+sub))，
      //    其中 d 是 0..1 场空间里的距离，即世界半径 / (2·half)。
      mc.reset();
      const voxel = (2 * half) / res;
      const minRadius = MASS.minRadiusVoxels * voxel;
      const k = MASS.isolation + MASS.subtract;
      const inv = 1 / (2 * half);
      const shrink = 0.35 + 0.65 * pres;   // 进出场：物质向质心收回去

      let balls = 0;
      for (const b of sk.bones) {
        if (balls >= MASS.maxBalls) break;
        const conf = Number.isFinite(b.confidence) ? clamp(b.confidence, 0, 1) : 1;
        if (conf <= 0.02) continue;        // 追踪丢了的骨头自己淡出，不抽搐
        const slot = SLOT_OF_BONE[b.id];
        if (!slot) continue;

        const girth = (SLOT_WIDTH[slot] ?? 0.12) * 0.5 * bodyScale
          * MASS.radiusScale * (MASS.slotScale[slot] ?? 1);
        const radius = Math.max(girth, minRadius) * (0.55 + 0.45 * conf) * shrink;
        const rNorm = radius * inv;
        const strength = k * rNorm * rNorm;
        if (!(strength > 0)) continue;

        const len = Number.isFinite(b.length) && b.length > 0
          ? b.length
          : Math.hypot(b.p1[0] - b.p0[0], b.p1[1] - b.p0[1], b.p1[2] - b.p0[2]);
        const count = clamp(Math.ceil(len / (MASS.ballSpacing * bodyScale)), 1, MASS.maxBallsPerBone);

        for (let i = 0; i < count; i++) {
          if (balls >= MASS.maxBalls) break;
          const u = (i + 0.5) / count;
          // 世界位置 → 向质心收缩 → 归一化到场空间 0..1
          const wx = center[0] + ((b.p0[0] + (b.p1[0] - b.p0[0]) * u) - center[0]) * shrink;
          const wy = center[1] + ((b.p0[1] + (b.p1[1] - b.p0[1]) * u) - center[1]) * shrink;
          const wz = center[2] + ((b.p0[2] + (b.p1[2] - b.p0[2]) * u) - center[2]) * shrink;
          const fx = (wx - center[0]) * inv + 0.5;
          const fy = (wy - center[1]) * inv + 0.5;
          const fz = (wz - center[2]) * inv + 0.5;
          if (!(fx > 0 && fx < 1 && fy > 0 && fy < 1 && fz > 0 && fz < 1)) continue;  // 出盒的段落直接不喂
          mc.addBall(fx, fy, fz, strength, MASS.subtract);
          balls++;
        }
      }

      // 4. 三角化
      mc.update();

      // 5. 只上传这一帧真正写过的那一段（见文件头 §2）。
      //    渲染器上传完会自己 clearUpdateRanges；这里先清一次是防止某帧没被渲染时范围累积。
      const geo = mc.geometry;
      for (const name of ['position', 'normal'] as const) {
        // MarchingCubes 这两条一定是独立的 BufferAttribute（它自己 new 出来的），
        // 不是 InterleavedBufferAttribute —— 后者没有 updateRange，所以显式收窄。
        const attr = geo.getAttribute(name) as UpdatableAttribute | undefined;
        if (!attr || typeof attr.addUpdateRange !== 'function') continue;
        attr.clearUpdateRanges();
        attr.addUpdateRange(0, mc.count * attr.itemSize);
        attr.needsUpdate = true;
      }

      stats.balls = balls;
      stats.triangles = Math.floor(mc.count / 3);
      stats.drawCalls = stats.triangles > 0 ? 1 : 0;
      stats.resolution = res;
      stats.cpuMs = stats.cpuMs * 0.9 + (performance.now() - t0) * 0.1;
    },

    dispose() {
      object.remove(blob);
      mc.geometry.dispose();
      material.dispose();
      object.clear();
    },
  };

  return body;
}
