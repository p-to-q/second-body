/**
 * 「它有没有看见我」—— 把一帧采集结果判成四种状态中的一种。**纯函数。**
 *
 * ## 它解决的那一个问题
 *
 * 观众站到摄像头前面，没有任何办法知道自己是不是被看见了。追踪一垮
 * （逆光、离得太近、半个人出画、摄像头对着墙），身体就只是**站着不动** ——
 * 而"站着不动"和"这件作品坏了"在观众眼里是同一个画面。
 *
 * 判据必须是纯的，理由和 `core/refine.ts` 一样：这是唯一一处
 * "它到底有没有在看我"能被**证伪**的地方。它要是只活在 DOM 里，
 * 就只能靠站在摄像头前面反复试 —— 而现场没有那个时间。
 *
 * ## 为什么不自己再定义一套置信度
 *
 * `core/refine.ts` 已经有一套"追踪质量"的说法（`qualityScale()`：
 * score 高于 `REFINE.qualityStart` 就是 1，跌到 `qualityFloor` 压到
 * `slowdownFactor`）。精化器正是靠它决定要不要变迟钝。
 *
 * 这里**直接用同一个函数**，不另外写一个门限。两套置信度必然会漂：
 * 那天就会出现"缩略图说一切正常、身体却在发木"，而那是 P21 里最贵的那种仪表 ——
 * 它报的数是真的，只是**真在另一件事上**。
 *
 * ## 出画的判据为什么另算
 *
 * 半个人出画的时候 score 常常还很高（看得见的那半边点点都很清楚）。
 * 靠 score 一条永远抓不住它，而它恰恰是现场最常见的一种"没看见"。
 * 所以出画用 `screen`（图像归一化坐标）单独判，而且**排在质量前面** ——
 * 「往后退一点」是观众当场做得到的事，「光不够」不是。
 */
import type { Landmark, RawPose } from '../../../core/src/types.ts';
import { qualityScale } from '../../../core/src/refine.ts';
import { CAPTURE, REFINE } from '../../../core/src/tuning.ts';
import type { Flags } from '../shell/kiosk.ts';

/**
 * 这一场要不要挂那块屏幕。**判断只有这一处**，`main.ts` 不许自己再判一次
 *（和 `readFlags().nav` 同一条纪律：只有一个地方决定"现场看得见什么"）。
 *
 * 住在这个文件而不是 `preview.ts`，是因为它必须能在 node 里测 ——
 * `preview.ts` import 了 CSS，进不了单测。
 *
 * - `?demo=1` **永远不挂**，`?preview=on` 也不行。这一条被质疑过一次，
 *   问题问得很好，所以把答案写在这里：
 *
 *   回放这条路上**没有摄像头，但是有 landmark** —— 身体确实在动。
 *   那么这一块显示什么？三个选项，两个是假话：
 *     (a) 挂着、写"打开摄像头"：观众看着身体在动，却被告知没人看见 → 自相矛盾。
 *     (b) 挂着、画那副骨架、安安静静：**这是最坏的一个**。那副骨架是
 *         录像里另一个人的。观众一挥手，骨架不跟 —— 于是他得出的结论正是
 *         "它没在看我"，也就是这块屏幕存在的全部意义被反过来用了。
 *     (c) 根本不挂。
 *   选 (c)。**不存在不是撒谎**，屏幕上没有任何东西在声称任何事。
 *   何况现场切到 `?demo=1` 的那一刻，正是摄像头已经翻车的时刻 ——
 *   那时候还留着一块"看得见你"的指示灯，是 P21 里最贵的那种仪表：
 *   它报的数是真的，只是真在另一件事上。
 * - `?kiosk=1` 默认不挂：装置画面上不该多出一个网页组件（docs/23 §S4「默认零 UI」）。
 *   但现场恰恰是"观众不知道自己被没被看见"最要命的地方，所以留了
 *   `?preview=on` 这条明路 —— 要不要那块屏幕是策展决定，不是代码决定。
 * - 其余（网页版）默认挂：那里的观众连"该不该按右下角那个按钮"都不知道。
 */
export function wantsPreview(flags: Flags): boolean {
  if (flags.demo) return false;
  if (flags.preview) return flags.preview === 'on';
  return !flags.kiosk;
}

/**
 * 四种状态。**只有 `ok` 是不说话的那一种。**
 * docs/23 §S4「默认零 UI」：一切正常的时候屏幕上不该多出一个字。
 */
export type SeeState = 'off' | 'empty' | 'partial' | 'ok';

/**
 * 为什么是这个状态。`partial` 有两个成因，而它们要的是**两句不同的话** ——
 * 出画要往后退，质量差要换个亮一点的地方。状态只有四种，话可以有五句。
 */
export type SeeReason = 'ok' | 'camera' | 'nobody' | 'bounds' | 'quality';

export interface SeeReading {
  state: SeeState;
  reason: SeeReason;
}

export interface SeeInput {
  /**
   * 摄像头这条路在不在。false = 没开 / 权限被拒 / 现在跑的是回放。
   * 调用方自己决定怎么算（`main.ts` 用的是"当前 capture 有没有 video 且没有致命错误"），
   * 因为"摄像头开没开"是浏览器的事，不是这个函数该知道的事。
   */
  camera: boolean;
  /** 最近一次采集结果。null = 这一帧没人 */
  pose: RawPose | null;
}

/**
 * 出画留多少余量才算"还在画面里"。
 *
 * 0 会把贴边站着的人判成出画（MediaPipe 的 `screen` 坐标在边缘会轻微越界），
 * 太大又会漏掉真的半个人出画。**这是一个该进 `tuning.ts` 的数**，
 * 但那是冻结契约（P0），所以暂住在这里，并已在收尾报告里报上去。
 */
const EDGE_MARGIN = 0.02;

/**
 * 几个点越界就算"半个人出画"。
 *
 * 不用"任何一个点越界"：手一扬出画外是常态，它不该让整块缩略图开口说话。
 * 33 个点里有 3 个以上可信点在画外，才是"你得往后退一点"。
 */
const OUT_OF_FRAME_POINTS = 3;

/** 哪些点参与出画判定：只看**可信**的点，理由同 `refine.ts` 的遮挡门限 */
function trusted(l: Landmark | undefined): boolean {
  if (!l || !Number.isFinite(l.x) || !Number.isFinite(l.y)) return false;
  const v = l.visibility;
  // 没有 visibility 字段 = 模型不给这个数（`skeleton.ts` / `refine.ts` 同一条约定）：
  // 有坐标就当可信，而不是当不可信 —— 当不可信会让整条判据在那些模型版本上**恒为绿**。
  return typeof v === 'number' && Number.isFinite(v) ? v >= REFINE.occlusionVisibility : true;
}

function outOfFrame(screen: readonly Landmark[] | undefined): number {
  if (!screen?.length) return 0;
  let n = 0;
  for (const l of screen) {
    if (!trusted(l)) continue;
    if (l.x < -EDGE_MARGIN || l.x > 1 + EDGE_MARGIN
      || l.y < -EDGE_MARGIN || l.y > 1 + EDGE_MARGIN) n++;
  }
  return n;
}

/**
 * 一帧 → 一个状态。**没有时间、没有随机、没有 DOM**（P1）。
 *
 * 顺序是有讲究的，从"最没得商量"排到"最需要解释"：
 *   没有摄像头 → 没有人 → 出画 → 质量不够 → 好的。
 */
export function seeState(input: SeeInput): SeeReading {
  if (!input.camera) return { state: 'off', reason: 'camera' };

  const pose = input.pose;
  const score = Number.isFinite(pose?.score) ? pose!.score : 0;
  // 和 `main.ts` 判 `detected` 用的是**同一条线**（CAPTURE.minScore）。
  // 不一致的话，缩略图会在身体已经站起来之后还说"站到画面里"。
  if (!pose || score <= CAPTURE.minScore) return { state: 'empty', reason: 'nobody' };

  // `screen` 可能没有（回放数据里就常常没有）。没有就跳过这一条，
  // 而不是当成"没出画" —— 少一条判据是事实，编一个"都在画面里"不是。
  if (pose.screen?.length && outOfFrame(pose.screen) >= OUT_OF_FRAME_POINTS) {
    return { state: 'partial', reason: 'bounds' };
  }

  // 质量：直接问精化器自己的那把尺子。< 1 = 它已经开始变迟钝了。
  if (qualityScale(score) < 1) return { state: 'partial', reason: 'quality' };

  return { state: 'ok', reason: 'ok' };
}

/**
 * 话不能闪。
 *
 * 逐帧判出来的状态在门限附近一定会颤（score 就在 `qualityStart` 上下跳一下），
 * 而屏幕上一句忽隐忽现的话比没有话更糟 —— 观众读到的是"这东西在抽"。
 *
 * 所以显示层看到的不是 `seeState()` 的原始输出，是这里憋过的：
 * **新状态要连续成立 `ENTER_SECONDS` 才换过去**，回到 `ok` 也一样要憋
 * （憋得更久一点 —— 「好了」比「不好」更容易是一次误报）。
 */
const ENTER_SECONDS = 0.45;
const ENTER_OK_SECONDS = 0.8;

export interface SeeWatch {
  /** 喂一帧，拿回**当前对外的**读数（不是这一帧的原始判定） */
  update(input: SeeInput, dt: number): SeeReading;
  readonly current: SeeReading;
  reset(): void;
}

/** 开机第一帧就说"没摄像头"是对的：那时候确实还没有摄像头 */
const INITIAL: SeeReading = { state: 'off', reason: 'camera' };

export function createSeeWatch(): SeeWatch {
  let shown: SeeReading = INITIAL;
  let pending: SeeReading | null = null;
  let held = 0;

  return {
    update(input, dt) {
      const now = seeState(input);
      const step = Number.isFinite(dt) && dt > 0 ? dt : 0;

      if (now.state === shown.state) {
        // 状态没变，但成因可能变了（出画 → 光不够）。成因不必憋：
        // 两句话都属于同一块"不太好"，换一句不会读成闪烁。
        shown = now;
        pending = null;
        held = 0;
        return shown;
      }
      if (!pending || pending.state !== now.state) {
        pending = now;
        held = 0;
      }
      held += step;
      if (held >= (now.state === 'ok' ? ENTER_OK_SECONDS : ENTER_SECONDS)) {
        shown = now;
        pending = null;
        held = 0;
      }
      return shown;
    },
    get current() { return shown; },
    reset() { shown = INITIAL; pending = null; held = 0; },
  };
}
