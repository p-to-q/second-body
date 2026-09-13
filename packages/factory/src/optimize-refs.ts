/**
 * 主题 anchor 图的瘦身步骤。
 *
 * 为什么它在这里：`assets/refs/<theme>/_anchor.png` 是 `/dev/anchor.html` 渲出来的
 * 1024² 真彩 PNG，一张 ~290 KB。选择页（`src/choose/choose.ts`）在出卡片**之前**
 * 会把所有条目的 anchor 图一次性拉齐 —— 于是 21 张图 = 6.1 MB **全在**「到第一具身体」
 * 的关键路径上，比部件本身还重。实测这是首屏里最大的一块。
 *
 * 为什么不转 WebP：`choose.ts` 里的 URL 是写死的 `_anchor.png`，
 * 而 `src/choose/` 这轮不归我改。所以路径和容器都保持 PNG 不变，
 * 只降分辨率 + 调色板量化。
 *
 * 为什么这两件事看不出来：这张图不是被原样贴在屏幕上的。它先被 `cards.ts` cover 裁进
 * 1024×512 的卡，再被 `choose/ring/atlas.ts` 拼进图集的一格 —— **一格只有 512×256**，
 * 而环本身是一个片元着色器里的距离场（`ring/sdf.ts`），卡片在那上面还会被融、被拉丝。
 * 所以 768 的源在落地之前已经再缩掉一半，量化噪声进不了观众的眼睛。
 *
 * （这段理由**换过一次**：原来写的是"对一个抖动轮播（dither-carousel）来说看不出来"。
 * 那个轮播已经不存在了 —— 首屏换成了移植自 Viscose-carousel 的 SDF 环，`docs/35-VISCOSE.md`。
 * 结论没变，但支撑它的是图集那一格的 512×256，不是早就删掉的抖动。）
 *
 * 为什么是 768 / 256 色（`SIZE` / `COLORS`，以那两个常量为准）：卡片是 1024×512 的 cover 裁切（`cards.ts` CARD_W/CARD_H），
 * 源图只有横向 1024 会被用满。实测 21 张总量 6.12 MB → 1.00 MB。
 *
 * 依赖的是系统里的 `ffmpeg` / `oxipng`（素材流水线工具，不是运行时依赖）。
 * 缺哪个就直接说缺哪个并退出 —— 半做完的素材比没做更难查。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from './ledger.ts';

const REFS_DIR = resolve(ROOT, 'assets/refs');

const SIZE = 768;
const COLORS = 256;

function has(bin: string): boolean {
  try { execFileSync('which', [bin], { stdio: 'ignore' }); return true; } catch { return false; }
}

export function optimizeRefs(opt: { dryRun?: boolean } = {}): void {
  if (!existsSync(REFS_DIR)) { console.log('没有 assets/refs/，跳过'); return; }
  for (const bin of ['ffmpeg', 'oxipng']) {
    if (!has(bin)) { console.error(`缺少 ${bin}（brew install ${bin}）—— 不动任何文件`); process.exitCode = 1; return; }
  }

  const dirs = readdirSync(REFS_DIR).filter((d) => existsSync(resolve(REFS_DIR, d, '_anchor.png')));
  let before = 0, after = 0, done = 0, skipped = 0;

  for (const dir of dirs) {
    const file = resolve(REFS_DIR, dir, '_anchor.png');
    const b = statSync(file).size;
    before += b;
    // 幂等判据用**分辨率**，不用字节数：已经降到 768 的图再跑一遍就是二次量化，
    // 抖动噪声会叠加。字节数做不了这个判据 —— 256 色下最大的一张就有 99 KB。
    const w = Number(execFileSync('sips', ['-g', 'pixelWidth', file]).toString().match(/pixelWidth:\s*(\d+)/)?.[1] ?? 0);
    if (w && w <= SIZE) { after += b; skipped++; continue; }
    if (opt.dryRun) { after += b; console.log(`  · ${dir} ${w}px ${(b / 1e3).toFixed(0)} KB → 会被处理`); continue; }

    // ffmpeg 拒绝原地改写（输入=输出直接报错），所以走临时文件再替换。
    const pal = resolve(REFS_DIR, dir, '_palette.tmp.png');
    const tmp = resolve(REFS_DIR, dir, '_anchor.tmp.png');
    try {
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file,
        '-vf', `scale=${SIZE}:-1:flags=lanczos,palettegen=max_colors=${COLORS}:stats_mode=full`, pal]);
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-i', pal,
        '-lavfi', `scale=${SIZE}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=floyd_steinberg`, tmp]);
      execFileSync('oxipng', ['-q', '-o', '4', '--strip', 'safe', tmp]);
      renameSync(tmp, file);
      after += statSync(file).size;
      done++;
    } catch (e) {
      after += statSync(file).size;
      console.error(`  ✗ ${dir}: ${(e as Error).message}`);
    } finally {
      for (const f of [pal, tmp]) if (existsSync(f)) unlinkSync(f);
    }
  }

  const pct = before ? (1 - after / before) * 100 : 0;
  console.log(`anchor 图 ${done} 张瘦身（跳过 ${skipped} 张已达标的）：`
    + `${(before / 1e6).toFixed(2)} MB → ${(after / 1e6).toFixed(2)} MB，省 ${pct.toFixed(0)}%`);
}
