import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * `choose.ts` 把它那一页的 CSS 写在一个**模板字符串**里（`const CSS = \`…\``）。
 * 于是那段文本里出现一个反引号就会**当场结束字符串**，后面整段被当成 TypeScript 解析。
 *
 * ## 为什么值得为它写一条测试
 *
 * 这个坑一天之内咬了两个人（我自己一次，一条 lane 一次），两次的写法都一样：
 * 在注释里用反引号引一个文件名 —— 这个仓库的注释规矩本来就鼓励那么写，
 * 别处也确实该那么写，只有这一个文件不行。
 *
 * 而它的失败长成这样：
 *
 *     [PARSE_ERROR] Expected a semicolon ... choose.ts:583:8
 *     /* 字标（`ui/mark.ts`）
 *
 * 一个报"缺分号"的解析错误，指着一行注释 —— 没人会从那里想到"反引号"。
 * 这条测试把它换成一句能照着做的话。
 *
 * **真正的修法是把那段 CSS 搬进一个真的 `.css` 文件**（`ui/` 下每一个组件都是
 * 那么做的，只有这一个不是）。那次搬迁排在这条 lane 合并之后；
 * 在那之前，这条测试是这一类错误唯一的仪表。搬完之后**删掉这个文件**，
 * 别留着一条守着已经不存在的东西的测试。
 */

const SRC = fileURLToPath(new URL('../src/choose/choose.ts', import.meta.url));

test('choose.ts 的 CSS 模板串里不许出现反引号', () => {
  const src = readFileSync(SRC, 'utf8');
  const open = src.indexOf('const CSS = `');
  assert.ok(open >= 0, 'const CSS = ` 不见了 —— CSS 可能已经搬进 .css 文件了，那就删掉这个测试文件');

  const from = open + 'const CSS = `'.length;
  // 找真正的收尾：反引号后面跟着分号。中间任何一个孤立的反引号都是 bug。
  const end = src.indexOf('`;', from);
  assert.ok(end > from, '找不到 CSS 模板串的收尾');

  const css = src.slice(from, end);
  const bad = css.indexOf('`');
  if (bad >= 0) {
    const line = src.slice(0, from + bad).split('\n').length;
    const around = css.slice(Math.max(0, bad - 60), bad + 60).replace(/\n/g, ' ⏎ ');
    assert.fail(
      `choose.ts:${line} 的 CSS 里有一个反引号，它会当场结束模板字符串，`
      + `后面整段被当成 TypeScript 解析（Vite 会报一个看不懂的"缺分号"）。\n`
      + `把它去掉 —— 注释里引文件名直接写 ui/mark.ts，不要加反引号。\n`
      + `出事的地方：…${around}…`,
    );
  }
});
