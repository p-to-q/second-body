import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * CSS 令牌的**存在性**。
 *
 * ## 这个文件为什么存在
 *
 * `type.css` 里曾经有一个**嵌套的 `:root {}`**。纯 CSS 不支持嵌套规则，
 * 解析器把整个内层块丢掉 —— 于是 `--sb-layer-*`、`--sb-halo`、
 * `--sb-ink-strong`、`--sb-stage-ground` 全都是未定义的，
 * 每一条取用它们的声明因此**整条失效**。
 *
 * 它藏了很久，因为失效的 CSS 声明不报错，只是"没效果" ——
 * 而没效果的东西正好长得像"设计得很克制"：
 * 面板的底色一直是全透明，看起来像是有人故意做成透明的；
 * 悬停不变色，看起来像是有人故意做成不变色的。
 *
 * docs/02 P21：**问一句"如果这东西坏了，我的仪表会显示什么"。**
 * 如果答案是"和现在一样"，那它就不是仪表。
 * 类型检查看不见 CSS，单测也不会渲染 CSS，所以这一层一直没有仪表。
 * 这个文件就是那个仪表：它不渲染，只检查那份契约在文本上成不成立。
 */

// `new URL(...).pathname` 会把路径里的非 ASCII 百分号编码 ——
// 这个仓库的绝对路径里有中文，于是 readdir 直接 ENOENT。
const UI = fileURLToPath(new URL('../src/', import.meta.url));

/** 递归收集所有 .css */
function cssFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) cssFiles(p, out);
    else if (e.name.endsWith('.css')) out.push(p);
  }
  return out;
}

const FILES = cssFiles(UI);
const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '');

test('CSS：`:root` 不许出现在任何块里面，且括号必须平衡', () => {
  // 断言写得很窄，是故意的。@media 套 @supports 是合法的，按"嵌套深度不超过 2"
  // 去拦会把合法的东西一起拦掉（editorial.css 就有一处）。
  // 真正咬过我们的缺陷只有一个形状：**一个 `:root` 开在另一个 `:root` 里面**。
  // 宁可只拦这一个形状并且拦准，也不要一条谁都会去改宽的规则。
  for (const f of FILES) {
    const src = stripComments(readFileSync(f, 'utf8'));
    let depth = 0;
    let line = 1;
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (ch === '\n') line++;
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        assert.ok(depth >= 0, `${f}:${line} 多了一个 }`);
      }
      if (src.startsWith(':root', i) && depth > 0) {
        assert.fail(`${f}:${line} 有一个嵌套的 :root —— 纯 CSS 不支持，整块会被静默丢掉`);
      }
    }
    assert.equal(depth, 0, `${f} 括号不平衡，末尾深度 ${depth}`);
  }
});

test('CSS：每一个 var(--sb-*) 都有地方定义它', () => {
  const declared = new Set<string>();
  for (const f of FILES) {
    for (const m of stripComments(readFileSync(f, 'utf8')).matchAll(/(--sb-[a-z0-9-]+)\s*:/g)) {
      declared.add(m[1]);
    }
  }
  // 这几个由 JS 在运行时写进行内样式（stage.ts 的 publishStageInk），
  // 文本里也有缺省值，所以它们本来就该在 declared 里 —— 列出来是为了
  // 万一将来有人把缺省值删了，这条断言会指着它说话。
  const runtime = ['--sb-on-stage', '--sb-on-stage-dim', '--sb-ink-strong'];
  for (const n of runtime) {
    assert.ok(declared.has(n), `${n} 只在运行时被写入，CSS 里没有缺省值 —— 舞台不在场的页面上它是未定义的`);
  }

  const missing: string[] = [];
  for (const f of FILES) {
    const src = stripComments(readFileSync(f, 'utf8'));
    for (const m of src.matchAll(/var\(\s*(--sb-[a-z0-9-]+)/g)) {
      // var(--x, fallback) 有兜底，不算
      const after = src.slice(m.index! + m[0].length, m.index! + m[0].length + 2);
      if (after.trim().startsWith(',')) continue;
      if (!declared.has(m[1])) missing.push(`${f} 用了 ${m[1]}`);
    }
  }
  assert.deepEqual(missing, [], `有 var() 指向从未定义的令牌：\n${missing.join('\n')}`);
});

test('CSS："跟着底色翻"的令牌，亮底那一侧必须也有人翻', () => {
  // 深底是缺省值（type.css）。亮底有两处：首屏那个类，和舞台按场景亮度发布的那一份。
  // 少了任何一侧，都会退回成"在一种底色上写死"——那正是犯过三次的那个 bug。
  const firstScreen = readFileSync(join(UI, 'choose/ring/first-screen.css'), 'utf8');
  const stage = readFileSync(join(UI, 'stage/stage.ts'), 'utf8');
  // 曾经有三个。`--sb-halo`（字周围的光晕）和 `--sb-stage-ground`（面板的底）
  // 都**删掉了** —— 浮层改成纯文字、面板改成无底，理由写在 nav.css 和 chrome.css：
  // 任何一个固定的底色都只在几种场景上成立，在别的上面它就是一块补丁。
  // 剩下这一个仍然要两侧都翻。
  for (const n of ['--sb-ink-strong']) {
    assert.ok(firstScreen.includes(n), `first-screen.css 没有翻 ${n}`);
    assert.ok(stage.includes(n), `stage.ts 的 publishStageInk 没有发布 ${n}`);
  }
});
