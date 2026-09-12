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

  /**
   * S0 加载态 —— 观众在等的时候读到的那几行。
   *
   * 为什么要**分阶段**而不是一个笼统的百分比：一个数字只能说"还要多久"，
   * 说不出"在等什么"。而现场流失人的那一刻恰恰是「我不知道它是在加载还是坏了」——
   * 一行"正在认识你的身体"回答的是后面那半句。三个阶段就是三件真的在发生的事，
   * 不是把一条进度条切成三段。
   *
   * 慢的时候说人话：不写"超时""失败""重试"。那是运维的词，
   * 观众听到它只会走开；「网有点慢」他会再站一会儿。
   */
  loading: {
    render: bi('正在点亮画面', 'Waking the screen'),
    parts: bi('正在准备零件', 'Laying out the parts'),
    body: bi('正在认识你的身体', 'Learning to see your body'),
    /** 阶段状态。等宽小字，和右边的百分比同一栏 */
    waiting: bi('等一下', 'Waiting'),
    ready: bi('好了', 'Ready'),
    slow: bi('再等一下，网有点慢', 'Hang on — the network is slow'),
    slower: bi(
      '还在等。第一次打开要下最多东西，之后会快很多',
      'Still going. The first visit downloads the most; later ones are far quicker',
    ),
    /** 降级发生在加载途中：说清楚"它还是会活过来"，不说"降级" */
    degraded: bi('画面会简单一点，它照样会动起来', 'The picture will be simpler. It still comes alive'),
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
    /**
     * 第三种状态，为慢回路而设。它既不是"只写了设计"（回路两端都接上了、
     * 有测试有取证），也不是"已实现"（真实的 AI 生成从没打过一次，
     * 而且线上这个版本里它是 404）。用同一个标记去盖这两种情况，
     * 无论盖哪边都是在撒谎 —— 所以加一个。
     */
    onsite: bi('现场限定', 'On-site only'),
    legend: bi(
      '标注「规格」的只写了设计。标注「现场限定」的已经跑通，但只在装置那台机器上活着。这一页不写没做到的事。',
      'Marked “Specified” means designed, not built. Marked “On-site only” means working, but alive only on the installation’s own machine. This page does not claim what is not done.',
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
      '慢回路已经接通：剪影提交、生成、规范化、热插拔到身上，两端都在跑，并且前一个人留下的零件会进下一个人的候选池。'
      + '但还差两件，所以它标的是「现场限定」而不是「已实现」：真实的 AI 生成调用一次都没打过，离线端到端验的是回路、不是生成；'
      + '而且它只在装置那台本地机器上活着 —— 你现在打开的这个网页版本里，它是 404。',
      'The slow loop is connected: silhouette submitted, generated, normalised, hot-swapped onto the body — both ends run, and a part left by the previous visitor enters the next visitor’s pool. '
      + 'Two things are still missing, which is why it reads “On-site only” and not “Built”: no real generative call has ever been made — the offline end-to-end test proves the loop, not the generation; '
      + 'and it lives only on the installation’s own machine. In this web build, it is a 404.',
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
      '源代码 MIT。五项除外，请分别对待：',
      'Source code is MIT, with five carve-outs:',
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
    // 三个物种（小人 / 巡逻 / 鸟腿）用的是真实机器的原厂几何，不是生成件。
    // 这一条必须在页面上，不能只写在仓库里：BSD-3 的声明保留义务针对的是**再分发**，
    // 而公开部署就是再分发。非背书那一句同样是义务，不是客气话。
    carve5: bi(
      '小人 / 巡逻 / 鸟腿三个物种用的是真实机器的原厂几何：Unitree G1（BSD-3 变体）、'
      + 'ANYbotics ANYmal C（BSD-3）、Agility Cassie（MIT），均取自 MuJoCo Menagerie 的钉死 commit，'
      + '经本仓库流水线重新定向、归一、减面、去材质。逐件来源与改动见仓库的 assets/parts/ATTRIBUTION.md。'
      + '本作品与上述任何公司无关，不由它们背书。',
      'Three species — Compact, Patrol, Digitigrade — use the manufacturers’ own geometry: '
      + 'Unitree G1 (BSD-3 variant), ANYbotics ANYmal C (BSD-3), Agility Cassie (MIT), taken from a pinned '
      + 'commit of MuJoCo Menagerie and re-oriented, normalised, decimated and stripped of materials by this '
      + 'repository’s pipeline. Per-part sources and modifications are in assets/parts/ATTRIBUTION.md. '
      + 'This work is not affiliated with, nor endorsed by, any of those companies.',
    ),
    carve4: bi(
      '作品本身是一件装置。代码开源不等于作品可以被原样复制展出。',
      'The work itself is an installation. Open source code is not permission to re-stage it.',
    ),
    repo: bi('仓库', 'Repository'),
  },

  /**
   * 目录 —— 这个站的房间之间唯一的通路。
   *
   * 为什么必须有：`/about` 和 `/making.html` 承载了这件作品一半的表达，
   * 而首页上一个入口都没有 —— 一个评委打开首页，除非有人告诉他，
   * 否则永远不会知道它们存在。
   *
   * 为什么每条都写"它能回答什么问题"而不是功能名：`/dev/index.html` 已经
   * 这么做了，而它有效的原因是——人不是在找功能，是带着疑问来的。
   * 「共生护照」四个字说不出你为什么要点它，「谁被拒绝入境，谁被放行」说得出。
   */
  nav: {
    title: bi('目录', 'Contents'),
    here: bi('在这里', 'You are here'),
    items: {
      work: {
        name: bi('作品', 'The work'),
        answers: bi('它跑起来是什么样？站到画面里就知道。', 'What is it like when it runs? Step into the frame.'),
      },
      about: {
        name: bi('作品陈述', 'About'),
        answers: bi('它是什么？和 2019 年那件的区别在哪？', 'What is it — and how does it differ from the 2019 work?'),
      },
      making: {
        name: bi('做的过程', 'The Making'),
        answers: bi('人和机器是怎么互相纠正着把它做出来的？', 'How did people and machines correct each other into making it?'),
      },
      passport: {
        name: bi('共生护照', 'Passport'),
        answers: bi('哪一件产物被拒绝入境，哪一件被放行？', 'Which output was refused entry, and which was let in?'),
      },
      dev: {
        name: bi('工作台', 'Workbench'),
        answers: bi('每条降级路径长什么样？我们自己怎么验收？', 'What does each fallback look like? How do we check our own work?'),
      },
    },
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

  /**
   * `/making` 人机共创过程档案页。
   *
   * 纪律和别处一样，但这一页多一条：**每一条都要能指到一个 commit。**
   * 没有 hash 的事就不写 —— 这一页的全部力量来自它是真的。
   */
  making: {
    title: bi('做的过程', 'The Making'),
    thesis: bi(
      '一个人和一群代理在九个小时里一起做决定：谁说了什么、谁不同意、为什么、最后动的是哪一边。',
      'One person and a crew of agents deciding together across nine hours — who said what, who disagreed, why, and which side actually moved.',
    ),
    lede: bi(
      '下面每一条都指向一个 commit。挖不到证据的事没有写进来。',
      'Every line below points at a commit. What could not be evidenced was left out.',
    ),

    sec: {
      numbers: bi('数字', 'Count'),
      timeline: bi('时间线', 'Timeline'),
      corrections: bi('互相纠正', 'Corrections'),
      principles: bi('踩出来的十条', 'Ten Principles, Earned'),
      gaps: bi('这一页没有写的', 'Left Out'),
    },

    /** 互相纠正的四段式表头 */
    turn: {
      said: bi('谁说了什么', 'Claim'),
      against: bi('谁不同意', 'Objection'),
      because: bi('理由', 'Reason'),
      result: bi('结果', 'Outcome'),
    },

    numbersNote: bi(
      '全部从 git 与文件系统里点出来的，不是估的。',
      'Counted out of git and the file system. Not estimated.',
    ),
    timelineNote: bi(
      '不是 changelog。选进来的每一条都是一次判断 —— 有人本可以走另一边。',
      'Not a changelog. Each entry is a judgement call — someone could have gone the other way.',
    ),
    correctionsNote: bi(
      '同一个结构展开：谁说了什么、谁不同意、理由、结果。六件都真的发生过。',
      'Same shape each time: claim, objection, reason, outcome. All six actually happened.',
    ),
    principlesNote: bi(
      '每条原则都附着教会它的那件事。没有故事的原则活不过三天。',
      'Each principle carries the thing that taught it. A principle without its story lasts about three days.',
    ),
    gapsLede: bi(
      '想写但挖不到证据，所以空着 —— 这一页的规矩对它自己也生效。',
      'Wanted, but unevidenced, so left blank. The rule this page imposes applies to this page too.',
    ),

    /** 数字。`value` 一律是从 git / 文件系统点出来的原样，不做四舍五入 */
    numbers: [
      { value: '52', label: bi('次提交', 'Commits'), note: bi('14:24 → 23:28，同一天', '14:24 → 23:28, one day') },
      { value: '8', label: bi('次合并', 'Merges'), note: bi('八条 worktree 分支各自合回一次', 'Eight worktree branches, merged back once each') },
      { value: '6', label: bi('条泳道', 'Lanes'), note: bi('五条主线 + 一条素材侧线', 'Five main, one asset side-lane') },
      { value: '5', label: bi('个并行 worktree', 'Parallel worktrees'), note: bi('git add -A 那一次索引里有五个（480a48f）', 'Five sat in the index the time git add -A swallowed them — 480a48f') },
      { value: '7', label: bi('条契约裁决', 'Contract rulings'), note: bi('分三次报上来，三次都没在下游打补丁', 'Three reports, zero downstream patches') },
      { value: '129', label: bi('个测试', 'Tests'), note: bi('core 91 + app 38，全过', 'core 91 + app 38, all green') },
      { value: '15', label: bi('个测试文件', 'Test files'), note: bi('随 npm run check 一起跑', 'Run by npm run check') },
      { value: '191', label: bi('件部件', 'Parts'), note: bi('23 个条目共用一个部件库', '23 entries share one library') },
      { value: '10', label: bi('件剔除', 'Rejected'), note: bi('保留 0 件 —— keep 是审美判断，留给人', 'Zero keeps: that call belongs to a person') },
      { value: '25', label: bi('份文档', 'Documents'), note: bi('契约与背景分开写', 'Contracts kept apart from context') },
      { value: '94', label: bi('个 TS 文件', 'TS files'), note: bi('不含 node_modules', 'node_modules excluded') },
      { value: '10', label: bi('条原则', 'Principles'), note: bi('P11–P20，每条都有它的事故', 'P11–P20, each with its incident') },
    ],

    /** 时间线。每条都是一次判断 —— 不是 changelog */
    timeline: [
      { hash: '2933ec4', time: '14:24', text: bi(
        '起手先写契约和背景，再写第一行运行时代码。部件格式、挂载数学、主题表 —— 都在有东西可跑之前定下来。',
        'Contracts and context first, runtime code second. Part format, attachment math, theme table — all settled before anything could run.') },
      { hash: '480a48f', time: '14:44', text: bi(
        '编排者的 git add -A 把五个 worktree 当成嵌入式仓库塞进了索引。下一条提交把它们排除出去。',
        'The orchestrator’s git add -A swallowed five worktrees as embedded repos. The next commit pushed them back out.') },
      { hash: 'f9dc4b3', time: '14:52', text: bi(
        '?seed= 留空会被 Number(\'\') === 0 坑成锁定 seed 0 —— 现场会看到每个人都变成同一具身体。',
        'An empty ?seed= fell through Number(\'\') === 0 and pinned every visitor to seed 0 — the same body for everyone.') },
      { hash: 'f720220', time: '14:59', text: bi(
        '裁决：验收标准是编排者写反的。改的是契约，不是实现。',
        'Ruling: the acceptance criterion itself was backwards. The contract moved, the implementation did not.') },
      { hash: '4576a8b', time: '15:08', text: bi(
        '采集线把量深度的工具和判据全部交付，结论那一栏空着 —— 这台机器前面没有人可以蹲下。',
        'The capture lane shipped the instrument and the criterion, and left the conclusion blank: nobody was there to squat in front of the camera.') },
      { hash: '8720d21', time: '15:09', text: bi(
        '合成占位数据在加载路径上补了一条 console.warn。只写在文件里的警告，等于没有警告。',
        'The synthetic placeholder data got a console.warn on its load path. A warning only visible inside the file is not a warning.') },
      { hash: '27aea60', time: '15:12', text: bi(
        '装配线报上来两处文档与实现不一致。文档改成指向 tuning.ts，不再自己抄一份数字。',
        'The assembly lane flagged two doc-vs-code mismatches. The doc now points at tuning.ts instead of keeping its own copy of the number.') },
      { hash: '2370c67', time: '15:25', text: bi(
        '玩法扩展点自带故障隔离：连续 3 次抛异常就永久禁用并回落。让「随便试」变安全，是那块空间成立的前提。',
        'The act extension point ships with its own blast door: three consecutive throws and an act is disabled for good. Cheap experiments only exist if they are survivable.') },
      { hash: '196f527', time: '15:26', text: bi(
        '第一遍策展只标 10 个剔除，保留一个没标。keep 的含义是「永不重新生成」—— 那是审美判断。',
        'First curation pass marked ten rejects and zero keeps. A keep means “never regenerate this” — that is a taste call, not a machine call.') },
      { hash: '05ffbb9', time: '15:34', text: bi(
        '目检 186 件得到的那张表没有被换成公式：长宽比 < 1.6 会漏掉 foot，而 foot 恰恰最严重。同一笔修掉了定向规范化会把 186 件索引删成 2 件。',
        'A list from eyeballing 186 parts stayed a list: the tidy “aspect ratio < 1.6” rule dropped foot, the worst offender. The same commit fixed a targeted normalize that cut a 186-part index down to 2.') },
      { hash: '87b93f8', time: '15:41', text: bi(
        '写下头号设计缺陷：23 个条目其实是同一具人体换皮。不是素材质量问题，是只有一种表达方式。',
        'The top design defect gets written down: all 23 entries are one human body reskinned. Not an asset-quality problem — only one mode of expression existed.') },
      { hash: '4293b1c', time: '17:56', text: bi(
        '补上 PRD 的三条产品主张，并当场写明第三条现在不成立。',
        'The PRD lands with three exclusive claims, and a note that the third one does not hold yet.') },
      { hash: '8a8ab68', time: '18:00', text: bi(
        'P11–P20 并进宪法：原则散在 commit 信息里就会消失，收进一处并各自附上教会它的那件事。',
        'P11–P20 join the constitution. Principles scattered across commit messages evaporate; collected, each keeps the incident that taught it.') },
      { hash: '19880ae', time: '18:12', text: bi(
        '第一个真的不是人形的物种。关键设计：四肢的世界方向原样保留，只把肩胯搬到水平躯干上 —— 「你抬手，它抬前腿」的因果不能断。',
        'The first genuinely non-human body plan. The design hinges on keeping limb world directions untouched and moving only the sockets: lift your arm, the foreleg lifts. That causal line must survive.') },
      { hash: '448127a', time: '18:25', text: bi(
        '现场兜底的全部前置条件做完 —— 录制页、写回管线、拒收合成数据的中间件。仍然没有兜底，因为缺的是一个真人，而代理没有再造一份假数据顶上。',
        'Every precondition for the venue fallback is finished — recorder page, write-back pipeline, middleware that refuses synthetic data. There is still no fallback, because what is missing is a person, and the agent would not fake one.') },
      { hash: 'a2127d8', time: '18:29', text: bi(
        '一条线险些静默删掉别人刚落地的东西。它自己在提交前看了一眼暂存区，退回重做，并报了上来。',
        'One lane came within a commit of silently deleting work another lane had just landed. It checked its own staged diff, backed out, redid it, and said so.') },
      { hash: '0869fc2', time: '18:57', text: bi(
        '任务卡让代理去读一份还没提交的文档。代理如实说「这个前提是假的，所有数字是我自己测的」，没有假装读过。',
        'A task card told an agent to read a document that had never been committed. The agent said so plainly — “that premise is false; every number here is my own measurement” — instead of pretending.') },
      { hash: 'dfc9c63', time: '18:58', text: bi(
        '团块身体合入，代理自己标出三处不足：躯干是个圆蛋、低分辨率不是降质而是换了个生物、表面还不会动。',
        'The metaball body merges, with the agent listing its own three shortfalls: the torso is an egg, low resolution is a different creature rather than a cheaper one, and the surface does not move yet.') },
      { hash: 'f013230', time: '22:55', text: bi(
        '第一次真跑构建：产物 975MB。「raw 绝不进 dist」这句话在文档里躺了一整天，没人验证过。降到 45MB。',
        'The first real build weighed 975MB. “raw never ships” had sat in the docs all day, unverified. Down to 45MB.') },
      { hash: '3b63973', time: '23:02', text: bi(
        '舞台线推翻自己的前一版四处，每处给理由：升档脉冲从 +108% 改回规格的 +8%，地面冲击波环删掉。',
        'The stage lane overturns four of its own earlier choices and gives a reason for each: the tier-up pulse goes from +108% back to the specified +8%, and the ground shockwave ring is deleted.') },
      { hash: '1e55834', time: '23:12', text: bi(
        '字体先决定不进仓库：理由不是权利人是谁，而是个人非商用的「使用」授权几乎从不包含「再分发」，而这个仓库是公开的。',
        'The typeface is first kept out of the repo — not because of who owns it, but because a personal non-commercial licence to use almost never includes redistribution, and this repo is public.') },
      { hash: '2850e62', time: '23:17', text: bi(
        '项目持有人确认授权后字体才进仓库，并且做成可以随时拆掉：回退栈度量完全一致，删掉那个目录排版不变。',
        'It ships only after the project owner confirms the licence, and it ships detachable: the fallback stack has identical metrics, so deleting the folder changes nothing about the typography.') },
      { hash: 'fe8a5c2', time: '23:24', text: bi(
        '团块补上表面语言 —— 这是它交回时自己指出的缺口。三层叠加各管一件事，幅度刻意小：破了硬夹剪影就散了，那时读到的是「模型在抖」。',
        'The metaball body gets its surface language — the gap the lane itself had named on handover. Three layered waves, each with one job, deliberately shallow: past the hard clamp the silhouette dissolves and it reads as a glitching mesh.') },
      { hash: '96f5270', time: '23:26', text: bi(
        '收尾不是宣布完成，而是逐条对照六条判据：只有一条是确凿的。并记下那个结构性问题 —— 精力大量投在可自动验证的层，而作品成立与否落在只能由人判断的层。',
        'The last act is not a declaration of done but a line-by-line audit against six criteria: exactly one holds. Plus the structural note — effort pooled in the auto-verifiable layer, while whether the work lands at all sits in the layer only a person can judge.') },
    ],

    /** 互相纠正。四段式，全部真实，每件指到 commit */
    corrections: [
      {
        no: '01',
        refs: ['f720220'],
        title: bi('验收标准本身是错的', 'The acceptance criterion was the bug'),
        said: bi('任务卡 T-02 要求断言：抬左手 → handL 落在世界 +X。编排者写的。',
                 'Task card T-02 required an assertion: raise your left hand, handL lands at world +X. The orchestrator wrote it.'),
        against: bi('骨架线。它没有为了让测试变绿去改实现，而是停下来报上来。',
                    'The skeleton lane. It did not bend the implementation to turn the test green; it stopped and filed a report.'),
        because: bi('MediaPipe 的 left_* 指的是被摄者的左侧，正对相机时出现在图像右侧，镜像之后落在 −X。正确的不变式是 handR → +X。',
                    'MediaPipe’s left_* means the subject’s left, which faces the camera on the image’s right, and after mirroring lands at −X. The correct invariant is handR → +X.'),
        result: bi('改的是契约。docs/04 §1 补了一节把这条推导写死，免得下一个人再写反一次。',
                   'The contract moved. A new section in docs/04 §1 nails the derivation down so the next person cannot get it backwards.'),
      },
      {
        no: '02',
        refs: ['27f8843', '3b63973'],
        title: bi('升档脉冲从 +108% 改回 +8%', 'The tier-up pulse, from +108% back to +8%'),
        said: bi('舞台的前一版把升档做成 +108% 亮度加全屏叠加闪光，再加一圈地面冲击波环。',
                 'An earlier stage pass rendered the tier-up as +108% brightness plus a full-screen additive flash, ringed by a ground shockwave.'),
        against: bi('后一版推翻了它，四处修改各自给了理由。',
                    'The next pass overturned it — four reversals, each with its reason.'),
        because: bi('提曝光会把背景一起抬起来，读作相机闪光，而不是身体在发光；地面冲击波环是游戏 VFX，读作另一个门类。',
                    'Lifting exposure lifts the background with it, so it reads as a camera flash rather than a body lighting up. The shockwave ring is game VFX — it reads as a different medium altogether.'),
        result: bi('改回规格的 +8%，只动灯不动曝光，冲击波环删掉。实测身体像素线性亮度 +7.8%。',
                   'Back to the specified +8%, lights only and exposure untouched, ring gone. Measured: +7.8% linear luminance on body pixels.'),
      },
      {
        no: '03',
        refs: ['4576a8b', '9f9dd92'],
        title: bi('没有真人就不编数', 'No person, no numbers'),
        said: bi('任务卡 T-01 顺带要解两个未知：MediaPipe 的轴向，以及深度值能不能用。',
                 'Task card T-01 also asked for two unknowns to be closed: MediaPipe’s axis convention, and whether its depth is usable.'),
        against: bi('采集线拒绝回答，交了 partial。',
                    'The capture lane declined to answer and filed partial.'),
        because: bi('这台机器前面没有人能蹲下、能前后走一米。Chrome 的 fake camera 里没有人，MediaPipe 一个 landmark 都不输出。',
                    'There was nobody to squat, nobody to walk a metre toward the lens. Chrome’s fake camera contains no human, and MediaPipe emits not one landmark from it.'),
        result: bi('量它的工具交付了，判据写死在页面上（抖动 ≈ 量程就是深度不可用），结论那一栏空着。宁可交一个诚实的半成品。',
                   'The instrument shipped, the criterion is printed on the page — jitter ≈ range means depth is unusable — and the conclusion stayed blank. An honest fragment beats an invented whole.'),
      },
      {
        no: '04',
        refs: ['0869fc2', '0bbefa2'],
        title: bi('任务卡的前提是假的', 'The task card’s premises were false'),
        said: bi('给团块那条线的任务卡写着：读 docs/22，里面有可照抄的骨架和实测数字；再读 AGENTS.md 新加的两节。',
                 'The card for the metaball lane said: read docs/22, it has a skeleton you can copy and real measurements; then read the two new sections of AGENTS.md.'),
        against: bi('领卡的代理。',
                    'The agent holding the card.'),
        because: bi('docs/22 当时还是 untracked，而 worktree 是从提交分出去的 —— 它里面根本没有那个文件。那两节则在 docs/02，不在 AGENTS.md。',
                    'docs/22 was still untracked, and a worktree branches from a commit — the file simply was not there. Those two sections lived in docs/02, not AGENTS.md.'),
        result: bi('它如实报上来「这两个前提是假的，所有数字是我自己测的」，代价是白花一轮重新调研。规则写进 docs/15：任务卡引用的文件必须是已提交的文件。',
                   'It reported plainly — “both premises are false; every number here is mine” — at the cost of one wasted research round. The rule went into docs/15: a task card may only cite committed files.'),
      },
      {
        no: '05',
        refs: ['84f8510', 'a2127d8'],
        title: bi('代理纠正的是它自己', 'The agent that corrected itself'),
        said: bi('现场加固那条线整理提交时用了 git reset --soft main。',
                 'The venue-hardening lane tidied its commits with git reset --soft main.'),
        against: bi('它自己 —— 提交前看了一眼暂存区。',
                    'Itself — it looked at the staged diff before committing.'),
        because: bi('编排者在它工作期间往 main 落了新提交。于是它的暂存区一度显示：要删掉 bodyplan.ts，并从冻结契约里移除 bodyPlan 字段。',
                    'The orchestrator had landed a new commit on main while it worked. For a moment its index proposed deleting bodyplan.ts and stripping the bodyPlan field out of a frozen contract.'),
        result: bi('它没有提交那个状态，退回自己分支的起点重做再 rebase，并主动报上来。规则：用不动的 sha，不用会动的 main。',
                   'It never committed that state. It rebuilt from its branch’s own fixed starting sha, rebased, and reported the near-miss. Rule: reset onto a sha that does not move, never onto main.'),
      },
      {
        no: '06',
        refs: ['196f527', '05ffbb9'],
        title: bi('坏 anchor 上不再花 credits', 'No more credits on a bad anchor'),
        said: bi('素材线的任务是按每个主题的参考图生成那一整套部件。',
                 'The asset lane’s job was to generate a full set of parts per theme from that theme’s reference image.'),
        against: bi('素材线，在发现三个条目的参考图本身是碎片或多物体之后。',
                    'The asset lane itself, once it found three themes whose reference images were fragments or multi-object scenes.'),
        because: bi('image-to-3D 会忠实照抄「多物体」这件事。坏的上游会放大成一批坏的下游 —— 照着坏图再生成十五件垃圾交差，是有成本管线上最贵的做法。',
                    'Image-to-3D faithfully reproduces “several disconnected objects.” A bad input multiplies into a batch of bad outputs — and on a metered pipeline, shipping fifteen more failures is the most expensive possible move.'),
        result: bi('停下来问人。换一批随机种子重锚，并把这件事记在 RE_ANCHOR 里，而不是偷偷改 id 让它看起来没发生过。',
                   'It stopped and asked. The three were re-anchored with fresh seeds, recorded in RE_ANCHOR rather than quietly renamed so the failure would leave no trace.'),
      },
    ],

    /** P11–P20。每条 = 规则 + 教会它的那件事 */
    principles: [
      { id: 'P11',
        title: bi('契约的错由契约持有者裁决，不在下游打补丁', 'A broken contract is fixed by its owner, never patched downstream'),
        story: bi('验收标准要求「抬左手 → handL 在 +X」，而实际镜像后落在 −X。领卡的人没有为了让测试变绿去改实现。',
                  'The criterion demanded “left hand → handL at +X”; mirroring actually puts it at −X. The lane holding the card refused to bend the code to make the test pass.'),
        rule: bi('发现契约有问题 → 停下来报告。不要为了通过验收去迁就一个错的规格。',
                 'Found a bad contract? Stop and report it. Do not accommodate a wrong spec just to clear acceptance.') },
      { id: 'P12',
        title: bi('坏的上游会放大成一批坏的下游', 'A bad input multiplies into a batch of bad outputs'),
        story: bi('素材线发现三个条目的参考图是碎片或多物体，停下来问人，而不是照着坏图再生成十五件垃圾交差。',
                  'Three reference images turned out to be fragments or multi-object scenes. The lane stopped and asked, instead of generating fifteen more failures to look productive.'),
        rule: bi('一个环节的产出要作为下一个环节的输入时，先验它。「先做完再说」在有成本的管线上是最贵的做法。',
                 'Validate an output before it becomes the next stage’s input. On a metered pipeline, “finish it first and see” is the most expensive strategy there is.') },
      { id: 'P13',
        title: bi('破坏性默认必须设计成安全的', 'Destructive defaults must be designed safe'),
        story: bi('定向规范化会把整个索引重写成点名的那几件。186 件变成 2 件，运行时直接变空场，而现象只是「应用好像坏了」。',
                  'A targeted normalize rewrote the whole index down to the items named. 186 parts became 2, the runtime went empty, and the only symptom was “the app seems broken.”'),
        rule: bi('「部分操作」的语义默认必须是合并，不是替换。一个操作如果可能删掉你没点名的东西，它的默认行为就是错的。',
                 'A partial operation must default to merge, not replace. If an operation can delete what you did not name, its default is wrong.') },
      { id: 'P14',
        title: bi('测量工具本身会骗人', 'The instrument lies too'),
        story: bi('每帧 await 渲染会把它塞进微任务队列，帧时间读数因此不准。这种问题留到现场调性能时极难查 —— 因为你信的那个数字本身是错的。',
                  'Awaiting the render every frame pushes it into the microtask queue and skews frame timing. Left for the venue, it is near-impossible to find, because the number you trust is the thing that is wrong.'),
        rule: bi('先确认测量是对的，再去优化被测的东西。',
                 'Establish that the measurement is right before optimising the thing it measures.') },
      { id: 'P15',
        title: bi('数据结论不要为了优雅变回公式', 'Do not trade a measured list for an elegant formula'),
        story: bi('那张「哪些槽位会照抄躯干轮廓」的表来自目检 186 件。曾想用长宽比 < 1.6 去推它，结果把 foot 漏掉 —— 而 foot 恰恰最严重。',
                  'The list of slots that copy the torso silhouette came from eyeballing 186 parts. An attempt to derive it from “aspect ratio < 1.6” dropped foot, the very worst case.'),
        rule: bi('目检出来的列表就让它是列表。为了少几行代码把它换成一个公式，是在用优雅换正确。',
                 'Let a hand-checked list stay a list. Collapsing it into a formula to save a few lines trades correctness for elegance.') },
      { id: 'P16',
        title: bi('扩展点必须自带故障隔离', 'An extension point ships with its own blast door'),
        story: bi('玩法的 Director 规定：一个 Act 连续 3 次抛异常就被永久禁用并回落到基线。',
                  'The act Director has a rule: three consecutive throws and an act is disabled for the session, falling back to the baseline.'),
        rule: bi('让「随便试新玩法」变安全，是那块空间能成立的前提。一个会把整件作品带走的扩展点，没有人敢用第二次。',
                 'Cheap experiments only exist where failure is survivable. An extension point that can take the whole work down gets used exactly once.') },
      { id: 'P17',
        title: bi('没有真人就不编数', 'No person, no numbers'),
        story: bi('采集线写完了整条链，却拒绝回答轴向问题 —— 这台机器上没有人能站到摄像头前蹲一下。它交了 partial，并说明「十分钟就能解，但需要一个有身体的人」。',
                  'The capture lane finished the whole chain and still refused to answer the axis question: nobody could stand in front of the camera and squat. It filed partial, noting it was ten minutes of work away — pending one person with a body.'),
        rule: bi('宁可交一个诚实的半成品，不要交一个编出来的完成品。',
                 'Ship an honest fragment rather than an invented whole.') },
      { id: 'P18',
        title: bi('合成数据要在使用路径上吼', 'Synthetic data must shout on the path that uses it'),
        story: bi('项目里有一份程序生成的占位姿态数据。文件里有注记，但只有打开文件才看得到。于是在加载路径上补了一条 console.warn。',
                  'A procedurally generated placeholder pose file carried a note inside it — visible only if you opened the file. A console.warn went onto the load path instead.'),
        rule: bi('一个陷阱如果只在文档里标注，它就还是个陷阱。要让它在被踩到的那一刻出声。',
                 'A trap documented is still a trap. It has to make noise at the moment someone steps in it.') },
      { id: 'P19',
        title: bi('并行度要留余量，长任务要能断点续跑', 'Leave headroom in parallelism; make long jobs resumable'),
        story: bi('一次开了九条线，撞上会话限额，九条同时被中断。活下来的是已经提交的和写进文件的；死掉的是还在内存里的。',
                  'Nine lanes were running when the session limit hit, and all nine died at once. What survived was committed or written to disk; what was still in memory was gone.'),
        rule: bi('每多一条线，「全部一起失败」的概率就高一分。长任务要能从中断处继续 —— 幂等台账救了素材线，因为它重跑时只重试失败项。',
                 'Each added lane raises the odds of losing all of them together. Long jobs must resume from where they stopped — an idempotent ledger saved the asset lane, because a rerun only retries what failed.') },
      { id: 'P20',
        title: bi('编排者自己的手也会滑', 'The orchestrator’s hand slips too'),
        story: bi('按时间顺序：git add -A 把五个 worktree 当 submodule 加进索引；给出的等待命令匹配到了等待自己的那条 shell，挂住两个代理半小时；和素材线共用主目录撞了 git index。',
                  'In order: git add -A staged five worktrees as submodules; a wait-loop command matched the very shell doing the waiting and hung two agents for half an hour; sharing the main directory with the asset lane collided on the git index.'),
        rule: bi('编排者的错会被乘以并行度。所以编排者的每一条指令，在发出去之前都该按「它会被执行十次」来检查。',
                 'An orchestrator’s mistakes are multiplied by the parallelism. Check every instruction as if it will be executed ten times, because it will.') },
    ],

    /** 挖不到证据的事。列出来，而不是编一条填上 */
    gaps: [
      bi('那次「一次开了九条线」被限额一起打断 —— git 里只留下这句话，没有留下它们是哪九条、各自做到了哪一步。',
         'The nine lanes that died together at the session limit: git records that it happened, not which nine they were or how far each had got.'),
      bi('每条线各自跑了多久、花了多少 token。提交时间只告诉我们它什么时候落地，不告诉我们它什么时候开始。',
         'How long each lane ran, and at what cost. Commit times say when work landed, never when it started.'),
      bi('代理报上来又被驳回的提议。仓库里留下的是被采纳的那一半 —— 没有被采纳的那一半不在 git 里。',
         'The proposals that were reported and then declined. The repository keeps the half that was accepted; the other half never entered git.'),
      bi('作品成立与否的那一层：像不像、五秒之内认不认得出那是自己。没有观众站在它前面过。',
         'The layer that decides whether the work works at all: does it look like you, do you recognise yourself inside five seconds. No visitor has stood in front of it yet.'),
    ],

    footer: bi(
      '人类署名 2 人、代理共同署名 52 次。每一条 commit 都写着它是谁和谁一起做的。',
      'Two human authors; fifty-two agent co-author lines. Every commit records who made it with whom.',
    ),
  },
} as const;
