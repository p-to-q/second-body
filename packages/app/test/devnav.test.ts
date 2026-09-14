/**
 * 工作台顶上的出口只能有**一个**来源：`dev/devnav.ts`。
 *
 * 断言的形状照抄 `page-header.test.ts`：盯的是"谁建的"，不是"建成什么样"。
 * 一页自己手写一条「返回工作台」，今天看起来一样，下一次改版就各漂各的 ——
 * 四个文档页的横带就是这么跑偏了三次。
 *
 * 名单不写死：扫 `dev/*.html`。和 `vite.config.ts` 的 `pages()` 同一个理由 ——
 * 放一个 html 进来就是一页，新加的那一页没挂出口，这里就红。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  ESCAPE_OWNED_BY_PAGE, WORKBENCH_HREF, WORK_HREF, devNavActions, escapeTarget,
} from '../dev/devnav-state.ts';

const DEV = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dev');
const PAGES = readdirSync(DEV).filter((f) => f.endsWith('.html')).sort();
const MOUNT = /<script type="module" src="\.\/devnav\.ts"><\/script>/;

/** 一页自己的源：它的 html，加上同名的 .ts（如果有） */
function sourcesOf(page: string): { file: string; src: string }[] {
  const out = [{ file: page, src: readFileSync(resolve(DEV, page), 'utf8') }];
  const ts = page.replace(/\.html$/, '.ts');
  if (existsSync(resolve(DEV, ts))) out.push({ file: ts, src: readFileSync(resolve(DEV, ts), 'utf8') });
  return out;
}

test('每一个 dev/*.html 都挂了 dev/devnav.ts，而且只挂一次', () => {
  assert.ok(PAGES.length >= 15, `dev/ 下只扫到 ${PAGES.length} 页，扫描路径可能错了`);
  for (const page of PAGES) {
    const html = readFileSync(resolve(DEV, page), 'utf8');
    const n = (html.match(new RegExp(MOUNT.source, 'g')) ?? []).length;
    assert.equal(
      n, 1,
      `dev/${page} 挂了 ${n} 次 devnav.ts（应当恰好 1 次）。没有它，打开这一页的人` +
        '只剩浏览器后退键 —— 而一个粘贴进来的 URL 什么都退不回去',
    );
  }
});

test('没有一页自己建「返回工作台」或「回到作品」', () => {
  for (const page of PAGES) {
    for (const { file, src } of sourcesOf(page)) {
      assert.doesNotMatch(
        src,
        /sb-devnav|COPY\.devnav|返回工作台|回到作品|Back to the work/,
        `dev/${file} 在自己建工作台出口。建它的地方只能是 dev/devnav.ts`,
      );
      assert.doesNotMatch(
        src,
        /href\s*=\s*["'](?:\/dev\/?|\.\/|\.\/index\.html|index\.html)["']|location\.href\s*=\s*["']\/(?:dev\/?)?["']/,
        `dev/${file} 手写了一条回工作台 / 回首页的出路。出口只有一份（dev/devnav.ts）`,
      );
    }
  }
});

test('/dev/ 本身不给「返回工作台」—— 它就是工作台', () => {
  for (const p of ['/dev/', '/dev', '/dev/index.html', '/dev/index']) {
    assert.deepEqual(devNavActions(p), ['exit'], `${p} 上出现了「返回工作台」，点下去原地刷新`);
    assert.equal(escapeTarget(p), WORK_HREF, `${p} 上 Escape 应当回到作品`);
  }
  for (const page of PAGES.filter((f) => f !== 'index.html')) {
    const p = `/dev/${page}`;
    assert.deepEqual(devNavActions(p), ['workbench', 'exit'], `${p} 少了一条出路`);
    if (!ESCAPE_OWNED_BY_PAGE.includes(page)) assert.equal(escapeTarget(p), WORKBENCH_HREF);
  }
});

test('devnav.ts 用 setBi 写字，不手搭中英两行', () => {
  const src = readFileSync(resolve(DEV, 'devnav.ts'), 'utf8');
  assert.match(src, /setBi\(a, action === 'workbench' \? COPY\.devnav\.workbench : COPY\.devnav\.exit\)/);
  assert.doesNotMatch(src, /textContent\s*=|innerHTML\s*=/, 'devnav.ts 在手写文字，中英并置只走 setBi');
});

test('自己用 Escape 的页必须登记，出口才不会抢它的键', () => {
  for (const page of PAGES) {
    const ts = page.replace(/\.html$/, '.ts');
    if (!existsSync(resolve(DEV, ts))) continue;
    const usesEscape = /['"]Escape['"]|['"]Esc['"]/.test(readFileSync(resolve(DEV, ts), 'utf8'));
    assert.equal(
      usesEscape, ESCAPE_OWNED_BY_PAGE.includes(page),
      usesEscape
        ? `dev/${ts} 在用 Escape，却没登记进 devnav-state.ts 的 ESCAPE_OWNED_BY_PAGE —— 按一下会直接离开这一页`
        : `dev/${page} 登记了 Escape，但它的源里没有 Escape —— 名单过期了`,
    );
  }
});
