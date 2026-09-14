/**
 * `npm run archive:read` —— 把装置那台机器上的档案读出来给人看。
 *
 * 存在的理由不是"方便"，是**仪式需要一个可以当场验的回执**（`docs/45`）。
 * 一条没人验得了的流程，做完之后没有人知道它到底成没成 ——
 * 而这条回路最坏的坏法恰恰是"看上去在跑，其实一行都没写下来"：
 * 画面照常，观众照常，只有档案是空的，而没有人会发现，因为没有人会去看那个文件。
 *
 * 所以它只做一件事：**说出有多少次到访、文件在哪、最近五条长什么样。**
 * 三样都能被肉眼核对，不需要读代码。
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = process.env.ARCHIVE_FILE ?? resolve(process.cwd(), 'archive/visits.jsonl');

if (!existsSync(file)) {
  // 不是错误。装置还没开过、或者今天还没有人来过，都是这一行。
  console.log(`还没有档案 / No archive yet\n  ${file}`);
  process.exit(0);
}

const rows = readFileSync(file, 'utf8').split('\n').filter((l) => l.trim().length > 0);
console.log(`${rows.length} 次到访 / visits\n  ${file}`);
for (const r of rows.slice(-5)) console.log(`  ${r}`);
