/**
 * 墨的宽度按槽位分档（`TOON.outlineSlotScale`）之后要守住的两件事。
 *
 * 这两条是那次修复的**验收条件**本身，不是附加的保险：
 *  1. **只有手和脚变了。** 其余九个槽位乘 1 —— 躯干的轮廓不许因为修手脚而变得更"匀"。
 *     取证里那张逐像素差图（改动只落在 y 425–500 的手和 y 650–700 的脚，其余为 0）
 *     证的是同一件事，这里把它钉成一条会红的测试。
 *  2. **墨不许被收没。** "线碎了"和"线不见了"一样不成立。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { TOON } from '../../core/src/tuning.ts';
import { createOutlineMaterial, outlineMetersFor, setOutlineTint } from '../src/creature/shading.ts';

const UNTOUCHED = ['head', 'neck', 'spine', 'clavicle', 'upperArm', 'foreArm', 'thigh', 'shin', 'joint'];

test('墨宽：只有手和脚被收窄，其余槽位逐像素不变', () => {
  for (const slot of UNTOUCHED) {
    assert.equal(outlineMetersFor(slot), TOON.outlineMeters, `${slot} 的墨被动了 —— 修手脚不许波及别处`);
  }
  assert.ok(outlineMetersFor('hand') < TOON.outlineMeters, '手没有被收窄，那次修复没生效');
  assert.ok(outlineMetersFor('foot') < TOON.outlineMeters, '脚没有被收窄，那次修复没生效');
  // 没有槽位（关节盖片之外的兜底、未知 id）也必须有答案 —— 帧循环里不许有洞
  assert.equal(outlineMetersFor(null), TOON.outlineMeters);
  assert.equal(outlineMetersFor('nonsense'), TOON.outlineMeters);
});

test('墨宽：收窄有下限 —— 线不见了和线碎了一样不成立', () => {
  for (const slot of ['hand', 'foot']) {
    const w = outlineMetersFor(slot);
    // 0.3× 是实测的下界：0.25 时脚上那圈墨已经细成一根头发丝（见 docs/41 §6）
    assert.ok(w >= TOON.outlineMeters * 0.3, `${slot} 的墨被收到 ${w}m，那已经是"没有线"了`);
  }
});

test('墨色：弧线走完之后能复位 —— 下一个观众不该接手上一个人的那条线', () => {
  const m = createOutlineMaterial(TOON.outlineMeters);
  const ink = m.color.clone();
  setOutlineTint([1, 0.2, 0.2], 1);
  assert.notDeepEqual(m.color.toArray(), ink.toArray(), 'setOutlineTint 根本没起作用');
  setOutlineTint(null, 0);
  assert.deepEqual(m.color.toArray(), ink.toArray(), '归零之后墨色必须回到原样（docs/40 §3）');
});
