/**
 * 线上存档那个 Cloudflare Worker（`packages/archive-worker/`）的仪表。
 *
 * 2026-09-14 `docs/43 §9.3` 重裁：线上存档不再住在 Vercel 上，住在一个 Worker + D1 里。
 * 换宿主最容易丢掉的，是 `archive.test.ts` 已经钉住的那几件事 —— 因为新宿主是
 * **另一份代码**，旧的测试打不到它。所以这个文件逐条把它们在新宿主上再钉一遍，
 * 并且多钉三件只有新宿主才有的事：
 *
 * 1. **同一份 `visit.ts`，不是一份拷贝。** 两份闭集校验迟早会有一份被放宽。
 * 2. **IP 零字节。** 请求头里塞满 IP，库里（每一张表、每一列）一个字节都没有；
 *    限流的键也不是它。
 * 3. **序号在并发下是原子的。** 在真的 SQLite 上跑，并且每一次 D1 调用都让出
 *    一次事件循环 —— 为了证明这个替身真的会交错，旁边放了一个故意「先读后写」的
 *    对照，它必须撞号。
 * 4. **网站按什么顺序找存档。** 同源 `/api` 在前，Worker 在后，都不答就缺席 ——
 *    缺席时 `/about` 那一句不印（`privacy-truth.test.ts` 钉源码形状，这里钉行为）。
 *
 * D1 替身是 `node:sqlite` —— Node 自带，不加依赖。它会打一行 ExperimentalWarning，那是 Node 的，不是红。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import worker, { RATE_KEY, type Env, type RateLimiter } from '../../archive-worker/src/worker.ts';
import { SQL, type D1Like, type D1Statement } from '../../archive-worker/src/d1.ts';
import { DAY_RE, SPECIES_MAX, VISIT_FIELDS, day } from '../../archive/src/visit.ts';
import { ARCHIVE_WORKER, SLOW_LOOP } from '../../core/src/tuning.ts';
import { ARCHIVE_WORKER_URL, archiveBases, findVisits } from '../src/archive/endpoint.ts';
import { createVisitReporter } from '../src/archive/visit.ts';

const REPO = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const WORKER_DIR = resolve(REPO, 'packages/archive-worker');
const SITE = 'https://useeme.ptoq.io';
const WORKER = 'https://smu-archive.example.workers.dev';
const IP = '203.0.113.9';

// ─────────────────────── 替身 ───────────────────────

type Stmt = D1Statement & { sql: string; args: unknown[] };

/** 真的 SQLite，D1 的形状。**每一次调用都让出一次事件循环** —— D1 在网络那头，交错是真的 */
function sqliteD1(): { d1: D1Like; db: DatabaseSync } {
  const db = new DatabaseSync(':memory:');
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const q = (s: Stmt) => db.prepare(s.sql);
  const stmt = (sql: string, args: unknown[] = []): Stmt => ({
    sql, args,
    bind: (...v: unknown[]) => stmt(sql, v),
    async first<T>() { await tick(); return (q(stmt(sql, args)).get(...(args as never[])) ?? null) as T | null; },
    async all<T>() { await tick(); return { results: q(stmt(sql, args)).all(...(args as never[])) as T[] }; },
    async run() { await tick(); return q(stmt(sql, args)).run(...(args as never[])); },
  });
  const d1: D1Like = {
    prepare: (sql) => stmt(sql),
    async batch<T>(list: D1Statement[]) {
      await tick();
      return list.map((s) => ({ results: q(s as Stmt).all(...((s as Stmt).args as never[])) as T[] }));
    },
  };
  return { d1, db };
}

function limiter(keys: string[], allow = true): RateLimiter {
  return { async limit({ key }) { keys.push(key); return { success: allow }; } };
}

interface Reply { status: number; headers: Headers; body: Record<string, unknown> | null }

async function call(env: Env, method: string, path: string, opts: {
  origin?: string | null; body?: string | object; headers?: Record<string, string>;
} = {}): Promise<Reply> {
  const headers = new Headers(opts.headers);
  if (opts.origin !== null) headers.set('origin', opts.origin ?? SITE);
  const body = opts.body === undefined ? undefined : typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
  const res = await worker.fetch(new Request(WORKER + path, { method, headers, body }), env);
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
}

const rows = (db: DatabaseSync, table = 'visits') => db.prepare(`SELECT * FROM ${table}`).all();

/** 整个库：每一张表、每一行，拼成一个字符串。IP 要是藏在任何地方，这里看得见 */
function dumpAll(db: DatabaseSync): string {
  const tables = db.prepare(`SELECT name, sql FROM sqlite_master`).all() as { name: string; sql: string | null }[];
  const out: string[] = [];
  for (const t of tables) {
    out.push(String(t.sql));
    try { out.push(JSON.stringify(rows(db, `"${t.name}"`))); } catch { /* 索引之类不是表 */ }
  }
  return out.join('\n');
}

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) tsFiles(p, out);
    else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// ─────────────────────── 1 · 同一份 visit.ts ───────────────────────

test('存档 Worker：用的是同一份 visit.ts / route.ts，不是一份拷贝', () => {
  const files = tsFiles(resolve(WORKER_DIR, 'src'));
  assert.ok(files.length >= 3, `扫到的文件太少（${files.length}）—— 路径写错了，这条守卫会永远绿`);
  const all = files.map((f) => stripComments(readFileSync(f, 'utf8'))).join('\n');

  assert.match(all, /from '\.\.\/\.\.\/archive\/src\/visit\.ts'/, 'Worker 没有 import packages/archive/src/visit.ts');
  assert.match(all, /from '\.\.\/\.\.\/archive\/src\/route\.ts'/, 'Worker 没有 import packages/archive/src/route.ts —— 契约被写了第二份');

  const copies: [RegExp, string][] = [
    [/\bSPECIES_RE\s*=/, 'SPECIES_RE 被重新定义'],
    [/\bSPECIES_MAX\s*=/, 'SPECIES_MAX 被重新定义'],
    [/\bVISIT_FIELDS\s*=/, 'VISIT_FIELDS 被重新定义'],
    [/function\s+(seal|readSpecies|day|routeArchive)\b/, 'seal / readSpecies / day / routeArchive 被重新实现'],
    [/\/\^\[a-z0-9\]/, '物种形状的正则被抄了一份'],
  ];
  const hits = copies.filter(([re]) => re.test(all)).map(([, why]) => why);
  assert.deepEqual(hits, [], `Worker 里有一份闭集校验的拷贝：\n${hits.join('\n')}\n` +
    '两份校验迟早有一份被放宽 —— docs/43 §9.4 的支点是它只有一份代码、一套测试');
});

test('存档 Worker：物种闭集在这个宿主上照样把姓名 / 邮箱 / 坐标挡在外面', async () => {
  const { d1, db } = sqliteD1();
  const env: Env = { DB: d1 };
  for (const bad of ['max.zhuang.yan@gmail.com', '31.2304,121.4737', 'Zhang San', 'a'.repeat(SPECIES_MAX + 1), '', 42, null]) {
    const r = await call(env, 'POST', '/visit', { body: { species: bad } });
    assert.equal(r.status, 400, `收下了 ${JSON.stringify(bad)}`);
    assert.equal(r.body?.code, 'BAD_REQUEST');
  }
  const notJson = await call(env, 'POST', '/visit', { body: 'species=porcelain' });
  assert.equal(notJson.status, 400);
  const huge = await call(env, 'POST', '/visit', { body: JSON.stringify({ species: 'field', pad: 'x'.repeat(5000) }) });
  assert.equal(huge.status, 413);
  assert.equal(huge.body?.code, 'TOO_LARGE');
  // 表是第一次写成功时才建的；一行没收下，就连表都不该有一行
  const has = db.prepare(`SELECT name FROM sqlite_master WHERE name = 'visits'`).get();
  assert.equal(has ? rows(db).length : 0, 0);
});

// ─────────────────────── 2 · IP 零字节 ───────────────────────

test('存档 Worker：请求里塞满 IP / UA / cookie，库里每一张表一个字节都没有', async () => {
  const { d1, db } = sqliteD1();
  const keys: string[] = [];
  const env: Env = { DB: d1, VISIT_RATE: limiter(keys) };
  const r = await call(env, 'POST', '/visit', {
    headers: {
      'cf-connecting-ip': IP, 'x-forwarded-for': IP, 'x-real-ip': IP, 'true-client-ip': IP,
      'user-agent': 'Mozilla/5.0 (Smuggler)', cookie: 'session=anon-12345678',
    },
    body: {
      species: 'porcelain', ip: IP, email: 'someone@example.com', ua: 'Mozilla/5.0 (Smuggler)',
      n: 999, at: '2026-09-13T10:22:31Z', lat: 31.2304,
    },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const entry = r.body?.entry as Record<string, unknown>;
  assert.deepEqual(Object.keys(entry).sort(), [...VISIT_FIELDS].sort());
  assert.equal(entry.n, 1, '客户端送来的 n 被收下了 —— 序号必须由服务端发');
  assert.match(String(entry.at), DAY_RE);
  assert.equal(entry.at, day());

  const cols = (db.prepare('PRAGMA table_info(visits)').all() as { name: string }[]).map((c) => c.name);
  assert.deepEqual(cols.sort(), [...VISIT_FIELDS].sort(),
    'visits 表长出了清单以外的列 —— 一列 ip 哪怕从来不填，也是一个等着被填的位置');
  const tables = (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as { name: string }[])
    .map((t) => t.name).sort();
  assert.deepEqual(tables, ['sqlite_sequence', 'visits'], '库里多了一张表');

  const dump = dumpAll(db);
  for (const needle of [IP, 'example.com', 'Smuggler', 'anon-12345678', '999', '10:22']) {
    assert.equal(dump.includes(needle), false, `库里出现了「${needle}」：\n${dump}`);
  }
  assert.ok(keys.length >= 1, '限流器没被问过 —— 这条测试没打到那条路径');
  assert.deepEqual([...new Set(keys)], [RATE_KEY], '限流的键不是那个常量');
  assert.equal(keys.some((k) => k.includes(IP)), false, '限流的键里有 IP —— 那就是在处理 IP');

  const list = await call(env, 'GET', '/visits');
  assert.equal(JSON.stringify(list.body).includes(IP), false);
});

/**
 * 读 IP / UA / cookie 的那几种写法 + Worker 独有的两条：
 * Cloudflare 挂在请求上的地理信息对象（`request.cf`，里面有城市和经纬度），和日志。
 *
 * **唯一的例外**是 `request.headers.get('origin')`，CORS 必须知道是谁的页面在问。
 * 它必须恰好出现一次，剥掉之后整个目录里不许再出现 `headers` 的任何读法。
 */
test('存档 Worker：源码里只读 Origin 一个 header，不碰 request.cf，不打日志', () => {
  const files = tsFiles(resolve(WORKER_DIR, 'src'));
  let origins = 0;
  const hits: string[] = [];
  for (const f of files) {
    let src = stripComments(readFileSync(f, 'utf8'));
    origins += src.split(`request.headers.get('origin')`).length - 1;
    src = src.split(`request.headers.get('origin')`).join('');
    for (const needle of [
      'x-forwarded-for', 'x-real-ip', 'cf-connecting-ip', 'true-client-ip', 'user-agent',
      'headers.get', 'headers.entries', 'headers.forEach', 'request.headers', '.socket', 'remoteAddress',
      'cookie', 'console.', 'request.cf', 'IncomingRequestCfProperties',
    ]) {
      if (src.toLowerCase().includes(needle.toLowerCase())) hits.push(`${f} 里有 ${needle}`);
    }
    if (/\bcf\s*[?.]/.test(src)) hits.push(`${f} 里读了 cf 对象`);
    if (/\b(DELETE|UPDATE|DROP|TRUNCATE|REPLACE)\b/.test(src)) hits.push(`${f} 里有一条会让这一叠变薄的 SQL`);
  }
  assert.equal(origins, 1, `request.headers.get('origin') 出现了 ${origins} 次，应当恰好一次`);
  assert.deepEqual(hits, [], `Worker 拿到了它不该拿到的东西：\n${hits.join('\n')}`);
});

test('存档 Worker：wrangler.toml 不开日志、不放秘密，限流的数和 tuning.ts 一致', () => {
  const toml = readFileSync(resolve(WORKER_DIR, 'wrangler.toml'), 'utf8')
    .split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
  assert.match(toml, /\[observability\]\s*\nenabled\s*=\s*false/, '调用日志没有显式关掉');
  for (const bad of ['logpush', 'tail_consumers', '[vars]', 'token', 'account_id', 'head_sampling_rate']) {
    assert.equal(toml.includes(bad), false, `wrangler.toml 里有 ${bad}`);
  }
  const m = toml.match(/simple\s*=\s*\{\s*limit\s*=\s*(\d+)\s*,\s*period\s*=\s*(\d+)\s*\}/);
  assert.ok(m, '没有找到 [[ratelimits]] 的 simple 配置');
  assert.equal(Number(m[1]), ARCHIVE_WORKER.writesPerMinute, 'wrangler.toml 的 limit 和 tuning.ts 对不上');
  assert.equal(Number(m[2]), 60);
  assert.match(toml, /binding\s*=\s*"DB"/);
  assert.match(toml, /name\s*=\s*"VISIT_RATE"/);
});

/**
 * workerd 把 `main` 模块的**每一个具名导出**都当成一个入口（一个 handler 或一个类）。
 * 导出一个常量，运行时直接起不来：
 *   `Uncaught TypeError: Incorrect type for map entry 'RATE_KEY': the provided value is
 *    not of type 'function or ExportedHandler'`
 * 这是 `wrangler dev` 当场报出来的；node 里直接 import 模块的测试打不到它 ——
 * 所以要一条单独扫源码的。
 */
test('存档 Worker：wrangler.toml 指向的入口模块只导出 default（否则 workerd 起不来）', () => {
  const toml = readFileSync(resolve(WORKER_DIR, 'wrangler.toml'), 'utf8');
  const main = toml.match(/^main\s*=\s*"([^"]+)"/m)?.[1];
  assert.ok(main, 'wrangler.toml 里没有 main');
  const src = stripComments(readFileSync(resolve(WORKER_DIR, main), 'utf8'));
  const named = src.split('\n')
    .filter((l) => /^\s*export\s+/.test(l) && !/^\s*export\s+(default\b|type\b|interface\b)/.test(l));
  assert.deepEqual(named, [], `入口模块 ${main} 有具名导出，workerd 会把它们当入口并拒绝启动：\n${named.join('\n')}`);
  assert.match(src, /^export default /m, `入口模块 ${main} 没有 export default`);
});

// ─────────────────────── 3 · 序号原子 ───────────────────────

test('存档 Worker：四十个同时到的 POST 拿到 1..40，一个不撞', async () => {
  const { d1 } = sqliteD1();
  const env: Env = { DB: d1, VISIT_RATE: limiter([]) };
  const N = 40;
  const replies = await Promise.all(Array.from({ length: N }, (_, i) =>
    call(env, 'POST', '/visit', { body: { species: i % 2 ? 'field' : 'porcelain', n: 1 } })));
  const ns = replies.map((r) => (r.body?.entry as { n: number } | undefined)?.n).sort((a, b) => (a ?? 0) - (b ?? 0));
  assert.deepEqual(ns, Array.from({ length: N }, (_, i) => i + 1), `序号撞了或跳了：${ns.join(',')}`);
  const list = await call(env, 'GET', '/visits');
  assert.equal(list.body?.total, N);
});

test('存档 Worker：对照 —— 先读 MAX(n) 再写 n+1 在同一个替身上必然撞号（证明替身真的会交错）', async () => {
  const { d1, db } = sqliteD1();
  db.prepare('CREATE TABLE naive (n INTEGER, species TEXT, at TEXT)').run();
  const naiveAppend = async () => {
    const top = await d1.prepare('SELECT COALESCE(MAX(n), 0) AS total FROM naive').first<{ total: number }>();
    await d1.prepare('INSERT INTO naive (n, species, at) VALUES (?1, ?2, ?3)').bind(Number(top?.total) + 1, 'field', day()).run();
  };
  await Promise.all(Array.from({ length: 10 }, naiveAppend));
  const ns = (rows(db, 'naive') as { n: number }[]).map((r) => r.n);
  assert.ok(new Set(ns).size < ns.length,
    `先读后写没有撞号（${ns.join(',')}）—— 这个替身不交错，上一条「一个不撞」就什么也没证明`);
  assert.match(SQL.append, /^INSERT INTO visits \(species, at\) VALUES .* RETURNING n/,
    'append 不再是一条带 RETURNING 的 INSERT —— 发号和落行分开了');
});

// ─────────────────────── 端点本身 ───────────────────────

test('存档 Worker：GET /visits 的形状就是 /lineage 吃的那个', async () => {
  const { d1 } = sqliteD1();
  const env: Env = { DB: d1 };
  for (let i = 0; i < SLOW_LOOP.lineageServeLimit + 3; i++) {
    await call(env, 'POST', '/visit', { body: { species: i === 0 ? 'porcelain' : 'field' } });
  }
  const res = await call(env, 'GET', `/visits?limit=${SLOW_LOOP.lineageServeLimit + 100}`);
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body ?? {}).sort(), ['entries', 'ok', 'total']);
  assert.equal(res.body?.ok, true);
  const entries = res.body?.entries as { n: number; species: string; at: string }[];
  assert.equal(res.body?.total, SLOW_LOOP.lineageServeLimit + 3, 'total 是整池的，不是窗口的');
  assert.equal(entries.length, SLOW_LOOP.lineageServeLimit, 'limit 没被血统池那个旋钮封顶');
  assert.equal(entries[0].n, SLOW_LOOP.lineageServeLimit + 3, '不是最新在前 —— /lineage 的沉积剖面会上下颠倒');
  assert.deepEqual(Object.keys(entries[0]).sort(), [...VISIT_FIELDS].sort());
  assert.equal((await call(env, 'GET', '/visits?limit=3')).body?.entries instanceof Array, true);
  assert.equal(((await call(env, 'GET', '/visits?limit=3')).body?.entries as unknown[]).length, 3);
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('存档 Worker：没有 D1 绑定 = 没有这条回路 → 404 DISABLED；路径和方法不对是结构化 JSON', async () => {
  const none: Env = {};
  const w = await call(none, 'POST', '/visit', { body: { species: 'porcelain' } });
  assert.equal(w.status, 404);
  assert.equal(w.body?.code, 'DISABLED');
  assert.equal((await call(none, 'GET', '/visits')).status, 404);

  const env: Env = { DB: sqliteD1().d1 };
  assert.equal((await call(env, 'GET', '/visit')).body?.code, 'METHOD');
  assert.equal((await call(env, 'GET', '/nope')).body?.code, 'NO_ROUTE');
});

test('存档 Worker：写只认正式地址；读认预览和本机；限流满了是 429 且一行不写', async () => {
  const { d1, db } = sqliteD1();
  const env: Env = { DB: d1, VISIT_RATE: limiter([]) };
  for (const origin of ['https://evil.example', 'http://localhost:5173', 'https://second-body-abc123-team.vercel.app', null]) {
    const r = await call(env, 'POST', '/visit', { origin, body: { species: 'porcelain' } });
    assert.equal(r.status, 403, `${origin} 写进去了`);
    assert.equal(r.body?.code, 'ORIGIN');
  }
  assert.equal(db.prepare(`SELECT name FROM sqlite_master WHERE name = 'visits'`).get(), undefined, '被拒的来源碰到了库');

  const ok = await call(env, 'POST', '/visit', { body: { species: 'porcelain' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('access-control-allow-origin'), SITE);

  const local = await call(env, 'GET', '/visits', { origin: 'http://localhost:5173' });
  assert.equal(local.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  const evil = await call(env, 'GET', '/visits', { origin: 'https://evil.example' });
  assert.equal(evil.headers.get('access-control-allow-origin'), null);

  const pre = await call(env, 'OPTIONS', '/visit');
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get('access-control-allow-methods') ?? '', /POST/);
  assert.equal((await call(env, 'OPTIONS', '/visit', { origin: 'http://localhost:5173' })).status, 403);

  const full: Env = { DB: d1, VISIT_RATE: limiter([], false) };
  const r = await call(full, 'POST', '/visit', { body: { species: 'field' } });
  assert.equal(r.status, 429);
  assert.equal(r.body?.code, 'RATE');
  assert.equal(rows(db).length, 1, '限流拒掉的那一条还是落库了');
});

// ─────────────────────── 4 · 网站按什么顺序找存档 ───────────────────────

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** 按完整 URL 应答的 fetch 替身。表里没有的地址 = 断网 */
function routes(table: Record<string, (init?: RequestInit) => Response | Promise<Response>>, calls: string[]) {
  return (async (input: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${input}`);
    const h = table[String(input)];
    if (!h) throw new TypeError('fetch failed');
    return h(init);
  }) as unknown as typeof globalThis.fetch;
}

test('存档地址：提交进仓库的 Worker 地址要么是 null，要么是一个 https 地址', () => {
  assert.ok(ARCHIVE_WORKER_URL === null || /^https:\/\/[a-z0-9.-]+(\/[^\s]*)?$/.test(ARCHIVE_WORKER_URL),
    `ARCHIVE_WORKER_URL 不是一个 https 地址：${ARCHIVE_WORKER_URL}`);
  assert.deepEqual(archiveBases(null), ['/api']);
  assert.deepEqual(archiveBases(`${WORKER}/`), ['/api', WORKER], '同源必须在 Worker 前面');
});

test('存档地址：同源答了就用同源，Worker 一次都不问', async () => {
  const calls: string[] = [];
  const f = routes({
    '/api/visits': () => json(200, { ok: true, total: 0, entries: [] }),
    [`${WORKER}/visits`]: () => json(200, { ok: true, total: 9, entries: [] }),
  }, calls);
  const found = await findVisits({ fetch: f, bases: archiveBases(WORKER) });
  assert.equal(found?.base, '/api', '同源答了（哪怕是空的）却去问了 Worker —— 装置那台机器会读到线上那一份');
  assert.deepEqual(calls, ['GET /api/visits']);
});

test('存档地址：同源 404 / 同源回一页 HTML / 同源断了 → 问 Worker', async () => {
  for (const [label, same] of [
    ['404', () => json(404, { ok: false, code: 'DISABLED' })],
    ['SPA 回退的 200 HTML', () => new Response('<!doctype html><title>x</title>', { status: 200 })],
    ['ok:false 的 200', () => json(200, { ok: false })],
  ] as const) {
    const calls: string[] = [];
    const f = routes({
      '/api/visits': same,
      [`${WORKER}/visits`]: () => json(200, { ok: true, total: 2, entries: [{ n: 2, species: 'field', at: '2026-09-14' }] }),
    }, calls);
    const found = await findVisits({ fetch: f, bases: archiveBases(WORKER) });
    assert.equal(found?.base, WORKER, `${label}：没有退到 Worker`);
    assert.equal(found?.total, 2);
  }
  const offline = await findVisits({ fetch: routes({ [`${WORKER}/visits`]: () => json(200, { ok: true, total: 1, entries: [] }) }, []), bases: archiveBases(WORKER) });
  assert.equal(offline?.base, WORKER);
});

test('存档地址：哪一处都不答 → null，于是 /about 不印「每一次到访只留下一行」', async () => {
  const f = routes({
    '/api/visits': () => json(404, { ok: false, code: 'DISABLED' }),
    [`${WORKER}/visits`]: () => json(404, { ok: false, code: 'DISABLED' }),
  }, []);
  assert.equal(await findVisits({ fetch: f, bases: archiveBases(WORKER) }), null,
    '两处都 404 却返回了东西 —— /about 会在存档不存在的时候断言它存在');
  assert.equal(await findVisits({ fetch: routes({}, []), bases: archiveBases(WORKER) }), null);
  assert.equal(await findVisits({ fetch: routes({}, []), bases: archiveBases(null) }), null);
});

test('存档地址：网站经由真的 Worker 读到 /lineage 的形状（端到端，替身只换掉网络）', async () => {
  const { d1 } = sqliteD1();
  const env: Env = { DB: d1 };
  await call(env, 'POST', '/visit', { body: { species: 'porcelain' } });
  await call(env, 'POST', '/visit', { body: { species: 'char.dumpling' } });
  const f = routes({
    '/api/visits': () => json(404, { ok: false, code: 'DISABLED' }),
    [`${WORKER}/visits`]: () => worker.fetch(new Request(`${WORKER}/visits`, { headers: { origin: SITE } }), env),
  }, []);
  const found = await findVisits({ fetch: f, bases: archiveBases(WORKER) });
  assert.equal(found?.total, 2);
  assert.deepEqual(found?.entries.map((e) => [e.n, e.species]), [[2, 'char.dumpling'], [1, 'porcelain']]);
});

test('存档地址：写 —— 只有 404 才换到 Worker；同源 5xx 不换（否则一位观众会被记成两位）', async () => {
  const settle = () => new Promise((r) => setTimeout(r, 0));
  const run = async (same: () => Response) => {
    const calls: string[] = [];
    const f = routes({
      '/api/visit': same,
      [`${WORKER}/visit`]: () => json(200, { ok: true, entry: { n: 7, species: 'porcelain', at: '2026-09-14' } }),
    }, calls);
    const r = createVisitReporter({ species: 'porcelain', live: () => true, idle: (fn) => fn(), fetch: f, bases: archiveBases(WORKER) });
    r.note(true);
    for (let i = 0; i < 5; i++) await settle();
    return { calls, r };
  };

  const absent = await run(() => json(404, { ok: false, code: 'DISABLED' }));
  assert.deepEqual(absent.calls, ['POST /api/visit', `POST ${WORKER}/visit`]);
  assert.equal(absent.r.phase, 'kept');
  assert.equal(absent.r.n, 7);

  const broken = await run(() => json(500, { ok: false, code: 'INTERNAL' }));
  assert.deepEqual(broken.calls, ['POST /api/visit'], '同源 500 之后又去 Worker 写了一遍');
  assert.equal(broken.r.phase, 'off');

  const local = await run(() => json(200, { ok: true, entry: { n: 1, species: 'porcelain', at: '2026-09-14' } }));
  assert.deepEqual(local.calls, ['POST /api/visit'], '同源写成功之后还去 Worker 写了一遍');
});
