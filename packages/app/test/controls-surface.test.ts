/**
 * 控件面板**全透明**（作品负责人 2026-09-14 裁定，`ui/controls.css` 文件头「没有底」一节）。
 *
 * 格子以前坐在不透明的 `--sb-paper` 上、格与格之间是"行底色从 1px 缝里露出来"的线 ——
 * 在它被写出来的那种画面上成立，在别的上面是一块补丁。现在面板、格子、筛选框一样底都没有：
 * 字、线、键帽、选中线全部跟右上角的墨走（`--sb-*-tr`，`stage/ink-sampler.ts` 按角底下的像素翻）。
 *
 * 这里守两件事：
 *  1. 没有一处底色，也没有写死的颜色、没有那条固定的深色 `--sb-rule`（暗场景上看不见）。
 *  2. 身后是纯黑、纯白、五套场景里任何一套时，**采样器会挑的那一套墨**：
 *     字和说明 ≥ 4.5:1，选中线 ≥ 3:1，分隔线看得出来，而且选中线和分隔线分得开。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { STAGE_INK, NEUTRAL_LOOK, overlayGroundLuma } from '../src/stage/look.ts';
import { SCENE_IDS, SCENES, applyScene } from '../src/stage/scenes.ts';
import { INK_CROSSOVER } from '../src/stage/ink-regions.ts';

const CSS = readFileSync(fileURLToPath(new URL('../src/ui/controls.css', import.meta.url)), 'utf8');
/** 去掉注释：注释里解释"原来是纸底"不算纸底 */
const CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

/** 选择器**恰好是** sel 的那些规则块（含逗号列表里出现它的） */
const blocks = (sel: string): string[] => {
  const out: string[] = [];
  for (const m of CODE.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (m[1].split(',').map((s) => s.trim()).includes(sel)) out.push(m[2]);
  }
  return out;
};
const channels = (hex: string): number[] => {
  const h = hex.length === 4 ? [hex[1] + hex[1], hex[2] + hex[2], hex[3] + hex[3]] : [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)];
  return h.map((s) => parseInt(s, 16) / 255);
};
const toLinear = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toGamma = (v: number): number => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
const luma = (c: number[]): number => 0.2126 * toLinear(c[0]) + 0.7152 * toLinear(c[1]) + 0.0722 * toLinear(c[2]);
const contrast = (a: number, b: number): number => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

test('面板、格子、筛选框一样底都没有；没有写死的颜色，也没有那条固定的深色线', () => {
  for (const decl of CODE.matchAll(/background(?:-color|-image)?\s*:\s*([^;]+);/g)) {
    assert.match(decl[1].trim(), /^(none|transparent)$/, `controls.css 里还有一处底：background: ${decl[1]}`);
  }
  for (const sel of ['.sb-ctl-panel', '.sb-ctl-row', '.sb-ctl-opt', '.sb-ctl-sp', '.sb-ctl-species', '.sb-ctl-filter']) {
    assert.ok(blocks(sel).length, `controls.css 里找不到 ${sel}`);
  }
  assert.doesNotMatch(CODE, /--sb-paper/, '格子还在取纸的颜色');
  assert.doesNotMatch(CODE, /var\(--sb-rule\)/, '还在用固定的深色 --sb-rule —— 暗场景上那条线看不见');
  assert.doesNotMatch(CODE, /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})(?![0-9a-fA-F])/, 'controls.css 里写死了一个颜色');
  assert.doesNotMatch(CODE, /box-shadow|border-radius/, '长出了阴影或圆角（docs/26 §F）');
  // 没有底之后暗墨管不住字：白展厅上右上角的暗墨（深墨那一套的 dim）只有 3.39:1。暗墨只许拿来兑线
  assert.doesNotMatch(CODE, /(^|[\s;{])color:\s*var\(--sb-ink-dim\)/, '有字在用暗墨 —— 白展厅上读不动');
});

test('格子是真的 1px 线，选中和悬停不靠底色', () => {
  const opt = blocks('.sb-ctl-opt').join('\n');
  assert.match(opt, /border:\s*1px solid var\(--sb-ctl-rule\)/, '格子没有自己的 1px 线');
  assert.match(blocks('.sb-ctl-opt.is-on').join('\n'), /border-bottom-color:\s*var\(--sb-ink-strong\)/, '选中不是一条最强墨的底线');
  assert.match(blocks('.sb-ctl-opt:hover').join('\n'), /border-bottom-color:\s*var\(--sb-ink/, '悬停没有任何不靠底色的反馈');
  assert.match(blocks('.sb-ctl-sp.is-on').join('\n'), /border-left-color:\s*var\(--sb-ink-strong\)/);
  assert.match(blocks('.sb-ctl').join('\n'), /--sb-ctl-rule:\s*color-mix\(in srgb, var\(--sb-on-stage-dim-tr\)\s*[\d.]+%,\s*transparent\)/,
    '分隔线不是右上角说明墨兑淡 —— 它就不会跟着角落翻');
});

/**
 * 全透明之后，状态只能靠**墨的强弱 + 线的形状 + 一个等宽小字**说出来 —— 不能只靠颜色（docs/23 §S4.1 的状态表）。
 * 每一种状态都必须有一条**不是颜色**的差别，而且两两不同；叠加 / 重开中 另有一个状态词（在 controls.ts 里）。
 */
test('每一种状态都有一条不靠颜色的记号，而且两两分得开', () => {
  const NON_COLOUR = /^(text-decoration(?:-line|-style|-thickness)?|text-underline-offset|border-(?:bottom|left)?-?(?:style|width)|cursor|z-index)$/;
  const signature = (sel: string): string => {
    const decls: string[] = [];
    for (const m of CODE.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const hit = m[1].split(',').map((s) => s.trim()).some((s) => s === sel || s.startsWith(`${sel} `));
      if (!hit) continue;
      for (const d of m[2].split(';')) {
        const [p, ...v] = d.split(':');
        if (p && NON_COLOUR.test(p.trim())) decls.push(`${p.trim()}:${v.join(':').trim()}`);
      }
    }
    return decls.sort().join(' | ');
  };
  const STATES: Record<string, string> = {
    悬停: '.sb-ctl-opt:hover',
    键盘焦点: '.sb-ctl-opt:focus-visible',
    选中: '.sb-ctl-opt.is-on',
    弧线此刻: '.sb-ctl-opt.is-now',
    刚按下: '.sb-ctl-opt.is-flash',
    重开中: '.sb-ctl-opt.is-pending',
  };
  const sigs = Object.fromEntries(Object.entries(STATES).map(([k, sel]) => [k, signature(sel)]));
  for (const [k, s] of Object.entries(sigs)) assert.ok(s, `「${k}」（${STATES[k]}）只有颜色上的差别，或者根本没有样式`);
  const distinct = Object.entries(sigs).filter(([k]) => k !== '键盘焦点');
  for (let i = 0; i < distinct.length; i++) {
    for (let j = i + 1; j < distinct.length; j++) {
      assert.notEqual(distinct[i][1], distinct[j][1], `「${distinct[i][0]}」和「${distinct[j][0]}」长得一样`);
    }
  }
  assert.equal(sigs.键盘焦点, sigs.悬停, '键盘焦点和悬停应当是同一个记号（没有鼠标也看得见）');

  const TS = readFileSync(fileURLToPath(new URL('../src/ui/controls.ts', import.meta.url)), 'utf8');
  for (const [cls, copy] of [['is-now', 'C.arcNow'], ['is-pending', 'C.restarting']]) {
    assert.match(TS, new RegExp(`'${cls}'`), `controls.ts 不打 ${cls}`);
    assert.match(TS, new RegExp(copy.replace('.', '\\.')), `${cls} 没有配状态词 ${copy}`);
  }
  // 叠加只靠记号（实线 + 顶上那一行），**不配文字**：作品负责人 2026-09-14「文字提示是累赘」
  assert.match(TS, /'is-over'/, 'controls.ts 不打 is-over');
  assert.doesNotMatch(TS, /overlayOn/, '叠加的格子里又配回了一句文字提示');
  assert.match(TS, /aria-current/, '弧线此刻只画了线，读屏读不到');
  assert.match(TS, /aria-busy/, '重开中只画了字，读屏读不到');
});

test('采样器挑的那套墨 × 纯黑纯白与五套场景：字 ≥ 4.5:1，选中线 ≥ 3:1，线看得出、和选中线分得开', () => {
  const pct = Number(blocks('.sb-ctl').join('\n').match(/--sb-ctl-rule:\s*color-mix\(in srgb, var\(--sb-on-stage-dim-tr\)\s*([\d.]+)%/)?.[1]) / 100;
  assert.ok(pct > 0 && pct <= 1);

  const behind: Array<[string, number]> = [['纯黑身后', 0], ['纯白身后', 1]];
  for (const id of SCENE_IDS) behind.push([id, overlayGroundLuma(applyScene(NEUTRAL_LOOK, SCENES[id]))]);

  const thin: string[] = [];
  for (const [name, bg] of behind) {
    // 静止画面上采样器的选择就是交点那一侧（滞回带只管来回翻，不改静止时的结论）
    const ink = bg < INK_CROSSOVER ? STAGE_INK.onDark : STAGE_INK.onLight;
    const g = toGamma(bg);
    const rule = luma(channels(ink.dim).map((c) => pct * c + (1 - pct) * g));
    const strong = luma(channels(ink.strong));
    const need = (label: string, c: number, min: number) => { if (c < min) thin.push(`${name} · ${label}: ${c.toFixed(2)}:1`); };
    // 面板上的字只用常墨和最强墨（下面单独断言没有一处字用暗墨）
    need('字', contrast(luma(channels(ink.on)), bg), 4.5);
    need('选中的字', contrast(strong, bg), 4.5);
    need('选中线', contrast(strong, bg), 3);
    need('分隔线', contrast(rule, bg), 1.5);
    need('选中线 vs 分隔线', contrast(strong, rule), 2);
  }
  assert.deepEqual(thin, [], `读不动 / 分不开：\n${thin.join('\n')}`);
});
