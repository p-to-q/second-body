/**
 * 墨的轻重起伏（`TOON.outlineWeightVariation` / `outlineWeightFrequency`）要守住的五件事。
 *
 * 作品负责人要的是"在原有不错的基础上调整"：线要更像手画的，但**还是那条线**。
 * 所以这里守的全是"不许越界"的那一侧 ——
 *  1. 起伏有界：乘数永远在 [1 − amount, 1]，而且确实在起伏（不是悄悄变成一个常数）。
 *  2. **只变细，不变粗**：手和脚永远不超过 `outlineSlotScale` 收窄过的那一档。
 *     那一档修的是形状（碎片），墨一加粗碎片就回来 —— 见 tuning.ts。
 *  3. 起伏钉在身体上：读的是部件自己的几何坐标，不是实例变换之后的。
 *     读错了的话肢体一动墨就沿着手臂流动，那是渲染错误，不是笔触。
 *  4. 不多一块材质：外壳材质仍按线宽缓存，全场两块（= draw call 与管线都不多）。
 *  5. 关得掉：amount = 0 时着色器与原来那一句**结构相同**，不是"乘一个 1"。
 *
 * 原来那一句（恒宽外推）在这里是**照着写一遍**的，不是 import 的 ——
 * 和 `outline-budget.test.ts` 同一个理由：复用被测代码去验证它自己，改坏了两边一起变绿。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { float, normalLocal, positionGeometry, positionLocal } from 'three/tsl';
import { TOON } from '../../core/src/tuning.ts';
import {
  createOutlineMaterial, INK_NUMBERS, inkWeight, outlineMetersFor, outlinePositionNode,
} from '../src/creature/shading.ts';

const SLOTS = ['head', 'neck', 'spine', 'clavicle', 'upperArm', 'foreArm', 'hand', 'thigh', 'shin', 'foot', 'joint'];

/**
 * 部件几何坐标里的采样点：主轴 y ∈ [0,1]，截面 x/z ∈ [-0.5,0.5]（规范化契约，docs/03 §6），
 * 再往外多扫一圈 —— 坏资产不守契约，乘数在契约外也不许越界。
 */
function samples(): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  for (let i = 0; i <= 24; i++) {
    for (let j = 0; j <= 12; j++) {
      for (let k = 0; k <= 12; k++) {
        out.push([-1.5 + (3 * j) / 12, -1 + (3 * i) / 24, -1.5 + (3 * k) / 12]);
      }
    }
  }
  return out;
}

function range(amount: number, freq: number): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const [x, y, z] of samples()) {
    const k = inkWeight(INK_NUMBERS, x, y, z, amount, freq);
    if (k < min) min = k;
    if (k > max) max = k;
  }
  return { min, max };
}

test('墨的起伏有界，而且真的在起伏', () => {
  const A = TOON.outlineWeightVariation;
  const f = TOON.outlineWeightFrequency;
  // 旋钮本身的界：0.6 以上最细处读成断线（tuning.ts 的注释）
  assert.ok(A >= 0 && A <= 0.6, `outlineWeightVariation=${A} 越界：> 0.6 时最细处成了头发丝，线读成虚线`);
  assert.ok(A === 0 || (f >= 0.5 && f <= 3), `outlineWeightFrequency=${f} 越界：太密是抖动，太疏等于没有起伏`);
  const { min, max } = range(A, f);
  assert.ok(max <= 1 + 1e-9, `乘数最大到了 ${max} —— 墨被加粗了，这条改动只许变细`);
  assert.ok(min >= 1 - A - 1e-9, `乘数最小到了 ${min}，低于 1 − amount = ${1 - A}`);
  if (A > 0) {
    // 起伏至少要用掉一半的额度，否则它等于一个常数的"整体变细"，不是手画的轻重
    assert.ok(max - min >= A * 0.5, `起伏只有 ${(max - min).toFixed(3)}（额度 ${A}），读起来和恒宽没有区别`);
  }
});

test('只变细：手和脚永远不超过它们被收窄过的那一档', () => {
  const { min, max } = range(TOON.outlineWeightVariation, TOON.outlineWeightFrequency);
  for (const slot of SLOTS) {
    const base = outlineMetersFor(slot);
    const scale = (TOON.outlineSlotScale as Record<string, number>)[slot] ?? 1;
    assert.ok(
      base * max <= TOON.outlineMeters * scale + 1e-12,
      `${slot} 的墨最粗到了 ${(base * max * 1000).toFixed(2)}mm，超过了它那一档 `
      + `${(TOON.outlineMeters * scale * 1000).toFixed(2)}mm —— 手脚的碎片会回来`,
    );
    // 墨不许被起伏抹没：最细处仍然是线
    assert.ok(base * min > 0, `${slot} 的墨在最细处归零了`);
  }
});

/** 在节点图里找某个节点，但不钻进 `skip` 那棵子树 */
function reaches(node: any, targetId: number, skipId: number, seen = new Set<number>()): boolean {
  if (!node || typeof node !== 'object' || !node.isNode) return false;
  if (node.id === skipId) return false;
  if (node.id === targetId) return true;
  if (seen.has(node.id)) return false;
  seen.add(node.id);
  for (const c of node.getChildren()) if (reaches(c, targetId, skipId, seen)) return true;
  return false;
}

test('起伏钉在身体上：读部件自己的几何坐标，不读实例变换之后的', () => {
  if (!(TOON.outlineWeightVariation > 0)) return;          // 关着的时候没有起伏可钉
  const m = createOutlineMaterial(TOON.outlineMeters);
  // positionLocal 本身就是 positionGeometry 的一个 varying —— 所以绕开它再找：
  // 找得到，才说明起伏是**直接**读几何坐标的
  assert.ok(
    reaches(m.positionNode, positionGeometry.id, positionLocal.id),
    '外壳的起伏没有读 positionGeometry —— 如果它读的是 positionLocal，肢体一动墨就会沿着身体流动',
  );
});

test('不多一块材质：外壳仍按线宽缓存，全场两块', () => {
  const mats = new Set(SLOTS.map((s) => createOutlineMaterial(outlineMetersFor(s))));
  const widths = new Set(SLOTS.map((s) => outlineMetersFor(s).toFixed(5)));
  assert.equal(mats.size, widths.size, `${SLOTS.length} 个槽位拿到了 ${mats.size} 块外壳材质，线宽只有 ${widths.size} 档`);
  assert.ok(mats.size <= 2, `外壳材质变成了 ${mats.size} 块 —— 起伏必须活在同一块材质的着色器里`);
});

/** 节点图的结构指纹：类名 + 运算符 + 常量值 + 共享输入的身份。足够区分"原来那一句"和"乘了一个东西" */
function shape(node: any, seen = new Map<number, string>()): string {
  if (!node || typeof node !== 'object' || !node.isNode) return String(node);
  if (node.id === positionLocal.id) return 'positionLocal';
  if (node.id === normalLocal.id) return 'normalLocal';
  if (node.id === positionGeometry.id) return 'positionGeometry';
  const hit = seen.get(node.id);
  if (hit) return hit;
  const head = [node.constructor.name, node.op, node.method, typeof node.value === 'number' ? node.value : undefined]
    .filter((v) => v !== undefined).join(':');
  const kids = [...node.getChildren()].map((c) => shape(c, seen));
  const s = `${head}(${kids.join(',')})`;
  seen.set(node.id, s);
  return s;
}

test('关得掉：amount = 0 时外壳就是原来那一句恒宽外推，不是乘一个 1', () => {
  const w = TOON.outlineMeters;
  const legacy = positionLocal.add(normalLocal.normalize().mul(float(w)));
  assert.equal(
    shape(outlinePositionNode(w, 0, TOON.outlineWeightFrequency)), shape(legacy),
    '关掉起伏之后着色器和原来的结构不一样 —— "关掉"必须逐像素回到原样',
  );
  // 算式那一侧同样：额度 0 时处处恰好是 1
  for (const [x, y, z] of samples()) {
    assert.equal(inkWeight(INK_NUMBERS, x, y, z, 0, TOON.outlineWeightFrequency), 1);
  }
  // 反过来：开着的时候结构必须**不同**，否则上一条是空转的
  if (TOON.outlineWeightVariation > 0) {
    assert.notEqual(
      shape(outlinePositionNode(w, TOON.outlineWeightVariation, TOON.outlineWeightFrequency)), shape(legacy),
      '开着起伏，着色器却和恒宽那一句一模一样 —— 起伏没有接进去',
    );
  }
});
