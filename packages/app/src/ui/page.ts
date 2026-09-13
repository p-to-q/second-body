/**
 * 页头 —— 每一页只有这一个共用 UI 元素。
 *
 * 它要回答的是一个很小的问题：**我在看什么？** 所以只有三样东西
 * （作品名 / 页面名 / 一行说明），没有导航条、没有 logo、没有按钮组。
 * docs/23 §0 那条总规矩在这里的落点是：能删的都删了，剩下这三行删不掉 ——
 * 没有它们，一个第一次打开 /dev/ 的人不知道自己站在哪。
 *
 * 两种形态：
 *   文档流（`overlay: false`）  档案页、目录页、自检页 —— 内容是文字，页头在最上面
 *   浮层（`overlay: true`）     满屏 canvas 的那几页 —— 内容是那一帧画面，
 *                              页头压进左上角安全区，4 秒后淡下去（docs/23 §S4）
 *
 * 为什么淡出而不是常驻：dev 页面也是拿来截图的，一条常驻的文字会出现在每一张
 * 证据图里。淡出之后鼠标移上去它自己回来 —— 要看的时候看得到，截图的时候不碍事。
 */
import './type.css';
import './chrome.css';

export interface PageHeadOptions {
  /** 页面名（中文） */
  title: string;
  /** 英文副名。文档流形态里跟在中文名后面；浮层形态里不显示 */
  titleEn?: string;
  /** 一行说明：这一页能回答什么问题。**一行**，docs/23 §0 的 14 字规矩是给现场的，
   *  dev 页面可以长一点，但仍然只许一句 */
  note: string;
  /** 浮在 canvas 上（满屏画布页）还是躺在文档流里（文字页） */
  overlay?: boolean;
  /** 右上角的状态字，例如「只读」。省略就没有 */
  state?: string;
  mount?: HTMLElement;
}

export interface PageHead {
  root: HTMLElement;
  /** 改右上角状态字。传 null 收起来 */
  setState(text: string | null): void;
}

const WORK = 'SEE-ME SEE-U';

/** 浮层页头淡下去的时间。和 docs/23 §S4「进场后 4 秒淡出」同一个数 */
const FADE_AFTER_MS = 4000;

export function mountPageHead(options: PageHeadOptions): PageHead {
  const { title, titleEn, note, overlay = false, state, mount = document.body } = options;

  const root = document.createElement('header');
  root.className = overlay ? 'sb-head sb-head--overlay' : 'sb-head';

  const row = document.createElement('div');
  row.className = 'sb-head__row';

  const left = document.createElement('div');
  const work = document.createElement('span');
  work.className = 'sb-label sb-head__work';
  work.textContent = WORK;

  const h1 = document.createElement('h1');
  h1.className = 'sb-head__title';
  h1.textContent = title;
  if (titleEn) {
    const en = document.createElement('span');
    en.className = 'sb-head__en';
    en.textContent = titleEn;
    h1.appendChild(en);
  }
  // 浮层形态里两者同在一行，中间要一个分隔符；文档流形态里它们本来就是两行
  if (overlay) {
    left.append(work, document.createTextNode(' · '), h1);
  } else {
    left.append(work, h1);
  }

  const stateEl = document.createElement('div');
  stateEl.className = 'sb-head__state';
  stateEl.textContent = state ?? '';
  stateEl.hidden = !state;

  row.append(left, stateEl);

  const noteEl = document.createElement('p');
  noteEl.className = 'sb-head__note';
  noteEl.textContent = note;

  const rule = document.createElement('hr');
  rule.className = 'sb-rule sb-head__rule';

  root.append(row, noteEl, rule);
  // 页头永远在最前面，别被后挂的 canvas 顶到下面去
  mount.prepend(root);

  if (overlay) {
    setTimeout(() => root.classList.add('sb-head--faded'), FADE_AFTER_MS);
  }

  return {
    root,
    setState(text: string | null) {
      stateEl.textContent = text ?? '';
      stateEl.hidden = text === null || text === '';
    },
  };
}
