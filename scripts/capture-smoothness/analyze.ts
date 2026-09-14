// node analyze.ts <runDir>  → summary.json + stdout table
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const dir = process.argv[2];
const probe = JSON.parse(readFileSync(`${dir}/probe.json`, 'utf8'));
// 帧率解开之后 trace 超过 512MB，一次读成字符串会炸：按行流式解析，只留下要用的几类事件
const KEEP = new Set(['thread_name', 'FireAnimationFrame', 'RunTask', 'ThreadControllerImpl::RunTask', 'FunctionCall', 'EventDispatch', 'probe:click']);
const events: any[] = [];
for await (const raw of createInterface({ input: createReadStream(`${dir}/trace.json`), crlfDelay: Infinity })) {
  let line = raw.trim();
  if (line.startsWith('{"traceEvents":[')) line = line.slice('{"traceEvents":['.length);
  if (line.endsWith(',')) line = line.slice(0, -1);
  if (!line.startsWith('{') || !line.endsWith('}')) continue;
  if (!/"name":"(thread_name|FireAnimationFrame|RunTask|ThreadControllerImpl::RunTask|FunctionCall|EventDispatch|probe:click)"/.test(line) && !line.includes('"__metadata"')) continue;
  try {
    const e = JSON.parse(line);
    if (KEEP.has(e.name) || e.cat === '__metadata') events.push(e);
  } catch { /* 行里不是一个完整事件 */ }
}

const pct = (xs: number[], p: number) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const r1 = (x: number) => Math.round(x * 10) / 10;
const stats = (xs: number[]) => ({
  n: xs.length, p50: r1(pct(xs, 50)), p95: r1(pct(xs, 95)), p99: r1(pct(xs, 99)), max: r1(Math.max(...xs, 0)),
  over25: xs.filter((x) => x > 25).length, over50: xs.filter((x) => x > 50).length,
});

// threads
const names = new Map<string, string>();
for (const e of events) if (e.name === 'thread_name' || e.args?.data?.threadName) names.set(`${e.pid}:${e.tid}`, e.args?.name ?? e.args?.data?.threadName);
for (const e of events) if (e.cat === '__metadata' && e.args?.data?.threadName) names.set(`${e.pid}:${e.tid}`, e.args.data.threadName);
const threadName = (e: any) => names.get(`${e.pid}:${e.tid}`) ?? '';
// main = thread with most FireAnimationFrame
const fafCount = new Map<string, number>();
for (const e of events) if (e.name === 'FireAnimationFrame') fafCount.set(`${e.pid}:${e.tid}`, (fafCount.get(`${e.pid}:${e.tid}`) ?? 0) + 1);
const mainKey = [...fafCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
const onMain = (e: any) => `${e.pid}:${e.tid}` === mainKey;

// align trace ts (µs) to performance.now (ms): use the click EventDispatch or probe mark
let clickTs = events.find((e) => e.name === 'probe:click')?.ts;
if (clickTs === undefined) clickTs = events.find((e) => onMain(e) && e.name === 'EventDispatch' && e.args?.data?.type === 'click')?.ts;
const toPerf = (ts: number) => probe.click + (ts - clickTs) / 1000;

// durations for B/E pairs are rare in timeline; most are X with dur
const dur = (e: any) => (e.dur ?? 0) / 1000;
const bucketOf = (url: string) => (url.split('/').pop() ?? '').replace(/-[A-Za-z0-9_]{8}\.js.*$/, '').replace(/\?.*$/, '') || '?';

const longTasks = events
  .filter((e) => onMain(e) && (e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask') && dur(e) > 50)
  .map((e) => ({ at: Math.round(toPerf(e.ts) - probe.click), ms: Math.round(dur(e)) }));

const calls = new Map<string, { at: number; ms: number }[]>();
for (const e of events) {
  if (!onMain(e) || e.name !== 'FunctionCall') continue;
  const url = e.args?.data?.url ?? '';
  const b = bucketOf(url) + ':' + (e.args?.data?.functionName ?? '');
  const list = calls.get(b) ?? [];
  list.push({ at: toPerf(e.ts), ms: dur(e) });
  calls.set(b, list);
}
// worker threads: total busy per worker
const workers = new Map<string, number[]>();
for (const e of events) {
  if (onMain(e) || !/Worker/i.test(threadName(e))) continue;
  if (e.name !== 'RunTask' && e.name !== 'ThreadControllerImpl::RunTask') continue;
  const k = threadName(e); const l = workers.get(k) ?? []; l.push(dur(e)); workers.set(k, l);
}

const gum = probe.gum ?? probe.click;
const phase = (t: number) => ((t - gum) / 1000) % 20;
const raf: number[] = probe.raf;
const iv = { startup: [] as number[], still: [] as number[], motion: [] as number[], before: [] as number[] };
const settle = (probe.firstPose ?? gum) + 1500;
for (let i = 1; i < raf.length; i++) {
  const t = raf[i]; const d = raf[i] - raf[i - 1];
  if (t < probe.click) { if (t > probe.click - 5000) iv.before.push(d); continue; }
  if (t < settle) { iv.startup.push(d); continue; }
  const ph = phase(t);
  if (ph > 1 && ph < 7.5) iv.still.push(d);
  else if (ph > 8.5 && ph < 19.5) iv.motion.push(d);
}
const inPhase = (xs: { at: number; ms: number }[], which: 'still' | 'motion' | 'startup') =>
  xs.filter(({ at }) => (which === 'startup' ? at >= probe.click && at < settle
    : at >= settle && (which === 'still' ? phase(at) > 1 && phase(at) < 7.5 : phase(at) > 8.5 && phase(at) < 19.5))).map((x) => x.ms);

const topCalls = [...calls.entries()]
  .map(([k, v]) => ({ k, total: v.reduce((a, b) => a + b.ms, 0), n: v.length, v }))
  .sort((a, b) => b.total - a.total).slice(0, 8)
  .map(({ k, total, n, v }) => ({
    fn: k, totalMs: Math.round(total), n,
    startup: stats(inPhase(v, 'startup')), still: stats(inPhase(v, 'still')), motion: stats(inPhase(v, 'motion')),
  }));

const loafTop = (probe.loaf as any[]).filter((l) => l.s >= probe.click).sort((a, b) => b.d - a.d).slice(0, 12)
  .map((l) => ({ at: l.s - Math.round(probe.click), d: l.d, b: l.b, scripts: l.scripts.filter((s: any) => s[3] > 5).slice(0, 4) }));

const summary = {
  run: dir,
  milestones: {
    clickToGum: probe.gum && Math.round(probe.gum - probe.click),
    clickToVideoInDom: probe.videoInDom && Math.round(probe.videoInDom - probe.click),
    clickToFirstVideoFrame: probe.firstVideoFrame && Math.round(probe.firstVideoFrame - probe.click),
    clickToFirstPose: probe.firstPose && Math.round(probe.firstPose - probe.click),
  },
  frameIntervalsMs: { before5s: stats(iv.before), startup: stats(iv.startup), still: stats(iv.still), motion: stats(iv.motion) },
  longTasksAfterClick: { count: longTasks.filter((l) => l.at >= 0).length, totalMs: longTasks.filter((l) => l.at >= 0).reduce((a, b) => a + b.ms, 0), list: longTasks.filter((l) => l.at >= 0).slice(0, 30) },
  topMainThreadCalls: topCalls,
  workers: Object.fromEntries([...workers.entries()].map(([k, v]) => [k, stats(v)])),
  loafTop,
};
writeFileSync(`${dir}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ milestones: summary.milestones, frameIntervalsMs: summary.frameIntervalsMs, longTasks: { count: summary.longTasksAfterClick.count, totalMs: summary.longTasksAfterClick.totalMs, first: summary.longTasksAfterClick.list.slice(0, 12) } }, null, 1));
for (const c of topCalls) console.log(c.fn, 'total', c.totalMs, 'n', c.n, 'startup', JSON.stringify(c.startup), '\n   still', JSON.stringify(c.still), '\n   motion', JSON.stringify(c.motion));
console.log('workers', JSON.stringify(summary.workers));
console.log('loaf', JSON.stringify(loafTop.slice(0, 8)));
