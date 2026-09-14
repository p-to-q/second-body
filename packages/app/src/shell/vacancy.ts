/**
 * 被点名的那个位置，是不是一个**故意空着的位置**；如果是，它在哪一页上展出。
 *
 * ## 为什么这不是「写错的值等于没写」
 *
 * URL 参数的家规是：写错的值等于没写（`shell/kiosk.ts` 的 `?plan=` / `?cam=` /
 * `?theme=` 都照这条办）。那条规矩管的是**指不着东西的名字** —— 拼错的 id
 * 背后什么都没有，所以最好的处理就是当它不存在，照常进选择页。
 *
 * `guest.founder` 不是那一类。它是花名册上一个真实存在的条目（`docs/14 §2`），
 * `clearance: 'public-figure'` 把它挡在公开构建之外，**而那个挡的动作本身就是内容**：
 * 这个位置想要"把一个真实的人穿在身上"，而在拿到本人同意之前我们不去填它。
 * 把它和拼错的 id 一样处理，等于把这件作品里唯一一次"我们决定不做"抹成一次手滑。
 *
 * ## 那该怎么办：送到它已经在展出的地方
 *
 * 它没有身体可以装配 —— 这一点没得商量，`makeGenome` 那边的兜底是对的
 * （`packages/core/src/genome.ts`：喊一声，然后交回一个索引里真有的条目，
 * 因为到了那一步已经在装配一具身体了，不能空手回来）。所以问题不是"渲染什么"，
 * 是**在开始装配之前，怎么回答这个人**。
 *
 * 答案不需要新做：《共生护照》的第四枚章就是为这个缺口写的，
 * `passport/passport.ts` 的文件头逐条论证过为什么是那一页而不是选择页、
 * 也不是 `/about` 的散点图。**再在画布上写一句，就是那一枚章的第二份副本**，
 * 而两份副本一定会漂移。所以这里做的事只有一件：把人送到那一枚章跟前。
 *
 * 这和 `docs/23 §S8` 末条（`docs/43 §9.8` 裁的那一句）是同一个做法：
 * 一条链接把观众带到一个会被读成"坏了"的状态时，答案是**文档页正文里的一句话**，
 * 不是画面上多一个控件。这里连那句话都已经写好了，只差把人带过去。
 *
 * ## 边界
 *
 * - **现场（`?kiosk=1`）不走这条。** 装置画面上不该出现网站的任何一页（`docs/23 §S9`）。
 *   现场点名一个空位，仍然是喊一声、照常进选择页。
 * - 这张表和花名册是**两份**，所以必须有人对。`packages/app/test/vacancy.test.ts`
 *   两个方向都对：表里的每一条都要在花名册上且不进公开构建，
 *   花名册上每一个不进公开构建的条目也都要在表里。
 *   不能直接 import 花名册 —— 那会把整份 `recipes/roster.ts`（连同它的 clearance 注记）
 *   打进观众下载的那个包里，而这份表只需要一个 id。
 */

/** 空位 → 它在哪一页上展出（含锚点）。今天只有一条，这是好事，不是简化。 */
export const VACANCY_ON_SHOW: Readonly<Record<string, string>> = {
  'guest.founder': '/passport#stamp-iv',
};

/**
 * 用 `Object.hasOwn` 而不是 `in`：`?theme=constructor` 也过得了
 * `isThemeId` 的写法检查，而 `in` 会在原型链上找到它 —— 一个拼错的值
 * 会被当成空位，正好把上面那条分辨给毁了。
 */
export function vacancyOnShow(id: string | null | undefined): string | null {
  return id && Object.hasOwn(VACANCY_ON_SHOW, id) ? VACANCY_ON_SHOW[id] : null;
}

/** 这个 id 是不是一个故意空着的位置 */
export const isVacantPosition = (id: string | null | undefined): boolean =>
  vacancyOnShow(id) !== null;
