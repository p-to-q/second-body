/**
 * 观众的叠加 —— 控件条上的人手，唯一能落到弧线上的地方。
 *
 * ## 它解决的那一个问题（作品负责人 2026-09-14）
 *
 * 「点任何一个按钮，要么是在上面加一个向量，要么是开关一个变量，不许把东西锁死。」
 *
 * 此前有两处是锁：
 *  - 「玩法」按钮调 `director.force(id)`。导演从此不再听弧线，三分钟的弧线停在那一段，
 *    画面上没有任何一处说它停了，只有重载能解。
 *  - 「形体」按钮写 `planOverride`。它永远赢，第 III 乐章「物种身体到场」那一刻被跳过。
 *
 * ## 为什么是"叠加"，不是"钉住之后自己松开"
 *
 * 两条路都能满足"不锁"。选叠加，理由在弧线自己身上：
 *  - 那条线（`core/src/line.ts`）本来就是 `overall` 的连续函数，四个玩法是它上面的四个地名。
 *    "演回声"= 在第 II 个地名上采样 —— 这是**换一个采样点**，不需要让时间停下。
 *    弧线的 elapsed / 乐章 / 档位 / 忒修斯换件在底下照走，拿掉叠加的那一帧，采样点回到 `overall`。
 *  - "钉住 N 秒自己松开"要多一个时长旋钮，还要一个倒计时显示给观众看 ——
 *    而观众点的是"给我看回声"，不是"给我看 20 秒回声"。
 *  - 采样点**全量**换过去（不是按 0.3 权重掺一点）：线上两个地名之间的中间态没有名字，
 *    一个半回声半抵抗的身体读作"没反应"，不读作"叠了一点"。
 *
 * ## 结构上怎么保证"不锁"
 *
 * 叠加是一份不可变的小状态，按钮只能**增删条目**。导演和身体到场每帧**读**它，
 * 不接受任何命令。于是"拿掉 = 回到弧线"不是某个按钮记得去做的事，是没有叠加时的那条路本身
 * （`test/intent.test.ts` 在弧线上跑着钉住）。
 *
 * 纯的：不碰 DOM、不碰 three。
 */
import { ARC_ACTS, type MovementIndex } from '../../../core/src/arc.ts';
import { speciesDrift } from '../../../core/src/line.ts';

/** 能叠在弧线上的东西。只有弧线自己拥有的两样 —— 其余控件是普通变量 */
export const OVERLAY_IDS = ['act', 'form'] as const;
export type OverlayId = (typeof OVERLAY_IDS)[number];

/** 此刻开着的叠加。每一种至多一条（点另一个是换，不是叠两层） */
export type Intent = Readonly<Partial<Record<OverlayId, string>>>;

export const NO_INTENT: Intent = Object.freeze({});

/** 设 / 拿掉一条。`null` = 拿掉 */
export function setOverlay(intent: Intent, id: OverlayId, value: string | null): Intent {
  const next: Partial<Record<OverlayId, string>> = { ...intent };
  if (value === null) delete next[id];
  else next[id] = value;
  return Object.keys(next).length ? Object.freeze(next) : NO_INTENT;
}

/** 按钮语义：点亮着的那一项 = 拿掉，点别的 = 换成它。**每一项都是自己的解除键** */
export function toggleOverlay(intent: Intent, id: OverlayId, value: string | null): Intent {
  return setOverlay(intent, id, value === null || intent[id] === value ? null : value);
}

/** 线的采样点被叠到了第几个地名。`null` = 跟着 `overall` 走 */
export function lineOverlay(intent: Intent): MovementIndex | null {
  const i = (ARC_ACTS as readonly string[]).indexOf(intent.act ?? '');
  return i < 0 ? null : (i as MovementIndex);
}

/** 观众此刻看到的是哪一段（声音、HUD 用）：叠加优先，否则弧线自己那一段 */
export function effectiveAct(intent: Intent, arcActId: string | null): string | null {
  return intent.act ?? arcActId;
}

/**
 * 物种身体第 III 乐章到场（docs/40 §1：`NOT ME` / simulacrum 成立的那一刻）。
 * 是乐章序号，不是旋钮。
 */
export const SPECIES_ARRIVES_AT = 2;

export interface BodyAt {
  /** 形体叠加。`null` = 物种自己的方案 */
  override: string | null;
  /** 物种的方案到场了没有 */
  arrived: boolean;
  /** 人形 → 那个方案的漂移进度 0..1 */
  drift: number;
}

/**
 * 这一帧身体方案走到哪了。形体叠加立刻到场（look dev 要的是靶子，这一条没变）；
 * 拿掉之后就是弧线：第 III 乐章才到，按 `speciesDrift` 漂进来。
 */
export function bodyAt(intent: Intent, arc: { movement: number; overall: number }): BodyAt {
  const override = intent.form ?? null;
  if (override !== null) return { override, arrived: true, drift: 1 };
  const arrived = arc.movement >= SPECIES_ARRIVES_AT;
  return { override, arrived, drift: arrived ? speciesDrift(arc.overall) : 0 };
}

/**
 * 开机时 URL 里的 `?act=` / `?plan=` 就是叠加。
 * `untether`（把身体还回去）**不是**：它是右下角那一行的开关，走 `director.force`，
 * 本身就是一个再按一次就松开的变量，而且它不是线上的一个点。
 */
export function intentFromFlags(f: { act: string | null; plan: string | null }): Intent {
  let i = NO_INTENT;
  if (f.act && (ARC_ACTS as readonly string[]).includes(f.act)) i = setOverlay(i, 'act', f.act);
  if (f.plan) i = setOverlay(i, 'form', f.plan);
  return i;
}
