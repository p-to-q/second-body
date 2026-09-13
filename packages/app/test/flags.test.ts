import test from 'node:test';
import assert from 'node:assert/strict';
import { isPreviewMode, parseArcSeconds, readFlags } from '../src/shell/kiosk.ts';
import { wantsPreview } from '../src/ui/preview-state.ts';

test('flags: 默认值 —— 镜像开、其余关', () => {
  const f = readFlags('');
  assert.equal(f.mirror, true, '镜像必须默认开，现场关掉镜子就不是镜子了');
  assert.equal(f.demo, false);
  assert.equal(f.debug, false);
  assert.equal(f.theme, null);
  assert.equal(f.seed, null);
});

test('flags: ?mirror=0 是唯一能关镜像的写法', () => {
  assert.equal(readFlags('?mirror=0').mirror, false);
  assert.equal(readFlags('?mirror=1').mirror, true);
  assert.equal(readFlags('?mirror=false').mirror, true, 'mirror=false 不算 —— 只认 0，避免手滑关掉镜像');
});

test('flags: 数值参数非法时退回 null 而不是 NaN', () => {
  assert.equal(readFlags('?seed=abc').seed, null);
  assert.equal(readFlags('?seed=').seed, null);
  assert.equal(readFlags('?tier=2').tier, 2);
  assert.equal(readFlags('?seed=0').seed, 0, 'seed=0 是合法的，不能被当成假值丢掉');
});

test('flags: theme 原样透传', () => {
  assert.equal(readFlags('?theme=char.dumpling').theme, 'char.dumpling');
});

test('flags: 加载态与目录默认都在，各自有一个关掉的写法', () => {
  const f = readFlags('');
  assert.equal(f.loading, true, '默认要有加载态 —— 黑屏才是那个被修掉的 bug');
  assert.equal(f.nav, true);
  assert.equal(readFlags('?loading=0').loading, false);
  assert.equal(readFlags('?nav=0').nav, false);
});

test('flags: ?preview= 认不出来的值不该静默变成某一档', () => {
  // 和 `?scene=` / `?shading=` / `?cam=` 同一条规矩：认不出来 = 当没写过。
  // `?preview=1` 是最容易手滑的那一种 —— 全站别的开关都是 `=1`，
  // 它要是被猜成 'on'，那"我写了参数"和"参数没生效"就永远分不开了。
  assert.ok(isPreviewMode('on'));
  assert.ok(isPreviewMode('off'));
  assert.ok(!isPreviewMode('On'));
  assert.ok(!isPreviewMode('1'));
  assert.ok(!isPreviewMode('yes'));
  assert.ok(!isPreviewMode('toString'), '原型链上的键不能被当成合法值');
  assert.ok(!isPreviewMode(null));

  assert.equal(readFlags('').preview, null);
  assert.equal(readFlags('?preview=on').preview, 'on');
  assert.equal(readFlags('?preview=off').preview, 'off');
  assert.equal(readFlags('?preview=1').preview, null, '?preview=1 等于没写');
});

test('flags: 那块小屏幕 —— 回放永不挂、现场默认不挂、网页默认挂', () => {
  // 回放没有摄像头。一块播着录像、边框安静的屏幕是在撒谎（P21），
  // 所以 `?demo=1` 连强制开都不认 —— 这一条比 `?preview=on` 硬。
  assert.equal(wantsPreview(readFlags('?demo=1')), false);
  assert.equal(wantsPreview(readFlags('?demo=1&preview=on')), false, '回放下强制开也不挂');

  // 现场：装置画面上不该多出一个网页组件（docs/23 §S4），但场地要得到它
  assert.equal(wantsPreview(readFlags('?kiosk=1')), false);
  assert.equal(wantsPreview(readFlags('?kiosk=1&preview=on')), true);

  // 网页版：默认挂 —— 那里的观众连该不该按那个按钮都不知道
  assert.equal(wantsPreview(readFlags('')), true);
  assert.equal(wantsPreview(readFlags('?preview=off')), false);
  // 认不出来的值 = 当没写过，于是落回默认，而不是落进某一档
  assert.equal(wantsPreview(readFlags('?preview=1')), true);
  assert.equal(wantsPreview(readFlags('?kiosk=1&preview=1')), false);
});

test('flags: 现场模式下目录自动消失，不需要再写一个参数', () => {
  // 装置画面上不该挂网站导航。这条判断只有 readFlags 一处，
  // 各挂载点不许自己再判一次 —— 否则总有一处会漏。
  assert.equal(readFlags('?kiosk=1').nav, false);
  assert.equal(readFlags('?kiosk=1').loading, true, '现场照样要有加载态：黑屏在现场更致命');
});

test('flags: ?wave= 只认 on / off，认不出来的值 = 当没写过', () => {
  // 和 ?scene= / ?shading= / ?cam= 同一条规矩：手滑写的参数**不许静默生效**，
  // 也不许静默变成"我以为我关掉了"。null 的意思是"这条参数没被认出来"，
  // 默认走哪条由消费者（main.ts）决定并把结论打印出来。
  assert.equal(readFlags('').wave, null, '没写就是 null');
  assert.equal(readFlags('?wave=on').wave, 'on');
  assert.equal(readFlags('?wave=off').wave, 'off');
  assert.equal(readFlags('?wave=1').wave, null, '?wave=1 不算 —— 它读起来像"开"，但我们没认');
  assert.equal(readFlags('?wave=yes').wave, null);
  assert.equal(readFlags('?wave=').wave, null);
  assert.equal(readFlags('?wave=OFF').wave, null, '大小写不宽容：只有一种写法能关掉它');
});

test('flags: ?wave= 的默认不是"关" —— 现场没有输入设备，关掉等于没有这一条', () => {
  // 这条钉的是**默认值本身**，它是一个判断不是一个实现细节：
  // 现场（?kiosk=1）一件输入设备都没有，默认关掉的话观众只能等 30 秒被随机塞一具身体。
  assert.notEqual(readFlags('?kiosk=1').wave, 'off');
  assert.notEqual(readFlags('').wave, 'off');
});

test('flags: ?arc=<秒> 只认大于 0 的秒数，认不出来的值 = 当没写过', () => {
  // 和 ?scene= / ?wave= / ?exits= 同一条规矩：手滑写的参数**不许静默生效**。
  // 这一条在 ?arc= 上格外硬：现场有人把弧线压到 90 秒讲解，参数没生效的话
  // HUD 上那一行照常在走，他读到的是"弧线错了"而不是"参数错了"（P21）。
  assert.equal(parseArcSeconds('90'), 90);
  assert.equal(parseArcSeconds('45.5'), 45.5);
  assert.equal(parseArcSeconds('abc'), null);
  assert.equal(parseArcSeconds('0'), null, '零秒的弧线不是一条弧线');
  assert.equal(parseArcSeconds('-30'), null);
  assert.equal(parseArcSeconds(''), null, 'Number("") === 0 是那个经典陷阱');
  assert.equal(parseArcSeconds(null), null);

  assert.equal(readFlags('').arc, null, '没写就是 null —— 走 ARC.total');
  assert.equal(readFlags('?arc=90').arc, 90);
  assert.equal(readFlags('?arc=300').arc, 300);
  assert.equal(readFlags('?arc=abc').arc, null);
  assert.equal(readFlags('?arc=0').arc, null);
});
