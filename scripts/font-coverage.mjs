#!/usr/bin/env node
/**
 * 楷书覆盖面核对 —— 「今天这个站真的会用楷书渲染哪些汉字」与「子集里真的有哪些」的对账。
 *
 * ## 为什么要有这个脚本
 *
 * 楷书那张 `NOTICE.md` 曾经写着子集里有 1,321 个汉字。实测是 **958**。
 * 没有人说谎 —— 是**子集化那一次的字表没有和文案一起长**，而那句数字被当成事实抄了半年。
 * 一个只在脑子里跑过一次的分析会过期；一个能重跑的脚本不会。
 * 所以这里的交付物是**脚本**，不是一张字表：下一个人重跑它，而不是重做这次分析。
 *
 * ## 它怎么知道"哪些字会走楷书"
 *
 * 楷书不是全站铺开的（边界见 `NOTICE.md`），它只挂在 `type.css` 的 `--sb-kai` 上，
 * 由几条选择器显式取用。脚本做两件事：
 *
 *  1. **哨兵**：扫 `packages/app/src` 下所有 CSS，把所有 `var(--sb-kai)` 的选择器列出来，
 *     和下面 `KAI_SOURCES` 登记的那一份比。**多出一条就报警** ——
 *     因为多出来的那条意味着有一批新文案进了楷书，而这张表还不知道。
 *     （这正是上一次出事的机制：排版规矩长了，字表没长。）
 *  2. **取字**：按登记表把对应的中文原文取出来。文案一律来自 `ui/i18n.ts`
 *     （那是全项目的文案总册），另外两处硬写在组件里的叙事句从源码里取字面量。
 *
 * ## 两层字表
 *
 *  - **narrative（严格层）**：今天确实会被楷书渲染的字。少一个就是页面上半楷半黑。
 *  - **margin（余量层）**：文案总册里**全部**的中文 + 物种名/一句话 + 中文标点与数字。
 *    为什么把整本文案都放进来：楷书的用法边界是"叙事性中文"，而叙事性中文以后
 *    只会从 `i18n.ts` 里长出来。改一句文案就要重跑子集化的字体是没人会维护的字体。
 *
 * ## 一个 upstream 的硬边界（2026-09-13 实测两次，别再踩一次）
 *
 * 楷体的字身有繁简之别，而站里的文案是**简体**。上一版用的芫荽 Iansui 是台湾的字体，
 * 上游 v1.020 的 cmap 有 12,666 个码位，但「关 观 对 实 验 选 过 们」这类**简体专用字**
 * 根本不在里面 —— 它们不是子集化漏掉的，**是上游没有**，重跑一百遍子集化也救不了。
 * 严格层 354 个字里它给不出 81 个。所以 2026-09-13 换成了**霞鹜文楷 LXGW WenKai**
 * （同样改自 Klee One，同为 SIL OFL 1.1，但补的是 GB 简体），严格层 354/354。
 *
 * 换字之后这个参数没有过期：任何一支候选字体在换进来**之前**都该先过这一关。
 * 传 `--upstream=<某个候选 TTF>` 就会把"上游根本没有"的那一类单列出来 ——
 * 严格层不是 0 的字体，不要换进来。
 *
 * ## 用法
 *
 *   node scripts/font-coverage.mjs                      对账：打印字表与差集
 *   node scripts/font-coverage.mjs --upstream=/tmp/LXGWWenKaiLite-Regular.ttf
 *   node scripts/font-coverage.mjs --write=/tmp/chars.txt   写出子集化用的字表
 *   node scripts/font-coverage.mjs --print-set             只打印严格层字表
 *
 * 重新子集化（13.8 MB 的上游 TTF **不进仓库**，用完即弃）：
 *
 *   curl -L -o /tmp/LXGWWenKaiLite-Regular.ttf \
 *     https://github.com/lxgw/LxgwWenKai-Lite/releases/download/v1.522/LXGWWenKaiLite-Regular.ttf
 *   node scripts/font-coverage.mjs --upstream=/tmp/LXGWWenKaiLite-Regular.ttf --write=/tmp/kai-chars.txt
 *   pyftsubset /tmp/LXGWWenKaiLite-Regular.ttf --text-file=/tmp/kai-chars.txt \
 *     --output-file=assets/fonts/LXGWWenKai/LXGWWenKai-subset.woff --flavor=woff \
 *     --layout-features= --no-hinting --desubroutinize --drop-tables+=DSIG
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = resolve(ROOT, 'packages/app/src');
const SUBSET = resolve(ROOT, 'assets/fonts/LXGWWenKai/LXGWWenKai-subset.woff');

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');
const has = (k) => process.argv.includes(`--${k}`);

const isCjk = (c) => /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(c);
const cjkOf = (s) => [...s].filter(isCjk);

// ─────────────────────── 1. 哨兵：谁在用 --sb-kai ───────────────────────

/**
 * 登记表。**每一条都必须同时出现在 CSS 里**，否则说明这份表过期了。
 * `keys` 是 `i18n.ts` 里 `COPY` 的路径；`raw` 是硬写在组件里的中文（见各条注释）。
 */
const KAI_SOURCES = [
  { selector: '.sb-entry-lede .sb-zh', css: 'shell/entry.css', keys: ['entry.question'] },
  {
    selector: '.sb-wordmark-line .sb-zh', css: 'ui/wordmark.css',
    // 字标下面那句说明牌写死在组件里（它不是文案总册的一条，是标识的一部分）
    literals: { file: 'ui/wordmark.ts', re: /const LINE = bi\(\s*'([^']*)'/ },
  },
  {
    selector: '.sb-tagline .sb-zh', css: 'ui/pages.css',
    // 物种的一句话来自资产索引，不来自文案总册
    themes: true,
  },
  {
    selector: '.sb-quote .sb-zh', css: 'ui/pages.css',
    // 护照上的"原话"。整页的中文都是叙事性的，所以整页的 bi() 字面量一起取
    literals: { file: 'passport/passport.ts', re: /bi\(\s*'((?:[^'\\]|\\.)*)'/g },
  },
  { selector: '.sb-lede .sb-zh', css: 'ui/pages.css', literals: { file: 'passport/passport.ts', re: /bi\(\s*'((?:[^'\\]|\\.)*)'/g } },
  {
    selector: '.about-lede .sb-zh', css: 'about/about.css',
    keys: ['subtitle', 'about.statementLead', 'entry.question', 'about.whatLead', 'about.whyDiff', 'privacy.short'],
  },
];

function cssFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...cssFiles(p));
    else if (e.endsWith('.css')) out.push(p);
  }
  return out;
}

/** 扫出所有真的在用 `var(--sb-kai)` 的选择器（定义行本身不算） */
function liveKaiSelectors() {
  const found = [];
  for (const f of cssFiles(APP)) {
    const text = readFileSync(f, 'utf8');
    // 去掉注释，否则注释里提到 --sb-kai 的段落会被当成规则
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of code.matchAll(/([^{}]+)\{[^{}]*var\(--sb-kai\)[^{}]*\}/g)) {
      for (const sel of m[1].split(',')) {
        const s = sel.trim().replace(/\s+/g, ' ');
        if (s && s !== ':root') found.push(s);
      }
    }
  }
  return [...new Set(found)].sort();
}

// ─────────────────────── 2. 取字 ───────────────────────

const { COPY } = await import(resolve(APP, 'ui/i18n.ts'));
const pick = (path) => path.split('.').reduce((o, k) => o?.[k], COPY);

function literalsOf(spec) {
  const text = readFileSync(resolve(APP, spec.file), 'utf8');
  if (spec.re.global) return [...text.matchAll(spec.re)].map((m) => m[1]);
  const m = text.match(spec.re);
  return m ? [m[1]] : [];
}

/** 物种名与一句话 —— 资产索引缺席时返回空数组（P3：没有 parts.json 也要能跑） */
function themeStrings() {
  try {
    const idx = JSON.parse(readFileSync(resolve(ROOT, 'assets/parts/parts.json'), 'utf8'));
    return (idx.themes ?? []).flatMap((t) => [t.name ?? '', t.tagline ?? '']);
  } catch {
    return [];
  }
}

function narrativeChars() {
  const set = new Set();
  for (const src of KAI_SOURCES) {
    for (const k of src.keys ?? []) {
      const v = pick(k);
      if (v?.zh) cjkOf(v.zh).forEach((c) => set.add(c));
    }
    if (src.literals) for (const s of literalsOf(src.literals)) cjkOf(s).forEach((c) => set.add(c));
    if (src.themes) for (const s of themeStrings()) cjkOf(s).forEach((c) => set.add(c));
  }
  return set;
}

/** 余量层：整本文案总册 + 物种表 + 中文标点与全角数字 */
const PUNCT = [...'　、。〈〉《》「」『』【】〔〕・ー－—…‥‧“”‘’（）［］｛｝！？：；，．～¥￥·',
  ...'０１２３４５６７８９',
  ...'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ'];

function marginChars() {
  const set = narrativeChars();
  const walk = (v) => {
    if (typeof v === 'string') cjkOf(v).forEach((c) => set.add(c));
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(COPY);
  for (const s of themeStrings()) cjkOf(s).forEach((c) => set.add(c));
  for (const c of PUNCT) set.add(c);
  // 拉丁与数字：楷书的 `unicode-range` 不声明它们，但子集带上基本 ASCII 才不会
  // 在 `.notdef` 上出怪事（成本约 100 个字形，可以忽略）
  for (let i = 0x20; i <= 0x7e; i++) set.add(String.fromCharCode(i));
  return set;
}

// ─────────────────────── 3. 读字体的 cmap（零依赖） ───────────────────────

/**
 * 只做一件事：把 TTF / WOFF 的 cmap 码位读出来。
 * 为什么不装 opentype.js：五十行能做完的事不该换来一个依赖（AGENTS.md）。
 * WOFF 的表可能是 zlib 压缩的，Node 自带 zlib；WOFF2 是 brotli + 表重组，这里不支持
 * —— 站里的字体全是 WOFF，要改格式的那天再说。
 */
function readTables(buf) {
  const tag = buf.readUInt32BE(0);
  const tables = new Map();
  if (tag === 0x774f4646) {              // 'wOFF'
    const n = buf.readUInt16BE(12);
    for (let i = 0; i < n; i++) {
      const o = 44 + i * 20;
      const name = buf.toString('latin1', o, o + 4);
      const off = buf.readUInt32BE(o + 4), comp = buf.readUInt32BE(o + 8), orig = buf.readUInt32BE(o + 12);
      const raw = buf.subarray(off, off + comp);
      tables.set(name, comp === orig ? raw : inflateSync(raw));
    }
  } else {                               // TTF / OTF
    const n = buf.readUInt16BE(4);
    for (let i = 0; i < n; i++) {
      const o = 12 + i * 16;
      const name = buf.toString('latin1', o, o + 4);
      const off = buf.readUInt32BE(o + 8), len = buf.readUInt32BE(o + 12);
      tables.set(name, buf.subarray(off, off + len));
    }
  }
  return tables;
}

function codepoints(file) {
  const tables = readTables(readFileSync(file));
  const cmap = tables.get('cmap');
  if (!cmap) throw new Error(`${file}: 没有 cmap 表`);
  const n = cmap.readUInt16BE(2);
  let best = null, bestScore = -1;
  for (let i = 0; i < n; i++) {
    const p = 4 + i * 8;
    const plat = cmap.readUInt16BE(p), enc = cmap.readUInt16BE(p + 2), off = cmap.readUInt32BE(p + 4);
    const fmt = cmap.readUInt16BE(off);
    // 认 format 12（全 Unicode）优先，其次 format 4（BMP）
    const score = fmt === 12 ? 3 : (plat === 3 && enc === 1 && fmt === 4) ? 2 : (fmt === 4 ? 1 : 0);
    if (score > bestScore) { bestScore = score; best = { off, fmt }; }
  }
  const set = new Set();
  if (best.fmt === 4) {
    const o = best.off, segX2 = cmap.readUInt16BE(o + 6), seg = segX2 / 2;
    const endO = o + 14, startO = endO + segX2 + 2, deltaO = startO + segX2, rangeO = deltaO + segX2;
    for (let s = 0; s < seg; s++) {
      const end = cmap.readUInt16BE(endO + s * 2), start = cmap.readUInt16BE(startO + s * 2);
      const delta = cmap.readInt16BE(deltaO + s * 2), ro = cmap.readUInt16BE(rangeO + s * 2);
      if (start === 0xffff) continue;
      for (let c = start; c <= end; c++) {
        let g;
        if (ro === 0) g = (c + delta) & 0xffff;
        else {
          const gi = rangeO + s * 2 + ro + (c - start) * 2;
          if (gi + 1 >= cmap.length) continue;
          g = cmap.readUInt16BE(gi);
          if (g) g = (g + delta) & 0xffff;
        }
        if (g) set.add(c);
      }
    }
  } else if (best.fmt === 12) {
    const o = best.off, groups = cmap.readUInt32BE(o + 12);
    for (let i = 0; i < groups; i++) {
      const g = o + 16 + i * 12;
      const s = cmap.readUInt32BE(g), e = cmap.readUInt32BE(g + 4);
      for (let c = s; c <= e; c++) set.add(c);
    }
  } else throw new Error(`${file}: 不认识的 cmap format ${best.fmt}`);
  return set;
}

const numGlyphs = (file) => readTables(readFileSync(file)).get('maxp').readUInt16BE(4);

// ─────────────────────── 4. 对账 ───────────────────────

const sortSet = (s) => [...s].sort((a, b) => a.codePointAt(0) - b.codePointAt(0));

const narrative = narrativeChars();
const margin = marginChars();

if (has('print-set')) { console.log(sortSet(narrative).join('')); process.exit(0); }

const writeTo = arg('write');
if (writeTo) {
  writeFileSync(writeTo, sortSet(margin).join(''), 'utf8');
  console.log(`字表已写出 → ${writeTo}（${margin.size} 个码位）`);
}

const live = liveKaiSelectors();
const known = new Set(KAI_SOURCES.map((s) => s.selector));
const unknown = live.filter((s) => !known.has(s));
const stale = [...known].filter((s) => !live.includes(s));

console.log('\n── --sb-kai 挂在哪 ──────────────────────────────');
for (const s of live) console.log(`  ${known.has(s) ? '✓' : '✗ 未登记'} ${s}`);
for (const s of stale) console.log(`  ! 登记了但 CSS 里已经没有：${s}`);
if (unknown.length) {
  console.log('\n⚠️  有选择器在用楷书，但 KAI_SOURCES 不知道它渲染的是哪些文案。');
  console.log('   把它登记进 scripts/font-coverage.mjs，否则下一次子集化又会漏字。');
}

console.log('\n── 字表 ────────────────────────────────────────');
console.log(`  严格层（今天就会走楷书的汉字）：${narrative.size}`);
console.log(`  余量层（子集化实际用的码位）  ：${margin.size}`);

const have = codepoints(SUBSET);
const missing = sortSet(narrative).filter((c) => !have.has(c.codePointAt(0)));
const marginMissing = sortSet(margin).filter((c) => !have.has(c.codePointAt(0)) && isCjk(c));

console.log('\n── 现有子集 ────────────────────────────────────');
console.log(`  ${SUBSET.replace(`${ROOT}/`, '')}`);
console.log(`  ${statSync(SUBSET).size.toLocaleString('en-US')} 字节 · cmap ${have.size} 个码位 · ${numGlyphs(SUBSET)} 个字形`);
console.log(`  严格层缺字：${missing.length}${missing.length ? `  → ${missing.join('')}` : '  （没有缺字）'}`);
console.log(`  余量层缺字：${marginMissing.length}`);

const up = arg('upstream');
if (up) {
  const upCp = codepoints(up);
  const noUp = sortSet(margin).filter((c) => isCjk(c) && !upCp.has(c.codePointAt(0)));
  const noUpStrict = sortSet(narrative).filter((c) => !upCp.has(c.codePointAt(0)));
  console.log('\n── 上游能给到哪 ────────────────────────────────');
  console.log(`  ${up} · cmap ${upCp.size} 个码位`);
  console.log(`  上游**没有**的（简体专用字居多，子集化救不了）：严格层 ${noUpStrict.length} / 余量层 ${noUp.length}`);
  if (noUpStrict.length) console.log(`  严格层里上游没有的：${noUpStrict.join('')}`);
}
console.log('');
