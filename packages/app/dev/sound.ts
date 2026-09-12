/**
 * 声音靶场 —— `/dev/sound.html`。
 *
 * 它回答的那一个问题：**每一层声音真的在跟着它那一个信号走吗？**
 * 第五层（离散接触音）换一个问法：**这一记听起来对不对**，
 * 以及它有没有在观众做那个动作的时候响。
 *
 * 两半，缺一不可：
 *
 *  上半「靶场」  实时。手动把每个信号推到任意值（在场 / 速度 / jerk / 玩法 /
 *                升档 / 慢回路等待），耳朵听，电平表看。没有真人也能把
 *                每一层单独逼出来 —— 否则"升档的声音"只能靠真的升一次档才听得到。
 *                第五层是四个按钮，按一下响一记，外加一个连打按钮 ——
 *                那一条只有连着按才验得出来。
 *
 *  下半「取证」  离线。用 `OfflineAudioContext` 把同一份图跑完整段，画成
 *                波形 + 频谱。项目负责人没法在自动化环境里听，所以声音必须
 *                变成**看得见**的东西；图上看得出层在随信号起落，才算有证据。
 *
 * 取证图由 `window.__soundEvidence()` 导出成 dataURL，截图脚本直接存盘。
 */
import { mountPageHead } from '../src/ui/page.ts';
import { createSound } from '../src/sound/sound.ts';
import type { SoundSignal } from '../src/sound/signal.ts';
import { SCENARIOS, renderScenario, toWav } from '../src/sound/render.ts';
import {
  CUE_IDS, CUE_LABELS, CUE_SHEET, createCues, loadCueBuffers, renderCues,
} from '../src/sound/cues.ts';
import type { LayerId } from '../src/sound/graph.ts';
import type { PresenceState, Tier } from '../../core/src/types.ts';
import './sound.css';

mountPageHead({
  title: '声音',
  titleEn: 'Sound',
  note: '四层合成声各绑一个信号，第五层是绑在动作上的离散接触音。'
    + '上半手动推信号 / 逐记试听用耳朵验，下半离线渲染用眼睛验。',
});

const page = document.createElement('div');
page.className = 'sb-page';
page.style.paddingTop = '0';
document.body.append(page);

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K, cls?: string, text?: string,
): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

// ── 上半 · 靶场 ────────────────────────────────────────────────────────────

const signal: SoundSignal = {
  presence: 'ALIVE', transition: 1, speed: 0, jerk: 0, energy: 0,
  actId: 'follow', waiting: false,
};

const sound = createSound({ muted: new URLSearchParams(location.search).get('mute') === '1', seed: 0x50554e44 });

const grid = el('div', 'sb-sound-grid');
page.append(grid);

const left = el('div');
const right = el('div');
grid.append(left, right);

function block(parent: HTMLElement, title: string): HTMLElement {
  const b = el('div', 'sb-sound-block');
  b.append(el('h2', undefined, title));
  parent.append(b);
  return b;
}

/** 一组互斥按钮。返回一个"把某个值设成当前"的函数，用来同步高亮 */
function choices<T extends string>(
  parent: HTMLElement, items: readonly { id: T; label: string }[], onPick: (id: T) => void, initial: T,
): void {
  const row = el('div', 'sb-sound-btns');
  const btns = items.map(({ id, label }) => {
    const b = el('button', undefined, label);
    b.type = 'button';
    b.addEventListener('click', () => {
      for (const other of btns) other.classList.remove('is-on');
      b.classList.add('is-on');
      onPick(id);
    });
    if (id === initial) b.classList.add('is-on');
    return b;
  });
  row.append(...btns);
  parent.append(row);
}

function slider(parent: HTMLElement, label: string, max: number, onInput: (v: number) => void): void {
  const row = el('div', 'sb-sound-row');
  const input = el('input');
  input.type = 'range';
  input.min = '0';
  input.max = String(max);
  input.step = String(max / 200);
  input.value = '0';
  const out = el('output', undefined, '0.00');
  input.addEventListener('input', () => {
    const v = Number(input.value);
    out.textContent = v.toFixed(2);
    onInput(v);
  });
  row.append(el('label', undefined, label), input, out);
  parent.append(row);
}

const presenceBlock = block(left, '第一层 · 在场（Presence）');
choices<PresenceState>(presenceBlock, [
  { id: 'IDLE', label: '无人 IDLE' },
  { id: 'ENTERING', label: '进场 ENTERING' },
  { id: 'ALIVE', label: '在场 ALIVE' },
  { id: 'LEAVING', label: '离场 LEAVING' },
], (id) => { signal.presence = id; signal.transition = id === 'ENTERING' ? 1 : id === 'LEAVING' ? 0.5 : 1; }, 'ALIVE');

const motionBlock = block(left, '第二层 · 运动（MotionFeatures）');
slider(motionBlock, 'speed', 2, (v) => { signal.speed = v; });
slider(motionBlock, 'jerk', 20, (v) => { signal.jerk = v; });
slider(motionBlock, 'energy', 3, (v) => { signal.energy = v; });

const actBlock = block(left, '玩法（改的是身体层的音色）');
choices(actBlock, [
  { id: 'follow', label: 'follow 跟随' },
  { id: 'echo', label: 'echo 回声' },
  { id: 'resist', label: 'resist 迟滞' },
  { id: 'facing', label: 'facing 对视' },
], (id) => { signal.actId = id; }, 'follow');

const eventBlock = block(right, '第三层 · 事件（tierChanged）');
const tierRow = el('div', 'sb-sound-btns');
for (const t of [1, 2, 3] as Tier[]) {
  const b = el('button', undefined, `升到 tier ${t}`);
  b.type = 'button';
  b.addEventListener('click', () => sound.tierUp(t));
  tierRow.append(b);
}
const graftBtn = el('button', undefined, '零件到位（S6 确认音）');
graftBtn.type = 'button';
graftBtn.addEventListener('click', () => sound.grafted());
tierRow.append(graftBtn);
eventBlock.append(tierRow);

const waitBlock = block(right, '第四层 · 慢回路等待');
const waitRow = el('div', 'sb-sound-btns');
const waitBtn = el('button', undefined, '慢回路在跑');
waitBtn.type = 'button';
waitBtn.addEventListener('click', () => {
  signal.waiting = !signal.waiting;
  waitBtn.classList.toggle('is-on', signal.waiting);
});
const muteBtn = el('button', undefined, '静音（= 按 m）');
muteBtn.type = 'button';
muteBtn.addEventListener('click', () => { muteBtn.classList.toggle('is-on', sound.toggleMute()); });
waitRow.append(waitBtn, muteBtn);
waitBlock.append(waitRow);

// 第五层的靶场。它回答的问题和上面四块不一样：四层问"跟着信号走了吗"，
// 这里问"**这一记听起来对不对**" —— 一个只能靠耳朵回答的问题，
// 所以这一块就是四个按钮，按一下响一声，没有滑杆。
// `hotkey: false`：这一页自己要用键盘，不能被 `m` 抢走。
const cueSound = createCues({ muted: new URLSearchParams(location.search).get('mute') === '1', hotkey: false });
const cueBlock = block(right, '第五层 · 离散接触音（素材，见 assets/sound/README.md）');
const cueNote = el('p', 'sb-status', '素材在后台解码；灰掉的那一记是没加载上 —— 那不是故障，是 P3 的静默跳过');
cueBlock.append(cueNote);
const cueRow = el('div', 'sb-sound-btns');
const cueBtns = CUE_IDS.map((id) => {
  const b = el('button', undefined, `${id} · ${CUE_LABELS[id]}`);
  b.type = 'button';
  b.disabled = true;
  b.addEventListener('click', () => cueSound.play(id));
  cueRow.append(b);
  return [id, b] as const;
});
cueBlock.append(cueRow);
// 连打那一条只有连着按才验得出来：单击是听不出 passRepeatDecay 的
const passBurst = el('button', undefined, 'pass ×6 连打（验 passMinGapMs / 渐远）');
passBurst.type = 'button';
passBurst.addEventListener('click', () => {
  for (let i = 0; i < 6; i++) setTimeout(() => cueSound.play('pass'), i * 90);
});
cueRow.append(passBurst);

const meterBlock = block(right, '电平表');
const status = el('p', 'sb-status', '点一下页面任意处解锁音频（浏览器要求用户手势）');
meterBlock.append(status);
const fills: Record<string, HTMLElement> = {};
const nums: Record<string, HTMLElement> = {};
const LAYER_NAMES: Record<LayerId, string> = { room: '房间', body: '身体', event: '事件', wait: '等待' };
for (const id of Object.keys(LAYER_NAMES) as LayerId[]) {
  const m = el('div', 'sb-meter');
  const bar = el('div', 'sb-meter__bar');
  const fill = el('div', 'sb-meter__fill');
  bar.append(fill);
  const num = el('div', 'sb-meter__num', '0.00');
  m.append(el('div', 'sb-meter__name', LAYER_NAMES[id]), bar, num);
  meterBlock.append(m);
  fills[id] = fill;
  nums[id] = num;
}

let last = performance.now();
function tick(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  sound.update(signal, dt);
  for (const id of Object.keys(LAYER_NAMES) as LayerId[]) {
    const v = Math.min(1, Math.max(0, sound.levels[id]));
    fills[id].style.transform = `scaleX(${v.toFixed(3)})`;
    nums[id].textContent = v.toFixed(2);
  }
  status.textContent = `音频状态：${sound.state}`;
  // 解码是异步的，所以按钮的可用状态每帧跟一次 —— 比给 createCues 加一个
  // onReady 回调简单，而且这一页本来就在跑帧循环
  for (const [id, b] of cueBtns) b.disabled = !cueSound.ready[id];
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ── 下半 · 离线取证 ────────────────────────────────────────────────────────

/** 原地 radix-2 FFT。不值得为一张频谱图引一个依赖（AGENTS.md：不加依赖） */
function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
      }
    }
  }
}

const INK = '#dfe4ea';
const DIM = '#9aa0a6';
const PAPER = '#0e0f12';
const RULE = '#2a3038';

function drawWave(canvas: HTMLCanvasElement, buf: AudioBuffer): void {
  const w = 1200, h = 120;
  canvas.width = w; canvas.height = h;
  const g = canvas.getContext('2d')!;
  g.fillStyle = PAPER; g.fillRect(0, 0, w, h);

  // 每秒一条细线：没有时间刻度的波形图没法和"第几秒发生了什么"对上
  g.strokeStyle = RULE; g.lineWidth = 1;
  g.fillStyle = DIM; g.font = '11px ui-monospace, monospace';
  for (let s = 1; s < buf.duration; s++) {
    const x = Math.round((s / buf.duration) * w) + 0.5;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
    if (s % 2 === 0) g.fillText(`${s}s`, x + 3, 12);
  }

  const data = buf.getChannelData(0);
  const per = Math.max(1, Math.floor(data.length / w));
  g.fillStyle = INK;
  for (let x = 0; x < w; x++) {
    let lo = 1, hi = -1;
    for (let i = x * per; i < Math.min(data.length, (x + 1) * per); i++) {
      if (data[i] < lo) lo = data[i];
      if (data[i] > hi) hi = data[i];
    }
    if (hi < lo) continue;
    const y0 = (0.5 - hi / 2) * h;
    const y1 = (0.5 - lo / 2) * h;
    g.fillRect(x, y0, 1, Math.max(1, y1 - y0));
  }
}

/**
 * 频谱的纵轴是**对数**的。线性纵轴在这件作品上没用：四层的能量大半挤在
 * 1kHz 以下（房间 <1.2k、身体共振 260–1450、等待层 ~50–75Hz），
 * 线性画出来全糊在最下面那几行，看不出谁是谁。
 */
const F_MIN = 40, F_MAX = 12000;
const DB_FLOOR = -72;

function drawSpectrogram(canvas: HTMLCanvasElement, buf: AudioBuffer): void {
  const N = 1024, hop = Math.max(256, Math.floor(buf.sampleRate / 60));
  const data = buf.getChannelData(0);
  const cols = Math.max(1, Math.floor((data.length - N) / hop));
  const rows = 240;
  canvas.width = cols; canvas.height = rows;
  const g = canvas.getContext('2d')!;
  const img = g.createImageData(cols, rows);

  // 每一行对应的 bin（含小数），预先算好 —— 每列重算一遍是纯浪费
  const binOf = new Float32Array(rows);
  for (let y = 0; y < rows; y++) {
    const f = F_MIN * Math.pow(F_MAX / F_MIN, 1 - y / (rows - 1));
    binOf[y] = (f * N) / buf.sampleRate;
  }

  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  const re = new Float32Array(N), im = new Float32Array(N);
  const mag = new Float32Array(N / 2);

  for (let c = 0; c < cols; c++) {
    const off = c * hop;
    for (let i = 0; i < N; i++) { re[i] = (data[off + i] ?? 0) * win[i]; im[i] = 0; }
    fft(re, im);
    for (let b = 0; b < N / 2; b++) mag[b] = Math.hypot(re[b], im[b]) / N;

    for (let y = 0; y < rows; y++) {
      const b = binOf[y];
      const i0 = Math.min(mag.length - 2, Math.floor(b));
      const m = mag[i0] + (mag[i0 + 1] - mag[i0]) * (b - i0);
      const db = 20 * Math.log10(m + 1e-9);
      const v = Math.min(1, Math.max(0, (db - DB_FLOOR) / -DB_FLOOR));
      const p = (y * cols + c) * 4;
      // 纸色 → 强调色 → 白：低能量仍然看得见形状，高能量不糊成一片
      const over = Math.max(0, v - 0.72) / 0.28;
      img.data[p] = 14 + v * 113 + over * 128;
      img.data[p + 1] = 15 + v * 164 + over * 76;
      img.data[p + 2] = 18 + v * 195 + over * 42;
      img.data[p + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}

const evidence = el('div');
evidence.style.marginTop = 'calc(var(--sb-gutter) * 2)';
evidence.append(el('h2', 'sb-label', '离线取证 · OfflineAudioContext'));
page.append(evidence);

/** id → 画好的两张图 + 整段波形。`proves` 一起存：拼档案图时要写在标题下面 */
const rendered = new Map<string, {
  canvases: HTMLCanvasElement[]; buffer: AudioBuffer; proves: string;
}>();

async function renderCard(sc: { id: string; proves: string }, render: () => Promise<AudioBuffer>): Promise<void> {
  const card = el('div', 'sb-ev');
  card.id = `ev-${sc.id}`;
  card.append(
    el('h3', undefined, sc.id),
    el('p', undefined, `${sc.proves} · 上波形，下频谱（纵轴 ${F_MIN}Hz–${F_MAX / 1000}kHz，对数）`),
  );
  const wave = el('canvas');
  const spec = el('canvas');
  card.append(wave, spec);

  const dl = el('div', 'sb-sound-btns');
  const wav = el('button', undefined, '导出 wav');
  wav.type = 'button';
  card.append(dl);
  dl.append(wav);
  evidence.append(card);

  const buffer = await render();
  drawWave(wave, buffer);
  drawSpectrogram(spec, buffer);
  rendered.set(sc.id, { canvases: [wave, spec], buffer, proves: sc.proves });

  wav.addEventListener('click', () => {
    const url = URL.createObjectURL(toWav(buffer));
    const a = el('a');
    a.href = url;
    a.download = `sound-${sc.id}.wav`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

/**
 * 串行渲染。并行会同时开 8 个 OfflineAudioContext ——
 * 在这一页上没有任何好处，却足以让弱一点的机器上整页卡住。
 */
/**
 * 第五层的那一张。它和上面八张的差别在于**声音不是算出来的，是文件**，
 * 所以这一张证明的是另一件事：四记确实解码出来了、四记的相对轻重是设计里那四个数、
 * 连打的三记一记比一记轻、idle 那一记的高频确实被削掉了（频谱上直接看得见）。
 *
 * 走的仍然是 `renderCues()` —— 和现场 `play()` 同一组增益、同一道低通。
 */
async function renderCueCard(): Promise<void> {
  const buffers = await loadCueBuffers();
  const missing = CUE_IDS.filter((id) => !buffers[id]);
  const order = CUE_SHEET.map((c) => `${c.id}@${c.at}s`).join(' · ');
  await renderCard({
    id: 'cues',
    proves: missing.length
      ? `离散音只解码出 ${CUE_IDS.length - missing.length}/4 记（缺 ${missing.join('、')}）—— 缺的那几记在图上就是没有`
      : `四记离散接触音，按 ${order} 排；pass 连打三记逐次变轻，idle 比 commit 更轻也更闷`,
  }, () => renderCues(buffers));
}

void (async () => {
  for (const sc of SCENARIOS) await renderCard(sc, () => renderScenario(sc));
  await renderCueCard();
  (globalThis as { __soundReady?: boolean }).__soundReady = true;
  console.info('[dev/sound] 取证渲染完成', [...SCENARIOS.map((s) => s.id), 'cues'].join(','));
})();

/**
 * 把一个场景拼成一张可以直接存档的图：标题 + 它证明什么 + 波形 + 频谱。
 * 拼成一张而不是两张，是因为**波形和频谱必须放在一起看** ——
 * 波形说"什么时候有多少能量"，频谱说"那是哪一层"，单独一张都能被误读。
 */
function sheet(sc: { id: string; proves: string }, canvases: HTMLCanvasElement[]): HTMLCanvasElement {
  const W = 1200, head = 46, waveH = 120, specH = 240;
  const out = el('canvas');
  out.width = W;
  out.height = head + waveH + 6 + specH;
  const g = out.getContext('2d')!;
  g.fillStyle = PAPER; g.fillRect(0, 0, out.width, out.height);
  g.fillStyle = INK; g.font = '600 16px ui-monospace, monospace';
  g.fillText(sc.id, 10, 20);
  g.fillStyle = DIM; g.font = '13px ui-monospace, monospace';
  g.fillText(sc.proves, 10, 38);
  g.imageSmoothingEnabled = false;      // 频谱按列采样，插值只会把细节抹掉
  g.drawImage(canvases[0], 0, head, W, waveH);
  const top = head + waveH + 6;
  g.drawImage(canvases[1], 0, top, W, specH);

  // 频率刻度。没有它，"那条亮带是身体层还是房间层"只能靠猜
  g.strokeStyle = 'rgba(154,160,166,0.35)';
  g.fillStyle = DIM;
  g.font = '11px ui-monospace, monospace';
  const span = Math.log(F_MAX / F_MIN);
  for (const f of [100, 300, 1000, 3000, 10000]) {
    const y = Math.round(top + (1 - Math.log(f / F_MIN) / span) * specH) + 0.5;
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    g.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, 4, y - 3);
  }
  return out;
}

/** 截图脚本的抓手：每个场景一张合成图的 dataURL */
(globalThis as Record<string, unknown>).__soundEvidence = (): Record<string, string> => {
  const out: Record<string, string> = {};
  // 遍历 rendered 而不是 SCENARIOS：第五层不是一个 Scenario（它的声音是文件不是图），
  // 但它一样要出一张档案图。以"画出来了什么"为准，不以"计划画什么"为准
  for (const [id, r] of rendered) {
    out[`sound-${id}`] = sheet({ id, proves: r.proves }, r.canvases).toDataURL('image/png');
  }
  return out;
};

/** 同样给截图脚本：把一段 wav 变成 base64，存进 scratch/evidence/ */
(globalThis as Record<string, unknown>).__soundWav = async (id: string): Promise<string | null> => {
  const r = rendered.get(id);
  if (!r) return null;
  const buf = await toWav(r.buffer).arrayBuffer();
  let s = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};
