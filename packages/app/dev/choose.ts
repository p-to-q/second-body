/**
 * 开场选择页的独立调试页（T-18）。
 *
 *   /dev/choose.html                 从 /parts/parts.json 读条目
 *   /dev/choose.html?theme=xeno      直接跳过选择页（现场手动覆盖 / 刷新复现）
 *   /dev/choose.html?roster=1        改从 factory 的 ROSTER 读全部条目 ——
 *                                    parts.json 是上一次 factory:index 的快照，
 *                                    新加的物种和 kind 角标要这样才看得见
 *   /dev/choose.html?gl=off          强制走无 WebGL 的 DOM 降级列表
 *   /dev/choose.html?capture=1       让 canvas 可读回，用来截证据图
 *   /dev/choose.html?idle=5000       缩短自动选择的等待，用来验那条 30 秒规则
 *   /dev/choose.html?n=2             只留前 2 个条目 —— 验「< 3 个退化成横向一排」
 *   /dev/choose.html?seed=1          固定随机种子
 *
 * 运行时（src/main.ts）还没接这一页 —— T-01…T-09 落地后再接。
 */
import { chooseTheme } from '../src/choose/choose.ts';
import { mountPageHead } from '../src/ui/page.ts';
import type { ThemeDef } from '../../core/src/types.ts';

// 页头 4 秒后自己淡下去（见 ui/page.ts）—— 这一页也是拿来截图的，
// 而 S2 的规格里没有任何页头，截图上不该留着我们的调试文字。
mountPageHead({
  title: '选择页', titleEn: 'Choose', overlay: true,
  note: '观众选身体的那一刻。他选的应该是"变成什么"，不是"点哪一个"。',
});

const q = new URLSearchParams(location.search);
const num = (key: string): number | undefined => {
  const v = q.get(key);
  return v === null ? undefined : Number(v);
};

let themes: ThemeDef[] | undefined;
if (q.get('roster')) {
  const { ROSTER } = await import('../../factory/recipes/roster.ts');
  themes = ROSTER.map((e) => ({
    id: e.id, kind: e.kind, name: e.name, nameEn: e.nameEn, tagline: e.tagline,
    palette: e.palette, source: e.source, axes: e.axes, coverage: e.coverage, base: e.base,
  }));
}

/**
 * `?n=2` —— 只留前 n 个条目。
 *
 * 这是为了**跑得到** docs/23 §S2 那条「可选条目 < 3 个 → 螺旋退化成横向一排」。
 * 没有这个开关，那条降级路径只在"库里真的只剩两个条目"时才出现，
 * 也就是永远不会被验证（AGENTS.md：每条降级路径必须存在**且被跑过**）。
 * 它只截断这一页传进去的条目表，不碰 parts.json。
 */
const n = num('n');
if (n !== undefined && Number.isFinite(n) && n > 0) {
  const { ROSTER } = await import('../../factory/recipes/roster.ts');
  themes = (themes ?? ROSTER.map((e) => ({
    id: e.id, kind: e.kind, name: e.name, nameEn: e.nameEn, tagline: e.tagline,
    palette: e.palette, source: e.source, axes: e.axes, coverage: e.coverage, base: e.base,
  }))).slice(0, n);
}

const handle = await chooseTheme({
  themes,
  idleMs: num('idle'),
  seed: num('seed'),
  forceFallback: q.get('gl') === 'off',
  capture: q.get('capture') === '1',
  onChoose(id) {
    // 真的运行时会在这里造身体。调试页只把结果摆出来。
    const done = document.createElement('div');
    done.id = 'chosen';
    // 排版全部走 type.css：字号、颜色、字距都不在这里定义（docs/23 §0）
    done.style.cssText =
      'position:fixed;inset:0;display:grid;place-content:center;gap:0.6em;text-align:center;' +
      'background:var(--sb-paper);z-index:9';
    done.innerHTML =
      '<div class="sb-label">CHOSEN</div>' +
      `<h1 style="margin:0" data-theme>${id}</h1>` +
      `<div class="sb-data">?theme=${id} · 刷新即复现</div>`;
    document.body.appendChild(done);
    console.log('[choose] onChoose', id, '→', location.search);
  },
});

// 调试把手：handle.entries() 能看见每张卡的图是 anchor / field / absent。
Object.assign(window as unknown as Record<string, unknown>, { __choose: handle });
if (handle) {
  console.log(
    '[choose] mode=%s cards=%d',
    handle.mode,
    handle.entries().length,
    handle.entries().map((c) => `${c.theme.id}:${c.from}`),
  );
} else {
  console.log('[choose] URL 里已有 theme，跳过选择页');
}
