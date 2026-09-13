/**
 * 首屏那身白底黑字，由谁开、由谁关。
 *
 * 它是**引用计数**的，不是一个开关：首屏这几秒里同时有三个角色可能需要它 ——
 * 展签（`shell/entry.ts`）、环（`ring/field.ts`）、选择页（`choose/choose.ts`），
 * 而它们的生命周期是错开的：
 *
 * ```
 *   展签  ├──────────┤（按下「开始」就走）
 *   环    ├────────────────────────────┤（选定后交棒给 S3 才拆）
 *   选择页        ├──────────────────────┤（图加载完才挂上来）
 * ```
 *
 * 谁先走谁就把底色改回去，后面两个当场变成白底上的浅灰字 —— 看不见。
 * 反过来，用一个全局布尔量，则没有 WebGPU 那条路（环根本没起来、
 * 选择页退化成 DOM 列表）就再也没人负责把它打开。
 *
 * 所以：每个角色各 hold 一次，各自释放；最后一个释放的人负责恢复。
 */
import './first-screen.css';

const CLASS = 'sb-first-screen';
let holders = 0;

/** 开住首屏配色。返回释放函数 —— **重复调用同一个释放函数只算一次**。 */
export function holdFirstScreen(): () => void {
  holders++;
  document.documentElement.classList.add(CLASS);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders--;
    if (holders <= 0) {
      holders = 0;
      document.documentElement.classList.remove(CLASS);
    }
  };
}
