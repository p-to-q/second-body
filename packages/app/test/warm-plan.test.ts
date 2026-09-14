/**
 * 预编译直出那条路（docs/48 §10）：调速器放下「后期」那一帧不许是第一次用直出管线。
 *
 * 实测（B-gov，强制 L4）：关后期那一帧 273ms、1.3 秒后又一次 367ms，全在帧循环里 ——
 * 直出那条管线开机以来从没被用过，在拨开关的那一帧现编译。
 * 这张计划表回答一件事：**此刻要不要在空闲里把直出那条路编译一遍**。纯的，时间由调用方给。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWarmPlan } from '../src/stage/warm-plan.ts';
import { WARM } from '../../core/src/tuning.ts';

const calm = { postOn: true, calm: true };

test('预编译: 后期开着、内容稳定够久、画面不忙 → 编译直出；同一份内容只编一次', () => {
  const p = createWarmPlan();
  p.note(1, 0);
  assert.equal(p.next(WARM.settleMs - 1, calm), false, '内容刚变就编：换件那一串中间态会被编成一堆没人用的管线');
  assert.equal(p.next(WARM.settleMs, calm), true);
  p.started(WARM.settleMs);
  assert.equal(p.next(WARM.settleMs + 10, calm), false, '上一次还在跑');
  p.finished(WARM.settleMs + 500, true);
  assert.equal(p.next(WARM.settleMs + 60_000, calm), false, '同一份内容编过了');
});

test('预编译: 内容变了（新桶出现）→ 稳定之后再编一次', () => {
  const p = createWarmPlan();
  p.note(1, 0);
  p.started(WARM.settleMs); p.finished(WARM.settleMs + 100, true);
  const t = WARM.settleMs + WARM.minGapMs;   // 已经过了开编间隔：这条只看稳定
  p.note(2, t);
  p.note(3, t + WARM.settleMs / 2);    // 还在变
  assert.equal(p.next(t + WARM.settleMs, calm), false, '稳定时间从最后一次变化算起');
  assert.equal(p.next(t + WARM.settleMs * 1.5, calm), true);
});

test('预编译: 后期关着（直出就是正在画的那条）/ 画面在忙 → 不编', () => {
  const p = createWarmPlan();
  p.note(1, 0);
  const t = WARM.settleMs * 2;
  assert.equal(p.next(t, { postOn: false, calm: true }), false);
  assert.equal(p.next(t, { postOn: true, calm: false }), false, '在丢帧的时候加活，是它要防的那件事本身');
  assert.equal(p.next(t, calm), true);
});

test('预编译: 两次开编至少隔 minGapMs；失败了退避、有上限，不在帧循环里反复重试', () => {
  const p = createWarmPlan();
  p.note(1, 0);
  let t = WARM.settleMs;
  let starts = 0;
  for (let i = 0; i < 100; i++, t += 1000) {
    if (p.next(t, calm)) { starts++; p.started(t); p.finished(t + 10, false); }
  }
  assert.ok(starts <= WARM.maxFailures, `失败 ${starts} 次还在重试（上限 ${WARM.maxFailures}）`);
  assert.ok(WARM.minGapMs > WARM.settleMs * 2, '这条测试假设间隔比稳定时间长');
  const q = createWarmPlan();
  const t0 = WARM.settleMs;
  q.note(1, 0); q.started(t0); q.finished(t0 + 1, true);
  q.note(2, t0 + 2);
  assert.equal(q.next(t0 + 2 + WARM.settleMs, calm), false, '离上一次开编不到 minGapMs');
  assert.equal(q.next(t0 + WARM.minGapMs, calm), true);
});
