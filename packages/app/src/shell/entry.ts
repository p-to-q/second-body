/**
 * 网页版入口层 —— 一块展签，不是一个落地页。
 *
 * ## 它解决的那一个问题
 *
 * `docs/PRD §8` / `docs/23 §S0 网页分支`：**不要求授权也能看见东西。**
 * 一个陌生人打开这个 URL，第一眼不该是浏览器的权限弹窗 —— 直接弹权限会流失
 * 绝大多数人，而且弹窗挡住的恰好是这件作品唯一能说服人的东西：画面。
 *
 * 所以顺序被掰成了这样：
 *
 * ```
 *   打开 URL → 展签（作品名 + 一句话 + 两个动作）
 *            → 「开始」→ 回放驱动的身体先跑起来，**一次权限都不问**
 *            → 右下角一行「用我的摄像头」→ 这才是唯一请求权限的地方
 * ```
 *
 * ## 它刻意不做的事
 *
 * 不做滚动、不做特性列表、不做页脚链接堆、不做第三个按钮。
 * 「了解这件作品」把所有解释都甩给 `/about` —— 入口层只负责让人进去或让人读。
 *
 * 现场（`?kiosk=1`）和任何带明确意图的深链（`?demo=` / `?theme=` / `?act=` …）
 * 一律跳过这一层：装置前面没有人会点「开始」，而深链的意思就是"我知道我要什么"。
 *
 * ## 展签背后的那一团
 *
 * 这一层**不是一块纯色底**：选择页那个环的场（`choose/ring/field.ts`）在它出现之前
 * 就已经挂上去、种子已经出生、在背后缓慢地转。按下「开始」不是"这一层淡出、
 * 那一页淡入"，而是**同一个场进入下一个阶段** —— 卡片开始一张张从前一张里剥出来。
 * 这是"一比一"里最容易被做丢的一半：参考作品的入场之所以成立，
 * 前提正是在剥离之前所有卡片本来就已经在那里了。
 *
 * 场起不来（没有 WebGPU）时这一层原样退回纯色底 —— 展签本身不依赖它。
 */
import { COPY, setBi } from '../ui/i18n.ts';
import { acquireRingField } from '../choose/ring/field.ts';
import type { Flags } from './kiosk.ts';
import '../ui/type.css';
import './entry.css';

/** 出场动效 180ms（docs/23 §0），放完再从 DOM 里摘掉 */
const LEAVE_MS = 180;

function biNode<K extends keyof HTMLElementTagNameMap>(
  tag: K, t: { zh: string; en: string }, className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  setBi(node, t);
  return node;
}

function dismiss(node: HTMLElement): void {
  node.classList.add('is-leaving');
  setTimeout(() => node.remove(), LEAVE_MS);
}

export interface Entry {
  /** 观众按下「开始」之前，主流程停在这里等 */
  readonly started: Promise<void>;
}

/**
 * 深链 = "我知道我要什么"，别拿展签挡路。
 * `?debug` / `?nopost` 这种纯排查开关不算意图，所以不在这张表里。
 */
function wantsEntry(flags: Flags): boolean {
  return !flags.kiosk && !flags.demo && !flags.theme && !flags.act && !flags.plan;
}

/**
 * 挂上入口层。返回 `null` 表示这次不需要它（现场 / 深链），调用方直接往下走。
 *
 * 注意它**不阻塞 boot 的其余部分**：渲染器、资产、模型都在展签后面照常加载，
 * 所以按下「开始」时身体通常已经准备好了。await 的只有 `started`。
 */
export function mountEntry(flags: Flags): Entry | null {
  if (!wantsEntry(flags)) return null;

  const layer = document.createElement('div');
  layer.className = 'sb-entry';

  // 场先挂上：种子在展签背后出生。这一步是同步的，WebGPU 的初始化在背后跑；
  // 起不来就把 has-field 摘掉，退回纯色底（P3：每条降级路径都必须存在）。
  const field = acquireRingField();
  layer.classList.add('has-field');
  field.attract();
  void field.ready.then((ok) => {
    if (!ok) layer.classList.remove('has-field');
  });

  const enter = biNode('button', COPY.entry.enter, 'sb-act');
  enter.type = 'button';

  const learn = document.createElement('a');
  learn.className = 'sb-act';
  learn.href = '/about';
  setBi(learn, COPY.entry.learn);

  const actions = document.createElement('div');
  actions.className = 'sb-entry-actions';
  actions.append(enter, learn);

  // 隐私一行必须在页面上（docs/13 §5）；入口层给短句，完整那段在 /about
  const foot = document.createElement('div');
  foot.className = 'sb-entry-foot';
  foot.append(biNode('p', COPY.privacy.short, 'sb-label'));

  layer.append(
    biNode('p', COPY.entry.credit, 'sb-label'),
    biNode('h1', COPY.title),
    biNode('p', COPY.subtitle, 'sb-entry-lede'),
    actions,
    foot,
  );

  document.body.append(layer);
  enter.focus({ preventScroll: true });

  const started = new Promise<void>((resolve) => {
    enter.addEventListener('click', () => {
      // 剥离从这一下开始 —— 但真正开剥要等卡片到齐（见 field.ts 的"闸门"）。
      // 在那之前观众看到的还是那一团在转，而不是一圈空白卡。
      field.play();
      dismiss(layer);
      resolve();
    }, { once: true });
  });

  return { started };
}

/**
 * 运行中的「用我的摄像头」。整个体验里唯一请求摄像头权限的地方。
 *
 * `use()` 失败（用户拒绝、没有摄像头）时按钮**留在原地**：
 * 回放还在跑，画面没坏，观众可以再点一次 —— 这条正是 `docs/23 §S1` 的那一行。
 */
export function mountCameraButton(use: () => Promise<boolean>): void {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sb-act sb-camera';
  setBi(btn, COPY.boot.noCamera);
  btn.addEventListener('click', () => {
    btn.disabled = true;
    void use().then((ok) => {
      if (ok) dismiss(btn);
      else btn.disabled = false;
    });
  });
  document.body.append(btn);
}
