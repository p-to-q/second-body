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
 *   /dev/choose.html?seed=1          固定随机种子
 *
 * 运行时（src/main.ts）还没接这一页 —— T-01…T-09 落地后再接。
 */
import { chooseTheme } from '../src/choose/choose.ts';
import type { ThemeDef } from '../../core/src/types.ts';

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
    done.style.cssText =
      'position:fixed;inset:0;display:grid;place-content:center;gap:10px;text-align:center;' +
      'background:#000;color:#e8eaee;font:16px/1.6 system-ui,sans-serif;z-index:9;';
    done.innerHTML =
      `<div style="font-size:12px;letter-spacing:.3em;opacity:.45">CHOSEN</div>` +
      `<div style="font-size:40px;font-weight:600" data-theme>${id}</div>` +
      `<div style="opacity:.5;font:12px ui-monospace,monospace">?theme=${id} · 刷新即复现</div>`;
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
