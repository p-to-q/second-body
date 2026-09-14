/**
 * 左下角那块读数 —— 一帧的采集结果 → 屏幕上那几行字。**纯函数。**
 *
 * ## 它为什么和 `readout.ts` 分开
 *
 * 和 `preview-state.ts` 分家的理由逐字相同：`readout.ts` 要
 * `import './readout.css'`，而 node 的测试加载不了 .css —— 两者放同一个文件，
 * 这几条判据就永远没有仪表（docs/02 P21）。而这里恰恰是最该有仪表的一块：
 * **一个格式化错误在屏幕上长得和一个真实读数一模一样**。
 *
 * ## 一条硬规矩：没有信号的地方写破折号，不写上一帧的数
 *
 * 运动特征（`MotionFeatures`）在 `main.ts` 里只在**有 pose 的那一帧**更新，
 * 没人的时候 `lastFeatures` 原样留着上一个观众的数。把它照常显示出来，
 * 屏幕上就会出现"空场里有人在动"—— 那是 P21 里最贵的那种仪表：
 * 它报的数是真的，只是**真在另一个时刻**。
 *
 * 所以判据只有一条：**这一帧有没有人**（`score > CAPTURE.minScore`，
 * 和 `main.ts` 的 `detected`、`preview-state.ts` 的 `empty` 是同一条线 ——
 * 三处不许各画一条）。没有人，除了推理频率之外全部写 `—`：
 * 推理是**机器自己**的节拍，空场里它照样在跑，那个数此刻仍然是真的。
 *
 * ## 为什么这里不用 `Presence`
 *
 * `Presence` 带 0.4 秒滞回，而滞回是**作品的决定**（什么时候开始溶解一个人），
 * 不是一次测量。这块读数只报测量，不报决定 —— 那条线画在哪儿、为什么，
 * 写在 `readout.css` 的文件头里。
 */
import type { Landmark, MotionFeatures, RawPose } from '../../../core/src/types.ts';
import { CAPTURE, REFINE } from '../../../core/src/tuning.ts';
import type { Flags } from '../shell/kiosk.ts';

/**
 * 这一场要不要挂这块读数。**判断只有这一处**，`main.ts` 不许自己再判一次
 *（和 `wantsPreview()` / `readFlags().nav` 同一条纪律）。
 *
 * - `?kiosk=1` 默认**不挂**。现场的默认是"零 UI"（docs/23 §S4），
 *   而这块读数过不了那一条的豁免线：左上角那块小屏幕之所以能在现场被要回来，
 *   是因为它回答的是「它有没有看见我」—— 没有那个答案，"零 UI"本身就不成立。
 *   这块读数回答的是「它读到了什么」，**站在装置前面的人对这个答案无能为力**。
 *   现场不是控制室。要它的场合（讲解、评审、开放日）写 `?readout=on`。
 * - 其余（网页版）默认**挂**：那里没有解说员，观众独自面对一具跟着自己动的身体，
 *   而这件作品的问题恰恰是"它在读你的什么"。这块读数是它自己把答案摊开。
 * - `?demo=1` 照常挂，**和那块小屏幕不一样**。小屏幕在回放下会撒谎：
 *   它画的是录像里另一个人的骨架，观众一挥手骨架不跟。这块读数不声称有摄像头，
 *   它报的是**此刻正在驱动这具身体的那份数据**——回放时那份数据就是录像，
 *   而屏幕上那具身体确实由它驱动。没有一行是假的，所以不需要那条例外。
 */
export function wantsReadout(flags: Flags): boolean {
  if (flags.readout) return flags.readout === 'on';
  return !flags.kiosk;
}

/** 六行的 id。顺序就是屏幕上从上到下的顺序 */
export type ReadoutKey = 'confidence' | 'joints' | 'inference' | 'energy' | 'extent';

export const READOUT_KEYS: readonly ReadoutKey[] = [
  'confidence', 'joints', 'inference', 'energy', 'extent',
];

export interface ReadoutInput {
  /** 这一帧的原始采集结果。**不是精化之后的** —— 理由同小屏幕：读数要站在滤波之前 */
  pose: RawPose | null;
  /** 这一帧的运动特征。没人的时候它是上一个人的，所以下面按 `present` 整体作废 */
  features: MotionFeatures | null;
  /** 采集端自报的推理频率（Hz）。`Capture.fps` */
  inferenceHz: number;
}

export interface Readout {
  /** 这一帧有没有人。屏幕顶上那一行，也是下面五行要不要作废的开关 */
  present: boolean;
  /** 五行的值，已经格式化成屏幕上的样子。`—` = 这一刻没有这个数 */
  values: Record<ReadoutKey, string>;
}

/** 没有这个数的时候写它。**不是 0，也不是上一帧** */
export const ABSENT = '—';

/**
 * 有多少个点是模型自己说"看得见"的。返回 `null` = **这个模型不报逐点置信度**。
 *
 * ## 为什么它会是 null，而 null 为什么不能写成 0 或者 33
 *
 * `capture/webcam.ts` 的 `overallScore()` 里写着：有些 MediaPipe 版本
 * `visibility` 恒为 0 或者干脆没有，那时候"检出了 33 个点"本身就是证据，score 记 1。
 * 照抄那条约定，这一行就会出现 **置信 1.00 / 关节 0-33** 的自相矛盾：
 * 同一份数据，一行说满分，一行说一个点都没看见。
 *
 * 所以这里和它用**同一个放弃条件**（一个有限的 visibility 都没有，或者全是 0），
 * 放弃时写 `—`。破折号说的是"这台机器不报这个数"，而 0/33 说的是
 * "它一个点都没看见" —— 后者是假话。
 *
 * ## 为什么不复用 `preview-state.ts` 的 `trusted()`
 *
 * 它们问的不是同一个问题，所以不是一处重复。小屏幕问"这个点在不在画面里"，
 * 缺 visibility 时**当作可信**（当不可信会让整条出画判据在那些模型版本上恒为绿）。
 * 这里问的是"模型报了几个点看得见"，缺 visibility 时根本没有答案。
 * 门限共用 `REFINE.occlusionVisibility` 一个来源，这一点不许分叉。
 */
export function visibleJoints(pose: RawPose | null): number | null {
  const src = pose?.screen?.length ? pose.screen : pose?.world;
  if (!src?.length) return null;
  let seen = 0;
  let sum = 0;
  let n = 0;
  for (const l of src as readonly Landmark[]) {
    const v = l?.visibility;
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    n++;
    sum += v;
    if (v >= REFINE.occlusionVisibility) seen++;
  }
  // 和 overallScore() 逐字相同的放弃条件
  if (!n || sum === 0) return null;
  return seen;
}

/** 有限就按 `digits` 位定点写，否则破折号。**不许把 NaN 写成 0** */
function fixed(v: number | undefined, digits: number): string {
  return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : ABSENT;
}

/**
 * 一个量级跨得很开的数 → 六格宽以内的字符串。
 *
 * **这个函数是实测逼出来的。** 上一版给动能写死三位小数，注释里还写着
 * "量级是 1e-2 ~ 1e-1" —— 那是看 `tuning.ts` 的阈值猜的。
 * 真跑起来（`?demo=1`，jumpingjacks 那段录制）读数是 **1.955**：
 * 动能是"每秒移动多少个身高"，一个正常挥手的人就在 1~3 之间，
 * 站着不动才是 1e-2。猜出来的精度在小的那一端刚好也说得通，
 * 所以它不会在屏幕上露馅 —— 这正是它值得被写下来的原因。
 *
 * 规则：整数部分越长，小数位越少，总宽永远 ≤ 6 格（`readout.css` 的那一栏）。
 * 这样静止的人还能读出 `0.018` 的差别，跳起来的人也不会把面板撑宽。
 */
function scaled(v: number | undefined): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return ABSENT;
  const a = Math.abs(v);
  return v.toFixed(a < 10 ? 3 : a < 100 ? 2 : a < 1000 ? 1 : 0);
}

/**
 * 一帧 → 屏幕上那几行。**没有时间、没有随机、没有 DOM**（P1）。
 */
export function readOut(input: ReadoutInput): Readout {
  const pose = input.pose;
  const score = Number.isFinite(pose?.score) ? pose!.score : 0;
  const present = pose !== null && score > CAPTURE.minScore;

  // 推理频率**不跟着 present 作废**：空场里模型照样在跑，那个数此刻仍然是真的。
  // 它同时是这块读数唯一一行"机器自己"的数 —— 全灰的时候它证明机器没死。
  const hz = Number.isFinite(input.inferenceHz) && input.inferenceHz >= 0
    ? `${Math.round(input.inferenceHz)} Hz`
    : ABSENT;

  if (!present) {
    return {
      present: false,
      values: {
        confidence: ABSENT, joints: ABSENT, inference: hz,
        energy: ABSENT, extent: ABSENT,
      },
    };
  }

  const seen = visibleJoints(pose);
  const total = (pose!.screen?.length ? pose!.screen : pose!.world)?.length ?? 0;
  const f = input.features;
  return {
    present: true,
    values: {
      confidence: fixed(score, 2),
      joints: seen === null ? ABSENT : `${seen}/${total}`,
      inference: hz,
      // 动能是"每秒移动多少个身高"（无量纲，见 core/motion.ts），实测跨两个量级：
      // 站着不动 ~0.02，挥手 ~2。定宽一栏里两端都要读得出，所以走 `scaled()`
      energy: scaled(f?.energy),
      // 舒展是四肢离骨盆的平均距离 / 身高。`types.ts` 的注释写着 `0.2..0.8`，
      // 而 jumpingjacks 那段录制实测到 **1.35** —— 那句注释说的是常见区间，
      // 不是值域。所以这一行也走 `scaled()`，不按那个区间写死位数。
      extent: scaled(f?.expansiveness),
    },
  };
}
