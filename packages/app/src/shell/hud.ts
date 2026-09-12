/**
 * 性能读数。docs/02 P5：超预算的数字标红 —— **红了就是 bug，不是"以后再优化"**。
 * 只在 ?debug=1 时挂上去。
 */
import { BUDGET } from '../../../core/src/tuning.ts';
import type { FrameStats } from './safe-frame.ts';

export interface HudCounts { instances: number; triangles: number; drawCalls: number; inferenceHz: number; }

export function createHud(): { update(s: FrameStats, c: Partial<HudCounts>): void; dispose(): void } {
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;left:10px;top:8px;z-index:9999;font:12px ui-monospace,monospace;' +
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
        row('fps', s.fps, 55, '', true),
        row('cpu', s.cpuMs, BUDGET.maxCpuMsPerFrame, ' ms'),
        row('instances', c.instances ?? 0, BUDGET.maxInstances),
        row('tris', (c.triangles ?? 0) / 1000, BUDGET.maxTriangles / 1000, ' k'),
        row('draws', c.drawCalls ?? 0, BUDGET.maxDrawCalls),
        row('infer', c.inferenceHz ?? 0, 30, ' Hz', true),
        s.errors ? `<span style="color:#e0455a">errors ${s.errors}  ${s.lastError ?? ''}</span>` : '',
      ].filter(Boolean).join('\n');
    },
    dispose() { el.remove(); },
  };
}
