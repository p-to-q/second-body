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

  /**
   * 入口层（网页版）—— 展签，不是落地页。
   * `docs/23 §S0 网页分支` + `docs/PRD §8`：**不要求授权也能看见东西**。
   * 所以这里只有三样东西：作品是什么、进去、了解它。没有第四样。
   */
  entry: {
    credit: bi('实时交互装置 · 2026', 'Real-time interactive installation · 2026'),
    enter: bi('开始', 'Enter'),
    learn: bi('了解这件作品', 'About this work'),
  },

  /** 作品陈述页 `/about` —— 面向观众和评委，不是面向开发者 */
  about: {
    back: bi('回到作品', 'Back to the work'),
    credit: bi('实时交互装置 · 2026', 'Real-time interactive installation · 2026'),

    /** 两种状态标记。**这是这一页最重要的机制**：分清"已经在跑"和"只写了规格" */
    built: bi('已实现', 'Built'),
    spec: bi('规格', 'Specified'),
    legend: bi(
      '标注「规格」的部分只写了设计，还没有实现。这一页不写没做到的事。',
      'Anything marked “Specified” is designed but not yet built. This page does not claim what is not done.',
    ),

    // ── 它是什么 ──────────────────────────────────────────────────────
    whatTitle: bi('它是什么', 'What it is'),
    whatLead: bi(
      '一台摄像头认出你的身体。屏幕上一具等身的合成身体跟着你动；你动得越多，它长得越复杂。',
      'A camera finds your body. A life-size synthetic body moves as you move — and the more you move, the more elaborate it grows.',
    ),
    ninety: bi('观众的 90 秒', 'Ninety seconds'),
    steps: {
      see: bi('看见', 'See'),
      seeNote: bi('空场里一团粒子在呼吸', 'A field of particles, breathing'),
      choose: bi('选择', 'Choose'),
      chooseNote: bi('在形态空间里滚过物种', 'Scroll a space of species'),
      become: bi('成为', 'Become'),
      becomeNote: bi('等身、镜像、200 毫秒以内', 'Life-size, mirrored, under 200 ms'),
      discover: bi('发现', 'Discover'),
      discoverNote: bi('它升档，开始长自己的零件', 'It escalates, and grows parts of its own'),
      leave: bi('带走', 'Leave'),
      leaveNote: bi('一个编号，扫码带走', 'A seed, taken away by phone'),
    },

    // ── 为什么 ────────────────────────────────────────────────────────
    whyTitle: bi('为什么', 'Why'),
    reference: bi(
      'Universal Everything，《Future You》，Barbican，2019',
      'Universal Everything, “Future You”, Barbican, 2019',
    ),
    whyRef: bi(
      '那件作品的回路是「身体 → 形态」，回路里没有 AI：形态从一个预先做好的组合池里取。',
      'In that work the loop runs body → form, with no AI inside it: form is drawn from a pool built in advance.',
    ),
    whyDiff: bi(
      '唯一的区别是我们加了第二条回路：把实时 AI 3D 生成放进交互回路里。',
      'The one difference: we add a second loop, putting real-time AI 3D generation inside the interaction itself.',
    ),
    fastLoop: bi('快回路 · 16 毫秒', 'Fast loop · 16 ms'),
    fastLoopNote: bi(
      '姿态 → 骨架 → 部件挂载 → 渲染。部件来自预生成的池子，零延迟。',
      'Pose → skeleton → mounted parts → render. Parts come from a pre-generated pool. No latency.',
    ),
    slowLoop: bi('慢回路 · 30–90 秒', 'Slow loop · 30–90 s'),
    slowLoopNote: bi(
      '你此刻的剪影 → 3D 生成模型 → 属于你的那块零件 → 热插拔到身上。',
      'Your silhouette, right now → a 3D generative model → a part that is yours → hot-swapped onto the body.',
    ),
    slowLoopHonest: bi(
      '慢回路目前只有规格，一行代码没写。它是这件作品的设计，不是今天已经跑通的部分。',
      'The slow loop is specified and not yet written. It is the design of this work, not a description of what runs today.',
    ),
    slowLoopWhy: bi(
      '那 30 到 90 秒的等待不是缺陷，是叙事：它正在想办法成为你。',
      'Those thirty to ninety seconds are not a defect but the story: it is working out how to become you.',
    ),

    // ── 底下是什么 ────────────────────────────────────────────────────
    howTitle: bi('底下是什么', 'Underneath'),
    layers: {
      pose: bi('姿态', 'Pose'),
      poseNote: bi('摄像头 → 骨架。全部在你的设备上算。', 'Camera to skeleton, computed entirely on your device.'),
      plan: bi('身体方案', 'Body plan'),
      planNote: bi(
        '同一副骨架重映射成四种形体。换物种是换形体，不是换一层皮。',
        'One skeleton, remapped into four builds. Changing species changes the body, not the paint.',
      ),
      express: bi('表达', 'Expression'),
      expressNote: bi(
        '部件刚体挂载到骨头上，互相分离、随关节拆合 —— 不做蒙皮。',
        'Parts are mounted rigidly to bones, separate from each other, opening and closing with the joints. No skinning.',
      ),
    },
    combTitle: bi('47,000 是一个组合数', '47,000 is a combinatorial count'),
    combBody: bi(
      '原作宣称「47,000 种可能」。那不是 47,000 个模型，是槽位 × 部件 × 材质算出来的组合数 —— 这是我们逆向出来的第一条结论，也决定了整个架构。我们用同一套办法：',
      'The original claims “47,000 possible reflections”. That is not 47,000 models but a count — slots × parts × materials. It was the first thing we reverse-engineered, and it decided the whole architecture. We do the same:',
    ),
    counts: {
      species: bi('物种', 'Species'),
      plans: bi('身体方案', 'Body plans'),
      parts: bi('部件', 'Parts'),
      slots: bi('槽位', 'Slots'),
      materials: bi('材质', 'Materials'),
    },

    // ── 物种谱系 ──────────────────────────────────────────────────────
    speciesTitle: bi('物种谱系', 'Species'),
    speciesLead: bi(
      '每个物种在形态空间里占一个位置。两根轴：像人的程度、像活物的程度。标记的形状是它的身体方案。',
      'Each species sits somewhere in a morphology space, on two axes: how human-like, how life-like. The shape of each mark is its body plan.',
    ),

    // ── 隐私 / 署名 ───────────────────────────────────────────────────
    privacyTitle: bi('隐私', 'Privacy'),
    creditsTitle: bi('署名与许可', 'Credits and licence'),
    licence: bi(
      '源代码 MIT。四项除外，请分别对待：',
      'Source code is MIT, with four carve-outs:',
    ),
    carve1: bi(
      '轮播组件移植自 dither-blur-carousel（MIT © Yousuf Soomro），其 public/ 里的图片与字体未取用。',
      'The carousel is ported from dither-blur-carousel (MIT © Yousuf Soomro); nothing from its public/ folder is used.',
    ),
    carve2: bi(
      'ZKMSerendipity 字体权利属于 ZKM，本项目非商用、不再分发；fork 请自行取得许可。',
      'The ZKMSerendipity typeface belongs to ZKM. Non-commercial use here, not redistributed; forks must obtain their own licence.',
    ),
    carve3: bi(
      '部件与参考图由 Hyper3D Rodin 生成并经本仓库流水线规范化，使用前请确认该服务的条款。',
      'Parts and reference images are generated by Hyper3D Rodin and normalised by this repository’s pipeline; check that service’s terms before reuse.',
    ),
    carve4: bi(
      '作品本身是一件装置。代码开源不等于作品可以被原样复制展出。',
      'The work itself is an installation. Open source code is not permission to re-stage it.',
    ),
    repo: bi('仓库', 'Repository'),
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
