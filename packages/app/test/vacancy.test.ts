/**
 * 那个**故意的空位**：`guest.founder`（`docs/14 §2`、`docs/39 §4` 第 1 条）。
 *
 * ## 它守的是什么
 *
 * 花名册上有一个没有 `look`、没有任何部件的条目。它在那里是为了说明这个位置
 * 想要什么 —— 把一个真实的人穿在身上 —— 以及为什么这件事在拿到本人同意之前
 * 不能做。`/passport` 的第四枚章是观众遇到它的地方；**这个文件守的是
 * 它在代码里必须一直成立的那几条**，因为那一枚章说的每一句都建立在它们上面。
 *
 * 四条，每一条对应一种曾经真的发生过、或者随时会回来的坏法：
 *
 *   1. `clearance` 门还在 `buildIndex()` 里。门被拿掉时 `parts.json` 不会立刻变样
 *      （它是上一次 `factory:index` 的产物），所以**只查产物的断言看不见这件事** ——
 *      要等到下一次重建索引才暴露，而那时改门的人早就走了。
 *   2. 产物上它确实不在：条目表里没有，`parts` 里也没有一件属于它的零件。
 *   3. 自动挑身体永远挑不到它。`makeGenome` 的随机分支只从**有自有件**的名单里抽，
 *      一个观众什么都不做时不该被随机丢进一个空条目。
 *   4. `?theme=guest.founder` **不静默**。这是 `docs/39 §4` 记下的那个原始故障：
 *      它曾经静默渲染成 `porcelain`，而 HUD 上写着「瓷 · Porcelain」——
 *      画面和名字都是别人的，没有任何一处说过话。现在它必须喊一声，
 *      而且交回来的必须是一个**索引里真的有**的条目（HUD 和身体对得上）。
 *
 * 第 4 条守的是"不静默"，不是"渲染出空位" —— 一个空位没有身体可渲染。
 * 这条界线是故意划在这里的：能自动验的是 warn 和 id 的一致性，
 * 至于观众该在哪里遇到那个缺口，答案在 `/passport` 上，不在这里。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { ROSTER, isPublic } from '../../factory/recipes/roster.ts';
import { makeGenome, resetGenomeWarnings } from '../../core/src/genome.ts';
import type { PartLibraryIndex, Tier } from '../../core/src/types.ts';

const VACANT = 'guest.founder';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PARTS = resolve(ROOT, 'assets/parts/parts.json');
const INDEX_PARTS = resolve(ROOT, 'packages/factory/src/index-parts.ts');

const TIERS: Tier[] = [1, 2, 3];

test('花名册上还有这个空位，而且 clearance 说它不进公开构建', () => {
  const entry = ROSTER.find((e) => e.id === VACANT);
  assert.ok(entry, `${VACANT} 从花名册上消失了。撤掉它是一个策展决定（docs/39 §4 第 1 条），`
    + '不是一个工程决定 —— 而且 /passport 的第四枚章会当场变成一句假话');
  assert.equal(entry.look, '', `${VACANT} 被填上了 look。空位一旦有造型就不再是空位，`
    + '这一步要先有本人授权（roster.ts 的 note）');
  assert.equal(isPublic(entry), false, `${VACANT} 的 clearance 变成了可公开的一档`);
});

/**
 * 注释先剥掉再匹配（做法抄 `css-tokens.test.ts`）。
 *
 * 这一步是**红灯自己教出来的**：`buildIndex()` 的文档注释里有一句
 * 「从来不问 `isPublic()`」—— 在讲这道门以前没有执行者。把判据换成
 * `t.kind !== 'guest'`（门还在，但认的不是 clearance）之后，
 * 断言居然还是绿的：它匹配到的是那句注释。
 * **一条能被自己的文档喂饱的守卫，守的是文档不是代码。**
 */
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

test('clearance 门还在 buildIndex() 里 —— 只查 parts.json 看不见它被拿掉', () => {
  // 断言写在**源码**上，和 page-header.test.ts 同一个理由：产物是上一次构建的结果，
  // 门被删掉的那一刻它一个字都不会变。要拦的是改门的那一下。
  const src = stripComments(readFileSync(INDEX_PARTS, 'utf8'));
  assert.match(src, /ROSTER\.filter\(/,
    'buildIndex() 不再过滤 ROSTER —— 整张花名册会原样写进 parts.json（docs/14 §2 的门没有执行者了）');
  assert.match(src, /isPublic\(/,
    'buildIndex() 里没有 isPublic()：过滤还在，但判据换了。门只认 clearance，不认别的');
});

test('真 parts.json：条目表里没有它，零件里也没有一件属于它', { skip: !existsSync(PARTS) }, () => {
  const index: PartLibraryIndex = JSON.parse(readFileSync(PARTS, 'utf8'));
  assert.equal(index.themes.some((t) => t.id === VACANT), false,
    `${VACANT} 又进了条目表。一个故意的空位应当看得见地缺席，而不是在数字里在、在画面上不在`);
  assert.equal(index.parts.some((p) => p.family === VACANT), false,
    `${VACANT} 有零件进了索引 —— 它的 clearance 是 public-figure，这些零件不该被打包出去`);
});

test('自动挑身体永远挑不到它', { skip: !existsSync(PARTS) }, () => {
  const index: PartLibraryIndex = JSON.parse(readFileSync(PARTS, 'utf8'));
  for (let seed = 0; seed < 400; seed++) {
    for (const tier of TIERS) {
      assert.notEqual(makeGenome(seed, tier, index).theme, VACANT,
        `seed=${seed} tier=${tier} 随机抽到了 ${VACANT}：一个没有身体的条目不该被替观众选中`);
    }
  }
});

test('?theme=guest.founder 不静默换种：喊一声，而且交回一个索引里真有的条目',
  { skip: !existsSync(PARTS) }, () => {
    const index: PartLibraryIndex = JSON.parse(readFileSync(PARTS, 'utf8'));
    resetGenomeWarnings();   // "同一个条目只喊一次"的记忆会让这条测试看运行顺序
    const said: string[] = [];
    const real = console.warn;
    console.warn = (...args: unknown[]) => { said.push(args.map(String).join(' ')); };
    let got: string;
    try {
      got = makeGenome(7, 2, index, { theme: VACANT }).theme;
    } finally {
      console.warn = real;
    }

    assert.ok(said.some((s) => s.includes(VACANT)),
      `点名 ${VACANT} 之后一声没吭。docs/39 §4 记的那个故障就是这个形状：`
      + '画面静默换成 porcelain，HUD 跟着写别人的名字，没有任何一处说过话');
    assert.notEqual(got, VACANT, `${VACANT} 没有任何零件，装配不出一具身体`);
    assert.ok(index.themes.some((t) => t.id === got),
      `换成了索引里没有的 ${got} —— HUD 上会印出一个查不到的名字`);
  });
