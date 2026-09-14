/**
 * 四个文档页顶上那条横带，**一份**。
 *
 * ## 为什么它必须是一个组件，而不是四段长得差不多的代码
 *
 * 这条横带在这个仓库里跑偏过三次，三次的偏法都不一样：
 *   1. `/making` 和 `/lineage` 在中间多挂了一份作品名；
 *   2. `/passport` 在中间多挂了一个卷号 `VII`；
 *   3. `/about` 的「回到作品」比另外三页多一个惰性的 `sb-label` 类。
 *
 * 每一次都被当成一个排版 bug 修掉了，于是第四次又来。查到根上才发现：
 * **四个页面各自定义了一个私有的 `el()`，而且签名互不兼容** ——
 * `making.ts` 的第三个参数是**父节点**，`about.ts` 的第三个参数是**子节点**。
 * 也就是说这四份代码长得像、读起来像、却根本不是同一种东西，
 * 谁照着谁抄都会抄错一点。**四个页面之间没有任何共享结构，所以没有什么可以不漂。**
 *
 * 这个文件就是那个共享结构。它只做一件事，而且只做一次。
 *
 * ## 这条横带的规矩（docs/23 §S9）
 *
 * 左边「回到作品」，右边两行字标，**中间什么都没有**。
 * 中间那一格是空的不是因为还没想好放什么，是因为它**应该**是空的：
 * 两端对齐的横带靠两端立住，往中间塞任何东西都会把它变成一个三栏工具条。
 * 卷号、作品名、副标题都不进这里。
 *
 * 字标**最后** append：这条带子靠 `justify-content: space-between` 分两端，
 * 顺序就是左右。而 `append` 移动已有节点、不复制 —— 先前有一页多写了一次
 * `meta.append(back, …)`，于是字标跑到了左边。
 */
import { COPY, setBi } from './i18n.ts';
import { markNode } from './mark.ts';

/**
 * @param backHref 「回到作品」指向哪儿。`/about` 回首页，其余三页回 `/about` ——
 *   这是四页之间**唯一**允许的差异，因为目录本身就住在 `/about` 上。
 */
export function heroMeta(backHref: string): HTMLDivElement {
  const meta = document.createElement('div');
  meta.className = 'ed-hero__meta';

  const back = document.createElement('a');
  back.className = 'ed-hero__back';
  back.setAttribute('href', backHref);
  setBi(back, COPY.about.back);

  meta.append(back, markNode('span'));
  return meta;
}
