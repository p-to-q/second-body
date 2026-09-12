/**
 * 降级与降帧自测页（dev 工具，不进现场）。
 *
 * P3 要求"降级路径必须存在且**被测试过**"。以前 safe-frame 连续出错只打一行日志，
 * 现在它真的会一级一级往下降 —— 这一页就是当场证明它的地方：
 *
 *  ① 注入一个每帧 `throw` 的 tick：每再连续错 N 帧降一级，
 *     `<html data-sb-degrade>`、`sb:degrade` 事件、注册的处理器逐级被打到。
 *     第 3 级（重载）默认换成"只记录"，否则这页会自己重载，看不到结果。
 *  ② 把"上次见到人"推到 5 分钟前：帧率应当从 ~60 掉到 ~10（IDLE.fps）。
 *     不这样做的话，验证一次无人降帧要坐等五分钟。
 */
import { createFrameLoop } from '../src/shell/safe-frame.ts';
import {
  DEGRADE_LADDER, getDegradeState, label, registerDegradeHandler,
  resetDegrade, setDegradeReloadAction,
} from '../src/shell/degrade.ts';
import { IDLE, idleState, noteActivity, notePresence, resetIdle } from '../src/shell/idle.ts';
import { mountPageHead } from '../src/ui/page.ts';

mountPageHead({
  title: '降级阶梯', titleEn: 'Degrade ladder',
  note: '帧循环炸了会不会一级一级降下去，无人时是不是真的掉到 10fps —— 当场证明，不靠"应该能跑"。',
});

const $ =<T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const statEl = $('stat');
const logEl = $('log');
const realReload = $<HTMLInputElement>('realReload');

let injecting = false;
let ticks = 0;

const log = (s: string) => {
  logEl.textContent = `${new Date().toLocaleTimeString()}  ${s}\n${logEl.textContent}`;
};

// 各级的"动作"平时由舞台/creature 注册；这里注册一份假的，好证明它们真的被调用
for (const stage of DEGRADE_LADDER) {
  registerDegradeHandler(stage, () => log(`处理器被调用：${stage} · ${label(stage)}`));
}
setDegradeReloadAction(() => {
  if (realReload.checked) { log('第 3 级：真的重载'); location.reload(); }
  else log('第 3 级：reload 被调用（本页只记录，不真的重载）');
});
addEventListener('sb:degrade', (e) => {
  const d = (e as CustomEvent<{ stage: string; reason: string | null }>).detail;
  log(`事件 sb:degrade → ${d.stage}（起因：${d.reason ?? '—'}）`);
});

// degradeAfter 调小到 5，好让一次自测在一秒内走完三级；现场默认是 30
const loop = createFrameLoop(() => {
  ticks++;
  if (injecting) throw new Error('注入的假故障：每帧都抛');
}, { degradeAfter: 5 });

loop.start();
notePresence(true);   // 先喂一个"有人"，否则降帧计时器还没启动

$('inject').onclick = () => { injecting = true; log('开始注入每帧异常'); };
$('heal').onclick = () => { injecting = false; log('停止注入（已经降过的级不会自己升回来）'); };
$('idle').onclick = () => {
  // 把"上次见到人"推到 IDLE.afterSeconds 之前 —— 等价于真的五分钟没人
  noteActivity(performance.now() - (IDLE.afterSeconds + 1) * 1000);
  log(`模拟无人 ${IDLE.afterSeconds}s`);
};
$('wake').onclick = () => { noteActivity(); log('有人来了，应当立刻回到满帧'); };
$('reset').onclick = () => {
  injecting = false;
  resetDegrade(); resetIdle(); notePresence(true);
  logEl.textContent = '';
  log('已重置');
};

setInterval(() => {
  const s = loop.stats;
  const d = getDegradeState();
  const i = idleState();
  statEl.textContent = [
    `fps            ${s.fps.toFixed(1)}${i.throttled ? `  ← 降帧中（目标 ${IDLE.fps}）` : ''}`,
    `tick 累计      ${ticks}`,
    `错误           ${s.errors}  连续 ${s.consecutiveErrors}`,
    `lastError      ${s.lastError ?? '—'}`,
    '',
    `降级级数       ${d.steps} / ${DEGRADE_LADDER.length}`,
    `当前级         ${d.stage ? `${d.stage} · ${label(d.stage)}` : '未降级'}`,
    `nopost         ${d.nopost}`,
    `placeholder    ${d.placeholder}`,
    `<html data-sb-degrade>  ${document.documentElement.dataset.sbDegrade ?? '—'}`,
    '',
    `无人已 ${i.seconds.toFixed(0)}s（阈值 ${IDLE.afterSeconds}s）`,
  ].join('\n');
}, 250);
