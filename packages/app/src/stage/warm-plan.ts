/**
 * 什么时候在空闲里把**直出**那条渲染路编译一遍（docs/48 §10）。纯的：时间和状态全部由调用方给。
 *
 * ## 为什么需要
 *
 * 后期开着的时候，每一块材质只在后期那一趟（单采样 + MRT 的渲染目标）里编译过。
 * 直出（画布，MSAA）是另一个渲染上下文 —— 另一批管线。调速器放下「后期」那一帧才第一次用到它，
 * 于是"救火"的那一下自己就是一次长任务：实测强制 L4 时 273ms，1.3 秒后又一次 367ms（B-gov）。
 * 修法不是让调速器更犹豫，而是**让拨开关只剩切换**：在没人需要主线程的时候，先把直出编好。
 *
 * ## 规则
 *
 * - 只在后期开着时编：后期关着时直出就是正在画的那一条，没什么可预先编的。
 * - 身体上画着的桶（部件 × 左右 × 材质）变了才需要重编；变化要**稳定** `WARM.settleMs` 才编 ——
 *   换件那几百毫秒里桶会出现又消失，编那些中间态是白花钱。
 * - 画面在丢帧时不编（`calm` 由调用方给）：在最卡的时候加活，正是这件事要防的。
 * - 两次开编至少隔 `WARM.minGapMs`；同一份内容连续失败 `WARM.maxFailures` 次就不再试
 *   （退回这一版之前的行为：拨开关时现编译）。
 */
import { WARM } from '../../../core/src/tuning.ts';

export interface WarmInput {
  /** 后期此刻开着（直出不是正在画的那条） */
  postOn: boolean;
  /** 最近没有丢帧、没有长任务 */
  calm: boolean;
}

export interface WarmPlan {
  /** 身体上的桶集合换了一个版本号（调用方每帧报一次都行，同一个版本不重置稳定计时） */
  note(version: number, now: number): void;
  /** 此刻该不该开编 */
  next(now: number, input: WarmInput): boolean;
  started(now: number): void;
  finished(now: number, ok: boolean): void;
  /** 当前版本是否已经编过（HUD / 测试用） */
  readonly warm: boolean;
}

export function createWarmPlan(): WarmPlan {
  let version = Number.NaN;
  let changedAt = -Infinity;
  let warmed = Number.NaN;
  let running = false;
  let runningVersion = Number.NaN;
  let lastStart = -Infinity;
  let failures = 0;
  let failedVersion = Number.NaN;

  return {
    note(v, now) {
      if (v === version) return;
      version = v;
      changedAt = now;
    },

    next(now, { postOn, calm }) {
      if (running || !postOn || !calm) return false;
      if (Number.isNaN(version) || version === warmed) return false;
      if (failedVersion === version && failures >= WARM.maxFailures) return false;
      if (now - changedAt < WARM.settleMs) return false;
      return now - lastStart >= WARM.minGapMs;
    },

    started(now) {
      running = true;
      runningVersion = version;
      lastStart = now;
    },

    finished(_now, ok) {
      running = false;
      if (ok) {
        warmed = runningVersion;
        failures = 0;
        failedVersion = Number.NaN;
        return;
      }
      if (failedVersion !== runningVersion) { failedVersion = runningVersion; failures = 0; }
      failures++;
    },

    get warm() { return version === warmed; },
  };
}
