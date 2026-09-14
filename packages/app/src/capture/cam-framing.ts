/**
 * 摄像头自带的取景（Chrome / 系统的 auto framing、Center Stage、W3C `faceFraming`）—— **读它、按开关请求它，永不因为它出事**。
 *
 * docs/49 §1.3 / §3.1 / §6.3 三。三件事，都是纯的或者只碰一条 track：
 *
 *  1. `?camframing=auto|on|off`（`shell/kiosk.ts` 认字，这里定义值）。默认 `auto`：**不替谁打开**，
 *     它对准的是脸，会把腿裁掉（§3.1）。`on` / `off` 只在 `getCapabilities().faceFraming` 里真有那个值时才请求；
 *     `off` 的用处是撤掉系统级默认打开（前提是浏览器把开关交出来）。
 *  2. `applyCamFraming()`：摄像头开起来之后调一次。**永不抛、永不挡启动**：每一个 track 方法都包住，
 *     `applyConstraints` 带超时（它在某些驱动上会一直不 resolve）。
 *  3. `readCamFraming()`：同步读 `getSettings().faceFraming`，采集端每秒调一次 —— 用户在控制中心里开关 Center Stage 不会通知页面。
 *
 * `pan` / `tilt` / `zoom` **只读能力，不请求**：请求它们要在 `getUserMedia` 里多要一次"控制摄像头移动"的权限，
 * 而 docs/49 §3.2 的裁定是装置不动云台。读出来只是给 HUD 看"这台摄像头能不能"。
 *
 * 为什么不进控件条：见 docs/49 §6.3 三最后一段（稳定版 Chrome 不暴露 `faceFraming`，按下去什么都不发生）。
 */

export type CamFramingFlag = 'auto' | 'on' | 'off';
export const CAM_FRAMING_FLAGS: readonly CamFramingFlag[] = ['auto', 'on', 'off'];
export const isCamFramingFlag = (v: unknown): v is CamFramingFlag =>
  typeof v === 'string' && (CAM_FRAMING_FLAGS as readonly string[]).includes(v);

/** 一条 track 上和取景有关的能力。浏览器不给的字段一律当"没有" */
export interface CamFramingCaps {
  /** `faceFraming` 能取的值。null = 这个浏览器 / 这台摄像头根本不认这个约束 */
  faceFraming: readonly boolean[] | null;
  pan: boolean;
  tilt: boolean;
  zoom: boolean;
}

const NO_CAPS: CamFramingCaps = { faceFraming: null, pan: false, tilt: false, zoom: false };

/** `MediaStreamTrack.getCapabilities()` 的原样返回 → 能力。形状不对就当没有（规范写的是 sequence<boolean>，实现可能给单个 boolean） */
export function readCaps(raw: unknown): CamFramingCaps {
  if (!raw || typeof raw !== 'object') return NO_CAPS;
  const r = raw as Record<string, unknown>;
  const ff = r.faceFraming;
  const faceFraming = Array.isArray(ff) ? ff.filter((v): v is boolean => typeof v === 'boolean')
    : typeof ff === 'boolean' ? [ff] : null;
  const has = (k: string): boolean => r[k] !== undefined && r[k] !== null && r[k] !== false;
  return { faceFraming: faceFraming && faceFraming.length ? faceFraming : null, pan: has('pan'), tilt: has('tilt'), zoom: has('zoom') };
}

/**
 * 这个开关要不要请求、请求什么。`null` = 什么都不请求（`auto`，或者这台摄像头给不了那个值）。
 * **带上当前的约束**：`applyConstraints` 会把没写进去的基本约束重置成默认值 —— 只写 `{ faceFraming }` 的话，
 * `getUserMedia` 时要的 1280×720 和点名的那台摄像头会被一起丢掉。
 */
export function framingConstraints(flag: CamFramingFlag, caps: CamFramingCaps, current: unknown): Record<string, unknown> | null {
  if (flag === 'auto') return null;
  const want = flag === 'on';
  if (!caps.faceFraming?.includes(want)) return null;
  const base = current && typeof current === 'object' ? (current as Record<string, unknown>) : {};
  return { ...base, faceFraming: want };
}

/** 请求那一下的结局 */
export type CamFramingApplied = 'none' | 'ok' | 'failed' | 'unsupported';

export interface CamFramingStatus {
  flag: CamFramingFlag;
  /** 这条 track 认 `faceFraming` */
  supported: boolean;
  /** 摄像头此刻**报告**自己在取景。null = 不知道（不支持，或者读不到） */
  active: boolean | null;
  applied: CamFramingApplied;
  /** 这台摄像头报了哪些 pan / tilt / zoom 能力（只读） */
  ptz: string[];
  /** HUD `cam` 行后面接的那一段 */
  hud: string;
}

export function describeCamFraming(flag: CamFramingFlag, caps: CamFramingCaps, settingsFaceFraming: unknown, applied: CamFramingApplied): CamFramingStatus {
  const supported = caps.faceFraming !== null;
  const active = typeof settingsFaceFraming === 'boolean' ? settingsFaceFraming : null;
  const ptz = (['pan', 'tilt', 'zoom'] as const).filter((k) => caps[k]);
  const state = active === true ? '摄像头在取景' : active === false ? '摄像头没在取景' : supported ? '取景状态读不到' : '不支持 faceFraming';
  const note = applied === 'failed' ? ' ⚠ 请求失败' : applied === 'unsupported' ? ' · 请求不了' : '';
  return { flag, supported, active, applied, ptz, hud: `camframing=${flag} · ${state}${note}${ptz.length ? ` · ptz ${ptz.join('/')}` : ''}` };
}

/** 只碰 track 的那几个方法。node 测试里用假对象 */
export interface TrackLike {
  getCapabilities?(): unknown;
  getSettings?(): unknown;
  getConstraints?(): unknown;
  applyConstraints?(c: Record<string, unknown>): Promise<void>;
}

const safe = <T>(f: () => T): T | undefined => { try { return f(); } catch { return undefined; } };

/** 同步读一次。永不抛 */
export function readCamFraming(track: TrackLike | null | undefined, flag: CamFramingFlag, applied: CamFramingApplied = 'none'): CamFramingStatus {
  const caps = readCaps(safe(() => track?.getCapabilities?.()));
  const settings = safe(() => track?.getSettings?.()) as Record<string, unknown> | undefined;
  return describeCamFraming(flag, caps, settings?.faceFraming, applied);
}

/**
 * 摄像头开起来之后调一次：按开关请求（能请求的话），然后读回实际状态。**永不 reject**，最多等 `timeoutMs`。
 */
export async function applyCamFraming(track: TrackLike | null | undefined, flag: CamFramingFlag, timeoutMs = 1500): Promise<CamFramingStatus> {
  let applied: CamFramingApplied = 'none';
  try {
    const caps = readCaps(safe(() => track?.getCapabilities?.()));
    const cons = framingConstraints(flag, caps, safe(() => track?.getConstraints?.()));
    if (cons && typeof track?.applyConstraints === 'function') {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          Promise.resolve().then(() => track.applyConstraints!(cons)),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeoutMs); }),
        ]);
        applied = 'ok';
      } catch {
        applied = 'failed';
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    } else if (flag !== 'auto') {
      applied = 'unsupported';
    }
  } catch {
    applied = 'failed';
  }
  return readCamFraming(track, flag, applied);
}
