/**
 * 身体方案的**闭环**：声明的每一个方案运行时都认得，认得的每一个方案都真的接上了线。
 *
 * ## 这个文件为什么存在
 *
 * `BodyPlanId` 以前只列了七个方案，而线上真的在跑九个 —— `mass` 与 `swarm`
 * 是另一条身体实现（`creature/{mass,swarm}.ts`），`main.ts` 拿字符串比较去够它们。
 * 更要命的是 `ThemeDef.bodyPlan` 当时的类型是**裸 string**。于是：
 *
 *   一个物种写 `bodyPlan: 'quadrupd'`（拼错、或者方案被改过名），
 *   类型通过、每条测试全绿、`check:parts` 一声不吭，
 *   而 `remapSkeleton` 的 switch 走 default —— **它静默地按人形刚体装配出场。**
 *
 * 症状是"身体看起来完全没毛病，只是不是它声明的那一具"。件数一件不少，
 * 没有异常、没有占位几何、没有一处变红。这个仓库今天已经踩过同一类失败一次了
 * （静默换种，docs/39 §4）。docs/02 P21：**问一个坏掉时会变样的问题。**
 * "身体装配出来了吗"在这两种坏法下答案都是"是"，所以它不是仪表。
 *
 * ## 这里问的是两个会变样的问题
 *
 *  1. **声明 ⊆ 名单**：谱系表（源头）和 `parts.json`（实际出货的那份）里
 *     每一个 `bodyPlan` 都是 `BODY_PLANS` 的成员。
 *  2. **名单 ⊆ 接线**：`BODY_PLANS` 里每一个方案都真的有人处理 ——
 *     要么是骨架重映射（`remapSkeleton` 真的改了骨架），要么是 B 档的
 *     另一条身体实现（`main.ts` 里那句字符串比较），而且两条路上的每一个
 *     方案在两份文案表里都有名字。加第十个方案却忘了接线，这里会红。
 *
 * 第 2 条是这个文件的重点。只写第 1 条的守卫**永远不会因为加方案而红**，
 * 而"加了一个方案，忘了接上"正是这一整类 bug 最常见的下一次发作。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  BODY_PLANS, PLANS_WITHOUT_PARTS, remapSkeleton, type BodyPlanId,
} from '../../core/src/bodyplan.ts';
import { REFERENCE_POSE } from '../src/stage/framing.ts';
import { PLAN_LABEL } from '../src/ui/species.ts';
import { PLAN_MARKS, markShape } from '../src/ui/marks.ts';
import { COPY } from '../src/ui/i18n.ts';
import { ROSTER } from '../../factory/recipes/roster.ts';
import type { PartLibraryIndex } from '../../core/src/types.ts';

/** `bodyPlan`（字符串 / `{kind}` / 缺省）归一到一个字符串。三处读法必须一致 */
const kindOf = (bp: unknown): string => {
  if (typeof bp === 'string') return bp;
  if (bp && typeof bp === 'object') return String((bp as { kind?: string }).kind ?? 'rig');
  return 'rig';
};

const KNOWN = new Set<string>(BODY_PLANS);

// ── 1. 声明 ⊆ 名单 ──────────────────────────────────────────────────────────

test('每一个谱系条目声明的 bodyPlan 都在 BODY_PLANS 里', () => {
  // 源头是 `recipes/roster.ts`（含 `invited.ts`）—— `index-parts.ts` 把这里的值
  // 原样写进 parts.json，所以门开在这里才拦得住"还没生成索引"的那段时间。
  for (const e of ROSTER) {
    if (e.bodyPlan === undefined) continue;
    const kind = kindOf(e.bodyPlan);
    assert.ok(KNOWN.has(kind),
      `${e.id} 声明了 bodyPlan '${kind}'，不在 BODY_PLANS 里 —— `
      + `remapSkeleton 会走 default，它将静默地按 'rig'（人形刚体装配）出场`);
  }
});

test('parts.json 里每一个物种的 bodyPlan 都在 BODY_PLANS 里', () => {
  // parts.json 是**实际出货**的那份，而且是外部数据：手改过、旧版本写的、
  // 或者绕过 `buildIndex()` 的写入路径都可能让它和谱系表对不上。
  // 没有它就跳过（ADR-4：无资产也能开发），和 `outline-budget.test.ts` 同一条规矩。
  const path = fileURLToPath(new URL('../../../assets/parts/parts.json', import.meta.url));
  let index: PartLibraryIndex | null = null;
  try { index = JSON.parse(readFileSync(path, 'utf8')) as PartLibraryIndex; } catch { index = null; }
  if (!index) return;

  for (const t of index.themes ?? []) {
    const kind = kindOf(t.bodyPlan);
    assert.ok(KNOWN.has(kind),
      `parts.json 里 ${t.id} 的 bodyPlan 是 '${kind}'，不在 BODY_PLANS 里 —— `
      + `它会静默地按 'rig' 出场。重新跑 factory:index，或者修谱系表`);
  }
});

// ── 2. 名单 ⊆ 接线 ──────────────────────────────────────────────────────────

/**
 * `main.ts` 的源码文本。B 档方案不经过 `remapSkeleton`，它们是靠
 * `planKind === 'mass'` 这样的字符串比较去建另一具身体的 —— 那句话在不在，
 * 只能读源码。**故意不 import `main.ts`**：它会拉起 three.js / WebGPU / DOM，
 * 在 node 里跑不起来，而且这条测试要问的本来就是"那行代码写了没有"。
 * 读代码而不是读行为，是这个仓库里已有的做法（`css-tokens.test.ts` 同理）。
 */
const MAIN_SRC = readFileSync(
  fileURLToPath(new URL('../src/main.ts', import.meta.url)), 'utf8',
);

test('BODY_PLANS 里每一个方案都真的被处理了 —— 加一个却不接线，这里红', () => {
  for (const plan of BODY_PLANS) {
    // 'rig' 是缺省，它的"处理"就是什么都不做：`remapSkeleton('rig')` 按约定
    // 返回**同一个对象**（`core/test/bodyplan.test.ts` 第一条把这点钉死了）。
    if (plan === 'rig') continue;

    const remapped = remapSkeleton(REFERENCE_POSE, plan) !== REFERENCE_POSE;
    const isBodyImpl = (PLANS_WITHOUT_PARTS as readonly string[]).includes(plan);
    // B 档要的是"main.ts 里有一句把它认出来的比较"。两种引号都认，
    // 因为这条测试不该顺带规定代码风格。
    const dispatchedInMain = MAIN_SRC.includes(`=== '${plan}'`) || MAIN_SRC.includes(`=== "${plan}"`);

    if (isBodyImpl) {
      assert.ok(dispatchedInMain,
        `'${plan}' 在 PLANS_WITHOUT_PARTS 里（B 档，另一条身体实现），`
        + `但 main.ts 里没有一句 \`=== '${plan}'\` 把它认出来 —— `
        + `它会走刚体装配，画面上是一具普通的人形机器人`);
      assert.ok(!remapped,
        `'${plan}' 既改了骨架又被当成 B 档处理 —— 两条路都走会做两遍`);
    } else {
      assert.ok(remapped,
        `'${plan}' 不在 PLANS_WITHOUT_PARTS 里，那它就该是一次骨架重映射；`
        + `而 remapSkeleton 对它返回了同一个对象 —— `
        + `多半是 bodyplan.ts 的 switch 里漏了这个 case，它会静默地按 'rig' 出场`);
    }
  }
});

test('每一个方案在两份文案表里都有名字 —— 图例和控件条上不许出现英文 id', () => {
  // /about 的图例读 `PLAN_LABEL`（缺了就把英文 id 原样印给中文观众），
  // 控件条读 `COPY.controls.form`（缺了那个按钮**直接不出现**，
  // 一个线上在跑的方案在调试面板上按不出来 —— `swarm` 就这么漏了很久）。
  // 两处都是"漏一条只是看起来还行"，所以两处都要有人盯着。
  for (const plan of BODY_PLANS) {
    assert.ok(PLAN_LABEL[plan], `PLAN_LABEL 缺 '${plan}'（COPY.plans 没跟上）`);
    assert.ok(
      Object.prototype.hasOwnProperty.call(COPY.controls.form, plan),
      `COPY.controls.form 缺 '${plan}' —— 控件条会把这个方案的按钮整个跳过`,
    );
  }
});

test('每一个方案在 /about 的散点图上都有**自己的**记号 —— 两个方案不许共用一个', () => {
  // 这条守的是"图例里六个不同的名字配同一个空心圆"。
  // 不画记号只是没说话；画成一样是在断言"它们是一类"，而那是假的（docs/02 P21）。
  // 记号是数据（`ui/marks.ts`）而不是一段 createElementNS，为的就是这里能读它 ——
  // `about.ts` 第一行 import 了 CSS，在 node 里 import 不进来。
  const seen = new Map<string, BodyPlanId>();
  for (const plan of BODY_PLANS) {
    const shape = PLAN_MARKS[plan];
    assert.ok(shape?.length,
      `PLAN_MARKS 缺 '${plan}' —— /about 的图例会给它画一个和 'rig' 一样的空心圆，`
      + `于是页面上出现两个不同的名字配同一个记号`);

    const key = JSON.stringify(shape);
    const twin = seen.get(key);
    assert.equal(twin, undefined,
      `'${plan}' 和 '${twin}' 的记号一模一样 —— 图例会并排印出两个名字、一个形状，`
      + `那是在断言这两个方案是一类，而它们不是`);
    seen.set(key, plan);
  }
});

test('markShape 对未知值退回 rig —— 和 remapSkeleton 的 default 是同一句话', () => {
  // 画面上站着的就是一具人形（`remapSkeleton` 未知值走 default，P2）。
  // 记号跟着画面走，不跟着字符串走。
  assert.deepEqual(markShape('quadrupd'), PLAN_MARKS.rig);
  assert.deepEqual(markShape('quadruped'), PLAN_MARKS.quadruped);
});

// ── 3. 声明的比例必须到达运行时（step 5 那一类） ────────────────────────────

test('stub / towering 的条目自带比例不会被预设吞掉', () => {
  // 这条守的是另一半同类 bug：`{ kind: 'stub', head: 2.1 }` 以前整份 spec
  // 被丢掉，switch 走的是 `proportion(sk, PRESETS.stub)`，出口那一遍又被
  // `FIXED_PROPORTION` 挡住 —— 实测和光写 `'stub'` 吐出来的关节坐标一模一样。
  // 数据声明了一种身材，运行时给的是另一种，没有一处会红。
  const head = (kind: BodyPlanId, spec: Record<string, number> = {}) => {
    const sk = remapSkeleton(REFERENCE_POSE, { kind, ...spec });
    return sk.joints.headCenter[1] - sk.joints.neck[1];
  };
  for (const kind of ['stub', 'towering'] as const) {
    const plain = head(kind);
    const bigHead = head(kind, { head: 2.1 });
    assert.ok(bigHead > plain * 1.5,
      `${kind}: 声明 head:2.1 之后头长只从 ${plain.toFixed(3)} 变到 ${bigHead.toFixed(3)} —— `
      + `条目自己的比例被预设吞掉了`);
  }
});
