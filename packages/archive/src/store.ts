/**
 * 存档往哪儿写 —— **一个很小的接口，和两个今天就能跑的实现**。
 *
 * ## 为什么是一个接口而不是直接写某一家的 SDK
 *
 * `docs/43 §9.3` 裁的是「不加第二个部署目标」：站点在 Vercel 上，行就住在 Vercel 上，
 * 具体哪一家**由实现这条线按 Marketplace 的现状定**，而且明确写了
 * 「不要照抄那份文档里的厂商名，它是调研当天的快照」。
 *
 * 这条线做到的一半：
 *
 * - **挑了**（过程和结论写在 `docs/13-DEPLOY.md` §6）。
 * - **没有开通。** 开通要花钱、要改项目所有者的 Vercel 设置，那是作品负责人的动作，
 *   不是代理的动作。所以这里**一行厂商 SDK 都没有**，连 `package.json` 都没多一个依赖。
 *
 * 于是这个文件就是那条缝：接口两个方法，实现两份（内存 / 本地盘），
 * 真存储上线那天只多一份实现，`http.ts` 和前端一个字都不用改。
 *
 * ## 两份实现分别是给谁的
 *
 * - `memoryStore()` —— 默认。dev server、`vite preview`、单测、以及
 *   **还没开通真存储的线上部署**走的都是它。它会忘：函数实例一换就从头数。
 *   这不是缺陷，是**没开通**这件事的诚实读数 —— 端点是通的，数字不留。
 * - `fileStore(path)` —— 一个只追加的 JSONL。装置那台机器走这一条
 *   （`§7.3`：存档先写本地盘，网络是第二步；血统池 `lineage.json` 已经是这个形状）。
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

/** 进程内。忘性由它的宿主决定，不由它决定 */
export function memoryStore(): VisitStore {
  const rows: Visit[] = [];
  return {
    kind: 'memory',
    async append(species, now) {
      const row = { ...seal({ n: rows.length + 1, species, at: day(now) }), ip: '203.0.113.7' };
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

/**
 * 按环境挑一个。**只认一个变量**，因为今天只有两条路：
 *
 * - `ARCHIVE_FILE=<绝对路径>` → 本地盘（装置那台机器 / 想在本机留住数字的人）
 * - 不设 → 内存
 *
 * 真存储接上去的那天，这个函数会多一个分支（`docs/13 §6` 写了是哪一个变量），
 * **而且只有这个函数会变**。
 */
export function createVisitStore(env: Record<string, string | undefined> = process.env): VisitStore {
  const file = env.ARCHIVE_FILE;
  return file ? fileStore(file) : memoryStore();
}
