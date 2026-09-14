import test from 'node:test';
import assert from 'node:assert/strict';
import { randomPatch, SEED_MAX, type RollSlot } from '../src/ui/random-url.ts';
import { hallSearch } from '../src/ui/exits-url.ts';

/**
 * 「随机」那一下的**可复现性**。
 *
 * 这一块和 `exits-url.ts` 是同一类缺陷的温床：坏了也看不出来。
 * 随机永远能给出一个画面，一个少写了参数的随机只是"再按一次就不一样了" ——
 * 屏幕上一切正常，只有那个想把刚才那一具找回来的人会发现它没了。
 * 所以这里测的不是"它随机得够不够均匀"，是**它给出的那一行地址能不能走回来**。
 *
 * 池子本身从控件表来（`control-table.test.ts` 钉顺序），这里用手写的小池子测抽签。
 */

const SLOTS: readonly RollSlot[] = [
  { param: 'theme', options: ['porcelain', 'xeno', 'char.line', 'field'] },
  { param: 'plan', options: ['rig', 'quadruped', 'stub', 'mass'] },
  { param: 'scene', options: ['paper', 'gallery', 'void', 'tide', 'backlit'] },
  { param: 'act', options: null },
  { param: 'shading', options: ['physical', 'toon'] },
];
const pool = (param: string) => SLOTS.find((s) => s.param === param)!.options!;

test('随机不钉玩法 —— 抽完交回弧线，并且清掉上一次叠加留下的 act=', () => {
  // 一次随机是"换一具身体看看"，不是"把弧线停在某一段"。
  for (let seed = 0; seed < 50; seed++) {
    const p = randomPatch(seed, SLOTS);
    assert.ok(Object.prototype.hasOwnProperty.call(p, 'act'), 'patch 没有显式删掉 act —— 旧的叠加会活过这次随机');
    assert.equal(p.act, null, `seed ${seed} 抽出了一个玩法 ${p.act}`);
  }
});

test('去掉玩法那一抽之后，同一个 seed 仍然给同一具身体（旧 URL 不作废）', () => {
  // 下面是去掉之前那一版对同一批 seed 的产物（抽签顺序 物种 → 形体 → 场景 → 玩法 → 描边）。
  // 玩法那一格仍然消耗一次 rng，所以它后面的描边不错位。
  const BEFORE: Record<number, [string, string, string, string]> = {
    0: ['xeno', 'rig', 'gallery', 'physical'],
    1: ['char.line', 'rig', 'void', 'toon'],
    7: ['porcelain', 'rig', 'backlit', 'toon'],
    2026: ['xeno', 'quadruped', 'tide', 'physical'],
    12345: ['field', 'quadruped', 'void', 'toon'],
  };
  for (const [seed, [theme, plan, scene, shading]] of Object.entries(BEFORE)) {
    const p = randomPatch(Number(seed), SLOTS);
    assert.deepEqual([p.theme, p.plan, p.scene, p.shading], [theme, plan, scene, shading], `seed ${seed} 换了一具身体`);
  }
});

test('同一个 seed 永远给同一套参数 —— 这就是"同一张图找得回来"', () => {
  for (const seed of [0, 1, 12345, 2026, 0xffffffff]) {
    assert.deepEqual(randomPatch(seed, SLOTS), randomPatch(seed, SLOTS));
  }
});

test('seed 本身必须在 patch 里', () => {
  // 这是最容易漏的那一个：其余几样都写进了 URL，看起来很完整，
  // 而 seed 决定 makeGenome 抽中哪些件 —— 漏掉它，重载会换一具身体。
  const p = randomPatch(2026, SLOTS);
  assert.equal(p.seed, '2026');
  for (const k of ['theme', 'plan', 'scene', 'shading']) {
    assert.ok(p[k], `${k} 没写进 URL —— 这一屏就不是这一行地址能复现的了`);
  }
});

test('抽到的一定在池子里', () => {
  for (let seed = 0; seed < 200; seed++) {
    const p = randomPatch(seed, SLOTS);
    for (const k of ['theme', 'plan', 'scene', 'shading']) assert.ok(pool(k).includes(p[k]!), `${k}=${p[k]}`);
  }
});

test('渲染那几个开关一个都不抽', () => {
  // 把跟随延迟随机关掉，观众看到的是一具反应生硬的身体 —— 那读作"坏了"，
  // 不读作"另一种可能"。一个会随机把作品弄坏的按钮没有人会按第二次。
  for (let seed = 0; seed < 50; seed++) {
    const p = randomPatch(seed, SLOTS);
    for (const k of ['vitality', 'refine', 'nopost', 'mute']) {
      assert.equal(p[k], undefined, `${k} 不该被随机碰到`);
    }
  }
});

test('空池子不抽，但**照样消耗那一次**——顺序即契约', () => {
  // 没有物种可抽的那台机器和有的那台，对同一个 seed 必须给出同样的形体。
  const noThemes = SLOTS.map((s) => (s.param === 'theme' ? { ...s, options: [] } : s));
  const a = randomPatch(7, SLOTS);
  const b = randomPatch(7, noThemes);
  assert.equal(b.theme, undefined, '空池子写了一个值');
  assert.equal(b.plan, a.plan);
  assert.equal(b.scene, a.scene);
  assert.equal(b.shading, a.shading, '物种那一池空了，后面就跟着换了 —— 顺序错位');
});

test('seed 一律落在 uint32 里，负数和小数不会漏出去', () => {
  for (const bad of [-1, -2026.7, 1.5, SEED_MAX, SEED_MAX + 9]) {
    const n = Number(randomPatch(bad, SLOTS).seed);
    assert.ok(Number.isInteger(n) && n >= 0 && n < SEED_MAX, `${bad} → ${n}`);
  }
});

/**
 * 随机把参数写进 URL，「回到大厅」再把它们带回去 —— 两块拼在一起才是完整的
 * 来回。这一条守的是它们没有互相拆台：大厅那个按钮会**删掉** theme / plan
 * （理由在 `exits-url.ts`），而 seed 不在它的名单里，所以原样留着。
 */
test('抽到的那一屏回大厅之后，seed 还在', () => {
  const p = randomPatch(2026, SLOTS);
  const search = `?theme=${p.theme}&plan=${p.plan}&seed=${p.seed}&shading=${p.shading}`;
  const back = new URLSearchParams(hallSearch(search, {
    species: p.theme!, form: p.plan!, scene: p.scene!, act: null,
    outline: false, vitality: true, sound: true, refine: true, post: true, framing: 'auto', people: '1',
  }));
  assert.equal(back.get('theme'), null, '大厅要重新选物种');
  assert.equal(back.get('plan'), null, '形体叠加是这一个人按的，不该带给下一个');
  assert.equal(back.get('seed'), p.seed, 'seed 不该在回大厅时丢掉');
});
