/**
 * 正文里通向**目录外**页面的那几句话 —— 一张表，不碰 DOM。
 *
 * ## 这张表为什么存在（docs/23 §S9.1，2026-09-14 作品负责人的裁定）
 *
 * 侧室的门原来只有一种：`/about` 正文里一个可以被穷举的数，通向它的穷举（`ui/clue.ts`）。
 * 作品负责人觉得这条规矩太窄：工作台上有几台仪器本身就值得给人看 ——
 * 比如按一个键就从同一个部件库里拼出另一具身体的装配台。它们出于策展理由**不进目录**、
 * 也不是展品，但目录里那几页的正文说到相关的事时，那几个字可以直接链过去。
 *
 * 所以现在有两种门，各守各的规矩：
 *
 *   线索（`clue.ts`）  数字 → 它的穷举。静止态隐形。只开在侧室上。
 *   旁注（这张表）     正文里**本来就在**的一个短语 → 一台仪器。静止态就是这个站
 *                     普通链接的样子（`.ed a` 那条 1px 底线），因为它不假装是暗门。
 *
 * ## 三条规矩，测试逐条钉住（`test/asides.test.ts`）
 *
 * 1. **短语必须逐字出现在它挂的那句话里**，中英各一次。不为了开门往正文里加字 ——
 *    和线索同一条（作品负责人允许为此补一句，但这一轮一句都没补：每个短语都是现成的）。
 * 2. **每个目的地都得走得回来。** 链接带 `?from=<这一页>`，目的地的出口
 *    （工作台页的 `dev/devnav.ts`、侧室的 `rooms/room.ts`）读它，印「返回〈那一页〉」。
 * 3. **目的地一个都不进目录**（`ui/nav.ts` 的 `ITEMS`）。
 *
 * ## 为什么只有这五台（逐页打开看过，2026-09-14）
 *
 * 判据照抄侧室那一条的前两句：它回答的问题观众也有；它在一台普通笔记本上开得出来。
 * 没过的写在 docs/23 §S9.1 的表里，这里只登记过了的。
 */
import { COPY, type BiText } from './i18n.ts';

/**
 * 目的地。键是给人读的名字，值是站内路径。
 * **只放 `dev/*.html` 或侧室** —— 正文页和作品本身在目录里，用不着旁注。
 */
export const ASIDE_PAGES = {
  /** 装配：一个物种的部件挂到骨架上；N 从同一个库里拼出另一具 */
  figure: '/dev/figure.html',
  /** 形体并排：同一副骨架，几种身体方案摆成一排 */
  lineup: '/dev/lineup.html',
  /** 生命力 A/B：一串延迟不同的刚体为什么看起来在弯 */
  vitality: '/dev/vitality.html',
  /** 团块身体：不由零件构成的那一种，可以和刚体版并排 */
  mass: '/dev/mass.html',
  /** 降级阶梯：帧循环炸了之后当场一级一级往下降 */
  degrade: '/dev/degrade.html',
} as const;

export type AsidePage = keyof typeof ASIDE_PAGES;

/** 一句话里的一个短语，和它通向哪儿 */
export interface AsidePhrase {
  page: AsidePage;
  /** 中文行里要变成链接的那几个字，逐字 */
  zh: string;
  /** 英文行里要变成链接的那几个字，逐字 */
  en: string;
}

/** 一处挂载：哪一句话（给测试核对短语用），挂哪几个短语 */
export interface AsideSite {
  /** 这句话在哪一页上。必须是 `ui/return-to.ts` 的 `RETURN_PAGES` 里的一页 */
  on: string;
  text: BiText;
  phrases: readonly AsidePhrase[];
}

const M = COPY.making;
const timeline = (hash: string): BiText => {
  const t = M.timeline.find((x) => x.hash === hash);
  if (!t) throw new Error(`asides: /making 的时间线里没有 ${hash}`);
  return t.text;
};

/**
 * 全部挂载点。正文页按键取自己那几处；测试遍历整张表。
 *
 * 护照那一处的正文住在 `passport.ts` 的 `STAMPS` 里（章是存证，不进文案总册，
 * 见 i18n.ts 的 `passport` 注释），所以它的 `text` 在这里抄不到 ——
 * 测试改为读 `passport.ts` 的源文件核对短语，见 `test/asides.test.ts`。
 */
export const ASIDES = {
  aboutCombination: {
    on: '/about',
    text: COPY.about.combBody,
    phrases: [{ page: 'figure', zh: '槽位 × 部件 × 材质', en: 'slots × parts × materials' }],
  },
  aboutPlan: {
    on: '/about',
    text: COPY.about.layers.planNote,
    phrases: [{ page: 'lineup', zh: '同一副骨架重映射成九种形体', en: 'remapped into nine builds' }],
  },
  aboutExpress: {
    on: '/about',
    text: COPY.about.layers.expressNote,
    phrases: [{ page: 'vitality', zh: '不做蒙皮', en: 'No skinning' }],
  },
  makingMass: {
    on: '/making',
    text: timeline('dfc9c63'),
    phrases: [{ page: 'mass', zh: '团块身体合入', en: 'The metaball body merges' }],
  },
  makingDegrade: {
    on: '/making',
    text: timeline('f826849'),
    phrases: [{ page: 'degrade', zh: '降级路径审计', en: 'Every fallback path is audited' }],
  },
  marksLede: {
    on: '/marks',
    text: COPY.rooms.marks.lede,
    phrases: [{ page: 'lineup', zh: '物种靠整体剪影辨识', en: 'A species is recognised by its whole silhouette' }],
  },
} as const satisfies Record<string, AsideSite>;

/** 护照第一枚章「后果」那一行里的短语。正文在 `passport.ts`，理由见上 */
export const PASSPORT_ASIDES = {
  stampI: [{ page: 'lineup', zh: '身体方案成为可插拔的', en: 'body plans became pluggable' }],
} as const satisfies Record<string, readonly AsidePhrase[]>;

/** /making 的时间线按 hash 取自己那一处 */
export const MAKING_TIMELINE_ASIDES: Readonly<Record<string, readonly AsidePhrase[]>> = {
  dfc9c63: ASIDES.makingMass.phrases,
  f826849: ASIDES.makingDegrade.phrases,
};
