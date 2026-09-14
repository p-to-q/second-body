/**
 * 每一张会被打开的页，屏幕上至少有一条出去的路（docs/47 §导航审计）。
 *
 * 2026-09-14 作品负责人：「/dev/ 目录页的超链接好像有问题……这些页面写一个出口，
 * 因为好像去不了别的页面。」无头 Chrome 从 `/dev/` 逐条点过去，19 个目标全部打得开，
 * 坏的不是链接，是**到了之后**：侧室只剩「回到作品 → /about」，从工作台来的人被送去一个
 * 他没去过的地方；`/?selftest=1` 上三条链接没有一条回工作台或回作品。
 *
 * 这个文件问的是 P21 那句：出口没了，仪表会显示什么？此前的答案是"和现在一样"。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromSearch, returnLabel, safeFrom, withFrom } from '../src/ui/return-to.ts';

const APP = fileURLToPath(new URL('../', import.meta.url));
const read = (p: string): string => readFileSync(join(APP, p), 'utf8');
const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

function specs(file: string): string[] {
  const raw = readFileSync(file, 'utf8');
  const out: string[] = [];
  if (file.endsWith('.html')) {
    for (const m of raw.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)) out.push(m[1]);
    for (const m of raw.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) out.push(...tsSpecs(m[1]));
  } else if (file.endsWith('.ts')) out.push(...tsSpecs(raw));
  return out.filter((s) => s.startsWith('.') || s.startsWith('/'))
    .map((s) => (s.startsWith('/') ? join(APP, s) : join(dirname(file), s.split('?')[0])));
}
function tsSpecs(src: string): string[] {
  const s = strip(src);
  return [
    ...s.matchAll(/\b(?:import|export)\s[^'";]*?\bfrom\s*["']([^"']+)["']/g),
    ...s.matchAll(/\bimport\s*["']([^"']+)["']/g),
    ...s.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
  ].map((m) => m[1]);
}
function reachable(entry: string): Set<string> {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f) || !/\.(ts|html)$/.test(f) || !existsSync(f)) continue;
    seen.add(f);
    stack.push(...specs(f));
  }
  return new Set([...seen].map((f) => relative(APP, f)));
}

/** 出口构件：目录、页头横带（回到作品 / 返回来处）、工作台出口 */
const EXIT_MODULES = ['src/ui/nav.ts', 'src/ui/hero.ts', 'dev/devnav.ts'];

test('每一张 html（展出页 + 工作台页）都顺着 import 走到一个出口构件', () => {
  const pages = [
    ...readdirSync(APP).filter((n) => n.endsWith('.html')),
    ...readdirSync(join(APP, 'dev')).filter((n) => n.endsWith('.html')).map((n) => `dev/${n}`),
  ];
  assert.ok(pages.length >= 20, `只扫到 ${pages.length} 页`);
  const dead: string[] = [];
  for (const page of pages) {
    const files = reachable(join(APP, page));
    if (!EXIT_MODULES.some((m) => files.has(m))) dead.push(page);
  }
  assert.deepEqual(dead, [], `这些页上一条出去的路都没有：\n${dead.join('\n')}`);
});

test('开场自检（/?selftest=1）回得去工作台，也回得去作品', () => {
  // 它不走 main.ts，也就没有目录；它自己那一排链接就是全部出口
  const src = strip(read('src/shell/selftest.ts'));
  assert.match(src, /link\([^)]*,\s*'\/dev'\)/, 'selftest 没有回工作台的链接');
  assert.match(src, /link\([^)]*,\s*'\/'\)/, 'selftest 没有回作品的链接');
});

test('从工作台点进侧室的人，横带上写的是「返回工作台」，指回 /dev', () => {
  assert.equal(safeFrom('/dev'), '/dev');
  assert.equal(safeFrom('/dev/'), '/dev');
  // 工作台里的仪器页仍然不是来处 —— 它们有自己的出口（devnav），不该出现在别人的横带上
  assert.equal(safeFrom('/dev/figure.html'), null);
  assert.equal(withFrom('/roster', '/dev/'), '/roster?from=%2Fdev');
  assert.equal(fromSearch('?from=%2Fdev'), '/dev');
  assert.equal(returnLabel('/dev')?.zh, '返回工作台');
  // 目录页的行真的带上了来处（只给不在 dev/ 里、也不是舞台的目标）
  assert.match(strip(read('dev/index.ts')), /withFrom\(item\.href, location\.pathname\)/);
});

test('四个文档页的横带都读 ?from=（和侧室同一条规矩）', () => {
  for (const page of ['src/about/about.ts', 'src/making/making.ts', 'src/passport/passport.ts', 'src/lineage/lineage.ts']) {
    assert.match(strip(read(page)), /heroMeta\('[^']*', fromSearch\(location\.search\)\)/, `${page} 的横带不认来处`);
  }
});

// ── 2026-09-14 作品负责人「你自己做」之后落地的那几条（docs/47 §5）─────────────────

test('侧室挂目录：从正文一个数字点进来的人，也看得见这个站有哪几面', () => {
  const room = strip(read('src/rooms/room.ts'));
  assert.match(room, /mountNav\(\)/, 'rooms/room.ts 没有挂目录');
});

test('目录的当前页对读屏也是「当前页」', () => {
  assert.match(strip(read('src/ui/nav.ts')), /setAttribute\('aria-current', 'page'\)/);
});

test('横带回 /about 时写「返回作品陈述」，不写「回到作品」—— 作品在 /，不在 /about', () => {
  const hero = strip(read('src/ui/hero.ts'));
  assert.match(hero, /returnLabel\(backHref\)/, 'ui/hero.ts 的默认回程没有按目的地起名');
  assert.equal(returnLabel('/about')?.zh, '返回作品陈述');
});

test('回到大厅落在选择页，不是展签；仍然不问摄像头（回放起步）', async () => {
  const { hallSearch } = await import('../src/ui/exits-url.ts');
  const q = new URLSearchParams(hallSearch('?theme=xeno&scene=tide', {
    species: 'xeno', form: null, scene: 'tide', act: null, outline: false, vitality: true, refine: true, post: true, sound: true,
    framing: 'auto', people: '1',
  }));
  assert.equal(q.get('hall'), '1');
  assert.equal(q.get('theme'), null);
  const { readFlags } = await import('../src/shell/kiosk.ts');
  assert.equal(readFlags('?hall=1').hall, true);
  assert.equal(readFlags('').hall, false);
  const entry = strip(read('src/shell/entry.ts'));
  // 大厅：不立展签，但 entry 仍然返回（main.ts 据此用回放起步，不弹权限）
  assert.match(entry, /if \(flags\.hall\)/);
  assert.match(entry, /shown: false/);
  const main = strip(read('src/main.ts'));
  assert.match(main, /startOpen: entry\?\.shown === true/, '大厅没有展签那一栏，目录不该铺开');
  // 选定之后 hall 从地址栏里拿掉，分享出去的舞台地址不带它
  assert.match(strip(read('src/choose/choose.ts')), /searchParams\.delete\('hall'\)/);
});
