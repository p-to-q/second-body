/**
 * 工作台出口 —— 不碰 DOM、不碰 CSS 的那一半。
 *
 * 单独一个文件的理由和 `ui/exits-url.ts` 一样：`devnav.ts` 要 `import './devnav.css'`，
 * node 的测试加载不了 .css，而"这一页该给哪几条出路"恰恰是最容易悄悄坏的那一块 ——
 * `/dev/` 上多出一条「返回工作台」，点下去原地刷新，屏幕上看不出任何错。
 *
 * ## 从正文里点进来的人（docs/23 §S9.1，2026-09-14）
 *
 * 有几台仪器现在被正文里的一句话链着（`src/ui/asides.ts`）。那条链接带着
 * `?from=/about` 这样的来处，于是这一页左边那条出路不再是「返回工作台」——
 * 他没去过工作台 —— 而是「返回作品陈述」，指回他刚才站的那一页。Escape 跟着同一个目标。
 * 没有 `from`（或者 `from` 不在 `ui/return-to.ts` 的白名单里）就是今天的行为，一个字都不变。
 */
import { COPY, type BiText } from '../src/ui/i18n.ts';
import { fromSearch, returnLabel } from '../src/ui/return-to.ts';

/** `return` = 回到带进来的那一页；只在 URL 里有合法 `from` 时出现 */
export type DevNavAction = 'workbench' | 'exit' | 'return';

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

/**
 * 这一页顶上给哪几条出路，从左到右。首页上没有「返回工作台」—— 它就是工作台。
 * 带着合法 `from` 进来的，左边那条换成「返回〈来的那一页〉」。
 */
export function devNavActions(pathname: string, search = ''): DevNavAction[] {
  if (fromSearch(search)) return ['return', 'exit'];
  return isWorkbenchHome(pathname) ? ['exit'] : ['workbench', 'exit'];
}

/**
 * 一条出路的地址和字。`return` 只在 `from` 合法时有意义；
 * 万一被错用在一个没有 `from` 的 URL 上，退回「返回工作台」而不是一条空链接。
 */
export function devNavLink(action: DevNavAction, search = ''): { href: string; label: BiText } {
  if (action === 'return') {
    const from = fromSearch(search);
    const label = returnLabel(from);
    if (from && label) return { href: from, label };
    return { href: WORKBENCH_HREF, label: COPY.devnav.workbench };
  }
  return action === 'workbench'
    ? { href: WORKBENCH_HREF, label: COPY.devnav.workbench }
    : { href: WORK_HREF, label: COPY.devnav.exit };
}

/**
 * Escape 去哪儿：页面自己占用了 Escape 的 → null；带着合法 `from` → 那一页；
 * 仪器页 → 工作台；工作台 → 作品。
 */
export function escapeTarget(pathname: string, search = ''): string | null {
  if (ESCAPE_OWNED_BY_PAGE.includes(basename(pathname))) return null;
  const from = fromSearch(search);
  if (from) return from;
  if (isWorkbenchHome(pathname)) return WORK_HREF;
  return WORKBENCH_HREF;
}
