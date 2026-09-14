/**
 * 规范化契约的可执行版本（docs/03 §6）。
 * 文档会撒谎，这个不会。合并门 `npm run check` 会跑它。
 * 没有资产时视为通过（ADR-4：无资产也能开发）。
 */
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { PARTS_DIR } from './ledger.ts';
import { glbStats } from './glb-stats.ts';
import { SLOT_FIT } from '../../core/src/tuning.ts';
import { entryById, isPublic, SIGNATURE_SLOTS } from '../recipes/roster.ts';
// 名单从 core 拿，不在这里另抄一份。抄一份的那个版本已经出过事：
// `ui/controls.ts` 抄的那份只写了 `mass`，于是 `swarm` 落在控件条外面。
import { BODY_PLANS, PLANS_WITHOUT_PARTS } from '../../core/src/bodyplan.ts';
import type { PartLibraryIndex, Slot, ThemeDef } from '../../core/src/types.ts';

const EPS = 2e-3;
const MAX_TRIS = 5000;
const MAX_BYTES = 1_500_000;   // docs/02 P5 的单件预算

/** docs/26 §H / §I：uniform 槽位的 girth 必须落在该槽位中位数的这个区间里 */
const GIRTH_BAND: [number, number] = [0.7, 1.3];

const median = (xs: number[]): number => {
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const planKindOf = (t: ThemeDef): string => {
  const bp = t.bodyPlan;
  return typeof bp === 'string' ? bp : (bp?.kind ?? 'rig');
};

async function importCuration() { return await import('./curation.ts'); }

export async function checkParts(): Promise<number> {
  const indexPath = resolve(PARTS_DIR, 'parts.json');
  if (!existsSync(indexPath)) { console.log('check:parts — 没有 parts.json，跳过（运行时会用占位几何）'); return 0; }
  const index: PartLibraryIndex = JSON.parse(readFileSync(indexPath, 'utf8'));
  const errs: string[] = [];
  const warns: string[] = [];

  if (index.convention.axis !== '+Y' || index.convention.length !== 1) errs.push('convention 与 docs/03 不符');

  const seen = new Set<string>();
  for (const p of index.parts) {
    const file = resolve(PARTS_DIR, p.file);
    if (seen.has(p.id)) errs.push(`${p.id}: id 重复`);
    seen.add(p.id);
    if (!existsSync(file)) { errs.push(`${p.id}: 文件缺失 ${p.file}`); continue; }
    const s = glbStats(file);
    if (Math.abs(s.size[1] - 1) > EPS) errs.push(`${p.id}: 长度 ${s.size[1].toFixed(4)} ≠ 1.0`);
    if (Math.abs(s.min[1]) > EPS) errs.push(`${p.id}: socketA 不在原点 y=${s.min[1].toFixed(4)}`);
    if (Math.abs((s.min[0] + s.max[0]) / 2) > EPS * 5) warns.push(`${p.id}: X 未居中 ${((s.min[0]+s.max[0])/2).toFixed(4)}`);
    if (Math.abs((s.min[2] + s.max[2]) / 2) > EPS * 5) warns.push(`${p.id}: Z 未居中 ${((s.min[2]+s.max[2])/2).toFixed(4)}`);
    if (s.triangles > MAX_TRIS) errs.push(`${p.id}: ${s.triangles} tris > ${MAX_TRIS}`);
    if (s.bytes > MAX_BYTES) errs.push(`${p.id}: ${(s.bytes/1e6).toFixed(1)} MB > ${(MAX_BYTES/1e6).toFixed(1)} MB（多半是 prune 没跑，旧 buffer 还在）`);
    if (s.meshes !== 1) warns.push(`${p.id}: ${s.meshes} 个 mesh（契约要求 1）`);
    if (s.hasAnimation || s.hasSkin) errs.push(`${p.id}: 含动画/骨骼`);
    if (s.images > 0) warns.push(`${p.id}: 仍带 ${s.images} 张贴图（应在规范化时删掉）`);
    if (Math.abs(p.localGirth - Math.max(s.size[0], s.size[2])) > EPS * 5) errs.push(`${p.id}: localGirth 与几何不符`);
  }

  // 槽位覆盖：任一 tier 下，每个骨头槽位都要至少有一个候选，否则运行时会大面积回退占位
  const SLOTS = ['head','spine','clavicle','upperArm','foreArm','hand','thigh','shin','foot','joint'];
  for (const t of [1, 2, 3]) for (const slot of SLOTS) {
    if (!index.parts.some((p) => p.slot === slot && p.tier <= t)) warns.push(`tier${t} 的 ${slot} 槽位没有候选`);
  }

  /**
   * docs/26 §H / §I 的那条「真实几何不能免检」：`head`/`spine`/`hand`/`foot`/`joint`
   * 运行时是 **uniform 缩放**（`SLOT_WIDTH / localGirth`，忽略骨长），所以一件
   * 长宽比跑偏的件不会被截成"稍微怪一点"，而是被整件放大成一根杆子。
   *
   * 中位数**每次现算**，不写死（P21 第 2 条：派生数只在派生的那一刻为真）。
   * 槽位用 `SLOT_FIT` 而不是在这里再抄一张表 —— 抄一张就会有一天对不上。
   */
  const uniformSlots = (Object.keys(SLOT_FIT) as Slot[])
    .filter((s) => SLOT_FIT[s] === 'uniform')
    // 脚是例外，而且 §H 那张名单在这一点上已经过期：`assemble.ts` 给脚传了
    // `axisLength`（脚长从骨长算，见 tuning.ts 的 FOOT），横向又被 girth 归一化回
    // `SLOT_WIDTH.foot` —— 两个方向都把 localGirth 除干净了，它对成品**没有影响**。
    // 把它留在检查里只会稳定地报 7 条永远不用管的警告，那就是仪表噪声。
    .filter((s) => s !== 'foot');
  for (const slot of uniformSlots) {
    const girths = index.parts.filter((p) => p.slot === slot).map((p) => p.localGirth);
    if (girths.length < 3) continue;              // 样本太少，中位数没有意义
    const mid = median(girths);
    for (const p of index.parts.filter((x) => x.slot === slot)) {
      const ratio = p.localGirth / mid;
      if (ratio >= GIRTH_BAND[0] && ratio <= GIRTH_BAND[1]) continue;
      warns.push(`${p.id}: girth ${p.localGirth.toFixed(4)} = ${slot} 中位数的 ${ratio.toFixed(2)}×`
        + `（docs/26 §H 要求 ${GIRTH_BAND[0]}×–${GIRTH_BAND[1]}×；uniform 槽位会把这个比例直接变成尺寸）`);
    }
  }

  /**
   * **认不出来的身体方案 —— 这是错，不是警告。**
   *
   * 为什么必须是错：`remapSkeleton` 的 switch 对认不出来的 kind 走 default，
   * 也就是**原样返回人体骨架**，于是这个物种照人形刚体装配出场。
   * 画面上是一具没有任何毛病的身体 —— 只是不是它声明的那一具。
   * 没有异常、没有占位几何、没有一处变红，件数一件不少。
   * 这个仓库今天已经踩过同一类失败一次了（静默换种，docs/39 §4）。
   *
   * 类型那道门（`RosterEntry.bodyPlan` / `ThemeDef.bodyPlan` 现在是 `BodyPlanId`）
   * 挡的是**源头**；这一条挡的是 parts.json —— 它是外部数据，可能是手改的、
   * 旧版本写的、或者某个绕过 `buildIndex()` 的写入路径产生的。两道门缺一不可。
   *
   * 报错文本里必须同时出现"它声明了什么"和"它会静默变成什么"：
   * 只说前者的话，读的人不知道后果，会把它当成一个可以晚点再说的拼写问题。
   */
  const KNOWN_PLANS = new Set<string>(BODY_PLANS);
  for (const t of index.themes ?? []) {
    const kind = planKindOf(t);
    if (KNOWN_PLANS.has(kind)) continue;
    errs.push(`${t.id}: bodyPlan 声明了 '${kind}'，不在 BODY_PLANS（${BODY_PLANS.join(' / ')}）里 —— `
      + `remapSkeleton 走 default，它会**静默地**按 'rig'（人形刚体装配、标准比例）出场，`
      + `画面上看不出任何异常，只是它不是声明的那具身体`);
  }

  const { loadCuration, summary } = await importCuration();
  const cur = loadCuration();
  const rejected = Object.entries(cur).filter(([, e]) => e.verdict === 'reject').map(([id]) => id);
  const stillIndexed = rejected.filter((id) => index.parts.some((p) => p.id === id));
  if (stillIndexed.length) {
    // 这句话以前是假的：它写着「genome 会排除它们」，而当时**没有任何调用者**把
    // rejected 传进 makeGenome。检查每次都绿，问的却是让人舒服的那个问题（docs/02 P21）。
    // 现在排除是真的发生的：app 层 `createPartLibrary` 拉 /parts/curation.json，
    // 把 reject 的 id 传给 `makeGenome({ rejected })`。文件保留仍然是故意的（curation.ts 规则 2）。
    warns.push(`${stillIndexed.length} 件已标 reject 但仍在 parts.json 里：`
      + `运行时由 curation.json → makeGenome({ rejected }) 排除，文件保留是故意的（${stillIndexed.join(', ')}）`);

    // 这一条才是「坏掉时会变样」的那个仪表：某个物种的自有件被 reject 光了。
    // 它不会消失（名单只看 tier，不看策展），但它整具都要沿 base 链借件 ——
    // 借不到就只剩占位几何，那是一个物种事实上的死亡，必须当场看见。
    const rejectedSet = new Set(rejected);
    const own = (fam: string, curated: boolean) =>
      index.parts.filter((p) => p.family === fam && (!curated || !rejectedSet.has(p.id))).length;
    for (const t of index.themes ?? []) {
      if (!own(t.id, false) || own(t.id, true)) continue;      // 本来就没自有件 / 还剩自有件
      // 沿整条 base 链找第一个还供得上件的祖先（genome.ts 的 baseChain 就是这么走的）
      let cur = t.base, donor: string | undefined, seen = new Set([t.id]);
      while (cur && !seen.has(cur)) {
        seen.add(cur);
        if (own(cur, true)) { donor = cur; break; }
        cur = (index.themes ?? []).find((x) => x.id === cur)?.base;
      }
      const msg = `${t.id}: 自有件已被 reject 光，整具沿 base 链借件`;
      if (donor) warns.push(`${msg}（← ${donor}）`);
      else errs.push(`${msg}，但 base 链上没有一层供得上件 —— 这个物种只会出占位几何`);
    }
  }
  /**
   * 两条「这个物种在画面上还在不在」的仪表。`check:parts` 一直只数件数，
   * 而件数在这两种坏法下**一个都不少**（docs/02 P21：问一个坏掉时会变样的问题）。
   *
   * 1. **空壳物种**：一个条目一件自有件都没有进过索引。
   *    这条以前是「点不到」——`makeGenome` 的名单来自 family，于是
   *    `{ theme: 'char.diva' }` **静默变成另一个物种**。2026-09-13 修在根上：
   *    `resolveTheme()` 现在保留物种身份、沿 base 链借件并喊一声，
   *    `choose/wearable.ts` 把它挡在轮播之外。所以它不再是一次静默换种 ——
   *    但它仍然是一个**只剩配色的物种**，这条警告留着，直到有人裁定生成还是撤掉
   *    （docs/39 §4 第 1 条）。（`mass` / `swarm` 本来就不实例化任何件，不适用。）
   * 2. **借光了的物种**：自有件全被策展否掉之后，整具沿 base 链借件 ——
   *    上面那一条已经报了，这里补的是 `coverage` 说好的件数与实际的差额：
   *    `light` 声明了 6 个标志性槽位，少一个就少一分辨识度。
   */
  /**
   * `clearance` 那道门（docs/14 §2）。这条警告以前是它**唯一**的执行者 ——
   * `index-parts.ts` 把整个 ROSTER 原样写进 parts.json，从来不问 `isPublic()`，
   * 而 parts.json 是要进 dist 的。2026-09-13 起门在源头：`buildIndex()` 只写
   * `ROSTER.filter(isPublic)`。这条留着当第二道闸 —— 它现在应当**永远不响**，
   * 响了就说明有人绕过了 `buildIndex()`（手改 parts.json、或者另开一条写入路径）。
   */
  for (const t of index.themes ?? []) {
    const entry = entryById(t.id);
    if (entry && !isPublic(entry)) {
      warns.push(`${t.id}: clearance='${entry.clearance}'，按 docs/14 §2 不该进公开构建，`
        + `却在 parts.json 里 —— buildIndex() 已经挡这一层，说明这份索引不是它写的`);
    }
  }

  const rejectedIds = new Set(rejected);
  const familiesInIndex = new Set(index.parts.map((p) => p.family));
  const liveOwnSlots = (fam: string) =>
    new Set(index.parts.filter((p) => p.family === fam && !rejectedIds.has(p.id)).map((p) => p.slot));
  for (const t of index.themes ?? []) {
    if ((PLANS_WITHOUT_PARTS as readonly string[]).includes(planKindOf(t))) continue;
    if (t.source === 'procedural') continue;
    if (!familiesInIndex.has(t.id)) {
      warns.push(`${t.id}: parts.json 里一件自有件都没有 —— `
        + `makeGenome 保留物种身份、整具沿 base 链借件并 warn，选择页也把它挡在轮播外；`
        + `但它在画面上只剩配色，生成还是撤掉需要一次策展裁定（docs/39 §4）`);
      continue;
    }
    const have = liveOwnSlots(t.id) as Set<string>;
    const missing = SIGNATURE_SLOTS.filter((s) => !have.has(s));
    if (t.coverage === 'light' && missing.length) {
      warns.push(`${t.id}: coverage='light' 说好 ${SIGNATURE_SLOTS.length} 个标志性槽位，`
        + `实际只有 ${SIGNATURE_SLOTS.length - missing.length} 个（缺 ${missing.join('/')}，沿 base 链借）`);
    }
  }

  /**
   * **声称取自某台机器的条目，身上是不是那台机器的件 —— 这是错，不是警告。**
   *
   * 为什么必须是错：`patrol` 的记录写着 Boston Dynamics Spot，穿的却是
   * ANYbotics ANYmal C，整整一轮没有人发现（docs/42 §0 第二条）。件数一件不少、
   * 契约全绿、画面上是一具没有任何毛病的四足机 —— 只是不是它声称的那一台。
   * 名字查不了（「巡逻」不告诉任何人它是哪台机器），`machine` 字段查得了，
   * 这一条就是那次查（docs/42 §5 第 4 条、§7 第 3 条）。
   *
   * 三问，都只看**活着的**件（被 `curation.json` reject 的件运行时不出现，
   * 所以拿它们判物种身上穿什么是错的）：
   *
   *   1. `geometry: 'real'` 就必须有 `source`（钉到 SHA 的那个 URL），否则无从查起；
   *   2. `geometry: 'real'` 的条目，索引里它自己的真实件必须**全部**来自那个 URL；
   *   3. `geometry: 'generated'` 的条目身上不该有真实件 —— 有就是它在少说一件事。
   *
   * 第 2 条还兜住反过来的那一半：`machine.source` 指到一台索引里一件都没有的机器时，
   * 这个物种就是"声称真几何、身上一件真件都没有"，同样报错。
   */
  const liveParts = index.parts.filter((p) => !rejectedIds.has(p.id));
  for (const t of index.themes ?? []) {
    const m = t.machine;
    if (!m) continue;                       // 没有 machine = docs/26 §H 的「虚」，无从查也不必查
    const real = liveParts.filter((p) => p.family === t.id && p.source?.provider === 'harvest');
    if (m.geometry === 'generated') {
      if (real.length) {
        errs.push(`${t.id}: machine.geometry='generated'，索引里却有 ${real.length} 件真实网格`
          + `（${real.map((p) => p.id).join(', ')}）—— 记录说它没有几何，身上却穿着几何`);
      }
      continue;
    }
    if (!m.source) {
      errs.push(`${t.id}: machine.geometry='real' 但没有 machine.source —— `
        + `没有那个钉到 SHA 的 URL，"这具身体是不是那台机器"这个问题就查不了`);
      continue;
    }
    const wrong = real.filter((p) => !(p.source?.model ?? '').startsWith(m.source!));
    if (!real.length || wrong.length) {
      const got = [...new Set(real.map((p) => (p.source?.model ?? '').replace(/\/[^/]*$/, '/')))];
      errs.push(`${t.id}: 记录说取材自 ${m.maker} ${m.name}（${m.source}），`
        + (real.length
          ? `但索引里 ${wrong.length}/${real.length} 件真实件来自别处：${got.join(' , ')} —— `
          : `索引里却一件真实网格都没有 —— `)
        + `记录和几何互相抵消时，去看实物再改记录（docs/42 §7 第 2 条）`);
    }
  }

  console.log(`  策展: ${summary(cur)}`);

  for (const w of warns) console.warn('  ⚠ ' + w);
  for (const e of errs) console.error('  ✗ ' + e);
  console.log(`check:parts — ${index.parts.length} 件, ${errs.length} 错, ${warns.length} 警告`);
  return errs.length ? 1 : 0;
}

// 注意：路径含非 ASCII 时 import.meta.url 会被百分号编码，必须用 pathToFileURL 比较
if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(await checkParts());
