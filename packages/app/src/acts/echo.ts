/**
 * 回声：身体演的是你 ECHO_SECONDS 之前的动作。
 *
 * 观众的反应几乎总是同一条曲线：先以为坏了 → 停下来 → 看见身体还在动 →
 * 意识到那是刚才的自己。**这一刻比"它跟着我动"强得多**，因为它把
 * 「那个身体是不是我」这个问题真的问出来了。
 *
 * 这个文件同时是 docs/16 那块扩展空间的活证明：一个文件、几十行、
 * 不碰帧循环也不碰任何契约。不喜欢就从 acts/index.ts 里删掉那一行。
 */
import type { Skeleton } from '../../../core/src/types.ts';
import type { Act } from './act.ts';

const ECHO_SECONDS = 1.2;
/** 环形缓冲上限：按 60fps 估，留够 ECHO_SECONDS 的两倍，掉帧也不会穿底 */
const CAPACITY = Math.ceil(ECHO_SECONDS * 60 * 2);

interface Frame { t: number; sk: Skeleton; }

let buf: Frame[] = [];
let head = 0;

export const echo: Act = {
  id: 'echo',
  label: '回声（延迟 1.2s）',
  kind: 'body',
  weight: 1,
  minSeconds: 20,
  maxSeconds: 45,

  // 只在观众已经玩熟了之后出现：太早放会被当成 bug 而不是作品
  canEnter: (w) => w.evolution.tier >= 2 && w.presence.state === 'ALIVE' && w.presence.elapsed > 25,

  enter() { buf = []; head = 0; },

  update(w, dt) {
    if (!w.skeleton) return;
    buf[head] = { t: w.t, sk: w.skeleton };
    head = (head + 1) % CAPACITY;

    // 找最接近 t - ECHO_SECONDS 的那一帧。缓冲还没攒够就先跟随，
    // 免得刚上场时身体僵在那里（观众会以为是卡了）。
    const want = w.t - ECHO_SECONDS;
    let best: Frame | null = null;
    for (const f of buf) {
      if (!f) continue;
      if (!best || Math.abs(f.t - want) < Math.abs(best.t - want)) best = f;
    }
    const use = best && w.t - best.t >= ECHO_SECONDS * 0.5 ? best.sk : w.skeleton;
    w.creature.pose(use, w.presence, dt);
    w.note(best === null || use === w.skeleton ? '回声：攒缓冲中' : '回声：延迟 1.2s');
  },

  exit() { buf = []; head = 0; },
};
