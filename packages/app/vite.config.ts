import { defineConfig, type Plugin } from 'vite';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const DEMO_DIR = resolve(ROOT, 'assets/demo');

/**
 * 扫 assets/demo/ 生成 /demo/index.json —— `?demo=1` 默认挑哪一段就看它（replay.ts）。
 * 真录制排在合成占位数据前面：**默认永远不该挑到假数据**。
 */
function writeDemoIndex(): number {
  mkdirSync(DEMO_DIR, { recursive: true });
  const clips = readdirSync(DEMO_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'index.json')
    .map((file) => {
      const name = file.replace(/\.json$/, '');
      const entry = { name, url: `/demo/${file}`, fps: 30, frames: 0, seconds: 0, synthetic: false };
      try {
        const raw = JSON.parse(readFileSync(resolve(DEMO_DIR, file), 'utf8'));
        const frames = Array.isArray(raw) ? raw : raw?.frames;
        entry.frames = Array.isArray(frames) ? frames.length : 0;
        entry.fps = typeof raw?.fps === 'number' && raw.fps > 0 ? raw.fps : 30;
        entry.seconds = Math.round((entry.frames / entry.fps) * 10) / 10;
        entry.synthetic = raw?.synthetic === true;
      } catch { /* 坏文件照样列出来，自检页会把它标成 ✗ */ }
      return entry;
    })
    .sort((a, b) => Number(a.synthetic) - Number(b.synthetic) || a.name.localeCompare(b.name));
  writeFileSync(resolve(DEMO_DIR, 'index.json'), `${JSON.stringify({ clips }, null, 2)}\n`);
  return clips.length;
}

/**
 * dev-only 中间件：让 /dev/anchor.html 把渲染好的主题参考图写回 assets/refs/<theme>/_anchor.png。
 * 为什么需要：Rodin 的 preview_render 在本账号/本 tier 上拿不到渲染图（docs/09 U12），
 * 所以 anchor 图由我们自己渲染。只在 dev server 下存在，不会进生产包。
 */
/**
 * `/demo/index.json` 必须在 **build 时也生成**，不只是 dev server 起来时。
 * 否则一台新机器 clone 下来直接 `npm run kiosk`，dist 里就没有这个索引：
 * `?demo=1` 会悄悄退回写死的默认文件，自检页则报"一条片段都没有" ——
 * 现场兜底靠的正是这条路，不能依赖"之前谁在这台机器上跑过 dev server"。
 */
function demoIndex(): Plugin {
  return {
    name: 'sb-demo-index',
    buildStart() {
      try { writeDemoIndex(); } catch (e) { this.warn(`/demo/index.json 生成失败：${String(e)}`); }
    },
  };
}

function anchorWriter(): Plugin {
  return {
    name: 'sb-anchor-writer',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__anchor', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end('POST only'); }
        const theme = (req.url ?? '').replace(/^\//, '').split('?')[0];
        // roster id 允许带点（char.dumpling / guest.founder）。每个点后面必须还有字符，
        // 所以 '..' 和前导点都进不来 —— 仍然挡住路径穿越。
        if (!/^[a-z0-9_-]+(\.[a-z0-9_-]+)*$/i.test(theme)) { res.statusCode = 400; return res.end('bad theme'); }
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

      // 录制回写：/dev/record.html 录完一段 pose 就 POST 到这里，落到 assets/demo/
      server.middlewares.use('/__demo', async (req, res) => {
        const fail = (code: number, error: string) => {
          res.statusCode = code;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ ok: false, error }));
        };
        if (req.method !== 'POST') return fail(405, 'POST only');
        const name = decodeURIComponent((req.url ?? '').replace(/^\//, '').split('?')[0]);
        // 只认扁平文件名：没有点、没有斜杠 —— 路径穿越进不来
        if (!/^[a-z0-9][a-z0-9_-]*$/i.test(name)) return fail(400, `片段名只能是 [a-z0-9_-]：${name}`);

        const chunks: Buffer[] = [];
        let bytes = 0;
        for await (const c of req) {
          bytes += (c as Buffer).length;
          if (bytes > 128 * 1024 * 1024) return fail(413, '超过 128MB，录太长了');
          chunks.push(c as Buffer);
        }
        const text = Buffer.concat(chunks).toString('utf8');
        let clip: { fps?: unknown; frames?: unknown; synthetic?: unknown };
        try { clip = JSON.parse(text); } catch (e) { return fail(400, `不是合法 JSON：${String(e)}`); }

        // 守住 T-16 的那条红线：这个口子只接受**录制**，不接受合成数据
        if (clip.synthetic !== undefined) return fail(400, '带 synthetic 标记的数据不许写进 assets/demo/');
        const frames = clip.frames;
        if (!Array.isArray(frames) || !frames.length) return fail(400, 'frames 是空的');
        if (!frames.some((f) => Array.isArray((f as { world?: unknown })?.world) && (f as { world: unknown[] }).world.length)) {
          return fail(400, '整段里一帧都没有人 —— 这份数据没用，别存');
        }
        if (typeof clip.fps !== 'number' || clip.fps <= 0) return fail(400, 'fps 必须是正数');

        const file = `${name.startsWith('pose-') ? name : `pose-${name}`}.json`;
        mkdirSync(DEMO_DIR, { recursive: true });
        writeFileSync(resolve(DEMO_DIR, file), text);
        const count = writeDemoIndex();
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true, path: `assets/demo/${file}`, bytes, clips: count }));
      });

      // 手动丢进 assets/demo/ 的文件也要被认到：每次起 dev server 重扫一遍
      try { writeDemoIndex(); } catch (e) { console.warn('[sb] /demo/index.json 生成失败：', e); }
    },
  };
}

/**
 * 只把**运行时真正要的**资产复制进 dist。
 *
 * 为什么不用 publicDir 指向 assets/：那样会把 `assets/raw/`（Rodin 原始件，带贴图，
 * 929 MB）一起打进产物。`docs/13 §2` 早就写了"raw 绝不进 dist"，
 * 但没人验证过 —— 直到真跑了一次 build，产物是 975 MB。
 * 规格写了不等于做到了（§craft）。
 */
const SHIPPED = ['parts', 'refs', 'demo', 'fonts'];

function shipAssets(): Plugin {
  return {
    name: 'sb-ship-assets',
    apply: 'build',
    closeBundle() {
      const out = resolve(__dirname, 'dist');
      for (const dir of SHIPPED) {
        const from = resolve(ROOT, 'assets', dir);
        if (!existsSync(from)) continue;
        cpSync(from, resolve(out, dir), {
          recursive: true,
          // _metas.json 是流水线的中间产物，运行时只读 parts.json
          filter: (src) => !src.endsWith('_metas.json'),
        });
      }
    },
  };
}

export default defineConfig({
  root: __dirname,
  // dev 下 assets/ 整个作为静态根（/raw/ 在 anchor 渲染时要用）；
  // build 时改由 shipAssets() 只复制 SHIPPED 里那几个目录。
  publicDir: process.env.NODE_ENV === 'production' ? false : resolve(__dirname, '../../assets'),
  plugins: [demoIndex(), anchorWriter(), shipAssets()],
  server: { port: 5173, host: true, fs: { allow: [ROOT] } },
  build: { target: 'esnext', outDir: 'dist' },
});
