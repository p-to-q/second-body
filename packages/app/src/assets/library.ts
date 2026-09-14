/**
 * PartLibrary —— docs/06-SPEC-runtime-protocol.md §3。
 *
 * 唯一职责：把 `assets/parts/parts.json` + `.glb` 变成「永远能拿到一块几何」的查询接口。
 *
 * 硬性契约（ADR-4 / docs/02 P3）：
 *   - `parts.json` 缺失或损坏 → `load()` 仍然 resolve，`usingFallback = true`，
 *     `index` 返回内置占位 index，应用照常跑。
 *   - 单个 `.glb` 加载失败 → 只有那个槽位退回占位几何，别的槽位不受影响。
 *   - `geometry()` **永不返回 undefined、永不抛异常**（帧循环里会被调用）。
 *
 * 占位几何同样满足 docs/03 的部件契约：主轴 +Y、socketA 在原点、长度 1、横向居中。
 * 这条由 `toPartContract()` 在构造时强制保证，而不是靠我把 primitive 参数算对。
 *
 * 几何加载是**异步且非阻塞**的：`geometry()` 同步返回（先给占位），真几何到货后
 * 通过 `onGeometry()` 通知上层换掉。想要"先加载完再显示"就 `await preload(ids)`。
 *
 * ── §预取策略 ───────────────────────────────────────────────────────────────
 * 「到第一具身体出现」这条关键路径上只允许有三样东西：`parts.json`、选择页的卡片图、
 * **被选中那个条目的 tier ≤ 1 部件**。其余一律往后排。具体三条：
 *
 *   1. `preload()` 只 await tier ≤ 1 的件；tier ≥ 2 的插到后台队列前排（要用，但不挡进场）。
 *   2. `load()` 成功后，在浏览器空闲时预取**轮播最先转到的那几个主题**的 tier ≤ 1 件 ——
 *      选择页展示的那几秒管子是空的，不用白不用。
 *   3. 某个家族 tier T 的件被预取时，顺手把同家族 T+1 排进后台队列（见 `warmNextTier`）。
 *
 * 后台队列有并发上限，且**永远让位给前台**：投机预取如果拖慢了它想加速的那一刻，
 * 它就是负收益。这一条比多预取几件重要。
 */
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PLACEHOLDER_PREFIX } from '../../../core/src/genome.ts';
import { createIdleQueue } from './idle-queue.ts';
import type {
  MaterialDef, PartLibraryIndex, PartMeta, Slot, ThemeDef, Vec3,
} from '../../../core/src/types.ts';

// ─────────────────────────── 接口 ───────────────────────────

export interface PartLibrary {
  /** 失败也 resolve，内部切到占位模式 */
  load(): Promise<void>;
  /** 缺资产时是内置的占位 index */
  readonly index: PartLibraryIndex;
  /** 永不返回 undefined：缺失 / 还没加载完 / 加载失败 → 占位几何 */
  geometry(partId: string): THREE.BufferGeometry;
  /**
   * 左侧肢体用的**预镜像**几何：X 取反 + 三角形绕序翻回来（见 `mirrorGeometry`）。
   * 与 `geometry()` 同样永不返回 undefined。挂载矩阵用它时**不要**再加负 X 缩放。
   */
  mirrored(partId: string): THREE.BufferGeometry;
  readonly usingFallback: boolean;
  /**
   * `parts.json` 旁边 `curation.json` 里被人判为 reject 的部件 id（docs/14）。
   * 原样传给 `makeGenome(..., { rejected })`，这些件就不会被抽中。
   * **取不到 = 空集合，不是错误**（ADR-4 / P3）：策展是一层品控，不是开机条件，
   * 少了它页面照常打开，只是会看到那几件不好看的。
   */
  readonly rejected: ReadonlySet<string>;

  // ── 以下是 docs/06 §3 之外的附加能力（只增不改，见 P0） ──
  /** 永远返回一个 meta：查不到就合成一个占位 meta（localGirth 取自真实占位几何） */
  metaOf(partId: string): PartMeta;
  /** 真几何是否已经在缓存里（false = 现在 geometry() 会给占位） */
  isLoaded(partId: string): boolean;
  /**
   * 预取一批部件的 glb。永不 reject。
   * **只等 tier ≤ 1 的那些**：更高 tier 的件会进后台低优先级队列（见 §预取策略）。
   */
  preload(partIds: Iterable<string>): Promise<void>;
  /** 后台低优先级预取，立即返回。用于"还没被选中、但很可能会被选中"的件 */
  prefetch(partIds: Iterable<string>): void;
  /** 某个部件的真几何到货（或确定失败）时回调。返回取消订阅函数 */
  onGeometry(cb: (partId: string) => void): () => void;
  /** 慢回路产物：把运行时生成的部件塞进库里，之后 geometry()/metaOf() 就认识它 */
  register(meta: PartMeta, geometry: THREE.BufferGeometry): void;
  /**
   * 按**任意 URL**拉一个 glb（慢回路的产物不在 `/parts/` 下，它由 localhost 代理提供）。
   * 之所以不让调用方自己 new 一个 GLTFLoader：meshopt decoder 必须只有一份。
   * 少挂一次的症状是"部件全变成胶囊"，而且不报错 —— 见上面 createPartLibrary 里的注释。
   * 失败时 reject（与 preload 不同）：调用方要据此决定放弃，而不是拿占位几何接上去。
   */
  loadUrl(url: string): Promise<THREE.BufferGeometry>;
  readonly stats: { loaded: number; failed: number; pending: number; queued: number };
  dispose(): void;
}

export interface PartLibraryOptions {
  /** glb / parts.json 的基址。vite 把 assets/ 当静态根，所以默认是 /parts/ */
  baseUrl?: string;
}

/**
 * 首屏那一档。tier 0/1 是「一具身体最少需要的那套件」（docs/05），
 * 更高 tier 是演化后才会换上去的 —— 它们不该出现在进场之前。
 */
const FIRST_PAINT_TIER = 1;

// ─────────────────────────── 占位几何 ───────────────────────────

type Placeholder = 'capsule' | 'box' | 'sphere' | 'wedge';

/** 每个槽位用哪种原始体。管状的用胶囊，有固有比例的用球/盒/楔形 */
const PLACEHOLDER_SHAPE: Record<Slot, Placeholder> = {
  head: 'sphere',
  neck: 'sphere',
  spine: 'box',
  clavicle: 'capsule',
  upperArm: 'capsule',
  foreArm: 'capsule',
  hand: 'wedge',
  thigh: 'capsule',
  shin: 'capsule',
  foot: 'wedge',
  joint: 'sphere',
};

/**
 * 强制满足部件契约：主轴 +Y，socketA 落在原点，长度 = 1，横向居中。
 * 就地修改并返回同一个 geometry。
 */
function toPartContract(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  if (!bb) return geo;
  geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  const h = bb.max.y - bb.min.y;
  if (h > 1e-6) geo.scale(1 / h, 1 / h, 1 / h);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * 尺寸约定（决定占位体看起来对不对，别乱改）：
 *  - stretch 槽位（胶囊）：世界宽度 = g × localGirth = SLOT_WIDTH，与 localGirth 无关，随便取。
 *  - uniform 槽位（球/盒/楔）：g = SLOT_WIDTH / localGirth 同时是**高度**。
 *    所以 uniform 占位体的 localGirth 必须 ≈ 1（宽 = 高），否则 SLOT_WIDTH 读作"整体大小"就不成立：
 *    躯干盒子做成 0.62 宽时高会变成 0.44/0.62 = 0.71m，直接把头罩住（实测踩过）。
 */
function buildPlaceholder(shape: Placeholder): THREE.BufferGeometry {
  switch (shape) {
    case 'capsule':
      // 半径 0.16 → 总高 1.0（0.68 圆柱 + 两个半球）
      return toPartContract(new THREE.CapsuleGeometry(0.16, 0.68, 6, 16));
    case 'box':
      return toPartContract(new THREE.BoxGeometry(1, 1, 0.6));
    case 'sphere':
      return toPartContract(new THREE.SphereGeometry(0.5, 24, 16));
    case 'wedge': {
      // 四棱台转 45°：截面与坐标轴对齐，读起来像一块楔子（手/脚）
      const g = new THREE.CylinderGeometry(0.40, 0.7071, 1, 4, 1);
      g.rotateY(Math.PI / 4);
      return toPartContract(g);
    }
  }
}

function lateralGirth(geo: THREE.BufferGeometry): number {
  const bb = geo.boundingBox;
  if (!bb) return 1;
  return Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z, 1e-3);
}

function aabbOf(geo: THREE.BufferGeometry): { min: Vec3; max: Vec3 } {
  const bb = geo.boundingBox;
  if (!bb) return { min: [0, 0, 0], max: [1, 1, 1] };
  return { min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] };
}

function triCountOf(geo: THREE.BufferGeometry): number {
  const idx = geo.getIndex();
  const pos = geo.getAttribute('position');
  return Math.floor((idx ? idx.count : pos ? pos.count : 0) / 3);
}

/** `placeholder:<slot>` → slot；其它 id 尽力猜（`head.porcelain.a` → `head`） */
function slotFromId(id: string, index: PartLibraryIndex): Slot {
  const meta = index.parts.find((p) => p.id === id);
  if (meta) return meta.slot;
  const raw = id.startsWith(PLACEHOLDER_PREFIX) ? id.slice(PLACEHOLDER_PREFIX.length) : id.split('.')[0];
  return (raw in PLACEHOLDER_SHAPE ? raw : 'spine') as Slot;
}

// ─────────────────────────── 内置占位 index ───────────────────────────

const FALLBACK_THEMES: ThemeDef[] = [
  {
    id: 'placeholder', kind: 'archetype', name: '原型', nameEn: 'Proto',
    tagline: '还没有部件，但它站起来了',
    palette: ['proto.clay', 'proto.slate', 'proto.chalk'],
    source: 'procedural', axes: { humanLike: 0.5, lifeLike: 0.2 }, coverage: 'full',
  },
];

const FALLBACK_MATERIALS: MaterialDef[] = [
  { id: 'proto.clay', tier: 0, baseColor: [0.72, 0.71, 0.69], roughness: 0.95, metalness: 0 },
  { id: 'proto.slate', tier: 0, baseColor: [0.38, 0.39, 0.42], roughness: 0.8, metalness: 0 },
  { id: 'proto.chalk', tier: 0, baseColor: [0.9, 0.89, 0.86], roughness: 0.7, metalness: 0 },
];

function fallbackIndex(): PartLibraryIndex {
  return {
    version: 0,
    units: 'meters',
    convention: { axis: '+Y', socketA: [0, 0, 0], socketB: [0, 1, 0], length: 1 },
    themes: FALLBACK_THEMES,
    materials: FALLBACK_MATERIALS,
    parts: [],           // 空 → genome 每个槽位都落到 `placeholder:<slot>`
  };
}

/**
 * parts.json 是外部输入，默认不可信（P2）：补默认值、丢掉残缺条目，
 * 绝不因为多一个/少一个字段就把整个应用带崩。
 */
function sanitizeIndex(raw: unknown): PartLibraryIndex {
  const o = (raw ?? {}) as Partial<PartLibraryIndex>;
  if (!Array.isArray(o.parts)) throw new Error('parts.json: 缺少 parts[]');

  const parts = (o.parts as PartMeta[]).filter(
    (p) => p && typeof p.id === 'string' && typeof p.file === 'string' && typeof p.slot === 'string',
  ).map((p) => ({
    ...p,
    tier: (Number.isFinite(p.tier) ? p.tier : 1) as PartMeta['tier'],
    localGirth: Number.isFinite(p.localGirth) && p.localGirth > 1e-4 ? p.localGirth : 1,
    symmetry: p.symmetry === 'mirror' ? 'mirror' as const : 'none' as const,
  }));

  // parts.json 里的 theme 条目可能还没补齐 roster 字段（docs/14），缺的给默认值
  const themes: ThemeDef[] = (Array.isArray(o.themes) ? o.themes : [])
    .filter((t: Partial<ThemeDef>) => t && typeof t.id === 'string')
    .map((t: Partial<ThemeDef>) => ({
      ...t,
      id: t.id as string,
      name: t.name ?? (t.id as string),
      nameEn: t.nameEn ?? (t.id as string),
      tagline: t.tagline ?? '',
      palette: Array.isArray(t.palette) ? t.palette : [],
      source: t.source ?? 'rodin',
      kind: t.kind ?? 'archetype',
      axes: t.axes ?? { humanLike: 0.5, lifeLike: 0.5 },
      coverage: t.coverage ?? 'full',
    }));

  const materials = (Array.isArray(o.materials) ? o.materials : []).filter(
    (m) => m && typeof m.id === 'string',
  );

  return {
    version: Number.isFinite(o.version) ? (o.version as number) : 1,
    generatedAt: o.generatedAt,
    units: 'meters',
    convention: o.convention ?? { axis: '+Y', socketA: [0, 0, 0], socketB: [0, 1, 0], length: 1 },
    themes: themes.length ? themes : FALLBACK_THEMES,
    materials: materials.length ? materials : FALLBACK_MATERIALS,
    parts,
  };
}

// ─────────────────────────── glb → 单块 BufferGeometry ───────────────────────────

/**
 * InstancedMesh 要一块几何，glb 可能有多个 mesh / 嵌套变换 → 烘到世界系再合并。
 * 只保留 position + normal：我们的部件没有贴图（docs/03），多余属性会让 merge 失败。
 */
/**
 * 量化 / 交错属性 → 普通 Float32 属性。
 *
 * 为什么非做不可：压缩后的部件是 `KHR_mesh_quantization`，position 是**归一化的
 * Int16**，而且可能是交错缓冲。直接 `applyMatrix4` 会把反量化后的值（节点 scale 0.5、
 * translate +0.5）再写回 Int16 并重新归一化到 [-1,1] —— 几何会被夹烂，
 * 而且是"部件看起来歪了一点点"这种最难查的坏法。`getX/getY/getZ` 会替我们反归一化。
 */
function toFloatAttribute(a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): THREE.BufferAttribute {
  const n = a.itemSize;
  const out = new Float32Array(a.count * n);
  for (let i = 0; i < a.count; i++) {
    out[i * n] = a.getX(i);
    if (n > 1) out[i * n + 1] = a.getY(i);
    if (n > 2) out[i * n + 2] = a.getZ(i);
  }
  return new THREE.BufferAttribute(out, n);
}

/**
 * 左右镜像的几何副本：X 取反，然后把每个三角形的绕序翻回来。
 *
 * 为什么不能只在矩阵里给一个负 X 缩放（原来就是这么做的）：
 * 负行列式会把**所有**三角形变成背面。`side: DoubleSide` 让它们还看得见，
 * 但 three 对背面片元会把法线取反 —— 于是整个左半身是"从内部被照亮"的，
 * 比右半身暗一大截。实拍图里"左右手像两种完全不同的材质"就是这么来的，
 * 它根本不是材质问题。
 *
 * 翻绕序等于把行列式再翻回正的，法线和正反面判定就都对了；
 * 代价是每个镜像件多一份几何（~3k 面，可以接受）。
 */
export function mirrorGeometry(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = src.clone();
  g.scale(-1, 1, 1);
  const idx = g.getIndex();
  if (idx) {
    const a = idx.array as Uint16Array | Uint32Array;
    for (let i = 0; i + 2 < a.length; i += 3) { const t = a[i]; a[i] = a[i + 2]; a[i + 2] = t; }
    idx.needsUpdate = true;
  } else {
    // 非索引几何：直接换每个三角形里第 0 与第 2 个顶点的所有属性
    for (const name of Object.keys(g.attributes)) {
      const attr = g.getAttribute(name) as THREE.BufferAttribute;
      const n = attr.itemSize;
      const arr = attr.array as Float32Array;
      for (let t = 0; t + 2 < attr.count; t += 3) {
        for (let k = 0; k < n; k++) {
          const i0 = t * n + k, i2 = (t + 2) * n + k;
          const tmp = arr[i0]; arr[i0] = arr[i2]; arr[i2] = tmp;
        }
      }
      attr.needsUpdate = true;
    }
  }
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** 导出只为了测试：压缩件的解码 + 烘变换这条路坏掉时不会抛异常，只能用真文件对边界 */
export function geometryFromScene(scene: THREE.Object3D): THREE.BufferGeometry | null {
  scene.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    let g = m.geometry.clone();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
      else g.setAttribute(name, toFloatAttribute(g.getAttribute(name)));
    }
    g.applyMatrix4(m.matrixWorld);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (g.morphAttributes) g.morphAttributes = {};
    g.clearGroups();
    if (g.getIndex()) g = g.toNonIndexed();   // 统一成非索引，merge 才不会挑食
    parts.push(g);
  });
  if (!parts.length) return null;
  if (parts.length === 1) return parts[0];
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

// ─────────────────────────── 实现 ───────────────────────────

export function createPartLibrary(opt: PartLibraryOptions = {}): PartLibrary {
  const baseUrl = (opt.baseUrl ?? '/parts/').replace(/\/?$/, '/');
  const loader = new GLTFLoader();
  // 部件用 EXT_meshopt_compression + KHR_mesh_quantization 写出（26 MB → 7 MB，
  // 见 packages/factory/src/normalize.ts 的 writePart）。**没有这个 decoder，
  // 191 件会全部加载失败**，应用不会崩（P3 兜底），但全程都是占位几何 ——
  // 一个只在"部件看起来都像胶囊"时才显形的 bug。解码器是 three 自带的，不是新依赖。
  loader.setMeshoptDecoder(MeshoptDecoder);

  let index: PartLibraryIndex = fallbackIndex();
  let usingFallback = true;
  let rejected: ReadonlySet<string> = new Set();

  const placeholders = new Map<Slot, THREE.BufferGeometry>();
  const placeholderMetas = new Map<Slot, PartMeta>();
  const geometries = new Map<string, THREE.BufferGeometry>();   // partId → 真几何
  const mirrors = new Map<string, THREE.BufferGeometry>();      // partId → 预镜像副本（懒建）
  const inFlight = new Map<string, Promise<void>>();
  const failed = new Set<string>();
  const listeners = new Set<(partId: string) => void>();

  function placeholderGeometry(slot: Slot): THREE.BufferGeometry {
    let g = placeholders.get(slot);
    if (!g) {
      g = buildPlaceholder(PLACEHOLDER_SHAPE[slot] ?? 'capsule');
      placeholders.set(slot, g);
    }
    return g;
  }

  function placeholderMeta(slot: Slot): PartMeta {
    let m = placeholderMetas.get(slot);
    if (!m) {
      const g = placeholderGeometry(slot);
      m = {
        id: PLACEHOLDER_PREFIX + slot,
        slot,
        tier: 0,
        file: '',
        family: 'placeholder',
        localGirth: lateralGirth(g),
        triCount: triCountOf(g),
        aabb: aabbOf(g),
        symmetry: 'none',      // 占位体本身左右对称，不需要镜像复用
      };
      placeholderMetas.set(slot, m);
    }
    return m;
  }

  /** 几何变了（真几何到货 / 慢回路热插拔）→ 镜像副本作废，下次用时重建 */
  function dropMirror(partId: string) {
    mirrors.get(partId)?.dispose();
    mirrors.delete(partId);
  }

  function emit(partId: string) {
    dropMirror(partId);
    for (const cb of listeners) {
      try { cb(partId); } catch (e) { console.error('[library] onGeometry 回调抛异常', e); }
    }
  }

  /** 拉一个 glb。永不 reject：失败就记进 failed，槽位继续用占位几何（P3） */
  function fetchPart(partId: string): Promise<void> {
    const done = inFlight.get(partId);
    if (done) return done;
    const meta = index.parts.find((p) => p.id === partId);
    if (!meta || !meta.file) return Promise.resolve();

    const task = (async () => {
      try {
        const gltf = await loader.loadAsync(baseUrl + meta.file);
        const geo = geometryFromScene(gltf.scene);
        if (!geo) throw new Error('glb 里没有 mesh');
        geo.computeBoundingBox();
        geo.computeBoundingSphere();
        geometries.set(partId, geo);
        failed.delete(partId);
      } catch (e) {
        failed.add(partId);
        console.warn(`[library] ${partId} 加载失败 → 该槽位用占位几何`, e);
      } finally {
        inFlight.delete(partId);
        emit(partId);
        // 左侧肢体要画的预镜像副本：在空闲里先做好，别等第一次被画的那一帧（docs/48 §10）。
        // 必须排在 emit 之后 —— emit 会把旧的镜像副本作废
        if (geometries.has(partId) && meta.symmetry === 'mirror') premirror(partId);
      }
    })();
    inFlight.set(partId, task);
    return task;
  }

  // ── 预取策略（见文件头 §预取策略）─────────────────────────────────────────
  const bgQueue: string[] = [];
  const bgQueued = new Set<string>();
  let bgActive = 0;

  function wantsFetch(id: string): boolean {
    return !!id && !id.startsWith(PLACEHOLDER_PREFIX)
      && !geometries.has(id) && !failed.has(id) && !inFlight.has(id) && !bgQueued.has(id);
  }

  /** 进后台队列。`urgent` 的插队到前面 —— 真要用的件永远排在投机预取之前 */
  function enqueue(ids: Iterable<string>, urgent: boolean) {
    for (const id of ids) {
      if (!wantsFetch(id)) continue;
      bgQueued.add(id);
      if (urgent) bgQueue.unshift(id); else bgQueue.push(id);
    }
    pump();
  }

  /**
   * 后台并发上限。为什么是 3：预取是**投机**的，它和首屏真正需要的东西
   * （anchor 图、当前主题的 tier≤1 件）抢同一条管子。占满连接池会让预取
   * 反过来拖慢它本该加速的那一刻。
   */
  const BG_CONCURRENCY = 3;

  function pump() {
    while (bgActive < BG_CONCURRENCY && bgQueue.length) {
      const id = bgQueue.shift()!;
      bgQueued.delete(id);
      if (geometries.has(id)) continue;
      bgActive++;
      void fetchPart(id).finally(() => { bgActive--; pump(); });
    }
  }

  /**
   * 离开帧循环的准备活（`idle-queue.ts`，docs/48 §10）。每个空闲时段最多做 `PREP_SLICE_MS`；
   * 没有 requestIdleCallback 就退到 0ms 定时器、按同一个预算切片。
   */
  const PREP_SLICE_MS = 8;
  const prep = createIdleQueue({
    now: () => performance.now(),
    schedule: () => {
      const ric = (globalThis as { requestIdleCallback?: (cb: (d: { timeRemaining(): number }) => void, o?: { timeout: number }) => void }).requestIdleCallback;
      if (ric) ric((d) => prep.run(Math.min(PREP_SLICE_MS, d.timeRemaining())), { timeout: 1000 });
      else setTimeout(() => prep.run(PREP_SLICE_MS), 0);
    },
    onError: (key, e) => console.warn(`[library] 空闲准备 ${key} 失败 → 第一次画它时照旧现做`, e),
  });

  /** 预镜像副本进空闲队列。帧循环里 `mirrored()` 命中缓存就不再 clone + 翻绕序 */
  function premirror(partId: string): void {
    prep.add(`mirror:${partId}`, () => {
      const g = geometries.get(partId);
      if (!g || mirrors.has(partId)) return;
      mirrors.set(partId, mirrorGeometry(g));
    });
  }

  /** 浏览器空闲时再动手；没有 requestIdleCallback 就退到定时器。两条路都跑得通 */
  function whenIdle(fn: () => void) {
    const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
    if (ric) ric(fn, { timeout: 3000 }); else setTimeout(fn, 1500);
  }

  const tierOf = (id: string) => index.parts.find((p) => p.id === id)?.tier ?? 1;

  /**
   * 取策展记录。**永不抛、永不 reject**：拿不到就是空集合。
   *
   * 和 `parts.json` 分开 fetch 而不是并到同一个 try 里，是因为两者的失败不是一回事：
   * 没有 `parts.json` 是「没有资产」（整页退占位模式），没有 `curation.json`
   * 只是「没有人工品控这一层」—— 后者绝不许把前者拖进 fallback。
   * 外部输入默认不可信（P2）：只认 verdict === 'reject' 的字符串键，其余一律忽略。
   */
  async function loadCuration(): Promise<ReadonlySet<string>> {
    try {
      const res = await fetch(baseUrl + 'curation.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json() as Record<string, { verdict?: string } | null>;
      const ids = new Set<string>();
      for (const [id, e] of Object.entries(raw ?? {})) {
        if (typeof id === 'string' && id && e && e.verdict === 'reject') ids.add(id);
      }
      return ids;
    } catch (e) {
      console.warn('[library] curation.json 不可用 → 不做策展过滤（ADR-4 / P3）', e);
      return new Set();
    }
  }

  /**
   * tier 升档前**提前**把下一档的件拉下来。
   *
   * 想要的信号是 `evolution.progress`（升档前几秒就知道要升了），但它在 `main.ts` 的
   * 帧循环里，这轮不归我改。退而求其次用一个同样早、且完全在库内部可见的信号：
   * **有人预取了某个家族 tier T 的件** —— 在这件作品里那就等于「这具身体正在 T 上跑」。
   * 于是这里顺手把同家族 T+1 的件排进后台队列。代价是最多多拉一档（几百 KB），
   * 收益是升档那一帧不会突然掉回占位几何。
   */
  function warmNextTier(families: Set<string>, tier: number) {
    if (tier >= 3) return;
    enqueue(index.parts.filter((p) => families.has(p.family) && p.tier === tier + 1).map((p) => p.id), false);
  }

  /**
   * 选择页展示期间预取「最可能被选中的那几个条目」。
   * 最可能 = 轮播最先转到的那几张卡 —— 也就是 `index.themes` 的前几项（roster 顺序）。
   * 只拉 tier ≤ 1：那是进场第一秒真正要用的那一档，更高 tier 等选完再说。
   */
  function prefetchLikelyThemes(n = 3) {
    const themes = index.themes.filter((t) => index.parts.some((p) => p.family === t.id)).slice(0, n);
    for (const t of themes)
      enqueue(index.parts.filter((p) => p.family === t.id && p.tier <= FIRST_PAINT_TIER).map((p) => p.id), false);
  }

  const lib: PartLibrary = {
    async load() {
      // 和 parts.json 并行拉，别让品控多加一个串行 RTT 到「第一具身体出现」那条路上。
      // await 在最后：`await library.load()` 一返回，调用方立刻就会 makeGenome，
      // 那时 rejected 必须已经是最终值，否则第一具身体仍然会抽到被否掉的件。
      const curation = loadCuration();
      try {
        const res = await fetch(baseUrl + 'parts.json', { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        index = sanitizeIndex(await res.json());
        usingFallback = false;
        console.info(`[library] parts.json: ${index.parts.length} 件 / ${index.themes.length} 主题`);
        // load() 一 resolve，选择页就开始转了 —— 那段时间管子是空的，拿来预取最划算。
        // 但要等空闲：选择页自己要先把 anchor 图拉齐才出得了卡片，别跟它抢。
        whenIdle(() => prefetchLikelyThemes());
      } catch (e) {
        index = fallbackIndex();
        usingFallback = true;
        console.warn('[library] parts.json 不可用 → 全程序化占位模式（ADR-4 / P3）', e);
      }
      rejected = await curation;
      if (rejected.size) console.info(`[library] 策展: ${rejected.size} 件 reject，不进选件池`);
    },

    get index() { return index; },
    get usingFallback() { return usingFallback; },
    get rejected() { return rejected; },

    geometry(partId) {
      const hit = geometries.get(partId);
      if (hit) return hit;
      if (!partId.startsWith(PLACEHOLDER_PREFIX) && !failed.has(partId)) {
        void fetchPart(partId);     // 后台去拿，本帧先给占位
      }
      return placeholderGeometry(slotFromId(partId, index));
    },

    mirrored(partId) {
      const hit = mirrors.get(partId);
      if (hit) return hit;
      // 用 geometry() 而不是 geometries.get()：它顺带触发加载、并保证有占位可用
      const g = mirrorGeometry(lib.geometry(partId));
      mirrors.set(partId, g);       // 真几何到货时由 dropMirror() 作废，见 fetchPart
      return g;
    },

    metaOf(partId) {
      return index.parts.find((p) => p.id === partId) ?? placeholderMeta(slotFromId(partId, index));
    },

    isLoaded(partId) { return geometries.has(partId); },

    async preload(partIds) {
      const jobs: Promise<void>[] = [];
      const later: string[] = [];
      const families = new Set<string>();
      let topTier = 0;
      for (const id of partIds) {
        if (!id || id.startsWith(PLACEHOLDER_PREFIX) || geometries.has(id)) continue;
        const meta = index.parts.find((p) => p.id === id);
        if (meta) { families.add(meta.family); topTier = Math.max(topTier, meta.tier); }
        // 只有 tier ≤ 1 会被等：那是「第一具身体出现」真正需要的那一档。
        // 高 tier 的件仍然会拉，只是不挡在进场前面（调用方 await 的是首屏，不是全部）。
        if (tierOf(id) <= FIRST_PAINT_TIER) jobs.push(fetchPart(id));
        else later.push(id);
      }
      enqueue(later, true);
      warmNextTier(families, topTier);
      await Promise.all(jobs);       // fetchPart 自己吞掉异常，这里不会 reject
    },

    prefetch(partIds) { enqueue(partIds, false); },

    onGeometry(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    register(meta, geometry) {
      const i = index.parts.findIndex((p) => p.id === meta.id);
      if (i >= 0) index.parts[i] = meta; else index.parts.push(meta);
      geometries.get(meta.id)?.dispose();
      geometries.set(meta.id, geometry);
      failed.delete(meta.id);
      emit(meta.id);
    },

    async loadUrl(url) {
      const gltf = await loader.loadAsync(url);
      const geo = geometryFromScene(gltf.scene);
      if (!geo) throw new Error(`glb 里没有 mesh：${url}`);
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
      return geo;
    },

    get stats() {
      return { loaded: geometries.size, failed: failed.size, pending: inFlight.size, queued: bgQueue.length };
    },

    dispose() {
      bgQueue.length = 0;
      bgQueued.clear();
      for (const g of geometries.values()) g.dispose();
      for (const g of mirrors.values()) g.dispose();
      for (const g of placeholders.values()) g.dispose();
      mirrors.clear();
      geometries.clear();
      placeholders.clear();
      placeholderMetas.clear();
      listeners.clear();
    },
  };

  return lib;
}
