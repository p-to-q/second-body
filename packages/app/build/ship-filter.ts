/**
 * 构建时往 dist 里复制资产的那道闸 —— **哪些东西绝不能进网站**。
 *
 * 原来这条判断写在 `vite.config.ts` 的一个行内 `filter` 里，只排除了 `_metas.json` 和
 * `sound/licenses`。而 `SHIPPED` 里有 `parts`，`parts` 底下还有 `lineage/`：
 *
 *   - `parts/lineage/_raw/`    慢回路生成零件时存的**观众剪影原图**；
 *   - `parts/lineage/visits.jsonl` 装置本机的存档文件（`npm run kiosk` 默认写这里）。
 *
 * 这两样在仓库里是被忽略的，所以 Vercel 从仓库构建时它们是空的 —— 线上从来没出过事。
 * 但只要有人在**装置那台机器上**跑一次 `npm run build`（现场改个文案就会这么做），
 * 剪影原图就会被原样复制进 `dist/`，部署出去就是公开的。一次隐私泄露只差一条命令。
 *
 * 所以这道闸抽成一个能在 node 里测的函数：`vite.config.ts` 只调用它，测试直接喂路径。
 */

/** 运行时真正会读的东西之外，这几类一律不进 dist。每一条都写着为什么 */
const NEVER_SHIP: ReadonlyArray<{ test: (p: string) => boolean; why: string }> = [
  { test: (p) => p.endsWith('_metas.json'), why: '流水线中间产物，运行时只读 parts.json' },
  { test: (p) => p.includes('/sound/licenses'), why: '授权证据截图，留在仓库给人查，观众永远不会加载' },
  { test: (p) => /\/lineage\/_raw(\/|$)/.test(p), why: '慢回路的观众剪影原图 —— 一张都不许公开' },
  { test: (p) => /\/lineage\/[^/]*\.jsonl$/.test(p), why: '装置本机的存档文件；线上的存档在 Worker 里，不在静态文件里' },
];

/** `cpSync` 的 filter：返回 false 的路径不复制。路径统一成正斜杠再判，Windows 上也成立 */
export function shouldShip(src: string): boolean {
  const p = src.replace(/\\/g, '/');
  return !NEVER_SHIP.some((rule) => rule.test(p));
}
