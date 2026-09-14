/**
 * 线上存档的请求处理 —— 一个 Cloudflare Worker，一张 D1 表。
 *
 *   POST /visit          写一条 A 档 → `{ok:true, entry:{n,species,at}}`
 *   GET  /visits?limit=  最近若干条 + 总数 → `{ok:true, total, entries}`
 *
 * 契约和 `/api/visit(s)` **是同一份代码**（`packages/archive/src/route.ts`），
 * 字段清单和闭集校验是同一份 `visit.ts`。这个文件只做 Worker 这一侧的三件事：
 * 读字节、CORS、限流。为什么线上存档住在这里而不是 Vercel 上：`docs/43 §9.3`（2026-09-14）。
 *
 * 入口是 `worker.ts`，它只有一行 `export default`。逻辑放在这里而不是那里，
 * 是因为 workerd 把入口模块的每一个具名导出都当成一个入口 —— 测试要 import 的
 * 常量和类型只能住在入口之外（`wrangler dev` 当场报过，有测试钉着）。
 *
 * ## 这个 Worker 手里有什么，没有什么
 *
 * 它读请求的**一个** header：`Origin`（CORS 必须知道是谁的页面在问）。
 * 别的一个都不读 —— 没有 `CF-Connecting-IP`、没有 `User-Agent`、没有 cookie，
 * 也不碰 Cloudflare 挂在请求上的那个地理信息对象。不打日志。
 * `test/archive-worker.test.ts` 扫这个目录钉住它。
 *
 * **但要说实话**：IP 这个东西在网络层是躲不开的。Cloudflare 的边缘节点为了把
 * 回包送回去必须知道它，就像 Vercel 的边缘必须知道它一样。我们的代码不读、
 * 不存、不拿它当限流的键；Cloudflare 这个平台本身在传输中处理它，
 * 那一部分由它的条款管，不是这个仓库能保证的。
 *
 * ## 限流：一个全局的桶，不按人分
 *
 * 按 IP 限流要把 IP 当键交给限流器 —— 那就是在处理 IP，哪怕不落盘。
 * 所以这里的键是一个**常量**：整个存档每分钟最多收 `ARCHIVE_WORKER.writesPerMinute` 条
 * （每个 Cloudflare 节点各自计数，`wrangler.toml` 里那个数和 `tuning.ts` 有测试对齐）。
 * 代价说清楚：有人刷的时候，**同一分钟里真实的观众也会写不进去** ——
 * 前端对此静默（`docs/43 §7.1` 第 3 条），那一场就没记上。
 * 一件作品的存档少记几位，好过为了分辨谁是谁而去拿每一个人的地址。
 */
import { VisitRejected } from '../../archive/src/visit.ts';
import { MAX_BODY_BYTES, normalizePath, parseBody, routeArchive, type ArchiveReply } from '../../archive/src/route.ts';
import type { VisitStore } from '../../archive/src/store.ts';
import { d1Store, type D1Like } from './d1.ts';
import { canRead, canWrite } from './origins.ts';

/** Cloudflare Rate Limiting 绑定里用到的那一个方法 */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  /** `wrangler.toml` 的 `[[d1_databases]]`。没有它 = 没有这条回路 → 404 */
  DB?: D1Like;
  /** `wrangler.toml` 的 `[[ratelimits]]`。没有它（本机某些模式）就只做校验 */
  VISIT_RATE?: RateLimiter;
}

/** 限流的键。**一个常量** —— 见文件头：键里不许有任何属于某一个人的东西 */
export const RATE_KEY = 'archive:write';

/** 每个 isolate 一份 store：建表那一次只做一回 */
let cached: { db: D1Like; store: VisitStore } | null = null;
function storeFor(env: Env): VisitStore | null {
  if (!env.DB) return null;
  if (cached?.db !== env.DB) cached = { db: env.DB, store: d1Store(env.DB) };
  return cached.store;
}

/** 读请求体，最多 `MAX_BODY_BYTES`。超了立刻停，不先把整个体读进内存 */
async function readBody(body: ReadableStream<Uint8Array> | null): Promise<unknown> {
  if (!body) return null;
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BODY_BYTES) {
      void reader.cancel().catch(() => {});
      throw new VisitRejected('TOO_LARGE', '请求体太大了', 413);
    }
    parts.push(value);
  }
  const all = new Uint8Array(bytes);
  let at = 0;
  for (const p of parts) { all.set(p, at); at += p.byteLength; }
  return parseBody(new TextDecoder().decode(all));
}

function respond(reply: ArchiveReply, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(reply.body), {
    status: reply.status,
    headers: {
      'content-type': 'application/json',
      // 只增不减的一叠，任何一层缓存都会让「第 N 位」读起来是旧的
      'cache-control': 'no-store',
      vary: 'Origin',
      ...cors,
    },
  });
}

const refuse = (status: number, code: string, error: string): ArchiveReply =>
  ({ status, body: { ok: false, code, error } });

export async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  // 整个 Worker 里唯一一处读 header。见文件头
  const origin = request.headers.get('origin');

  const writing = path === '/visit';
  const allowed = writing ? canWrite(origin) : canRead(origin);
  const cors: Record<string, string> = allowed && origin ? { 'access-control-allow-origin': origin } : {};

  if (request.method === 'OPTIONS') {
    if (!allowed) return respond(refuse(403, 'ORIGIN', '这个来源不能访问存档'), {});
    return new Response(null, {
      status: 204,
      headers: {
        ...cors,
        'access-control-allow-methods': writing ? 'POST' : 'GET, HEAD',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '86400',
        vary: 'Origin',
      },
    });
  }

  if (writing && request.method === 'POST') {
    // 写只认正式地址。先判来源再限流再读体：一个被拒的来源不该消耗全局那个桶
    if (!canWrite(origin)) return respond(refuse(403, 'ORIGIN', '只有作品的正式地址可以写存档'), cors);
    if (env.DB && env.VISIT_RATE) {
      const { success } = await env.VISIT_RATE.limit({ key: RATE_KEY });
      if (!success) return respond(refuse(429, 'RATE', '这一分钟收得太多了'), cors);
    }
  }

  const reply = await routeArchive(storeFor(env), {
    method: request.method,
    path,
    query: url.searchParams,
    body: () => readBody(request.body),
  });
  return respond(reply, cors);
}
