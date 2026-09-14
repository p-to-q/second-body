/**
 * 从舞台链出去、再回到**同一屏**舞台的那两条地址。纯的，不碰 DOM。
 *
 * 去程：`/dev/lineup.html?from=<舞台回程>`（通向装配台 / 团块的再带上 `?theme=`）。
 * 回程：`/?theme=…&plan=…&scene=…&act=…&vitality=…&refine=…&nopost=…&mute=…&seed=…`，
 * 键只取控件表推出来的 `STAGE_KEYS`，并且**先过一遍 `safeFrom` 再交出去** ——
 * 这样去程写出的东西和回程页认得的东西不可能是两套规矩。
 */
import { stagePatch, STAGE_KEYS, type ControlValues, type WorkbenchLink } from './control-table.ts';
import { FROM_PARAM, safeFrom } from './return-to.ts';

/** 这一屏的回程地址。没有物种（还在大厅）就没有回程 */
export function stageReturn(v: ControlValues, seed: number | null): string | null {
  if (!v.species) return null;
  const patch = stagePatch(v);
  const q: string[] = [];
  for (const k of STAGE_KEYS) {
    const val = k === 'seed' ? (seed === null ? null : String(seed >>> 0)) : patch[k];
    if (val !== null && val !== undefined) q.push(`${k}=${val}`);
  }
  return safeFrom(`/?${q.join('&')}`);
}

/** 控件条上那条出口的 href */
export function workbenchHref(link: WorkbenchLink, v: ControlValues, seed: number | null): string {
  const q = new URLSearchParams();
  if (link.theme && v.species) q.set('theme', v.species);
  const back = stageReturn(v, seed);
  if (back) q.set(FROM_PARAM, back);
  const s = q.toString();
  return s ? `${link.page}?${s}` : link.page;
}
