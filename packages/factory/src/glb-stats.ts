/**
 * 零依赖 GLB 探针：只读 JSON chunk + accessor 边界，用于快速体检产物。
 *
 * **为什么要算节点变换**：部件启用 meshopt 压缩后，位置属性被 `KHR_mesh_quantization`
 * 量化成整数/归一化整数，真实尺寸挪到了节点的 translation/scale 上。
 * 只读 accessor.min/max 会读出 `[-32767, 32767]` 这种量化坐标 —— 于是
 * 「长度 = 1.0」这条契约会被误判成错。这里按 **渲染器看到的世界空间** 算边界：
 * 先反归一化，再乘上该 mesh 所在节点的世界矩阵。
 * 未量化的旧产物节点矩阵是单位阵，结果与以前逐字节相同（改前改后 check:parts 对过）。
 */
import { readFileSync } from 'node:fs';

export interface GlbStats {
  file: string; bytes: number; meshes: number; primitives: number;
  triangles: number; vertices: number;
  min: [number, number, number]; max: [number, number, number];
  size: [number, number, number];
  images: number; textureBytes: number; hasAnimation: boolean; hasSkin: boolean;
  /** `extensionsUsed`。有 `EXT_meshopt_compression` = 已经压过，别再压第二遍（会二次量化） */
  extensions: string[];
}

type V3 = [number, number, number];
type M4 = number[];   // 列主序，和 glTF 一致

const IDENT: M4 = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];

function mul(a: M4, b: M4): M4 {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    o[c*4+r] = a[0*4+r]*b[c*4+0] + a[1*4+r]*b[c*4+1] + a[2*4+r]*b[c*4+2] + a[3*4+r]*b[c*4+3];
  return o;
}

/** 节点的 TRS（或直接给出的 matrix）→ 列主序矩阵 */
function nodeMatrix(n: any): M4 {
  if (Array.isArray(n?.matrix) && n.matrix.length === 16) return n.matrix as M4;
  const [tx, ty, tz] = n?.translation ?? [0, 0, 0];
  const [sx, sy, sz] = n?.scale ?? [1, 1, 1];
  const [x, y, z, w] = n?.rotation ?? [0, 0, 0, 1];
  const r: M4 = [
    1-2*(y*y+z*z), 2*(x*y+z*w),   2*(x*z-y*w),   0,
    2*(x*y-z*w),   1-2*(x*x+z*z), 2*(y*z+x*w),   0,
    2*(x*z+y*w),   2*(y*z-x*w),   1-2*(x*x+y*y), 0,
    0, 0, 0, 1,
  ];
  const s: M4 = [sx,0,0,0, 0,sy,0,0, 0,0,sz,0, 0,0,0,1];
  const m = mul(r, s);
  m[12] = tx; m[13] = ty; m[14] = tz;
  return m;
}

/** meshIndex → 引用它的每个节点的世界矩阵 */
function meshWorldMatrices(json: any): Map<number, M4[]> {
  const out = new Map<number, M4[]>();
  const nodes = json.nodes ?? [];
  const roots: number[] = json.scenes?.[json.scene ?? 0]?.nodes ?? nodes.map((_: unknown, i: number) => i);
  const walk = (i: number, parent: M4, depth: number) => {
    const n = nodes[i];
    if (!n || depth > 32) return;          // 深度上限：坏文件里的环不该让体检工具挂住
    const m = mul(parent, nodeMatrix(n));
    if (typeof n.mesh === 'number') {
      const list = out.get(n.mesh) ?? [];
      list.push(m);
      out.set(n.mesh, list);
    }
    for (const c of n.children ?? []) walk(c, m, depth + 1);
  };
  for (const r of roots) walk(r, IDENT, 0);
  return out;
}

/** 归一化整数 accessor 的反归一化系数（`KHR_mesh_quantization` 的一半故事，另一半在节点缩放上） */
function dequantScale(acc: any): number {
  if (!acc.normalized) return 1;
  switch (acc.componentType) {
    case 5120: return 1 / 127;      // BYTE
    case 5121: return 1 / 255;      // UNSIGNED_BYTE
    case 5122: return 1 / 32767;    // SHORT
    case 5123: return 1 / 65535;    // UNSIGNED_SHORT
    default: return 1;
  }
}

/** AABB 过矩阵：变换八个角再取包围盒（有旋转时这是唯一正确的做法） */
function transformAabb(lo: V3, hi: V3, m: M4): { min: V3; max: V3 } {
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (let c = 0; c < 8; c++) {
    const p: V3 = [c & 1 ? hi[0] : lo[0], c & 2 ? hi[1] : lo[1], c & 4 ? hi[2] : lo[2]];
    for (let r = 0; r < 3; r++) {
      const v = m[0*4+r]*p[0] + m[1*4+r]*p[1] + m[2*4+r]*p[2] + m[3*4+r];
      if (v < min[r]) min[r] = v;
      if (v > max[r]) max[r] = v;
    }
  }
  return { min, max };
}

export function glbStats(path: string): GlbStats {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a glb: ' + path);
  let off = 12, json: any = null, binLen = 0;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    else binLen += len;
    off += 8 + len + ((4 - (len % 4)) % 4);
  }
  const acc = json.accessors ?? [];
  const world = meshWorldMatrices(json);
  let tris = 0, verts = 0, prims = 0;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const [mi, m] of (json.meshes ?? []).entries()) for (const p of m.primitives ?? []) {
    prims++;
    const pos = acc[p.attributes?.POSITION];
    if (pos) {
      verts += pos.count;
      if (pos.min && pos.max) {
        const s = dequantScale(pos);
        const lo = pos.min.map((v: number) => v * s) as V3;
        const hi = pos.max.map((v: number) => v * s) as V3;
        // 同一个 mesh 可能被多个节点引用（我们的部件只有一个，多的也照样算进去）
        for (const mat of world.get(mi) ?? [IDENT]) {
          const b = transformAabb(lo, hi, mat);
          for (let i = 0; i < 3; i++) {
            min[i] = Math.min(min[i], b.min[i]);
            max[i] = Math.max(max[i], b.max[i]);
          }
        }
      }
    }
    const idx = acc[p.indices];
    tris += Math.floor(((idx ? idx.count : pos?.count) ?? 0) / 3);
  }
  return {
    file: path, bytes: buf.length,
    meshes: (json.meshes ?? []).length, primitives: prims,
    triangles: tris, vertices: verts,
    min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    images: (json.images ?? []).length, textureBytes: binLen,
    hasAnimation: !!json.animations?.length, hasSkin: !!json.skins?.length,
    extensions: json.extensionsUsed ?? [],
  };
}
