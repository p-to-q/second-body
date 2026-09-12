/**
 * 慢回路引擎 —— 观众剪影 → Rodin → 规范化 → 血统池。
 * 协议见 docs/17-SLOW-LOOP.md，HTTP 外壳在 slow-http.ts，接线在 packages/app/vite.config.ts。
 *
 * 为什么住在 factory 而不是 serverless：
 * `SlowJob.url` 的契约注释写的是「由 localhost 代理提供」。装置跑在一台本地机器上，
 * 那台机器上就有 factory —— key 在 Node 侧（P8）、glb 落在本地盘、规范化用的是**同一份**
 * 流水线代码。云函数版本要么把这三件事各抄一遍，要么把 929MB 的工具链塞进 lambda。
 *
 * 三条硬约束（顺序就是它们的重要性）：
 *  1. 花钱的口子必须在 Node 侧兜住 —— 前端的冷却是礼貌，`SLOW_LOOP.maxCredits*` 是钱。
 *  2. 任务**绝不允许**永远停在 generating。每个任务都挂一个墙钟看门狗。
 *  3. 产物必须过完整的规范化。运行时的挂载数学是无分支的（docs/04），
 *     它假设主轴 +Y / socketA 在原点 / 长度 1.0。不规范化的件挂上去就是错的。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { PartMeta, Slot, SlowJob, SlowJobStatus } from '../../core/src/types.ts';
import { SLOW_LOOP } from '../../core/src/tuning.ts';
import { ROOT, PARTS_DIR } from './ledger.ts';
import { normalizeOne } from './normalize.ts';
import { recipeById } from '../recipes/catalog.ts';
import { checkBalance, generateOne, RodinError } from './rodin.ts';

// ─────────────────────────── 血统池的数据形状 ───────────────────────────

export interface LineageEntry {
  /** = PartMeta.id，形如 `spine.porcelain.lin7f3a2c` —— 沿用 <slot>.<theme>.<variant> 命名，
   *  这样它落进 genome 的候选池时和主库的件没有区别 */
  id: string;
  /** 哪个任务产的 */
  job: string;
  /** 谁触发的。**匿名** session 号，由前端给或由服务端生成；不含任何身份信息 */
  session: string;
  createdAt: string;
  /** 哪个物种（= PartMeta.family）*/
  species: string;
  slot: Slot;
  credits: number;
  provider: 'hyper3d' | 'fake';
  meta: PartMeta;
}

export interface LineagePool {
  version: 1;
  entries: LineageEntry[];
  /** 'YYYY-MM-DD' → 当天预扣/实耗的 credits。日闸门读它 */
  spend: Record<string, number>;
  /** 当天每个 session 花掉的 credits 与触发次数。跨天整体清空（见 rollDay） */
  sessionsDay: string;
  sessions: Record<string, number>;
  /**
   * 次数闸门。credits 闸门挡不住它：假客户端（也包括将来任何免费/缓存路径）花 0 credits，
   * 于是"每人一次"在钱上永远是 0 —— 而 SLOW_LOOP.maxPerSession 说的是**次数**。
   * 失败会退回一次，所以生成坏了的人不算用掉了他那一次。
   */
  attempts: Record<string, number>;
  totalCredits: number;
}

const EMPTY_POOL = (): LineagePool => ({
  version: 1, entries: [], spend: {}, sessionsDay: '', sessions: {}, attempts: {}, totalCredits: 0,
});

// ─────────────────────────── 生成客户端（可注入） ───────────────────────────

export interface SlowRequest {
  mask: Uint8Array;
  slot: Slot;
  species: string;
  seed: number;
}

export interface SlowResult {
  glb: Uint8Array;
  uuid?: string;
  /** 实际消耗的 credits。假客户端恒为 0 */
  consumed: number;
}

export interface SlowClient {
  name: 'hyper3d' | 'fake';
  generate(req: SlowRequest): Promise<SlowResult>;
}

/**
 * 真客户端。参数不自己发明：借**同物种同槽位**已有配方的 prompt / bbox / 对称性，
 * 于是现场长出来的件和那个物种的主库件说同一种造型语言（docs/07 §4B）。
 * 借不到（物种没有该槽位配方）就退回一句通用提示 —— 能生成，只是风格弱一点。
 */
export function rodinClient(root = ROOT): SlowClient {
  // vite 的 .env 只进 import.meta.env（给浏览器的），Node 侧的 process.env 是空的 ——
  // 于是 `npm run dev` 起的中间件会拿不到 key，而 factory 的 CLI（--env-file=.env）拿得到。
  // Node 22 自带 loadEnvFile，不用为这一行加依赖。
  if (!process.env.RODIN_API_KEY) {
    try { process.loadEnvFile(resolve(root, '.env')); } catch { /* 没有 .env 就让 rodin.ts 去报那句人话 */ }
  }
  return {
    name: 'hyper3d',
    async generate(req) {
      const ref = recipeById(`${req.slot}.${req.species}.a`);
      const res = await generateOne({
        prompt: ref?.prompt
          ?? `a ${req.slot} part for a humanoid robot, hard surface, clean topology`,
        images: [{ name: 'silhouette.png', data: req.mask, type: 'image/png' }],
        // 剪影是正面一张图。docs/07 §3 第 1 条：数组字段必须是 JSON 字符串，submit() 已经这么发了
        image_label: ['F'],
        tier: 'Gen-2.5-Low',
        mesh_mode: 'Raw',
        // 面数预算与主库一致。注意 docs/07 §3 第 3 条：这**不是硬保证**，
        // 兜底在规范化里（容差焊接 + 逐级减面），不在这里。
        quality_override: 3000,
        material: 'None',
        geometry_file_format: 'glb',
        seed: req.seed,
        bbox_condition: ref?.bbox,
        is_symmetric: ref?.isSymmetric ?? 'symmetric',
        // 现场件用 creative：剪影是**一个人的轮廓**，faithful 会把它整个照抄成一个小人，
        // 而我们要的是"从这个轮廓长出来的一块躯干/头"。
        geometry_instruct_mode: 'creative',
      });
      const glb = res.files.find((f) => f.name.toLowerCase().endsWith('.glb'));
      if (!glb) throw new RodinError('NO_GLB', `下载列表里没有 glb：${res.files.map((f) => f.name).join(',')}`, false);
      return { glb: glb.bytes, uuid: res.uuid, consumed: res.consumed };
    },
  };
}

/**
 * 假客户端（`SLOW_FAKE=1`）。
 * 为什么必须有：这条回路每验证一次就烧一次真钱，而需要被反复验证的是它**后面**的部分 ——
 * 规范化、血统池、索引、失败矩阵。假客户端从主库随便挑一件同槽位的 glb 当"生成结果"，
 * 后续流程一步不少地全部走一遍。它验不了的只有 Rodin 本身。
 */
export function fakeClient(partsDir = PARTS_DIR): SlowClient {
  return {
    name: 'fake',
    async generate(req) {
      const all = existsSync(partsDir)
        ? readdirSync(partsDir).filter((f) => f.endsWith('.glb')).sort()
        : [];
      const sameSlot = all.filter((f) => f.startsWith(`${req.slot}.`));
      const pool = sameSlot.length ? sameSlot : all;
      if (!pool.length) throw new Error(`SLOW_FAKE：${partsDir} 里一件 glb 都没有，假客户端没东西可挑`);
      const pick = pool[req.seed % pool.length];
      return { glb: readFileSync(resolve(partsDir, pick)), consumed: 0 };
    },
  };
}

// ─────────────────────────── 预算与错误 ───────────────────────────

export type SlowRejectCode =
  | 'BAD_REQUEST' | 'BUDGET_JOB' | 'BUDGET_SESSION' | 'BUDGET_DAY' | 'DISABLED';

/** 提交被**当场拒绝**时抛它。HTTP 层把 code 直接吐给前端，不静默退化 */
export class SlowRejected extends Error {
  code: SlowRejectCode;
  httpStatus: number;
  constructor(code: SlowRejectCode, message: string, httpStatus = 429) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);

// ─────────────────────────── 引擎 ───────────────────────────

export interface SlowLoopOptions {
  /** 仓库根（测试指到临时目录，绝不往真的 assets/ 里写） */
  root?: string;
  client?: SlowClient;
  now?: () => number;
  /** 覆盖看门狗时长（测试用秒级值） */
  jobTimeoutMs?: number;
  /** 提交前查一次账户余额（真客户端默认开，假客户端默认关） */
  checkBalance?: boolean;
}

export interface SubmitInput {
  mask: Uint8Array;
  slot?: string;
  session?: string;
  species?: string;
}

export interface SlowLoop {
  submit(input: SubmitInput): SlowJob;
  get(id: string): SlowJob | undefined;
  /** glb 的绝对路径；不存在返回 undefined */
  partPath(id: string): string | undefined;
  lineage(opt?: { species?: string; limit?: number }): { parts: PartMeta[]; entries: LineageEntry[]; total: number };
  /** 等所有在跑的任务收敛 —— 只给测试用 */
  drain(): Promise<void>;
}

const ID_OK = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const JOB_ID = /^slow-[0-9a-z]+-[0-9a-f]{6}$/;

export function createSlowLoop(opt: SlowLoopOptions = {}): SlowLoop {
  const root = opt.root ?? ROOT;
  const partsDir = resolve(root, 'assets/parts');
  const lineDir = resolve(partsDir, SLOW_LOOP.lineageDir);
  const poolPath = resolve(lineDir, 'lineage.json');
  const fake = opt.client ? opt.client.name === 'fake' : process.env.SLOW_FAKE === '1';
  const client = opt.client ?? (fake ? fakeClient(partsDir) : rodinClient(root));
  const now = opt.now ?? Date.now;
  const jobTimeoutMs = opt.jobTimeoutMs ?? SLOW_LOOP.jobTimeoutMs;
  const wantBalance = opt.checkBalance ?? client.name === 'hyper3d';

  const jobs = new Map<string, SlowJob>();
  const running = new Set<Promise<void>>();

  // ── 血统池读写。坏了就从空开始，绝不因为索引读不出来而让现场的这条回路整个瘫掉 ──
  function loadPool(): LineagePool {
    if (!existsSync(poolPath)) return EMPTY_POOL();
    try {
      const p = JSON.parse(readFileSync(poolPath, 'utf8')) as LineagePool;
      return { ...EMPTY_POOL(), ...p };
    } catch {
      renameSync(poolPath, `${poolPath}.corrupt.${now()}`);
      return EMPTY_POOL();
    }
  }
  function savePool(p: LineagePool): void {
    mkdirSync(lineDir, { recursive: true });
    const tmp = `${poolPath}.tmp`;
    writeFileSync(tmp, JSON.stringify(p, null, 2));
    renameSync(tmp, poolPath);          // 原子替换（同 ledger.ts）
  }
  /** 跨天就把 session 账清空 —— 否则昨天来过的人今天永远触发不了 */
  function rollDay(p: LineagePool, today: string): LineagePool {
    if (p.sessionsDay !== today) { p.sessionsDay = today; p.sessions = {}; p.attempts = {}; }
    return p;
  }

  function reserve(session: string): { pool: LineagePool; today: string } {
    const cost = SLOW_LOOP.creditsPerJob;
    if (cost > SLOW_LOOP.maxCreditsPerJob) {
      throw new SlowRejected('BUDGET_JOB',
        `单次 ${cost} credits 超过上限 ${SLOW_LOOP.maxCreditsPerJob}`, 503);
    }
    const today = dayOf(now());
    const pool = rollDay(loadPool(), today);
    const tries = pool.attempts[session] ?? 0;
    if (tries >= SLOW_LOOP.maxPerSession) {
      throw new SlowRejected('BUDGET_SESSION',
        `本次会话已经触发过 ${tries} 次，上限 ${SLOW_LOOP.maxPerSession} 次`);
    }
    const bySession = pool.sessions[session] ?? 0;
    if (bySession + cost > SLOW_LOOP.maxCreditsPerSession) {
      throw new SlowRejected('BUDGET_SESSION',
        `本次会话已用 ${bySession} credits，再来一次会超过上限 ${SLOW_LOOP.maxCreditsPerSession}`);
    }
    const byDay = pool.spend[today] ?? 0;
    if (byDay + cost > SLOW_LOOP.maxCreditsPerDay) {
      throw new SlowRejected('BUDGET_DAY',
        `今天已用 ${byDay} credits，达到每日上限 ${SLOW_LOOP.maxCreditsPerDay}`);
    }
    // **先扣后跑**：并发提交必须撞在同一本账上，否则三个人同时按下去就是三倍支出。
    pool.attempts[session] = tries + 1;
    pool.sessions[session] = bySession + cost;
    pool.spend[today] = byDay + cost;
    savePool(pool);
    return { pool, today };
  }

  /** 对账：把预扣换成实耗（Rodin 返回的 consumed），并退回差额 */
  function settle(session: string, today: string, actual: number): void {
    const cost = SLOW_LOOP.creditsPerJob;
    const delta = actual - cost;
    if (delta === 0) return;
    const pool = loadPool();
    pool.sessions[session] = Math.max(0, (pool.sessions[session] ?? 0) + delta);
    pool.spend[today] = Math.max(0, (pool.spend[today] ?? 0) + delta);
    savePool(pool);
  }

  /** 任务失败 → 把预扣和那一次机会都退回去。没生成出东西就不该记账 */
  function refund(session: string, today: string): void {
    const pool = loadPool();
    pool.attempts[session] = Math.max(0, (pool.attempts[session] ?? 0) - 1);
    pool.sessions[session] = Math.max(0, (pool.sessions[session] ?? 0) - SLOW_LOOP.creditsPerJob);
    pool.spend[today] = Math.max(0, (pool.spend[today] ?? 0) - SLOW_LOOP.creditsPerJob);
    savePool(pool);
  }

  function fail(job: SlowJob, error: string): void {
    if (job.status === 'ready' || job.status === 'failed') return;   // 终态不可改写
    job.status = 'failed';
    job.error = error;
  }

  async function run(job: SlowJob, input: Required<Pick<SubmitInput, 'mask'>> & {
    slot: Slot; species: string; seed: number;
    /** 只用来写进血统池的那条痕迹；记账走下面两个闭包 */
    session: string;
    /** 结账：成功时按实耗对账，失败时全退。两个都只会生效一次（见 submit 里的 accounted） */
    settled(actual: number): void;
    refunded(): void;
  }): Promise<void> {
    try {
      if (wantBalance) {
        // 余额闸门与 generate.ts 同一条规矩：留缓冲，不要把账户打到 0
        const balance = await checkBalance();
        if (balance < SLOW_LOOP.creditsPerJob + SLOW_LOOP.balanceReserve) {
          throw new Error(`账户余额 ${balance} credits 不足（需要 ${SLOW_LOOP.creditsPerJob} + ${SLOW_LOOP.balanceReserve} 缓冲）`);
        }
      }
      job.status = 'generating';
      // 看门狗可能在我们等待时把它判死。每次回到这条线程都要先问一句"我还活着吗"，
      // 否则会把一个已经 failed 的任务复活成 ready，前端就会去 fetch 一个不该存在的件。
      const aborted = () => (job.status as SlowJobStatus) === 'failed';

      const res = await client.generate({
        mask: input.mask, slot: input.slot, species: input.species, seed: input.seed,
      });
      if (aborted()) return;

      // 原始件先落盘：规范化读文件不读内存，而且生成坏了时这份原始件是唯一的证据
      const rawDir = resolve(lineDir, '_raw');
      mkdirSync(rawDir, { recursive: true });
      const rawPath = resolve(rawDir, `${job.id}.glb`);
      writeFileSync(rawPath, res.glb);

      // **完整**规范化。省这一步等于交一件挂上去必然歪掉的件。
      const partId = `${input.slot}.${input.species}.lin${job.id.slice(-6)}`;
      const { meta, warnings } = await normalizeOne(partId, rawPath, {
        outDir: lineDir,
        file: `${SLOW_LOOP.lineageDir}/${partId}.glb`,
        slot: input.slot,
        tier: 3,                 // 现场件是 tier 3 的礼物：只有演化到顶的身体才配长出它
        family: input.species,
        symmetry: 'none',
        source: { provider: client.name === 'fake' ? 'fake' : 'hyper3d', model: 'Gen-2.5-Low', taskUuid: res.uuid, seed: input.seed },
      });
      rmSync(rawPath, { force: true });            // 原始件 20–90MB，不留在现场机器上过夜

      // 规范化跑完了但契约没达标 —— 这是"垃圾网格"那条路的出口。
      // 不要把它当成功交出去：挂上去是歪的，而观众只会觉得作品坏了。
      const fatal = warnings.filter((w) => w.startsWith('长度不是') || w.startsWith('socketA 不在原点') || w.startsWith('simplify 未达标'));
      if (fatal.length) throw new Error(`规范化未达标：${fatal.join('；')}`);

      if (aborted()) return;

      // 写血统池索引
      const pool = loadPool();
      pool.entries.push({
        id: partId, job: job.id, session: input.session, createdAt: new Date(now()).toISOString(),
        species: input.species, slot: input.slot, credits: res.consumed,
        provider: client.name, meta,
      });
      // 索引有上限，但**只丢索引条目不删 glb** —— 删文件是不可逆的，
      // 而"这件是谁留下的"这条痕迹一旦丢了就找不回来（文件还在盘上，可人工捡回）
      if (pool.entries.length > SLOW_LOOP.lineageMaxParts) {
        pool.entries = pool.entries.slice(-SLOW_LOOP.lineageMaxParts);
      }
      pool.totalCredits = +(pool.totalCredits + res.consumed).toFixed(3);
      savePool(pool);
      input.settled(res.consumed);

      job.meta = meta;
      job.url = `/__slow/part/${partId}.glb`;
      job.readyAt = now();
      job.status = 'ready';
    } catch (e) {
      input.refunded();
      const err = e as Error;
      const code = e instanceof RodinError ? e.code : '';
      fail(job, human(code, err.message));
    }
  }

  /** 把机器话翻成人话。观众看不见它，但现场的人要靠它判断该不该重试 */
  function human(code: string, message: string): string {
    switch (code) {
      case 'TIMEOUT': return `生成超时（${message}）—— Rodin 排队太长，稍后再试`;
      case 'RATE_LIMIT': return '被限流了（429 重试多次仍未通过），等几分钟再试';
      case 'API_PARALLELISM_LIMIT_REACHED': return '账号并发已满，等前一个任务完成';
      case 'API_INSUFFICIENT_FUNDS': return 'Rodin 账户余额不足';
      case 'API_OBJECT_NOT_FOUND_ON_IMAGE': return '剪影里没认出物体 —— 换一帧（人要整个在画面里）';
      case 'IMAGE_CONTENT_VIOLATION': return '这张剪影被内容策略拒绝了';
      case 'JOB_FAILED': return `Rodin 那边失败了（${message}）`;
      case 'NO_GLB': return '生成完成但下载列表里没有 glb';
      case 'UNAUTHORIZED': return 'RODIN_API_KEY 无效';
      default: return message || '未知错误';
    }
  }

  return {
    submit(input) {
      const slot = (input.slot ?? SLOW_LOOP.targetSlots[0]) as Slot;
      if (!SLOW_LOOP.targetSlots.includes(slot)) {
        throw new SlowRejected('BAD_REQUEST',
          `槽位 ${slot} 不在 SLOW_LOOP.targetSlots（${SLOW_LOOP.targetSlots.join('/')}）里`, 400);
      }
      if (!input.mask?.length) throw new SlowRejected('BAD_REQUEST', '剪影是空的', 400);
      const session = input.session && ID_OK.test(input.session)
        ? input.session
        : `anon-${randomBytes(4).toString('hex')}`;
      const species = input.species && ID_OK.test(input.species) ? input.species : 'unknown';

      const { today } = reserve(session);          // 超预算在这里抛，不会创建任务

      const t = now();
      const id = `slow-${t.toString(36)}-${randomBytes(3).toString('hex')}`;
      const job: SlowJob = { id, status: 'submitted', slot, submittedAt: t };
      jobs.set(id, job);

      // 看门狗：任何一步卡住（网络、下载、规范化）都由它把任务推进终态。
      // 不 unref 的话 node --test 会被它吊住不退出。
      // 这笔账只结一次：看门狗判死和任务自己失败可能先后都到，退两次就成了送钱
      let accounted = false;
      const refunded = () => { if (!accounted) { accounted = true; refund(session, today); } };
      const settled = (actual: number) => { if (!accounted) { accounted = true; settle(session, today, actual); } };

      const watchdog = setTimeout(() => {
        // 超时也要退：这个人什么都没拿到，不该算用掉了他那一次
        refunded();
        fail(job, `服务端等待超过 ${Math.round(jobTimeoutMs / 1000)}s，已放弃`);
      }, jobTimeoutMs);
      watchdog.unref?.();

      const seed = (t ^ (id.charCodeAt(id.length - 1) * 2654435761)) >>> 0;
      // 推到下一个微任务再跑：submit() 必须在**任何**生成工作开始前就返回，
      // 否则调用方拿到的第一个状态已经是 generating，"不阻塞"就只是嘴上说说
      const p = Promise.resolve()
        .then(() => run(job, { mask: input.mask, slot, species, session, seed: seed % 65536, settled, refunded }))
        .catch((e) => fail(job, String((e as Error).message ?? e)))
        .finally(() => { clearTimeout(watchdog); running.delete(p); });
      running.add(p);
      // 返回快照而不是那个会被后台改写的对象：调用方拿到的"提交时的状态"
      // 不该在它读到之前就悄悄变成 generating
      return { ...job };
    },

    get(id) {
      const j = JOB_ID.test(id) ? jobs.get(id) : undefined;
      return j ? { ...j } : undefined;
    },

    partPath(id) {
      // 只认自己生成的 id 形状 —— 挡住路径穿越（点后面必须还有字符，'..' 进不来）
      if (!/^[a-z]+(\.[a-z0-9_-]+)+$/i.test(id)) return undefined;
      const p = resolve(lineDir, `${id}.glb`);
      return p.startsWith(lineDir) && existsSync(p) ? p : undefined;
    },

    lineage(o = {}) {
      const pool = loadPool();
      let entries = pool.entries;
      if (o.species) entries = entries.filter((e) => e.species === o.species);
      const total = entries.length;
      // 新的排前面：血统是有方向的，最近的人留下的东西更可能还在被看见
      entries = entries.slice(-(o.limit ?? SLOW_LOOP.lineageServeLimit)).reverse();
      return { parts: entries.map((e) => e.meta), entries, total };
    },

    async drain() {
      while (running.size) await Promise.allSettled([...running]);
    },
  };
}
