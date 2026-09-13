/**
 * 导演按弧线排座次（`acts/act.ts` + `core/src/arc.ts` + docs/40 §1）。
 *
 * 此前它是**随机加权**挑的：同一个人两次站上去顺序不同，而且可能一次都轮不到
 * 「抵抗」。这些断言钉的就是那件事被修掉了 —— 四个乐章按顺序各演一次，
 * `untether` 一次都排不到，被按住的时候弧线不插手，松手之后回到**当下**那一段。
 *
 * 玩法文件全是 type-only import（`acts-shape.test.ts` 已经钉住"不碰 three"），
 * 所以整条导演链可以在 node 里跑，不需要渲染器。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTS, createDirector, type World } from '../src/acts/index.ts';
import { createArc, type ArcState } from '../../core/src/arc.ts';

/** 这一场的 World，`arc` 一帧一帧被写进去（真实运行里是 main.ts 的 getter） */
type TestWorld = World & { arc: ArcState };

/** 一个最小的 World：玩法真正会碰的只有 skeleton（null = 什么都不做）与 flags */
function fakeWorld(arc: ArcState): TestWorld {
  const w = {
    t: 0,
    presence: { state: 'ALIVE' as const, elapsed: 30, transition: 1 },
    arc,
    skeleton: null,
    features: null,
    evolution: { charge: 0, tier: 0 as const, tierChanged: false, progress: 0 },
    genome: null,
    creature: {}, stage: {}, library: {}, capture: {},
    flags: { debug: false },
    rng: { next: () => 0.5, weighted: <T>(xs: readonly T[]) => xs[0] },
    morph() {}, note() {},
  };
  return w as unknown as TestWorld;
}

/** 走完一整条弧线，记下身体玩法换过哪几次 */
function playThrough(seconds = 200) {
  const arc = createArc();
  const w = fakeWorld(arc.state);
  const director = createDirector(ACTS);
  const seen: string[] = [];
  const dt = 1 / 60;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    w.arc = arc.update(true, dt);
    director.update(w, dt);
    if (seen[seen.length - 1] !== director.currentId) seen.push(director.currentId!);
  }
  return { arc, w, director, seen };
}

test('director: 四个乐章按顺序各演一次 —— 不再摇骰子', () => {
  assert.deepEqual(playThrough().seen, ['follow', 'echo', 'resist', 'facing']);
});

test('director: 同一条弧线跑两遍，顺序一模一样（此前不是）', () => {
  assert.deepEqual(playThrough().seen, playThrough().seen);
});

test('director: 「抵抗」一定轮得到 —— 那是第 III 乐章，不是一个抽到的奖', () => {
  assert.ok(playThrough().seen.includes('resist'));
});

test('director: canEnter 不再挡路 —— 乐章说了算', () => {
  // `echo` 的 canEnter 写着 tier≥2 且 ALIVE >25s。弧线在 40 秒把它推上台时
  // 一个站着不动的人 tier 还是 0 —— 旧的选角会跳过它，于是第 II 乐章根本不发生。
  const { seen } = playThrough(90);
  assert.ok(seen.includes('echo'), '第 II 乐章必须发生，哪怕观众一动不动');
});

test('director: untether 一次都排不到（docs/16 §7）', () => {
  assert.ok(!playThrough(400).seen.includes('untether'));
});

test('director: 按住之后弧线不插手；松手回到**当下**那一段，不是回到开头', () => {
  const { arc, w, director } = playThrough(100);   // 此刻是第 III 乐章「抵抗」
  assert.equal(director.currentId, 'resist');

  // 观众按下「把身体还回去」
  assert.equal(director.force('untether', w), true);
  assert.equal(director.forced, true);
  // 按住 40 秒：这期间弧线自己走过了第 III → 第 IV 的交接
  const dt = 1 / 60;
  for (let i = 0; i < Math.round(40 / dt); i++) {
    w.arc = arc.update(true, dt);
    director.update(w, dt);
  }
  assert.equal(director.currentId, 'untether', '按住期间弧线不许把它换走');

  // 拿回来 = 交回给弧线。这一刻已经走到第 IV 乐章了，就该是「朝向」
  director.release(w);
  assert.equal(director.forced, false);
  assert.equal(director.currentId, w.arc.actId);
  assert.equal(director.currentId, 'facing', '不是回到 follow —— 那是把这一场倒回去');
});

test('director: 弧线归零之后回到第 I 乐章（下一个人必须被跟随）', () => {
  const { arc, w, director } = playThrough(100);
  const dt = 1 / 60;
  for (let i = 0; i < Math.round(20 / dt); i++) {
    w.arc = arc.update(false, dt);
    director.update(w, dt);
  }
  assert.equal(w.arc.movement, 0);
  assert.equal(director.currentId, 'follow');
});
