/**
 * 素材策展 —— 回答"好的素材是不是保留"。
 *
 * 是。而且必须是**显式**保留，否则一次 prompt 改动就会把好东西悄悄重生成掉。
 *
 * 三条规则：
 *  1. `keep` 的部件**永不重新生成**，即使 recipe 变了。它已经是资产，不是配方的产物。
 *  2. `reject` 的部件不进候选池（genome 层面排除），但**文件不删** —— 判断可能会变。
 *  3. 未评级的正常参与。不评级不是错误，是默认状态。
 *
 * 判断存在 assets/parts/curation.json，跟部件文件一起进版本库：
 * 它是人的判断，是这个项目里最不该丢的东西。
 */
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PARTS_DIR } from './ledger.ts';

export type Verdict = 'keep' | 'reject';

export interface CurationEntry {
  verdict: Verdict;
  note?: string;
  at: string;
}
export type Curation = Record<string, CurationEntry>;

const PATH = resolve(PARTS_DIR, 'curation.json');

export function loadCuration(): Curation {
  if (!existsSync(PATH)) return {};
  try { return JSON.parse(readFileSync(PATH, 'utf8')); }
  catch { renameSync(PATH, PATH + '.corrupt.' + Date.now()); return {}; }
}

export function saveCuration(c: Curation): void {
  mkdirSync(PARTS_DIR, { recursive: true });
  const tmp = PATH + '.tmp';
  writeFileSync(tmp, JSON.stringify(Object.fromEntries(Object.entries(c).sort()), null, 2));
  renameSync(tmp, PATH);
}

export function setVerdict(id: string, verdict: Verdict | null, note?: string): Curation {
  const c = loadCuration();
  if (verdict === null) delete c[id];
  else c[id] = { verdict, note, at: new Date().toISOString() };
  saveCuration(c);
  return c;
}

export const isKept = (c: Curation, id: string): boolean => c[id]?.verdict === 'keep';
export const isRejected = (c: Curation, id: string): boolean => c[id]?.verdict === 'reject';
export const rejectedIds = (c: Curation): string[] =>
  Object.entries(c).filter(([, e]) => e.verdict === 'reject').map(([id]) => id);

export function summary(c: Curation): string {
  const keep = Object.values(c).filter((e) => e.verdict === 'keep').length;
  const rej = Object.values(c).filter((e) => e.verdict === 'reject').length;
  return `keep ${keep} · reject ${rej}`;
}
