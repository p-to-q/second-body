/** 零依赖 GLB 探针：只读 JSON chunk + accessor 边界，用于快速体检产物。 */
import { readFileSync } from 'node:fs';

export interface GlbStats {
  file: string; bytes: number; meshes: number; primitives: number;
  triangles: number; vertices: number;
  min: [number, number, number]; max: [number, number, number];
  size: [number, number, number];
  images: number; textureBytes: number; hasAnimation: boolean; hasSkin: boolean;
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
  let tris = 0, verts = 0, prims = 0;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const m of json.meshes ?? []) for (const p of m.primitives ?? []) {
    prims++;
    const pos = acc[p.attributes?.POSITION];
    if (pos) {
      verts += pos.count;
      for (let i = 0; i < 3; i++) {
        if (pos.min) min[i] = Math.min(min[i], pos.min[i]);
        if (pos.max) max[i] = Math.max(max[i], pos.max[i]);
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
  };
}
