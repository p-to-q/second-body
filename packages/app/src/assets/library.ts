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
 */
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PLACEHOLDER_PREFIX } from '../../../core/src/genome.ts';
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
  readonly usingFallback: boolean;

  // ── 以下是 docs/06 §3 之外的附加能力（只增不改，见 P0） ──
  /** 永远返回一个 meta：查不到就合成一个占位 meta（localGirth 取自真实占位几何） */
  metaOf(partId: string): PartMeta;
  /** 真几何是否已经在缓存里（false = 现在 geometry() 会给占位） */
  isLoaded(partId: string): boolean;
  /** 预取一批部件的 glb。永不 reject */
  preload(partIds: Iterable<string>): Promise<void>;
  /** 某个部件的真几何到货（或确定失败）时回调。返回取消订阅函数 */
  onGeometry(cb: (partId: string) => void): () => void;
  /** 慢回路产物：把运行时生成的部件塞进库里，之后 geometry()/metaOf() 就认识它 */
  register(meta: PartMeta, geometry: THREE.BufferGeometry): void;
  readonly stats: { loaded: number; failed: number; pending: number };
  dispose(): void;
}

export interface PartLibraryOptions {
  /** glb / parts.json 的基址。vite 把 assets/ 当静态根，所以默认是 /parts/ */
  baseUrl?: string;
}

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
function geometryFromScene(scene: THREE.Object3D): THREE.BufferGeometry | null {
  scene.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    let g = m.geometry.clone();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
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

  let index: PartLibraryIndex = fallbackIndex();
  let usingFallback = true;

  const placeholders = new Map<Slot, THREE.BufferGeometry>();
  const placeholderMetas = new Map<Slot, PartMeta>();
  const geometries = new Map<string, THREE.BufferGeometry>();   // partId → 真几何
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

  function emit(partId: string) {
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
      }
    })();
    inFlight.set(partId, task);
    return task;
  }

  const lib: PartLibrary = {
    async load() {
      try {
        const res = await fetch(baseUrl + 'parts.json', { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        index = sanitizeIndex(await res.json());
        usingFallback = false;
        console.info(`[library] parts.json: ${index.parts.length} 件 / ${index.themes.length} 主题`);
      } catch (e) {
        index = fallbackIndex();
        usingFallback = true;
        console.warn('[library] parts.json 不可用 → 全程序化占位模式（ADR-4 / P3）', e);
      }
    },

    get index() { return index; },
    get usingFallback() { return usingFallback; },

    geometry(partId) {
      const hit = geometries.get(partId);
      if (hit) return hit;
      if (!partId.startsWith(PLACEHOLDER_PREFIX) && !failed.has(partId)) {
        void fetchPart(partId);     // 后台去拿，本帧先给占位
      }
      return placeholderGeometry(slotFromId(partId, index));
    },

    metaOf(partId) {
      return index.parts.find((p) => p.id === partId) ?? placeholderMeta(slotFromId(partId, index));
    },

    isLoaded(partId) { return geometries.has(partId); },

    async preload(partIds) {
      const jobs: Promise<void>[] = [];
      for (const id of partIds) {
        if (!id || id.startsWith(PLACEHOLDER_PREFIX) || geometries.has(id)) continue;
        jobs.push(fetchPart(id));
      }
      await Promise.all(jobs);       // fetchPart 自己吞掉异常，这里不会 reject
    },

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

    get stats() {
      return { loaded: geometries.size, failed: failed.size, pending: inFlight.size };
    },

    dispose() {
      for (const g of geometries.values()) g.dispose();
      for (const g of placeholders.values()) g.dispose();
      geometries.clear();
      placeholders.clear();
      placeholderMetas.clear();
      listeners.clear();
    },
  };

  return lib;
}
