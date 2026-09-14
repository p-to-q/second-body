/**
 * 存档的第四份 `VisitStore` 实现：Cloudflare D1。
 *
 * `docs/43 §9.3` 2026-09-14 重裁 —— 为什么是它、为什么不在 Vercel 上，写在那一节。
 * 这里只说这张表为什么长这样。
 *
 * ## 三列，和 `VISIT_FIELDS` 逐一对应
 *
 * 表里**只有** `n` / `species` / `at`。没有 `ip`、没有 `ua`、没有 `created_at` 精确到毫秒 ——
 * 不是"写的时候不填"，是**没有那一列可以填**。`test/archive-worker.test.ts`
 * 在真的 SQLite 上建这张表，读 `PRAGMA table_info` 和 `VISIT_FIELDS` 比。
 *
 * 两条 `CHECK` 是第二道闸：`readSpecies()` 已经把形状挡住了，
 * 但表自己也不收一个超过 32 字符的物种、不收一个比天更细的日期 ——
 * 哪天有人绕过路由直接往里写，库本身还是装不下一个人。
 *
 * ## 序号为什么是原子的
 *
 * `INTEGER PRIMARY KEY AUTOINCREMENT` + 一条 `INSERT … RETURNING`。
 * 发号和落行是**同一条语句**，SQLite 的一条语句就是一个事务，D1 的写入
 * 由一个主库串行执行 —— 所以两个同时到的 POST 不可能拿到同一个 `n`。
 * 反面是「先 `SELECT MAX(n)` 再 `INSERT n+1`」：两次往返之间隔着网络，
 * 并发时必然撞号。测试里有一个故意这样写的对照，看着它红。
 *
 * `AUTOINCREMENT`（而不是裸 `INTEGER PRIMARY KEY`）保证号码**永不复用**：
 * 就算哪天真有一行没了，下一位也不会顶替它的号。
 *
 * ## 为什么 total 是 `MAX(n)` 而不是 `COUNT(*)`
 *
 * D1 按**读到的行数**计量。`COUNT(*)` 每次打开 `/lineage` 都把整张表读一遍 ——
 * 十万位到访之后，免费档一天五百万行读只够打开这一页五十次。
 * `MAX(n)` 走主键，读一行。两者相等的前提是**这张表只增不减**：
 * 这个文件里没有 `DELETE` / `UPDATE` / `DROP`，测试扫着
 * （`/lineage` 上那句「这一叠不会变薄」是字面意思）。
 * 失败的 `INSERT`（`CHECK` 拒收）整条回滚，不消耗号码。
 */
import { day, seal, type Visit } from '../../archive/src/visit.ts';
import type { VisitStore } from '../../archive/src/store.ts';

/**
 * D1 绑定里这条线用得到的那一小截。
 *
 * 不装 `@cloudflare/workers-types`：`AGENTS.md` 那条（加依赖先写下为什么
 * 五十行本地代码不够）。这里用到的是四个方法，写出来比一个包短。
 */
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface D1Like {
  prepare(sql: string): D1Statement;
  batch<T = Record<string, unknown>>(statements: D1Statement[]): Promise<{ results: T[] }[]>;
}

/** 表结构。Worker 在每个 isolate 第一次用到时建一次（`IF NOT EXISTS`），部署的人不用跑迁移 */
export const SCHEMA = `CREATE TABLE IF NOT EXISTS visits (
  n       INTEGER PRIMARY KEY AUTOINCREMENT,
  species TEXT NOT NULL CHECK (length(species) BETWEEN 1 AND 32),
  at      TEXT NOT NULL CHECK (length(at) = 10 AND at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
)`;

export const SQL = {
  append: 'INSERT INTO visits (species, at) VALUES (?1, ?2) RETURNING n, species, at',
  total: 'SELECT COALESCE(MAX(n), 0) AS total FROM visits',
  recent: 'SELECT n, species, at FROM visits ORDER BY n DESC LIMIT ?1',
} as const;

export function d1Store(db: D1Like): VisitStore {
  // 建表一次。失败了清掉，下一次请求再试 —— 不把一次瞬时错误钉成整个 isolate 的永久状态
  let ready: Promise<unknown> | null = null;
  const ensure = (): Promise<unknown> =>
    (ready ??= db.prepare(SCHEMA).run().catch((e: unknown) => { ready = null; throw e; }));

  const row = (r: Record<string, unknown>): Visit =>
    seal({ n: Number(r.n), species: String(r.species), at: String(r.at) });

  return {
    kind: 'd1',
    async append(species, now) {
      await ensure();
      const r = await db.prepare(SQL.append).bind(species, day(now)).first();
      if (!r) throw new Error('D1 没有返回落下去的那一行');
      return row(r);
    },
    async recent(limit) {
      await ensure();
      // 一次 batch：总数和窗口来自同一个快照，不会出现「窗口里最新的是第 42 位、总数却是 41」
      const [top, rows] = await db.batch([
        db.prepare(SQL.total),
        db.prepare(SQL.recent).bind(limit),
      ]);
      const entries = (rows?.results ?? []).map(row);
      const total = Number((top?.results?.[0] as { total?: unknown } | undefined)?.total) || entries.length;
      return { total, entries };
    },
  };
}
