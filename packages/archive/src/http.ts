/**
 * 存档的 HTTP 外壳 —— 两个方法，一条记录。
 *
 *   POST /api/visit          写一条 A 档 → `{ok:true, entry:{n,species,at}}`
 *   GET  /api/visits?limit=  最近若干条 + 总数 → `{ok:true, total, entries}`
 *
 * ## 形状为什么照抄 `GET /__slow/lineage`
 *
 * `docs/43 §8` 第 1 条写死了：`{ok, total, entries}`，**逐字照抄**，
 * 这样 `/lineage` 那一页已经写好的渲染代码能直接吃它。
 * 这不是省事 —— 它是「A 档是让那一页在线上活过来的最小改动」这句话的技术形式：
 * 最小改动的定义就是**下游一行都不用改**。
 *
 * ## 逻辑为什么不写在 `api/*.ts` 里
 *
 * 和慢回路逐字同一条理由（`factory/src/slow-http.ts` 文件头）：
 * 中间件在宿主里登记，逻辑住在能被单测打到的地方。
 * `api/visit.ts` / `api/visits.ts` 因此是两行壳，`vite.config.ts` 那一边也是。
 * 三个宿主（Vercel 函数 / dev server / preview）跑的是**同一个** handler，
 * 于是「本机好好的，线上不一样」这件事在结构上不成立。
 *
 * ## 错误一律是结构化 JSON
 *
 * `{ok:false, code, error}`，和 `/__slow` 同一张表。绝不静默退化成 200 ——
 * 前端对 404 有一句准备好的话要说（`docs/43 §7.1` 第 4 条：**404 是正常答案**），
 * 而 200 + 一段 HTML 会让它在 `JSON.parse` 上炸掉，那不是降级，那是 bug。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { SLOW_LOOP } from '../../core/src/tuning.ts';
import { readSpecies, seal, VisitRejected } from './visit.ts';
import type { VisitStore } from './store.ts';

/**
 * 一次最多吐多少条。
 *
 * 用血统池那一个旋钮，**不新开一个**：这条端点的返回形状就是照抄它的，
 * 两边给出不同的窗口长度只会让 `/lineage` 上的沉积剖面在两个数据源之间跳一下。
 * 旋钮住在 `packages/core/src/tuning.ts`（`AGENTS.md`：每一个可调的数都住那儿）。
 */
const SERVE_LIMIT = SLOW_LOOP.lineageServeLimit;

/** 请求体上限。一条记录只有一个短字符串，4KB 是「显然不是这条记录」的线 */
const MAX_BODY_BYTES = 4 * 1024;

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  // 存档是**只增不减**的一叠，任何一层缓存都会让「第 N 位」读起来是旧的
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}
const fail = (res: ServerResponse, status: number, code: string, error: string) =>
  json(res, status, { ok: false, code, error });

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
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) return null;
  try { return JSON.parse(text); } catch { throw new VisitRejected('BAD_REQUEST', '请求体不是合法 JSON'); }
}

/**
 * 挂载点是 `/api`，所以这里看到的 path 是 `/visit` / `/visits`。
 * Vercel 那边一个函数一条路径，壳子把 path 补齐了再调进来。
 */
export function createArchiveHandler(store: VisitStore) {
  return async function archiveHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const [rawPath, rawQuery] = (req.url ?? '/').split('?');
    const path = decodeURIComponent(rawPath || '/').replace(/\/+$/, '') || '/';
    const q = new URLSearchParams(rawQuery ?? '');

    try {
      if (path === '/visit') {
        if (req.method !== 'POST') return fail(res, 405, 'METHOD', 'POST only');
        const species = readSpecies(await readBody(req));
        const entry = await store.append(species);
        return json(res, 200, { ok: true, entry });
      }

      if (path === '/visits') {
        if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'METHOD', 'GET only');
        const asked = Number(q.get('limit'));
        const limit = Math.min(Number.isFinite(asked) && asked > 0 ? asked : SERVE_LIMIT, SERVE_LIMIT);
        const { total, entries } = await store.recent(limit);
        // `seal()` 再过一道。store 是一个接口，将来会有别人写的实现 ——
        // 那一天这一行是「响应里只会有那三个字段」的最后一道闸
        return json(res, 200, { ok: true, total, entries: entries.map(seal) });
      }

      return fail(res, 404, 'NO_ROUTE', `没有这条路径：${path}`);
    } catch (e) {
      if (e instanceof VisitRejected) return fail(res, e.httpStatus, e.code, e.message);
      // 抛出去会把宿主的这次请求挂死。一律翻成 500 JSON —— 和 `/__slow` 同一条
      return fail(res, 500, 'INTERNAL', String((e as Error)?.message ?? e));
    }
  };
}
