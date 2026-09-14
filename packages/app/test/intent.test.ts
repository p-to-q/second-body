/**
 * 观众的叠加（`shell/intent.ts`）—— "没有一个按钮能把系统锁住"的结构性证明。
 *
 * 作品负责人 2026-09-14：点任何一个按钮，要么是在上面**加一个向量**，要么是**开关一个变量**，
 * 不许把东西锁死。以前的「玩法」按钮调 `director.force()`，弧线从此不再换段；
 * 「形体」按钮写 `planOverride`，第 III 乐章的到场被跳过、而且永远赢。
 *
 * 所以这里测的是性质，不是某个按钮：
 *  1. 叠加开着的时候，弧线照走（elapsed / overall / 乐章 / 导演选的那一段）。
 *  2. 拿掉叠加 = 逐字回到"从来没有叠加过"时的行为。
 *  3. 再点一次亮着的那一项就是拿掉 —— 每一项都是自己的解除键。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createArc, ARC_ACTS, type ArcState } from '../../core/src/arc.ts';
import { speciesDrift } from '../../core/src/line.ts';
import { createDirector, type Act, type World } from '../src/acts/index.ts';
import type { ActContext } from '../src/acts/act.ts';
import {
  NO_INTENT, bodyAt, effectiveAct, intentFromFlags, lineOverlay, setOverlay, toggleOverlay, type Intent,
} from '../src/shell/intent.ts';

type TestWorld = World & { arc: ArcState; intent: Intent };

function rig(total = 20) {
  const arc = createArc({ total });
  const seen: { id: string; ctx: ActContext | undefined }[] = [];
  const acts: Act[] = ARC_ACTS.map((id) => ({
    id, label: id, kind: 'body' as const,
    update(_w: World, _dt: number, ctx?: ActContext) { seen.push({ id, ctx }); },
  }));
  const director = createDirector(acts);
  const w = { arc: arc.state, intent: NO_INTENT, flags: { debug: false } } as unknown as TestWorld;
  const step = (seconds: number) => {
    const dt = 1 / 60;
    for (let i = 0; i < Math.round(seconds / dt); i++) {
      w.arc = arc.update(true, dt);
      director.update(w, dt);
    }
  };
  return { arc, director, w, seen, step };
}

test('点一次叠加，再点一次同一个就拿掉；点另一个是换，不是叠两层', () => {
  let i: Intent = NO_INTENT;
  i = toggleOverlay(i, 'act', 'echo');
  assert.equal(i.act, 'echo');
  i = toggleOverlay(i, 'act', 'resist');
  assert.equal(i.act, 'resist');
  i = toggleOverlay(i, 'act', 'resist');
  assert.equal(i.act, undefined, '再点亮着的那一项没有拿掉叠加 —— 那就是一个锁');
  i = setOverlay(toggleOverlay(i, 'form', 'quadruped'), 'form', null);
  assert.deepEqual(i, NO_INTENT);
  assert.ok(Object.isFrozen(i) || i === NO_INTENT);
});

test('玩法叠加开着，弧线照走：时间、乐章、导演选的段都不停', () => {
  const r = rig(20);
  r.step(1);
  r.w.intent = toggleOverlay(NO_INTENT, 'act', 'facing');
  const before = r.w.arc;
  r.seen.length = 0;
  r.step(12);
  const after = r.w.arc;
  assert.ok(after.elapsed > before.elapsed + 11, `elapsed 停了：${before.elapsed} → ${after.elapsed}`);
  assert.ok(after.overall > before.overall, 'overall 停了');
  assert.ok(after.movement > before.movement, '乐章没有往前换 —— 叠加把弧线锁住了');
  assert.equal(r.director.forced, false, '叠加不许走 force');
  assert.equal(r.director.currentId, after.actId, '导演没有跟着弧线换段');
  // 线在叠加的那一点上采样（第 IV 个地名），不管导演此刻演的是哪一段
  const last = r.seen[r.seen.length - 1];
  assert.equal(last.ctx?.point, 3, '线没有在叠加的那一点采样');
  assert.equal(last.ctx?.pinned, false);
});

test('拿掉玩法叠加 = 逐字回到弧线', () => {
  const r = rig(20);
  r.w.intent = toggleOverlay(NO_INTENT, 'act', 'echo');
  r.step(3);
  r.w.intent = toggleOverlay(r.w.intent, 'act', 'echo');
  r.seen.length = 0;
  r.step(1);
  for (const s of r.seen) {
    assert.equal(s.ctx?.point ?? null, null, '拿掉之后线还在叠加的点上');
    assert.equal(s.ctx?.pinned, false);
  }
  assert.equal(lineOverlay(r.w.intent), null);
});

test('形体叠加立刻到场；拿掉之后身体回到弧线（第 III 乐章才到、按 speciesDrift 漂）', () => {
  const early = { movement: 0, overall: 0.05 } as const;
  const late = { movement: 2, overall: 0.55 } as const;
  const on = toggleOverlay(NO_INTENT, 'form', 'quadruped');
  assert.deepEqual(bodyAt(on, early), { override: 'quadruped', arrived: true, drift: 1 });
  const off = toggleOverlay(on, 'form', 'quadruped');
  assert.deepEqual(bodyAt(off, early), bodyAt(NO_INTENT, early));
  assert.deepEqual(bodyAt(off, early), { override: null, arrived: false, drift: 0 });
  assert.deepEqual(bodyAt(off, late), { override: null, arrived: true, drift: speciesDrift(0.55) });
});

test('URL 里的 ?act= / ?plan= 进来就是叠加，不是锁；「还回去」不是叠加', () => {
  assert.deepEqual(intentFromFlags({ act: 'echo', plan: null }), { act: 'echo' });
  assert.deepEqual(intentFromFlags({ act: null, plan: 'quadruped' }), { form: 'quadruped' });
  assert.deepEqual(intentFromFlags({ act: 'untether', plan: null }), NO_INTENT,
    'untether 是右下角那一行的开关（director.force），不是弧线上的一个点');
  assert.equal(effectiveAct(toggleOverlay(NO_INTENT, 'act', 'resist'), 'follow'), 'resist');
  assert.equal(effectiveAct(NO_INTENT, 'follow'), 'follow');
  assert.equal(lineOverlay(toggleOverlay(NO_INTENT, 'act', 'resist')), 2);
});
