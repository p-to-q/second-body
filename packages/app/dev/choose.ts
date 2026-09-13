/**
 * 开场选择页的独立调试页（T-18）。
 *
 *   /dev/choose.html                 从 /parts/parts.json 读条目
 *   /dev/choose.html?theme=xeno      直接跳过选择页（现场手动覆盖 / 刷新复现）
 *   /dev/choose.html?roster=1        改从 factory 的 ROSTER 读全部条目 ——
 *                                    parts.json 是上一次 factory:index 的快照，
 *                                    新加的物种和 kind 角标要这样才看得见
 *   /dev/choose.html?gl=off          强制走无 WebGL 的 DOM 降级列表
 *   /dev/choose.html?capture=1       让 canvas 可读回，用来截证据图
 *   /dev/choose.html?idle=5000       缩短自动选择的等待，用来验那条 30 秒规则
 *   /dev/choose.html?n=2             只留前 2 个条目 —— 验「< 3 个退化成横向一排」
 *   /dev/choose.html?seed=1          固定随机种子
 *   /dev/choose.html?wave=sim        用一段**合成的**姿态驱动举手滚动 ——
 *                                    右手举过肩、左右来回挥。没有摄像头也能把
 *                                    「姿态 → wave.ts → 环真的转起来」整条链跑一遍
 *                                    （AGENTS.md：每条路径必须存在**且被跑过**）。
 *                                    ⚠️ 它是合成数据，不是证据：真人的手抖、遮挡、
 *                                    逆光全都不在里面（P18 —— 所以它自己吼一声）
 *   /dev/choose.html?freeze=1        挂上来就冻住时间线，之后用
 *                                    `__ring.advance(秒)` 一步步走 —— 取证截图用这个，
 *                                    **别用"等几秒再截"**：标签页在后台时 rAF 被节流到 1Hz，
 *                                    等出来的"中间帧"根本不是那个时刻（docs/02 P21）
 *
 * 运行时（src/main.ts）还没接这一页 —— T-01…T-09 落地后再接。
 */
import { chooseTheme } from '../src/choose/choose.ts';
import { mountPageHead } from '../src/ui/page.ts';
import type { ThemeDef } from '../../core/src/types.ts';

// 页头 4 秒后自己淡下去（见 ui/page.ts）—— 这一页也是拿来截图的，
// 而 S2 的规格里没有任何页头，截图上不该留着我们的调试文字。
mountPageHead({
  title: '选择页', titleEn: 'Choose', overlay: true,
  // 不是功能清单。这一页要说的是观众在这一刻在做什么
  note: '观众选身体的那一刻。他选的应该是"变成什么"，不是"点哪一个"。',
});

const q = new URLSearchParams(location.search);
const num = (key: string): number | undefined => {
  const v = q.get(key);
  return v === null ? undefined : Number(v);
};

let themes: ThemeDef[] | undefined;
if (q.get('roster')) {
  const { ROSTER } = await import('../../factory/recipes/roster.ts');
  themes = ROSTER.map((e) => ({
    id: e.id, kind: e.kind, name: e.name, nameEn: e.nameEn, tagline: e.tagline,
    palette: e.palette, source: e.source, axes: e.axes, coverage: e.coverage, base: e.base,
  }));
}

/**
 * `?n=2` —— 只留前 n 个条目。
 *
 * 这是为了**跑得到** docs/23 §S2 那条「可选条目 < 3 个 → 螺旋退化成横向一排」。
 * 没有这个开关，那条降级路径只在"库里真的只剩两个条目"时才出现，
 * 也就是永远不会被验证（AGENTS.md：每条降级路径必须存在**且被跑过**）。
 * 它只截断这一页传进去的条目表，不碰 parts.json。
 */
const n = num('n');
if (n !== undefined && Number.isFinite(n) && n > 0) {
  const { ROSTER } = await import('../../factory/recipes/roster.ts');
  themes = (themes ?? ROSTER.map((e) => ({
    id: e.id, kind: e.kind, name: e.name, nameEn: e.nameEn, tagline: e.tagline,
    palette: e.palette, source: e.source, axes: e.axes, coverage: e.coverage, base: e.base,
  }))).slice(0, n);
}

/**
 * `?wave=sim` 的合成姿态。**只在 dev 页存在**，运行时一行都不会走到这里。
 *
 * 造的是 MediaPipe **原始**坐标（米、y 向下为正、未镜像）—— 因为真正的采集端
 * 交出来的就是这个，镜像和 Y 翻转由 `mediapipeToWorld()` 统一做（docs/04 §1 / P4）。
 * 右手举过肩并以 0.33Hz 来回挥，左手垂着。
 */
function simPose(): { world: { x: number; y: number; z: number }[]; score: number; t: number } {
  const t = performance.now() / 1000;
  const world = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0 }));
  // 肩：y 向下为正，所以肩在髋中点上方 = 负
  world[11] = { x: -0.18, y: -0.50, z: 0 };   // 左肩
  world[12] = { x: 0.18, y: -0.50, z: 0 };    // 右肩
  world[15] = { x: -0.20, y: 0.05, z: 0 };    // 左腕：垂着，远低于肩
  world[16] = { x: 0.18 + 0.35 * Math.sin(t * 2 * Math.PI / 3), y: -0.75, z: 0 };  // 右腕：举过肩，横向挥
  return { world, score: 0.9, t: performance.now() };
}
if (q.get('wave') === 'sim') {
  // P18：合成数据必须在**用到它的那条路上**吼一声，不能只写在文档里
  console.warn('[choose] ?wave=sim —— 举手滚动正被一段合成姿态驱动，这不是真人证据');
}

const handle = await chooseTheme({
  themes,
  pose: q.get('wave') === 'sim' ? simPose : undefined,
  idleMs: num('idle'),
  seed: num('seed'),
  forceFallback: q.get('gl') === 'off',
  capture: q.get('capture') === '1',
  onChoose(id) {
    // 真的运行时会在这里造身体。调试页只把结果摆出来。
    const done = document.createElement('div');
    done.id = 'chosen';
    // 排版全部走 type.css：字号、颜色、字距都不在这里定义（docs/23 §0）
    done.style.cssText =
      'position:fixed;inset:0;display:grid;place-content:center;gap:0.6em;text-align:center;' +
      'background:var(--sb-paper);z-index:9';
    done.innerHTML =
      '<div class="sb-label">CHOSEN</div>' +
      `<h1 style="margin:0" data-theme>${id}</h1>` +
      `<div class="sb-data">?theme=${id} · 刷新即复现</div>`;
    document.body.appendChild(done);
    console.log('[choose] onChoose', id, '→', location.search);
  },
});

// 调试把手：handle.entries() 能看见每张卡的图是 anchor / field / absent；
// __ring 是环本体（fps / debug / freeze / advance）。
Object.assign(window as unknown as Record<string, unknown>, { __choose: handle, __ring: handle?.gl });
if (q.get('freeze') === '1') handle?.gl?.freeze(true);
if (handle) {
  console.log(
    '[choose] mode=%s cards=%d',
    handle.mode,
    handle.entries().length,
    handle.entries().map((c) => `${c.theme.id}:${c.from}`),
  );
} else {
  console.log('[choose] URL 里已有 theme，跳过选择页');
}
