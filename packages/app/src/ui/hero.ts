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
import { returnLabel, safeFrom } from './return-to.ts';
import { declareShared, installPageTransitions } from './page-transition.ts';

/**
 * @param backHref 「回到作品」指向哪儿。`/about` 回首页，其余三页回 `/about` ——
 *   这是四页之间**唯一**允许的差异，因为目录本身就住在 `/about` 上。
 * @param from 带进来的来处（URL 里的 `?from=`，原样传进来，这里再过一遍白名单）。
 *   合法时左边那一格换成「返回〈那一页〉」并指回去；不合法或没有，就是上面那条默认。
 *   只有侧室传它（`rooms/room.ts`）：侧室是唯一会被别的正文页链进来的文档页（docs/23 §S9.1）。
 *   **仍然是左边一格**，横带的结构不变，中间照旧什么都没有。
 */
export function heroMeta(backHref: string, from: string | null = null): HTMLDivElement {
  // 横带在的页就是文档页或侧室：换页过渡与悬停预取跟着它（docs/47）
  installPageTransitions();
  const meta = document.createElement('div');
  meta.className = 'ed-hero__meta';

  const origin = safeFrom(from);
  const label = returnLabel(origin);

  const back = document.createElement('a');
  back.className = 'ed-hero__back';
  back.setAttribute('href', origin && label ? origin : backHref);
  // 默认回程按目的地起名：回 `/` 叫「回到作品」，回 `/about` 叫「返回作品陈述」——
  // 原来三页都写「回到作品」却指向 /about，字说的和点下去发生的不是一件事（docs/47 §5）
  const fallback = backHref === '/' ? COPY.about.back : returnLabel(backHref) ?? COPY.about.back;
  setBi(back, origin && label ? label : fallback);

  // 字标在每一张有横带的页上是同一件东西：换页时它不动（docs/47）
  meta.append(back, declareShared(markNode('span'), 'mark'));
  return meta;
}
