/**
 * 会话弧线（`core/src/arc.ts` + `docs/40-SESSION-ARC.md`）。
 *
 * 这些断言钉的不是"好不好看"，是那份策展文档里**能被证伪的每一句**：
 * 四段的秒数、第一次离开落在 40 秒、走完停住、人一走就归零、
 * 站着不动的人也走得完、以及 `untether` 永远排不进来。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARC_ACTS, arcPresent, createArc, movementBounds,
} from '../src/arc.ts';
import { ARC } from '../src/tuning.ts';

/** 以固定 dt 推进这么多秒。60fps，`TIME.dtMax` 之内 */
function run(arc: ReturnType<typeof createArc>, seconds: number, present = true) {
  const dt = 1 / 60;
  let lastChanges = 0;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    const s = arc.update(present, dt);
    if (s.movementChanged) lastChanges++;
  }
  return { state: arc.state, changes: lastChanges };
}

test('arc: 四段的秒数就是 docs/40 §2 那张图（40 / 45 / 50 / 45）', () => {
  const b = movementBounds(180, ARC.beats);
  assert.deepEqual(b.map((x) => Math.round(x)), [40, 85, 135, 180]);
  // 比例不是秒数：改 total 四段一起缩放，不用动第二个数
  assert.deepEqual(movementBounds(90, ARC.beats).map((x) => Math.round(x)), [20, 42, 68, 90]);
});

test('arc: beats 全坏掉也不除以零 —— 退回等分', () => {
  const b = movementBounds(100, [0, Number.NaN, -1, 0]);
  assert.deepEqual(b, [25, 50, 75, 100]);
});

test('arc: 第一次离开发生在 40 秒 —— "随便看看"的窗口里', () => {
  const arc = createArc();
  // 39 秒：还在第 I 乐章跟随。这一条是整份文档的判据本身（docs/40 §2）
  assert.equal(run(arc, 39).state.movement, 0);
  assert.equal(arc.state.actId, 'follow');
  run(arc, 2);
  assert.equal(arc.state.movement, 1, '40 秒之后必须已经离开第 I 乐章');
  assert.equal(arc.state.actId, 'echo');
});

test('arc: 四个乐章按顺序各来一次，一次都不跳过、一次都不重复', () => {
  const arc = createArc();
  const seen: string[] = [arc.state.actId];
  const dt = 1 / 60;
  for (let i = 0; i < Math.round(200 / dt); i++) {
    const s = arc.update(true, dt);
    if (s.movementChanged) seen.push(s.actId);
  }
  assert.deepEqual(seen, ['follow', 'echo', 'resist', 'facing']);
});

test('arc: 站着不动的人也走得完 —— 这个文件里一个运动量都不读', () => {
  // `update` 的签名里没有 energy，编译期就保证了"不动也照走"。
  // 这条断言钉的是它的后果：只喂时间，弧线照样走到第 IV 乐章。
  const arc = createArc();
  run(arc, 179);
  assert.equal(arc.state.movement, 3);
  assert.equal(arc.state.tier, 3, 'tier 是乐章序号 —— 一个不动的人最后也该到 tier 3');
});

test('arc: 走完停住，不循环也不继续升级（holdAtEnd）', () => {
  const arc = createArc();
  run(arc, 300);
  const s = arc.state;
  assert.equal(s.held, true);
  assert.equal(s.movement, 3);
  assert.equal(s.overall, 1);
  assert.equal(s.elapsed, 180, '停住 = 时钟不再往前，也不回到 0');
  assert.equal(s.timeToNext, Infinity, '没有第五个乐章');
  assert.equal(s.running, false, '停住之后弧线不再"在走"');
});

test('arc: 人一走就归零 —— 但要过 ARC.resetAfter 的宽限', () => {
  const arc = createArc();
  run(arc, 100);
  assert.equal(arc.state.movement, 2);

  // 走出画面捡个东西：宽限之内回来，这一场**继续**（不该因此重开）
  run(arc, ARC.resetAfter - 1, false);
  assert.equal(arc.state.movement, 2, '宽限内不许归零');
  assert.ok(Math.abs(arc.state.elapsed - 100) < 0.05, '人不在 = 停表，不是倒退也不是继续走');
  run(arc, 1, true);
  assert.equal(arc.state.movement, 2);

  // 真的走了：宽限用完，下一个人从 0:00 开始
  const { state } = run(arc, ARC.resetAfter + 1, false);
  assert.equal(state.movement, 0);
  assert.equal(state.elapsed, 0);
  assert.equal(state.actId, 'follow');
  assert.equal(state.tier, 0);
});

test('arc: 归零那一帧要能被上层看见（justReset），而且只报一次', () => {
  const arc = createArc();
  run(arc, 60);
  const dt = 1 / 60;
  let fired = 0;
  for (let i = 0; i < Math.round(30 / dt); i++) if (arc.update(false, dt).justReset) fired++;
  assert.equal(fired, 1, '跨观众留存的状态是 bug —— 但连报三十秒也是 bug');
});

test('arc: 没人来过就不会报归零（空场不该每 8 秒清一次场）', () => {
  const arc = createArc();
  const dt = 1 / 60;
  let fired = 0;
  for (let i = 0; i < Math.round(60 / dt); i++) if (arc.update(false, dt).justReset) fired++;
  assert.equal(fired, 0);
});

test('arc: 归零不许放升档音 —— 那一帧没有人站在那里', () => {
  const arc = createArc();
  run(arc, 100);
  const dt = 1 / 60;
  let changes = 0;
  for (let i = 0; i < Math.round(20 / dt); i++) if (arc.update(false, dt).movementChanged) changes++;
  assert.equal(changes, 0, '从第 III 乐章掉回第 I 乐章不是一次"交接"');
});

test('arc: 交接是交叉淡入不是硬切，但第 I 乐章没有上一段可以淡', () => {
  const arc = createArc();
  assert.equal(arc.state.blend, 1, '开场凭空多一次淡入是错的');
  run(arc, 41);
  assert.ok(arc.state.blend > 0 && arc.state.blend < 1, `刚换段应当还在淡入，实得 ${arc.state.blend}`);
  run(arc, ARC.crossfade);
  assert.equal(arc.state.blend, 1);
});

test('arc: 段内进度与到下一段的时间是 HUD 那一行的两个数', () => {
  const arc = createArc();
  run(arc, 20);                       // 第 I 段 40 秒，走了一半
  const s = arc.state;
  assert.ok(Math.abs(s.progress - 0.5) < 0.02, `段内进度 ${s.progress}`);
  assert.ok(Math.abs(s.timeToNext - (arc.bounds[0] - 20)) < 0.2, `到下一段 ${s.timeToNext}`);
  assert.ok(Math.abs(s.overall - 20 / 180) < 0.01);
});

test('arc: ?arc=<秒> 覆盖 total，四段按比例缩放；非法值按没写过', () => {
  assert.equal(createArc({ total: 90 }).total, 90);
  assert.deepEqual(createArc({ total: 90 }).bounds.map((x) => Math.round(x)), [20, 42, 68, 90]);
  assert.equal(createArc({ total: 0 }).total, ARC.total);
  assert.equal(createArc({ total: -5 }).total, ARC.total);
  assert.equal(createArc({ total: Number.NaN }).total, ARC.total);
  assert.equal(createArc({ total: null }).total, ARC.total);

  const arc = createArc({ total: 90 });
  run(arc, 21);
  assert.equal(arc.state.movement, 1, '压到 90 秒时第一次离开在 20 秒');
});

test('arc: untether 永远排不进来 —— 它只由观众按出来（docs/16 §7）', () => {
  assert.deepEqual([...ARC_ACTS], ['follow', 'echo', 'resist', 'facing']);
  assert.ok(!(ARC_ACTS as readonly string[]).includes('untether'));
  const arc = createArc();
  const dt = 1 / 60;
  for (let i = 0; i < Math.round(400 / dt); i++) {
    assert.notEqual(arc.update(true, dt).actId, 'untether');
  }
});

test('arc: 在场判定用已有的 Presence，ENTERING 就算有人', () => {
  assert.equal(arcPresent({ state: 'ALIVE', elapsed: 1, transition: 1 }), true);
  assert.equal(arcPresent({ state: 'ENTERING', elapsed: 0.2, transition: 0.2 }), true,
    '进场那一秒半观众已经站在那儿了，停表等于把它送给上一个人');
  assert.equal(arcPresent({ state: 'LEAVING', elapsed: 0.5, transition: 0.2 }), false);
  assert.equal(arcPresent({ state: 'IDLE', elapsed: 9, transition: 0 }), false);
  assert.equal(arcPresent(null), false);
});

test('arc: 切标签页回来的那个几秒 dt 不许把弧线冲飞', () => {
  const arc = createArc();
  arc.update(true, 8);                  // 被 TIME.dtMax 钳到 1/15 秒
  assert.ok(arc.state.elapsed < 0.1, `一帧走了 ${arc.state.elapsed} 秒`);
  arc.update(true, Number.NaN);
  arc.update(true, -1);
  assert.ok(Number.isFinite(arc.state.elapsed));
});
