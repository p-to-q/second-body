import test from 'node:test';
import assert from 'node:assert/strict';
import { randomPatch, SEED_MAX, type RandomPool } from '../src/ui/random-url.ts';
import { hallSearch } from '../src/ui/exits-url.ts';

/**
 * 「随机」那一下的**可复现性**。
 *
 * 这一块和 `exits-url.ts` 是同一类缺陷的温床：坏了也看不出来。
 * 随机永远能给出一个画面，一个少写了参数的随机只是"再按一次就不一样了" ——
 * 屏幕上一切正常，只有那个想把刚才那一具找回来的人会发现它没了。
 * 所以这里测的不是"它随机得够不够均匀"，是**它给出的那一行地址能不能走回来**。
 */

const POOL: RandomPool = {
  themes: ['porcelain', 'xeno', 'char.line', 'field'],
  forms: ['rig', 'quadruped', 'stub', 'mass'],
  scenes: ['paper', 'gallery', 'void', 'tide', 'backlit'],
  acts: ['follow', 'echo', 'resist', 'facing'],
  shadings: ['physical', 'toon'],
};

test('同一个 seed 永远给同一套参数 —— 这就是"同一张图找得回来"', () => {
  for (const seed of [0, 1, 12345, 2026, 0xffffffff]) {
    assert.deepEqual(randomPatch(seed, POOL), randomPatch(seed, POOL));
  }
});

test('seed 本身必须在 patch 里', () => {
  // 这是最容易漏的那一个：其余五样都写进了 URL，看起来很完整，
  // 而 seed 决定 makeGenome 抽中哪些件 —— 漏掉它，重载会换一具身体。
  const p = randomPatch(2026, POOL);
  assert.equal(p.seed, '2026');
  for (const k of ['theme', 'plan', 'scene', 'act', 'shading']) {
    assert.ok(p[k], `${k} 没写进 URL —— 这一屏就不是这一行地址能复现的了`);
  }
});

test('抽到的一定在池子里', () => {
  for (let seed = 0; seed < 200; seed++) {
    const p = randomPatch(seed, POOL);
    assert.ok(POOL.themes.includes(p.theme!));
    assert.ok(POOL.forms.includes(p.plan!));
    assert.ok(POOL.scenes.includes(p.scene!));
    assert.ok(POOL.acts.includes(p.act!));
    assert.ok(POOL.shadings.includes(p.shading!));
  }
});

test('渲染那四个开关一个都不抽', () => {
  // 把跟随延迟随机关掉，观众看到的是一具反应生硬的身体 —— 那读作"坏了"，
  // 不读作"另一种可能"。一个会随机把作品弄坏的按钮没有人会按第二次。
  for (let seed = 0; seed < 50; seed++) {
    const p = randomPatch(seed, POOL);
    for (const k of ['vitality', 'refine', 'nopost', 'mute']) {
      assert.equal(p[k], undefined, `${k} 不该被随机碰到`);
    }
  }
});

test('空池子不抽，但**照样消耗那一次**——顺序即契约', () => {
  // 没有玩法的那台机器和有玩法的那台，对同一个 seed 必须给出同样的形体。
  // 若空池子不抽，后面每一样都会错位一格。
  const noActs: RandomPool = { ...POOL, acts: [] };
  const a = randomPatch(7, POOL);
  const b = randomPatch(7, noActs);
  assert.equal(b.act, undefined);
  assert.equal(b.theme, a.theme);
  assert.equal(b.plan, a.plan);
  assert.equal(b.scene, a.scene);
  assert.equal(b.shading, a.shading, '玩法那一池空了，描边就跟着换了 —— 顺序错位');
});

test('seed 一律落在 uint32 里，负数和小数不会漏出去', () => {
  for (const bad of [-1, -2026.7, 1.5, SEED_MAX, SEED_MAX + 9]) {
    const n = Number(randomPatch(bad, POOL).seed);
    assert.ok(Number.isInteger(n) && n >= 0 && n < SEED_MAX, `${bad} → ${n}`);
  }
});

/**
 * 随机把参数写进 URL，「回到大厅」再把它们带回去 —— 两块拼在一起才是完整的
 * 来回。这一条守的是它们没有互相拆台：大厅那个按钮会**删掉** theme / plan
 * （理由在 `exits-url.ts`），而 seed 不在它的名单里，所以原样留着。
 */
test('抽到的那一屏回大厅之后，seed 还在', () => {
  const p = randomPatch(2026, POOL);
  const search = `?theme=${p.theme}&plan=${p.plan}&seed=${p.seed}&shading=${p.shading}`;
  const back = new URLSearchParams(hallSearch(search, {
    themeId: p.theme!, planId: p.plan!, sceneId: p.scene!, actId: p.act!,
    vitality: true, refine: true, post: true, muted: false,
  }));
  assert.equal(back.get('theme'), null, '大厅要重新选物种');
  assert.equal(back.get('plan'), null, '身材属于那个物种，不该带给下一个');
  assert.equal(back.get('seed'), p.seed, 'seed 不该在回大厅时丢掉');
});
