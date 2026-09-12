/**
 * Hyper3D / Rodin API 客户端。
 * 事实依据：docs/07-HYPER3D-API.md（实读文档 + 实打接口，不要凭记忆改）。
 *
 * 设计要点：
 *  - 应用层错误走 body 不走 HTTP 状态码 → isAccepted() 三条都要满足
 *  - /status 用 subscription_key，/download 用顶层 uuid，搞反会 NO_SUCH_TASK
 *  - 429 必须读 Retry-After
 *  - API_PARALLELISM_LIMIT_REACHED 是账号并发闸门，要自动降并发
 */

const BASE = 'https://api.hyper3d.com/api/v2';

export interface SubmitResponse {
  message?: string;
  uuid?: string;
  jobs?: { uuids: string[]; subscription_key: string };
  consumed?: number;
  error?: string;
}

export interface JobStatus {
  uuid: string;
  status: 'Waiting' | 'Generating' | 'Done' | 'Failed';
  queue_length?: number;
}

export interface DownloadItem { name: string; url: string; }

export interface RodinParams {
  prompt?: string;
  images?: { name: string; data: Uint8Array | Buffer; type?: string }[];
  tier?: string;
  mesh_mode?: 'Raw' | 'Quad';
  quality_override?: number;
  material?: 'PBR' | 'Shaded' | 'All' | 'Hybrid' | 'None';
  geometry_file_format?: 'glb' | 'usdz' | 'fbx' | 'obj' | 'stl';
  seed?: number;
  bbox_condition?: [number, number, number];
  is_symmetric?: 'symmetric' | 'balanced' | 'asymmetric' | 'unknown';
  geometry_instruct_mode?: 'faithful' | 'creative';
  texture_mode?: string;
  TAPose?: boolean;
  image_label?: string[];
  addons?: string[];
  /** true = 下载列表里额外给一张高质量渲染图。我们用它做主题 anchor（docs/07 §4A） */
  preview_render?: boolean;
  soft?: boolean;
  detail_level?: number;
  quad_normal?: boolean;
  hd_texture?: boolean;
  uhd_texture?: boolean;
  texture_delight?: boolean;
  use_original_alpha?: boolean;
}

export class RodinError extends Error {
  code: string;
  retriable: boolean;
  constructor(code: string, message: string, retriable = false) {
    super(`${code}: ${message}`);
    this.code = code;
    this.retriable = retriable;
  }
}

/** 这些错误码重试没有意义 */
const FATAL = new Set([
  'INVALID_REQUEST',
  'IMAGE_CONTENT_VIOLATION',
  'IMAGE_LABEL_LENGTH_TOO_LONG',
  'API_NO_ACTIVE_SUBSCRIPTION',
  'API_SUBSCRIPTION_PLAN_TOO_LOW',
  'PERMISSION_DENIED',
  'API_OBJECT_NOT_FOUND_ON_IMAGE',
]);
/** 这个错误码意味着"等一等再来"，而不是失败 */
export const PARALLELISM = 'API_PARALLELISM_LIMIT_REACHED';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function apiKey(): string {
  const k = process.env.RODIN_API_KEY;
  if (!k) throw new Error('RODIN_API_KEY 未设置。用 `node --env-file=.env ...` 运行。');
  return k;
}

async function request(path: string, init: RequestInit, attempt = 0): Promise<any> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey()}`, ...(init.headers ?? {}) },
  });

  // 传输层
  if (res.status === 429) {
    const wait = Number(res.headers.get('retry-after') ?? 10);
    if (attempt >= 5) throw new RodinError('RATE_LIMIT', 'too many 429', false);
    process.stderr.write(`  429 → 等待 ${wait}s (Retry-After)\n`);
    await sleep(wait * 1000);
    return request(path, init, attempt + 1);
  }
  if (res.status >= 500) {
    if (attempt >= 4) throw new RodinError('SERVER', `HTTP ${res.status}`, false);
    const wait = 2 ** attempt * 1000;
    await sleep(wait);
    return request(path, init, attempt + 1);
  }
  if (res.status === 401) throw new RodinError('UNAUTHORIZED', 'bad API key', false);

  const text = await res.text();
  let body: any;
  try { body = JSON.parse(text); } catch { throw new RodinError('BAD_JSON', text.slice(0, 200), false); }

  // 应用层：HTTP 201 也可能是失败
  if (body?.error) {
    const code = String(body.error);
    throw new RodinError(code, body.message ?? '', !FATAL.has(code));
  }
  if (!res.ok) throw new RodinError('HTTP_' + res.status, text.slice(0, 200), false);
  return body;
}

export async function checkBalance(): Promise<number> {
  const b = await request('/check_balance', { method: 'GET' });
  return b.balance;
}

export async function submit(p: RodinParams): Promise<{ uuid: string; subscriptionKey: string; consumed: number }> {
  const fd = new FormData();
  const put = (k: string, v: unknown) => { if (v !== undefined && v !== null) fd.append(k, String(v)); };

  put('tier', p.tier ?? 'Gen-2.5-Low');
  put('prompt', p.prompt);
  put('mesh_mode', p.mesh_mode ?? 'Raw');
  put('quality_override', p.quality_override);
  put('material', p.material);
  put('geometry_file_format', p.geometry_file_format ?? 'glb');
  put('seed', p.seed);
  put('is_symmetric', p.is_symmetric);
  put('geometry_instruct_mode', p.geometry_instruct_mode);
  put('texture_mode', p.texture_mode);
  if (p.TAPose !== undefined) put('TAPose', p.TAPose);
  if (p.preview_render !== undefined) put('preview_render', p.preview_render);
  if (p.soft !== undefined) put('soft', p.soft);
  if (p.detail_level !== undefined) put('detail_level', p.detail_level);
  if (p.quad_normal !== undefined) put('quad_normal', p.quad_normal);
  if (p.hd_texture !== undefined) put('hd_texture', p.hd_texture);
  if (p.uhd_texture !== undefined) put('uhd_texture', p.uhd_texture);
  if (p.texture_delight !== undefined) put('texture_delight', p.texture_delight);
  if (p.use_original_alpha !== undefined) put('use_original_alpha', p.use_original_alpha);
  if (p.bbox_condition) fd.append('bbox_condition', JSON.stringify(p.bbox_condition));
  // ⚠ 数组字段必须作为 JSON 字符串发，服务端对它们做 JSON.parse。
  // 用重复 form 字段发 image_label 会得到 HTTP 500 + "'?' is not valid JSON"（docs/07 §3）。
  if (p.image_label?.length) fd.append('image_label', JSON.stringify(p.image_label));
  if (p.addons?.length) fd.append('addons', JSON.stringify(p.addons));
  for (const img of p.images ?? []) {
    fd.append('images', new Blob([new Uint8Array(img.data)], { type: img.type ?? 'image/png' }), img.name);
  }

  const body: SubmitResponse = await request('/rodin', { method: 'POST', body: fd });

  // isAccepted：三条都要满足（docs/07 §1）
  if (!body.uuid || !body.jobs?.subscription_key) {
    throw new RodinError('NO_UUID', JSON.stringify(body).slice(0, 200), false);
  }
  return { uuid: body.uuid, subscriptionKey: body.jobs.subscription_key, consumed: body.consumed ?? 0 };
}

export async function status(subscriptionKey: string): Promise<JobStatus[]> {
  const body = await request('/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription_key: subscriptionKey }),
  });
  return body.jobs ?? [];
}

export async function download(taskUuid: string): Promise<DownloadItem[]> {
  const body = await request('/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_uuid: taskUuid }),
  });
  return body.list ?? [];
}

export interface WaitOptions {
  firstDelayMs?: number;   // 文档建议首次至少 5s
  intervalMs?: number;
  timeoutMs?: number;
  onTick?: (jobs: JobStatus[], elapsedMs: number) => void;
  /**
   * 允许部分失败。一次提交会拆成多个 job（几何/贴图/渲染各一个），
   * 实测 preview_render 的那个 job 会单独失败而几何是好的 —— 这时不该扔掉整个任务。
   */
  allowPartial?: boolean;
}

/** 轮询直到全部 Done；任一 Failed 立即抛错；超时抛 TIMEOUT。 */
export async function waitForDone(subscriptionKey: string, opt: WaitOptions = {}): Promise<JobStatus[]> {
  const first = opt.firstDelayMs ?? 5000;
  const every = opt.intervalMs ?? 3000;
  const timeout = opt.timeoutMs ?? 8 * 60_000;
  const t0 = Date.now();
  await sleep(first);
  for (;;) {
    const jobs = await status(subscriptionKey);
    opt.onTick?.(jobs, Date.now() - t0);
    if (jobs.length && jobs.every((j) => j.status === 'Done')) return jobs;
    const failed = jobs.filter((j) => j.status === 'Failed');
    if (failed.length) {
      const rest = jobs.filter((j) => j.status !== 'Failed');
      const restDone = rest.length > 0 && rest.every((j) => j.status === 'Done');
      if (opt.allowPartial && restDone) return jobs;        // 部分失败但其余已完成：继续去下载
      if (!opt.allowPartial || failed.length === jobs.length) {
        throw new RodinError('JOB_FAILED', jobs.map((j) => `${j.uuid}:${j.status}`).join(','), false);
      }
    }
    if (Date.now() - t0 > timeout) throw new RodinError('TIMEOUT', `${Math.round((Date.now() - t0) / 1000)}s`, false);
    await sleep(every);
  }
}

/** 提交 + 等待 + 下载，返回文件的 {name, bytes}。遇到并发上限会自己等。 */
export async function generateOne(
  p: RodinParams,
  hooks: { onSubmitted?: (uuid: string, consumed: number) => void; onTick?: WaitOptions['onTick']; allowPartial?: boolean } = {},
): Promise<{ uuid: string; consumed: number; files: { name: string; bytes: Uint8Array }[] }> {
  let uuid = '', subscriptionKey = '', consumed = 0;
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await submit(p);
      uuid = r.uuid; subscriptionKey = r.subscriptionKey; consumed = r.consumed;
      break;
    } catch (e) {
      if (e instanceof RodinError && e.code === PARALLELISM && attempt < 30) {
        await sleep(15_000);
        continue;
      }
      throw e;
    }
  }
  hooks.onSubmitted?.(uuid, consumed);
  await waitForDone(subscriptionKey, { onTick: hooks.onTick, allowPartial: hooks.allowPartial });
  const list = await download(uuid);
  const files: { name: string; bytes: Uint8Array }[] = [];
  for (const item of list) {
    const res = await fetch(item.url);
    if (!res.ok) throw new RodinError('DOWNLOAD_FAILED', `${item.name} HTTP ${res.status}`, true);
    files.push({ name: item.name, bytes: new Uint8Array(await res.arrayBuffer()) });
  }
  return { uuid, consumed, files };
}
