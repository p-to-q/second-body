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
 *   5. （2026-09-14 加）**观众那一侧也不静默。** 第 4 条守的是 `makeGenome`，
 *      而 `makeGenome` 的 warn 只有开控制台的人看得见。深链点名一个空位时，
 *      观众得到的应当是**那个位置的说明**，不是一次悄悄换人 —— `shell/vacancy.ts`
 *      把这条链接送到《共生护照》第四枚章（`#stamp-iv`）。
 *
 * 第 4 条守的是"不静默"，不是"渲染出空位" —— 一个空位没有身体可渲染。
 * 这条界线仍然划在原地：到了 `makeGenome` 已经在装配一具身体了，不能空手回来，
 * 所以核心那一层的兜底一个字没动。**变的是在那之前**：拒绝发生在装配开始以前，
 * 由 app 层做，而观众在哪里遇到那个缺口的答案仍然在 `/passport` 上 ——
 * 第 5 条查的正是那条路还通不通，不是在这里重讲一遍那一页。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { ROSTER, isPublic } from '../../factory/recipes/roster.ts';
import { makeGenome, resetGenomeWarnings } from '../../core/src/genome.ts';
import { VACANCY_ON_SHOW, isVacantPosition, vacancyOnShow } from '../src/shell/vacancy.ts';
import type { PartLibraryIndex, Tier } from '../../core/src/types.ts';

const VACANT = 'guest.founder';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PARTS = resolve(ROOT, 'assets/parts/parts.json');
const INDEX_PARTS = resolve(ROOT, 'packages/factory/src/index-parts.ts');
const MAIN = resolve(ROOT, 'packages/app/src/main.ts');
const PASSPORT = resolve(ROOT, 'packages/app/src/passport/passport.ts');

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

// ── 第 5 条：观众那一侧 ───────────────────────────────────────────────────
// 上面四条守的是"它确实不在场"。下面三条守的是**有人点名要它的时候会怎样** ——
// 在 2026-09-14 之前答案是"进选择页，一个字都不说"，而那和当初的静默换种
// 是同一种沉默，只是换了个位置。

test('空位表和花名册两个方向都对得上', () => {
  const listed = Object.keys(VACANCY_ON_SHOW).sort();
  const withheld = ROSTER.filter((e) => !isPublic(e)).map((e) => e.id).sort();
  assert.deepEqual(listed, withheld,
    'shell/vacancy.ts 的空位表和花名册对不上了。两份名单不是一份，'
    + '所以必须有人对：漏一条 = 那个空位被当成拼错的 id 悄悄咽掉；'
    + '多一条 = 一个能穿的物种被拦在作品之外');
  for (const id of listed) {
    const entry = ROSTER.find((e) => e.id === id)!;
    assert.equal(entry.look, '',
      `${id} 已经有 look 了 —— 有造型就不再是空位，这一条该从表里撤掉（连同 /passport 第四枚章）`);
  }
});

test('拼错的 id 不算空位 —— 连原型链上的名字也不算', () => {
  assert.equal(isVacantPosition('porcelain'), false);
  assert.equal(isVacantPosition('guest.foundr'), false, '拼错的 id 照家规当没写过，不能落进空位这一支');
  // `?theme=constructor` 过得了 isThemeId 的写法检查。用 `in` 查表会在原型链上
  // 找到它，于是一个拼错的值被当成空位 —— 正好把这条分辨给毁了。
  assert.equal(isVacantPosition('constructor'), false, 'constructor 被当成了空位：查表走的是原型链');
  assert.equal(isVacantPosition('toString'), false);
  assert.equal(isVacantPosition(null), false);
});

test('点名空位的深链有地方可去，而且那个锚点真的存在', () => {
  const target = vacancyOnShow(VACANT);
  assert.ok(target, `${VACANT} 在空位表里没有去处`);
  const [page, hash] = target.split('#');
  assert.equal(page, '/passport',
    '空位的去处不再是《共生护照》。这一页是作品为这个缺口挑好的房间'
    + '（passport.ts 文件头论证过为什么不是选择页、也不是 /about）');
  assert.ok(hash, '去处少了锚点 —— 观众会落在页首，读起来像这条链接没生效');

  // 断言写在**源码**上，理由同上面那条 clearance 门：产物不会因为这一步被拆掉而变样。
  const main = stripComments(readFileSync(MAIN, 'utf8'));
  assert.match(main, /vacancyOnShow\(/,
    'main.ts 不再问"这是不是一个故意空着的位置" —— 点名空位又变回一次沉默的换人');
  assert.match(main, /flags\.kiosk\s*\?\s*null\s*:/,
    'main.ts 的空位分支不再让现场例外。装置画面上不该出现网站的任何一页（docs/23 §S9）');

  // 锚点由 passport.ts 按章号现搭，所以要对的是"它搭出来的那个 id"。
  const passport = stripComments(readFileSync(PASSPORT, 'utf8'));
  assert.match(passport, /sec\.id = `stamp-\$\{s\.no\.toLowerCase\(\)\}`/,
    '/passport 不再给每一枚章发 id —— 上面那个锚点会指向一个不存在的元素');
  const numbers = [...passport.matchAll(/\bno: '([IVX]+)',/g)].map((m) => m[1].toLowerCase());
  assert.ok(numbers.includes(hash.replace(/^stamp-/, '')),
    `${target} 指着 ${hash}，但 /passport 上没有这一枚章（现有：${numbers.join(' / ')}）`);
});
