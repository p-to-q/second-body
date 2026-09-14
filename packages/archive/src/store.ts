/**
 * 存档往哪儿写 —— **一个两个方法的接口，和三份实现**。
 *
 * ## 为什么是一个接口而不是直接写某一家的 SDK
 *
 * `docs/43 §9.3` 裁的是「不加第二个部署目标」：站点在 Vercel 上，行就住在 Vercel 上，
 * 具体哪一家**由实现这条线按 Marketplace 的现状定**，而且明确写了
 * 「不要照抄那份文档里的厂商名，它是调研当天的快照」。
 *
 * 这条线做到的一半：
 *
 * - **挑了**，而且按那家自己的 HTTP 口子写了实现（过程和结论写在 `docs/13-DEPLOY.md` §5.1）。
 * - **没有开通。** 开通要花钱、要改项目所有者的 Vercel 设置，那是作品负责人的动作，
 *   不是代理的动作。所以这里**一行厂商 SDK 都没有**，`package.json` 一个依赖都没多，
 *   而开通那天要做的只剩点几下 + 重新部署一次 —— 代码不用再动。
 *
 * ## 三份实现分别是给谁的
 *
 * - `restStore(url, token)` —— 线上。集成装上去之后由环境变量点亮（见 `createVisitStore`）。
 * - `fileStore(path)` —— 一个只追加的 JSONL。dev server、`vite preview`、
 *   和装置那台机器走这一条（`§7.3`：存档先写本地盘，网络是第二步；
 *   血统池 `lineage.json` 已经是这个形状）。
 * - `memoryStore()` —— **只给单测**。它会忘，所以它不许当任何一种默认：
 *   理由写在 `createVisitStore` 上面。
 *
 * ## 一条纪律：这里不认识 `Request`
 *
 * 存储实现拿到的是**已经收紧过的三个字段**（`seal()`），不是请求。
 * 这样「存储层有没有可能顺手把 IP 记下来」这个问题在结构上就不存在 ——
 * 它手里从来没有过那个东西。
 */
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { day, seal, type Visit } from './visit.ts';

export interface VisitStore {
  /** 给日志和 `?debug=1` 用的一句话。**不进任何面向观众的页面** */
  readonly kind: string;
  /** 追加一条，返回落下去的那一条（`n` 由 store 定） */
  append(species: string, now?: number): Promise<Visit>;
  /** 最近若干条（**最新在前**，和 `GET /__slow/lineage` 同向）+ 整池总数 */
  recent(limit: number): Promise<{ total: number; entries: Visit[] }>;
}

/** 进程内。**只给单测用** —— 它会忘，而一个会忘的计数器不许贴在「这一叠不会变薄」下面 */
export function memoryStore(): VisitStore {
  const rows: Visit[] = [];
  return {
    kind: 'memory',
    async append(species, now) {
      const row = seal({ n: rows.length + 1, species, at: day(now) });
      rows.push(row);
      return row;
    },
    async recent(limit) {
      return { total: rows.length, entries: rows.slice(-limit).reverse() };
    },
  };
}

/**
 * 只追加的 JSONL。一行一条，`n` 就是行号。
 *
 * 整文件读回来算 total 看起来很笨，但它在这个量级上是对的：一条 60 字节，
 * 一百万次到访 = 59 MB（`§2.1`），而装置一个展期的量级是四位数。
 * 用一个索引头去省这一次读，换来的是「索引和正文会不会对不上」这个新问题 ——
 * 那个问题比这次读贵得多。
 */
export function fileStore(path: string): VisitStore {
  const readAll = (): Visit[] => {
    let text: string;
    try { text = readFileSync(path, 'utf8'); } catch { return []; }
    const out: Visit[] = [];
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      // 坏行跳过，不抛。半条记录不该让整页打不开 —— 和 `/demo/index.json`
      // 那条「坏文件照样列出来」同一个判断
      try { out.push(seal(JSON.parse(line) as Visit)); } catch { /* 跳过 */ }
    }
    return out;
  };
  return {
    kind: `file:${path}`,
    async append(species, now) {
      const rows = readAll();
      const row = seal({ n: rows.length + 1, species, at: day(now) });
      mkdirSync(dirname(path), { recursive: true });
      appendFileSync(path, `${JSON.stringify(row)}\n`);
      return row;
    },
    async recent(limit) {
      const rows = readAll();
      return { total: rows.length, entries: rows.slice(-limit).reverse() };
    },
  };
}

// ─────────────────────── Marketplace 上那一个（REST，无 SDK） ───────────────────────

/**
 * Vercel Marketplace 上挑出来的那个 Redis 兼容存储，走它自己的 HTTP 口子。
 * 挑的过程和结论写在 `docs/13-DEPLOY.md §5.1`，开通是作品负责人的动作，不是这条线的。
 *
 * 三条命令就够，而且每一条都正好是这份存档要的形状：
 *
 * - `INCR` 发序号。**原子的** —— §4.2 选号码做主键，能不能兑现就取决于这一点。
 * - `LPUSH` 追加。最新在前，和 `GET /__slow/lineage` 同向，`/lineage` 的位次
 *   算法（`total - i`）照这个方向写的。
 * - `LLEN` 数总数。**没有 `LTRIM`** —— `/lineage` 上那句「这一叠不会变薄」是字面意思。
 *
 * 为什么不装那家的 npm 包：`AGENTS.md` 那条（加依赖要先写下为什么平台自己的能力
 * 不够用）。三条命令 + `fetch` 就是全部，一个包换不来任何东西，却多一份
 * 「它是不是在偷偷带点别的东西走」要回答。
 */
const KEY_N = 'smu:visits:n';
const KEY_ROWS = 'smu:visits';

export function restStore(url: string, token: string): VisitStore {
  const call = async (cmd: (string | number)[]): Promise<unknown> => {
    const res = await fetch(url.replace(/\/+$/, ''), {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(cmd),
    });
    if (!res.ok) throw new Error(`存储拒绝了 ${cmd[0]}：${res.status}`);
    const j = (await res.json()) as { result?: unknown; error?: string };
    if (j.error) throw new Error(j.error);
    return j.result;
  };

  return {
    kind: 'rest',
    async append(species, now) {
      const row = seal({ n: Number(await call(['INCR', KEY_N])), species, at: day(now) });
      await call(['LPUSH', KEY_ROWS, JSON.stringify(row)]);
      return row;
    },
    async recent(limit) {
      const raw = await call(['LRANGE', KEY_ROWS, 0, Math.max(0, limit - 1)]);
      const entries: Visit[] = [];
      for (const line of Array.isArray(raw) ? raw : []) {
        // 坏行跳过，和 fileStore 同一条判断
        try { entries.push(seal(JSON.parse(String(line)) as Visit)); } catch { /* 跳过 */ }
      }
      return { total: Number(await call(['LLEN', KEY_ROWS])) || entries.length, entries };
    },
  };
}

// ─────────────────────────── 选哪一个 ───────────────────────────

/**
 * 按环境挑一个。**一个都没配就是 `null`。**
 *
 * ```
 * KV_REST_API_URL + KV_REST_API_TOKEN   → Marketplace 上那一个（线上）
 * ARCHIVE_FILE=<绝对路径>                → 本地盘（dev server / preview / 装置那台机器）
 * 都没有                                 → null
 * ```
 *
 * ## `null` 为什么不是"退回内存"
 *
 * 退回内存看起来更友好：端点通了，数字也有。但 serverless 的实例说换就换，
 * 于是线上那个数会**每隔一阵子从 1 重新数起** —— 而这一页的全部论点是厚度，
 * 它头一行写着「这一叠不会变薄」。一个会变薄的计数器贴在那句话下面，
 * 是 `docs/02` P21 点名的那种仪表：读数为真，说的是错的那件事，而且错在讨好的方向。
 *
 * `null` 走的是 `docs/43 §7.2` 的第三行：**部署上没有这条回路** → 404 →
 * `/lineage` 用它已经准备好的那句有分量的话。少一个数，胜过一个假的数。
 *
 * 两套环境变量名都认（`KV_*` 和 `UPSTASH_REDIS_REST_*`）：名字不由我们定，
 * 是集成装上去的时候自己注入的，认两套等于「装哪一家」这个决定不用回到代码里改。
 */
export function createVisitStore(env: Record<string, string | undefined> = process.env): VisitStore | null {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return restStore(url, token);
  if (env.ARCHIVE_FILE) return fileStore(env.ARCHIVE_FILE);
  return null;
}
