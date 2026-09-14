// Vercel-shaped static server for packages/app/dist. No deps.
// Mirrors vercel.json: cleanUrls (308 on .html), trailingSlash:false (308 on /x/),
// the `headers` table, the platform default `public, max-age=0, must-revalidate`,
// ETag + 304, and 404.html. `vite preview` does none of this, so hop costs
// (redirects, revalidations) measured against it would be wrong.
// node serve.mjs <distDir> <port>
import { createServer } from 'node:http';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';

const [dist = 'packages/app/dist', port = '4180'] = process.argv.slice(2);
const ROOT = resolve(dist);
const vercel = JSON.parse(readFileSync(resolve(process.argv[4] ?? 'vercel.json'), 'utf8'));
const rules = (vercel.headers ?? []).map((h) => ({
  re: new RegExp(`^${h.source.split('(.*)').map((s) => s.replace(/\./g, '\\.')).join('(.*)')}$`),
  headers: h.headers,
}));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.task': 'application/octet-stream',
  '.svg': 'image/svg+xml', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.txt': 'text/plain', '.md': 'text/plain',
};
const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };

createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);
  const redirect = (to) => { res.writeHead(308, { location: to + url.search, 'cache-control': 'public, max-age=0, must-revalidate' }); res.end(); };
  if (p.endsWith('/index.html')) return redirect(p.slice(0, -'/index.html'.length) || '/');
  if (p.endsWith('.html')) return redirect(p.slice(0, -5));
  if (p.length > 1 && p.endsWith('/')) return redirect(p.replace(/\/+$/, ''));
  let file = null;
  for (const c of [join(ROOT, p), join(ROOT, `${p}.html`), join(ROOT, p, 'index.html')]) {
    if (c.startsWith(ROOT) && isFile(c)) { file = c; break; }
  }
  let status = 200;
  if (!file) {
    status = 404;
    file = existsSync(join(ROOT, '404.html')) ? join(ROOT, '404.html') : null;
    if (!file) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('The page could not be found\n\nNOT_FOUND\n'); }
  }
  const st = statSync(file);
  const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const headers = { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', etag, 'cache-control': 'public, max-age=0, must-revalidate' };
  for (const r of rules) if (r.re.test(p)) for (const h of r.headers) headers[h.key.toLowerCase()] = h.value;
  if (status === 200 && req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
  const body = readFileSync(file);
  headers['content-length'] = body.length;
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}).listen(Number(port), '127.0.0.1', () => console.log(`serving ${ROOT} on http://127.0.0.1:${port}`));
