/**
 * 海报数据 —— 现读现算，不许手打。
 *
 * 读 `assets/parts/parts.json` + `assets/parts/curation.json`，算出海报上每一个数字，
 * 写成 `poster/data.js`（一个普通 <script>，`window.SB_POSTER`）。
 *
 * **为什么要有这一步**：海报上写死的数字会在第二天变成谎。`docs/18 §5` 已经
 * 记过一次"工程指标全绿、作品没成立"的教训；宣发物料是同一类陷阱的另一个入口 ——
 * 它天然想把数字说大、说圆、说定。所以数字只有一个来源，而且是**跑出来的**。
 *
 * 槽位表**直接从 `packages/core/src/slots.ts` import**，不再手抄一份。
 * 抄过一次：抄本和正本对上的那天数字是对的，genome 改了这边不会报错，
 * 数字会静默漂移 —— 而这几张海报的全部说服力就是数字是真的。
 * （node 22 直接跑 .ts，不需要构建步骤。）
 *
 * 组合数的算法仍与 `packages/core/src/genome.ts` 逐条对齐：
 *   - 18 个键（17 根骨头 + joint），左右肢**各自独立抽件**；
 *   - 沿 `base` 链找第一个有货的层级（docs/14 §3 的 light 借件）；
 *   - `curation.json` 里 reject 的件不进候选池（docs/14 §5）；
 *   - tier 3 的跨主题杂交**不算进来** —— 那是运行时的偶发分支，不是稳态容量。
 *
 * 跑：`node packages/app/poster/build-data.mjs`
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ALL_SLOT_KEYS, SLOT_OF_BONE } from '../../core/src/slots.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');

const parts = JSON.parse(readFileSync(resolve(ROOT, 'assets/parts/parts.json'), 'utf8'));
let curation = {};
try {
  curation = JSON.parse(readFileSync(resolve(ROOT, 'assets/parts/curation.json'), 'utf8'));
} catch { /* 没有策展文件是合法状态：未评级是默认 */ }

// 槽位表和键序都取自正本（core/src/slots.ts）。这里一个字都不许再写。
const KEYS = ALL_SLOT_KEYS;

const rejected = new Set(
  Object.entries(curation).filter(([, v]) => v?.verdict === 'reject').map(([id]) => id),
);

/** main.ts:105 的规则：字符串就是 kind，对象取 .kind，缺省 rig */
const planKind = (t) => {
  const b = t.bodyPlan;
  if (b === undefined || b === null) return 'rig';
  return typeof b === 'string' ? b : (b.kind ?? 'rig');
};

const chainOf = (id) => {
  const chain = [];
  let cur = id;
  const seen = new Set();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    chain.push(cur);
    cur = parts.themes.find((t) => t.id === cur)?.base;
  }
  return chain;
};

const TIER = 2; // 现场稳态：tier 1 是开场，tier 3 只在升档后短暂存在

const live = parts.parts.filter((p) => p.tier <= TIER && !rejected.has(p.id));

/**
 * 一个条目能长出多少具**不同的身体**。
 *
 * 返回 null 表示"这个条目从来没有为自己生成过一件部件" —— 那不是 0，是**空位**：
 * `field` 的身体是程序化的（`assets:'none'`），`guest.founder` 是 `docs/14 §2`
 * 明说的一个空位，它在那里是为了说明这个位置想要什么，不是一份名单。
 *
 * 把空位算进容量会让总数多出十几个百分点，而那十几个百分点背后一件部件都没有。
 * 这正是这几张海报要拒绝的那种数字。
 */
function bodiesOf(theme) {
  const own = parts.parts.filter((p) => p.family === theme.id);
  if (own.length === 0) return null;
  const chain = chainOf(theme.id);
  let n = 1;
  const perSlot = {};
  for (const key of KEYS) {
    const slot = key === 'joint' ? 'joint' : SLOT_OF_BONE[key];
    let pool = [];
    for (const fam of chain) {
      pool = live.filter((p) => p.slot === slot && p.family === fam);
      if (pool.length) break;
    }
    if (!pool.length) return null;
    perSlot[key] = pool.length;
    n *= pool.length;
  }
  return { count: n, perSlot };
}

const entries = parts.themes.map((t) => {
  const own = parts.parts.filter((p) => p.family === t.id);
  const ownLive = own.filter((p) => !rejected.has(p.id));
  const b = bodiesOf(t);
  return {
    id: t.id,
    kind: t.kind,
    name: t.name,
    nameEn: t.nameEn,
    tagline: t.tagline,
    taglineEn: t.taglineEn,
    plan: planKind(t),
    coverage: t.coverage,
    base: t.base ?? null,
    axes: t.axes ?? null,
    palette: t.palette ?? [],
    ownParts: own.length,
    ownRejected: own.length - ownLive.length,
    /** 它自己的件全被剔掉了，现在整具身体都是借的 */
    fullyBorrowed: own.length > 0 && ownLive.length === 0,
    bodies: b ? b.count : null,
    /** 18 个挂载键各自的候选池大小 —— 海报上的乘法式直接摊开它，不许反推 */
    perSlot: b ? b.perSlot : null,
    /** 有没有 anchor 参考图。没有的两个正好就是两个空位 —— 这不是巧合 */
    anchor: existsSync(resolve(ROOT, 'assets/refs', t.id, '_anchor.png')),
  };
});

const withBodies = entries.filter((e) => e.bodies !== null);
const totalBodies = withBodies.reduce((a, e) => a + e.bodies, 0);

const bySlot = {};
for (const p of parts.parts) bySlot[p.slot] = (bySlot[p.slot] ?? 0) + 1;
const byPlan = {};
for (const e of entries) byPlan[e.plan] = (byPlan[e.plan] ?? 0) + 1;
const byKind = {};
for (const e of entries) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;

const data = {
  generatedAt: new Date().toISOString(),
  source: {
    parts: 'assets/parts/parts.json',
    curation: 'assets/parts/curation.json',
    partsGeneratedAt: parts.generatedAt,
    partsVersion: parts.version,
  },
  counts: {
    entries: parts.themes.length,
    parts: parts.parts.length,
    partsRejected: rejected.size,
    partsLive: parts.parts.length - rejected.size,
    slots: Object.keys(bySlot).length,
    boneKeys: KEYS.length,
    materials: parts.materials.length,
    plans: Object.keys(byPlan).length,
    triangles: parts.parts.reduce((a, p) => a + (p.triCount ?? 0), 0),
    /** 有 anchor 图的条目数 —— 按文件系统实数，不按名单 */
    entriesWithAnchor: entries.filter((e) => e.anchor).length,
    /** 空位：从来没有为自己生成过一件部件的条目 */
    vacancies: entries.filter((e) => e.bodies === null).length,
    /** 自有件被全部剔除、整具身体都是借来的条目 */
    fullyBorrowed: entries.filter((e) => e.fullyBorrowed).length,
  },
  bySlot,
  byPlan,
  byKind,
  tier: TIER,
  totalBodies,
  entries,
  /** 剔件的理由 —— 人写的，是这个项目里最不该丢的东西（docs/14 §5） */
  rejects: Object.entries(curation)
    .filter(([, v]) => v?.verdict === 'reject')
    .map(([id, v]) => ({ id, note: v.note ?? '' }))
    .sort((a, b) => a.id.localeCompare(b.id)),
};

const out = resolve(HERE, 'data.js');
writeFileSync(
  out,
  '/* 由 build-data.mjs 生成，不要手改。跑 `node packages/app/poster/build-data.mjs` 重出。 */\n' +
    `window.SB_POSTER = ${JSON.stringify(data, null, 2)};\n`,
);

console.log(`poster/data.js — ${data.counts.entries} 条目 · ${data.counts.parts} 件（剔 ${data.counts.partsRejected}）`);
console.log(`  身体方案 ${JSON.stringify(byPlan)}`);
console.log(`  tier ${TIER} 组合容量 ${totalBodies.toLocaleString('en-US')} 具（${withBodies.length} 个条目参与）`);
for (const e of entries) {
  if (e.fullyBorrowed) console.log(`  ⚠ ${e.id}：自己的 ${e.ownParts} 件全被剔除，整具身体借自 ${e.base}`);
  if (e.bodies === null) console.log(`  · ${e.id}：不走刚体表达（无自有部件，无 base）`);
}
