/**
 * 存档的**契约本身** —— 不认识任何一种宿主的请求对象。
 *
 *   POST /visit          写一条 A 档 → `{ok:true, entry:{n,species,at}}`
 *   GET  /visits?limit=  最近若干条 + 总数 → `{ok:true, total, entries}`
 *
 * ## 为什么从 `http.ts` 里拆出来
 *
 * 2026-09-14 `docs/43 §9.3` 重裁：线上那一份存储不再住在 Vercel 上，
 * 住在作品负责人自己账号里的一个 Cloudflare Worker 里（`packages/archive-worker/`）。
 * 于是这份契约有了两种宿主：Node 的 `IncomingMessage`（Vercel 函数 / dev / preview），
 * 和 Worker 的 `Request`。
 *
 * 两边各写一遍路由，等于把「一条记录只有三个字段、`species` 是闭集、`n` 由服务端发」
 * 这件事写成两份 —— 而 `docs/43 §9.4` 那条「永久保留」的支点正是**这件事只有一份代码、
 * 一套测试**。所以宿主只做一件事：把字节读进来（带上限）、把 `{status, body}` 写出去。
 * 其余全在这里。
 *
 * ## 这里仍然不认识 header
 *
 * `ArchiveCall` 里只有方法、路径、查询串、和一个读请求体的函数。
 * 没有 header 的位置 —— 存储层和路由层「有没有可能顺手把 IP 记下来」在结构上不成立。
 */
import { SLOW_LOOP } from '../../core/src/tuning.ts';
import { readSpecies, seal, VisitRejected } from './visit.ts';
// 只要类型：`store.ts` 顶上 import 了 `node:fs`，Worker 的打包里不能带进它
import type { VisitStore } from './store.ts';

/**
 * 一次最多吐多少条。
 *
 * 用血统池那一个旋钮，**不新开一个**：这条端点的返回形状就是照抄它的，
 * 两边给出不同的窗口长度只会让 `/lineage` 上的沉积剖面在两个数据源之间跳一下。
 */
export const SERVE_LIMIT = SLOW_LOOP.lineageServeLimit;

/** 请求体上限。一条记录只有一个短字符串，4KB 是「显然不是这条记录」的线 */
export const MAX_BODY_BYTES = 4 * 1024;

export interface ArchiveCall {
  method: string;
  /** 已经去掉挂载前缀的路径：`/visit` / `/visits` */
  path: string;
  query: URLSearchParams;
  /** 读请求体。宿主自己负责 `MAX_BODY_BYTES`，读完交给 `parseBody` */
  body: () => Promise<unknown>;
}

export interface ArchiveReply {
  status: number;
  body: Record<string, unknown>;
}

const fail = (status: number, code: string, error: string): ArchiveReply =>
  ({ status, body: { ok: false, code, error } });

/** 请求体文本 → JSON。空体是 `null`（`readSpecies` 会把它拒掉） */
export function parseBody(text: string): unknown {
  if (!text.trim()) return null;
  try { return JSON.parse(text); } catch { throw new VisitRejected('BAD_REQUEST', '请求体不是合法 JSON'); }
}

export function normalizePath(raw: string): string {
  let p: string;
  try { p = decodeURIComponent(raw || '/'); } catch { p = raw || '/'; }
  return p.replace(/\/+$/, '') || '/';
}

/**
 * 契约。`store` 为 `null` = 这个部署上没有这条回路（`docs/43 §7.2` 第三行）→ 404。
 * 不是 500，也不是一个会忘的计数器 —— `/lineage` 对这件事有一句准备好的话。
 *
 * 错误一律是结构化 JSON `{ok:false, code, error}`，绝不静默退化成 200。
 */
export async function routeArchive(store: VisitStore | null, call: ArchiveCall): Promise<ArchiveReply> {
  if (!store) return fail(404, 'DISABLED', '这个部署上没有存档回路');

  try {
    if (call.path === '/visit') {
      if (call.method !== 'POST') return fail(405, 'METHOD', 'POST only');
      const species = readSpecies(await call.body());
      const entry = seal(await store.append(species));
      return { status: 200, body: { ok: true, entry } };
    }

    if (call.path === '/visits') {
      if (call.method !== 'GET' && call.method !== 'HEAD') return fail(405, 'METHOD', 'GET only');
      const asked = Number(call.query.get('limit'));
      const limit = Math.min(Number.isFinite(asked) && asked > 0 ? Math.floor(asked) : SERVE_LIMIT, SERVE_LIMIT);
      const { total, entries } = await store.recent(limit);
      // `seal()` 再过一道。store 是一个接口，将来会有别人写的实现 ——
      // 那一天这一行是「响应里只会有那三个字段」的最后一道闸
      return { status: 200, body: { ok: true, total, entries: entries.map(seal) } };
    }

    return fail(404, 'NO_ROUTE', `没有这条路径：${call.path}`);
  } catch (e) {
    if (e instanceof VisitRejected) return fail(e.httpStatus, e.code, e.message);
    // 抛出去会把宿主的这次请求挂死。一律翻成 500 JSON —— 和 `/__slow` 同一条
    return fail(500, 'INTERNAL', String((e as Error)?.message ?? e));
  }
}
