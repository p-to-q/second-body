/**
 * 换页（docs/47）。四类仪表：
 *
 *  1. **每一条真实存在的路都在表里。** 路从代码里找：目录的条目、横带的回程、旁注、侧室的门、
 *     工作台目录和出口、自检页的链接、舞台右下角和控件条的重载。找出来的每一对面，
 *     连同浏览器后退走的反方向，都必须在 `TRANSITIONS` 里有一行。
 *  2. **一把尺子。** `type.css` 的时长令牌和 `MOTION` 逐字相同，也和 docs/23 §0 那一行相同。
 *  3. **第一帧的底色。** `index.html` 在任何脚本之前抄了一份 `groundFor`，这里拿真函数逐条对。
 *  4. **静止态不等动画。** 过渡有看门狗；交棒有计时上限；过渡的关键帧只挂在过渡叠层上；
 *     「减少动态效果」下平台过渡整个关掉。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HANDOFF_WAIT_MS, MOTION, PRERENDER_PATHS, SETTLE_MS, TRANSITIONS, groundFor, speculationRules,
  surfaceOf, transitionFor, type Surface,
} from '../src/ui/transitions.ts';
import { RETURN_PAGES } from '../src/ui/return-to.ts';
import { ASIDE_PAGES } from '../src/ui/asides.ts';

const APP = fileURLToPath(new URL('../', import.meta.url));
const read = (p: string): string => readFileSync(join(APP, p), 'utf8');
const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const surf = (href: string): Surface => {
  const u = new URL(href, 'https://x.invalid');
  return surfaceOf(u.pathname, u.search);
};

// ── 1. 路 ────────────────────────────────────────────────────────────────────

interface Road { from: Surface; to: Surface; where: string }

function roads(): Road[] {
  const out: Road[] = [];
  const add = (from: Surface, hrefs: string[], where: string): void => {
    for (const h of hrefs) {
      const to = surf(h);
      // 目录把当前页渲染成 <span>，不是一条路
      if (where === 'ui/nav.ts' && from === to && from !== 'doc' && from !== 'workbench') continue;
      out.push({ from, to, where: `${where} → ${h}` });
    }
  };
  const navHrefs = [...read('src/ui/nav.ts').matchAll(/href: '([^']+)'/g)].map((m) => m[1]);
  assert.ok(navHrefs.length >= 6, 'nav.ts 的条目没读到');
  // 目录挂在：展签/选择页、舞台（main.ts）、四张文档页、404
  for (const from of ['label', 'stage', 'doc', 'missing'] as Surface[]) add(from, navHrefs, 'ui/nav.ts');

  // 横带：默认回程 + 每一种合法来处（ui/return-to.ts 的白名单；舞台只以带 theme 的形状被认）
  const returns = Object.keys(RETURN_PAGES).map((p) => (p === '/' ? '/?theme=x' : p));
  add('doc', ['/', '/about', ...returns], 'ui/hero.ts');
  add('room', ['/about', ...returns], 'rooms/room.ts');
  add('missing', ['/'], 'notfound');
  // 旁注 → 工作台仪器；侧室的门
  add('doc', Object.values(ASIDE_PAGES), 'ui/asides.ts');
  add('room', Object.values(ASIDE_PAGES), 'ui/asides.ts');
  add('doc', ['/parts', '/roster', '/marks'], 'ui/clue.ts');

  // 工作台：目录页的每一行；每一页的出口（返回工作台 / 回到作品 / 返回来处）
  const devIndex = [...read('dev/index.ts').matchAll(/href: '([^']+)'/g)].map((m) => m[1]);
  assert.ok(devIndex.length >= 10, 'dev/index.ts 的行没读到');
  add('workbench', [...devIndex, '/dev', '/', ...returns], 'dev/index.ts + dev/devnav.ts');

  // 自检页的那一排
  const selftest = [...strip(read('src/shell/selftest.ts')).matchAll(/link\('[^']*',\s*'([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(selftest.length >= 4, 'selftest.ts 的链接没读到');
  add('selftest', selftest, 'shell/selftest.ts');

  // 舞台上的三种重载 + 展签上的「了解」+ 空位深链
  assert.match(read('src/ui/exits.ts'), /location\.assign\(`\$\{location\.pathname\}\?\$\{hallSearch/);
  out.push({ from: 'stage', to: 'label', where: 'ui/exits.ts 回到大厅' });
  assert.match(read('src/ui/controls.ts'), /location\.assign\(`\$\{location\.pathname\}\?\$\{q\.toString\(\)\}`\)/);
  out.push({ from: 'stage', to: 'stage', where: 'ui/controls.ts 换物种 / 随机' });
  add('stage', ['/dev/lineup.html', '/dev/figure.html'], 'ui/stage-url.ts 工作台链接');
  assert.match(read('src/shell/entry.ts'), /learn\.href = '\/about'/);
  out.push({ from: 'label', to: 'doc', where: 'shell/entry.ts 了解这件作品' });
  out.push({ from: 'stage', to: 'doc', where: 'shell/vacancy.ts 空位' });
  // 原地的两次换景
  out.push({ from: 'label', to: 'label', where: 'shell/entry.ts 开始 → 选择页' });
  out.push({ from: 'label', to: 'stage', where: 'choose/choose.ts 选定' });
  out.push({ from: 'kiosk', to: 'stage', where: 'choose/choose.ts 选定（现场）' });
  return out;
}

test('代码里的每一条路，连同它的后退方向，在过渡表里都有一行', () => {
  const missing = new Set<string>();
  for (const r of roads()) {
    if (!transitionFor(r.from, r.to)) missing.add(`${r.from}>${r.to}   （${r.where}）`);
    const inPage = r.where.includes('选定') || r.where.includes('开始');
    if (!inPage && !transitionFor(r.to, r.from)) missing.add(`${r.to}>${r.from}   （后退：${r.where}）`);
  }
  assert.deepEqual([...missing], [], `这些路没有设计过怎么过：\n${[...missing].join('\n')}`);
});

test('原地换景：选择页 → 舞台是交棒，展签 → 选择页不叠平台过渡', () => {
  assert.equal(transitionFor('label', 'stage')?.kind, 'handoff');
  assert.equal(transitionFor('kiosk', 'stage')?.kind, 'handoff');
  assert.equal(transitionFor('label', 'label')?.kind, 'none');
  // 共享元素只在文字真的相同的两页之间
  assert.deepEqual(transitionFor('label', 'doc')?.shared, ['title', 'mark']);
  assert.deepEqual(transitionFor('doc', 'room')?.shared, ['mark']);
  assert.deepEqual(transitionFor('stage', 'doc')?.shared, []);
  // 表里只有这几种
  for (const [pair, t] of TRANSITIONS) assert.ok(['crossfade', 'handoff', 'none'].includes(t.kind), pair);
});

test('面的判定', () => {
  const cases: [string, Surface][] = [
    ['/', 'label'], ['/?scene=tide&vitality=1', 'label'], ['/?demo=1&debug=1', 'label'],
    ['/?kiosk=1', 'kiosk'], ['/?kiosk=1&theme=xeno', 'stage'], ['/?theme=porcelain', 'stage'],
    ['/?selftest=1', 'selftest'], ['/index.html', 'label'], ['/about', 'doc'], ['/making.html', 'doc'],
    ['/passport/', 'doc'], ['/parts', 'room'], ['/dev', 'workbench'], ['/dev/', 'workbench'],
    ['/dev/figure.html', 'workbench'], ['/nope', 'missing'],
  ];
  for (const [href, want] of cases) assert.equal(surf(href), want, href);
});

// ── 2. 一把尺子 ──────────────────────────────────────────────────────────────

test('type.css 的时长与缓动令牌就是 MOTION，也就是 docs/23 §0 那一行', () => {
  const css = strip(read('src/ui/type.css'));
  const token = (n: string): string => (new RegExp(`${n}\\s*:\\s*([^;]+);`).exec(css)?.[1] ?? '').trim();
  assert.equal(token('--sb-dur-leave'), `${MOTION.leaveMs}ms`);
  assert.equal(token('--sb-dur-enter'), `${MOTION.enterMs}ms`);
  assert.equal(token('--sb-dur-move'), `${MOTION.moveMs}ms`);
  assert.equal(token('--sb-ease-enter'), MOTION.easeEnter);
  assert.equal(token('--sb-ease-leave'), MOTION.easeLeave);
  const spec = readFileSync(join(APP, '../../docs/23-SPEC-ui.md'), 'utf8');
  assert.match(spec, new RegExp(`进 ${MOTION.enterMs}ms / 出 ${MOTION.leaveMs}ms`));
  const flat = (s: string): string => s.replace(/\s+/g, '');
  assert.ok(flat(spec).includes(`\`${flat(MOTION.easeEnter)}\``) && flat(spec).includes(`\`${flat(MOTION.easeLeave)}\``));
});

// ── 3. 第一帧的底色 ─────────────────────────────────────────────────────────

test('index.html 第一帧之前那几行，和 groundFor 逐条一致', () => {
  const html = read('index.html');
  const head = html.slice(0, html.indexOf('</head>'));
  const script = [...head.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes('sb-first-screen'));
  assert.ok(script, 'index.html 的 <head> 里没有决定首帧底色的那段脚本');
  for (const search of ['', '?scene=tide', '?kiosk=1', '?demo=1&debug=1', '?theme=xeno', '?kiosk=1&theme=xeno', '?selftest=1', '?theme=']) {
    const classes = new Set<string>();
    const fakeDoc = { documentElement: { classList: { add: (c: string) => classes.add(c) } } };
    const listeners: string[] = [];
    new Function('location', 'document', 'addEventListener', script!)({ search }, fakeDoc, (t: string) => listeners.push(t));
    assert.equal(classes.has('sb-first-screen') ? 'paper' : 'dark', groundFor('/', search), `?${search}`);
  }
  assert.match(head, /html\.sb-first-screen[^{]*\{[^}]*background:\s*#fafafa/, '纸底要在样式表到达之前就在');
  assert.match(head, /@view-transition\s*\{\s*navigation:\s*auto;?\s*\}/, '首页不认跨页过渡：它的样式表是脚本带进来的，晚于第一帧');
  assert.match(head, /prefers-reduced-motion:\s*reduce\)\s*\{\s*@view-transition\s*\{\s*navigation:\s*none/);
  assert.ok(script!.includes(`skipTransition()},${SETTLE_MS})`) || script!.includes(`skipTransition() }, ${SETTLE_MS})`),
    `首页的看门狗不是 ${SETTLE_MS}ms`);
});

// ── 4. 静止态不等动画 ────────────────────────────────────────────────────────

test('跨页过渡：认 reduce、有看门狗、关键帧只挂在过渡叠层上', () => {
  const css = strip(read('src/ui/type.css'));
  assert.match(css, /@view-transition\s*\{\s*navigation:\s*auto;?\s*\}/);
  const reduce = [...css.matchAll(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/g)].map((m) => m[1]).join('\n');
  assert.match(reduce, /@view-transition\s*\{\s*navigation:\s*none/, 'reduce 下没有关掉跨页过渡');
  assert.match(reduce, /::view-transition-group\(\*\)[\s\S]*animation:\s*none/, 'reduce 下同文档的交棒仍然在动');
  // sb-vt-* 这几个关键帧只许被过渡叠层取用 —— 叠层过渡完就消失，页面本身不挂任何一条
  for (const m of css.matchAll(/([^{}]+)\{[^{}]*\bsb-vt-[a-z-]+/g)) {
    const sel = m[1].trim();
    if (sel.startsWith('@keyframes')) continue;
    assert.ok(sel.split(',').every((s) => s.trim().startsWith('::view-transition')), `${sel} 把过渡的关键帧挂到了页面元素上`);
  }
  const dom = strip(read('src/ui/page-transition.ts'));
  assert.match(dom, /setTimeout\(\(\) => vt\.skipTransition\(\), SETTLE_MS\)/, '没有看门狗：过渡卡住时整页停在一张旧截图上');
  assert.match(dom, /prefers-reduced-motion: reduce/);
});

test('交棒：选择页等舞台画出第一帧，但最多等 HANDOFF_WAIT_MS', () => {
  const dom = strip(read('src/ui/page-transition.ts'));
  assert.match(dom, /setTimeout\(resolve, capMs\)/);
  assert.match(dom, /capMs = HANDOFF_WAIT_MS/);
  assert.ok(HANDOFF_WAIT_MS <= 5000);
  const choose = strip(read('src/choose/choose.ts'));
  assert.match(choose, /stageShown\(\)\.then\(handOver\)/);
  assert.match(choose, /handOff\(/);
  assert.match(strip(read('src/main.ts')), /loop\.start\(\);\s*announceStageShown\(\);/);
});

test('预渲染只给文字页；舞台、工作台、侧室、存档一律不预渲染，舞台和存档连预取都不做', () => {
  assert.deepEqual([...PRERENDER_PATHS].sort(), ['/about', '/lineage', '/making', '/passport']);
  const json = JSON.stringify(speculationRules());
  const prerender = JSON.stringify((speculationRules() as { prerender: unknown }).prerender);
  for (const p of ['"/"', '/dev', '/parts', '/roster', '/marks', '/api']) assert.ok(!prerender.includes(p), `预渲染规则里出现了 ${p}`);
  assert.match(json, /"not":\{"or":\[[^\]]*\{"href_matches":"\/"\}[^\]]*\{"href_matches":"\/api\/\*"\}/);
  // 规则只由三个出口构件装上 —— 现场（?kiosk=1）一个都不挂，所以现场从不预取
  for (const f of ['src/ui/nav.ts', 'src/ui/hero.ts', 'dev/devnav.ts']) assert.match(read(f), /installPageTransitions\(\)/, f);
  assert.doesNotMatch(read('src/main.ts'), /installPageTransitions/);
});
