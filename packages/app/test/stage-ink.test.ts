import test from 'node:test';
import assert from 'node:assert/strict';
import { NEUTRAL_LOOK, STAGE_INK, overlayGroundLuma, stageInk } from '../src/stage/look.ts';
import { SCENE_IDS, SCENES, applyScene } from '../src/stage/scenes.ts';

/**
 * 叠在画面上的字，**翻到哪一侧**。
 *
 * ## 这个文件为什么存在
 *
 * `publishStageInk()` 原来读的是 `look.bgBottom`。那个字段**不是角上的底色** ——
 * `applyScene` 把它设成 `skyGlow`，也就是身体背后那团晕的颜色，
 * 画面里**最亮的那一块**，而且它长在正中。字不坐在那里，字坐在两个角上。
 *
 * 实测（1600×900，porcelain，dev/stage.html，帧在 `scratch/evidence/`）：
 * 「夜潮」和「逆光」的晕是亮的（bgBottom 线性亮度 0.59 / 0.60），
 * 于是那条 `< 0.18` 判成"亮底"、发深色墨；可两个角上真正的像素是
 * 0.0013 ~ 0.033 —— 近乎全黑。深墨压在黑上，对比度 1.0:1 ~ 1.4:1，
 * 而另一侧本来能拿到 9.3:1 ~ 15.1:1。**那一行字在现场是看不见的。**
 *
 * 阈值从来不是错的那一半：两套墨对比度相等的交点实算是 0.176（原来这里写 0.166，
 * 喂错了两个墨的亮度；`test/ink-regions.test.ts` 按定义量它），
 * 0.18 就在旁边。错的是**喂给它的那个像素**。
 *
 * 这个文件钉的是**场景兜底**那一份。角上的字平时按底下渲染出来的像素翻
 * （`stage/ink-regions.ts`），读不到像素时才退回这里。
 *
 * 所以这个文件钉的是"喂进去的是不是角上那块底"，用的是**实测数字**，
 * 不是又一遍同样的推导 —— 推导错了，跟着它写的断言也会一起错。
 */

/** sRGB 十六进制 → 相对亮度（WCAG 的算法） */
function srgbLuma(hex: string): number {
  const n = hex.length === 4
    ? [hex[1] + hex[1], hex[2] + hex[2], hex[3] + hex[3]]
    : [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)];
  const [r, g, b] = n.map((h) => {
    const v = parseInt(h, 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contrast = (a: number, b: number): number =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/**
 * 2026-09-13 实测：五套场景 × 弧线 0 / 0.35 / 0.65 / 1.0，
 * 量的是**右上角节题**（1423,24 153×78）和**左下角那一行**（48,805 300×47）
 * 底下的画布像素，sRGB 相对亮度，取区域均值里最坏的那一个。
 *
 * 场景换了颜色、或者加了第六套，这张表就过期了 —— 重新量，别照着改。
 */
const MEASURED: Record<string, { worst: number; best: number }> = {
  // 角上最暗的一格 / 最亮的一格（两个角、四个弧线点合起来取极值）
  paper: { worst: 0.8808, best: 0.9216 },
  gallery: { worst: 0.3832, best: 0.4119 },
  void: { worst: 0.0008, best: 0.0162 },
  tide: { worst: 0.0017, best: 0.0326 },
  backlit: { worst: 0.0013, best: 0.0210 },
};

test('舞台墨色：五套场景都翻到对比度更高的那一侧', () => {
  const onDark = srgbLuma(STAGE_INK.onDark.on);
  const onLight = srgbLuma(STAGE_INK.onLight.on);
  const wrong: string[] = [];
  for (const id of SCENE_IDS) {
    const look = applyScene(NEUTRAL_LOOK, SCENES[id]);
    const m = MEASURED[id];
    assert.ok(m, `${id} 没有实测数据 —— 新场景必须先量再进这张表`);
    const picked = stageInk(look);
    // 两个角、四个弧线点里**最坏的那一格**也必须站在对的一侧
    for (const bg of [m.worst, m.best]) {
      const crPicked = contrast(srgbLuma(picked.on), bg);
      const crOther = contrast(picked === STAGE_INK.onDark ? onLight : onDark, bg);
      if (crPicked < crOther) {
        wrong.push(`${id} 底=${bg} 选了 ${picked.on}（${crPicked.toFixed(2)}:1），`
          + `另一侧本来是 ${crOther.toFixed(2)}:1`);
      }
    }
  }
  assert.deepEqual(wrong, [], `翻错了：\n${wrong.join('\n')}`);
});

test('舞台墨色：最坏的一格也过 WCAG AA 大字号的 3:1', () => {
  const thin: string[] = [];
  for (const id of SCENE_IDS) {
    const look = applyScene(NEUTRAL_LOOK, SCENES[id]);
    const cr = contrast(srgbLuma(stageInk(look).on), MEASURED[id].worst);
    if (cr < 3) thin.push(`${id} 只有 ${cr.toFixed(2)}:1`);
  }
  assert.deepEqual(thin, [], `对比度不够：\n${thin.join('\n')}`);
});

test('舞台墨色：喂进去的是角上那块底，不是正中那团晕', () => {
  // 这一条是上面两条的"为什么"。它直接钉住输入，
  // 免得将来有人把 overlayGroundLuma 改回 bgBottom 而上面两条恰好还过。
  for (const id of SCENE_IDS) {
    const look = applyScene(NEUTRAL_LOOK, SCENES[id]);
    assert.equal(
      overlayGroundLuma(look),
      0.2126 * look.skyTop[0] + 0.7152 * look.skyTop[1] + 0.0722 * look.skyTop[2],
      `${id} 的覆盖层底色取错了字段`,
    );
  }
  // 「夜潮」是这件事最尖的那个例子：晕亮、角黑，两者差两个数量级
  const tide = applyScene(NEUTRAL_LOOK, SCENES.tide);
  const glow = 0.2126 * tide.bgBottom[0] + 0.7152 * tide.bgBottom[1] + 0.0722 * tide.bgBottom[2];
  assert.ok(glow > 0.5, `夜潮的晕应该是亮的，实际 ${glow}`);
  assert.ok(overlayGroundLuma(tide) < 0.02, '夜潮的角应该是暗的');
});

test('舞台墨色：两套墨互为反面，缺一侧就等于写死在一种底上', () => {
  for (const k of ['on', 'dim', 'strong'] as const) {
    assert.notEqual(STAGE_INK.onDark[k], STAGE_INK.onLight[k], `${k} 两侧一样，没翻`);
  }
  assert.ok(srgbLuma(STAGE_INK.onDark.on) > srgbLuma(STAGE_INK.onLight.on),
    '暗底上的墨应该比亮底上的墨浅');
});
