/**
 * 旁注 —— 把一句话里**已经在**的几个字，变成通向目录外那一页的链接。
 *
 * 表在 `ui/asides.ts`（为什么有这种门、为什么是这几台），这里只管建 DOM。
 *
 * ## 为什么不是 `setBi` 之后再去找字
 *
 * `setBi` 建出来的是两个只有文本的 span。事后在里面切文本节点能做到，但那样
 * 结构就有了两个作者 —— `bilingual.test.ts` 记过三次"两条构建路径长出分歧"。
 * 所以这里**和 `setBi` 建一模一样的两行**（类名同样走 `cjkClass`），
 * 只是每一行里的那几个字直接建成 `<a>`。一个旁注都没有时，结果与 `setBi` 逐节点相同。
 *
 * ## 链接长什么样
 *
 * 就是 `.ed a`：一条常驻的 1px 底线，摸到 / tab 到时强调色从左边长出来。
 * **不加类名、不加样式** —— 这不是线索（线索静止态隐形，见 `clue.css`），
 * 也不是一种新构件；它是正文里的一条普通链接，读起来是句子的一部分。
 *
 * ## 两行、一个 tab 站
 *
 * 中英两行各有一个 `<a>`，指向同一处。英文那一个 `tabIndex = -1`：
 * 鼠标在哪一行都点得到，键盘上一句话只停一次 —— 同一个目的地停两次，
 * 用键盘读这一页的人会以为这里有两扇门。
 *
 * 找不到短语（文案被改过、短语没跟上）就**只印字不开门**：少一扇门，不少一句话。
 * 这件事不许静默发生，`test/asides.test.ts` 逐条核对短语在不在。
 */
import { cjkClass, type BiText } from './i18n.ts';
import { ASIDE_PAGES, type AsidePhrase } from './asides.ts';
import { withFrom } from './return-to.ts';

export type { AsidePhrase } from './asides.ts';

function line(className: string, text: string, links: { at: string; href: string }[], lang: 'zh' | 'en'): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = `${className}${cjkClass(text)}`;

  // 按出现先后切：每个短语只取第一次出现，互相不许重叠
  const hits = links
    .map((l) => ({ ...l, i: l.at ? text.indexOf(l.at) : -1 }))
    .filter((h) => h.i >= 0)
    .sort((a, b) => a.i - b.i);

  let cursor = 0;
  for (const h of hits) {
    if (h.i < cursor) continue;
    if (h.i > cursor) span.append(document.createTextNode(text.slice(cursor, h.i)));
    const a = document.createElement('a');
    a.href = h.href;
    a.textContent = h.at;
    if (lang === 'en') a.tabIndex = -1;
    span.append(a);
    cursor = h.i + h.at.length;
  }
  if (cursor < text.length) span.append(document.createTextNode(text.slice(cursor)));
  return span;
}

/**
 * `setBi` 的带旁注版本。`phrases` 为空时与 `setBi` 建出同样的结构。
 * 链接上的 `?from=` 取**当前页**的 pathname（`ui/return-to.ts` 的 `withFrom`）。
 */
export function setBiLinked(el: Element | null, t: BiText, phrases: readonly AsidePhrase[]): void {
  if (!el) return;
  el.textContent = '';
  el.classList.add('sb-bi');
  const here = typeof location === 'undefined' ? '' : location.pathname;
  const hrefOf = (p: AsidePhrase): string => withFrom(ASIDE_PAGES[p.page], here);
  el.append(
    line('sb-zh', t.zh, phrases.map((p) => ({ at: p.zh, href: hrefOf(p) })), 'zh'),
    line('sb-en', t.en, phrases.map((p) => ({ at: p.en, href: hrefOf(p) })), 'en'),
  );
}
