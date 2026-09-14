import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * 四个文档流页面（`/about` `/making` `/passport` `/lineage`）在窄屏下**不许横向溢出**。
 *
 * ## 这个文件能证明什么，不能证明什么
 *
 * **不能**：node 跑不出版面。没有布局引擎，就没有 `scrollWidth`，
 * 也就没有"这一页在 420px 上有没有捅出视口"这个问题的答案。
 * 在这里写一句 `assert.equal(scrollWidth, 420)` 只会是一句编出来的话 ——
 * 它会一直绿，包括页面真的坏掉的那一天。**那比没有守卫更糟。**
 *
 * **能**：这四页之所以在窄屏下成立，靠的是样式表里**六件具体的事**。
 * 它们每一件都能在文本上查，而且每一件都对应一种真的会回来的坏法。
 * 布局本身由浏览器量，量出来的数记在 `docs/23 §S10`（带日期、宽度和数字）——
 * 分工和 `vacancy.test.ts` 一样：能自动验的自动验，验不了的记成证据，不假装。
 *
 * 六条，以及各自拦的那一下：
 *
 *   1. **没有 `overflow-x: hidden`。** 这是这类 bug 最常见的"修法"，而它不是修，
 *      是把溢出藏起来 —— 被裁掉的字仍然读不到，只是不再有滚动条报信。
 *   2. **满幅线的负边距 = 版心自己的边距令牌。** `.ed-rule` 靠
 *      `margin: 0 calc(var(--ed-edge) * -1)` 顶到视口边。两处只改一处，
 *      这条线就会在**每一个宽度上**捅出视口 —— 一页一条，四页全中。
 *   3. **窄屏塌栏一律塌成 `minmax(0, 1fr)`。** 写成裸 `1fr` 的那一栏最小宽度是
 *      min-content：一串不可断的东西（文件路径、英文长词）会把整栏顶开。
 *   4. **装正文的那一格声明 `min-width: 0`。** 同一个坑的另一半：grid 子项默认
 *      `min-width: auto`，正文那一格因此撑到 min-content 而不是跟着栏走。
 *   5. **巨题 `overflow-wrap: anywhere`。** `type.css` 自己记过：没有它，
 *      窄屏上「SEE-ME SEE-U」会捅出视口。这是已经发生过一次的那一种。
 *   6. **存证那一列 `word-break: break-all`。** 那一列装的是
 *      `packages/factory/src/index-parts.ts` 这样的路径，不许断就一定顶开。
 */

const src = (p: string): string =>
  readFileSync(fileURLToPath(new URL(`../src/${p}`, import.meta.url)), 'utf8');

/** 注释先剥掉再匹配（做法同 `css-tokens.test.ts` / `vacancy.test.ts`）——
 *  这几个文件的注释里逐字讨论过下面每一条规矩，不剥的话守卫会被自己的文档喂饱。 */
const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '');

/** 四个文档流页面真正用到的样式表。画布页（`chrome.css` 的 `.sb-canvas-page`）不在内 ——
 *  那一层本来就是满屏画布，`overflow: hidden` 在那里是对的。 */
const DOC_CSS = [
  'ui/type.css',
  'ui/pages.css',
  'ui/editorial.css',
  'passport/passport.css',
  'about/about.css',
  'lineage/lineage.css',
] as const;

/** 取一条规则的声明块。选择器按原文匹配，所以断言指得到具体是哪一条规则。 */
function ruleBody(css: string, selector: string): string | null {
  const i = css.indexOf(selector);
  if (i < 0) return null;
  const open = css.indexOf('{', i);
  const close = css.indexOf('}', open);
  return open < 0 || close < 0 ? null : css.slice(open + 1, close);
}

test('1 · 文档流页面里一处 overflow-x: hidden 都没有', () => {
  for (const f of DOC_CSS) {
    const css = stripComments(src(f));
    assert.doesNotMatch(css, /overflow-x\s*:\s*(hidden|clip)/,
      `${f} 里出现了 overflow-x: hidden —— 它把横向溢出藏起来，不是修好。`
      + '被裁掉的正文照样读不到，只是滚动条不再报信了（docs/23 §S10）');
    assert.doesNotMatch(css, /\b(html|body)\s*\{[^}]*overflow\s*:\s*hidden/,
      `${f} 把 html/body 整个 overflow: hidden 了 —— 同上，而且连纵向滚动一起关掉`);
  }
});

test('2 · 满幅线的负边距和版心的边距是同一个令牌', () => {
  const css = stripComments(src('ui/editorial.css'));
  const shell = ruleBody(css, '.ed {');
  assert.ok(shell, 'editorial.css 里找不到 .ed —— 四页共用的版心外壳没了');
  assert.match(shell, /padding\s*:\s*0\s+var\(--ed-edge\)/,
    '.ed 的左右 padding 不再是 --ed-edge。满幅线是按这个令牌往回顶的，'
    + '两边不是同一个数，那条线就会在每一个宽度上捅出视口');
  const rule = ruleBody(css, '.ed-rule {');
  assert.ok(rule, 'editorial.css 里找不到 .ed-rule');
  assert.match(rule, /margin\s*:\s*0\s+calc\(\s*var\(--ed-edge\)\s*\*\s*-1\s*\)/,
    '.ed-rule 的负边距不再等于 calc(var(--ed-edge) * -1)。'
    + '它比版心 padding 大一点，整条线就伸到视口之外 —— 四页同时中招');
});

test('3 · 窄屏塌栏塌成 minmax(0, 1fr)，不是裸 1fr', () => {
  const collapses: [string, string][] = [
    ['ui/editorial.css', '.ed-hero__lede { grid-template-columns'],
    ['ui/editorial.css', '.ed-section { grid-template-columns'],
    ['passport/passport.css', '.pp-stamp__head, .pp-row { grid-template-columns'],
  ];
  for (const [file, needle] of collapses) {
    const css = stripComments(src(file));
    const i = css.indexOf(needle);
    assert.ok(i > 0, `${file} 里找不到 \`${needle}\` —— 窄屏塌栏的那一条被删了或改名了`);
    const line = css.slice(i, css.indexOf(';', i));
    assert.match(line, /minmax\(\s*0\s*,\s*1fr\s*\)/,
      `${file} 的 \`${needle}\` 塌成了裸 1fr。裸 1fr 的最小宽度是 min-content，`
      + '一条不可断的长路径就能把这一栏顶开，而它看起来仍然"只有一栏"');
    // 塌栏必须真的写在窄屏断点里，否则它在宽屏上也生效 —— 那是另一种坏
    const media = css.lastIndexOf('@media', i);
    assert.match(css.slice(media, i), /max-width/,
      `${file} 的 \`${needle}\` 不在 @media (max-width: …) 里`);
  }
});

test('4 · 装正文的那一格声明 min-width: 0', () => {
  const cells: [string, string][] = [
    ['passport/passport.css', '.pp-row__body'],
    ['ui/editorial.css', '.ed-section__body'],
    ['lineage/lineage.css', '.ln-row__body'],
  ];
  for (const [file, sel] of cells) {
    const body = ruleBody(stripComments(src(file)), `${sel} {`);
    assert.ok(body, `${file} 里找不到 ${sel}`);
    assert.match(body, /min-width\s*:\s*0/,
      `${sel} 少了 min-width: 0。grid 子项默认 min-width: auto，`
      + '这一格会撑到 min-content 而不是跟着栏宽走 —— 正文因此顶出栏外');
  }
});

test('5 · 巨题可以断在任意位置', () => {
  const body = ruleBody(stripComments(src('ui/type.css')), '.sb-display {');
  assert.ok(body, 'type.css 里找不到 .sb-display');
  assert.match(body, /overflow-wrap\s*:\s*anywhere/,
    '.sb-display 少了 overflow-wrap: anywhere。type.css 自己记过这一条：'
    + '没有它，窄屏上「SEE-ME SEE-U」会捅出视口');
});

test('6 · 存证那一列的长路径可以断', () => {
  const body = ruleBody(stripComments(src('ui/pages.css')), '.sb-evidence li {');
  assert.ok(body, 'pages.css 里找不到 .sb-evidence li');
  assert.match(body, /word-break\s*:\s*break-all/,
    '.sb-evidence li 少了 word-break: break-all。那一列装的是 '
    + 'packages/factory/src/index-parts.ts 这样的路径，不许断就一定顶开右栏');
});
