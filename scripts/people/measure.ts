// Multi-person probe (docs/50 §10). Raw CDP, no deps.
//
// node measure.ts infer <baseUrl> <outDir> <numPoses 1..3> <figures.y4m> [recordSec=20]
//   Real worker inference on a fake camera. Deeplink → webcam starts without a click; reads the HUD's
//   `infer@worker Xms` and `people` rows once a second, plus rAF intervals.
// node measure.ts bodies <baseUrl> <outDir> <people 1..3> [recordSec=20]
//   Replay (`?demo=1`) with synthetic companions: GPU/CPU cost of 1/2/3 bodies, HUD draws/tris, screenshots.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const [mode, base, out, nArg, a4, a5] = process.argv.slice(2);
const n = Number(nArg);
const y4m = mode === 'infer' ? a4 : '';
const recS = Number((mode === 'infer' ? a5 : a4) ?? 20);
const HERE = new URL('.', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const profile = `${HERE}/profile-${Date.now()}`;
rmSync(profile, { recursive: true, force: true });
const port = 9450 + Math.floor(Math.random() * 100);
const args = [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--enable-unsafe-webgpu', '--enable-features=WebGPU', '--use-angle=metal', '--ignore-gpu-blocklist',
  '--disable-gpu-vsync', '--disable-frame-rate-limit',
  '--window-size=1280,800', '--autoplay-policy=no-user-gesture-required', '--no-first-run',
];
if (mode === 'infer') args.push('--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`);
args.push('about:blank');
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args, { stdio: 'ignore' });
const kill = () => { try { chrome.kill('SIGKILL'); } catch { /* */ } rmSync(profile, { recursive: true, force: true }); };
process.on('exit', kill);
setTimeout(() => { console.log('hard timeout'); kill(); process.exit(2); }, (recS + 180) * 1000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let target: { webSocketDebuggerUrl: string } | undefined;
for (let i = 0; i < 60 && !target; i++) {
  await sleep(500);
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json() as { type: string; webSocketDebuggerUrl: string }[];
    target = list.find((t) => t.type === 'page');
  } catch { /* not up */ }
}
if (!target) { console.log('no chrome'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map<number, (v: any) => void>();
const consoleLog: string[] = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(String(ev.data));
  if (m.id && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled') {
    consoleLog.push(`${m.params.type} ${m.params.args.map((a: any) => a.value ?? a.description ?? '').join(' ').slice(0, 300)}`);
  }
  if (m.method === 'Runtime.exceptionThrown') consoleLog.push(`EXC ${JSON.stringify(m.params.exceptionDetails).slice(0, 400)}`);
});
const send = (method: string, params: object = {}) => new Promise<any>((r) => {
  const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params }));
});
const evalJs = async (expression: string): Promise<any> => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};
const shot = async (name: string) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  if (r.result?.data) writeFileSync(`${out}/${name}.png`, Buffer.from(r.result.data, 'base64'));
};

await send('Runtime.enable');
await send('Page.enable');
// 探针：rAF 间隔。只观察，不改应用
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => { const t = []; let last = 0; const f = (now) => { if (last) t.push(now - last); last = now; requestAnimationFrame(f); };
    requestAnimationFrame(f); window.__frames = t; })();`,
});
// QUERY=tier=1&theseus=off → 固定档位、关掉换件，两次截图之间才能比
// THEME=athlete → 换一个轻的物种：预算只在轻物种上放得下三具（docs/50 §5.3）
const common = `theme=${process.env.THEME ?? 'porcelain'}&seed=7&debug=1&arc=900&loading=0&wave=off${process.env.QUERY ? `&${process.env.QUERY}` : ''}`;
const tag = process.env.TAG ? `-${process.env.TAG}` : '';
const url = mode === 'infer'
  ? `${base}/?${common}&theseus=off&people=${n}`
  : `${base}/?${common}&demo=1&people=${n}`;
await send('Page.navigate', { url });
console.log('open', url);

// 等 HUD 出现（深链进舞台）
const hudText = `(() => { const el = [...document.querySelectorAll('div')].find((d) => d.textContent?.startsWith('fps')); return el ? el.textContent : null; })()`;
let ready = false;
for (let i = 0; i < 180 && !ready; i++) {
  await sleep(1000);
  const h = await evalJs(hudText);
  ready = !!h && (mode === 'bodies' || /infer@worker/.test(h));
}
console.log('ready', ready);
await sleep(mode === 'infer' ? 8000 : 4000);   // worker 预热 / 伴随身体长出来
await evalJs('window.__frames.length = 0');

const samples: { t: number; infer: number | null; hz: number | null; draws: number | null; tris: number | null; inst: number | null; people: string[] }[] = [];
const snapshots: { at: string; people: unknown }[] = [];
for (let s = 0; s < recS; s++) {
  await sleep(1000);
  const h: string | null = await evalJs(hudText);
  if (!h) continue;
  const num = (re: RegExp) => { const m = h.match(re); return m ? Number(m[1]) : null; };
  samples.push({
    t: s,
    infer: num(/infer@worker ([\d.]+)ms/),
    hz: num(/infer\s+([\d.]+) Hz/),
    draws: num(/draws\s+([\d.]+)/),
    tris: num(/tris\s+([\d.]+) k/),
    inst: num(/instances\s+([\d.]+)/),
    people: h.split('\n').filter((l) => /^people|^\s+#\d/.test(l)),
  });
  if (s === Math.floor(recS / 2)) {
    const name = `${mode}-${n}${mode === 'infer' ? '-' + y4m.split('/').pop()!.replace('.y4m', '') : ''}${tag}`;
    // 截图和 `window.__people`（main.ts 在 `?debug=1` 下写的那一帧的骨架与站位）在同一刻取，再隔 0.5 秒各取一次
    snapshots.push({ at: 'mid', people: await evalJs('JSON.parse(JSON.stringify(globalThis.__people ?? null))') });
    await shot(`${name}-mid`);
    await sleep(500);
    snapshots.push({ at: 'mid+0.5s', people: await evalJs('JSON.parse(JSON.stringify(globalThis.__people ?? null))') });
    await shot(`${name}-mid2`);
  }
}
const frames: number[] = await evalJs('window.__frames.slice()');
const sorted = [...frames].sort((a, b) => a - b);
const pct = (p: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : NaN;
const med = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x !== null && Number.isFinite(x)).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
const summary = {
  mode, n, y4m, url,
  frames: sorted.length, p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), over25: frames.filter((x) => x > 25).length,
  inferMs: med(samples.map((s) => s.infer)), inferHz: med(samples.map((s) => s.hz)),
  draws: Math.max(...samples.map((s) => s.draws ?? 0)), trisK: Math.max(...samples.map((s) => s.tris ?? 0)), instances: Math.max(...samples.map((s) => s.inst ?? 0)),
  lastPeople: samples.at(-1)?.people ?? [],
};
writeFileSync(`${out}/${mode}-${n}${mode === 'infer' ? '-' + y4m.split('/').pop()!.replace('.y4m', '') : ''}${tag}.json`, JSON.stringify({ summary, snapshots, samples, console: consoleLog.slice(-80) }, null, 2));
console.log(JSON.stringify(summary));
kill();
process.exit(0);
