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


/** 递归收集 .ts（只看 src 下的，测试自己不算） */
function tsFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) tsFiles(p, out);
    else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

const FILES = cssFiles(UI);
/** 块注释（CSS 与 TS 通用）+ TS 的行注释。
 *
 * 行注释这一半是后补的：`stage/scenes.ts` 里有两行 `// …#fafafa…`，
 * 是在解释色调映射为什么不能直接喂那个值 —— **一句讨论颜色的话不是一处颜色**。
 * 守卫把它算成违规，等于逼着文档绕开自己要说的那个词。
 *
 * `[^:]` 那一段是为了不把 `https://` 的后半行吃掉：URL 里的 `//` 不是注释，
 * 而把它当注释会让守卫在那一行之后变瞎 —— 一个看不见的漏洞比一条假警报更贵。
 */
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

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

/**
 * **UI 颜色不许写成十六进制字面量 —— 除非那一处就是某个令牌的定义点。**
 *
 * 这条守的是今天犯了三次的那个 bug：`color: #fff` 在深色底上写的时候，
 * 它的字面意思和意图恰好重合；首屏和白展厅翻成亮底之后，它的字面意思变成
 * "和纸一样白"，手放上去那一行就没了。
 *
 * 规矩**不是"禁止十六进制"**：令牌本身总得在某处被定义成一个具体颜色，
 * 而一块没有信号的屏幕就是黑的 —— 那是物理事实，不是主题色。
 * 所以这里是一张**带理由的白名单**。一刀切的禁令只会被下一个人关掉；
 * 一张要求写下理由才能进的名单，会逼他先想一下他到底在干什么。
 *
 * 这条测试本身是补上来的：它曾经被写在一张任务卡上当作"已经存在的东西"，
 * 而它并不存在（一条 lane 去核了，发现树上还有七处）。把想做的事当成
 * 做过的事，是 P21 的另一种形状。
 */
const HEX_ALLOWED: Array<{ file: string; why: string }> = [
  { file: 'ui/type.css', why: '--sb-ink-strong 的深底定义点。令牌总要在某处是一个具体颜色' },
  { file: 'choose/ring/first-screen.css', why: '同上的亮底定义点（首屏用 !important 翻过来）' },
  { file: 'stage/look.ts', why: 'STAGE_INK：舞台两侧墨色三元组的定义点，由 publishStageInk 按场景亮度选一侧' },
  { file: 'ui/preview.css', why: '摄像头小屏的底。**一块没有信号的屏幕就是黑的** —— 物理事实，不是主题色' },
  { file: 'slow/slow.ts', why: '剪影遮罩的画布填充。它不是 UI，是喂给生成模型的一张图' },
  { file: 'shell/boot-error.ts', why: '**起不来时的那一屏。** 它存在的前提就是样式表没加载成功，所以它不能依赖任何令牌 —— 这一处是全仓最不该用 var() 的地方' },
  { file: 'shell/hud.ts', why: '`?debug=1` 的 HUD，行内样式，观众永远看不到。它是仪表不是画面，用固定色是为了在任何场景下都一眼可读' },
  { file: 'choose/ring/field.ts', why: 'readVar() 的兜底值。CSS 变量取不到时才用，而取不到正是"样式没加载"那一种情况' },
  { file: 'choose/cards.ts', why: '卡片是画在 canvas 上的，不是 DOM —— 它拿不到 CSS 变量，颜色只能是具体值' },
  { file: 'ui/chrome.css', why: 'dev HUD 的警告琥珀色。它是 `--sb-warn` 之外的第二档，只在 `?debug=1` 出现' },
  { file: 'shell/selftest.ts', why: '开场前自检页。和 boot-error 同一类：它要在"东西可能是坏的"的前提下也能读，所以不依赖样式表' },
];

test('CSS/TS：UI 颜色不写十六进制，除非它是令牌的定义点', () => {
  const offenders: string[] = [];
  for (const f of [...FILES, ...tsFiles(UI)]) {
    const rel = f.slice(f.indexOf('/src/') + 5);
    if (HEX_ALLOWED.some((a) => rel === a.file)) continue;
    const src = stripComments(readFileSync(f, 'utf8'));
    for (const m of src.matchAll(/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})(?![0-9a-fA-F])/g)) {
      const line = src.slice(0, m.index).split('\n').length;
      offenders.push(`${rel}:${line} ${m[0]}`);
    }
  }
  assert.deepEqual(
    offenders, [],
    '这些地方把颜色写死了。用 --sb-ink / --sb-ink-dim / --sb-ink-strong '
    + '（它们跟着底色翻），或者把这一处连同**理由**加进 HEX_ALLOWED：\n'
    + offenders.join('\n'),
  );
});
