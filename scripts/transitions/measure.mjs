// Every navigation hop on the site, measured in Chrome over raw CDP. No deps (docs/47).
//   node scripts/transitions/serve.mjs packages/app/dist 4182        # Vercel-shaped server, other terminal
//   node scripts/transitions/measure.mjs <baseUrl> <outDir> [onlyHopRegex]
//   HEADED=1 …   real window on this display instead of --headless=new
//   REDUCED=1 …  emulate prefers-reduced-motion: reduce
//   NOVT=1 …     disable cross-document view transitions (stand-in for browsers without them)
// Repeat runs and tally white frames with scripts/transitions/tally.mjs.
// Per hop: time to ready, lifecycle (commit/FCP), screencast frames (blank runs,
// ground-colour jumps), network (requests, bytes, cache hits, 304s, redirects,
// refetches of an already-fetched URL), JS heap / canvases, bfcache reasons.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { decodePng, stats, strip } from './png.mjs';

const [BASE = 'http://127.0.0.1:4180', OUT = 'scratch/transitions/run', ONLY] = process.argv.slice(2);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const port = 9340 + Math.floor(Math.random() * 50);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  ...(process.env.HEADED ? ['--window-position=40,40'] : ['--headless=new']),
  // a real window that is covered or unfocused stops producing frames; keep it rendering like a foreground tab
  // NOVT=1: a browser without cross-document view transitions (Firefox / older Safari stand-in)
  ...(process.env.NOVT ? ['--disable-blink-features=ViewTransitionOnNavigation'] : []),
  '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
  `--remote-debugging-port=${port}`, `--user-data-dir=${OUT}/profile`,
  '--enable-unsafe-webgpu', '--enable-features=WebGPU', '--use-angle=metal', '--ignore-gpu-blocklist',
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
  '--window-size=1280,800', '--autoplay-policy=no-user-gesture-required', '--no-first-run', 'about:blank',
], { stdio: 'ignore' });
const kill = () => { try { chrome.kill('SIGKILL'); } catch { /* */ } };
process.on('exit', kill);
setTimeout(() => { console.log('hard timeout'); kill(); process.exit(2); }, 12 * 60 * 1000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let target;
for (let i = 0; i < 60 && !target; i++) {
  await sleep(500);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch { /* */ }
}
if (!target) { console.log('no chrome'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));

let seq = 0;
const pending = new Map();
const consoleLog = [];   // {t, text}
const netEvents = [];    // raw
const frames = [];       // {t, buf}
const pageEvents = [];   // {t, method, params}
let monoOffset = null;   // wallMs - monoSec*1000
let startCast = null;

ws.addEventListener('message', (ev) => {
  const m = JSON.parse(String(ev.data));
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  const now = Date.now();
  switch (m.method) {
    case 'Page.screencastFrame':
      frames.push({ t: m.params.metadata.timestamp * 1000, buf: Buffer.from(m.params.data, 'base64') });
      send('Page.screencastFrameAck', { sessionId: m.params.sessionId });
      break;
    case 'Page.frameNavigated':
      pageEvents.push({ t: now, method: m.method, params: m.params });
      // screencast can stop across a cross-document navigation in a headed window: re-arm it
      if (!m.params.frame.parentId) { send('Page.bringToFront'); startCast?.(); }
      break;
    case 'Runtime.consoleAPICalled':
      consoleLog.push({ t: m.params.timestamp, type: m.params.type, text: m.params.args.map((a) => a.value ?? a.description ?? '').join(' ') });
      break;
    case 'Runtime.exceptionThrown':
      consoleLog.push({ t: now, type: 'exception', text: JSON.stringify(m.params.exceptionDetails).slice(0, 300) });
      break;
    case 'Network.requestWillBeSent':
      if (monoOffset === null) monoOffset = m.params.wallTime * 1000 - m.params.timestamp * 1000;
      netEvents.push({ t: now, ...m });
      break;
    default:
      if (m.method?.startsWith('Network.')) netEvents.push({ t: now, ...m });
      else if (m.method?.startsWith('Page.')) pageEvents.push({ t: now, method: m.method, params: m.params });
  }
});
function send(method, params = {}) {
  return new Promise((r) => { const i = ++seq; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
}
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;

await send('Page.enable');
await send('Page.setLifecycleEventsEnabled', { enabled: true });
await send('Runtime.enable');
await send('Network.enable');
await send('Performance.enable');
// A modest link so redirects and revalidations cost something visible (localhost is ~0ms)
await send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: 25e6 / 8, uploadThroughput: 5e6 / 8 });
if (process.env.HEADED) await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
if (process.env.REDUCED) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
startCast = () => send('Page.startScreencast', { format: 'png', maxWidth: 320, maxHeight: 200, everyNthFrame: 1 });
await startCast();

const fetchedOnce = new Set();

const act = {
  nav: (path) => async () => { await send('Page.navigate', { url: BASE + path }); },
  click: (sel) => async () => {
    const ok = await evaluate(`(() => { const e = ${sel}; if (!e) return false; e.click(); return true; })()`);
    if (!ok) throw new Error(`no element: ${sel}`);
  },
  key: (key, code, vk) => async () => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
  },
  back: () => async () => { await evaluate('history.back()'); },
  // hover like a person (speculation rules 'moderate' fire on ~200ms hover), then click
  hoverClick: (sel, dwell = 400) => async () => {
    const r = await evaluate(`(() => { const e = ${sel}; if (!e) return null; e.scrollIntoView({block:'center'}); const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; })()`);
    if (!r) throw new Error(`no element: ${sel}`);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r[0], y: r[1] });
    await sleep(dwell);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r[0], y: r[1], button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r[0], y: r[1], button: 'left', clickCount: 1 });
  },
};
const q = (css) => `document.querySelector(${JSON.stringify(css)})`;
const ready = {
  label: { js: `!!document.querySelector('.sb-entry') && document.documentElement.classList.contains('sb-first-screen') && document.readyState !== 'loading'` },
  loaded: { console: '[loading] 加载完成' },
  running: { console: '[main] running' },
  doc: { js: `document.readyState === 'complete' && document.body.innerText.length > 200` },
  canvas: { js: `document.readyState === 'complete' && !!document.querySelector('canvas')` },
};

const HOPS = [
  { name: '01 cold / (label)', act: act.nav('/'), ready: ready.label, tail: 1200 },
  { name: '02 label → chooser', act: act.click(q('.sb-entry button.sb-act')), ready: ready.loaded, tail: 2500 },
  { name: '03 chooser → stage', act: act.key('Enter', 'Enter', 13), ready: ready.running, tail: 2000 },
  { name: '04 stage → /about (contents)', act: act.click(q('a.sb-nav-item[href="/about"]')), ready: ready.doc, tail: 800 },
  { name: '05 /about → back → stage', act: act.back(), ready: { any: [ready.running, { event: 'bfcache' }] }, tail: 2000 },
  { name: '06 stage → 回到大厅', act: act.click(q('.sb-exits .sb-exit')), ready: ready.loaded, tail: 1200 },
  { name: '06b hall → / (label, typed)', act: act.nav('/'), ready: ready.label, tail: 800 },
  { name: '07 label → /about (了解)', act: act.click(q('.sb-entry a.sb-act')), ready: ready.doc, tail: 800 },
  { name: '08 /about → /making (contents)', act: act.click(`[...document.querySelectorAll('a.sb-nav-item')].find(a => /making/.test(a.getAttribute('href')))`), ready: ready.doc, tail: 800 },
  { name: '09 /making → /about (hero back)', act: act.click(q('.ed-hero__back')), ready: ready.doc, tail: 800 },
  { name: '09h /about → /lineage (hover, then click)', act: async () => { await act.click(q('.sb-nav-toggle'))(); await sleep(250); await act.hoverClick(`[...document.querySelectorAll('a.sb-nav-item')].find(a => /^\\/lineage/.test(a.getAttribute('href') || ''))`)(); }, ready: ready.doc, tail: 800 },
  { name: '09i /lineage → /about (hover hero back)', act: act.hoverClick(q('.ed-hero__back')), ready: ready.doc, tail: 800 },
  // edge: a long page scrolled to the bottom — the hero wordmark is off-screen and must not fly in (fade instead)
  { name: '09s /about scrolled → /making (contents)', act: async () => {
      await evaluate('window.scrollTo(0, document.documentElement.scrollHeight)'); await sleep(250);
      await act.click(`[...document.querySelectorAll('a.sb-nav-item')].find(a => /making/.test(a.getAttribute('href')))`)();
    }, ready: ready.doc, tail: 900 },
  // edge: a second navigation while the first cross-document transition is still running
  { name: '09r /making → /about, then /lineage mid-transition', act: async () => {
      await evaluate("location.assign('/about')"); await sleep(90);
      await evaluate("location.assign('/lineage')");
    }, ready: { js: `location.pathname === '/lineage' && document.readyState === 'complete' && document.body.innerText.length > 200` }, tail: 1400 },
  { name: '09z /lineage → /about (hero back)', act: act.click(q('.ed-hero__back')), ready: ready.doc, tail: 800 },
  { name: '10 /about → /dev/figure (aside)', act: act.click(`[...document.querySelectorAll('a')].find(a => /\\/dev\\/figure/.test(a.getAttribute('href')))`), ready: ready.canvas, tail: 2000 },
  { name: '11 /dev/figure → /about (devnav)', act: act.click(q('.sb-devnav__link')), ready: ready.doc, tail: 800 },
  { name: '12 /about → /parts (door)', act: act.click(q('a[href="/parts"]')), ready: ready.doc, tail: 1500 },
  { name: '13 /parts → /about (hero back)', act: act.click(q('.ed-hero__back')), ready: ready.doc, tail: 800 },
  { name: '14 /about → / (hero back)', act: act.click(q('.ed-hero__back')), ready: ready.label, tail: 1200 },
  { name: '14a unknown /nope (404)', act: act.nav('/nope'), ready: { js: `document.readyState === 'complete' && document.body.innerText.length > 20` }, tail: 800 },
  { name: '14b /nope → / (hero back)', act: act.click(q('.ed-hero__back')), ready: ready.label, tail: 1200 },
  { name: '15 deep link /?theme=porcelain', act: act.nav('/?theme=porcelain'), ready: ready.running, tail: 1500 },
  { name: '15a stage(webcam) → /about', act: act.click(q('a.sb-nav-item[href="/about"]')), ready: ready.doc, tail: 800 },
  { name: '15b /about → back → stage(webcam)', act: act.back(), ready: { any: [ready.running, { event: 'bfcache' }] }, tail: 2500 },
  { name: '16 stage → species reload', act: act.click(`[...document.querySelectorAll('.sb-ctl-sp')].reverse().find(b => b.getAttribute('aria-pressed') !== 'true' && !b.classList.contains('is-on'))`), ready: ready.running, tail: 1500 },
  { name: '17 stage → workbench (controls)', act: act.click(q('.sb-ctl-link')), ready: ready.canvas, tail: 1500 },
  { name: '18 workbench → stage (return)', act: act.click(q('.sb-devnav__link')), ready: ready.running, tail: 1500 },
  { name: '19 kiosk /?kiosk=1 → chooser', act: act.nav('/?kiosk=1'), ready: ready.loaded, tail: 2500 },
  { name: '20 kiosk chooser → stage', act: act.key('Enter', 'Enter', 13), ready: ready.running, tail: 2000 },
];

function summarizeNetwork(t0, t1) {
  const reqs = new Map();
  for (const e of netEvents) {
    if (e.t < t0 || e.t > t1) continue;
    const id = e.params.requestId;
    const r = reqs.get(id) ?? { url: '', status: 0, bytes: 0, cache: false, redirects: 0 };
    if (e.method === 'Network.requestWillBeSent') { r.url = e.params.request.url; if (e.params.redirectResponse) r.redirects++; }
    if (e.method === 'Network.responseReceived') { r.status = e.params.response.status; if (e.params.response.fromDiskCache || e.params.response.fromPrefetchCache) r.cache = true; }
    if (e.method === 'Network.requestServedFromCache') r.cache = true;
    if (e.method === 'Network.loadingFinished') r.bytes = e.params.encodedDataLength;
    reqs.set(id, r);
  }
  const list = [...reqs.values()].filter((r) => r.url.startsWith('http'));
  let refetched = 0;
  const refetchedUrls = [];
  for (const r of list) {
    const key = r.url.split('#')[0];
    if (!r.cache && r.status === 200 && fetchedOnce.has(key) && !/\/api\//.test(key)) { refetched++; refetchedUrls.push(`${key.replace(BASE, '')} ${r.bytes}B`); }
    if (r.status === 200 || r.status === 304) fetchedOnce.add(key);
  }
  return {
    n: list.length,
    kb: Math.round(list.reduce((s, r) => s + r.bytes, 0) / 1024),
    cache: list.filter((r) => r.cache).length,
    r304: list.filter((r) => r.status === 304).length,
    redirects: list.reduce((s, r) => s + r.redirects, 0),
    refetched,
    refetchedUrls: refetchedUrls.slice(0, 12),
    big: list.filter((r) => r.bytes > 100_000).map((r) => `${r.url.replace(BASE, '')} ${Math.round(r.bytes / 1024)}KB`),
  };
}

function analyzeFrames(t0, t1, dir) {
  const before = frames.filter((f) => f.t < t0).at(-1);
  const within = frames.filter((f) => f.t >= t0 && f.t <= t1);
  const seqf = (before ? [before] : []).concat(within).map((f) => {
    const img = decodePng(f.buf);
    return { t: Math.round(f.t - t0), img, ...stats(img) };
  });
  const runs = [];
  let maxJump = { d: 0 };
  for (let i = 0; i < seqf.length; i++) {
    const f = seqf[i]; const next = seqf[i + 1]; const dur = (next ? next.t : Math.round(t1 - t0)) - f.t;
    if (i > 0) {
      const d = Math.abs(f.luma - seqf[i - 1].luma);
      if (d > maxJump.d) maxJump = { d, from: seqf[i - 1].hex, to: f.hex, at: f.t };
    }
    if (f.spread < 3) {
      const last = runs.at(-1);
      if (last && last.end === f.t && Math.abs(last.luma - f.luma) < 4) { last.ms += dur; last.end = f.t + dur; }
      else runs.push({ hex: f.hex, luma: f.luma, at: f.t, ms: dur, end: f.t + dur });
    }
  }
  const blanks = runs.filter((r) => r.at >= 0 || r.end > 0).map(({ hex, at, ms }) => ({ hex, at, ms }));
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/frames.tsv`, seqf.map((f) => `${f.t}\t${f.luma}\t${f.spread}\t${f.hex}`).join('\n') + '\n');
  // strip: ≤12 frames spread over time, first = page before the hop
  // keep a frame when it changed (luma ±4 / spread ±4) or 300ms passed: blank frames never get skipped
  const uniq = [];
  for (const f of seqf) {
    const last = uniq.at(-1);
    if (!last || Math.abs(f.luma - last.luma) >= 4 || Math.abs(f.spread - last.spread) >= 4 || f.t - last.t >= 300) uniq.push(f);
  }
  uniq.splice(14);
  const png = strip(uniq.map((f) => f.img));
  if (png) writeFileSync(`${dir}/strip.png`, png);
  writeFileSync(`${dir}/strip.txt`, uniq.map((f) => `${f.t}ms ${f.hex} spread=${f.spread}`).join('\n') + '\n');
  return { frames: within.length, blanks, maxJump };
}

async function waitReady(spec, t0, timeout) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const specs = spec.any ?? [spec];
    for (const s of specs) {
      if (s.console && consoleLog.some((c) => c.t >= t0 && c.text.includes(s.console))) return Date.now();
      if (s.event === 'bfcache' && pageEvents.some((e) => e.t >= t0 && e.method === 'Page.frameNavigated' && e.params.type === 'BackForwardCacheRestore')) return Date.now();
      if (s.js) { try { if (await evaluate(s.js)) return Date.now(); } catch { /* navigating */ } }
    }
    await sleep(40);
  }
  return null;
}

const results = [];
for (const hop of HOPS) {
  if (ONLY && !new RegExp(ONLY).test(hop.name)) continue;
  await sleep(300);
  const t0 = Date.now();
  let error = null;
  try { await hop.act(); } catch (e) { error = String(e.message ?? e); }
  const tReady = error ? null : await waitReady(hop.ready, t0, 30_000);
  await sleep(hop.tail);
  const t1 = Date.now();
  const life = pageEvents.filter((e) => e.t >= t0 && e.method === 'Page.lifecycleEvent' && monoOffset !== null)
    .map((e) => ({ name: e.params.name, at: Math.round(e.params.timestamp * 1000 + monoOffset - t0) }));
  const lc = (n) => life.find((l) => l.name === n)?.at ?? null;
  const bf = pageEvents.filter((e) => e.t >= t0 && e.method === 'Page.backForwardCacheNotUsed')
    .flatMap((e) => (e.params.notRestoredExplanations ?? []).map((x) => x.reason));
  const restored = pageEvents.some((e) => e.t >= t0 && e.method === 'Page.frameNavigated' && e.params.type === 'BackForwardCacheRestore');
  const metrics = Object.fromEntries(((await send('Performance.getMetrics')).result?.metrics ?? []).map((m) => [m.name, m.value]));
  const canvases = await evaluate(`document.querySelectorAll('canvas').length`).catch?.(() => null) ?? null;
  const dir = `${OUT}/${hop.name.split(" ")[0]}`;
  const r = {
    hop: hop.name, error,
    readyMs: tReady ? tReady - t0 : null,
    commitMs: lc('commit'), fcpMs: lc('firstContentfulPaint'),
    ...analyzeFrames(t0, t1, dir),
    net: summarizeNetwork(t0, t1),
    heapMB: metrics.JSHeapUsedSize ? +(metrics.JSHeapUsedSize / 1048576).toFixed(1) : null,
    canvases,
    tracks: await evaluate(`[...document.querySelectorAll('video')].flatMap(v => v.srcObject ? v.srcObject.getTracks().map(t => t.kind + ':' + t.readyState) : []).join(',')`),
    url: await evaluate('location.pathname + location.search'),
    prerendered: await evaluate(`(performance.getEntriesByType('navigation')[0]?.activationStart ?? 0) > 0`),
    rules: await evaluate(`!!document.querySelector('script[type=speculationrules]')`),
    vt: await evaluate(`(document.documentElement.dataset.vtReveal ?? '') + ' | swap ' + (sessionStorage.getItem('sb-vt-swap') ?? '')`),
    // after the tail every transition must have settled: no element may still carry a view-transition-name,
    // and no frozen canvas copy may be left behind (a page restored from bfcache thaws itself on pageshow)
    leftover: await evaluate(`[...document.querySelectorAll('*')].filter(e => e.style && e.style.getPropertyValue('view-transition-name')).length + [...document.querySelectorAll('canvas')].filter(c => c.style.visibility === 'hidden').length`),
    scrollY: await evaluate('Math.round(scrollY)'),
    whiteMs: null,
    bfcache: restored ? 'restored' : bf.length ? bf.join(',') : null,
    errors: consoleLog.filter((c) => c.t >= t0 && (c.type === 'error' || c.type === 'exception')).map((c) => c.text.slice(0, 160)),
  };
  results.push(r);
  console.log(JSON.stringify({ hop: r.hop, readyMs: r.readyMs, fcp: r.fcpMs, blanks: r.blanks, jump: r.maxJump, net: { ...r.net, big: undefined }, heap: r.heapMB, canvases: r.canvases, bf: r.bfcache, tracks: r.tracks, url: r.url, err: r.error ?? r.errors[0] }));
}
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
writeFileSync(`${OUT}/console.log`, consoleLog.map((c) => `${c.t}\t${c.type}\t${c.text}`).join('\n'));
ws.close();
kill();
process.exit(0);
