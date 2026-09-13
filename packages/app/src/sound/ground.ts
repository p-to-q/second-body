/**
 * `ground` 那一记的**触发判据**：这具身体的哪个末端刚刚落到地上。
 *
 * 和 `work.ts` 一样，这个文件里没有一个 Web Audio 节点 —— 它只回答
 * "这一帧算不算落了一下"。放声是 `cues.ts` 的事。分开的理由同样很实际：
 * **判据在 node 里测得了，放声测不了**，而判据正是这一记唯一会错得
 * 让人说不出哪里怪的地方。
 *
 * ## 为什么输入是落点，不是 `speed` / `energy`
 *
 * 这是这一记的全部设计（docs/29 §2.8 把它写死了）。
 * 从 `speed` 推出来的不是触地，是"**动得快就响**"：身体悬在半空挥手时它照响，
 * 而脚真的落下去的那一帧它可能什么都没有。观众不需要懂音频也能立刻听出
 * 声音和画面对不上 —— 那正是 P21 说的那种会撒谎的仪表。
 *
 * 所以输入是 `stage/framing.ts` 的 `contactPoints()`：**画接触阴影用的同一批点**。
 * 那个函数已经算清楚了"哪几个末端在地面附近、各自离地多高"，
 * 而且它是按身体方案算的（四足四个落点、`inverted` 的重心在地面以下都对）。
 * 一个判据和画面共用同一个事实，两者就不可能对不上。
 *
 * ## 三条规矩
 *
 * 1. **只在"多出一个落点"的那一帧响。** 落点数减少（抬脚）不响 ——
 *    失去不发声，和降档不做视觉事件同一条理由（docs/29 §2.3）。
 * 2. **第一次观测只立基准。** 站姿的两只脚一上来就是贴地的；没有这一条，
 *    身体进场那一帧会从 0 跳到 2，观众在卡片刚溶解的时候听到一记闷响，
 *    而他什么都没做。`reset()` 回到这个状态（换了一个人，重新立基准）。
 * 3. **≥ `SOUND.ground.minGapMs` 的防抖。** 追踪在阈值上下抖一帧，
 *    落点数就会一上一下；没有这一条，那一串会被听成搓衣板。
 */
import { SOUND } from '../../../core/src/tuning.ts';

/** `contactPoints()` 返回的那个三元组：世界 xz + 离地高度（米） */
export type ContactPoint = readonly [number, number, number];

export interface GroundSense {
  /**
   * 每帧调一次，吃**未经时间停滞缩放的 dt**（理由同 `sound.update`：
   * 升档那 0.15 秒画面顿一下是设计，防抖跟着顿会变成另一件事）。
   * @returns 这一帧要不要放一记 `ground`
   */
  update(contacts: readonly ContactPoint[], dt: number): boolean;
  /** 人走了 / 换了一具身体。下一次观测重新立基准，不补一记 */
  reset(): void;
}

export function createGroundSense(): GroundSense {
  /** 立过基准没有。见文件头第 2 条 */
  let armed = false;
  /** 上一帧有几个末端踩住了 */
  let prevDown = 0;
  /** 距离上一记多久（秒）。Infinity = 还没响过，第一记不该被防抖吃掉 */
  let since = Infinity;

  return {
    update(contacts, dt) {
      const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
      since += step;

      let down = 0;
      for (const c of contacts) {
        // `contactPoints` 的名额上限是 STAGE.contactLiftRange（0.22m），
        // 所以一只抬到 0.15m 的脚**仍然在这个数组里**，只是 lift 大。
        // 这一道夹是"抬着"和"踩住"的分界，不夹的话两者根本分不开
        if (c[2] <= SOUND.ground.threshold) down++;
      }

      if (!armed) {
        armed = true;
        prevDown = down;
        return false;
      }

      const landed = down > prevDown;
      prevDown = down;
      if (!landed) return false;
      if (since * 1000 < SOUND.ground.minGapMs) return false;
      since = 0;
      return true;
    },

    reset() {
      armed = false;
      prevDown = 0;
      since = Infinity;
    },
  };
}
