/**
 * 主题微调是**主观**的（docs/11 T-09 的验收就写着"让第二个人看"），
 * 但"porcelain 偏冷白、patrol 偏工业暖黄"这句话是**可测的**：
 * 只要把它翻译成"key 灯的蓝通道比红通道高/低多少"。
 *
 * 这个文件存在的理由：把 docs/12 §6 那一行要求钉死，
 * 以后谁调 look.ts 的公式，六个主题的气质跑偏了会立刻红。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deriveLook, hslToRgb, linearToSrgb, luminance, rgbToHsl, srgbToLinear } from '../src/stage/look.ts';
import type { MaterialDef, PartLibraryIndex, ThemeDef } from '../../core/src/types.ts';

const PARTS = fileURLToPath(new URL('../../../assets/parts/parts.json', import.meta.url));

let index: PartLibraryIndex | null = null;
try {
  index = JSON.parse(readFileSync(PARTS, 'utf8')) as PartLibraryIndex;
} catch {
  index = null;      // parts.json 可以不存在（ADR-4）。那就只跑不依赖它的用例。
}

const themeOf = (id: string): ThemeDef | null => index?.themes.find((t) => t.id === id) ?? null;
const materials = (): MaterialDef[] => index?.materials ?? [];

/**
 * key 灯的"暖度"：红通道减蓝通道，**在 sRGB 里量**。正 = 暖，负 = 冷。
 * 用 sRGB 而不是线性：阈值要对应"人看上去有多暖"，线性值在高亮端会把差别放大成假象。
 */
const warmthOf = (id: string): number => {
  const t = themeOf(id);
  assert.ok(t, `parts.json 里没有主题 ${id}`);
  const k = deriveLook(t, materials()).key;
  return linearToSrgb(k[0]) - linearToSrgb(k[2]);
};

test('look: 六个主题的气质 —— docs/12 §6 那一行的可执行版本', { skip: !index }, () => {
  const porcelain = warmthOf('porcelain');
  const industrial = warmthOf('industrial');
  const patrol = warmthOf('patrol');
  const xeno = warmthOf('xeno');
  const coral = warmthOf('coral');
  const field = warmthOf('field');

  assert.ok(patrol > 0.08, `patrol 必须偏工业暖黄，实际 warmth=${patrol.toFixed(4)}`);
  assert.ok(xeno < -0.03, `xeno 必须偏冷蓝，实际 warmth=${xeno.toFixed(4)}`);
  assert.ok(porcelain < -0.03, `porcelain 必须偏冷白，实际 warmth=${porcelain.toFixed(4)}`);
  assert.ok(coral > 0.012, `coral 必须偏骨白（暖），实际 warmth=${coral.toFixed(4)}`);
  assert.ok(Math.abs(industrial) < 0.02, `industrial 必须接近中性灰，实际 warmth=${industrial.toFixed(4)}`);
  assert.ok(Math.abs(field) < 0.01, `field 必须无色，实际 warmth=${field.toFixed(4)}`);

  // 顺序关系比绝对值更耐调参：patrol 是最暖的，porcelain 比 industrial 冷
  assert.ok(patrol > coral && coral > industrial, 'patrol > coral > industrial 的暖度次序');
  assert.ok(porcelain < industrial, 'porcelain 必须比 industrial 冷');
});

test('look: porcelain 走的是"亮而无彩→冷白"那条规则，不是色相', { skip: !index }, () => {
  const L = deriveLook(themeOf('porcelain'), materials());
  assert.ok(L.coolBias > 0.4, `coolBias=${L.coolBias.toFixed(2)} 太低，冷白不是靠亮度规则来的`);
  assert.equal(L.hueWeight, 0, 'porcelain 的颜料几乎无彩，色相不该进灯里');
});

test('look: xeno 走的是蓝黄轴，HSL 彩度在这种暗色上会塌掉', { skip: !index }, () => {
  const L = deriveLook(themeOf('xeno'), materials());
  assert.ok(L.temperature < -0.15, `xeno 的蓝黄轴应为负，实际 ${L.temperature.toFixed(2)}`);
  assert.ok(L.coolBias === 0, 'xeno 太暗，不该吃"亮而无彩"那条规则');
});

test('look: 23 个 roster 条目全部推得出合法数值（不许 NaN / 不许纯黑）', { skip: !index }, () => {
  for (const t of index!.themes) {
    const L = deriveLook(t, materials());
    const all = [...L.key, ...L.fill, ...L.rim, ...L.sky, ...L.groundNear, ...L.bgBottom, ...L.particle,
      L.keyIntensity, L.exposure, L.bloomStrength, L.aoStrength];
    for (const v of all) assert.ok(Number.isFinite(v) && v >= 0, `${t.id} 推出了非法值 ${v}`);
    assert.ok(luminance(L.key) > 0.3, `${t.id} 的主光太暗了`);
    // 空场不能黑屏（docs/05 §5）：背景与地面必须始终有亮度
    assert.ok(luminance(L.bgBottom) > 0.004, `${t.id} 的背景接近纯黑 —— 观众会以为坏了`);
    assert.ok(luminance(L.groundNear) > luminance(L.bgBottom), `${t.id} 的地面应比背景亮`);
    assert.deepEqual(L.groundFar, L.bgBottom, `${t.id} 的地面远端必须正好等于背景，否则圆盘边会露出地平线`);
  }
});

test('look: 没有主题时给中性影棚，不抛异常', () => {
  const L = deriveLook(null, []);
  assert.ok(Number.isFinite(L.keyIntensity));
  assert.ok(Math.abs(L.key[0] - L.key[2]) < 0.12, '无主题时应接近中性');
});

test('look: 色彩工具函数是自洽的', () => {
  assert.ok(Math.abs(srgbToLinear(1) - 1) < 1e-6);
  assert.ok(Math.abs(srgbToLinear(0) - 0) < 1e-9);
  const hsl = rgbToHsl([0.86, 0.68, 0.13]);
  assert.ok(hsl.h > 0.08 && hsl.h < 0.2, `危险黄的色相应该落在黄色带，实际 ${hsl.h.toFixed(3)}`);
  const back = hslToRgb(hsl.h, hsl.s, hsl.l);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(back[i] - [0.86, 0.68, 0.13][i]) < 1e-6, 'hsl 往返必须无损');
});
