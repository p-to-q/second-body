/**
 * 性能读数。docs/02 P5：超预算的数字标红 —— **红了就是 bug，不是"以后再优化"**。
 * 只在 ?debug=1 时挂上去。
 */
import { BUDGET } from '../../../core/src/tuning.ts';
import { MOVEMENT_LABELS, MOVEMENT_NUMERALS, type ArcState } from '../../../core/src/arc.ts';
import { label } from './degrade.ts';
import type { FrameStats } from './safe-frame.ts';

export interface HudCounts {
  instances: number; triangles: number; drawCalls: number; inferenceHz: number;
  /** 当前玩法（docs/16）与它想说的一句话 */
  act?: string; note?: string;
  /**
   * 现在实际开着哪一台摄像头（`capture/camera-select.ts` 的 `CamStatus.hud`）。
   * 之所以非要占 HUD 一行：`?cam=` 没有它就是个没人敢用的参数 —— 没人知道 `1` 是谁。
   */
  cam?: string;
  /**
   * 上面那一行是不是"跑在不是你要的那台上"。红的。
   * 这件作品最贵的一种失败是安静地对着一面墙演一整晚（P21），
   * 所以回落必须在仪表上和一切正常时长得**不一样**。
   */
  camFallback?: boolean;
  /**
   * 这一场走到哪儿了（`core/src/arc.ts`）。**现场调时长的人靠这一行，不靠掐表**
   *（docs/40 §5 第 2 条）。观众那一侧永远看不到它：没有进度条，
   * 也没有任何一段的名字（docs/40 §5 / docs/26 §F）。
   */
  arc?: ArcState;
  /** 弧线此刻被 `?act=` 或右下角那一行按住了 —— 那时候乐章照走，身体不听它的 */
  arcForced?: boolean;
}

/**
 * `arc` 那一行的文本。纯函数，所以它能被单测钉住而不用起一个 DOM
 *（`packages/app/test/hud-arc.test.ts`）。
 *
 * 读法：`III 抵抗  46%  →IV 27s`
 *  —— 第几乐章、它叫什么、这一段走了多少、还有多久到下一段。
 * 停住了写 `保持`，没人时写 `无人 Ns`（那个数走到 `ARC.resetAfter` 就归零）。
 */
export function formatArcRow(a: ArcState, forced = false): string {
  const head = `${MOVEMENT_NUMERALS[a.movement]} ${MOVEMENT_LABELS[a.movement]}`;
  const pct = `${Math.round(a.progress * 100)}%`.padStart(4);
  const next = a.held
    ? '保持'
    : `→${MOVEMENT_NUMERALS[Math.min(3, a.movement + 1)]} ${Math.ceil(a.timeToNext)}s`;
  const why = !a.running && !a.held ? `  无人 ${a.away.toFixed(1)}s` : '';
  return `${head}${pct}  ${next}${why}${forced ? '  [按住]' : ''}`;
}

/**
 * @param opts.top 距顶多少像素。默认 8 = 原来的位置。
 *
 * **为什么这个数需要从外面传**：左上角现在还住着一块小屏幕
 *（`ui/preview.ts`，「它有没有看见我」），而那一块是给**观众**的，
 * HUD 是给我们自己的 —— 同一个角上谁让谁没有悬念，观众那一块赢。
 * 但这块屏幕不是每一场都挂（`?demo=1` / `?kiosk=1` 下不挂），
 * 所以让 `main.ts` 按当场的实情给一个数，而不是在这里写死一个
 * "反正躲开就行"的大数字 —— 那会让没有小屏幕的那几场里 HUD 平白掉下去一截。
 */
export function createHud(opts: { top?: number } = {}): { update(s: FrameStats, c: Partial<HudCounts>): void; dispose(): void } {
  const el = document.createElement('div');
  el.style.cssText =
    `position:fixed;left:10px;top:${opts.top ?? 8}px;z-index:9999;font:12px ui-monospace,monospace;` +
    'color:#9aa;background:rgba(10,11,13,.72);padding:8px 10px;border-radius:6px;' +
    'white-space:pre;line-height:1.5;pointer-events:none';
  document.body.appendChild(el);

  const row = (label: string, v: number, budget: number, unit = '', invert = false) => {
    const over = invert ? v < budget : v > budget;
    const color = over ? '#e0455a' : '#9aa';
    return `<span style="color:${color}">${label.padEnd(11)}${v.toFixed(v < 10 ? 1 : 0).padStart(7)}${unit}</span>`;
  };

  return {
    update(s, c) {
      el.innerHTML = [
        row('fps', s.fps, BUDGET.minFps, '', true),
        row('cpu', s.cpuMs, BUDGET.maxCpuMsPerFrame, ' ms'),
        row('instances', c.instances ?? 0, BUDGET.maxInstances),
        row('tris', (c.triangles ?? 0) / 1000, BUDGET.maxTriangles / 1000, ' k'),
        row('draws', c.drawCalls ?? 0, BUDGET.maxDrawCalls),
        row('infer', c.inferenceHz ?? 0, 30, ' Hz', true),
        c.cam ? `<span style="color:${c.camFallback ? '#e0455a' : '#9aa'}">cam        ${c.camFallback ? '⚠ ' : ''}${c.cam}</span>` : '',
        c.act ? `<span style="color:#7fb3d5">act        ${c.act}${c.note ? '  ' + c.note : ''}</span>` : '',
        // 弧线那一行。**停表的时候颜色要变** —— 一条"照常在走"的弧线和一条
        // 停住的弧线长得一样，这一行就不是仪表了（P21）。
        c.arc ? `<span style="color:${c.arc.running ? '#7fb3d5' : '#e8a33d'}">arc        ${formatArcRow(c.arc, c.arcForced)}</span>` : '',
        s.throttled ? '<span style="color:#e8a33d">idle       无人降帧中</span>' : '',
        s.degraded ? `<span style="color:#e0455a">degraded   ${label(s.degraded)}</span>` : '',
        s.errors ? `<span style="color:#e0455a">errors ${s.errors}  ${s.lastError ?? ''}</span>` : '',
      ].filter(Boolean).join('\n');
    },
    dispose() { el.remove(); },
  };
}
