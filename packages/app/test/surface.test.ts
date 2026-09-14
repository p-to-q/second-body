/**
 * 物质语言是审美，但「它是一条线，不是四个开关」是可测的。
 *
 * 这个文件钉住四件会坏、而且坏了看不出来的事：
 *  - **没有人调 `setArc()` 时它等于不存在**（和 `SHADING_OF_THEME` 同一条纪律）
 *  - 四条权重在整条弧线上**连续**（docs/40：段与段之间交叉淡入，不是硬切）
 *  - 每个乐章的话确实由**表面**说出来了（第 I 段没高光、第 IV 段有金属度、主色不转色相）
 *  - 灯那一层只缩放已有字段，而且**不许碰接触阴影**、不许顶破 bloom 那条 0.45 硬顶
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyArc, arcWeights, ARC_OFF, deriveLook, rgbToHsl } from '../src/stage/look.ts';
import { surfaceFor, type SurfaceSpec } from '../src/creature/surface.ts';
import { applyScene, SCENES } from '../src/stage/scenes.ts';
import { MATERIAL } from '../../core/src/tuning.ts';

/** 一块普通的哑光材质，和 `parts.json` 里那些的量级一致 */
const BASE: SurfaceSpec = {
  baseColor: [0.62, 0.55, 0.48],
  roughness: 0.68,
  metalness: 0.08,
  emissive: [0, 0, 0],
};
const TONE_L = rgbToHsl([0.62, 0.55, 0.48]).l;

const samples = Array.from({ length: 101 }, (_, i) => i / 100);

test('弧线没被调过 = 它不存在：ARC_OFF 下表面与灯都逐位不变', () => {
  const s = surfaceFor('primary', BASE, ARC_OFF, TONE_L);
  assert.equal(s, BASE, '全零权重必须原样返回同一个对象，不许"算一遍碰巧一样"');
  const look = applyScene(deriveLook(null, []), SCENES.void);
  assert.equal(applyArc(look, ARC_OFF), look);
});

test('arcWeights: 四条曲线连续 —— 相邻 1% 之间不许跳', () => {
  let prev = arcWeights(0);
  for (const a of samples.slice(1)) {
    const w = arcWeights(a);
    for (const k of ['quote', 'grow', 'diverge', 'other'] as const) {
      // 1% 的步长上最陡的 smoothstep（宽 0.34）斜率约 1.5/0.34 → 单步 < 0.05
      assert.ok(Math.abs(w[k] - prev[k]) < 0.06, `${k} 在 arc=${a} 处跳了一下（这就是"四个开关"）`);
    }
    prev = w;
  }
});

test('arcWeights: 四个乐章各自在自己那一段占优', () => {
  const at = (a: number) => arcWeights(a);
  assert.ok(at(0.05).quote > 0.85, '第 I 乐章一开始 quote 必须是主导');
  assert.ok(at(0.05).other === 0, '第 I 乐章不许有 other');
  assert.ok(at(0.42).grow > 0.95, 'grow 的峰值应该落在 growCenter');
  assert.ok(at(0.95).quote === 0 && at(0.95).grow === 0, '走到第 IV 乐章时前两段必须**精确**归零');
  assert.ok(at(1).other > 0.95 && at(1).diverge > 0.95, '弧线末端由 diverge / other 说话');
  // gain=0 是现场的那一个总闸
  const off = arcWeights(0.5, 0);
  assert.deepEqual(off, ARC_OFF, 'MATERIAL.gain=0 必须把整条线关掉');
});

test('第 I 乐章：表面不再回答环境 —— 粗糙度逼近 1、金属度被压掉', () => {
  const w = arcWeights(0.0);
  const s = surfaceFor('primary', BASE, w, TONE_L);
  // 0.88 不是随手写的：`quoteRoughMix` 只拉 85%，所以一块 0.68 的哑光件最多到 0.90。
  // 卡在 0.90 上是刀刃，调一点点 `quoteRoughness` 就红，而那不是一个 bug
  assert.ok(s.roughness > 0.88, `第 I 乐章的粗糙度是 ${s.roughness}，还留着高光就不是"被引用的数据"`);
  assert.ok(s.metalness < BASE.metalness * 0.2, '金属度是最强的"我在回答环境"，第 I 乐章要压掉');
  assert.ok(rgbToHsl(s.baseColor).s < rgbToHsl(BASE.baseColor).s, '彩度要被压一点');
  assert.deepEqual(s.emissive, [0, 0, 0], '第 I 乐章不许有自体微光 —— 那是第 II 乐章的话');
});

test('第 II 乐章：三个角色的表面分开，而且长出自体微光（zoë）', () => {
  const w = arcWeights(MATERIAL.growCenter);
  const p = surfaceFor('primary', BASE, w, TONE_L);
  const a = surfaceFor('accent', BASE, w, TONE_L);
  assert.ok(p.roughness - a.roughness > 0.2, '被造出来的东西整具一种表面，活的东西不是');
  assert.ok(a.emissive[0] > 0 && a.emissive[0] < 0.08, '微光要有，但不能变成发光体');
});

test('第 III 乐章：表面身份离开你选的那一套颜色，但主色是锚点', () => {
  const w = arcWeights(0.92);
  const p = surfaceFor('primary', BASE, w, TONE_L);
  const sec = surfaceFor('secondary', BASE, w, TONE_L);
  const acc = surfaceFor('accent', BASE, w, TONE_L);
  const h = (s: SurfaceSpec) => rgbToHsl(s.baseColor).h;
  assert.ok(Math.abs(h(p) - rgbToHsl(BASE.baseColor).h) < 1e-6, '主色一转，它就不再是观众选的那个物种');
  assert.ok(Math.abs(h(sec) - h(acc)) > 0.05, '次要色与点缀色必须真的走开');
  // 走开是有上限的 —— 再大就越过了 core/palette.ts 当初治好的那个"装错了零件"
  assert.ok(Math.abs(h(sec) - h(p)) <= MATERIAL.hueSplit + 1e-6, '色相偏移不许超过 hueSplit');
});

test('第 IV 乐章：它有了自己的物质 —— 金属度起来、粗糙度落到一个确定值', () => {
  const w = arcWeights(1);
  const s = surfaceFor('primary', BASE, w, TONE_L);
  assert.ok(s.metalness > 0.25, '第 IV 乐章的表面开始映屋子，而不是被我们的灯描述');
  assert.ok(Math.abs(s.roughness - MATERIAL.otherRoughness) < 0.2, '粗糙度该落在 otherRoughness 附近');
  assert.deepEqual(s.emissive, [0, 0, 0], '走到末端时第 II 乐章的微光必须已经收干净');
});

test('表面：整条弧线上没有任何一个数跑出 0..1，也没有一步跳变', () => {
  let prev = surfaceFor('accent', BASE, arcWeights(0), TONE_L);
  for (const a of samples.slice(1)) {
    const s = surfaceFor('accent', BASE, arcWeights(a), TONE_L);
    for (const v of [s.roughness, s.metalness, ...s.baseColor, ...s.emissive]) {
      assert.ok(v >= 0 && v <= 1, `arc=${a} 处有一个数跑出了 0..1：${v}`);
    }
    assert.ok(Math.abs(s.roughness - prev.roughness) < 0.06, `粗糙度在 arc=${a} 处跳了一下`);
    assert.ok(Math.abs(s.metalness - prev.metalness) < 0.06, `金属度在 arc=${a} 处跳了一下`);
    prev = s;
  }
});

test('灯：弧线只缩放已有字段，不碰接触阴影，也顶不破 bloom 的 0.45', () => {
  const base = applyScene(deriveLook(null, []), SCENES.backlit);
  for (const a of samples) {
    const l = applyArc(base, arcWeights(a));
    assert.equal(Object.keys(l).length, Object.keys(base).length, '弧线不许给 LookProfile 加字段');
    // 接触阴影 = "它站在地上"。一件飘起来的作品不再是屋里的一件东西（docs/26 §F）
    assert.equal(l.contactCore, base.contactCore);
    assert.equal(l.contactStrength, base.contactStrength);
    assert.equal(l.contactCoreRadius, base.contactCoreRadius);
    assert.ok(l.bloomStrength <= 0.45 + 1e-9, `arc=${a} 把 bloom 顶到了 ${l.bloomStrength}`);
    assert.ok(l.keyIntensity > 0 && l.fillIntensity > 0 && l.rimIntensity > 0);
  }
  // 第 I 乐章是翻拍台的平光：补光比轮廓光更有份量
  const one = applyArc(base, arcWeights(0));
  assert.ok(one.fillIntensity > base.fillIntensity && one.rimIntensity < base.rimIntensity);
  // 第 IV 乐章反过来：它由自己的边说明自己
  const four = applyArc(base, arcWeights(1));
  assert.ok(four.rimIntensity > base.rimIntensity && four.keyIntensity < base.keyIntensity);
});
