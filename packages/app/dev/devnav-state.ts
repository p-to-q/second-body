/**
 * 工作台出口 —— 不碰 DOM、不碰 CSS 的那一半。
 *
 * 单独一个文件的理由和 `ui/exits-url.ts` 一样：`devnav.ts` 要 `import './devnav.css'`，
 * node 的测试加载不了 .css，而"这一页该给哪几条出路"恰恰是最容易悄悄坏的那一块 ——
 * `/dev/` 上多出一条「返回工作台」，点下去原地刷新，屏幕上看不出任何错。
 */

export type DevNavAction = 'workbench' | 'exit';

/** 工作台本身。`/dev/` 与 `/dev/index.html` 是同一页 */
export const WORKBENCH_HREF = '/dev/';
/** 作品 */
export const WORK_HREF = '/';

/**
 * 自己已经在用 Escape 的工作台页（按 basename，例如 `'figure.html'`）。
 * 在这些页上 Escape 归页面，工作台出口不接。
 *
 * 2026-09-14 逐页查过：`dev/*.ts` 与它们挂的 `src/` 模块里没有一页用 Escape
 * （figure/mass/stage 用方向键 N S P I 空格，capture/accuracy 用 R，
 * choose 用方向键 Enter 空格，sound 用 M），所以现在是空的。
 * 以后哪一页开始用 Escape，`test/devnav.test.ts` 会要求把它登记到这里。
 */
export const ESCAPE_OWNED_BY_PAGE: readonly string[] = [];

const basename = (pathname: string): string => {
  const last = pathname.split('/').pop() ?? '';
  return last === '' ? 'index.html' : last;
};

/** 这个路径是不是工作台首页（目录） */
export function isWorkbenchHome(pathname: string): boolean {
  return /\/dev\/?$/.test(pathname) || /\/dev\/index(\.html)?$/.test(pathname);
}

/** 这一页顶上给哪几条出路，从左到右。首页上没有「返回工作台」—— 它就是工作台 */
export function devNavActions(pathname: string): DevNavAction[] {
  return isWorkbenchHome(pathname) ? ['exit'] : ['workbench', 'exit'];
}

/** Escape 去哪儿：仪器页 → 工作台，工作台 → 作品；页面自己占用了 Escape 的 → null */
export function escapeTarget(pathname: string): string | null {
  if (isWorkbenchHome(pathname)) return WORK_HREF;
  if (ESCAPE_OWNED_BY_PAGE.includes(basename(pathname))) return null;
  return WORKBENCH_HREF;
}
