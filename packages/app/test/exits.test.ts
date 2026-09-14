/**
 * 右下角那一列里**不碰 DOM 的那两块**：回大厅那个 URL，和 `?exits=` 的三态。
 *
 * 为什么值得有测试：这两块各自都有一个"坏了也看不出来"的失败形状（docs/02 P21）。
 *
 *  1. `hallSearch()` 少带一个参数，页面照常回到选择页 —— **屏幕上完全正常**。
 *     要等到有人演示时先调好夜潮 + 抵抗、再回大厅换个物种，才发现那一屏没了。
 *     这个仪表问的正是"如果它少带了，我看得见吗"。
 *  2. `?exits=yes` 如果被静默当成"开"，现场那台无人值守的机器上就会多出
 *     一行「回到大厅」，而写参数的人以为自己把它关掉了。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { hallSearch } from '../src/ui/exits-url.ts';
import type { ControlValues } from '../src/ui/control-table.ts';
import { parseExits, readFlags } from '../src/shell/kiosk.ts';

const STATE: ControlValues = {
  species: 'xeno',
  form: 'quadruped',
  scene: 'tide',
  act: 'resist',
  outline: true,
  vitality: false,
  refine: true,
  post: false,
  sound: false,
};

const params = (search: string, s: ControlValues = STATE): URLSearchParams =>
  new URLSearchParams(hallSearch(search, s));

test('回大厅: theme 必须被删掉 —— 留着它重载会直接跳过选择页，按钮等于没用', () => {
  const q = params('?theme=xeno&plan=quadruped');
  assert.equal(q.get('theme'), null);
  assert.equal(q.get('plan'), null, '形体叠加是这一个人按的，不能带到下一个物种头上');
});

test('回大厅: 这一屏怎么演的全部状态一条不少地带过去', () => {
  // 这是 `ui/controls.ts` 文件头第 2 条的结论，反方向用一次：
  // 重载是为了重新选物种，不是为了重置演示。
  const q = params('?theme=xeno');
  assert.equal(q.get('scene'), 'tide');
  assert.equal(q.get('act'), 'resist', '开着的玩法叠加照常带走');
  assert.equal(q.get('vitality'), '0');
  assert.equal(q.get('refine'), '1');
  assert.equal(q.get('nopost'), '1', 'post 关着 → 必须写 ?nopost=1');
  assert.equal(q.get('mute'), '1');
});

test('回大厅: 开着的那几项不留垃圾参数（nopost / mute 是"有才写"）', () => {
  const q = params('?nopost=1&mute=1', { ...STATE, post: true, sound: true });
  assert.equal(q.get('nopost'), null);
  assert.equal(q.get('mute'), null);
});

test('回大厅: 没有叠加时不写 act，而且把地址栏里旧的 act= 删掉', () => {
  // 以前这里写的是"弧线此刻在演的那一段"—— 于是回大厅之后下一个人的弧线被钉在那一段。
  const q = params('?act=echo', { ...STATE, act: null });
  assert.equal(q.get('act'), null);
  assert.ok(!hallSearch('', { ...STATE, act: null }).includes('act='));
});

test('回大厅: 「归还」这一场不许被带回大厅', () => {
  // 实测踩到过：还着身体的时候按「回到大厅」，URL 里躺着 act=untether，
  // 于是**下一个观众选完物种，身体根本不跟他** —— 他只会以为这件作品坏了。
  const q = params('?act=untether', { ...STATE, act: 'untether' });
  assert.equal(q.get('act'), null);
});

test('回大厅: 描述"这台机器怎么开机"的参数原样留着', () => {
  // kiosk / debug / demo / cam / exits 不是这一屏的演法，是这台机器的开机方式。
  const q = params('?kiosk=1&debug=1&cam=b7c19e04&exits=1&theme=xeno');
  assert.equal(q.get('kiosk'), '1');
  assert.equal(q.get('debug'), '1');
  assert.equal(q.get('cam'), 'b7c19e04');
  assert.equal(q.get('exits'), '1');
});

test('exits: 三态解析 —— "写了 0" 和 "认不出来" 不是一回事', () => {
  assert.equal(parseExits('1'), true);
  assert.equal(parseExits('0'), false);
  assert.equal(parseExits(null), null, '没写 = null，由调用方决定默认');
  assert.equal(parseExits('yes'), null);
  assert.equal(parseExits('true'), null);
  assert.equal(parseExits(''), null);
});

test('exits: 默认开；现场默认关；两边都能显式覆盖', () => {
  assert.equal(readFlags('').exits, true);
  assert.equal(readFlags('?exits=0').exits, false);
  // 无人值守的装置不该向公众提供「回到大厅」—— 第一个人按一下走开，后面全是选择页
  assert.equal(readFlags('?kiosk=1').exits, false);
  // 有人看着的现场（讲解 / 评审）要它的话，显式打开
  assert.equal(readFlags('?kiosk=1&exits=1').exits, true);
});

test('exits: 认不出来的值不静默生效，也不静默关掉（和 ?scene= / ?cam= 同一条规矩）', () => {
  assert.equal(readFlags('?exits=yes').exits, true, '别处认不出来 = 当没写过 = 默认开');
  assert.equal(readFlags('?kiosk=1&exits=true').exits, false, '现场认不出来 = 当没写过 = 默认关');
});
