/**
 * 声音的输入契约。
 *
 * 为什么单独一个类型而不是直接吃 `World`：靶场（`/dev/sound.html`）和离线取证
 * 必须能**凭空捏造**每一个信号，否则"升档的声音"就只能靠真的升一次档才听得到，
 * 而那需要一个真人在摄像头前动 30 秒。能捏造 = 能单独触发每一层 = 能取证。
 *
 * 字段全是标量，故意不引用 `MotionFeatures` / `Presence` 整体 ——
 * 声音只需要这几个数，多引一个字段就是多一条以后会断的线。
 */
import type { PresenceState } from '../../../core/src/types.ts';
import type { LineParams } from '../../../core/src/line.ts';

export interface SoundSignal {
  /** 房间层唯一的输入 */
  presence: PresenceState;
  /** 进入/离开动画进度 0..1。只用来让声音跟着画面一起起落，不做别的 */
  transition: number;
  /** 身体层的主驱动，单位身高/秒 */
  speed: number;
  /** 高频"擦"层的驱动 */
  jerk: number;
  /** 慢 EMA。目前只喂给房间层的亮度，让久动的人所在的房间整体更开 */
  energy: number;
  /**
   * 身体此刻吃的那一组三个数（`core/src/line.ts`）。它改的是身体层的**音色**，不是加一层新声音。
   * 原来这里是 `actId`：音色按乐章的名字挑，于是在名字换掉的那一帧跳 —— 见 `timbre.ts` 文件头。
   * null = 不在这条线上（`untether`），走基线。
   */
  line: LineParams | null;
  /** 慢回路是否正在跑（phase === 'running'） */
  waiting: boolean;
}

export const SILENT_SIGNAL: SoundSignal = {
  presence: 'IDLE', transition: 0, speed: 0, jerk: 0, energy: 0,
  line: null, waiting: false,
};
