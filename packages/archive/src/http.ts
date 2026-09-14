/**
 * 存档的 Node HTTP 外壳 —— 两个方法，一条记录。
 *
 *   POST /api/visit          写一条 A 档 → `{ok:true, entry:{n,species,at}}`
 *   GET  /api/visits?limit=  最近若干条 + 总数 → `{ok:true, total, entries}`
 *
 * ## 契约不在这里
 *
 * 路由、校验、错误码都在 `route.ts`。这个文件只把 Node 的 `IncomingMessage`
 * 接到那份契约上：读字节（带上限）、把 `{status, body}` 写回去。
 * 线上那个 Cloudflare Worker（`packages/archive-worker/`）是同一份契约的另一个外壳 ——
 * 2026-09-14 `docs/43 §9.3` 重裁之后，契约有两个宿主，所以它必须只有一份。
 *
 * ## 形状为什么照抄 `GET /__slow/lineage`
 *
 * `docs/43 §8` 第 1 条写死了：`{ok, total, entries}`，**逐字照抄**，
 * 这样 `/lineage` 那一页已经写好的渲染代码能直接吃它。
 *
 * ## 逻辑为什么不写在 `api/*.ts` 里
 *
 * 和慢回路逐字同一条理由（`factory/src/slow-http.ts` 文件头）：
 * 中间件在宿主里登记，逻辑住在能被单测打到的地方。
 * `api/visit.ts` / `api/visits.ts` 因此是两行壳，`vite.config.ts` 那一边也是。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { VisitRejected } from './visit.ts';
import type { VisitStore } from './store.ts';
import { MAX_BODY_BYTES, normalizePath, parseBody, routeArchive } from './route.ts';

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  // 存档是**只增不减**的一叠，任何一层缓存都会让「第 N 位」读起来是旧的
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

/**
 * 读请求体。
 *
 * **这个函数拿到的是字节，不是请求。** 整个文件里只有它碰 `req`，
 * 而它只碰 `req` 的数据流 —— 没有一处读 `headers`、`socket`，
 * 所以「有没有可能顺手把 IP 记下来」在这里不是一条纪律，是一件做不到的事。
 * `test/archive.test.ts` 会扫这个目录来钉住它（P21：要仪表，不要注释）。
 */
async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const c of req) {
    bytes += (c as Buffer).length;
    if (bytes > MAX_BODY_BYTES) throw new VisitRejected('TOO_LARGE', '请求体太大了', 413);
    chunks.push(c as Buffer);
  }
  return parseBody(Buffer.concat(chunks).toString('utf8'));
}

/**
 * 挂载点是 `/api`，所以这里看到的 path 是 `/visit` / `/visits`。
 * Vercel 那边一个函数一条路径，壳子把 path 补齐了再调进来。
 */
export function createArchiveHandler(store: VisitStore | null) {
  return async function archiveHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const [rawPath, rawQuery] = (req.url ?? '/').split('?');
    const reply = await routeArchive(store, {
      method: req.method ?? 'GET',
      path: normalizePath(rawPath ?? '/'),
      query: new URLSearchParams(rawQuery ?? ''),
      body: () => readBody(req),
    });
    json(res, reply.status, reply.body);
  };
}
