/**
 * 规范化契约的可执行版本（docs/03 §6）。
 * 文档会撒谎，这个不会。合并门 `npm run check` 会跑它。
 * 没有资产时视为通过（ADR-4：无资产也能开发）。
 */
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { PARTS_DIR } from './ledger.ts';
import { glbStats } from './glb-stats.ts';
import type { PartLibraryIndex } from '../../core/src/types.ts';

const EPS = 2e-3;
const MAX_TRIS = 5000;
const MAX_BYTES = 1_500_000;   // docs/02 P5 的单件预算

export function checkParts(): number {
  const indexPath = resolve(PARTS_DIR, 'parts.json');
  if (!existsSync(indexPath)) { console.log('check:parts — 没有 parts.json，跳过（运行时会用占位几何）'); return 0; }
  const index: PartLibraryIndex = JSON.parse(readFileSync(indexPath, 'utf8'));
  const errs: string[] = [];
  const warns: string[] = [];

  if (index.convention.axis !== '+Y' || index.convention.length !== 1) errs.push('convention 与 docs/03 不符');

  const seen = new Set<string>();
  for (const p of index.parts) {
    const file = resolve(PARTS_DIR, p.file);
    if (seen.has(p.id)) errs.push(`${p.id}: id 重复`);
    seen.add(p.id);
    if (!existsSync(file)) { errs.push(`${p.id}: 文件缺失 ${p.file}`); continue; }
    const s = glbStats(file);
    if (Math.abs(s.size[1] - 1) > EPS) errs.push(`${p.id}: 长度 ${s.size[1].toFixed(4)} ≠ 1.0`);
    if (Math.abs(s.min[1]) > EPS) errs.push(`${p.id}: socketA 不在原点 y=${s.min[1].toFixed(4)}`);
    if (Math.abs((s.min[0] + s.max[0]) / 2) > EPS * 5) warns.push(`${p.id}: X 未居中 ${((s.min[0]+s.max[0])/2).toFixed(4)}`);
    if (Math.abs((s.min[2] + s.max[2]) / 2) > EPS * 5) warns.push(`${p.id}: Z 未居中 ${((s.min[2]+s.max[2])/2).toFixed(4)}`);
    if (s.triangles > MAX_TRIS) errs.push(`${p.id}: ${s.triangles} tris > ${MAX_TRIS}`);
    if (s.bytes > MAX_BYTES) errs.push(`${p.id}: ${(s.bytes/1e6).toFixed(1)} MB > ${(MAX_BYTES/1e6).toFixed(1)} MB（多半是 prune 没跑，旧 buffer 还在）`);
    if (s.meshes !== 1) warns.push(`${p.id}: ${s.meshes} 个 mesh（契约要求 1）`);
    if (s.hasAnimation || s.hasSkin) errs.push(`${p.id}: 含动画/骨骼`);
    if (s.images > 0) warns.push(`${p.id}: 仍带 ${s.images} 张贴图（应在规范化时删掉）`);
    if (Math.abs(p.localGirth - Math.max(s.size[0], s.size[2])) > EPS * 5) errs.push(`${p.id}: localGirth 与几何不符`);
  }

  // 槽位覆盖：任一 tier 下，每个骨头槽位都要至少有一个候选，否则运行时会大面积回退占位
  const SLOTS = ['head','spine','clavicle','upperArm','foreArm','hand','thigh','shin','foot','joint'];
  for (const t of [1, 2, 3]) for (const slot of SLOTS) {
    if (!index.parts.some((p) => p.slot === slot && p.tier <= t)) warns.push(`tier${t} 的 ${slot} 槽位没有候选`);
  }

  for (const w of warns) console.warn('  ⚠ ' + w);
  for (const e of errs) console.error('  ✗ ' + e);
  console.log(`check:parts — ${index.parts.length} 件, ${errs.length} 错, ${warns.length} 警告`);
  return errs.length ? 1 : 0;
}

// 注意：路径含非 ASCII 时 import.meta.url 会被百分号编码，必须用 pathToFileURL 比较
if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(checkParts());
