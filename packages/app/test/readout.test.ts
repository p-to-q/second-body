/**
 * 左下角那块读数的判据（`ui/readout-state.ts`）。
 *
 * 这个文件盯的是**一种在屏幕上看不出来的错**：一个格式化好的数字和一个
 * 格式化好的谎话长得一模一样。空场里留着上一个观众的动能、
 * 模型不报逐点置信度时写成 `0/33`、NaN 被 `toFixed` 变成 `NaN` 甚至 `0.00` ——
 * 这四种坏法在屏幕上都读作"一切正常"（docs/02 P21）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ABSENT, readOut, visibleJoints, wantsReadout } from '../src/ui/readout-state.ts';
import { isReadoutMode, readFlags, type Flags } from '../src/shell/kiosk.ts';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NEUTRAL_LOOK, overlayGroundLuma, stageInk } from '../src/stage/look.ts';
import { SCENE_IDS, SCENES, applyScene } from '../src/stage/scenes.ts';
import type { Landmark, MotionFeatures, RawPose } from '../../core/src/types.ts';

const FEATURES: MotionFeatures = {
  speed: 0.21, energy: 0.0423, expansiveness: 0.376,
  verticality: 0.45, symmetry: 0.3, jerk: 1.2, stillness: 0.1,
};

/** n 个点，每个点的 visibility 由 vis 给 */
const pose = (score: number, vis: readonly number[] | null, n = 33): RawPose => ({
  world: Array.from({ length: n }, (_, i): Landmark => ({
    x: 0, y: 0, z: 0,
    ...(vis ? { visibility: vis[i] ?? vis[vis.length - 1] } : {}),
  })),
  score,
  t: 0,
});

test('readout: 没有人的时候，除了推理频率全是破折号', () => {
  // 这一条是这个文件存在的头号理由：`lastFeatures` 在没人时留着上一个观众的数，
  // 照常显示出来，屏幕上就会出现"空场里有人在动"。
  const r = readOut({ pose: null, features: FEATURES, inferenceHz: 31 });
  assert.equal(r.present, false);
  assert.equal(r.values.energy, ABSENT, '没人的时候不许显示上一个人的动能');
  assert.equal(r.values.extent, ABSENT);
  assert.equal(r.values.confidence, ABSENT);
  assert.equal(r.values.joints, ABSENT);
  assert.equal(r.values.inference, '31 Hz', '推理是机器自己的节拍，空场里它照样在跑');
});

test('readout: score 压线 —— 判据和 main.ts 的 detected 是同一条', () => {
  // CAPTURE.minScore = 0.5，严格大于才算有人（和 `preview-state.seeState` 逐字相同）
  assert.equal(readOut({ pose: pose(0.5, [0.9]), features: FEATURES, inferenceHz: 30 }).present, false);
  assert.equal(readOut({ pose: pose(0.51, [0.9]), features: FEATURES, inferenceHz: 30 }).present, true);
});

test('readout: 有人的时候五个数按位数写出来', () => {
  const r = readOut({ pose: pose(0.873, [0.9]), features: FEATURES, inferenceHz: 30.6 });
  assert.equal(r.present, true);
  assert.equal(r.values.confidence, '0.87');
  assert.equal(r.values.joints, '33/33');
  assert.equal(r.values.inference, '31 Hz', 'Hz 取整 —— 小数位在这一行没有任何信息');
  assert.equal(r.values.energy, '0.042', '动能三位：两位的话站着不动和缓慢挥手是同一个数');
  assert.equal(r.values.extent, '0.376', '舒展实测会超过 types.ts 注释里那个 0.2..0.8，所以它也按量级缩');
});

test('readout: 动能跨量级时自己减小数位 —— 实测挥手是 1.955，不是 0.0x', () => {
  // 上一版写死三位，注释里按 tuning 的阈值猜成 1e-2 量级。`?demo=1` 一跑就是 1.955，
  // 而猜错的精度在小的那一端刚好也说得通，所以它在屏幕上不露馅（P21）。
  const at = (energy: number) =>
    readOut({ pose: pose(0.9, [0.9]), features: { ...FEATURES, energy }, inferenceHz: 30 }).values.energy;
  assert.equal(at(0.018), '0.018', '站着不动的人也要读得出差别');
  assert.equal(at(1.955), '1.955');
  assert.equal(at(12.3456), '12.35');
  assert.equal(at(123.456), '123.5');
  assert.equal(at(1234.5), '1235');
});

test('readout: 模型不报逐点置信度 → 关节写破折号，不写 0/33', () => {
  // `capture/webcam.ts` 的 overallScore()：有些版本 visibility 恒为 0 或者没有，
  // 那时 score 被记成 1。照抄成 0/33 会在同一块面板上出现
  // 「置信 1.00 / 关节 0/33」—— 同一份数据，两行互相打脸。
  assert.equal(visibleJoints(pose(1, null)), null, '没有 visibility 字段 = 没有答案');
  assert.equal(visibleJoints(pose(1, [0])), null, '全零和没有是同一种"这台机器不报这个数"');
  const r = readOut({ pose: pose(1, null), features: FEATURES, inferenceHz: 30 });
  assert.equal(r.values.confidence, '1.00');
  assert.equal(r.values.joints, ABSENT);
});

test('readout: 关节数用 REFINE.occlusionVisibility 那一条线，不另立门限', () => {
  // 0.4 是门限。10 个点在线上/线上方，其余 23 个在下方。
  const vis = Array.from({ length: 33 }, (_, i) => (i < 10 ? 0.4 : 0.39));
  assert.equal(visibleJoints(pose(0.8, vis)), 10);
  const r = readOut({ pose: pose(0.8, vis), features: FEATURES, inferenceHz: 30 });
  assert.equal(r.values.joints, '10/33', '半个人出画时置信度还很高，这一行是那件事唯一的数字证据');
});

test('readout: NaN / Infinity 一律写破折号，绝不写成 0', () => {
  const bad = { ...FEATURES, energy: Number.NaN, expansiveness: Number.POSITIVE_INFINITY };
  const r = readOut({ pose: pose(0.9, [0.9]), features: bad, inferenceHz: Number.NaN });
  assert.equal(r.values.energy, ABSENT);
  assert.equal(r.values.extent, ABSENT);
  assert.equal(r.values.inference, ABSENT, '一个算不出来的频率写 0 Hz = 谎称"模型停了"');
  // 还没有运动特征的第一帧（features 还是 null）也不许写 0
  const first = readOut({ pose: pose(0.9, [0.9]), features: null, inferenceHz: 30 });
  assert.equal(first.values.energy, ABSENT);
});

test('readout: 值的宽度装得进定宽的那一栏（readout.css 的 6.5ch）', () => {
  // 这一栏定宽是为了"数字跳动时面板一个像素都不回流"。
  // 宽度一旦被撑破，那条保证就没了，而它在截图上要下一帧才看得出来。
  const cases: ReadoutInputLike[] = [
    { pose: null, features: null, inferenceHz: 0 },
    { pose: pose(1, [0.9]), features: FEATURES, inferenceHz: 120 },
    { pose: pose(0.999, [0.9]), features: { ...FEATURES, energy: 0.9999, expansiveness: 0.999 }, inferenceHz: 60 },
  ];
  for (const c of cases) {
    for (const [k, v] of Object.entries(readOut(c).values)) {
      assert.ok(v.length <= 6, `${k} = "${v}" 有 ${v.length} 个字符，撑破了 6.5ch 那一栏`);
    }
  }
});
type ReadoutInputLike = Parameters<typeof readOut>[0];

// ── 那块半透明的灰，在五套场景上都得成立 ──────────────────────────────────────

/**
 * 面板的底是**字色兑水**（`color-mix(in srgb, var(--sb-on-stage) N%, transparent)`），
 * 而字色由 `stage.ts` 的 `publishStageInk()` 按当前场景的角上亮度翻。
 * 所以"它在白展厅和深空上都成立"是可以**算**的，不必靠五张截图。
 *
 * 兑水的比例从 `readout.css` 里**读出来**，不在这里抄一份 ——
 * 抄一份的话，谁把 12% 调成 60% 这条测试也照样绿（docs/02 P21）。
 */
const CSS = readFileSync(
  fileURLToPath(new URL('../src/ui/readout.css', import.meta.url)), 'utf8',
);

/** sRGB 十六进制 → 0..1 的 gamma 通道值 */
function channels(hex: string): number[] {
  const h = hex.length === 4
    ? [hex[1] + hex[1], hex[2] + hex[2], hex[3] + hex[3]]
    : [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)];
  return h.map((s) => parseInt(s, 16) / 255);
}
const toLinear = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toGamma = (v: number): number => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
const luma = (c: number[]): number =>
  0.2126 * toLinear(c[0]) + 0.7152 * toLinear(c[1]) + 0.0722 * toLinear(c[2]);
const contrast = (a: number, b: number): number =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

test('readout: 面板的底和边只从 --sb-on-stage 来，一个固定颜色都没有', () => {
  // 固定的底色这个仓库犯过三次（见 type.css 的 --sb-ink-strong），
  // `--sb-stage-ground` 就是因此被整个删掉的。这一条挡的是它长回来。
  for (const prop of ['background', 'border', 'border-top']) {
    const line = CSS.split('\n').find((l) => l.trim().startsWith(`${prop}:`));
    assert.ok(line, `readout.css 里没有 ${prop}`);
    assert.match(line!, /var\(--sb-on-stage\)/, `${prop} 没有跟着场景亮度走：${line!.trim()}`);
  }
});

test('readout: 五套场景下，字压在面板上都过 4.5:1，面板也和画面分得开', () => {
  const pct = CSS.match(/background:\s*color-mix\(in srgb,\s*var\(--sb-on-stage\)\s*([\d.]+)%/);
  assert.ok(pct, 'readout.css 的 background 不是 color-mix 兑水写法了，这条测试要重写');
  const alpha = Number(pct![1]) / 100;

  const thin: string[] = [];
  const flat: string[] = [];
  for (const id of SCENE_IDS) {
    const look = applyScene(NEUTRAL_LOOK, SCENES[id]);
    // 面板坐落的那块底色的亮度 —— 用 stage.ts 翻墨时用的**同一个**函数，
    // 不另外量一份（`stage-ink.test.ts` 拿实测帧钉着它准不准）
    const bg = overlayGroundLuma(look);
    const ink = channels(stageInk(look).on);
    // 合成发生在 sRGB gamma 空间（CSS 的默认合成空间）
    const bgGamma = toGamma(bg);
    const panel = ink.map((c) => alpha * c + (1 - alpha) * bgGamma);
    const onPanel = contrast(luma(ink), luma(panel));
    const panelVsScene = contrast(luma(panel), bg);
    if (onPanel < 4.5) thin.push(`${id}: 字压在面板上只有 ${onPanel.toFixed(2)}:1`);
    if (panelVsScene < 1.15) flat.push(`${id}: 面板和画面只差 ${panelVsScene.toFixed(3)}，看不出是一块面板`);
  }
  assert.deepEqual(thin, [], `读不动：\n${thin.join('\n')}`);
  assert.deepEqual(flat, [], `面板化在画面里了：\n${flat.join('\n')}`);
});

// ── 挂不挂 ───────────────────────────────────────────────────────────────────

const flags = (search: string): Flags => readFlags(search);

test('readout: 网页版默认挂、现场默认不挂、两边都能被显式翻过来', () => {
  assert.equal(wantsReadout(flags('')), true, '网页版没有解说员，这块读数是它自己把答案摊开');
  assert.equal(wantsReadout(flags('?kiosk=1')), false, '现场不是控制室（docs/23 §S4 默认零 UI）');
  assert.equal(wantsReadout(flags('?kiosk=1&readout=on')), true, '讲解 / 评审要它的时候要能要回来');
  assert.equal(wantsReadout(flags('?readout=off')), false, '网页版也要能摘掉');
});

test('readout: `?demo=1` 照常挂 —— 它和那块小屏幕不是同一种东西', () => {
  // 小屏幕在回放下会撒谎（画的是录像里另一个人的骨架，观众一挥手骨架不跟）。
  // 这块读数不声称有摄像头，它报的是此刻真正在驱动这具身体的那份数据。
  assert.equal(wantsReadout(flags('?demo=1')), true);
});

test('readout: 认不出来的值当没写过（并且 readFlags 会喊一声）', () => {
  assert.ok(isReadoutMode('on'));
  assert.ok(isReadoutMode('off'));
  assert.ok(!isReadoutMode('1'), '?readout=1 最容易手滑 —— 猜成 on 就分不出"没生效"和"没写"');
  assert.ok(!isReadoutMode('On'));
  assert.ok(!isReadoutMode('yes'));
  assert.ok(!isReadoutMode(null));
  assert.ok(!isReadoutMode('toString'), '原型链上的键不能被当成合法值');

  assert.equal(readFlags('').readout, null);
  assert.equal(readFlags('?readout=on').readout, 'on');
  assert.equal(readFlags('?readout=off').readout, 'off');
  assert.equal(readFlags('?readout=1').readout, null);
  // 当没写过 = 走默认，而不是"关掉"
  assert.equal(wantsReadout(flags('?readout=1')), true);
  assert.equal(wantsReadout(flags('?kiosk=1&readout=yes')), false);
});
