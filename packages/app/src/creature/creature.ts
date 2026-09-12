/**
 * Creature —— docs/06-SPEC-runtime-protocol.md §4。
 *
 * 每种「部件 × 材质」一个 `InstancedMesh`，每帧把 `assemble()` 算出的矩阵写进去。
 * 矩阵一律来自 `core/attach.ts`，这里**不做任何挂载数学**（docs/04 §4 是唯一定义处）。
 *
 * 三条必须守住的线：
 *  - `pose()` 在帧循环里跑 → 不 throw、不 await、不分配大对象（P2/P5）。
 *  - 实例总数硬顶 `BUDGET.maxInstances`，超了丢弃而不是"以后再优化"。
 *  - 换装只动**变化的槽位**，同时最多 `MORPH.maxConcurrentSwaps` 个，其余排队（docs/05 §3）。
 *
 * 镜像（docs/04 §4 的陷阱）：**不用负 X 缩放**。负行列式会把左半身的三角形全变成背面，
 * 而背面片元的法线会被取反 —— 左半身于是比右半身暗一大截，读起来像"左右手材质不一样"。
 * 改成向库要一块预镜像的几何（`library.mirrored()`），行列式保持为正。
 * 材质仍然 `side: DoubleSide`，那是为了兜住部件本身没封闭的情况，不再是为了兜镜像。
 */
import * as THREE from 'three/webgpu';
import { harmonize } from '../../../core/src/palette.ts';
import { ALL_SLOT_KEYS } from '../../../core/src/slots.ts';
import { BUDGET, MORPH, TIME } from '../../../core/src/tuning.ts';
import type {
  Genome, MaterialDef, MaterialRole, PartMeta, Presence, Skeleton, SlotKey, SlotPick,
} from '../../../core/src/types.ts';
import type { PartLibrary } from '../assets/library.ts';
import { assemble, partIdsOf, type PartInstance, type SlotRender } from './assemble.ts';

export interface CreatureStats {
  instances: number;
  triangles: number;
  /** 实际提交的 InstancedMesh 数量 ≈ draw call */
  drawCalls: number;
  swapsActive: number;
  swapsQueued: number;
  /** 还在用占位几何的实例数（资产没到货 / 加载失败） */
  placeholders: number;
}

export interface Creature {
  /** 只对变化的槽位做 crossfade，最多同时 MORPH.maxConcurrentSwaps 个（docs/05 §3） */
  remorph(g: Genome): void;
  pose(sk: Skeleton, p: Presence, dt: number): void;
  /** 慢回路产物到货：把某个槽位热插拔成新部件，带组装动画 */
  graft(slot: SlotKey, meta: PartMeta, geometry: THREE.BufferGeometry): void;

  /** 挂到 scene 上的根节点 */
  readonly object: THREE.Group;
  readonly genome: Genome | null;
  readonly stats: CreatureStats;
  dispose(): void;
}

export interface CreatureOptions {
  library: PartLibrary;
  /** 实例上限，默认 BUDGET.maxInstances */
  maxInstances?: number;
}

interface Swap {
  key: SlotKey;
  from: SlotPick | null;
  to: SlotPick;
  /** 0..1 */
  t: number;
}

interface MeshEntry {
  mesh: THREE.InstancedMesh;
  partId: string;
  materialId: string;
  capacity: number;
  trisPerInstance: number;
  /** 连续多少帧没被用到 —— 换材质/换部件后回收空 mesh，免得 draw call 慢慢长胖 */
  idleFrames: number;
}

/** 空 mesh 留这么多帧再回收（换装动画来回切时不要反复重建） */
const IDLE_FRAMES_BEFORE_DISPOSE = 180;

const smoothstep = (x: number) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

const DEFAULT_COLOR: [number, number, number] = [0.78, 0.77, 0.75];

/**
 * 一个 InstancedMesh 桶 = 部件 × 左右 × 材质。
 * 左右要分桶是因为左侧用的是**另一块几何**（预镜像副本），不是同一块几何的负缩放。
 */
const bucketKey = (partId: string, mirrored: boolean, materialId: string) =>
  `${partId}${mirrored ? '~m' : ''}#${materialId}`;

export function createCreature(opt: CreatureOptions): Creature {
  const library = opt.library;
  const maxInstances = opt.maxInstances ?? BUDGET.maxInstances;

  const object = new THREE.Group();
  object.name = 'creature';

  const meshes = new Map<string, MeshEntry>();          // bucketKey() → mesh
  const materials = new Map<string, THREE.Material>();  // materialIdFor() 的键 → material
  const dirtyParts = new Set<string>();                 // 真几何到货 → 重建这些 mesh

  let genome: Genome | null = null;
  const active = new Map<SlotKey, Swap>();
  const queued: Swap[] = [];

  const stats: CreatureStats = {
    instances: 0, triangles: 0, drawCalls: 0, swapsActive: 0, swapsQueued: 0, placeholders: 0,
  };

  const tmp = new THREE.Matrix4();
  const counts = new Map<string, number>();
  /** 每个桶的代表实例 —— 桶键是拼出来的字符串，别再从字符串里把字段解析回来 */
  const specs = new Map<string, PartInstance>();
  const cursor = new Map<string, number>();
  const render: Partial<Record<SlotKey, SlotRender[]>> = {};

  const unsubscribe = library.onGeometry((partId) => { dirtyParts.add(partId); });

  // ── 材质 ────────────────────────────────────────────────────────────────
  /**
   * 桶键里用的材质标识 = `<材质 id>@<物种主色 id>`。
   *
   * 为什么要把主色编进键里：材质现在不是"查一张全局表"，而是**被这个物种的主色调和过**
   * 的结果（`core/palette.ts`）。同一个 `matte.ash` 挂在瓷身上和挂在异形身上不是同一块材质，
   * 键不带主色就会拿错缓存 —— 换个物种，旧材质还挂在那儿。
   */
  function materialIdFor(role: MaterialRole): string {
    const id = genome?.materials?.[role] ?? 'proto.clay';
    return `${id}@${genome?.materials?.primary ?? id}@${role}`;
  }

  function materialFor(materialKey: string): THREE.Material {
    let m = materials.get(materialKey);
    if (m) return m;
    const [materialId, toneId, role] = materialKey.split('@');
    const find = (id: string) => library.index.materials?.find((x) => x.id === id);
    const raw = find(materialId);
    const def: MaterialDef | undefined = raw && find(toneId)
      ? harmonize(raw, find(toneId)!, role as MaterialRole)
      : raw;
    const c = def?.baseColor ?? DEFAULT_COLOR;
    const color = new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
    const phys = new THREE.MeshPhysicalMaterial({
      color,
      roughness: Number.isFinite(def?.roughness) ? def!.roughness : 0.7,
      metalness: Number.isFinite(def?.metalness) ? def!.metalness : 0.05,
      // 生成的部件不保证是封闭实体，单面渲染会露出破洞
      side: THREE.DoubleSide,
    });
    if (def?.clearcoat) phys.clearcoat = def.clearcoat;
    if (def?.emissive) {
      phys.emissive = new THREE.Color().setRGB(def.emissive[0], def.emissive[1], def.emissive[2], THREE.SRGBColorSpace);
      phys.emissiveIntensity = 1;
    }
    phys.name = materialKey;
    materials.set(materialKey, phys);
    return phys;
  }

  // ── InstancedMesh 池 ────────────────────────────────────────────────────
  function disposeEntry(key: string) {
    const e = meshes.get(key);
    if (!e) return;
    object.remove(e.mesh);
    e.mesh.dispose();          // 只释放 instanceMatrix；geometry/material 是共享的，由库/本模块管
    meshes.delete(key);
  }

  function entryFor(key: string, partId: string, materialId: string, mirrored: boolean, need: number): MeshEntry {
    let e = meshes.get(key);
    if (e && e.capacity < need) {
      disposeEntry(key);
      e = undefined;
    }
    if (!e) {
      const geo = mirrored ? library.mirrored(partId) : library.geometry(partId);
      const capacity = Math.max(4, 1 << Math.ceil(Math.log2(Math.max(1, need))));
      const mesh = new THREE.InstancedMesh(geo, materialFor(materialId), capacity);
      mesh.name = key;
      mesh.frustumCulled = false;        // 实例包围球跟着骨架跑，交给 three 算只会误剔
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.count = 0;
      object.add(mesh);
      const idx = geo.getIndex();
      const pos = geo.getAttribute('position');
      e = {
        mesh, partId, materialId, capacity, idleFrames: 0,
        trisPerInstance: Math.floor((idx ? idx.count : pos ? pos.count : 0) / 3),
      };
      meshes.set(key, e);
    }
    return e;
  }

  // ── 换装队列（docs/05 §3） ──────────────────────────────────────────────
  function pumpQueue() {
    while (active.size < MORPH.maxConcurrentSwaps && queued.length) {
      const s = queued.shift()!;
      // 同一个槽位排了两次：后来的覆盖前面的，起点用当前正在播的那个
      const running = active.get(s.key);
      if (running) s.from = running.to;
      active.set(s.key, s);
    }
  }

  function enqueue(swap: Swap, front = false) {
    const i = queued.findIndex((q) => q.key === swap.key);
    if (i >= 0) queued.splice(i, 1);
    if (front) queued.unshift(swap); else queued.push(swap);
    pumpQueue();
  }

  // ── 接口 ────────────────────────────────────────────────────────────────
  const creature: Creature = {
    remorph(g) {
      if (!g || !g.slots) return;
      const prev = genome;
      genome = g;

      // 第一次成型：不做动画，直接是它
      if (!prev) { active.clear(); queued.length = 0; return; }

      for (const key of ALL_SLOT_KEYS) {
        const a = prev.slots?.[key];
        const b = g.slots?.[key];
        if (!b) continue;
        if (a && a.partId === b.partId) continue;      // 没变的槽位不动（这是 remorph 的全部意义）
        enqueue({ key, from: a ?? null, to: b, t: 0 });
      }
      // 预取新部件；到货前该槽位先用占位几何顶着，不阻塞帧循环
      void library.preload(partIdsOf(g));
    },

    pose(sk, presence, dt) {
      if (!genome || !sk) return;
      const step = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), TIME.dtMax) : 1 / 60;

      // 0. 真几何到货 → 丢掉用占位几何建的 mesh，下面会用新几何重建
      if (dirtyParts.size) {
        for (const [key, e] of [...meshes]) if (dirtyParts.has(e.partId)) disposeEntry(key);
        dirtyParts.clear();
      }

      // 1. 推进换装动画
      for (const [key, s] of [...active]) {
        s.t += step / Math.max(1e-3, MORPH.crossfade);
        if (s.t >= 1) active.delete(key);
      }
      pumpQueue();

      // 2. 在场缩放：ENTERING 长出来，LEAVING 缩回去（docs/05 §5）
      const pres = presence?.state === 'ENTERING' ? smoothstep(presence.transition)
        : presence?.state === 'LEAVING' ? 1 - smoothstep(presence.transition)
        : presence?.state === 'IDLE' ? 0
        : 1;

      // 3. 这一帧每个槽位画什么
      for (const key of ALL_SLOT_KEYS) {
        const pick = genome.slots?.[key];
        const s = active.get(key);
        if (s) {
          const u = smoothstep(s.t);
          const list: SlotRender[] = [];
          if (s.from) list.push({ partId: s.from.partId, materialRole: s.from.materialRole, scale: (1 - u) * pres });
          list.push({
            partId: s.to.partId, materialRole: s.to.materialRole,
            scale: u * pres,
            offset: (1 - u) * MORPH.assembleOffset,     // 从轴向外 0.15m 吸附回位
          });
          render[key] = list;
        } else if (pick) {
          render[key] = [{ partId: pick.partId, materialRole: pick.materialRole, scale: pres }];
        } else {
          render[key] = [];
        }
      }

      // 4. 装配（挂载数学全在 core/attach.ts 里）
      let instances: PartInstance[];
      try {
        instances = assemble(genome, sk, library, { render, maxInstances });
      } catch (e) {
        console.error('[creature] assemble 失败，保持上一帧', e);
        return;
      }

      // 5. 分桶 → 写 InstancedMesh
      counts.clear();
      specs.clear();
      for (const inst of instances) {
        const key = bucketKey(inst.partId, inst.mirrored, materialIdFor(inst.materialRole));
        counts.set(key, (counts.get(key) ?? 0) + 1);
        if (!specs.has(key)) specs.set(key, inst);
      }

      let triangles = 0;
      let drawCalls = 0;
      let placeholders = 0;
      cursor.clear();
      for (const [key, n] of counts) {
        const spec = specs.get(key)!;
        const e = entryFor(key, spec.partId, materialIdFor(spec.materialRole), spec.mirrored, n);
        e.mesh.count = n;
        e.mesh.visible = true;
        e.idleFrames = 0;
        cursor.set(key, 0);
        triangles += n * e.trisPerInstance;
        drawCalls++;
        if (!library.isLoaded(e.partId)) placeholders += n;
      }
      for (const [key, e] of [...meshes]) {
        if (counts.has(key)) continue;
        e.mesh.count = 0;
        e.mesh.visible = false;
        if (++e.idleFrames > IDLE_FRAMES_BEFORE_DISPOSE) disposeEntry(key);
      }

      for (const inst of instances) {
        const key = bucketKey(inst.partId, inst.mirrored, materialIdFor(inst.materialRole));
        const e = meshes.get(key);
        if (!e) continue;
        const i = cursor.get(key) ?? 0;
        if (i >= e.capacity) continue;
        tmp.fromArray(inst.matrix);
        e.mesh.setMatrixAt(i, tmp);
        cursor.set(key, i + 1);
      }
      for (const [key, e] of meshes) {
        if (counts.has(key)) e.mesh.instanceMatrix.needsUpdate = true;
      }

      stats.instances = instances.length;
      stats.triangles = triangles;
      stats.drawCalls = drawCalls;
      stats.swapsActive = active.size;
      stats.swapsQueued = queued.length;
      stats.placeholders = placeholders;
    },

    graft(slot, meta, geometry) {
      if (!genome || !meta?.id) return;
      library.register(meta, geometry);
      const prev = genome.slots?.[slot] ?? null;
      const pick: SlotPick = { partId: meta.id, materialRole: prev?.materialRole ?? 'accent' };
      genome.slots[slot] = pick;
      // 慢回路的产物是一个叙事时刻，插队到最前面
      enqueue({ key: slot, from: prev, to: pick, t: 0 }, true);
    },

    get object() { return object; },
    get genome() { return genome; },
    get stats() { return stats; },

    dispose() {
      unsubscribe();
      for (const key of [...meshes.keys()]) disposeEntry(key);
      for (const m of materials.values()) m.dispose();
      materials.clear();
      object.clear();
    },
  };

  return creature;
}
