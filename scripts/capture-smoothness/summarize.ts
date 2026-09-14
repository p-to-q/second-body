// node summarize.ts <runDir>...  → one block per run, same numbers every time (docs/48)
import { existsSync, readFileSync } from 'node:fs';

const pct = (xs: number[], q: number) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((q / 100) * s.length))];
};
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '—');
const stat = (xs: number[]) =>
  `n=${xs.length} p50=${f1(pct(xs, 50))} p95=${f1(pct(xs, 95))} p99=${f1(pct(xs, 99))} max=${f1(Math.max(...xs, NaN))} >25ms=${xs.filter((x) => x > 25).length} >50ms=${xs.filter((x) => x > 50).length}`;

for (const dir of process.argv.slice(2)) {
  if (!existsSync(`${dir}/probe.json`)) { console.log(`== ${dir}: no probe`); continue; }
  const p = JSON.parse(readFileSync(`${dir}/probe.json`, 'utf8'));
  const c: number = p.click;
  const rel = (x: number | null) => (x == null ? '—' : String(Math.round(x - c)));
  const r: number[] = p.raf;
  const iv: [number, number][] = [];
  for (let i = 1; i < r.length; i++) iv.push([r[i] - c, r[i] - r[i - 1]]);
  const gum = (p.gum ?? c) - c;
  const settle = ((p.firstPose ?? p.videoInDom ?? c) - c) + 1500;
  const before = iv.filter(([t]) => t >= -5000 && t < 0).map((x) => x[1]);
  const startup = iv.filter(([t]) => t >= 0 && t < settle).map((x) => x[1]);
  const still: number[] = [];
  const motion: number[] = [];
  for (const [t, d] of iv) {
    if (t < settle) continue;
    const ph = ((t - gum) / 1000) % 20;
    if (ph > 1 && ph < 7.5) still.push(d);
    else if (ph > 8.5 && ph < 19.5) motion.push(d);
  }
  const lt = (p.lt as [number, number][]).filter(([s]) => s >= c - 200).map(([s, d]) => [Math.round(s - c), d]);
  const loaf = (p.loaf as { s: number; d: number; scripts: [string, string, string, number][] }[])
    .filter((l) => l.s >= c - 200 && l.d >= 50)
    // ALL=1 → 按时刻列出全部 ≥50ms 的帧（对 `[governor] @秒` 行用）；缺省是最重的 6 个
    .sort((a, b) => (process.env.ALL === '1' ? a.s - b.s : b.d - a.d)).slice(0, process.env.ALL === '1' ? 200 : 6)
    .map((l) => `${Math.round(l.s - c)}ms:${l.d}ms[${l.scripts.filter((s) => s[3] > 5).map((s) => `${s[0].replace(/-[A-Za-z0-9_]{8}\.js$/, '')}:${s[1] || s[2]}=${s[3]}`).join(',')}]`);
  const consoleTxt = existsSync(`${dir}/console.txt`) ? readFileSync(`${dir}/console.txt`, 'utf8') : '';
  const pick = (re: RegExp) => consoleTxt.split('\n').filter((l) => re.test(l)).map((l) => l.slice(0, 160));
  console.log(`== ${dir}`);
  console.log(`  click→gum ${rel(p.gum)} · video ${rel(p.videoInDom)} · firstFrame ${rel(p.firstVideoFrame)} · firstPose ${rel(p.firstPose)}`);
  console.log(`  before-click 5s  ${stat(before)}`);
  console.log(`  startup          ${stat(startup)}`);
  console.log(`  still            ${stat(still)}`);
  console.log(`  motion           ${stat(motion)}`);
  console.log(`  longtasks after click: ${lt.length} total ${lt.reduce((a, b) => a + b[1], 0)}ms ${JSON.stringify(lt.slice(0, 10))}`);
  console.log(`  worst LoAF: ${loaf.join(' ')}`);
  for (const l of pick(/\[governor\]|姿态 worker|ImageSegmenter|capture\(|EXC|degrade/)) console.log(`  | ${l}`);
  const hud = pick(/^HUD/)[0];
  if (hud) console.log(`  | ${hud.replace(/cam \S+figure\.y4m/, 'cam <fake>').slice(0, 200)}`);
}
