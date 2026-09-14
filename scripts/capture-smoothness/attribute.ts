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
  const off = Number(process.env.OFFSET_MS ?? 0);
  const sum = new Map<string, number>();
  for (const sp of spans) {
    const cats = new Map<string, number>();
    for (const p of sp.pts) cats.set(catOf(p.node), (cats.get(catOf(p.node)) ?? 0) + dt);
    for (const [k, v] of cats) sum.set(k, (sum.get(k) ?? 0) + v);
    if (sp.e - sp.s < 50) continue;
    const parts = [...cats.entries()].sort((a, b) => b[1] - a[1]).filter(([, v]) => v >= 3).map(([k, v]) => `${k}=${v.toFixed(0)}`);
    console.log(`page @${((sp.s + off) / 1000).toFixed(2)}s ${(sp.e - sp.s).toFixed(0)}ms  ${parts.join(' ')}`);
  }
  console.log(`TOTAL over spans ≥${minMs}ms: ${[...sum.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v.toFixed(0)}`).join(' ')}`);
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
