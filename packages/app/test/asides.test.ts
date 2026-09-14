/**
 * 旁注（`ui/asides.ts`）和「回到你来的那一页」（`ui/return-to.ts`）的四条守卫。
 *
 * docs/23 §S9.1 在 2026-09-14 按作品负责人的裁定放宽了：正文里相关的字可以链到
 * **不在目录里**的页面。放宽换来四件必须同时成立的事，每一件这里一条：
 *
 *   1. 带着 `from` 的链接，走得回它的来处（出口、Escape、那一句「返回〈名字〉」）
 *   2. `from` 拒掉站外地址和 `javascript:`（否则它就是一个开放重定向）
 *   3. 每一个被正文链到的页面都真的挂了会读 `from` 的出口，短语也真的在那句话里
 *   4. 被链到的页面一个都没有混进目录
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { ASIDES, ASIDE_PAGES, MAKING_TIMELINE_ASIDES, PASSPORT_ASIDES } from '../src/ui/asides.ts';
import { FROM_PARAM, RETURN_PAGES, fromSearch, returnLabel, safeFrom, withFrom } from '../src/ui/return-to.ts';
import { devNavActions, devNavLink, escapeTarget, WORKBENCH_HREF } from '../dev/devnav-state.ts';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string): string => readFileSync(resolve(APP, p), 'utf8');

test('带 from 的链接走得回来处：出口、Escape、名字三样都指回去', () => {
  for (const [key, site] of Object.entries(ASIDES)) {
    assert.ok(RETURN_PAGES[site.on], `${key} 挂在 ${site.on} 上，而那一页不在 RETURN_PAGES 里 —— 目的地会拒掉它的 from`);
    for (const p of site.phrases) {
      const href = withFrom(ASIDE_PAGES[p.page], site.on);
      const url = new URL(href, 'https://site.invalid');
      assert.equal(url.searchParams.get(FROM_PARAM), site.on, `${href} 没带上来处`);

      assert.deepEqual(devNavActions(url.pathname, url.search), ['return', 'exit'],
        `${href}：出口里没有「返回来处」那一条`);
      const link = devNavLink('return', url.search);
      assert.equal(link.href, site.on, `${href}：「返回」指向 ${link.href}，不是来处 ${site.on}`);
      assert.deepEqual(link.label, returnLabel(site.on));
      assert.equal(link.label.zh, `返回${RETURN_PAGES[site.on].zh}`);
      assert.equal(escapeTarget(url.pathname, url.search), site.on, `${href}：Escape 没有回来处`);
    }
  }
  // .html、尾斜杠、已有 query、fragment 都不许把 from 弄丢
  assert.equal(withFrom('/parts#t-coral', '/about.html'), '/parts?from=%2Fabout#t-coral');
  assert.equal(withFrom('/dev/figure.html?theme=coral', '/making/'), '/dev/figure.html?theme=coral&from=%2Fmaking');
  assert.equal(fromSearch('?theme=coral&from=%2Fmarks'), '/marks');
});

test('from 拒掉站外地址、javascript: 和白名单外的路径，拒掉之后就是今天的行为', () => {
  const bad = [
    'https://evil.example/about', '//evil.example', '/\\evil.example', '\\\\evil.example',
    'javascript:alert(1)', 'JavaScript:alert(1)', ' /about', '/about ', '/about\n',
    '/about?x=1', '/about#top', 'about', '/', '/dev/', '/dev/figure.html', '/unknown',
    '/%2F%2Fevil.example', '/..//evil.example', 'data:text/html,hi', '',
  ];
  for (const raw of bad) {
    assert.equal(safeFrom(raw), null, `safeFrom 放行了 ${JSON.stringify(raw)}`);
    const search = `?${FROM_PARAM}=${encodeURIComponent(raw)}`;
    assert.deepEqual(devNavActions('/dev/figure.html', search), ['workbench', 'exit'],
      `from=${JSON.stringify(raw)} 被当成了合法来处`);
    assert.equal(devNavLink('return', search).href, WORKBENCH_HREF);
    assert.equal(escapeTarget('/dev/figure.html', search), WORKBENCH_HREF);
  }
  // 没有 from：一个字都不变
  assert.deepEqual(devNavActions('/dev/figure.html'), ['workbench', 'exit']);
  assert.equal(escapeTarget('/dev/'), '/');
  // 白名单里的几种写法都认得出
  for (const ok of ['/about', '/about.html', '/about/', '/making', '/passport.html', '/lineage', '/parts', '/roster', '/marks']) {
    assert.ok(safeFrom(ok), `safeFrom 拒掉了合法来处 ${ok}`);
  }
});

test('每一个被正文链到的页面都有一个会读 from 的出口，短语也真的在那句话里', () => {
  const devnav = read('dev/devnav.ts');
  assert.match(devnav, /devNavActions\(location\.pathname, location\.search\)/);
  assert.match(devnav, /escapeTarget\(location\.pathname, location\.search\)/);
  const room = read('src/rooms/room.ts');
  assert.match(room, /heroMeta\('\/about', fromSearch\(location\.search\)\)/);

  for (const [name, path] of Object.entries(ASIDE_PAGES)) {
    const m = /^\/dev\/([a-z-]+\.html)$/.exec(path);
    assert.ok(m, `${name} → ${path}：旁注只许通向 dev/*.html（侧室走 ui/clue.ts 的门）`);
    const html = `dev/${m[1]}`;
    assert.ok(existsSync(resolve(APP, html)), `${html} 不存在 —— 正文里那条链接是断的`);
    assert.match(read(html), /<script type="module" src="\.\/devnav\.ts"><\/script>/,
      `${html} 没挂 devnav.ts：从正文点进来的人回不去`);
  }

  // 短语逐字在它挂的那句话里（中英各一次）。不在 = 门没开，而那不许静默发生
  for (const [key, site] of Object.entries(ASIDES)) {
    for (const p of site.phrases) {
      assert.ok(site.text.zh.includes(p.zh), `${key}：中文行里找不到「${p.zh}」`);
      assert.ok(site.text.en.includes(p.en), `${key}：英文行里找不到 “${p.en}”`);
    }
  }
  const passport = read('src/passport/passport.ts');
  for (const p of PASSPORT_ASIDES.stampI) {
    assert.ok(passport.includes(p.zh), `passport.ts 里找不到「${p.zh}」`);
    assert.ok(passport.includes(p.en), `passport.ts 里找不到 “${p.en}”`);
  }

  // 每一处都真的被正文页用上了，而且正文页没有绕过这张表手写一条 /dev/ 链接
  const uses: [string, RegExp][] = [
    ['src/about/about.ts', /ASIDES\.aboutCombination[\s\S]*|ASIDES\.aboutPlan/],
    ['src/making/making.ts', /MAKING_TIMELINE_ASIDES\[t\.hash\]/],
    ['src/passport/passport.ts', /consequenceAsides: PASSPORT_ASIDES\.stampI/],
    ['src/rooms/marks.ts', /ledeAsides: ASIDES\.marksLede\.phrases/],
  ];
  for (const [file, re] of uses) assert.match(read(file), re, `${file} 没有用上它那几处旁注`);
  const about = read('src/about/about.ts');
  for (const k of ['aboutCombination', 'aboutPlan', 'aboutExpress']) {
    assert.match(about, new RegExp(`ASIDES\\.${k}\\b`), `about.ts 没有用上 ASIDES.${k}`);
  }
  assert.deepEqual(Object.keys(MAKING_TIMELINE_ASIDES).sort(), ['dfc9c63', 'f826849']);
  // 注释里提到一台仪器是在给人读（about.ts 就说了"号码和 /dev/poster.html 上的是同一套"），
  // 不是链接 —— 先把注释剥掉，只看代码
  const code = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const file of ['src/about/about.ts', 'src/making/making.ts', 'src/passport/passport.ts',
    'src/lineage/lineage.ts', 'src/rooms/parts.ts', 'src/rooms/roster.ts', 'src/rooms/marks.ts', 'src/rooms/room.ts']) {
    assert.doesNotMatch(code(read(file)), /['"`]\/dev\/[a-z-]*\.html/,
      `${file} 手写了一条 /dev/ 链接。正文通向目录外只走 ui/asides.ts（这样它才带得上 from、才被这里看得见）`);
  }
});

test('被正文链到的页面一个都没有混进目录', () => {
  const nav = read('src/ui/nav.ts');
  const hrefs = [...nav.matchAll(/href: '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(hrefs, ['/', '/about', '/lineage.html', '/making.html', '/passport.html', '/dev/'],
    `目录的条目变了：${JSON.stringify(hrefs)}。目录只列面（docs/23 §S9），旁注的目的地不进这里`);
  for (const path of Object.values(ASIDE_PAGES)) {
    const base = path.split('/').pop()!;
    assert.ok(!nav.includes(base), `ui/nav.ts 里出现了 ${base} —— 一台被旁注链到的仪器进了目录`);
  }
});
