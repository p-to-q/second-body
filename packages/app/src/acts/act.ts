/**
 * 玩法扩展点。规格见 docs/16-SPEC-acts.md。
 *
 * 核心约束：**帧循环固定，玩法挂在它旁边。**
 * 加一个新玩法 = 新建一个文件 + 在 acts/index.ts 的数组里加一行。
 */
import type {
  EvolutionState, Genome, MotionFeatures, Presence, Rng, Skeleton, Tier,
} from '../../../core/src/types.ts';
import type { Capture } from '../capture/capture.ts';
import type { PartLibrary } from '../assets/library.ts';
import type { BodyInstance } from '../creature/body.ts';
import type { Stage } from '../stage/stage.ts';
import type { Flags } from '../shell/kiosk.ts';

export interface World {
  readonly t: number;
  readonly presence: Presence;
  readonly skeleton: Skeleton | null;
  readonly features: MotionFeatures | null;
  readonly evolution: EvolutionState;
  readonly genome: Genome | null;
  /**
   * 当前的身体。**是 BodyInstance 不是 Creature** —— 玩法只该知道"这里有个身体、
   * 可以把骨架喂给它"，不该知道它是刚体挂载还是团块（docs/18）。
   * 哪天加了 swarm / ribbon，所有 Act 一行都不用改。
   */
  readonly creature: BodyInstance;
  readonly stage: Stage;
  readonly library: PartLibrary;
  readonly capture: Capture;
  readonly flags: Flags;
  readonly rng: Rng;
  morph(tier?: Tier): void;
  note(s: string): void;
}

export interface Act {
  id: string;
  label: string;
  /** 'body' = 决定身体怎么动，同时只有一个；'ambient' = 常驻叠加 */
  kind: 'body' | 'ambient';
  canEnter?(w: World): boolean;
  weight?: number;
  minSeconds?: number;
  maxSeconds?: number;
  enter?(w: World): void;
  update(w: World, dt: number): void;
  exit?(w: World): void;
}

/** 连续出错这么多次，这个 Act 就被永久禁用 —— 一个坏玩法不该带走整件作品 */
const STRIKES_BEFORE_DISABLE = 3;

export interface Director {
  update(w: World, dt: number): void;
  readonly currentId: string | null;
  /** 被禁用的 act id 和原因，给 HUD / 日志看 */
  readonly disabled: ReadonlyMap<string, string>;
  /** 强制切到某个 act（?act=<id> 与调试用） */
  force(id: string, w: World): boolean;
}

export function createDirector(acts: readonly Act[], fallbackId = 'follow'): Director {
  const body = acts.filter((a) => a.kind === 'body');
  const ambient = acts.filter((a) => a.kind === 'ambient');
  const fallback = body.find((a) => a.id === fallbackId) ?? body[0];

  const disabled = new Map<string, string>();
  const strikes = new Map<string, number>();
  let current: Act | null = null;
  let elapsed = 0;
  let forced = false;

  /** 把 Act 的任何异常挡在帧循环之外（docs/16 §5 规则 2） */
  function guard<T>(act: Act, what: string, fn: () => T): T | undefined {
    try {
      const r = fn();
      strikes.set(act.id, 0);
      return r;
    } catch (err) {
      const n = (strikes.get(act.id) ?? 0) + 1;
      strikes.set(act.id, n);
      console.error(`[act:${act.id}] ${what} 抛了异常（第 ${n} 次）`, err);
      if (n >= STRIKES_BEFORE_DISABLE) {
        const why = err instanceof Error ? err.message : String(err);
        disabled.set(act.id, why);
        console.error(`[act:${act.id}] 连续出错 ${n} 次，已禁用。回落到 ${fallback?.id}`);
        if (current === act) current = null;      // 下一帧会重新挑
      }
      return undefined;
    }
  }

  function enterable(w: World): Act[] {
    return body.filter((a) =>
      !disabled.has(a.id) &&
      a !== current &&
      (a.canEnter ? guard(a, 'canEnter', () => a.canEnter!(w)) === true : true));
  }

  function switchTo(act: Act | null, w: World): void {
    if (current && current !== act) guard(current, 'exit', () => current!.exit?.(w));
    current = act;
    elapsed = 0;
    if (act) {
      guard(act, 'enter', () => act.enter?.(w));
      if (w.flags.debug) console.info(`[act] → ${act.id}`);
    }
  }

  return {
    update(w, dt) {
      elapsed += dt;

      // 选角。只在 ALIVE 时换场 —— 进场/离场那几秒不该同时在换玩法
      if (!current || (!forced && w.presence.state === 'ALIVE')) {
        const min = current?.minSeconds ?? 0;
        const max = current?.maxSeconds ?? Infinity;
        const mustLeave = elapsed >= max;
        const mayLeave = elapsed >= min;
        if (!current || mustLeave || (mayLeave && !current)) {
          const pool = enterable(w);
          if (mustLeave && pool.length) {
            const weights = pool.map((a) => Math.max(0, a.weight ?? 1));
            switchTo(w.rng.weighted(pool, weights), w);
          } else if (!current) {
            switchTo(pool.length ? w.rng.weighted(pool, pool.map((a) => Math.max(0, a.weight ?? 1))) : fallback ?? null, w);
          }
        }
      }
      if (!current && fallback && !disabled.has(fallback.id)) switchTo(fallback, w);

      if (current) guard(current, 'update', () => current!.update(w, dt));
      for (const a of ambient) {
        if (disabled.has(a.id)) continue;
        if (a.canEnter && guard(a, 'canEnter', () => a.canEnter!(w)) !== true) continue;
        guard(a, 'update', () => a.update(w, dt));
      }
    },
    get currentId() { return current?.id ?? null; },
    get disabled() { return disabled; },
    force(id, w) {
      const act = acts.find((a) => a.id === id && a.kind === 'body');
      if (!act || disabled.has(id)) return false;
      forced = true;
      switchTo(act, w);
      return true;
    },
  };
}
