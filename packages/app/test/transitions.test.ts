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
 *  5. **截图读得到。** GPU 画布截图前冻成图；叠层底是底色令牌；共享元素只由建它的地方声明。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HANDOFF_WAIT_MS, MOTION, NO_TRANSITION_REASONS, PRERENDER_PATHS, SETTLE_MS, SHARED_NAME, TRANSITIONS, framesSteady,
  groundFor, speculationRules, surfaceOf, transitionAllowed, transitionFor, vtDisabled, type Shared, type Surface,
} from '../src/ui/transitions.ts';
import { blockRender, isHomeHtml } from '../build/render-blocking.ts';
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
 * **跨页过渡开着，每一对都有过渡**（docs/47 §4.3）。不过渡的只许是 `NO_TRANSITION_REASONS` 里写了理由的那几对。
 *
 * 第一轮在无头 Chrome 上量到过整帧纯白、关掉过；根因是 WebGPU 画布出了绘制它的任务就读不到，
 * 旧页截图时它是透明的，透出叠层缺省的白。修在根上（冻画布 + 叠层底色令牌）之后，有头 / 无头各跑 ≥10 轮。
 */
test('每一对都有过渡；none 只出现在写了理由的那几对上，理由表里的每一行在表里真的是 none', () => {
  const silent: string[] = [];
  for (const [pair, t] of TRANSITIONS) {
    if (t.kind === 'none' && !NO_TRANSITION_REASONS[pair]) silent.push(pair);
  }
  assert.deepEqual(silent, [], `这些对不过渡，也没有写理由：\n${silent.join('\n')}`);
  for (const [pair, why] of Object.entries(NO_TRANSITION_REASONS)) {
    assert.equal(TRANSITIONS.get(pair as never)?.kind, 'none', `${pair} 写了不过渡的理由，表里却不是 none`);
    assert.ok((why ?? '').length > 20, `${pair} 的理由太短`);
  }
  const noComments = (x: string): string => strip(x).replace(/<!--[\s\S]*?-->/g, '');
  assert.match(noComments(read('src/ui/type.css')), /@view-transition\s*\{\s*navigation:\s*auto;?\s*\}/, 'type.css 不认跨页过渡');
  const html = read('index.html');
  assert.match(noComments(html.slice(0, html.indexOf('</head>'))), /@view-transition\s*\{\s*navigation:\s*auto\s*\}/, 'index.html 不认跨页过渡');
});

test('过渡叠层的底是底色令牌，不是缺省的白（样式表一份，首页第一帧之前深 / 纸各一份）', () => {
  const css = strip(read('src/ui/type.css'));
  assert.match(css, /::view-transition\s*\{\s*background:\s*var\(--sb-paper\);?\s*\}/, '::view-transition 没有底色令牌');
  const html = read('index.html');
  const head = html.slice(0, html.indexOf('</head>'));
  assert.match(head, /::view-transition\{background:#0e0f12\}/);
  assert.match(head, /html\.sb-first-screen::view-transition\{background:#fafafa\}/);
});

test('原地换景：选择页 → 舞台是交棒，展签 → 选择页由 entry.ts 把巨题挪成字标', () => {
  assert.equal(transitionFor('label', 'stage')?.kind, 'handoff');
  assert.equal(transitionFor('kiosk', 'stage')?.kind, 'handoff');
  assert.equal(transitionFor('label', 'label')?.kind, 'none');
  for (const [pair, t] of TRANSITIONS) assert.ok(['crossfade', 'handoff', 'none'].includes(t.kind), pair);
  const entry = strip(read('src/shell/entry.ts'));
  assert.match(entry, /morph\(title, 'mark', \(\) => layer\.remove\(\)\)\) layer\.remove\(\)/, '字标等不到时展签必须照样被拆');
  assert.match(entry, /brandShown\(\)/);
  assert.match(strip(read('src/choose/choose.ts')), /announceBrand\(\)/);
});

test('共享元素：每一种都由建它的地方声明，页面上没有第二处写 view-transition-name', () => {
  const declared: Record<Shared, string> = {
    title: 'src/about/about.ts', mark: 'src/ui/hero.ts', nav: 'src/ui/nav.ts', devnav: 'dev/devnav.ts', footer: 'src/ui/footer-mark.ts',
  };
  for (const [kind, file] of Object.entries(declared)) {
    assert.match(strip(read(file)), new RegExp(`declareShared\\([^;]*'${kind}'\\)`), `${file} 没有声明 ${kind}`);
  }
  assert.match(strip(read('src/shell/entry.ts')), /declareShared\(h1, 'title'\)/);
  assert.match(strip(read('src/choose/choose.ts')), /declareShared\(markNode\('div', 'start'\), 'mark'\)/);
  for (const k of Object.keys(SHARED_NAME)) assert.ok(k in declared, `${k} 没有登记声明处`);
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of readdirSync(join(APP, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel, out); else if (/\.(ts|css)$/.test(e.name)) out.push(rel);
    }
    return out;
  };
  const writers = [...walk('src'), ...walk('dev')]
    .filter((f) => f !== 'src/ui/page-transition.ts' && /view-transition-name/.test(strip(read(f))));
  assert.deepEqual(writers, [], `这些文件自己写 view-transition-name：\n${writers.join('\n')}`);
});

test('GPU 画布截图前先冻住：舞台和环登记，交棒前冻，往返缓存回来时解冻', () => {
  const dom = strip(read('src/ui/page-transition.ts'));
  assert.match(dom, /for \(const f of freezables\) freezeCanvas\(f\);/, 'pageswap 里没有冻画布');
  assert.match(dom, /f\.render\(\);\s*ctx\.drawImage\(src/, '冻的时候不是同一个任务里先画再拷');
  assert.match(dom, /persisted\) \{ thaw\(\); unname\(\); \}/);
  assert.match(strip(read('src/main.ts')), /registerFreezable\(\{ canvas: renderer\.domElement, render: \(\) => stage\.render\(renderer\) \}\)/);
  const field = strip(read('src/choose/ring/field.ts'));
  assert.match(field, /registerFreezable\(\{ canvas,/);
  assert.match(field, /unfreezable\(\);/, '环拆掉时没有撤销登记');
  const choose = strip(read('src/choose/choose.ts'));
  assert.ok(choose.indexOf('freezeCanvas(') < choose.indexOf('field?.dispose();'), '交棒要先冻再拆环');
});

test('摄像头开着的页离开时不做跨页过渡（有头 Chrome 量出过白帧）', () => {
  assert.match(strip(read('src/ui/page-transition.ts')), /traverse, cameraLive: cameraLive\(\),/);
  assert.equal(transitionFor('missing', 'label')?.kind, 'none');
});

test('门槛：任何一条不满足都一刀切', () => {
  const ok = { supported: true, reduced: false, vtOff: false, kiosk: false, traverse: false, cameraLive: false };
  assert.equal(transitionAllowed(ok), true);
  for (const k of Object.keys(ok) as (keyof typeof ok)[]) {
    const flipped = { ...ok, [k]: !ok[k] };
    assert.equal(transitionAllowed(flipped), false, `${k} 翻过来之后仍然会过渡`);
  }
  assert.equal(vtDisabled('?vt=off'), true);
  assert.equal(vtDisabled('?vt=on'), false);
  assert.equal(vtDisabled(''), false);
  // 首页行内那几行也认 ?vt=off、现场、前进后退
  const head = headScripts().join('\n');
  assert.match(head, /q\.get\('vt'\)==='off'\|\|q\.get\('kiosk'\)==='1'\|\|tr/);
});

test('出错一律一刀切；原地过渡永远有尽头；拿摄像头之前等它收完', () => {
  const dom = strip(read('src/ui/page-transition.ts'));
  for (const ev of ['pageswap', 'pagereveal']) {
    const at = dom.indexOf(`addEventListener('${ev}'`);
    const body = dom.slice(at, dom.indexOf('\n  });', at));
    assert.match(body, /try \{[\s\S]*\} catch \{\s*vt\.skipTransition\(\);/, `${ev} 里的意外不会退回一刀切`);
  }
  assert.match(dom, /try \{\s*vt = start\.call\(document, update\);\s*\} catch \{\s*return false;/, 'startViewTransition 抛异常时没有退路');
  assert.match(dom, /setTimeout\(r, SETTLE_MS \+ 50\)/, 'transitionIdle 没有上限');
  const main = strip(read('src/main.ts'));
  assert.match(main, /await transitionIdle\(\);\s*await swapCapture\(/);
  assert.match(main, /await transitionIdle\(\); return swapCapture\('webcam'\);/);
});

test('pageswap / pagereveal 里没有异步工作', () => {
  const dom = strip(read('src/ui/page-transition.ts'));
  for (const ev of ['pageswap', 'pagereveal']) {
    const at = dom.indexOf(`addEventListener('${ev}'`);
    assert.ok(at > 0, `没有 ${ev}`);
    const body = dom.slice(at, dom.indexOf('\n  });', at));
    assert.doesNotMatch(body, /\bawait\b|\.then\(|requestAnimationFrame/, `${ev} 里有异步工作`);
  }
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
  const flat = (x: string): string => x.replace(/\s+/g, '');
  assert.ok(flat(spec).includes(`\`${flat(MOTION.easeEnter)}\``) && flat(spec).includes(`\`${flat(MOTION.easeLeave)}\``));
});

// ── 3. 第一帧 ────────────────────────────────────────────────────────────────

const headScripts = (): string[] => {
  const html = read('index.html');
  return [...html.slice(0, html.indexOf('</head>')).matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
};
const runHead = (script: string, search: string, win: Record<string, unknown>, classes = new Set<string>()): Set<string> => {
  const fakeDoc = { documentElement: { classList: { add: (c: string) => classes.add(c) } } };
  new Function('location', 'document', 'addEventListener', 'window', 'setTimeout', script)(
    { search }, fakeDoc, () => {}, win, () => 0);
  return classes;
};

test('index.html 第一帧之前那几行，和 groundFor 逐条一致', () => {
  const script = headScripts().join('\n');
  assert.ok(script.includes('sb-first-screen'), 'index.html 的 <head> 里没有决定首帧底色的那段脚本');
  for (const search of ['', '?scene=tide', '?kiosk=1', '?demo=1&debug=1', '?theme=xeno', '?kiosk=1&theme=xeno', '?selftest=1', '?theme=']) {
    const classes = runHead(script, search, { onpagereveal: null });
    assert.equal(classes.has('sb-first-screen') ? 'paper' : 'dark', groundFor('/', search), `?${search}`);
  }
  const html = read('index.html');
  assert.match(html.slice(0, html.indexOf('</head>')), /html\.sb-first-screen[^{]*\{[^}]*background:\s*#fafafa/, '纸底要在样式表到达之前就在');
});

test('首页：跨页过渡落定之前不起 WebGPU，但开机永远不会被它卡住', async () => {
  const script = headScripts().join('\n');
  assert.ok(script.includes(`v.skipTransition()},${SETTLE_MS})`), `首页的看门狗不是 ${SETTLE_MS}ms`);
  assert.match(script, /window\.sbRevealSettled=p;setTimeout\(done,1500\)/, '没有兜底计时：没有 pagereveal 时开机会停住');
  // 没有 pagereveal 的浏览器（Firefox / 旧 Safari）：当场落定
  const win: Record<string, unknown> = {};
  runHead(script, '?theme=x', win);
  await (win.sbRevealSettled as Promise<void>);
  const main = strip(read('src/main.ts'));
  const at = main.indexOf('await revealSettled();');
  assert.ok(at > 0 && at < main.indexOf('const entry = mountEntry(flags);'), 'main.ts 没有在起环之前等过渡落定');
});

// ── 4. 静止态不等动画 ────────────────────────────────────────────────────────

test('认 reduce、有看门狗、关键帧只挂在过渡叠层上', () => {
  const css = strip(read('src/ui/type.css'));
  const reduce = [...css.matchAll(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/g)].map((m) => m[1]).join('\n');
  assert.match(reduce, /@view-transition\s*\{\s*navigation:\s*none/, 'reduce 下没有关掉跨页过渡');
  assert.match(reduce, /::view-transition-group\(\*\)[\s\S]*animation:\s*none/, 'reduce 下同文档的交棒仍然在动');
  for (const m of css.matchAll(/([^{}]+)\{[^{}]*\bsb-vt-[a-z-]+/g)) {
    const sel = m[1].trim();
    if (sel.startsWith('@keyframes')) continue;
    assert.ok(sel.split(',').every((x) => x.trim().startsWith('::view-transition')), `${sel} 把过渡的关键帧挂到了页面元素上`);
  }
  const html = read('index.html');
  assert.match(html.slice(0, html.indexOf('</head>')), /prefers-reduced-motion: reduce\)\{@view-transition\{navigation:none\}\}/);
  const dom = strip(read('src/ui/page-transition.ts'));
  assert.match(dom, /setTimeout\(\(\) => vt\.skipTransition\(\), SETTLE_MS\)/, '没有看门狗：过渡卡住时整页停在一张旧截图上');
  assert.match(dom, /prefers-reduced-motion: reduce/);
  assert.equal(SETTLE_MS, Math.ceil(MOTION.moveMs * 1.5), '看门狗 = 最长一档的 1.5 倍');
});

test('交棒：等舞台帧间隔稳住，但最多等 HANDOFF_WAIT_MS', () => {
  assert.equal(framesSteady([500, 300, 20]), false, '一帧快不算稳');
  assert.equal(framesSteady([400, 16, 17, 16]), true);
  assert.equal(framesSteady([16, 16, 60]), false, '最后一帧卡了不算稳');
  assert.equal(framesSteady([]), false);
  const dom = strip(read('src/ui/page-transition.ts'));
  assert.match(dom, /setTimeout\(resolve, capMs\)/);
  assert.match(dom, /capMs = HANDOFF_WAIT_MS/);
  assert.match(dom, /framesSteady\(dts\) \|\| dts\.length >= STEADY_GIVE_UP/, '稳不住时必须有尽头');
  const choose = strip(read('src/choose/choose.ts'));
  assert.match(choose, /stageShown\(\)\.then\(handOver\)/);
  assert.match(choose, /handOff\(/);
  assert.match(strip(read('src/main.ts')), /loop\.start\(\);\s*announceStageShown\(\);/);
});

test('展出页与工作台页的入口挡住第一帧，首页不挡', () => {
  const tag = '<script type="module" crossorigin src="/assets/about-x.js"></script>';
  assert.equal(blockRender(tag, '/w/packages/app/about.html'), '<script type="module" crossorigin blocking="render" src="/assets/about-x.js"></script>');
  assert.ok(blockRender(tag, '/w/packages/app/dev/index.html').includes('blocking="render"'), '工作台目录要挡');
  assert.equal(blockRender(tag, '/w/packages/app/index.html'), tag, '首页不挡：它的模块图带着 three.webgpu');
  assert.equal(isHomeHtml('C:\\w\\packages\\app\\index.html'), true);
  assert.match(read('vite.config.ts'), /renderBlockingEntries\(\)\]/);
});

test('预渲染只给文字页；舞台、工作台、侧室、存档一律不预渲染，舞台和存档连预取都不做', () => {
  assert.deepEqual([...PRERENDER_PATHS].sort(), ['/about', '/lineage', '/making', '/passport']);
  const json = JSON.stringify(speculationRules());
  const prerender = JSON.stringify((speculationRules() as { prerender: unknown }).prerender);
  for (const p of ['"/"', '/dev', '/parts', '/roster', '/marks', '/api']) assert.ok(!prerender.includes(p), `预渲染规则里出现了 ${p}`);
  assert.match(json, /"not":\{"or":\[[^\]]*\{"href_matches":"\/"\}[^\]]*\{"href_matches":"\/api\/\*"\}/);
  // 过渡与预取只由三个出口构件装上 —— 现场（?kiosk=1）一个都不挂
  for (const f of ['src/ui/nav.ts', 'src/ui/hero.ts', 'dev/devnav.ts']) assert.match(read(f), /installPageTransitions\(\)/, f);
  assert.doesNotMatch(read('src/main.ts'), /installPageTransitions|installPrefetch/);
});
