// White-frame tally across repeated runs (docs/47 §4.3).
//   node scripts/transitions/tally.mjs <runDir> [<runDir> …]
// A "white frame" is a screencast frame after the action with mean colour #ffffff and luma spread 0:
// a blank white composite. The label/chooser paper is #fafafa with text (spread > 0), so it never counts.
// Also prints, per hop, which transition pair the new page stamped (data-vt-reveal) in the last run.
import { existsSync, readFileSync } from 'node:fs';

const dirs = process.argv.slice(2).filter((d) => existsSync(`${d}/results.json`));
if (!dirs.length) { console.error('no run dirs with results.json'); process.exit(1); }
const hops = new Map();
for (const d of dirs) {
  for (const r of JSON.parse(readFileSync(`${d}/results.json`, 'utf8'))) {
    const id = r.hop.split(' ')[0];
    const h = hops.get(id) ?? { name: r.hop, runs: 0, white: 0, whiteMs: 0, jumps: [], vt: '', errors: 0, leftover: 0, ready: [] };
    h.runs++;
    if (r.error || r.readyMs === null) h.errors++;
    if (r.leftover) h.leftover++;
    if (typeof r.readyMs === 'number') h.ready.push(r.readyMs);
    const tsv = `${d}/${id}/frames.tsv`;
    if (existsSync(tsv)) {
      const rows = readFileSync(tsv, 'utf8').trim().split('\n').map((l) => l.split('\t'));
      const white = rows.filter(([t, , spread, hex]) => Number(t) >= 0 && hex === '#ffffff' && Number(spread) === 0);
      if (white.length) { h.white++; h.whiteMs = Math.max(h.whiteMs, white.length); }
    }
    h.jumps.push(r.maxJump?.d ?? 0);
    h.vt = r.vt || h.vt;
    hops.set(id, h);
  }
}
console.log(`runs: ${dirs.length}`);
console.log('hop | white runs | max white frames | median max jump | median ready ms | leftover names/frozen | transition stamped | errors');
const median = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : '-');
let total = 0;
for (const [, h] of hops) {
  total += h.white;
  console.log(`${h.name} | ${h.white}/${h.runs} | ${h.whiteMs} | ${median(h.jumps)} | ${median(h.ready)} | ${h.leftover} | ${h.vt || '-'} | ${h.errors}`);
}
console.log(`total white runs: ${total}`);
