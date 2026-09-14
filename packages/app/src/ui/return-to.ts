/**
 * 「回到你来的那一页」—— 不碰 DOM、不碰 CSS 的那一半。
 *
 * ## 它解决的那一个问题（docs/23 §S9.1，2026-09-14 放宽的那一条）
 *
 * 正文里的一句话现在可以通向一个**不在目录里**的页面（工作台上的某一台仪器）。
 * 进去的人得走得回来，而且回的是**他刚才站的那一页**，不是一个写死的地方：
 * 从 `/about` 点进装配台的人按「返回」回到 `/about`，从 `/making` 点进降级阶梯的人回到 `/making`。
 *
 * ## 为什么不用 `document.referrer`
 *
 * 它会被 referrer policy 剥掉，刷新一次就没了，从书签打开时是空的 ——
 * 一个"有时候有"的出口比没有出口更糟：看不出它什么时候会消失。
 * 所以来处**写在链接上**：`?from=/about`。
 *
 * ## 为什么是白名单，不是"任何站内路径"
 *
 * `from` 是 URL 里谁都能改的一段字。照单全收就是一个开放重定向：
 * `?from=//evil.example` 在浏览器里是一个跨站地址，`?from=javascript:…` 更糟。
 * 就算只收 `/` 开头的路径，「返回〈那一页的名字〉」也得有一个名字可印 ——
 * 一个我们叫不出名字的地方，本来就不该出现在一条"回去"的链接上。
 * 所以只认下面这张表里的页，别的一律当作没有 `from`，退回今天的行为。
 *
 * 单独一个文件的理由和 `ui/exits-url.ts` 一样：node 的测试加载不了 .css，
 * 而"`from` 放不放行"恰恰是这里最该有仪表的那一块。
 */
import { COPY, type BiText } from './i18n.ts';
import { STAGE_KEYS } from './control-table.ts';

/** URL 里那个参数的名字 */
export const FROM_PARAM = 'from';

/**
 * 可以被"回去"的页，和回去时印的名字。正文页和侧室，**加上舞台**（2026-09-14）。
 * 键是 `cleanUrls` 之后的规范路径（没有 `.html`、没有尾斜杠）。
 *
 * 舞台（`/`）是唯一**必须带 query** 的来处：光一个 `/` 回去的是大厅，不是那一屏。
 * 所以它只以 `/?theme=…` 的形状被认（见 `safeStage`），裸的 `/` 仍然拒掉。
 */
export const RETURN_PAGES: Readonly<Record<string, BiText>> = {
  '/': COPY.controls.stage,
  '/about': COPY.nav.items.about.name,
  '/making': COPY.nav.items.making.name,
  '/passport': COPY.nav.items.passport.name,
  '/lineage': COPY.nav.items.lineage.name,
  '/parts': COPY.rooms.parts.title,
  '/roster': COPY.rooms.roster.title,
  '/marks': COPY.rooms.marks.title,
};

/** `/about.html`、`/about/` → `/about`。别的形状原样返回，交给白名单去拒 */
function canonical(path: string): string {
  const trimmed = path.length > 1 ? path.replace(/\/+$/, '') : path;
  return trimmed.replace(/\.html$/, '');
}

/**
 * 把 URL 里的 `from` 读成一个**可以放心放进 href 的站内路径**，或者 `null`。
 *
 * 拒掉的形状（每一种都是一次真实的开放重定向写法）：
 *   `https://evil.example`、`//evil.example`（协议相对）、`/\evil.example`
 *   （部分浏览器把反斜杠当斜杠）、`javascript:…`、带控制字符 / 空白的、
 *   带 query 或 fragment 的、以及白名单之外的任何站内路径。
 */
export function safeFrom(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  if (raw.startsWith('/?')) return safeStage(raw);
  if (raw.length > 64) return null;
  // 只允许以单个 `/` 开头、后面是普通路径字符。这一条已经挡掉了
  // scheme（`javascript:`、`https:`）、协议相对的 `//`、反斜杠和一切空白与控制字符
  if (!/^\/(?![/\\])[A-Za-z0-9/._-]*$/.test(raw)) return null;
  const path = canonical(raw);
  // 裸的 `/` 是大厅，不是舞台 —— 舞台只以带状态的形状被认（见下）
  if (path === '/') return null;
  return Object.prototype.hasOwnProperty.call(RETURN_PAGES, path) ? path : null;
}

/** 舞台回程的上限。九个键、每个值 ≤ 48 字符，写满也到不了 */
const STAGE_MAX = 256;
/** 值只许普通字符：没有 `/` `:` `%` `#` 空白 —— 拼不出一个地址，也拼不出第二个参数 */
const STAGE_VALUE = /^[A-Za-z0-9._-]{1,48}$/;

/**
 * `/?theme=porcelain&plan=rig…` → 同一屏舞台的回程，或者 `null`。
 *
 * 规矩比路径那一种更窄，因为 query 是开放重定向最爱藏东西的地方：
 * 键必须在控件表推出来的 `STAGE_KEYS` 里、不许重复、必须有 `theme`；
 * 值只许普通字符。**输出按白名单顺序重新拼** —— 交出去的永远是我们拼的字，
 * 不是输入原样还回去。
 */
function safeStage(raw: string): string | null {
  if (raw.length > STAGE_MAX) return null;
  const seen = new Map<string, string>();
  for (const pair of raw.slice(2).split('&')) {
    const at = pair.indexOf('=');
    if (at <= 0) return null;
    const k = pair.slice(0, at);
    const v = pair.slice(at + 1);
    if (!STAGE_KEYS.includes(k) || seen.has(k) || !STAGE_VALUE.test(v)) return null;
    seen.set(k, v);
  }
  if (!seen.has('theme')) return null;
  return `/?${STAGE_KEYS.filter((k) => seen.has(k)).map((k) => `${k}=${seen.get(k)}`).join('&')}`;
}

/** 从一整段 `location.search` 里取出 `from`，同样经过 `safeFrom` */
export function fromSearch(search: string): string | null {
  return safeFrom(new URLSearchParams(search).get(FROM_PARAM));
}

/** 那一页叫什么。`from` 必须已经过 `safeFrom`，否则返回 `null` */
export function returnName(from: string | null): BiText | null {
  const ok = safeFrom(from);
  return ok ? RETURN_PAGES[ok.split('?')[0]] ?? null : null;
}

/**
 * 「返回〈那一页〉」那一句。拼在这里而不是调用点：两处出口（工作台、侧室）
 * 印的必须是同一句话，各拼各的迟早一边漏掉英文。
 */
export function returnLabel(from: string | null): BiText | null {
  const name = returnName(from);
  return name ? { zh: `返回${name.zh}`, en: `Back to ${name.en}` } : null;
}

/**
 * 给一条正文里的链接带上来处。`here` 是**当前页**的 pathname。
 *
 * 当前页不在白名单里（比如一个没登记的新页面）就不带 —— 带一个会被目的地拒掉的
 * `from`，只是让 URL 变长，行为和不带一样。fragment 留在最后，`?` 插在它前面。
 */
export function withFrom(href: string, here: string): string {
  const from = safeFrom(here);
  if (!from) return href;
  const hashAt = href.indexOf('#');
  const base = hashAt === -1 ? href : href.slice(0, hashAt);
  const hash = hashAt === -1 ? '' : href.slice(hashAt);
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}${FROM_PARAM}=${encodeURIComponent(from)}${hash}`;
}
