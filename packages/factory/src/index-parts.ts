/** 由 _metas.json + materials 组装出运行时读的 parts.json（docs/03 §2）。 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PARTS_DIR } from './ledger.ts';
import { MATERIALS } from '../recipes/materials.ts';
import { isPublic, ROSTER } from '../recipes/roster.ts';
import type { PartLibraryIndex, PartMeta } from '../../core/src/types.ts';

export async function buildIndex(): Promise<PartLibraryIndex> {
  const metaPath = resolve(PARTS_DIR, '_metas.json');
  if (!existsSync(metaPath)) throw new Error('缺 _metas.json：先跑 npm run factory:normalize');
  const parts: PartMeta[] = JSON.parse(readFileSync(metaPath, 'utf8'));

  /**
   * 按物种整体换，不按槽位穿插（docs/26 §H 的策展决定，这里是它的可执行版本）。
   *
   * 规则：**一个 family 只要有一件真实网格，它的生成件就整批不进索引。**
   * 文件一件都不删 —— 它们还在 `assets/parts/` 里，随时可以让这条规则失效再回来。
   *
   * 为什么是一条规则而不是一张退役名单：名单会和现实分叉（今天 32 件，
   * 下次换第四个物种就得有人记得去加）。规则不会 —— 它读的是件自己带的
   * `source.provider`，而那是规范化时写进去的事实。
   *
   * 为什么不走 `curation.json`：那个文件里的 `reject` 有一个已经被用掉的具体含义 ——
   * 「一个人用眼睛看过之后剔掉的」，立场海报上唯一的颜色就是那十件。
   * 这 32 件不是坏件，它们是被一个策展决定换下来的。混进去，那句话当场变成假的。
   * 而且 `reject` 今天并不真的挡住任何东西：`makeGenome` 有 `rejected` 选项，
   * 但仓库里没有一个调用者传它。
   */
  const realFamilies = new Set(
    parts.filter((p) => p.source?.provider === 'harvest').map((p) => p.family),
  );
  const indexed = parts.filter(
    (p) => !realFamilies.has(p.family) || p.source?.provider === 'harvest',
  );
  const retired = parts.length - indexed.length;

  /**
   * `clearance` 门（docs/14 §2）在这里执行 —— 以前它**没有执行者**。
   *
   * 门的原话是「不该进公开构建」，而这一行写出来的 parts.json 就是进 dist 的
   * 那一份：整个 ROSTER 原样抄进去，从来不问 `isPublic()`（docs/39 §3 的 clearance 一行）。
   * 没出事只是因为唯一一个非 `own` 的条目正好没有件 —— 「没出事」不是「有门」。
   *
   * 对 `guest.founder` 还有第二层意思：它是一个**故意的空位**（docs/14 §2）。
   * 空位应该**看得见地缺席**，而不是在档案页和计数里都在、点下去却是别的物种。
   * 挡在这里，它就不在 parts.json 的条目表里，选择页与 `makeGenome` 同时看不到它。
   */
  const themes = ROSTER.filter((t) => {
    const ok = isPublic(t);
    if (!ok) console.log(`  clearance: ${t.id}（${t.clearance}）不进公开构建的条目表（docs/14 §2）`);
    return ok;
  });

  const index: PartLibraryIndex = {
    version: 1,
    generatedAt: new Date().toISOString(),
    units: 'meters',
    convention: { axis: '+Y', socketA: [0, 0, 0], socketB: [0, 1, 0], length: 1 },
    themes: themes.map((t) => ({
      id: t.id, kind: t.kind, name: t.name, nameEn: t.nameEn, tagline: t.tagline, taglineEn: t.taglineEn,
      palette: t.palette, source: t.source, axes: t.axes, coverage: t.coverage, base: t.base,
      bodyPlan: t.bodyPlan,
    })),
    materials: MATERIALS,
    parts: indexed.slice().sort((a, b) => a.id.localeCompare(b.id)),
  };
  writeFileSync(resolve(PARTS_DIR, 'parts.json'), JSON.stringify(index, null, 2));
  const bySlot = new Map<string, number>();
  for (const p of indexed) bySlot.set(p.slot, (bySlot.get(p.slot) ?? 0) + 1);
  console.log(`parts.json: ${indexed.length} 件, ${MATERIALS.length} 材质, ${themes.length}/${ROSTER.length} 条目（clearance 挡掉 ${ROSTER.length - themes.length}）`
    + (retired ? `（${[...realFamilies].sort().join(' / ')} 已整具换成真实网格，${retired} 件生成件留在盘上但不进索引）` : ''));
  console.log('每槽位:', [...bySlot.entries()].map(([k, v]) => `${k}=${v}`).join(' '));
  return index;
}
