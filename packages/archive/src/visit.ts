/**
 * 一条到访记录 —— A 档，`docs/43 §2.1` 的最左边那一列。
 *
 * ## 这个文件承的是哪一条裁定
 *
 * `docs/43 §9.4` 把「永久保留」立在一个非常窄的基座上：**不是靠匿名化站住的，
 * 是靠这条记录里根本没有个人数据站住的。** 所以这个文件不是一个数据类型声明，
 * 它是那条裁定的**实现**：字段清单就是那句话本身。
 *
 * 三个字段，一个不多：
 *
 * | 字段 | 是什么 | 为什么它指不到一个人 |
 * |---|---|---|
 * | `n` | 序号，主键（`§4.2`） | 单调递增的计数从自己身上说不出任何关于那个人的事 |
 * | `species` | 观众选的物种 | 取值是**闭集**（部件库里的 family id），不是自由文本 |
 * | `at` | 日期，**粗到天**（`§1.6`） | 一天是 24 小时的模糊窗口，配不出「某时某刻的某台设备」 |
 *
 * **IP 一个字节都不存**（`§9.2`）。不是合规姿态：`§0.2` 刚决定这件作品不拿访客的样子，
 * 那就不该拿访客的地址。
 *
 * ## `species` 为什么要过一条正则
 *
 * 这是整条记录里唯一一个**从请求体来**的字符串。一个不设防的自由文本字段，
 * 无论文档怎么写，事实上都是一条可以塞进姓名、邮箱、坐标的通道 ——
 * 那时候「这里没有个人数据」就从一句真话变成一句愿望。
 * 闭集校验把那条通道焊死：认不出来的值**拒收**，不是截断、不是落库再说。
 *
 * `test/archive.test.ts` 钉的就是这两件事（字段清单 + 那条正则），
 * 而且是照 `docs/02` P21 的要求当仪表用的：先看着它红，再让它绿。
 */

/**
 * A 档一条记录的**全部**字段。
 *
 * 这个数组不是文档，是被测试读的那份清单：往这里加一个字段，
 * `archive.test.ts` 的第一条就会红，加字段的人必须回到 `docs/43 §9.4`
 * 重新论证保留期 —— 那条裁定自己写了「哪天 D 档上线，这一条必须重裁，不能顺延」。
 */
export const VISIT_FIELDS = ['n', 'species', 'at'] as const;

export type VisitField = (typeof VISIT_FIELDS)[number];

export interface Visit {
  /** 第几位。1 起，只增 */
  n: number;
  /** 物种 = `PartMeta.family`。闭集，见 `SPECIES_RE` */
  species: string;
  /** `YYYY-MM-DD`。**没有时分秒** —— 粗到天是 §1.6 的四条前置之一 */
  at: string;
}

/**
 * 物种 id 的形状。和 `/__slow` 那条口子对 `session` 的做法同一个路数
 * （`docs/17 §3`：`[a-z0-9_-]{1,64}`），只是更紧：roster id 允许点
 * （`char.dumpling` / `guest.founder`），每个点后面必须还有字符。
 *
 * 32 个字符的上限不是排版，是**容量**：一个只能装 32 个 `[a-z0-9._-]` 的槽
 * 装不下一句话，也装不下一个邮箱。
 */
export const SPECIES_RE = /^[a-z0-9][a-z0-9_-]*(\.[a-z0-9_-]+)*$/;
/** 长度上限单独挡，不塞进正则 —— 正则里的量词没人读得出来它在挡什么 */
export const SPECIES_MAX = 32;

/** 日期只到天。这条正则同时是 §1.6「时间戳粗到天」的仪表 */
export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 今天是哪一天（UTC）。装置和网页版落在同一条日界线上，省掉一个不必要的差异 */
export function day(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export class VisitRejected extends Error {
  // 参数属性（`constructor(readonly code: string)`）在这个仓库里不能用 ——
  // `erasableSyntaxOnly`：源码要能被 Node 直接剥类型跑，没有构建步骤
  readonly code: string;
  readonly httpStatus: number;
  constructor(code: string, message: string, httpStatus = 400) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

/**
 * 从请求体里**只取**物种，别的一概不看。
 *
 * 写成「只取一个字段」而不是「取完再删掉不要的」是有意的：
 * 后者在代码里留下一个「曾经拿到过整个请求体」的中间值，
 * 而这个端点最该证明的事情正是**它从来没有拿到过那些东西**。
 */
export function readSpecies(body: unknown): string {
  const raw = (body as { species?: unknown } | null)?.species;
  if (typeof raw !== 'string' || !raw) {
    throw new VisitRejected('BAD_REQUEST', 'species 必须是一个字符串');
  }
  if (raw.length > SPECIES_MAX) {
    throw new VisitRejected('BAD_REQUEST', `species 超过 ${SPECIES_MAX} 个字符`);
  }
  if (!SPECIES_RE.test(raw)) {
    throw new VisitRejected('BAD_REQUEST', `species 只能是 [a-z0-9._-]：${raw}`);
  }
  return raw;
}

/**
 * 把一条记录收紧成**只有清单上那三个字段**的对象。
 *
 * 存储实现和 HTTP 响应都从这里过一道。多一层看起来啰嗦，但它是那条裁定的
 * 最后一道闸：哪天有人在某个 store 里顺手多挂了一个字段，它出不了这个函数。
 */
export function seal(v: Visit): Visit {
  return { n: v.n, species: v.species, at: v.at };
}
