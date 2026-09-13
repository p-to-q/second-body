/**
 * 第六层 · 工作声。**慢回路在跑的那 30–90 秒里，隔壁那间屋子里有人在动东西。**
 *
 * 这个文件里没有一个 Web Audio 节点：它只回答"下一记在什么时候、是哪一记、
 * 多响、多快"。放在哪、怎么放是 `cues.ts` 的事。分开的理由很实际 ——
 * **这一半在 node 里测得了，那一半测不了**（node 没有 Web Audio）。
 * 排程是这一层唯一会错得让人听不出来的地方（太密 = 吵，太规律 = 钟表），
 * 所以它必须是一个纯函数式的对象，而不是藏在音频回调里的几行。
 *
 * ## 它和第四层（等待）不冲突，两者说的不是同一句话
 *
 * 第四层是那两个失谐振荡器的拍频 —— 它说的是"**它正在想**"，
 * 一个不解决的、周期性趋近又错开的东西，连续、不间断。
 * 这一层说的是"**有人在干活**"：离散的、不连续的、一记一记的接触声。
 * 想和干是两件事，一段 30–90 秒的等待里两件事都在发生。
 * 观众不需要能说出这两层的区别，但少了这一层，那段等待听起来是**空的**。
 *
 * ## 三条设计约束（这三条就是这一层的全部设计）
 *
 * 1. **不许加速。** 间隔的均值是常数，只有抖动，没有趋势。
 *    一个越来越密的节奏**就是一条进度条**，而 `docs/26 §F` 的反面清单里
 *    写着不用进度条 —— 更要命的是它会撒谎：慢回路什么时候回来我们并不知道
 *    （30–90 秒，且可能永远不回来）。会骗人的仪表比没有仪表糟（P21）。
 *
 * 2. **不许规律。** 固定间隔读作钟表、读作机器在计时。
 *    所以间隔是 `gap ± gapJitter` 里均匀取的，随机全部来自**传入的 Rng**
 *    （AGENTS.md：`Math.random()` 在模块里是禁止的）。
 *
 * 3. **开头要空一段。** `leadIn` 之前一记都不放。等待必须先被听成"安静下来了"，
 *    才轮得到"有人在忙"。第一记压在慢回路启动的那一帧上，会被读成一记确认音，
 *    而观众并没有做任何动作。
 *
 * ## 结束时不收尾
 *
 * `waiting` 变 false 就立刻停，**不补一记"做完了"**。到货那一声已经存在
 * （`event.graftGain`，docs/23 §S6），再补一记就是同一件事响两次 ——
 * 和 `docs/29 §2.5` 那张"没有的，以及为什么没有"表里拒绝升档离散音同一条理由。
 */
import { SOUND } from '../../../core/src/tuning.ts';
import type { Rng } from '../../../core/src/types.ts';

/** 三个变体。id 同时就是文件名（`assets/sound/<id>.webm`）—— 和 CueId 同一条规矩 */
export type WorkCueId = 'work-a' | 'work-b' | 'work-c';

export const WORK_IDS: readonly WorkCueId[] = ['work-a', 'work-b', 'work-c'];

/**
 * 这一层的旋钮。**它就是 `SOUND.work` 本身，不是抄的一份** ——
 * 别名留在这里只是为了让这个文件读起来不必每行 `SOUND.work.`；
 * 现场调 `tuning.ts` 会直接改到这里（`test/sound.test.ts` 的「旋钮的移交」
 * 钉着这条同一性）。这三条设计约束见文件头，值的理由写在 `tuning.ts` 那一侧。
 */
export const WORK = SOUND.work;

/** 排出来的一记。`cues.ts` 拿它去建 source，不需要知道它是怎么排出来的 */
export interface WorkTick {
  id: WorkCueId;
  /** 相对 `WORK.gain` 已经乘好的最终增益 */
  gain: number;
  /** playbackRate */
  rate: number;
}

export interface WorkSchedule {
  /** 每个控制周期调一次。返回 null = 这一拍没有声音（绝大多数时候） */
  update(waiting: boolean, dt: number): WorkTick | null;
  /** 慢回路重置 / 人走了。下一次要重新等一遍 `leadIn` */
  reset(): void;
}

/** 均匀取 [-1, 1] */
function bi(rng: Rng): number {
  return rng.next() * 2 - 1;
}

export function createWorkSchedule(rng: Rng): WorkSchedule {
  let armed = false;
  let untilNext = 0;
  /** 上一记是哪一个 —— 连着两记同一个采样是这一层最容易被听出来的破绽 */
  let prev: WorkCueId | null = null;

  function pick(): WorkCueId {
    // 从"除了上一记"的那些里挑。三个变体，所以永远有两个可选
    const pool = WORK_IDS.filter((id) => id !== prev);
    return rng.pick(pool);
  }

  function nextGap(): number {
    return Math.max(0.3, WORK.gap + bi(rng) * WORK.gapJitter);
  }

  return {
    update(waiting, dt) {
      if (!waiting) {
        // 立刻停，不补"做完了"那一记（见文件头）
        armed = false;
        return null;
      }
      const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
      if (!armed) {
        armed = true;
        untilNext = WORK.leadIn;
        prev = null;
        return null;
      }
      untilNext -= step;
      if (untilNext > 0) return null;
      // 补一个新间隔而不是清零：小的抖动不会累积成漂移。
      // 但补完还欠着（切了标签页、掉了一大帧）就**重新起一个间隔** ——
      // 攒下的那几十秒不补发，否则回到页面的那一刻是一串连发（而不是"有人在忙"）。
      untilNext += nextGap();
      if (untilNext <= 0) untilNext = nextGap();
      const id = pick();
      prev = id;
      return {
        id,
        gain: WORK.gain * (1 + bi(rng) * WORK.gainJitter),
        rate: 1 + bi(rng) * WORK.detune,
      };
    },
    reset() {
      armed = false;
      untilNext = 0;
      prev = null;
    },
  };
}
