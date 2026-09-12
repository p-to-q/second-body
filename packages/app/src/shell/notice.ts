/**
 * 会自己消失的一行字 —— `docs/23` 里唯一被允许出现在共舞画面上的那种元素。
 *
 * 规格里有两条这样的行，写了很久但一直没做（`docs/23 §S0` / `§S4`）：
 *
 *   §S0  WebGPU 不可用回落 WebGL2 → 网页版右下角一行「降级渲染」，4 秒后淡出。
 *        现场静默 —— 站在装置前面的人对这条信息无能为力，告诉他只是打扰。
 *   §S4  进场后左下角一行物种名，4 秒后淡出，此后不再出现。
 *        「观众需要知道自己选的是什么，但只需要知道一次。」
 *
 * 两条的形状完全一样：一行低对比度的字，停 4 秒，淡掉，从 DOM 里摘干净。
 * 所以它们共用这一个东西，而不是各写一份 —— 各写一份的结果一定是两种淡出时长。
 *
 * 时长和缓动来自 `ui/page.ts` 的浮层页头（同样是 4 秒 + 180ms 出场）：
 * 这件作品里「说一次就够了」只有一种说法。
 */
import { setBi, type BiText } from '../ui/i18n.ts';
import '../ui/type.css';
import './notice.css';

/** 停多久。和 `ui/page.ts` 的 FADE_AFTER_MS、docs/23 §S4 是同一个数 */
const HOLD_MS = 4000;
/** 出场 180ms（docs/23 §0：出比进快） */
const LEAVE_MS = 180;

export interface NoticeOptions {
  /** 贴哪个角。§S0 的降级提示在右下，§S4 的物种名在左下 */
  corner?: 'bottom-left' | 'bottom-right';
  holdMs?: number;
}

/** 说一句，然后消失。返回提前撤掉它的函数（下一个观众进场时用得上） */
export function showNotice(text: BiText, options: NoticeOptions = {}): () => void {
  const { corner = 'bottom-left', holdMs = HOLD_MS } = options;
  if (typeof document === 'undefined') return () => {};

  const el = document.createElement('p');
  el.className = `sb-notice sb-notice--${corner}`;
  setBi(el, text);
  document.body.append(el);

  let gone = false;
  const remove = (): void => {
    if (gone) return;
    gone = true;
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), LEAVE_MS);
  };
  const timer = setTimeout(remove, holdMs);
  return () => { clearTimeout(timer); remove(); };
}
