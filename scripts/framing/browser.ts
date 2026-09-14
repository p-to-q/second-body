// Framing workbench in headless Chrome (docs/49 §6.6). Raw CDP, no deps. Headless only, audio muted.
//
// node scripts/framing/browser.ts <baseUrl> <outDir> [script ...]
//
// For each synthetic script: open /dev/framing.html?script=<name>&loop=0&dt=fixed, screenshot at 25/50/75%
// of the timeline, wait for window.__framingDone, then save the page's per-16ms max jumps, the
// (see-reason | lateral-why) runs and any console errors. Chrome is always killed on exit.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const [base, out, ...only] = process.argv.slice(2);
if (!base || !out) { console.log('usage: browser.ts <baseUrl> <outDir> [script ...]'); process.exit(1); }
const SCRIPTS = only.length ? only : ['sway', 'out-left', 'out-right', 'reentry', 'sitstand', 'stepback', 'light', 'policy', 'two'];
mkdirSync(out, { recursive: true });
const HERE = new URL('.', import.meta.url).pathname;
const profile = `${HERE}profile-${Date.now()}`;
const port = 9550 + Math.floor(Math.random() * 100);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--mute-audio', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--window-size=1280,1100', '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' });
let killed = false;
const kill = () => {
  if (killed) return;
  killed = true;
  try { chrome.kill('SIGKILL'); } catch { /* already gone */ }
  rmSync(profile, { recursive: true, force: true });
};
process.on('exit', kill);
process.on('SIGINT', () => { kill(); process.exit(130); });
const hard = setTimeout(() => { console.log('hard timeout'); kill(); process.exit(2); }, 15 * 60 * 1000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

try {
  let target: { webSocketDebuggerUrl: string } | undefined;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(500);
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json() as { type: string; webSocketDebuggerUrl: string }[];
      target = list.find((t) => t.type === 'page');
    } catch { /* not up yet */ }
  }
  if (!target) throw new Error('chrome did not come up');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const pending = new Map<number, (v: any) => void>();
  let consoleErrors: string[] = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(String(ev.data));
    if (m.id && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); }
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) {
      consoleErrors.push(`${m.params.type} ${m.params.args.map((a: any) => a.value ?? a.description ?? '').join(' ').slice(0, 300)}`);
    }
    if (m.method === 'Runtime.exceptionThrown') consoleErrors.push(`EXC ${JSON.stringify(m.params.exceptionDetails).slice(0, 400)}`);
  });
  const send = (method: string, params: object = {}) => new Promise<any>((r) => {
    const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evalJs = async (expression: string): Promise<any> => (await send('Runtime.evaluate', { expression, returnByValue: true }))?.result?.result?.value;
  const shot = async (name: string) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    if (r.result?.data) writeFileSync(`${out}/${name}.png`, Buffer.from(r.result.data, 'base64'));
  };
  await send('Runtime.enable');
  await send('Page.enable');

  const summary: Record<string, unknown> = {};
  for (const name of SCRIPTS) {
    consoleErrors = [];
    await send('Page.navigate', { url: `${base}/dev/framing.html?script=${encodeURIComponent(name)}&loop=0&dt=fixed` });
    let total = 0;
    for (let i = 0; i < 100 && !total; i++) {
      await sleep(200);
      total = Number(await evalJs(`(() => { const s = document.getElementById('src')?.textContent ?? ''; const m = / \\/ ([0-9.]+)s$/.exec(s); return m ? Number(m[1]) : 0; })()`)) || 0;
    }
    const marks = [0.25, 0.5, 0.75].map((k) => +(k * total).toFixed(1));
    const taken = new Set<number>();
    const started = Date.now();
    while (Date.now() - started < (total * 6 + 30) * 1000) {
      const st = await evalJs('({ t: window.__framingTrace?.at(-1)?.t ?? 0, done: !!window.__framingDone })');
      for (const mk of marks) if (!taken.has(mk) && st?.t >= mk) { taken.add(mk); await shot(`${name}-t${mk}`); }
      if (st?.done) break;
      await sleep(100);
    }
    const result = await evalJs(`(() => {
      const tr = window.__framingTrace ?? [];
      const runs = [];
      for (const f of tr) {
        const key = f.see.reason + (f.see.side ? ':' + f.see.side : '') + ' | ' + f.lateral.why;
        const r = runs[runs.length - 1];
        if (r && r.key === key) { r.t1 = f.t; r.x1 = f.lateral.x; }
        else runs.push({ key, t0: f.t, t1: f.t, x0: f.lateral.x, x1: f.lateral.x });
      }
      return { done: !!window.__framingDone, frames: tr.length, seconds: tr.at(-1)?.t ?? 0, jumps: window.__framingJumps, runs: runs.filter((r) => r.t1 - r.t0 > 0.05) };
    })()`);
    summary[name] = { ...result, consoleErrors };
    writeFileSync(`${out}/browser-${name}.json`, JSON.stringify(summary[name], null, 2));
    const j = result?.jumps ?? {};
    console.log(`browser ${name.padEnd(10)} done=${result?.done} frames=${result?.frames} ${Object.entries(j).map(([k, v]) => `${k}=${(v as { value: number }).value.toFixed(4)}`).join(' ')} errors=${consoleErrors.length}`);
  }
  writeFileSync(`${out}/browser-summary.json`, JSON.stringify(summary, null, 2));
  ws.close();
} catch (e) {
  console.log('failed:', e);
  process.exitCode = 1;
} finally {
  clearTimeout(hard);
  kill();
}
