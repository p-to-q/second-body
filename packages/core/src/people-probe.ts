/**
 * 自动探测 —— 网页版默认 `?people=1` 起步，背景里定期抬一档 `numPoses` 看看是不是真的来了
 * 第二、第三个人。裁定与理由在 docs/50-MULTI-PERSON.md §6.3（修订）。纯函数：没有时钟、没有随机，
 * 时间全从 `dt` 来，state 在调用方手上一步步传（和 `people.ts` 的其余状态机同一个写法）。
 *
 * ## 为什么不能零成本地"偷看"
 *
 * `numPoses` 是 worker 的参数：要看第二个人，就必须真的按更高的档跑一遍检测器
 * （docs/50 §1.2）。所以这里做的是"定期开一个短窗口、抬一档、看看有没有人稳稳地被选中，
 * 没有就退回去" —— 不是持续多付检测器的钱。
 *
 * ## 为什么"稳稳地"不是另一套置信度
 *
 * `createPeopleTracker()` 已经有一整套滞回：新轨迹要连续被看见 `PEOPLE.birthSeconds` 才转正，
 * 转正之后才有资格被 `select()` 选中、拿到身体。这里只是在"拿到身体"之上再加一段
 * `PEOPLE.probeConfirmSeconds` 的**持续**入选（同样的漏桶 `leak()`），挡掉一次路人擦肩而过 ——
 * docs/50 §0 第 2 条的顾虑正是"一个人的桌面上多出一具身体，读作认错了人，不是认出了你们"。
 * 不另起一套判据，因为两套置信度必然会漂（docs/50 §2.2 反对为多人识别再发明一套判据，同一条理由）。
 */
import { leak } from './people.ts';
import { PEOPLE } from './tuning.ts';

export type ProbePhase = 'idle' | 'probing';

export interface ProbeState {
  /** 此刻当真在用的人数上限：喂给 `PeopleTracker.setCap()` 和 worker 的 `numPoses` 的稳态值 */
  readonly level: number;
  readonly phase: ProbePhase;
  /** `idle` 时：距上一次探测过了多久；`probing` 时：这一扇窗口已经开了多久（秒） */
  readonly clock: number;
  /** `probing` 时：多出来的那个人被连续选中攒了多少（秒，漏桶） */
  readonly held: number;
  /** 已经升过档：多出来的身体没人坐攒了多久（秒，漏桶）；攒够 `probeDeescalateSeconds` 退一档 */
  readonly idleHeld: number;
  /** 提示文字还要留多久（秒），0 = 不显示 */
  readonly hint: number;
  /** 提示该说"第几个人"：升档那一刻的新 `level`。`hint === 0` 时无意义 */
  readonly hintLevel: number;
}

/** 开机状态：`idle`，没有提示，人数上限是给定的起步值（网页版通常是 `PEOPLE.defaultCap`） */
export function createProbeState(level: number = PEOPLE.defaultCap): ProbeState {
  const v = Number.isFinite(level) ? Math.round(level) : PEOPLE.defaultCap;
  return { level: Math.max(1, Math.min(PEOPLE.hardMax, v)), phase: 'idle', clock: 0, held: 0, idleHeld: 0, hint: 0, hintLevel: 0 };
}

export interface ProbeInput {
  dt: number;
  /**
   * 这一帧有几个人拿到了身体（`PeopleFrame.selected.length`），在**当前**这一档 `numPoses` 之下量的。
   * `probing` 阶段这一档已经是 `level + 1`：如果它超过了窗口开始前的 `level`，
   * 说明多出来的那个名额被一个真的、稳稳地被跟踪的人占住了。
   */
  selectedCount: number;
}

export interface ProbeStep {
  state: ProbeState;
  /** 这一帧该让 worker（`capture.setPeople`）和跟踪器（`tracker.setCap`）用的人数上限 */
  target: number;
  /** 这一帧刚确认了一个新人，该出提示了（`state.hintLevel` 是提示该说第几个人） */
  justEscalated: boolean;
}

/**
 * 一步。`idle` 阶段：攒到 `probeIntervalSeconds` 就开一扇窗；已经升过档的话，
 * 同时检查多出来的身体是不是该退档了。`probing` 阶段：攒够 `probeConfirmSeconds`
 * 就当真升档，攒不够、窗口超过 `probeWindowSeconds` 就退回稳态。
 */
export function stepProbe(state: ProbeState, input: ProbeInput): ProbeStep {
  const dt = Number.isFinite(input.dt) && input.dt > 0 ? Math.min(input.dt, 0.25) : 0;
  const selectedCount = Number.isFinite(input.selectedCount) ? Math.max(0, input.selectedCount) : 0;
  let { level, phase, clock, held, idleHeld } = state;
  const hint = Math.max(0, state.hint - dt);
  let hintLevel = state.hint > 0 ? state.hintLevel : 0;
  let justEscalated = false;

  if (phase === 'idle') {
    // 已经升过档：多出来的身体连续没人坐够久，退一档（这份名额此刻没人在用，先收回探测的成本）
    if (level > PEOPLE.defaultCap) {
      idleHeld = leak(idleHeld, selectedCount <= level - 1, dt);
      if (idleHeld >= PEOPLE.probeDeescalateSeconds) {
        level -= 1; idleHeld = 0; clock = 0;   // 退档之后给一整个 interval 的缓冲，不立刻又去试探
      }
    } else {
      idleHeld = 0;
    }
    if (level < PEOPLE.hardMax) {
      clock += dt;
      if (clock >= PEOPLE.probeIntervalSeconds) {
        return { state: { level, phase: 'probing', clock: 0, held: 0, idleHeld, hint, hintLevel }, target: level + 1, justEscalated: false };
      }
    } else {
      clock = 0;   // 顶格了，不用再攒
    }
    return { state: { level, phase, clock, held, idleHeld, hint, hintLevel }, target: level, justEscalated: false };
  }

  // ── probing：这一帧起 worker 已经按 level + 1 在跑 ──
  const target = Math.min(PEOPLE.hardMax, level + 1);
  clock += dt;
  held = leak(held, selectedCount > level, dt);
  if (held >= PEOPLE.probeConfirmSeconds) {
    level = target;
    hintLevel = level;
    return {
      state: { level, phase: 'idle', clock: 0, held: 0, idleHeld: 0, hint: PEOPLE.probeHintSeconds, hintLevel },
      target: level, justEscalated: true,
    };
  }
  if (clock >= PEOPLE.probeWindowSeconds) {
    return { state: { level, phase: 'idle', clock: 0, held: 0, idleHeld, hint, hintLevel }, target: level, justEscalated: false };
  }
  return { state: { level, phase, clock, held, idleHeld, hint, hintLevel }, target, justEscalated: false };
}
