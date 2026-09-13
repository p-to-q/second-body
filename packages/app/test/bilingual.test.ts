import test from 'node:test';
import assert from 'node:assert/strict';
import { bi, biHtml, cjkClass } from '../src/ui/i18n.ts';

/**
 * 中英并置的**排版契约**。
 *
 * ## 这个文件为什么存在
 *
 * 「英文比中文缩进了半格」这个 bug 在三个不同的地方各犯了一次，成因都一样：
 *
 *  1. 补偿那 0.06em 的规则挂在 `.sb-zh` 上，而 `.sb-zh` 的意思是
 *     **"承重的那一行"**，不是"中文那一行"。作品名那一对是倒置的
 *     （承重行里装的是 `SEE-ME SEE-U`），于是补偿补在了拉丁字母上。
 *  2. 并置有**两条构建路径** —— `biHtml()` 拼字符串、`setBi()` 逐个建节点 ——
 *     它们长期各写各的，补偿只在其中一条上生效。
 *  3. 选择页的名牌根本没用系统的类名，自己起了个 `sb-cn`，
 *     于是同一块名牌里两行中文自己都不对齐。
 *
 * 三处都不是"某个数调错了"，是**规则和它的载体对不上**。
 * 所以这里测的不是像素，是那条契约：谁是汉字谁补，两条路径给一样的结果。
 *
 * 像素对齐本身测不了（node 里没有字体光栅化），那一半靠浏览器里实测，
 * 记在 `docs/23-SPEC-ui.md`。这里守的是它上游的那个决定。
 */

test('并置：补偿跟着**字**走，不跟着槽位走', () => {
  assert.equal(cjkClass('看我看你'), ' sb-cjk');
  assert.equal(cjkClass('SEE-ME SEE-U'), '');
  // 混排按"有没有汉字"算：一行里只要有汉字，左缘就是汉字定的
  assert.equal(cjkClass('SEE-ME · 看我看你'), ' sb-cjk');
  // 全角标点也算 —— 「」和，。都自带左侧留白，和汉字同一个问题
  assert.equal(cjkClass('，'), ' sb-cjk');
  assert.equal(cjkClass('2026'), '');
  assert.equal(cjkClass(''), '');
});

test('并置：作品名那一对是倒置的，补偿必须跟着倒过来', () => {
  // 这一条是三个 bug 里最贵的那一个：54px 的巨题因此往左凸出 3.29px。
  // 它专门守着"倒置"这件事本身 —— 以后再出现第二对倒置也会被这条逻辑接住。
  const title = bi('SEE-ME SEE-U', '看我看你');
  const html = biHtml(title);
  assert.ok(
    html.includes('class="sb-zh"'),
    '承重行装的是拉丁字母，不该补偿',
  );
  assert.ok(
    html.includes('class="sb-en sb-cjk"'),
    '辅助行装的是汉字，该补偿',
  );
});

test('并置：普通的一对，承重行补、辅助行不补', () => {
  const html = biHtml(bi('作品陈述', 'About'));
  assert.ok(html.includes('class="sb-zh sb-cjk"'));
  assert.ok(html.includes('class="sb-en"'));
  assert.ok(!html.includes('class="sb-en sb-cjk"'));
});

test('并置：两边都是拉丁，两边都不补 —— 否则会补出一个不存在的错位', () => {
  // 展签元数据里的 `2026 / 2026` 就是这一种。改之前它被补出了 0.77px。
  const html = biHtml(bi('2026', '2026'));
  assert.ok(html.includes('class="sb-zh"'));
  assert.ok(html.includes('class="sb-en"'));
  assert.ok(!html.includes('sb-cjk'), `不该出现补偿：${html}`);
});

test('并置：HTML 那条路径仍然转义，补偿没有把转义挤掉', () => {
  const html = biHtml(bi('<b>粗</b>', '"a" & <b>'));
  assert.ok(!html.includes('<b>粗'), 'zh 没转义');
  assert.ok(html.includes('&lt;b&gt;'), 'zh 的尖括号该被转义');
  assert.ok(html.includes('&quot;a&quot; &amp; &lt;b&gt;'), 'en 该被转义');
  // 转义之后仍然认得出汉字
  assert.ok(html.includes('class="sb-zh sb-cjk"'));
});

test('并置：tag 可换，类名不受影响', () => {
  assert.ok(biHtml(bi('年份', 'Year'), 'dt').startsWith('<dt class="sb-bi">'));
  assert.ok(biHtml(bi('年份', 'Year'), 'dt').includes('class="sb-zh sb-cjk"'));
});

/**
 * **两条构建路径必须给出一样的 DOM。**
 *
 * `setBi()` 要 `document`，node 里没有，所以这里用一个够用的替身：
 * 只实现 `setBi` 真正用到的那几个方法。它不是一个 DOM 实现，
 * 它是一份**契约的复读**——如果 `setBi` 将来用了别的 API，这个替身会当场报错，
 * 那正是我们想要的提醒（比悄悄跳过这条测试好）。
 */
test('并置：字符串路径和建节点路径给出同样的类名', async () => {
  const made: Array<{ tag: string; className: string; textContent: string }> = [];
  const fakeDoc = {
    createElement(tag: string) {
      const el = { tag, className: '', textContent: '' };
      made.push(el);
      return el;
    },
  };
  const g = globalThis as unknown as { document?: unknown };
  const had = 'document' in g;
  const prev = g.document;
  g.document = fakeDoc;
  try {
    const { setBi } = await import('../src/ui/i18n.ts');
    for (const pair of [
      bi('SEE-ME SEE-U', '看我看你'),   // 倒置
      bi('作品陈述', 'About'),           // 普通
      bi('2026', '2026'),                // 两边拉丁
    ]) {
      made.length = 0;
      const host = { textContent: '', classList: { add() {} }, append() {} };
      setBi(host as unknown as Element, pair);
      const [zh, en] = made;
      const html = biHtml(pair);
      assert.ok(
        html.includes(`class="${zh.className}"`),
        `两条路径不一致：setBi 给 ${zh.className}，biHtml 给的是别的\n${html}`,
      );
      assert.ok(
        html.includes(`class="${en.className}"`),
        `两条路径不一致：setBi 给 ${en.className}，biHtml 给的是别的\n${html}`,
      );
    }
  } finally {
    if (had) g.document = prev;
    else delete g.document;
  }
});
