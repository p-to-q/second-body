/**
 * 文案总册 —— 全项目所有面向观众的文字，都在这一个文件里。
 *
 * ## 为什么是"对照"而不是"切换"
 *
 * 语言切换器要求观众先做一个选择，然后**看不到另一半**。
 * 并置（中英同时在场）是美术馆和档案的做法：不打断、不要求选择，
 * 而且双语本身构成排版的一部分 —— 两行不同灰度的文字，本来就是这套
 * International Typographic Style 的常见构型。
 *
 * 所以没有 `setLang()`，只有 `bi()`。这是一个设计决定，不是省事。
 *
 * ## 纪律
 *
 * - **面向观众的字符串一律从这里取**，不许散在组件里（否则永远有几句没翻译）。
 * - 中文是原文，英文是对照 —— 不是反过来。这件作品的思考是用中文进行的。
 * - 英文不要"翻译腔"：宁可换一个说法，也不要逐字对应。
 * - 调试/开发者面向的文字**不进这里**（`?debug=1` 的 HUD、控制台）—— 那些只给我们自己看。
 */

export interface BiText { zh: string; en: string; }

export const bi = (zh: string, en: string): BiText => ({ zh, en });

/** 渲染成并置的 HTML 片段。中文为主、英文为辅 */
export function biHtml(t: BiText, tag = 'span'): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
  return `<${tag} class="sb-bi"><span class="sb-zh">${esc(t.zh)}</span>` +
         `<span class="sb-en">${esc(t.en)}</span></${tag}>`;
}

/** 写进 DOM 元素（比 innerHTML 安全，且不用自己转义） */
export function setBi(el: Element | null, t: BiText): void {
  if (!el) return;
  el.textContent = '';
  el.classList.add('sb-bi');
  const zh = document.createElement('span'); zh.className = 'sb-zh'; zh.textContent = t.zh;
  const en = document.createElement('span'); en.className = 'sb-en'; en.textContent = t.en;
  el.append(zh, en);
}

// ─────────────────────────── 文案 ───────────────────────────

export const COPY = {
  /** 作品 */
  title: bi('看我看你', 'SEE-ME SEE-YOU'),
  subtitle: bi(
    '你选一个物种，然后它用你的身体活过来',
    'Choose a species. It comes alive using your body.',
  ),

  /** S0 启动 —— 观众正常看不到这些 */
  boot: {
    slow: bi('稍等一下', 'One moment'),
    failed: bi('出了点问题，正在恢复', 'Something went wrong. Recovering.'),
    fallbackRender: bi('降级渲染', 'Reduced rendering'),
    noCamera: bi('用我的摄像头', 'Use my camera'),
    demoRunning: bi('正在播放录制片段', 'Playing a recording'),
  },

  /** S1 空场 */
  attract: {
    invite: bi('站到画面里', 'Step into the frame'),
    inviteWeb: bi('打开摄像头，站到画面里', 'Turn on your camera and step into the frame'),
  },

  /** S2 选择 */
  choose: {
    prompt: bi('选一个身体', 'Choose a body'),
    auto: bi('即将自动选择', 'Choosing for you'),
    kinds: {
      archetype: bi('物种', 'Archetype'),
      character: bi('角色', 'Character'),
      guest: bi('嘉宾', 'Guest'),
    },
    axes: {
      humanLike: bi('像人', 'Human-like'),
      lifeLike: bi('像活的', 'Life-like'),
    },
  },

  /** S4 共舞 —— 唯一一句功能性文案，而且会自己消失 */
  live: {
    stepBack: bi('往后一点', 'Step back'),
  },

  /** S7 离场 / 留念 */
  leave: {
    keepsake: bi('带走这具身体', 'Take this body with you'),
    seed: bi('编号', 'Seed'),
  },

  /** 身体方案 */
  plans: {
    rig: bi('人形', 'Humanoid'),
    quadruped: bi('四足', 'Quadruped'),
    mass: bi('团块', 'Mass'),
    stub: bi('矮壮', 'Stub'),
    towering: bi('高瘦', 'Towering'),
    inverted: bi('倒置', 'Inverted'),
  },

  /** 档案页 */
  archive: {
    title: bi('档案', 'Archive'),
    species: bi('物种谱系', 'Species'),
    parts: bi('部件', 'Parts'),
    slot: bi('槽位', 'Slot'),
    tier: bi('阶段', 'Tier'),
    bodyPlan: bi('身体方案', 'Body plan'),
    count: bi('件数', 'Count'),
    curation: bi('策展', 'Curation'),
    keep: bi('保留', 'Keep'),
    reject: bi('剔除', 'Reject'),
    unrated: bi('未评', 'Unrated'),
  },

  /** 隐私 —— 网页版必须在页面上（docs/13 §5） */
  privacy: {
    short: bi(
      '画面不离开你的浏览器',
      'Video never leaves your browser',
    ),
    long: bi(
      '姿态识别全部在本地运行。唯一会上传的是你主动触发的那一张剪影，不保存、不关联身份。',
      'Pose estimation runs entirely on your device. The only thing ever uploaded is a single silhouette you trigger yourself — not stored, not linked to you.',
    ),
    optOut: bi('不参与', 'Opt out'),
  },
} as const;
