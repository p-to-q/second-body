/**
 * 慢回路的前端那一半（docs/17 §8）。
 *
 * 这条回路是整件作品唯一的排他主张：**把实时 AI 3D 生成放进交互里**。
 * 2019 年那件原作的回路是「身体 → 形态」，里面没有 AI；我们加的第二条回路是
 * 「你的剪影 → 3D 生成 → 属于你那一档的零件 → 热插接到身上」。
 *
 * 但它必须**永远不能伤到快回路**。慢回路失败的正确表现是"什么都没发生" ——
 * 观众根本不知道刚才有东西在跑（P3）。所以这里的每一条路径都通向同一个终点：
 * `disabled = true`，本次会话不再尝试，快回路一帧都不受影响。
 *
 * 404 是**正常答案**，不是错误：线上 Web 构建里根本没有这个端点（它是 `apply:'serve'`
 * 的 dev/kiosk 中间件）。装置跑在一台有 factory 的本地机器上 —— 这条回路
 * 从来不需要 serverless，`SlowJob.url` 的注释里早就写着"由 localhost 代理提供"。
 */
import type * as THREE from 'three/webgpu';

import { SLOW_LOOP } from '../../../core/src/tuning.ts';
import { SLOT_OF_BONE } from '../../../core/src/slots.ts';
import type { PartMeta, SlotKey, Slot, SlowJob } from '../../../core/src/types.ts';

/** 慢回路只需要身体的这一个能力；不要在这里依赖整个 BodyInstance */
export interface Graftable {
  graft(slot: SlotKey, meta: PartMeta, geometry: THREE.BufferGeometry): void;
}

export interface SlowLoopDeps {
  /** 最近一帧的人像 mask；没有就是没有（回放模式、ImageSegmenter 起不来） */
  mask(): ImageBitmap | null;
  /** 当前物种 id，决定血统池落在谁名下 */
  species(): string;
  /** 把 glb 地址变成几何。复用 library 的 loader —— meshopt decoder 必须是同一个 */
  loadGeometry(url: string): Promise<THREE.BufferGeometry>;
  body(): Graftable | null;
}

export type SlowPhase = 'idle' | 'armed' | 'running' | 'grafted' | 'off';

export interface SlowLoop {
  /** 每帧调用。alive = presence 处于 ALIVE。不 throw、不 await */
  update(alive: boolean, dt: number): void;
  /** 人走了：清计时，但**不**清 disabled（预算是按会话算的，重置会绕过它） */
  reset(): void;
  /** 开场组 genome 之前拉一次前人留下的件 */
  lineage(species: string): Promise<PartMeta[]>;
  readonly phase: SlowPhase;
  /** 给 debug HUD 看的一句话；观众永远看不到它 */
  readonly note: string;
  readonly sessionId: string;
}

const slotKeyOf = (slot: Slot): SlotKey => {
  // spine/head 这类槽位名恰好也是骨头名；其余要反查。
  // 反查表只有一份（core/src/slots.ts），这里不重建。
  for (const [bone, s] of Object.entries(SLOT_OF_BONE)) if (s === slot) return bone as SlotKey;
  return 'spine';
};

/**
 * mask（白形黑底的 ImageBitmap）→ PNG Blob。
 *
 * 为什么要重画一遍而不是直接传原始 bitmap：ImageBitmap 不能直接当 body 发出去，
 * 而且 MediaPipe 的 mask 是镜像前的相机画面 —— 参考图要的是观众看到的那个朝向。
 */
async function maskToPng(mask: ImageBitmap): Promise<Blob | null> {
  const c = document.createElement('canvas');
  c.width = mask.width; c.height = mask.height;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.translate(c.width, 0);
  ctx.scale(-1, 1);                       // 和舞台一样镜像：参考图要跟观众自己看到的一致
  ctx.drawImage(mask, 0, 0);
  return new Promise((res) => c.toBlob((b) => res(b), 'image/png'));
}

/** 每个请求都带超时。慢回路卡住不许拖住任何东西，包括它自己 */
const withTimeout = (url: string, init?: RequestInit) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(SLOW_LOOP.requestTimeoutMs) });

export function createSlowLoop(deps: SlowLoopDeps): SlowLoop {
  // 匿名、每次会话新生成、不落盘、不关联任何人（docs/17 §8 纪律 4）
  const sessionId = Math.random().toString(36).slice(2, 10);
  let disabled = false;
  let phase: SlowPhase = 'idle';
  let note = '';
  let aliveFor = 0;
  let used = 0;
  let busy = false;

  const off = (why: string) => { disabled = true; phase = 'off'; note = why; };

  async function run(): Promise<void> {
    const bitmap = deps.mask();
    // 没有 mask 不是故障：回放模式本来就没有，ImageSegmenter 起不来也照样跑姿态。
    // 但没有参考图就没有"从这个人长出来的"，所以这一次不做，等下一次。
    if (!bitmap) { note = '等 mask'; return; }

    busy = true;
    used += 1;
    phase = 'running';
    try {
      const png = await maskToPng(bitmap);
      if (!png) return off('canvas 出不了 PNG');

      const species = deps.species();
      const slot = SLOW_LOOP.targetSlots[0] ?? 'spine';
      const q = `slot=${encodeURIComponent(slot)}&session=${sessionId}&species=${encodeURIComponent(species)}`;
      const res = await withTimeout(`/__slow?${q}`, { method: 'POST', body: png });
      // 404 = 这个构建里没有慢回路，是正常答案；其余非 2xx 多半是预算闸门
      if (!res.ok) return off(res.status === 404 ? '本构建无慢回路' : `提交被拒 ${res.status}`);

      let job = (await res.json()) as SlowJob;
      for (let i = 0; i < SLOW_LOOP.maxPolls && job.status !== 'ready' && job.status !== 'failed'; i++) {
        await new Promise((r) => setTimeout(r, SLOW_LOOP.pollIntervalMs));
        const s = await withTimeout(`/__slow/${encodeURIComponent(job.id)}`);
        if (!s.ok) return off(`查询失败 ${s.status}`);
        job = (await s.json()) as SlowJob;
        note = `${job.status} ${i + 1}/${SLOW_LOOP.maxPolls}`;
      }
      if (job.status !== 'ready' || !job.url || !job.meta) {
        // error 是给 HUD 的人话，不弹给观众（docs/17 §8 纪律 1）
        return off(job.error ?? (job.status === 'failed' ? '生成失败' : '轮询超时'));
      }

      const geometry = await deps.loadGeometry(job.url);
      const target = deps.body();
      // 身体可能已经换过了（人走了、升档重建）。这时候接上去是错的，静静丢掉。
      if (!target) return off('身体不在了');
      target.graft(slotKeyOf(job.meta.slot), job.meta, geometry);
      phase = 'grafted';
      note = `已接上 ${job.meta.id}`;
    } catch (e) {
      off(e instanceof Error ? e.message : String(e));
    } finally {
      busy = false;
    }
  }

  return {
    get phase() { return phase; },
    get note() { return note; },
    sessionId,

    update(alive, dt) {
      if (disabled || busy) return;
      if (!alive) { aliveFor = 0; return; }
      aliveFor += dt;
      if (aliveFor < SLOW_LOOP.armAfter) return;
      if (used >= SLOW_LOOP.maxPerSession) return;
      if (phase === 'idle') phase = 'armed';
      // 故意不 await：慢回路的任何状态都不允许影响这一帧（纪律 3）
      void run();
    },

    reset() {
      aliveFor = 0;
      used = 0;
      if (phase === 'grafted' || phase === 'armed') phase = 'idle';
    },

    async lineage(species) {
      try {
        const r = await withTimeout(`/__slow/lineage?species=${encodeURIComponent(species)}`);
        if (!r.ok) return [];      // 生产构建下就是 404，正常
        const j = (await r.json()) as { parts?: PartMeta[] };
        return Array.isArray(j.parts) ? j.parts : [];
      } catch { return []; }       // 血统是锦上添花，永远不许挡住开场
    },
  };
}
