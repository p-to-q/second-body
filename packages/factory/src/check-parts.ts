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

async function importCuration() { return await import('./curation.ts'); }

export async function checkParts(): Promise<number> {
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

  const { loadCuration, summary } = await importCuration();
  const cur = loadCuration();
  const rejected = Object.entries(cur).filter(([, e]) => e.verdict === 'reject').map(([id]) => id);
  const stillIndexed = rejected.filter((id) => index.parts.some((p) => p.id === id));
  if (stillIndexed.length) {
    // 这句话以前是假的：它写着「genome 会排除它们」，而当时**没有任何调用者**把
    // rejected 传进 makeGenome。检查每次都绿，问的却是让人舒服的那个问题（docs/02 P21）。
    // 现在排除是真的发生的：app 层 `createPartLibrary` 拉 /parts/curation.json，
    // 把 reject 的 id 传给 `makeGenome({ rejected })`。文件保留仍然是故意的（curation.ts 规则 2）。
    warns.push(`${stillIndexed.length} 件已标 reject 但仍在 parts.json 里：`
      + `运行时由 curation.json → makeGenome({ rejected }) 排除，文件保留是故意的（${stillIndexed.join(', ')}）`);

    // 这一条才是「坏掉时会变样」的那个仪表：某个物种的自有件被 reject 光了。
    // 它不会消失（名单只看 tier，不看策展），但它整具都要沿 base 链借件 ——
    // 借不到就只剩占位几何，那是一个物种事实上的死亡，必须当场看见。
    const rejectedSet = new Set(rejected);
    const own = (fam: string, curated: boolean) =>
      index.parts.filter((p) => p.family === fam && (!curated || !rejectedSet.has(p.id))).length;
    for (const t of index.themes ?? []) {
      if (!own(t.id, false) || own(t.id, true)) continue;      // 本来就没自有件 / 还剩自有件
      // 沿整条 base 链找第一个还供得上件的祖先（genome.ts 的 baseChain 就是这么走的）
      let cur = t.base, donor: string | undefined, seen = new Set([t.id]);
      while (cur && !seen.has(cur)) {
        seen.add(cur);
        if (own(cur, true)) { donor = cur; break; }
        cur = (index.themes ?? []).find((x) => x.id === cur)?.base;
      }
      const msg = `${t.id}: 自有件已被 reject 光，整具沿 base 链借件`;
      if (donor) warns.push(`${msg}（← ${donor}）`);
      else errs.push(`${msg}，但 base 链上没有一层供得上件 —— 这个物种只会出占位几何`);
    }
  }
  console.log(`  策展: ${summary(cur)}`);

  for (const w of warns) console.warn('  ⚠ ' + w);
  for (const e of errs) console.error('  ✗ ' + e);
  console.log(`check:parts — ${index.parts.length} 件, ${errs.length} 错, ${warns.length} 警告`);
  return errs.length ? 1 : 0;
}

// 注意：路径含非 ASCII 时 import.meta.url 会被百分号编码，必须用 pathToFileURL 比较
if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(await checkParts());
