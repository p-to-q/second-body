/**
 * `?theseus=`（docs/44 §9）与 §10 的**第 7 条**：
 * 「`?theseus=off` 之后，行为和这一版之前逐字相同 —— 现场的 plan B 必须是真的」。
 *
 * 那一条唯一能被自动验的形式就是这个：关掉之后**一台排期器都不建**。
 * 建一台然后不用它，读起来一样，但它会在 HUD 上、在 `justReset` 上、
 * 在任何一个后来的人加的 `if` 上重新长出行为来 —— plan B 必须是"不存在"，
 * 不是"存在但闲着"。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseTheseus, readFlags } from '../src/shell/kiosk.ts';
import { makeTheseus } from '../src/creature/theseus-wire.ts';
import { formatTheseusRow } from '../src/shell/hud.ts';
import { ARC } from '../../core/src/tuning.ts';

test('theseus 开关: 默认开、倍率 1', () => {
  assert.deepEqual(readFlags('').theseus, { on: true, rate: 1 });
  assert.deepEqual(parseTheseus(null), { on: true, rate: 1 });
  assert.deepEqual(parseTheseus(''), { on: true, rate: 1 });
});

test('theseus 开关: ?theseus=off 之后一台都不建 —— plan B 是"不存在"，不是"闲着"', () => {
  const off = readFlags('?theseus=off');
  assert.deepEqual(off.theseus, { on: false, rate: 1 });
  assert.equal(makeTheseus(off, 1, ARC.total), null);
  // 反面：默认那一场确实建得起来，否则上面那条断言什么都没证明
  assert.notEqual(makeTheseus(readFlags(''), 1, ARC.total), null);
});

test('theseus 开关: ?theseus=<倍率> 当场调快慢', () => {
  assert.deepEqual(readFlags('?theseus=2').theseus, { on: true, rate: 2 });
  assert.deepEqual(readFlags('?theseus=0.5').theseus, { on: true, rate: 0.5 });
  // 倍率真的作用在排期上：快一倍 → 同样的 26 件挤在更短的时间里
  const one = makeTheseus(readFlags(''), 7, ARC.total)!;
  const fast = makeTheseus(readFlags('?theseus=3'), 7, ARC.total)!;
  assert.ok(fast.schedule[fast.schedule.length - 1] < one.schedule[one.schedule.length - 1]);
  // 但宽限不跟着缩 —— 那 20 秒是 §2 里最硬的一条，不该被一个调试旋钮吃掉
  assert.ok(fast.schedule[0] >= 20, `快三倍之后第一件落在 ${fast.schedule[0].toFixed(2)}s`);
});

test('theseus 开关: 认不出来的值按没写过处理并喊一声（和 ?arc= / ?cam= 同一条规矩）', () => {
  for (const bad of ['fast', '0', '-1', 'yes']) {
    assert.equal(parseTheseus(bad), null, `?theseus=${bad} 不该被认出来`);
  }
  const warned: string[] = [];
  const real = console.warn;
  console.warn = (...a: unknown[]) => { warned.push(String(a[0])); };
  try {
    // `?theseus=fast` 必须走默认（开），而且必须说话 ——
    // "我明明写了参数"和"参数没生效"要分得开（P21）
    assert.deepEqual(readFlags('?theseus=fast').theseus, { on: true, rate: 1 });
  } finally { console.warn = real; }
  assert.ok(warned.some((w) => w.includes('?theseus=fast')), `实得的 warn：${warned.join(' | ')}`);
});

test('theseus HUD: §7 那一行三个数都在', () => {
  const row = formatTheseusRow({
    fired: null, replaced: 12, slots: 18, events: 14, inFlight: 0,
    nextIn: 3.44, borrowDistance: 2, scale: 1, inGrace: false, justReset: false,
  });
  assert.equal(row, '12/18 · 借距 d2 · 下一件 ~3.4s');
  // 宽限里写「宽限中」而不是一个倒计时：那 20 秒不是"还没轮到"，是故意不换
  const grace = formatTheseusRow({
    fired: null, replaced: 0, slots: 18, events: 0, inFlight: 0,
    nextIn: 6, borrowDistance: 0, scale: 1, inGrace: true, justReset: false,
  });
  assert.match(grace, /0\/18 · 借距 d0 · 宽限中/);
});

/**
 * docs/40 §5 第 3 条 + docs/44 §7：升档音的挂点从**乐章交接**搬到了**每一次替换**。
 *
 * 这一条只能读源码 —— `main.ts` 会拉起 three / WebGPU / DOM，在 node 里跑不起来，
 * 而要问的本来就是"那一行写在哪儿"。读代码而不是读行为是这个仓库已有的做法
 *（`body-plans.test.ts` / `css-tokens.test.ts` 同理）。
 */
const MAIN_SRC = readFileSync(fileURLToPath(new URL('../src/main.ts', import.meta.url)), 'utf8');

test('theseus 声音: 升档音挂在替换上，不再挂在四个乐章的交接上', () => {
  // 替换那一段里必须有一声
  const swapBlock = MAIN_SRC.slice(MAIN_SRC.indexOf('swapped.set('), MAIN_SRC.indexOf('── 分档'));
  assert.ok(swapBlock.length > 0 && swapBlock.includes('sound.tierUp('),
    '每一次替换都该有一声（docs/44 §7）—— 没有它，"刚才是不是有什么变了"停在怀疑上');
  // 而乐章那两条分支里的每一声都必须被 `!theseus` 挡住：
  // 挡不住 = 同一件事响两遍，而且那四个点按 docs/44 §6 已经不是事件了
  const arcBlock = MAIN_SRC.slice(MAIN_SRC.indexOf('── 分档'), MAIN_SRC.indexOf('director.update(world'));
  const cues = arcBlock.split('\n').filter((l) => l.includes('sound.tierUp('));
  assert.ok(cues.length >= 2, '乐章那一段里原本有两声，这条测试要盯住的就是它们');
  for (const line of cues) {
    assert.match(line, /if \(!theseus\) sound\.tierUp\(/,
      `乐章那一段里还有一声没被挡住（只有 ?theseus=off 才该响）：${line.trim()}`);
  }
});
