/**
 * 谁的页面可以跨域读、谁的页面可以跨域写。
 *
 * ## 先说清楚它**不是**什么
 *
 * CORS 管的是**浏览器**。`curl` 不带 `Origin`、也可以伪造一个 `Origin` ——
 * 这张表挡不住一个故意写脚本的人，它不是鉴权。它挡的是两件事：
 *
 * 1. 别人的网页借着观众的浏览器往这份存档里写（一个嵌在任意网站里的
 *    `fetch` 就能做到，而观众什么都不知道）；
 * 2. 我们自己的开发机和预览部署往**永久**存档里写。
 *
 * ## 为什么读和写是两张表
 *
 * 读的是公开的东西（`/lineage` 本来就把它印给所有人看），
 * 所以本机 dev 和 Vercel 预览都可以读 —— 那是在检查页面长什么样。
 *
 * **写只认正式地址。** `docs/43 §9.4` 裁的是永久保留、只增不减：
 * 一次在预览部署上试走的弧线、一次 `localhost` 上的调试，写进去就永远在那一叠里，
 * 并且会被算成「第 N 位」。本机和装置那台机器有它们自己的盘（`ARCHIVE_FILE`），
 * 同源的 `/api/visit` 先答，根本走不到这里。
 */

/** 正式地址。写只认这几个 */
export const WRITE_ORIGINS: readonly string[] = [
  'https://useeme.ptoq.io',
  'https://u-see.me',
  'https://second-body-one.vercel.app',
];

/**
 * 读额外认的：Vercel 预览（`second-body-<hash>-<team>.vercel.app`，`docs/13` 末尾那一节）
 * 和本机 dev / preview。
 */
const READ_PATTERNS: readonly RegExp[] = [
  /^https:\/\/second-body-[a-z0-9-]+\.vercel\.app$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/,
];

export function canWrite(origin: string | null): boolean {
  return origin !== null && WRITE_ORIGINS.includes(origin);
}

export function canRead(origin: string | null): boolean {
  return origin !== null && (canWrite(origin) || READ_PATTERNS.some((re) => re.test(origin)));
}
