/** 生成台账 —— 幂等的来源（P9 / docs/03 §5）。 */
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const RAW_DIR = resolve(ROOT, 'assets/raw');
export const PARTS_DIR = resolve(ROOT, 'assets/parts');
const LEDGER_PATH = resolve(RAW_DIR, 'ledger.json');

export type EntryStatus = 'queued' | 'generating' | 'done' | 'normalized' | 'failed';

export interface LedgerEntry {
  recipeHash: string;
  taskUuid?: string;
  subscriptionKey?: string;
  status: EntryStatus;
  consumed?: number;
  files?: string[];
  submittedAt?: string;
  completedAt?: string;
  error?: string | null;
  durationSec?: number;
}

export interface Ledger {
  entries: Record<string, LedgerEntry>;
  totalConsumed: number;
}

export function hashRecipe(r: unknown): string {
  return 'sha256:' + createHash('sha256').update(JSON.stringify(r)).digest('hex').slice(0, 16);
}

export function load(): Ledger {
  mkdirSync(RAW_DIR, { recursive: true });
  if (!existsSync(LEDGER_PATH)) return { entries: {}, totalConsumed: 0 };
  try {
    return JSON.parse(readFileSync(LEDGER_PATH, 'utf8'));
  } catch {
    // 损坏就备份后重来，不要因为台账炸掉整批生成
    renameSync(LEDGER_PATH, LEDGER_PATH + '.corrupt.' + Date.now());
    return { entries: {}, totalConsumed: 0 };
  }
}

export function save(l: Ledger): void {
  mkdirSync(RAW_DIR, { recursive: true });
  const tmp = LEDGER_PATH + '.tmp';
  writeFileSync(tmp, JSON.stringify(l, null, 2));
  renameSync(tmp, LEDGER_PATH);           // 原子替换，防止中途断电写坏
}

/** 需要（重新）生成吗？ */
export function needsRun(l: Ledger, id: string, hash: string): boolean {
  const e = l.entries[id];
  if (!e) return true;
  if (e.recipeHash !== hash) return true;
  return e.status !== 'done' && e.status !== 'normalized';
}
