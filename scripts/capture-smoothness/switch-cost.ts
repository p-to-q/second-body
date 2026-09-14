// node switch-cost.ts <runDir>...  → 调速器每一次拨「后期」/「像素比」的那一刻，之后 1.5 秒里最长的那一帧（docs/48 §10）
// 调速器那一行的 `@秒` 和 long-animation-frame 的 startTime 是同一个钟（页面 performance.now）。
// 强制拨（GOV_AT）在无头 Chrome 的深链场里经常是空拨 —— 调速器自己早就走到了 L5 —— 所以只看它自己拨的那几下。
import { existsSync, readFileSync } from 'node:fs';

const WINDOW_MS = 1500;
for (const dir of process.argv.slice(2)) {
  if (!existsSync(`${dir}/probe.json`) || !existsSync(`${dir}/console.txt`)) { console.log(`== ${dir}: no probe`); continue; }
  const p = JSON.parse(readFileSync(`${dir}/probe.json`, 'utf8')) as { loaf: { s: number; d: number }[] };
  const lines = readFileSync(`${dir}/console.txt`, 'utf8').split('\n');
  const rows: string[] = [];
  for (const l of lines) {
    const m = /\[governor\] @([\d.]+)s (放下|拿回) (post|dpr)/.exec(l);
    if (!m) continue;
    const t = Number(m[1]) * 1000;
    const worst = p.loaf.filter((f) => f.s >= t - 100 && f.s <= t + WINDOW_MS).reduce((a, f) => Math.max(a, f.d), 0);
    rows.push(`${m[2] === '放下' ? 'drop' : 'restore'} ${m[3]} @${m[1]}s → worst frame ${worst || '<50'}ms`);
  }
  console.log(`== ${dir}`);
  for (const r of rows) console.log(`  ${r}`);
}
