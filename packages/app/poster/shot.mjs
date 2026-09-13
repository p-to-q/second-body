/**
 * 把 `poster/*.html` 截成 `assets/brand/*.png`。
 *
 * 用本机已装的 Chrome 无头模式，**不加任何依赖** —— 这条约束比"截图方便"重要。
 *
 * 用法：
 *   1. 另开一个终端：`npm run dev -w @smu/app`
 *   2. `node packages/app/poster/shot.mjs [--port=5173]`
 *
 * 为什么要跑 dev server 而不是直接开 file://：
 *   dev 下 `publicDir` 指向仓库的 `assets/`，所以 `/fonts/ZKMSerendipity/*.woff` 和
 *   `/refs/<id>/_anchor.png` 才解析得到。file:// 下字体会落到 Helvetica Neue
 *   （度量一致，这正是排版系统的设计），但 anchor 图会全空 —— 物种阵列那张就没了内容。
 *
 * 尺寸：1mm = 96/25.4 px。A1 594×841mm → 2245×3179 px，长边远超 2000。
 * A4 小物那张长边只有 1123，所以单独给它 2× 的 deviceScaleFactor。
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const OUT = resolve(ROOT, 'assets/brand');

const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => existsSync(p));

if (!CHROME) {
  console.error('找不到 Chrome。装一个，或者手动「打印 → 存为 PDF」—— 海报本来就是按印刷排的。');
  process.exit(1);
}

const MM = 96 / 25.4;
const px = (mm) => Math.round(mm * MM);

/** 每张海报：源文件、纸张 mm、输出名、缩放（长边要 ≥ 2000px） */
const SHEETS = [
  { html: '01-academic-a1.html',  w: 594, h: 841,  out: 'poster-01-academic-a1.png',  scale: 1 },
  { html: '02-array-a1.html',     w: 594, h: 841,  out: 'poster-02-array-a1.png',     scale: 1 },
  { html: '03-position-a1.html',  w: 594, h: 841,  out: 'poster-03-position-a1.png',  scale: 1 },
  { html: '04-ticket-a4.html',    w: 210, h: 297,  out: 'print-04-ticket-a4.png',     scale: 2 },
  // 规范页不是印刷品：按屏幕像素截，长边天然远超 2000
  { html: 'brand.html', px: [1440, 5600], out: 'brand-spec-page.png', scale: 1 },
];

const port = (process.argv.find((a) => a.startsWith('--port=')) ?? '--port=5173').split('=')[1];
mkdirSync(OUT, { recursive: true });

for (const s of SHEETS) {
  const url = `http://localhost:${port}/poster/${s.html}?shot`;
  const dest = resolve(OUT, s.out);
  const [w, h] = s.px ?? [px(s.w), px(s.h)];
  try {
    execFileSync(CHROME, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--default-background-color=00000000',
      `--force-device-scale-factor=${s.scale}`,
      `--window-size=${w},${h}`,
      `--screenshot=${dest}`,
      '--virtual-time-budget=6000',
      url,
    ], { stdio: 'pipe', timeout: 120000 });
    console.log(`✓ ${s.out}  ${w * s.scale}×${h * s.scale}px  ${s.px ? '(屏幕页)' : `(${s.w}×${s.h}mm)`}`);
  } catch (e) {
    console.error(`✗ ${s.out} — ${String(e.message ?? e).split('\n')[0]}`);
    console.error(`  dev server 起了吗？ ${url}`);
  }
}
