/**
 * 存档住在哪 —— **按顺序问，第一个答得上来的算数。**
 *
 * ## 为什么这件事要写进仓库，而不是一个环境变量
 *
 * 2026-09-14 `docs/43 §9.3` 重裁：这个项目没有人拿钱，Vercel 项目留在免费的 Hobby 档，
 * 作品负责人**没有** Vercel 项目和组织仓库设置的权限 —— 于是没有人能设一个环境变量。
 * 线上存档因此住在他自己 Cloudflare 账号里的一个 Worker 上（`packages/archive-worker/`），
 * 而网站要找到它，只能靠一个**提交进仓库的地址**。
 *
 * 这个地址不是秘密：它是一个公开的 HTTPS 端点，写权限由 Worker 自己的来源表和限流管，
 * 不由「别人不知道地址」管。
 *
 * ## 问的顺序
 *
 * 1. **同源 `/api`。** dev server、`vite preview`、装置那台机器（`ARCHIVE_FILE`）
 *    都在这里答 —— 本机的盘永远先于网络（`docs/43 §7.3`）。哪天有人真的给 Vercel
 *    接上了存储，`restStore` 也在这里答，这个文件不用改。
 * 2. **`ARCHIVE_WORKER_URL`。** 线上网站走这一条：Vercel 上的 `/api/visits`
 *    没有存储，答 404，于是轮到它。
 * 3. **都没有 → 缺席。** `/lineage` 说它那句准备好的话，`/about` 不印存档那一句。
 *
 * 「答得上来」的意思是**真的答了**：状态 2xx、是 JSON、`ok === true`。
 * 一个 SPA 回退给出来的 200 + `index.html` 不算 —— 那是没有这条回路，不是一份空存档。
 */

/**
 * 线上 Worker 的地址。**部署之前是 `null`**：`npx wrangler deploy` 打印出来的
 * `https://smu-archive.<账号子域>.workers.dev` 在部署之前不存在，没有人能提前写对它。
 * 部署那天把它填进这一行、提交一次（`docs/45` 乙）。
 *
 * `null` 的时候线上照旧：两处都缺席，页面不说假话（`test/privacy-truth.test.ts`）。
 */
export const ARCHIVE_WORKER_URL: string | null = null;

/** 按顺序问的地址前缀。同源在前，Worker 在后 */
export function archiveBases(worker: string | null = ARCHIVE_WORKER_URL): string[] {
  const out = ['/api'];
  const w = worker?.trim().replace(/\/+$/, '');
  if (w) out.push(w);
  return out;
}

export interface VisitRow { n: number; species: string; at: string }
export interface VisitsFound { total: number; entries: VisitRow[]; base: string }

/**
 * 读存档：按 `bases` 的顺序问 `GET <base>/visits`，第一个真的答了的算数。
 *
 * **总数为 0 也算"答了"** —— 装置刚开机的那台机器上，同源的存档是空的，
 * 但它仍然是这台机器的存档，不该因为空就去问线上那一份。
 * 空和缺席在页面上怎么说，由调用的页面决定（`/lineage` 把空当缺席，`/about` 不）。
 */
export async function findVisits(opts: {
  fetch?: typeof globalThis.fetch;
  bases?: string[];
} = {}): Promise<VisitsFound | null> {
  const doFetch = opts.fetch ?? globalThis.fetch?.bind(globalThis);
  if (!doFetch) return null;
  for (const base of opts.bases ?? archiveBases()) {
    try {
      const res = await doFetch(`${base}/visits`);
      if (!res.ok) continue;
      const j = (await res.json()) as { ok?: unknown; total?: unknown; entries?: unknown };
      if (j?.ok !== true || typeof j.total !== 'number' || !Array.isArray(j.entries)) continue;
      return { total: j.total, entries: j.entries as VisitRow[], base };
    } catch { /* 这一处没答，问下一处 */ }
  }
  return null;
}
