// node summary.mjs <runDir>  — one line per hop
import { readFileSync } from 'node:fs';
const r = JSON.parse(readFileSync(`${process.argv[2]}/results.json`, 'utf8'));
for (const h of r) {
  const b = h.blanks.filter((x) => x.at >= -50 && x.ms >= 16).map((x) => `${x.hex}@${x.at}+${x.ms}`).join(' ');
  const j = h.maxJump;
  console.log([h.hop, h.readyMs, h.fcpMs, `jump${j.d}@${j.at}${j.from ? `(${j.from}>${j.to})` : ''}`, b,
    `req${h.net.n}`, `${h.net.kb}KB`, `c${h.net.cache}`, `rv${h.net.refetched}`, `rd${h.net.redirects}`,
    `heap${h.heapMB}`, h.bfcache ?? '', h.prerendered ? 'PRERENDERED' : '', h.rules ? 'rules' : '', h.error ?? ''].join(' | '));
}
