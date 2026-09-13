/**
 * 选哪一台摄像头（`?cam=`）—— 纯函数那一半。
 *
 * ## 它解决的那一个问题
 *
 * 现场是一台外接摄像头对着观众、一台笔记本内置摄像头对着墙。
 * `getUserMedia({video:{width,height}})` 不带 `deviceId`，拿到的是**浏览器挑的那台**，
 * 而浏览器挑哪台跟"哪台对着人"毫无关系。在这之前，操作员唯一的办法是拔线
 * 或者去改系统设置 —— 一件装置不该要求它的现场负责人去动操作系统。
 *
 * ## 支持两种写法，因为它们服务于两个不同的人
 *
 * | 写法 | 例 | 谁在用 |
 * |---|---|---|
 * | 序号 | `?cam=1` | **人**，站在现场，还不知道那台叫什么。开 `?debug=1&cam=0`、`?cam=1` 一台台试过去 |
 * | deviceId（可用唯一前缀） | `?cam=3f9a1c0b` | **启动脚本**。deviceId 在同一台机器 + 同一个浏览器 profile 下是稳定的，换了 USB 口也还是它 —— 这是唯一可复现的写法，装置的开机 URL 应该用它 |
 *
 * 序号是易变的（插拔一次就可能全错位），所以它是"找"的工具，不是"钉"的工具。
 * 找到之后，把 HUD 上打出来的 deviceId 前缀写进开机 URL，那一行才不会隔夜失效。
 *
 * ## 认不出来的值 = null，和 `?scene=` / `?shading=` / `?model=` 同一条规矩
 *
 * `?cam=1.5`、`?cam=-1`、`?cam=前面那台` 一律解析成 null（等于没写），
 * 而不是"猜一个最像的"。手滑写错和参数没生效必须分得开。
 *
 * ## 而"认出来了但那台不在" 是另一回事，必须**吵**
 *
 * 外接摄像头被拔掉时装置**照样要跑**（P3：降级路径必须存在），但它不能安静地
 * 跑在内置摄像头上对着墙演一整晚。所以 `describeCamera()` 拿的是
 * **实际那条 track 的 deviceId**，不是我们请求的那个 —— 报的是现实，不是意图（P21）。
 * 对不上就是 `fallback`，HUD 上是红的。
 *
 * 浏览器相关的那一半（enumerateDevices / getUserMedia）在 `webcam.ts`。
 * 拆开是为了这一半能被测：`mediaDevices` 在 node 里没法伪造，而这些判断才是会错的地方。
 */

/** enumerateDevices() 里一条 videoinput。权限之前 `label` 是空串、`deviceId` 往往也是 */
export interface CamDevice {
  readonly deviceId: string;
  readonly label: string;
}

/** `?cam=` 的两种形态。解析不出来就没有这个对象（null） */
export type CamPick =
  | { readonly kind: 'index'; readonly index: number }
  | { readonly kind: 'id'; readonly id: string };

/** 为什么用的是这一台 */
export type CamWhy =
  /** 没写 `?cam=`，浏览器默认 */
  | 'default'
  /** 写了，而且拿到的就是它 */
  | 'asked'
  /** 写了，但现在跑着的不是它 —— 外接摄像头被拔了 / 序号错位 / 前缀不唯一 */
  | 'fallback';

export interface CamStatus {
  readonly label: string;
  readonly why: CamWhy;
  /** 原样的 `?cam=` 值，null = 没写 */
  readonly asked: string | null;
  /** 实际那条 track 的 deviceId（拿不到就是空串） */
  readonly deviceId: string;
  /** HUD 上那一行的正文 */
  readonly hud: string;
}

/**
 * deviceId 是浏览器生成的 base64 风格串。这里只用来**拒绝明显不是**的输入，
 * 不是在校验它存不存在 —— 存不存在只有 enumerateDevices() 说了算。
 */
const CAM_ID_RE = /^[A-Za-z0-9+/=_-]{1,256}$/;

/** deviceId 在 HUD / 日志里截断到这么长：足够人肉分辨，又不至于把那一行撑爆 */
const ID_SHOWN = 8;

export function parseCam(raw: string | null | undefined): CamPick | null {
  if (raw === null || raw === undefined) return null;
  const v = raw.trim();
  if (!v) return null;                          // `?cam=` 空值 = 没写，不是"第 0 台"
  if (/^-\d+$/.test(v)) return null;            // `?cam=-1`：像序号但不是序号，不许当成 deviceId 蒙混过去
  if (/^\d+$/.test(v)) {
    const n = Number(v);
    return Number.isSafeInteger(n) ? { kind: 'index', index: n } : null;
  }
  return CAM_ID_RE.test(v) ? { kind: 'id', id: v } : null;
}

/** `?cam=` 的值能不能认出来。给 `shell/kiosk.ts` 用，和 `isSceneId` / `isShadingId` 同一个位置 */
export function isCamFlag(raw: string | null | undefined): boolean {
  return parseCam(raw) !== null;
}

/**
 * 把 `?cam=` 落到具体一台设备上。落不到就是 null（调用方于是不加 deviceId 约束）。
 *
 * 没有 deviceId 的条目直接不算数：权限给之前 enumerateDevices() 会返回
 * 一条 deviceId 为空串的占位条目，按序号取到它、再拿空串去约束，是个会静默生效的错。
 */
export function pickCamera(devices: readonly CamDevice[], raw: string | null): CamDevice | null {
  const p = parseCam(raw);
  if (!p) return null;
  const real = devices.filter((d) => d.deviceId !== '');
  if (p.kind === 'index') return real[p.index] ?? null;
  const exact = real.find((d) => d.deviceId === p.id);
  if (exact) return exact;
  // 前缀必须唯一。两台都匹配时宁可落空（→ 大声回落），也不替操作员猜
  const hit = real.filter((d) => d.deviceId.startsWith(p.id));
  return hit.length === 1 ? hit[0] : null;
}

/** 人能读的那个名字。权限之前 label 是空串，只好退到 deviceId 前缀 */
export function camName(d: CamDevice | null | undefined): string {
  if (!d) return '未知摄像头';
  if (d.label) return d.label;
  return d.deviceId ? `#${d.deviceId.slice(0, ID_SHOWN)}` : '未知摄像头';
}

/**
 * 报现在**实际**在用哪一台，以及它是不是操作员要的那一台。
 *
 * `actualDeviceId` 必须来自 `track.getSettings().deviceId` —— 也就是现实。
 * 如果这里拿的是"我们请求的那个 id"，那么外接摄像头被拔掉、浏览器悄悄换了一台的时候，
 * 这个 HUD 会显示得和一切正常时**一模一样**，那它就不是个仪表了（P21）。
 */
export function describeCamera(
  devices: readonly CamDevice[],
  raw: string | null,
  actualDeviceId: string,
): CamStatus {
  const actual = devices.find((d) => d.deviceId !== '' && d.deviceId === actualDeviceId) ?? null;
  const name = camName(actual);
  const asked = parseCam(raw) ? raw!.trim() : null;

  if (!asked) {
    return { label: name, why: 'default', asked: null, deviceId: actualDeviceId, hud: name };
  }
  const wanted = pickCamera(devices, asked);
  if (wanted && wanted.deviceId === actualDeviceId && actualDeviceId !== '') {
    return { label: name, why: 'asked', asked, deviceId: actualDeviceId, hud: `${name}  ← ?cam=${asked}` };
  }
  // 要的那台不在（或者根本没能切过去）。这一行必须让人一眼看出"现在拍的不是你要的"
  const why = wanted ? '切换失败' : '找不到';
  return {
    label: name,
    why: 'fallback',
    asked,
    deviceId: actualDeviceId,
    hud: `${name}  ← ?cam=${asked} ${why}，用的不是你要的那台`,
  };
}

/**
 * 开机时往控制台打一次的全表。现场没有第二块屏幕能开 devtools 的话，
 * HUD 那一行也够用；有的话这张表才是"1 到底是谁"的答案。
 */
export function formatCameraList(devices: readonly CamDevice[], chosen: CamStatus): string[] {
  const real = devices.filter((d) => d.deviceId !== '');
  const lines = real.map((d, i) => {
    const here = d.deviceId === chosen.deviceId ? ' ← 现在用的' : '';
    return `  ?cam=${i}  ?cam=${d.deviceId.slice(0, ID_SHOWN)}  ${camName(d)}${here}`;
  });
  if (!lines.length) lines.push('  （枚举不到任何 videoinput —— 权限没给，或者机器上真的没有摄像头）');
  return lines;
}
