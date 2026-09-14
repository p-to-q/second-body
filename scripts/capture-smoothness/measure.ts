// Capture smoothness probe. Raw CDP, no deps.
// node measure.ts <baseUrl> <outDir> <mode: swap|deeplink> [recordSec=45] [cpuThrottle=1] [warmCache=0]
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, rmSync, writeFileSync } from 'node:fs';

const [base, out, mode = 'swap', recS = '45', throttle = '1', warm = '0'] = process.argv.slice(2);
const HERE = new URL('.', import.meta.url).pathname;
mkdirSync(`${out}/shots`, { recursive: true });
const profile = `${HERE}/profile-${warm === '1' ? 'warm' : Date.now()}`;
if (warm !== '1') rmSync(profile, { recursive: true, force: true });
const port = 9350 + Math.floor(Math.random() * 100);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--enable-unsafe-webgpu', '--enable-features=WebGPU', '--use-angle=metal', '--ignore-gpu-blocklist',
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
  `--use-file-for-fake-video-capture=${HERE}/figure.y4m`,
  // headless 默认把 rAF 卡在 30Hz（基线实测 33.3ms 恒定）—— 解开它，才量得出每帧预算被吃掉多少
  '--disable-gpu-vsync', '--disable-frame-rate-limit',
  '--window-size=1280,800', '--autoplay-policy=no-user-gesture-required', '--no-first-run', 'about:blank',
], { stdio: 'ignore' });
const kill = () => { try { chrome.kill('SIGKILL'); } catch { /* */ } };
process.on('exit', kill);
setTimeout(() => { console.log('hard timeout'); kill(); process.exit(2); }, (Number(recS) + 150) * 1000);
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
const listeners: ((m: any) => void)[] = [];
const consoleLog: string[] = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(String(ev.data));
  if (m.id && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled') {
    consoleLog.push(`${m.params.type} ${m.params.args.map((a: any) => a.value ?? a.description ?? '').join(' ').slice(0, 300)}`);
  }
  if (m.method === 'Runtime.exceptionThrown') consoleLog.push(`EXC ${JSON.stringify(m.params.exceptionDetails).slice(0, 300)}`);
  for (const l of listeners) l(m);
});
const send = (method: string, params: object = {}) => new Promise<any>((r) => {
  const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params }));
});
const evalJs = async (expression: string): Promise<any> => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};

await send('Runtime.enable');
await send('Page.enable');
if (Number(throttle) > 1) await send('Emulation.setCPUThrottlingRate', { rate: Number(throttle) });
// DPR=3 → 高 DPI 屏；NET=slow → 模型 / 部件走慢网（下行 1.6Mbps、150ms）
if (process.env.DPR) {
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: Number(process.env.DPR), mobile: false });
}
if (process.env.NET === 'slow') {
  await send('Network.enable');
  await send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200 * 1024, uploadThroughput: 100 * 1024 });
}
const QUERY = process.env.QUERY ? `&${process.env.QUERY}` : '';
// BYTES=1 → 按 docs/13 的口径数首屏：标签页 → 选择页 → 舞台出现为止的传输字节（encodedDataLength）
const bytes = { total: 0, requests: 0, byUrl: new Map<string, number>(), frozen: false };
if (process.env.BYTES === '1') {
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  const urls = new Map<string, string>();
  listeners.push((m) => {
    if (bytes.frozen) return;
    if (m.method === 'Network.requestWillBeSent') urls.set(m.params.requestId, m.params.request.url);
    if (m.method === 'Network.loadingFinished') {
      const u = urls.get(m.params.requestId) ?? '?';
      bytes.total += m.params.encodedDataLength;
      bytes.requests++;
      bytes.byUrl.set(u, (bytes.byUrl.get(u) ?? 0) + m.params.encodedDataLength);
    }
  });
}

// In-page probe. Only observes; never touches the app.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
(() => {
  const P = window.__probe = { raf: [], lt: [], loaf: [], gum: null, firstVideoFrame: null, firstPose: null, videoInDom: null, click: null };
  const tick = (t) => { P.raf.push(t); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => P.lt.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: 'longtask', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => P.loaf.push({ s: Math.round(e.startTime), d: Math.round(e.duration), b: Math.round(e.blockingDuration),
    scripts: (e.scripts || []).map((x) => [String(x.sourceURL || '').split('/').pop(), x.sourceFunctionName, x.invoker, Math.round(x.duration)]) }))).observe({ type: 'long-animation-frame', buffered: true }); } catch {}
  const md = navigator.mediaDevices;
  if (md && md.getUserMedia) {
    const orig = md.getUserMedia.bind(md);
    md.getUserMedia = async (c) => { const s = await orig(c); if (P.gum === null) P.gum = performance.now(); return s; };
  }
  const poll = () => {
    const v = document.querySelector('.sb-see video');
    if (v && P.videoInDom === null) P.videoInDom = performance.now();
    if (v && P.firstVideoFrame === null && v.readyState >= 2 && v.currentTime > 0) P.firstVideoFrame = performance.now();
    const r = document.querySelector('.sb-readout.is-present');
    if (P.gum !== null && r && P.firstPose === null) P.firstPose = performance.now();
    setTimeout(poll, 16);
  };
  poll();
})();` });

const waitFor = async (expr: string, ms: number): Promise<boolean> => {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await evalJs(expr)) return true; await sleep(200); }
  return false;
};

const tNav = Date.now();
if (mode === 'swap') {
  await send('Page.navigate', { url: `${base}/?debug=1${QUERY}` });
  console.log('entry', await waitFor(`!!document.querySelector('.sb-entry button.sb-act')`, 30000));
  await sleep(1500);
  await evalJs(`document.querySelector('.sb-entry button.sb-act').click()`);
  await sleep(3500);
  for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  console.log('stage', await waitFor(`document.querySelectorAll('.sb-exits .sb-exit').length >= 3`, 60000), `${(Date.now() - tNav) / 1000}s`);
  if (process.env.BYTES === '1') {
    await sleep(3000);   // 舞台出现之后，预取的部件还在路上（main.ts 等它最多 2.5s）
    bytes.frozen = true;
    const top = [...bytes.byUrl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
      .map(([u, n]) => `${(n / 1024).toFixed(0)}KB ${u.replace(base, '')}`);
    const line = `first-load ${bytes.requests} requests ${(bytes.total / 1048576).toFixed(2)} MB\n${top.join('\n')}`;
    console.log(line);
    writeFileSync(`${out}/first-load.txt`, `${line}\n`);
    if (process.env.BYTES_ONLY === '1') { ws.close(); kill(); process.exit(0); }
  }
  // 读数默认收着、收着时不写 DOM —— 打开它，is-present 才是首个姿态的证据
  await evalJs(`document.querySelector('.sb-readout-bar')?.click()`);
  await sleep(6000);   // replay settles
} else {
  await send('Page.navigate', { url: `${base}/?theme=porcelain&debug=1` });
}

// Trace from here on（TRACE=1 才开：解开帧率后 45 秒的 trace 有 1.4GB，它自己就是负载）
const tracing = process.env.TRACE === '1';
const traceFile = `${out}/trace.json`;
const traceDone = new Promise<string>((res) => listeners.push((m) => { if (m.method === 'Tracing.tracingComplete') res(m.params.stream); }));
if (tracing) await send('Tracing.start', {
  transferMode: 'ReturnAsStream',
  traceConfig: {
    recordMode: 'recordContinuously',
    includedCategories: ['devtools.timeline', 'toplevel', 'blink.user_timing'],
  },
});
const clickPerf = await evalJs(`(performance.mark('probe:click'), performance.now())`);
if (mode === 'swap') {
  // HOVER=1 → 观众先把手移到「摄像头」那一行上（悬停预取），停 HOVER_MS 再按
  if (process.env.HOVER === '1') {
    await evalJs(`document.querySelectorAll('.sb-exits .sb-exit')[2].dispatchEvent(new PointerEvent('pointerenter'))`);
    await sleep(Number(process.env.HOVER_MS ?? 1500));
  }
  await evalJs(`(window.__probe.click = performance.now(), document.querySelectorAll('.sb-exits .sb-exit')[2].click())`);
} else {
  await evalJs(`window.__probe.click = performance.now()`);
}
console.log('clicked', clickPerf);

// Screenshots of the top-left preview for the first 12 s (black-screen check)
const shots: string[] = [];
const tClick = Date.now();
let n = 0;
while (Date.now() - tClick < 12000) {
  const s = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 400, height: 330, scale: 0.5 } });
  const t = await evalJs(`performance.now()`);
  const name = `s${String(n++).padStart(3, '0')}.png`;
  writeFileSync(`${out}/shots/${name}`, Buffer.from(s.result.data, 'base64'));
  shots.push(`${name}\t${Math.round(t - clickPerf)}`);
  await sleep(150);
}
writeFileSync(`${out}/shots/index.tsv`, shots.join('\n') + '\n');
const remain = Number(recS) * 1000 - (Date.now() - tClick);
if (remain > 0) await sleep(remain);

if (tracing) {
  await send('Tracing.end');
  const stream = await traceDone;
  const fh = createWriteStream(traceFile);
  for (;;) {
    const r = await send('IO.read', { handle: stream, size: 4 << 20 });
    const chunk = r.result;
    fh.write(chunk.base64Encoded ? Buffer.from(chunk.data, 'base64') : chunk.data);
    if (chunk.eof) break;
  }
  fh.end();
  await send('IO.close', { handle: stream });
}

const probe = await evalJs(`JSON.stringify(window.__probe)`);
writeFileSync(`${out}/probe.json`, probe);
const hud = await evalJs(`[...document.querySelectorAll('body *')].find(e => e.children.length >= 6 && /fps/.test(e.textContent||''))?.textContent?.replace(/\\s+/g,' ')`);
writeFileSync(`${out}/console.txt`, consoleLog.join('\n') + `\nHUD ${hud}\n`);
console.log('done', out);
ws.close();
kill();
await sleep(300);
process.exit(0);
