// node attribute.ts <runDir> [minMs=50]  → 主线程上每一段 ≥minMs 的忙碌，拆到函数（docs/48 §10）
// 读 measure.ts 在 PROFILE=1 时写的 profile.json（CDP 采样，200µs）。
// 不需要和 performance.now 对齐：忙碌段直接从采样里找（连续的非 idle 样本），时刻从按下那一刻起算。
import { readFileSync } from 'node:fs';

type Frame = { functionName: string; url: string; lineNumber: number };
type Node = { id: number; callFrame: Frame; parent?: number; children?: number[] };
const [dir, minArg = '50'] = process.argv.slice(2);
const minMs = Number(minArg);
const prof = JSON.parse(readFileSync(`${dir}/profile.json`, 'utf8')) as {
  nodes: Node[]; samples: number[]; timeDeltas: number[]; startTime: number;
};

const byId = new Map<number, Node>();
for (const n of prof.nodes) byId.set(n.id, n);
for (const n of prof.nodes) for (const c of n.children ?? []) { const k = byId.get(c); if (k) k.parent = n.id; }

const file = (u: string) => (u.split('/').pop() ?? '').replace(/-[A-Za-z0-9_-]{8}\.js$/, '.js');
const label = (f: Frame) => `${f.functionName || '(anon)'}@${file(f.url)}:${f.lineNumber + 1}`;
const IDLE = new Set(['(idle)', '(root)']);

// 样本 → (时刻 ms, 叶子节点)
let t = 0;
const pts: { t: number; node: Node }[] = [];
for (let i = 0; i < prof.samples.length; i++) {
  t += prof.timeDeltas[i] / 1000;
  pts.push({ t, node: byId.get(prof.samples[i])! });
}

// 连续的非 idle 样本 = 一段忙碌；两个样本隔得比 2ms 还久算断开
const spans: { s: number; e: number; pts: typeof pts }[] = [];
let cur: (typeof spans)[number] | null = null;
for (const p of pts) {
  const busy = !IDLE.has(p.node.callFrame.functionName);
  if (busy && cur && p.t - cur.e <= 2) { cur.e = p.t; cur.pts.push(p); continue; }
  if (cur && cur.e - cur.s >= minMs) spans.push(cur);
  cur = busy ? { s: p.t, e: p.t, pts: [p] } : null;
}
if (cur && cur.e - cur.s >= minMs) spans.push(cur);

const top = (m: Map<string, number>, n: number, dt: number) =>
  [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}=${(v * dt).toFixed(0)}`).join('  ');

const dt = prof.samples.length ? (t / prof.samples.length) : 0.2;

// 分类：一个样本按它的调用栈落进第一个命中的桶（从栈顶往根找）。docs/48 §10 那张表就是这几类
const CATS: [string, RegExp][] = [
  ['warm(compileAsync)', /^compileAsync@/],
  ['node-build', /^(build|buildAsync|getNodeBuilderState)@three\.webgpu/],
  ['pipeline', /createRenderPipeline|_getRenderPipeline|createProgram|createShaderModule/],
  ['glb-decode', /geometryFromScene|toFloatAttribute|toNonIndexed|mergeGeometries|decodeGltfBuffer|parse@GLTF|MeshoptDecoder|loadAsync|_invokeOne|parseAsync/],
  ['mirror', /mirrorGeometry/],
  ['upload', /createBuffer|_createBuffer|writeBuffer@three|updateAttribute|createAttribute/],
  ['gc', /^\(garbage collector\)/],
  ['assemble/pose', /^(assemble|pose)@/],
];
const catOf = (leaf: Node): string => {
  const names: string[] = [];
  for (let n: Node | undefined = leaf; n; n = n.parent !== undefined ? byId.get(n.parent) : undefined) names.push(label(n.callFrame));
  for (const [c, re] of CATS) if (names.some((s) => re.test(s))) return c;
  return 'other';
};
if (process.env.COMPACT === '1') {
  // OFFSET_MS = 按下那一刻的 performance.now（probe.json 的 click）：换算成页面时刻，才对得上 [governor] / [tier] 行
  // ⚠️ 不能用上面那种"连续忙碌段"：解开帧率之后帧和帧之间的空闲不到 2ms，几十个普通帧会被连成一段。
  // 切法改成 probe.json 里真实的 long-animation-frame 窗口（页面时刻），换算成 profile 时刻去取样本
  const probe = JSON.parse(readFileSync(`${dir}/probe.json`, 'utf8')) as { click: number; loaf: { s: number; d: number }[] };
  const off = probe.click;
  const sum = new Map<string, number>();
  let i0 = 0;
  const frames = probe.loaf.filter((l) => l.d >= minMs && l.s >= off).sort((a, b) => a.s - b.s);
  for (const l of frames) {
    const a = l.s - off;
    const b = a + l.d;
    while (i0 < pts.length && pts[i0].t < a) i0++;
    const cats = new Map<string, number>();
    for (let i = i0; i < pts.length && pts[i].t <= b; i++) {
      if (IDLE.has(pts[i].node.callFrame.functionName)) continue;
      const c = catOf(pts[i].node);
      cats.set(c, (cats.get(c) ?? 0) + dt);
    }
    for (const [k, v] of cats) sum.set(k, (sum.get(k) ?? 0) + v);
    const parts = [...cats.entries()].sort((x, y) => y[1] - x[1]).filter(([, v]) => v >= 2).map(([k, v]) => `${k}=${v.toFixed(0)}`);
    console.log(`page @${(l.s / 1000).toFixed(2)}s ${l.d}ms  ${parts.join(' ')}`);
    if (process.env.DETAIL === '1') {
      // 这一帧里 JS 到底在干什么：自身耗时前 8 名 + 包含耗时前 16 名（去掉每一帧都有的那几层外壳）
      const self = new Map<string, number>();
      const incl = new Map<string, number>();
      for (let i = i0; i < pts.length && pts[i].t <= b; i++) {
        const leaf = pts[i].node;
        if (IDLE.has(leaf.callFrame.functionName)) continue;
        self.set(label(leaf.callFrame), (self.get(label(leaf.callFrame)) ?? 0) + 1);
        const seen = new Set<string>();
        for (let n: Node | undefined = leaf; n; n = n.parent !== undefined ? byId.get(n.parent) : undefined) {
          const k = label(n.callFrame);
          if (seen.has(k) || !n.callFrame.functionName || IDLE.has(n.callFrame.functionName)) continue;
          if (/^(frame@safe-frame|render@stage|render@three|_renderScene@|_renderObjects@|renderObject@three)/.test(k)) continue;
          seen.add(k);
          incl.set(k, (incl.get(k) ?? 0) + 1);
        }
      }
      console.log(`    self: ${top(self, 8, dt)}`);
      console.log(`    incl: ${top(incl, 16, dt)}`);
    }
  }
  console.log(`TOTAL over ${frames.length} frames ≥${minMs}ms: ${[...sum.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v.toFixed(0)}`).join(' ')}`);
  process.exit(0);
}
console.log(`== ${dir}: ${spans.length} busy spans ≥${minMs}ms over ${(t / 1000).toFixed(1)}s (sample ≈${dt.toFixed(2)}ms)`);
const total = new Map<string, number>();
for (const sp of spans) {
  const self = new Map<string, number>();
  const incl = new Map<string, number>();
  for (const p of sp.pts) {
    self.set(label(p.node.callFrame), (self.get(label(p.node.callFrame)) ?? 0) + 1);
    const seen = new Set<string>();
    for (let n: Node | undefined = p.node; n; n = n.parent !== undefined ? byId.get(n.parent) : undefined) {
      const k = label(n.callFrame);
      if (seen.has(k) || IDLE.has(n.callFrame.functionName) || !n.callFrame.functionName) continue;
      seen.add(k);
      incl.set(k, (incl.get(k) ?? 0) + 1);
    }
  }
  for (const [k, v] of incl) total.set(k, (total.get(k) ?? 0) + v);
  console.log(`\n@${(sp.s / 1000).toFixed(2)}s  ${(sp.e - sp.s).toFixed(0)}ms`);
  console.log(`  self: ${top(self, 8, dt)}`);
  console.log(`  incl: ${top(incl, 14, dt)}`);
}
console.log(`\nALL SPANS incl: ${top(total, 30, dt)}`);
