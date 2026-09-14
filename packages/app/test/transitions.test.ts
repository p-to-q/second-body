/**
 * 换页（docs/47）。四类仪表：
 *
 *  1. **每一条真实存在的路都在表里。** 路从代码里找：目录的条目、横带的回程、旁注、侧室的门、
 *     工作台目录和出口、自检页的链接、舞台右下角和控件条的重载。找出来的每一对面，
 *     连同浏览器后退走的反方向，都必须在 `TRANSITIONS` 里有一行。
 *  2. **一把尺子。** `type.css` 的时长令牌和 `MOTION` 逐字相同，也和 docs/23 §0 那一行相同。
 *  3. **第一帧的底色。** `index.html` 在任何脚本之前抄了一份 `groundFor`，这里拿真函数逐条对。
 *  4. **静止态不等动画。** 交棒有看门狗和计时上限；过渡的关键帧只挂在过渡叠层上；
 *     「减少动态效果」下交棒不动。跨页过渡整个关着（§4.3 那条测试）。
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

/**
 * **跨页过渡整个关着**（docs/47 §4.3）。
 *
 * 2026-09-14 无头 Chrome，四轮完整跑：跨页的 View Transition 在**每一类**量过的跳上都出现过
 * 整帧纯白（亮度 255、离散度 0）再淡开 —— 落到首页、从舞台出发的几跳两轮里 1–2 次，
 * 连文档页之间（08 about → making、07 展签 → 陈述页、11 figure → about）也在第二对里各白了一次，
 * 而它们在第一对里是 0 白。两次归因都被下一轮推翻（藏画布与摄像头小屏之后照白；
 * 给过渡叠层不透明的底之后照白）。原因没查到，真 GPU 上会不会白这里验证不了。
 * 所以不赌：跨页一律不过渡，退回一刀切 —— 一刀切在四轮里 0 白。
 *
 * 表仍然逐对写着，开回某一对只改一行；但**开之前先在真显示器上量**，并且把这条测试一起改掉。
 * 同文档的交棒（选择页 → 舞台）不走跨页快照，03 / 20 两跳六轮 0 白，保留。
 */
test('跨页过渡整个关着：表里除了同文档交棒全是 none，样式表和首页都不认跨页过渡', () => {
  const on = [...TRANSITIONS].filter(([, t]) => t.kind !== 'none' && t.kind !== 'handoff').map(([p, t]) => `${p} = ${t.kind}`);
  assert.deepEqual(on, [], `这些跨页过渡开着，而跨页快照在无头 Chrome 上量出过整帧白：\n${on.join('\n')}`);
  const noComments = (x: string): string => strip(x).replace(/<!--[\s\S]*?-->/g, '');
  assert.doesNotMatch(noComments(read('src/ui/type.css')), /@view-transition/, 'type.css 仍然认跨页过渡');
  const html = read('index.html');
  assert.doesNotMatch(noComments(html.slice(0, html.indexOf('</head>'))), /@view-transition/, 'index.html 仍然认跨页过渡');
  // 同文档交棒仍然在
  assert.equal(transitionFor('label', 'stage')?.kind, 'handoff');
});

test('原地换景：选择页 → 舞台是交棒，展签 → 选择页不叠平台过渡', () => {
  assert.equal(transitionFor('label', 'stage')?.kind, 'handoff');
  assert.equal(transitionFor('kiosk', 'stage')?.kind, 'handoff');
  assert.equal(transitionFor('label', 'label')?.kind, 'none');
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
  assert.equal(token('--sb-dur-move'), '', '--sb-dur-move 没有消费者，不该还在');
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
  // 看门狗在 ui/page-transition.ts（同文档交棒用它），下面那条测试查它
  assert.ok(SETTLE_MS >= MOTION.leaveMs + MOTION.enterMs, `看门狗 ${SETTLE_MS}ms 比一出一进还短`);
});

// ── 4. 静止态不等动画 ────────────────────────────────────────────────────────

test('同文档交棒：认 reduce、有看门狗、关键帧只挂在过渡叠层上', () => {
  const css = strip(read('src/ui/type.css'));
  const reduce = [...css.matchAll(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/g)].map((m) => m[1]).join('\n');
  assert.match(reduce, /::view-transition-group\(\*\)[\s\S]*animation:\s*none/, 'reduce 下同文档的交棒仍然在动');
  // sb-vt-* 这几个关键帧只许被过渡叠层取用 —— 叠层过渡完就消失，页面本身不挂任何一条
  for (const m of css.matchAll(/([^{}]+)\{[^{}]*\bsb-vt-[a-z-]+/g)) {
    const sel = m[1].trim();
    if (sel.startsWith('@keyframes')) continue;
    assert.ok(sel.split(',').every((x) => x.trim().startsWith('::view-transition')), `${sel} 把过渡的关键帧挂到了页面元素上`);
  }
  const dom = strip(read('src/ui/page-transition.ts'));
  assert.match(dom, /setTimeout\(\(\) => vt\.skipTransition\(\), SETTLE_MS\)/, '没有看门狗：过渡卡住时整页停在一张旧截图上');
  assert.match(dom, /prefers-reduced-motion: reduce/);
  // 跨页的那两个钩子不该还在：没有跨页过渡，它们永远等不到一个 viewTransition
  assert.doesNotMatch(dom, /pageswap|pagereveal/, 'page-transition.ts 还挂着跨页过渡的钩子');
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
  for (const f of ['src/ui/nav.ts', 'src/ui/hero.ts', 'dev/devnav.ts']) assert.match(read(f), /installPrefetch\(\)/, f);
  assert.doesNotMatch(read('src/main.ts'), /installPrefetch/);
});
