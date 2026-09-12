/**
 * 开场自检页 `?selftest=1`（docs/09 §C「浏览器自动播放/权限弹窗挡住画面 → 启动自检页」）。
 *
 * 现场开场前跑一遍，比出事了再查快得多。逐条检查那几件**一坏就没得演**的事：
 *   WebGPU / 摄像头权限 / parts.json / demo 片段 / 本地 MediaPipe 模型
 *
 * 三个原则：
 *  1. **不改变世界**：只读。唯一的例外是"请求摄像头权限"按钮，且要人点。
 *  2. **缺东西不等于不能开场**：parts.json 缺了是 ⚠（P3 保证占位几何照跑），
 *     摄像头没授权是 ✗（那是真的演不了，除非切 `?demo=1`）。
 *  3. **自己绝不白屏，也绝不卡死**：每条检查都包着 try/catch，炸了就把异常写进那一行；
 *     再加一个超时 —— 检查是串行跑的，一条挂住会把它后面所有条目永远钉在"检查中…"。
 *     这不是假想：headless Chrome 里 `enumerateDevices()` 就会一直不返回。
 *     现场开场前站在一个永远转不完的自检页前面，比没有自检页还糟。
 */
import { fetchClipIndex, type ClipEntry } from '../capture/replay.ts';
import { mountPageHead } from '../ui/page.ts';
import { readFlags } from './kiosk.ts';

type Verdict = 'pass' | 'warn' | 'fail' | 'running';

interface Result { verdict: Verdict; detail: string; }

interface Check {
  id: string;
  title: string;
  /** 为什么现场在乎这一条 —— 打勾打叉都要能读懂 */
  why: string;
  run(): Promise<Result>;
}

/**
 * 视觉语言按 `docs/23 §0`，而**实现只有一处**：`ui/type.css`。
 * 这一页原来把那一套（#0E0F12 / 13px / 48px 安全区…）又抄了一遍常量 ——
 * 抄一遍就意味着有一天两边会不一样，而且没人会发现。现在全部指向 `--sb-*`：
 * 换底色、换字号、换字体栈，改 type.css 一个地方，这一页跟着变。
 *
 * 打勾的那一条刻意**不上绿色**：绿色是仪表盘的语言，这件作品的气质是影棚（§0 开头那条总规矩）。
 * 通过 = 用强调前景色亮一格就够了；只有"要人当场处理"的两档才允许烧颜色，
 * 和 `附 · 调试 UI` 里"超 BUDGET 标红"是同一套约定。
 */
const GLYPH: Record<Verdict, string> = { pass: '✓', warn: '⚠', fail: '✗', running: '·' };
const COLOR: Record<Verdict, string> = {
  pass: 'var(--sb-ink)',
  // 警告用的琥珀色是这一页独有的第三档，type.css 里没有对应变量 ——
  // 因为除了"逐条打勾"的自检页，没有第二个场景需要"能演但打折"这个状态。
  warn: '#E8A33D',
  fail: 'var(--sb-warn)',
  running: 'var(--sb-rule)',
};
const FG = 'var(--sb-ink-dim)';
const FG_HI = 'var(--sb-ink)';
const BG = 'var(--sb-paper)';
const RULE = 'var(--sb-rule)';
const BODY = 'var(--sb-size-small)';
const MONO = 'var(--sb-mono)';
/** 投影会切边（§0） */
const SAFE = 'var(--sb-safe)';

const flags = readFlags();

// ── 检查项 ──────────────────────────────────────────────────────────────────

const checks: Check[] = [
  {
    id: 'webgpu',
    title: 'WebGPU',
    why: '拿不到就回落 WebGL2（P3 允许），但帧率会掉一截',
    async run() {
      const nav = navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } };
      if (nav.gpu?.requestAdapter) {
        const adapter = await nav.gpu.requestAdapter().catch(() => null);
        if (adapter) {
          // adapter.info 在各版本 WebGPU 类型里时有时无，按"可能没有"处理
          const info = (adapter as unknown as { info?: Record<string, string | undefined> }).info;
          const who = info?.description || info?.vendor || info?.architecture || 'adapter ok';
          return { verdict: 'pass', detail: `navigator.gpu → ${who}` };
        }
        return { verdict: 'warn', detail: 'navigator.gpu 在，但 requestAdapter() 返回 null → 会回落 WebGL2' };
      }
      const gl = document.createElement('canvas').getContext('webgl2');
      return gl
        ? { verdict: 'warn', detail: '没有 WebGPU，但 WebGL2 在 → three 会自动回落（P3），帧率打折' }
        : { verdict: 'fail', detail: 'WebGPU 和 WebGL2 都没有 —— 这台机器画不出东西，换浏览器/换机器' };
    },
  },

  {
    id: 'camera',
    title: '摄像头权限',
    why: '现场最常见的翻车：权限框弹出来挡住画面，或者根本没授权',
    async run() {
      if (!navigator.mediaDevices?.getUserMedia) {
        return { verdict: 'fail', detail: '没有 getUserMedia（需要 https 或 localhost）' };
      }
      let state: string | null = null;
      try {
        const p = await navigator.permissions?.query({ name: 'camera' as PermissionName });
        state = p?.state ?? null;
      } catch { /* Safari 不支持 camera 权限查询，往下靠设备列表判断 */ }

      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
      const cams = devices.filter((d) => d.kind === 'videoinput');
      const named = cams.filter((d) => d.label).length;   // 有 label = 已经授权过

      if (!cams.length) {
        return {
          verdict: flags.demo ? 'warn' : 'fail',
          detail: `没有摄像头设备${flags.demo ? '（当前是 ?demo=1 回放，不影响演示）' : ' —— 只能走 ?demo=1 回放'}`,
        };
      }
      if (state === 'denied') {
        return { verdict: 'fail', detail: '权限被拒。到浏览器设置里放开，或改用 ?demo=1' };
      }
      if (state === 'granted' || named > 0) {
        return { verdict: 'pass', detail: `${cams.length} 个摄像头，已授权：${cams[0]?.label || '(无标签)'}` };
      }
      return {
        verdict: 'warn',
        detail: `${cams.length} 个摄像头，但还没授权 —— 开场前点下面的「请求摄像头权限」按一次，别留到观众面前弹`,
      };
    },
  },

  {
    id: 'parts',
    title: 'parts.json',
    why: '缺了应用照样跑（占位几何，P3 硬性要求），但身上就是素几何',
    async run() {
      const r = await fetch('/parts/parts.json').catch(() => null);
      const type = r?.headers.get('content-type') ?? '';
      if (!r?.ok || type.includes('text/html')) {
        return { verdict: 'warn', detail: `取不到（HTTP ${r?.status ?? '—'}）→ 用程序化占位几何运行` };
      }
      const idx = await r.json().catch(() => null) as { parts?: unknown[]; themes?: unknown[] } | null;
      if (!idx?.parts?.length) return { verdict: 'warn', detail: 'parts.json 解析不出部件 → 占位几何' };
      return { verdict: 'pass', detail: `${idx.parts.length} 件部件 · ${idx.themes?.length ?? 0} 个主题` };
    },
  },

  {
    id: 'clips',
    title: 'demo 回放片段',
    why: '这是断网 / 逆光 / 没人敢上台时的唯一兜底 —— 合成占位数据不算兜底',
    async run() {
      const entries = await fetchClipIndex();
      if (!entries.length) {
        return { verdict: 'fail', detail: '/demo/index.json 里一条片段都没有 → ?demo=1 会落到默认文件或直接没画面' };
      }
      const rows: string[] = [];
      let real = 0;
      for (const e of entries.slice(0, 8)) {
        const ok = await probeClip(e);
        if (ok.verdict === 'pass' && e.synthetic !== true) real++;
        rows.push(`${GLYPH[ok.verdict]} ${e.name ?? e.url} — ${ok.detail}`);
      }
      const detail = rows.join('\n');
      if (!real) {
        return {
          verdict: 'warn',
          detail: `${detail}\n只有合成占位数据 —— 现场兜底在录到真人之前不算数（docs/11 T-16）。\n先去 /dev/record.html 录一段真人。`,
        };
      }
      return { verdict: 'pass', detail: `${detail}\n${real} 段真录制可用：?demo=1&clip=<name>` };
    },
  },

  {
    id: 'models',
    title: '本地 MediaPipe 模型',
    why: '本地没有就走 CDN —— 现场断网时摄像头那条路会起不来',
    async run() {
      if (flags.demo) return { verdict: 'warn', detail: '当前 ?demo=1 不用模型；现场若切回摄像头请再跑一次自检' };
      const r = await fetch('/models/pose_landmarker_lite.task', { method: 'HEAD' }).catch(() => null);
      const type = r?.headers.get('content-type') ?? '';
      if (r?.ok && !type.includes('text/html')) {
        const size = Number(r.headers.get('content-length') ?? 0);
        return { verdict: 'pass', detail: `assets/models/pose_landmarker_lite.task${size ? ` · ${(size / 1e6).toFixed(1)} MB` : ''}` };
      }
      return { verdict: 'warn', detail: '本地没有模型 → 回落 Google CDN。断网就起不来，开场前把文件放进 assets/models/' };
    },
  },
];

async function probeClip(e: ClipEntry): Promise<Result> {
  const r = await fetch(e.url).catch(() => null);
  if (!r?.ok) return { verdict: 'fail', detail: `取不到（HTTP ${r?.status ?? '—'}）` };
  const raw = await r.json().catch(() => null) as { fps?: number; frames?: unknown[]; synthetic?: boolean } | null;
  const frames = Array.isArray(raw) ? raw : raw?.frames;
  if (!Array.isArray(frames) || !frames.length) return { verdict: 'fail', detail: '空数据' };
  const fps = raw && !Array.isArray(raw) && typeof raw.fps === 'number' ? raw.fps : 30;
  const secs = frames.length / Math.max(1, fps);
  const synthetic = e.synthetic === true || (raw && !Array.isArray(raw) && raw.synthetic === true);
  return {
    verdict: synthetic ? 'warn' : 'pass',
    detail: `${frames.length} 帧 · ${fps}fps · ${secs.toFixed(1)}s${synthetic ? ' · 合成占位数据，不是录制' : ''}`,
  };
}

// ── 页面 ────────────────────────────────────────────────────────────────────

const rowEls = new Map<string, { verdict: HTMLElement; detail: HTMLElement }>();
let banner: HTMLElement;

function build(): void {
  document.documentElement.style.cssText = `background:${BG}`;
  // 排版由 type.css 负责；这里只补这一页特有的两件事：整页等宽（它是一张检查表，
  // 不是一段正文），以及底部多留 96px 免得最后一行贴着窗口底边
  document.body.style.cssText =
    `min-height:100vh;color:${FG};overflow:auto;font:${BODY}/1.7 ${MONO};padding-bottom:96px`;

  mountPageHead({
    title: '开场自检',
    titleEn: 'Selftest',
    note: '开场前跑一遍：✗ 是真的演不了，⚠ 是能演但知道自己在打什么折。',
  });

  // 页头自己带安全区，所以内容区单独一层 —— 两边各加一次就成了 96px
  const main = document.createElement('main');
  main.style.cssText = `padding:0 ${SAFE}`;
  document.body.appendChild(main);

  banner = document.createElement('div');
  // 只有下边框：上面那条线由页头出（两条挨在一起会读成一个边框，
  // 而这套风格里一条线就是一次分区，不是装饰）
  banner.style.cssText = `margin:0 0 26px;padding:12px 0;border-bottom:1px solid ${RULE}`;
  banner.textContent = '自检中…';
  main.appendChild(banner);

  for (const c of checks) {
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:24px 200px 1fr;gap:14px;align-items:start;' +
      `padding:12px 0;border-top:1px solid ${RULE}`;
    const v = document.createElement('div');
    v.style.cssText = `color:${COLOR.running}`;
    v.textContent = GLYPH.running;
    const name = document.createElement('div');
    name.innerHTML = `<div style="color:${FG_HI}">${escapeHtml(c.title)}</div>` +
      `<div style="color:#5C626B">${escapeHtml(c.why)}</div>`;
    const detail = document.createElement('div');
    detail.style.cssText = `color:${FG};white-space:pre-wrap`;
    detail.textContent = '检查中…';
    row.append(v, name, detail);
    main.appendChild(row);
    rowEls.set(c.id, { verdict: v, detail });
  }

  const bar = document.createElement('div');
  bar.style.cssText = `margin-top:30px;padding-top:18px;border-top:1px solid ${RULE};display:flex;gap:22px;flex-wrap:wrap`;
  bar.append(
    button('重新自检', () => { void runAll(); }),
    button('请求摄像头权限', async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true });
        s.getTracks().forEach((t) => t.stop());   // 只为了触发一次授权，立刻关掉
      } catch (e) {
        console.warn('[selftest] 摄像头授权失败：', e);
      }
      void runAll();
    }),
    link('进现场 /?kiosk=1', '/?kiosk=1'),
    link('回放兜底 /?demo=1', '/?demo=1&debug=1'),
    link('录制页 /dev/record.html', '/dev/record.html'),
  );
  main.appendChild(bar);
}

function button(text: string, onClick: () => void): HTMLElement {
  // 无圆角、无面板、无图标（§0 禁止项）—— 下划线的等宽文字就是这一页全部的"按钮"
  const b = document.createElement('button');
  b.textContent = text;
  b.style.cssText = `font:${BODY} ${MONO};color:${FG_HI};background:none;border:0;border-bottom:1px solid ${RULE};` +
    'padding:2px 0;cursor:pointer';
  b.onclick = onClick;
  return b;
}

function link(text: string, href: string): HTMLElement {
  const a = document.createElement('a');
  a.textContent = text;
  a.href = href;
  a.style.cssText = `font:${BODY} ${MONO};color:${FG_HI};border-bottom:1px solid ${RULE};` +
    'padding:2px 0;text-decoration:none';
  return a;
}

function paint(id: string, r: Result): void {
  const el = rowEls.get(id);
  if (!el) return;
  el.verdict.textContent = GLYPH[r.verdict];
  el.verdict.style.color = COLOR[r.verdict];
  el.detail.textContent = r.detail;
  el.detail.style.color = r.verdict === 'pass' ? FG : COLOR[r.verdict];
}

/**
 * 单条检查的耐心上限。超了就当场判定，然后继续跑下一条。
 * 注意：**挂住的那个 promise 并没有被取消**（DOM API 普遍不可取消），
 * 它日后真的 resolve 时也已经没人在听了 —— 这是刻意接受的代价，
 * 换的是"这一页永远会跑完"。
 */
const CHECK_TIMEOUT_MS = 8000;

function withTimeout(p: Promise<Result>, ms = CHECK_TIMEOUT_MS): Promise<Result> {
  return new Promise<Result>((resolve) => {
    const timer = setTimeout(() => resolve({
      verdict: 'warn',
      detail: `这条检查 ${ms / 1000}s 没返回，跳过继续 —— 浏览器把它挂住了，换个浏览器再跑一次`,
    }), ms);
    p.then((r) => { clearTimeout(timer); resolve(r); },
      (e) => {
        clearTimeout(timer);
        resolve({ verdict: 'fail', detail: `检查本身炸了：${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}` });
      });
  });
}

async function runAll(): Promise<void> {
  banner.textContent = '自检中…';
  banner.style.color = FG;
  let fail = 0, warn = 0;
  for (const c of checks) {
    paint(c.id, { verdict: 'running', detail: '检查中…' });
    // 同步抛出的（还没进 promise 就炸了）也要接住，所以外面再包一层
    let r: Result;
    try {
      r = await withTimeout(c.run());
    } catch (e) {
      r = { verdict: 'fail', detail: `检查本身炸了：${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}` };
    }
    if (r.verdict === 'fail') fail++;
    if (r.verdict === 'warn') warn++;
    paint(c.id, r);
  }
  banner.textContent = fail
    ? `✗ ${fail} 项不通过${warn ? ` · ⚠ ${warn} 项警告` : ''} —— 先修掉 ✗ 再开场`
    : warn ? `⚠ ${warn} 项警告，其余通过 —— 能开场，但知道自己在打什么折`
      : '✓ 全部通过 —— 可以开场';
  banner.style.color = fail ? COLOR.fail : warn ? COLOR.warn : FG_HI;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch] ?? ch));
}

build();
void runAll();
