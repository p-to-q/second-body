/**
 * 规范化流水线 —— 把 Rodin 原始产物变成满足 docs/03 §6 契约的部件。
 * 保证：主轴 +Y、socketA 在原点、长度 1.0、横向居中、单 mesh、无贴图、无动画/骨骼。
 * 必须幂等（再跑一次结果不变）。
 */
import { NodeIO, Document } from '@gltf-transform/core';
import { dedup, flatten, join, prune, weld, clearNodeTransform, transformMesh, simplify } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RECIPES, recipeById } from '../recipes/catalog.ts';
import { load, save, RAW_DIR, PARTS_DIR } from './ledger.ts';
import type { PartMeta, Vec3 } from '../../core/src/types.ts';

const MAX_TRIS = 5000;

const io = new NodeIO();

type M4 = number[]; // 列主序

const ident = (): M4 => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
function mul(a: M4, b: M4): M4 {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    o[c*4+r] = a[0*4+r]*b[c*4+0] + a[1*4+r]*b[c*4+1] + a[2*4+r]*b[c*4+2] + a[3*4+r]*b[c*4+3];
  return o;
}
const trs = (t: Vec3, s: Vec3): M4 => [s[0],0,0,0, 0,s[1],0,0, 0,0,s[2],0, t[0],t[1],t[2],1];
/** 把 axis(0=X,1=Y,2=Z) 旋到 +Y 的最小旋转（90° 的整数倍，保持右手系） */
function rotAxisToY(axis: number): M4 {
  if (axis === 1) return ident();
  if (axis === 0) return [0,1,0,0, -1,0,0,0, 0,0,1,0, 0,0,0,1];  // X→Y
  return [1,0,0,0, 0,0,-1,0, 0,1,0,0, 0,0,0,1];                   // Z→Y
}
/** 绕 X 轴 180°：把长轴上下翻转 */
const flipX180 = (): M4 => [1,0,0,0, 0,-1,0,0, 0,0,-1,0, 0,0,0,1];

function positionsOf(doc: Document): Float32Array[] {
  const out: Float32Array[] = [];
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (pos) out.push(pos.getArray() as Float32Array);
    }
  return out;
}

function bounds(arrs: Float32Array[]) {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const a of arrs) for (let i = 0; i < a.length; i += 3)
    for (let k = 0; k < 3; k++) { const v = a[i+k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
  return { min, max, size: [max[0]-min[0], max[1]-min[1], max[2]-min[2]] as Vec3 };
}

function applyMatrix(doc: Document, m: M4) {
  for (const mesh of doc.getRoot().listMeshes()) transformMesh(mesh, m as any);
}

/** 两端平均半径，用来决定哪一端是 socketA（粗的一端接近躯干） */
function endRadii(arrs: Float32Array[], min: Vec3, max: Vec3) {
  const y0 = min[1], h = max[1] - y0 || 1;
  const cx = (min[0]+max[0])/2, cz = (min[2]+max[2])/2;
  let loSum = 0, loN = 0, hiSum = 0, hiN = 0;
  for (const a of arrs) for (let i = 0; i < a.length; i += 3) {
    const t = (a[i+1] - y0) / h;
    const r = Math.hypot(a[i] - cx, a[i+2] - cz);
    if (t < 0.18) { loSum += r; loN++; } else if (t > 0.82) { hiSum += r; hiN++; }
  }
  return { lo: loN ? loSum/loN : 0, hi: hiN ? hiSum/hiN : 0 };
}


/**
 * 容差焊接。
 * 为什么需要：@gltf-transform 的 weld() 只做**精确**位置匹配，而 Rodin 偶尔返回
 * 完全未焊接、顶点坐标带浮点噪声的原始网格（实测 50 件里 2 件，1.5M / 439k tris）。
 * 未焊接的网格 meshoptimizer 收不动 —— 它只能塌陷共享顶点的边。
 * 这里按空间网格把位置量化后合并，并对法线取平均，这样减面才真的能跑下去。
 * 只保留 POSITION / NORMAL：贴图和 UV 在上一步已经被丢掉了（docs/03 §4）。
 */
function weldTolerant(doc: Document, relTol = 1e-4): number {
  let merged = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const posAcc = prim.getAttribute('POSITION');
      if (!posAcc) continue;
      const pos = posAcc.getArray() as Float32Array;
      const nrmAcc = prim.getAttribute('NORMAL');
      const nrm = nrmAcc?.getArray() as Float32Array | undefined;
      const idxAcc = prim.getIndices();
      const count = posAcc.getCount();
      const idx: number[] = idxAcc
        ? Array.from(idxAcc.getArray() as ArrayLike<number>)
        : Array.from({ length: count }, (_, i) => i);

      const b = bounds([pos]);
      const diag = Math.hypot(b.size[0], b.size[1], b.size[2]) || 1;
      const cell = diag * relTol;

      const map = new Map<string, number>();
      const remap = new Int32Array(count);
      const outPos: number[] = [];
      const outNrm: number[] = [];
      for (let i = 0; i < count; i++) {
        const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        const k = `${Math.round(x / cell)},${Math.round(y / cell)},${Math.round(z / cell)}`;
        let at = map.get(k);
        if (at === undefined) {
          at = outPos.length / 3;
          map.set(k, at);
          outPos.push(x, y, z);
          outNrm.push(nrm ? nrm[i * 3] : 0, nrm ? nrm[i * 3 + 1] : 0, nrm ? nrm[i * 3 + 2] : 0);
        } else if (nrm) {
          outNrm[at * 3] += nrm[i * 3]; outNrm[at * 3 + 1] += nrm[i * 3 + 1]; outNrm[at * 3 + 2] += nrm[i * 3 + 2];
        }
        remap[i] = at;
      }
      const newCount = outPos.length / 3;
      if (newCount >= count) continue;          // 没什么可合并的，别白写
      merged += count - newCount;

      for (let i = 0; i < newCount; i++) {
        const l = Math.hypot(outNrm[i * 3], outNrm[i * 3 + 1], outNrm[i * 3 + 2]);
        if (l > 1e-8) { outNrm[i * 3] /= l; outNrm[i * 3 + 1] /= l; outNrm[i * 3 + 2] /= l; }
        else { outNrm[i * 3] = 0; outNrm[i * 3 + 1] = 1; outNrm[i * 3 + 2] = 0; }
      }

      // 丢掉退化三角形（三个角落到了同一个焊接点）
      const outIdx: number[] = [];
      for (let t = 0; t + 2 < idx.length; t += 3) {
        const a = remap[idx[t]], bb = remap[idx[t + 1]], c = remap[idx[t + 2]];
        if (a !== bb && bb !== c && a !== c) outIdx.push(a, bb, c);
      }

      const buf = doc.getRoot().listBuffers()[0];
      for (const name of prim.listSemantics()) if (name !== 'POSITION' && name !== 'NORMAL') prim.setAttribute(name, null);
      prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(outPos)).setBuffer(buf));
      prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(outNrm)).setBuffer(buf));
      prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(outIdx)).setBuffer(buf));
    }
  }
  return merged;
}

export interface NormalizeResult { meta: PartMeta; warnings: string[]; orient: string; }

export async function normalizeOne(id: string, rawFile: string): Promise<NormalizeResult> {
  const recipe = recipeById(id);
  const warnings: string[] = [];
  const doc = await io.read(rawFile);

  // 1) 结构清理：烘掉节点变换，合并成单 mesh
  await doc.transform(flatten(), dedup(), join(), weld(), prune());
  for (const node of doc.getRoot().listNodes()) if (node.getMesh()) clearNodeTransform(node);

  // 2) 扔掉贴图与材质（运行时统一套我们自己的材质，docs/03 §4）
  for (const t of doc.getRoot().listTextures()) t.dispose();
  for (const m of doc.getRoot().listMaterials()) {
    m.setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(0.8);
  }
  for (const a of doc.getRoot().listAnimations()) a.dispose();
  for (const s of doc.getRoot().listSkins()) s.dispose();

  // 3) 减面（通常用不到：quality_override 已经给到 ~3k）
  const triCountOf = () => doc.getRoot().listMeshes()
    .flatMap((m) => m.listPrimitives())
    .reduce((s, p) => s + Math.floor(((p.getIndices()?.getCount() ?? p.getAttribute('POSITION')?.getCount()) ?? 0) / 3), 0);
  // Rodin 不保证遵守 quality_override：实测 50 件里有 2 件返回了未减面的原始网格
  // （1.5M / 439k tris）。所以减面不是可选的优化，是流水线必须兜住的一步（docs/07 §5 U11）。
  if (triCountOf() > MAX_TRIS) {
    await MeshoptSimplifier.ready;
    const before = triCountOf();
    const mergedVerts = weldTolerant(doc);      // 必须先焊接，否则 meshopt 收不动
    if (mergedVerts) warnings.push(`容差焊接合并了 ${mergedVerts} 个顶点`);
    // 逐级放宽误差预算，直到进预算为止。硬表面件放宽到 0.2 也还能看。
    for (const error of [0.005, 0.02, 0.05, 0.1, 0.2]) {
      await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: MAX_TRIS / triCountOf(), error }));
      if (triCountOf() <= MAX_TRIS) { warnings.push(`减面 ${before}→${triCountOf()} (error=${error})`); break; }
    }
    if (triCountOf() > MAX_TRIS) warnings.push(`simplify 未达标: ${before}→${triCountOf()} tris，需要人工处理`);
  }

  // 4) 主轴 → +Y
  let b = bounds(positionsOf(doc));
  const longest = b.size.indexOf(Math.max(...b.size));
  if (longest !== 1) applyMatrix(doc, rotAxisToY(longest));

  // 5) 粗端朝下（socketA 接近躯干）
  b = bounds(positionsOf(doc));
  const r = endRadii(positionsOf(doc), b.min, b.max);
  const auto = r.hi > r.lo * 1.12;
  const wantFlip = recipe?.flip !== undefined ? recipe.flip : auto;
  if (wantFlip) applyMatrix(doc, flipX180());
  const orient = `r(lo=${r.lo.toFixed(3)},hi=${r.hi.toFixed(3)}) auto=${auto} flip=${wantFlip}`;

  // 6) 平移 + 缩放：socketA 到原点，长度 1，X/Z 居中
  b = bounds(positionsOf(doc));
  const h = b.size[1] || 1e-6;
  const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
  applyMatrix(doc, mul(trs([0,0,0], [1/h, 1/h, 1/h]), trs([-cx, -b.min[1], -cz], [1,1,1])));

  // 7) 写出（先 prune：焊接/减面会留下被解引用但仍在图里的 accessor，
  //    不 prune 的话旧 buffer 数据会照样被写进文件 —— 实测 4.8k 面的件能写出 66 MB）
  await doc.transform(prune(), dedup());
  mkdirSync(PARTS_DIR, { recursive: true });
  const outPath = resolve(PARTS_DIR, `${id}.glb`);
  writeFileSync(outPath, await io.writeBinary(doc));

  const fb = bounds(positionsOf(doc));
  const tris = triCountOf();
  if (Math.abs(fb.size[1] - 1) > 1e-3) warnings.push(`长度不是 1.0: ${fb.size[1].toFixed(4)}`);
  if (Math.abs(fb.min[1]) > 1e-3) warnings.push(`socketA 不在原点: y=${fb.min[1].toFixed(4)}`);
  if (tris > MAX_TRIS) warnings.push(`面数超预算: ${tris}`);

  const girth = Math.max(fb.size[0], fb.size[2]);
  const meta: PartMeta = {
    id,
    slot: recipe?.slot ?? ('spine' as any),
    tier: recipe?.tier ?? 1,
    file: `${id}.glb`,
    family: recipe?.theme ?? 'unknown',
    localGirth: +girth.toFixed(4),
    triCount: tris,
    aabb: { min: fb.min, max: fb.max },
    symmetry: recipe?.partSymmetry ?? 'none',
    source: { provider: 'hyper3d', model: 'Gen-2.5-Low', seed: recipe?.seed, recipeId: id },
  };
  return { meta, warnings, orient };
}

export async function normalizeAll(opt: { only?: string[] } = {}): Promise<PartMeta[]> {
  const ledger = load();
  const metas: PartMeta[] = [];
  const ids = readdirSync(RAW_DIR)
    .filter((d) => statSync(resolve(RAW_DIR, d)).isDirectory())
    .filter((d) => !opt.only || opt.only.includes(d));
  for (const id of ids) {
    const dir = resolve(RAW_DIR, id);
    const glb = readdirSync(dir).find((f) => f.endsWith('.glb'));
    if (!glb) { console.warn(`  – ${id}: 没有 glb，跳过`); continue; }
    try {
      const { meta, warnings, orient } = await normalizeOne(id, resolve(dir, glb));
      metas.push(meta);
      if (ledger.entries[id]) { ledger.entries[id].status = 'normalized'; }
      const w = warnings.length ? '  ⚠ ' + warnings.join('; ') : '';
      console.log(`  ✓ ${id.padEnd(22)} ${String(meta.triCount).padStart(5)} tris  girth=${meta.localGirth.toFixed(3)}  ${orient}${w}`);
    } catch (e) {
      console.error(`  ✗ ${id}: ${(e as Error).message}`);
    }
  }
  save(ledger);
  writeFileSync(resolve(PARTS_DIR, '_metas.json'), JSON.stringify(metas, null, 2));
  console.log(`\n规范化 ${metas.length} 件 → assets/parts/`);
  return metas;
}
