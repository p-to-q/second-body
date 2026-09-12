/** 由 _metas.json + materials 组装出运行时读的 parts.json（docs/03 §2）。 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PARTS_DIR } from './ledger.ts';
import { MATERIALS } from '../recipes/materials.ts';
import { ROSTER } from '../recipes/roster.ts';
import type { PartLibraryIndex, PartMeta } from '../../core/src/types.ts';

export async function buildIndex(): Promise<PartLibraryIndex> {
  const metaPath = resolve(PARTS_DIR, '_metas.json');
  if (!existsSync(metaPath)) throw new Error('缺 _metas.json：先跑 npm run factory:normalize');
  const parts: PartMeta[] = JSON.parse(readFileSync(metaPath, 'utf8'));
  const index: PartLibraryIndex = {
    version: 1,
    generatedAt: new Date().toISOString(),
    units: 'meters',
    convention: { axis: '+Y', socketA: [0, 0, 0], socketB: [0, 1, 0], length: 1 },
    themes: ROSTER.map((t) => ({
      id: t.id, kind: t.kind, name: t.name, nameEn: t.nameEn, tagline: t.tagline,
      palette: t.palette, source: t.source, axes: t.axes, coverage: t.coverage, base: t.base,
      bodyPlan: t.bodyPlan,
    })),
    materials: MATERIALS,
    parts: parts.slice().sort((a, b) => a.id.localeCompare(b.id)),
  };
  writeFileSync(resolve(PARTS_DIR, 'parts.json'), JSON.stringify(index, null, 2));
  const bySlot = new Map<string, number>();
  for (const p of parts) bySlot.set(p.slot, (bySlot.get(p.slot) ?? 0) + 1);
  console.log(`parts.json: ${parts.length} 件, ${MATERIALS.length} 材质, ${ROSTER.length} 条目`);
  console.log('每槽位:', [...bySlot.entries()].map(([k, v]) => `${k}=${v}`).join(' '));
  return index;
}
