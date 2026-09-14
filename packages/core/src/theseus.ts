/**
 * 忒修斯之船的**排期器**。规格见 `docs/44-THESEUS.md` §2 / §3 / §9，
 * 数值在 `tuning.ts` 的 `THESEUS` 块（这个文件里一个常数都不声明）。
 *
 * ── 它是什么 ────────────────────────────────────────────────────────────────
 * 进：弧线走了多少秒、人在不在、每根骨头这一刻动得多凶、一个种子。
 * 出：**这一帧要不要换一件，换哪一件**。仅此而已。
 *
 * 它**不**负责换成谁的件（§4 借件距离那条线在别处，这里只给出一个 0..4 的数给 HUD），
 * 不负责碎裂与装配动画（§7），不负责声音（§7）。
 * 换装本身走的是已有的 `creature.remorph()` —— docs/44 §1 写得很直白：
 * 那套机制一行都不浪费，这一版只是把它的**粒度**从"一次一批"改成"一次一件"。
 *
 * ── 为什么是纯的 ────────────────────────────────────────────────────────────
 * 不读时钟、不摇裸骰子、不碰 three、不碰 DOM：dt 和 seed 都从外面递进来，
 * 和 `arc.ts` 一个规矩。这样 180 秒 × 200 个种子可以在 `node --test` 里
 * 几毫秒跑完 —— 而 §10 第 1 条那个"一件原件都不剩"的断言，除了这样跑没有别的跑法。
 *
 * ── 归零 ────────────────────────────────────────────────────────────────────
 * §8：人一走，18 个槽位全部回到原件。判定"人走了"沿用 `Presence` 折出来的
 * 那个布尔（`arcPresent`）加 `ARC.resetAfter` 的宽限，**这里不发明第二套检测**。
 */
import { ARC, MORPH, THESEUS as T } from './tuning.ts';
import { movementBounds } from './arc.ts';
import { ALL_SLOT_KEYS, SLOT_OF_BONE } from './slots.ts';
import { mulberry32 } from './rng.ts';
import type { BoneId, Rng, SlotKey } from './types.ts';

export { T as THESEUS_TUNING };

/** 每根骨头这一刻的运动能量（无量纲，0 附近起步）。缺的骨头当 0 */
export type BoneEnergy = Partial<Record<BoneId, number>>;

export interface TheseusReplacement {
  /** 被换掉的那个槽位 */
  slot: SlotKey;
  /** 发生在弧线的第几秒 */
  at: number;
  /** 这一场的第几次替换（从 1 起） */
  index: number;
  /** 这个槽位第几次被换（1 = 原件被换掉，≥2 = 换掉的是别人的件） */
  nth: number;
}

export interface TheseusState {
  /** 这一帧刚发生的替换。一帧最多一件 —— §2 的 `minGap` 保证了这件事 */
  fired: TheseusReplacement | null;
  /** 已经**不是原件**的槽位数，0..18。HUD 上 `theseus 12/18` 的分子 */
  replaced: number;
  /** 槽位总数，18。HUD 上的分母 */
  slots: number;
  /** 这一场一共换了多少件（含重复换的那 8 件） */
  events: number;
  /** 这一刻有几件正在交接（上限 `maxConcurrent`） */
  inFlight: number;
  /** 距离下一件大约还有多少秒。没有下一件了 = Infinity。HUD 的 `下一件 ~3.4s` */
  nextIn: number;
  /** 这一刻的借件距离 0..4（§4）。HUD 的 `借距 d2`，取件那一侧另说 */
  borrowDistance: number;
  /** 还在开场那 `graceSeconds` 秒里（§2） */
  inGrace: boolean;
  /** 这一帧归零了：所有槽位回到原件（§8） */
  justReset: boolean;
}

export interface TheseusInput {
  /** 弧线走了多少秒 —— 直接喂 `ArcState.elapsed`，不在这里再数一遍时间 */
  elapsed: number;
  /** 这一刻有没有人 —— 直接喂 `arcPresent(presence)`，不发明第二套检测 */
  present: boolean;
  /** 每根骨头这一刻的运动能量。没有就当全零（站着不动的人照样走完这条线） */
  energy?: BoneEnergy | null;
}

export interface TheseusMachine {
  update(input: TheseusInput, dt: number): TheseusState;
  readonly state: TheseusState;
  /** 这个槽位还是不是原件 */
  isReplaced(slot: SlotKey): boolean;
  /** 这一场排好的替换时刻（秒）。HUD 与测试用，不要拿它当契约改 */
  readonly schedule: readonly number[];
  /** 换一个种子重开一场（`justReset` 那一帧上层会调它） */
  reset(seed?: number): void;
}

export interface TheseusOptions {
  /** 会话种子。同一个种子 → 同一场替换，逐件逐秒一致 */
  seed: number;
  /** 整条弧线多少秒（`?arc=` 之后就是那个数）。默认 `ARC.total` */
  total?: number | null;
  /**
   * `?theseus=<倍率>`：现场调快慢。2 = 快一倍。
   * **只缩放宽限之后的那一段** —— `graceSeconds` 不跟着缩，
   * 因为它是 §2 里最硬的那条线，不该被一个调试旋钮吃掉。
   */
  rate?: number | null;
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const fin = (x: unknown, fallback = 0): number => (Number.isFinite(x) ? (x as number) : fallback);

/** `THESEUS.quietSlots` 是**槽位类型**，这里翻成具体的 SlotKey（§2：锁骨 / 关节 / 脚） */
export function quietSlotKeys(
  types: readonly string[] = T.quietSlots,
  keys: readonly SlotKey[] = ALL_SLOT_KEYS,
): Set<SlotKey> {
  const want = new Set(types);
  const out = new Set<SlotKey>();
  for (const key of keys) {
    // 'joint'（统一的关节盖片）不是骨头，它自己就是一个槽位类型
    const slot = key === 'joint' ? 'joint' : SLOT_OF_BONE[key as BoneId];
    if (slot && want.has(slot)) out.add(key);
  }
  return out;
}

/**
 * 借件距离（§4）：`arc.overall` 走过 `borrowCurve` 的第 k 个门槛，距离就抬到 dk。
 * **单调不减**是它的全部意义 —— 晚期突然借回自己的件，"越来越不像你"当场自相矛盾。
 *
 * `cap` 是"这一刻最远能借到哪儿"：d4 要等慢回路那一件到货，没到货就退回 d3
 * （P3：不等、不卡、不报错）。
 */
export function borrowDistance(
  overall: number,
  cap = 3,
  curve: readonly number[] = T.borrowCurve,
): number {
  const p = clamp01(fin(overall));
  let d = 0;
  let gate = -Infinity;
  for (const th of curve) {
    // 曲线万一被写成不单调的，这里按"不许回头"读，而不是照着错的数走
    gate = Math.max(gate, fin(th, 1));
    if (p >= gate) d++; else break;
  }
  return Math.min(d, Math.max(0, Math.floor(cap)));
}

export interface WeightContext {
  /** 现在是弧线的第几秒 */
  now: number;
  /** 每个槽位上一次被换的时刻；没换过的是 0（§3："没换过的从 0:00 起算"） */
  lastAt: Readonly<Record<string, number>>;
  /** 还在第 I 乐章（安静槽位优先的那一段） */
  firstMovement: boolean;
  energy?: BoneEnergy | null;
  quiet?: ReadonlySet<SlotKey>;
}

/**
 * §3 的那一行公式，原样：
 *
 * ```
 * weight(slot) = staleness³ × quietBias(slot, act) × motionBias(slot)
 * ```
 *
 * 单独导出是为了能被测试直接钉住 `motionBias` 的**方向** ——
 * 它是这一页里唯一一处直接由观众动作决定的选择，而写反了它依然能跑、
 * 依然会换件，只是隐喻从"它拿走你给它的东西"变成"用得少的部位萎缩掉"（§3 否掉的那个）。
 * 一个写反了还能通过所有其它测试的东西，必须有一条测试专门对着它。
 */
export function slotWeights(ctx: WeightContext, keys: readonly SlotKey[] = ALL_SLOT_KEYS): number[] {
  const quiet = ctx.quiet ?? quietSlotKeys();
  const now = fin(ctx.now);
  const gain = fin(T.motionBiasGain);
  const qb = Math.max(1e-6, fin(T.quietBias, 1));
  return keys.map((key) => {
    const staleness = Math.max(0, now - fin(ctx.lastAt[key]));
    const quietBias = !ctx.firstMovement ? 1 : quiet.has(key) ? qb : 1 / qb;
    // 'joint' 不对应任何一根骨头 → 没有自己的运动量，motionBias 恒为 1
    const e = key === 'joint' ? 0 : Math.max(0, fin(ctx.energy?.[key as BoneId]));
    const motionBias = Math.max(0, 1 + gain * e);
    return Math.pow(staleness, Math.max(0, fin(T.stalenessPower, 3))) * quietBias * motionBias;
  });
}

/**
 * 排期：26 个时刻。每一段在自己的窗口里均匀撒 `perBeat[i]` 个点，排序，
 * 然后按 `minGap` 往后推。**时机是随机的，速率不是** —— 这正是 §2 那张表要的形状。
 *
 * 第 I 段的窗口从 `graceSeconds` 起，不是从 0 起。
 */
export function buildSchedule(
  rng: Rng,
  total: number = ARC.total,
  rate = 1,
): number[] {
  const bounds = movementBounds(total, ARC.beats);
  const grace = Math.max(0, fin(T.graceSeconds));
  const speed = Number.isFinite(rate) && rate > 0 ? rate : 1;
  const raw: number[] = [];
  for (let i = 0; i < bounds.length; i++) {
    const n = Math.max(0, Math.round(fin(T.perBeat[i])));
    const end = bounds[i];
    // 第 I 段从宽限之后开始；`?arc=` 把整条压得比宽限还短时，退到窗口末端的一点点，
    // 让 minGap 去把它们摊开，而不是让窗口变成负宽度
    const start = i === 0 ? Math.min(grace, end - 1e-6) : bounds[i - 1];
    const span = Math.max(0, end - start);
    const ts: number[] = [];
    for (let k = 0; k < n; k++) ts.push(start + rng.next() * span);
    ts.sort((a, b) => a - b);
    raw.push(...ts);
  }
  const gap = Math.max(0, fin(T.minGap));
  const out: number[] = [];
  let last = -Infinity;
  for (const t of raw) {
    // 宽限之后按 `rate` 缩放；宽限本身不缩（见 `TheseusOptions.rate`）
    const scaled = t <= grace ? t : grace + (t - grace) / speed;
    const v = Math.max(scaled, last + gap);
    if (v > total) break;            // 推出了这一场之外：那一件就是不发生，不是排到下一场
    out.push(v);
    last = v;
  }
  return out;
}

export function createTheseus(opt: TheseusOptions): TheseusMachine {
  const total = Number.isFinite(opt.total) && (opt.total as number) > 0
    ? (opt.total as number) : ARC.total;
  const rate = Number.isFinite(opt.rate) && (opt.rate as number) > 0 ? (opt.rate as number) : 1;
  const quiet = quietSlotKeys();
  const firstBound = movementBounds(total, ARC.beats)[0];

  let rng: Rng = mulberry32(0);
  let schedule: number[] = [];
  let cursor = 0;                       // 排期里下一个还没发生的时刻
  let lastAt: Record<string, number> = {};
  let nth: Record<string, number> = {};
  let inFlight: number[] = [];          // 各自的交接结束时刻
  let lastFiredAt = -Infinity;
  let events = 0;
  let fired: TheseusReplacement | null = null;
  let justReset = false;
  let away = 0;
  let started = false;
  let lastNow = 0;
  let currentEnergy: BoneEnergy | null = null;

  function hardReset(seed?: number): void {
    rng = mulberry32(seed === undefined ? 0 : seed >>> 0);
    schedule = buildSchedule(rng, total, rate);
    cursor = 0;
    lastAt = {};
    nth = {};
    for (const key of ALL_SLOT_KEYS) { lastAt[key] = 0; nth[key] = 0; }
    inFlight = [];
    lastFiredAt = -Infinity;
    events = 0;
    fired = null;
    away = 0;
    started = false;
    lastNow = 0;
  }
  hardReset(opt.seed);

  function replacedCount(): number {
    let n = 0;
    for (const key of ALL_SLOT_KEYS) if (nth[key] > 0) n++;
    return n;
  }

  function snapshot(now: number): TheseusState {
    const next = cursor < schedule.length ? schedule[cursor] : Infinity;
    return {
      fired,
      replaced: replacedCount(),
      slots: ALL_SLOT_KEYS.length,
      events,
      inFlight: inFlight.length,
      nextIn: next === Infinity ? Infinity : Math.max(0, next - now),
      borrowDistance: borrowDistance(now / Math.max(1e-6, total)),
      inGrace: now < Math.max(0, fin(T.graceSeconds)),
      justReset,
    };
  }

  /**
   * 抽一件（§3）。
   *
   * 最后那个 `if` 是**收尾保留**：当剩下的替换次数刚好等于还没被换过的槽位数时，
   * 只在没换过的里面抽。理由不是好看，是算术 ——
   * `stalenessPower = 3` 单独跑，200 个 seed 里有 6 个会漏掉一件
   * （实测，见 `test/theseus.test.ts`），而 §0 那句"一件原件都不剩"不是一个概率。
   * 它平均每场只生效 0.07 次，也就是绝大多数场次里它一次都不发生 ——
   * 所以"换的也是随机的"那一半原封不动。
   *
   * 另一条路是把 `stalenessPower` 调到 5：那样确实也能 200/200，
   * 但它是**全程**都更死板，等于拿整条线的随机性去买最后那一次的确定性。
   */
  function pick(now: number): SlotKey {
    const remaining = schedule.length - cursor;   // 含这一件
    const untouched = ALL_SLOT_KEYS.filter((k) => nth[k] === 0);
    const pool = untouched.length > 0 && remaining <= untouched.length ? untouched : ALL_SLOT_KEYS;
    const ctx: WeightContext = {
      now, lastAt, firstMovement: now < firstBound, energy: currentEnergy, quiet,
    };
    const w = slotWeights(ctx, pool);
    return rng.weighted(pool, w);
  }

  return {
    get schedule() { return schedule; },
    isReplaced(slot) { return (nth[slot] ?? 0) > 0; },
    update(input, dt) {
      const step = Number.isFinite(dt) && dt > 0 ? dt : 1 / 60;
      const now = Math.max(0, fin(input?.elapsed));
      lastNow = now;
      currentEnergy = input?.energy ?? null;
      fired = null;
      justReset = false;

      if (input?.present) {
        away = 0;
        started = started || now > 0;
      } else {
        away += step;
        // §8：人一走，全部回到原件。宽限沿用 `ARC.resetAfter`，不另起一个数
        if (T.resetOnLeave && away >= ARC.resetAfter && (started || events > 0)) {
          const seed = (rng.int(0xffffffff) >>> 0);
          hardReset(seed);
          justReset = true;
          lastNow = 0;
          return snapshot(0);
        }
        return snapshot(now);
      }

      // 交接完成的从在飞列表里退掉
      if (inFlight.length) inFlight = inFlight.filter((end) => end > now);

      // 一帧最多发一件。`minGap ≥ MORPH.crossfade` 时这两道闸其实只有一道会响，
      // 但两道都要在：`minGap` 是可调的，而"整个人炸开"那条老规矩不可调（docs/05 §3）
      while (cursor < schedule.length && schedule[cursor] <= now) {
        if (now - lastFiredAt < Math.max(0, fin(T.minGap))) break;      // 太密：等下一帧
        if (inFlight.length >= Math.max(1, Math.floor(fin(T.maxConcurrent, 3)))) break;
        const slot = pick(now);
        cursor++;
        events++;
        nth[slot] = (nth[slot] ?? 0) + 1;
        lastAt[slot] = now;
        lastFiredAt = now;
        inFlight.push(now + Math.max(1e-3, MORPH.crossfade));
        fired = { slot, at: now, index: events, nth: nth[slot] };
        break;
      }

      return snapshot(now);
    },
    get state() { return snapshot(lastNow); },
    reset(seed) { hardReset(seed ?? opt.seed); },
  };
}
