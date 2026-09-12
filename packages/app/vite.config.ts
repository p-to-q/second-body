import { defineConfig, type Plugin } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');

/**
 * dev-only 中间件：让 /dev/anchor.html 把渲染好的主题参考图写回 assets/refs/<theme>/_anchor.png。
 * 为什么需要：Rodin 的 preview_render 在本账号/本 tier 上拿不到渲染图（docs/09 U12），
 * 所以 anchor 图由我们自己渲染。只在 dev server 下存在，不会进生产包。
 */
function anchorWriter(): Plugin {
  return {
    name: 'sb-anchor-writer',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__anchor', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end('POST only'); }
        const theme = (req.url ?? '').replace(/^\//, '').split('?')[0];
        if (!/^[a-z0-9_-]+$/i.test(theme)) { res.statusCode = 400; return res.end('bad theme'); }
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const dir = resolve(ROOT, 'assets/refs', theme);
        mkdirSync(dir, { recursive: true });
        writeFileSync(resolve(dir, '_anchor.png'), Buffer.concat(chunks));
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, bytes: Buffer.concat(chunks).length }));
      });

      // 策展评级：/dev/parts.html 点一下部件就写回 assets/parts/curation.json
      server.middlewares.use('/__curate', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end('POST only'); }
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const { id, verdict, note } = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (!id || typeof id !== 'string') { res.statusCode = 400; return res.end('bad id'); }
        const { setVerdict } = await import('../factory/src/curation.ts');
        const c = setVerdict(id, verdict ?? null, note);
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, count: Object.keys(c).length }));
      });
    },
  };
}

export default defineConfig({
  root: __dirname,
  publicDir: resolve(__dirname, '../../assets'),   // assets/ 直接作为静态根：/parts/x.glb, /raw/…, /refs/…
  plugins: [anchorWriter()],
  server: { port: 5173, host: true, fs: { allow: [ROOT] } },
  build: { target: 'esnext', outDir: 'dist' },
});
