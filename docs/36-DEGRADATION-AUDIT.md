# 36 · 降级路径审计 —— 它坏了的时候，有谁看得出来

> `AGENTS.md` 写着一条不变量：**每条降级路径必须存在且被跑过**（P2 / P3）。
> 「存在」这半句一直有人查（`docs/10-SURFACES.md` 的证据栏），
> 「被跑过」那半句从来没有人整条盘过。这一份把它盘了一遍。
>
> 审计日期 **2026-09-13**。跑的是本机 dev server（一个不占用的端口）与
> `vite preview` 打的 dist 两套，浏览器是 Chromium（WebGPU 可用，`navigator.gpu → apple`）。
> **表里的每一行都写着当时跑的是什么、看到的是什么**；跑不到的行明确标 `未验证`，
> 不按"应该可以"填。这是 P17 的那条：宁可诚实地缺一半，也不要编一个完整的。

## 0. 这份审计问的不是"它会不会崩"

这件作品会在展厅里无人值守地跑一整晚。**最糟的失败不是崩溃** ——
崩溃看得见，有人会去按重启。最糟的是它**安静地降级着跑完一整晚**，
画面照动、帧率照样漂亮，而观众看到的不是这件作品。

所以每一行除了"它还跑不跑"，还要回答两个更要紧的问题：

1. **它有没有告诉任何人自己降级了？**
2. 那个信号**观众看得见，还是只有 `?debug=1` 才看得见？**

并且，按 `docs/02` P21 的那条追问逐条过一遍：

> 假如这条路是**静悄悄坏掉**的，仪表会显示什么？
> 如果答案是"和现在一模一样"，那它就不是仪表。

## 1. 名单是推出来的，不是想出来的

四个来源合并去重，每一行注明出处：

| 来源 | 捞到了什么 |
|---|---|
| `packages/app/src/shell/kiosk.ts` 的 `Flags` | `?demo=1` `?kiosk=1` `?nopost=1` `?loading=0` `?model=` `?cam=` `?exits=` `?preview=` `?wave=` `?mute=1` `?refine=0` `?vitality=0` `?selftest=1` —— 以及**名单里没有 `?gl=`**（见 D2） |
| `docs/10-SURFACES.md` 证据栏 | 选择页 DOM 降级、条目 < 3 退化成一排、降级阶梯三级、`parts.json` 缺失、单件 glb 缺失、团块降级旋钮、生产构建里没有慢回路、`?cam=` 点名落空 |
| `docs/25-COMPLETENESS.md` | A 表第 5 行「连续 30 分钟不崩 ❌ 没跑过」、第 6 行「断网 + 遮摄像头照常演 ❌ 不成立」 |
| `grep degrade / fallback / catch / ?gl=off / forceFallback` | `shell/degrade.ts` 三级阶梯、`shell/safe-frame.ts` 连续出错计数、`assets/library.ts` 两级占位、`capture/webcam.ts` 文件头列的六条、`choose/choose.ts` 的 `toFallback()`、`choose/ring/field.ts` 的 `ready`/`onError`、`shell/loading.ts` 的慢网两句、`shell/boot-error.ts` |

## 2. 逐条审计

「观众看得见吗」一栏只有三种答案：**是** / **否（只有控制台或 `?debug=1`）** / **不适用**。

| # | 路径 | 跑的是什么 | 发生了什么 | 观众看得见吗 | 判定 |
|---|---|---|---|---|---|
| 1 | **摄像头权限被拒 · 现场档** | `/?kiosk=1&theme=xeno.rig`，浏览器面板整体禁用 `getUserMedia` | 页面照跑不白屏（P2 成立），`[main] capture: NotAllowedError: Permission denied` 一行落在控制台。舞台上**永远是一片空场**，身体一次都没出现 | **否** | **❌ 最严重的一条**，见 D1 |
| 2 | 同上 · 带仪表 | `/?kiosk=1&debug=1&…` | HUD 的 `infer` 一行是 **红色 `0.0 Hz`**。摄像头正常而展厅没人时这一行是 ~30 Hz —— 两种情形**读数不同**，这是一个真仪表 | 否（`?debug=1`） | ✅ 仪表本身合格，但现场不挂它 |
| 3 | **`?demo=1` 回放兜底** | `/?demo=1&debug=1&theme=porcelain&seed=777`，dev 与 preview 各一遍 | preview（= 产物）挑到真录制 `pose-jumpingjacks`（45.2s）；**dev 上挑到的是 2 秒的合成占位数据** `pose-synthetic`，起因见 D3 | 否 | ⚠️ 已修（D3） |
| 4 | **`parts.json` 缺失** | 把 `assets/parts/parts.json` 改名，`/?demo=1&debug=1&theme=porcelain&seed=777&tier=2&clip=jumpingjacks` | 照跑。`[library] parts.json 不可用 → 全程序化占位模式`。HUD：30 instances / **15k 面 / 11 draw**（有库时 30 / **85k** / 18）。画面是一具灰胶囊+方块拼的人 | **是** | ✅ 这条路是诚实的：一眼就知道不是成品 |
| 5 | **单件 mesh 解不出来** | 把 `head.porcelain.{a,b}.glb` 写成 40 字节垃圾 | 只有头那一个槽位退回占位，其余 29 件照常（85k → 83k 面，draw 不变）。`[library] head.porcelain.a 加载失败 → 该槽位用占位几何` | **否** | ⚠️ 隔离正确，但**换了一颗头看起来只像换了一个设计**。单件失败大概本就该静默，只是要知道：现场没人会发现 |
| 6 | **选择页无 GL → DOM 列表** | `/dev/choose.html?gl=off` | 26 行 DOM 列表列出、无 `.sb-ring`、点选/键盘照常 | 不适用（降级列表本身就是作品的一部分，`docs/23 §S2`） | ✅ 路径成立 |
| 7 | **`?gl=off` 在正式程序上** | `/?gl=off&demo=1&nav=0`，读 DOM | **完全没有效果**：`.sb-ring` 照挂，`.sb-row` 为 0 | 不适用 | **❌ 见 D2 → ✅ 已修（2026-09-13）**：`.sb-ring` 0 / `.sb-row` 26 |
| 8 | **连续出错降级阶梯** | `/dev/degrade.html` → 「注入每帧抛异常的 tick」 | 三级逐级触发：`nopost=true` → `placeholder=true` → `<html data-sb-degrade="reload">`，事件日志三条齐全 | 否 | ⚠️ **机制成立，正式程序里前两级是空转**，见 D4 → ✅ **已修（2026-09-13）**：正式程序上实测 171k 面 / 36 draw → 47k 面 / 28 draw |
| 9 | **慢启动 / 慢网** | 第 5 行那次跑在四条并行任务的负载上，首屏等了 > 8 秒 | 加载态自己说了话：「**再等一下，网有点慢 / Hang on — the network is slow**」（`SLOW_MS = 8_000`，20 秒还有第二句） | **是** | ✅ 这是全表里做得最对的一条 |
| 10 | **生产构建里没有慢回路** | preview 上 `/?demo=1&…`，读网络面板 | `GET /__slow/lineage?species=porcelain → 404`，快回路一帧不受影响 | 否（本来就该看不见） | ✅ 符合 `docs/10` 已有证据 |
| 11 | **本地 MediaPipe 模型缺失 → CDN** | `/?selftest=1`（dev 与 preview 各一遍） | `assets/models/` **是空的**，两边都报 ⚠「本地没有模型 → 回落 Google CDN。断网就起不来」 | 否（自检页看得见） | ✅ 仪表诚实；**但这是一条现场真风险**，见 D5 |
| 12 | **自检页本身** | `/?selftest=1` | 五条全跑完不卡死，`parts.json` 与模型两条都挡了 `text/html`（SPA 回退的那个坑） | 不适用 | ✅ 唯一一个"开场前能当场问清楚"的入口 |
| 13 | 摄像头点名落空（`?cam=`） | 未跑 | — | — | **未验证**：需要一台接了两个摄像头的机器（`docs/10` 已写明这一条从没在真机上跑过） |
| 14 | **没有 WebGPU → WebGL2 回落** | 未跑 | — | — | **未验证**，见 §3 |
| 15 | **环（SDF）起不来** | 未跑（`?gl=off` 只走到同一个 `toFallback()` 的下游，没有走 `field.ready === false` 那条） | — | — | **未验证**，见 §3 |
| 16 | 摄像头**不存在**（无设备） | 未跑 | — | — | **未验证**：浏览器面板给的是 `NotAllowedError`，不是 `NotFoundError`。两者最终都落在 `lastError` 上，但**不是同一条分支** |
| 17 | 模型 / wasm 下载失败（断网 / 封 CDN） | 未跑 | — | — | **未验证**，见 §3 |
| 18 | graphics context lost 自愈 | 未跑 | — | — | **未验证**（`docs/10` 早已标着「真实的 context lost 分支 `Not run`」，这次也没能跑） |
| 19 | 连续 30 分钟长跑 | 未跑 | — | — | **未验证**（`docs/25` A 表第 5 行，本次没有条件做长跑） |
| 20 | **`?preview=on` 作为第 1 行的解药** | `/?kiosk=1&preview=on&theme=porcelain&seed=777`，同样禁用 `getUserMedia` | 左上角那块小屏幕挂上来了，画面全黑，底下一行：**「打开摄像头，它就能看见你 / Turn the camera on and it can see you」** | **是** | ✅ **D1 有一条零改动的解药，见 §5-①** |

## 3. 跑不到的那几条，以及为什么

**不是没时间，是这台机器上没有那个条件。** 逐条写清楚，下一个人不用重新试一遍：

- **没有 WebGPU（第 14 行）/ 环起不来（第 15 行）**：手上的浏览器 `navigator.gpu`
  是可用的，而 `navigator.gpu` **没法在页面加载之前从外部拿掉** ——
  `?gl=off` 本来就是为这件事准备的开关，可它现在只接在 `/dev/choose.html` 上（D2）。
  修掉 D2 之后这两条才跑得了，这是 D2 值得修的第二个理由。
- **模型 / wasm 下载失败（第 17 行）**：这条路只有在**摄像头真的开起来**之后才会走到，
  而这台机器上摄像头这条路根本到不了（下一条）。要跑它得改 `capture/webcam.ts`
  里的 CDN 常量，那个文件这一轮不归我动。
- **摄像头的其余状态（第 16 行）**：能到达的只有「权限被拒」一种 ——
  浏览器面板把 `getUserMedia` 整个禁掉了，这既是唯一能到的状态，也**正好是**
  现场最常见的那一种，所以第 1 行的结论是硬的。**「一台摄像头都没有」
  与「点名的那台不在」两条，本次一步都没走到。**
- **context lost（第 18 行）/ 长跑（第 19 行）**：都需要时间或硬件，不是读代码能替代的。

## 4. P21 逐条追问：坏掉的时候仪表显示什么

### D1 · 现场档下，摄像头死了和展厅没人**长得一模一样** ❌

这是整份审计最贵的一条。

`?kiosk=1` 下同时成立三件事：

- `flags.exits` 为 false —— 右下角那一列不挂（`shell/kiosk.ts` 里写明的、正确的理由：
  无人值守的装置不该向公众提供「回到大厅」）；
- `flags.nav` 为 false —— 目录不挂；
- HUD 只在 `?debug=1` 下挂 —— 现场不挂；
- 而 `main.ts:264` 那一行 `if (renderFellBack && !flags.kiosk)`，把**唯一一条会说
  「降级渲染」的观众可见提示也按 kiosk 关掉了**（理由同样写在注释里：
  站在装置前的人对这条信息无能为力）。

每一条单独看都对。**合起来的结果是：现场档下这件作品没有任何一个降级信号是向外说的。**
于是摄像头被拒（第 1 行）时，屏幕上是一片安静好看的空场 ——
和「此刻没有人站在装置前面」**逐像素相同**。

> 按 P21 那句问：假如摄像头这条路静悄悄坏掉了，仪表会显示什么？
> **和现在一模一样。** 所以现场档下它不是仪表，是一块背景板。

**但这条不必靠改代码来解。** 第 20 行实测：`?kiosk=1&preview=on` 一开，
左上角那块小屏幕（`ui/preview.ts`）就挂上来了，摄像头死掉时它是黑的，
底下写着「打开摄像头，它就能看见你」—— **一个观众可见的、明确的"它现在看不见"**。
`wantsPreview()` 的三态判断（`preview-state.ts:63`）本来就允许现场显式打开它，
`docs/38 §5` 也已经把它当成首选诊断工具在写。

所以 D1 准确的说法不是"没有信号"，而是：**信号存在，但默认不开，
而默认那一档正是无人值守的那一档。** 具体处置写在 §5-①。

### D2 · `?gl=off` 只在 dev 页上存在 ❌

`choose/choose.ts` 的文件头白纸黑字写着：

> 「WebGL 起不来也要能选。……（AGENTS.md：每条降级路径必须存在且被跑过 ——
> `?gl=off` 就是用来跑它的。）」

而 `readFlags()` 里**没有 `gl` 这个字段**，`main.ts` 调 `chooseTheme()` 时也
**没有传 `forceFallback`**。唯一读 `?gl=` 的是 `packages/app/dev/choose.ts:98`。

实测（第 7 行）：`/?gl=off` 下 `.sb-ring` 照挂、`.sb-row` 为 0。

> 这条的 P21 形状很干净：**注释是仪表，而它报的是意图，不是现实。**
> 一个只在 dev 页上生效的开关，把"这条降级路径被跑过了"这句话
> 说成了关于**正式程序**的结论 —— 而正式程序上那个参数什么都不做。

**✅ 已闭（2026-09-13）。** 照 §5-② 原样做的：`Flags` 加 `gl`（`?gl=on|off`，
认不出来的值按没写过处理并 warn），`main.ts` 那次 `chooseTheme({…})` 传
`forceFallback: !flags.gl`，`choose/**` 的行为一行未动。
正式程序上 A/B 实拍（dist + `vite preview`，headless Chrome，`navigator.gpu` 可用）：
默认 `.sb-ring` **1** / `.sb-row` **0**；`?gl=off` 下 `.sb-ring` **0** / `.sb-row` **26**，
控制台 `[choose] 环不可用，走 DOM 降级列表： forceFallback`。
`choose.ts` 的文件头也改了 —— 它不再把一个 dev 页开关说成关于正式程序的证据。
**第 14 / 15 两行（没有 WebGPU、环起不来）由此才第一次具备跑的条件，但本轮仍未跑**：

### D3 · dev server 上的 `?demo=1` 一直在放合成假数据（已修）⚠️

`GET /demo/index.json` 在 dev server 上返回的是 **200 + `index.html`** ——
Vite 的 html 中间件把路径里那个 `index.*` 认成了一张页面。**同目录下的
`pose-*.json` 一切正常，坏的只有这一个文件名。**

下游 `fetchClipIndex()` 看到 `r.ok` 为真、`r.json()` 抛异常，按既定降级返回 `[]`，
`pickClip()` 于是退回写死的 `DEFAULT_CLIP = /demo/pose-synthetic.json`。
结果：dev 上的 `?demo=1` 放的是 **2 秒的合成占位数据**，而不是仓库里那两段真人录制。

两件事因此被连带扭曲：

1. **自检页在 dev 上报「demo 回放片段 ✗ 一条片段都没有」，而产物上是 ✓（两段真录制可用）。**
   同一个仪表，对同一份资产，在两个环境里给出相反的结论 —— 而页面上没有任何地方
   写着"你现在看的是 dev"。一个会无端报警的自检页，用不了几次就没人信了。
2. 身体也跟着不对：合成片段只有 2 秒、动作幅度小，evolution 迟迟不进阶，
   身体一直停在团块态。**`?demo=1` 看起来"能跑"，但跑出来的不是这件作品。**
   （补一句给下一个人：想当场看到长齐零件的身体，加 `?tier=2`。
   第 4 / 5 行的 A/B 就是这么跑的。）

`vite preview` 与 Vercel 上这个文件是好的（都验过），所以**这是一条 dev-only 的坑** ——
但坑的正是"我们自己判断现场兜底行不行"的那个动作。

**已修**：`packages/app/vite.config.ts` 的 `demoIndex()` 插件多了一段
`configureServer`，dev server 自己发这个文件，抢在 html 中间件前面。
修完复验：dev 上 `/demo/index.json` 返回 `application/json`，自检页那一条由 ✗ 变 ✓，
与产物一致。

### D4 · 降级阶梯的前两级，在正式程序里是空转 ⚠️

`shell/degrade.ts` 的设计是对的：机制在 shell，**动作由各子系统 `registerDegradeHandler()` 认领**。
文件头也老实写着「没有人注册时这一级仍然是'真的发生了'……只是没人响应」。

问题是这句话的后果没人复查过。现在的事实是：

```
grep -rn "registerDegradeHandler" packages/app/src   →  只有 degrade.ts 自己的定义
grep -rn "registerDegradeHandler" packages/app/dev   →  dev/degrade.ts 注册了三条
```

- **第 1 级（关后期）**：只翻 `state.nopost`。而唯一的消费方式是 `readFlags().nopost`，
  `stage/stage.ts:169` 在 `createStage()` 里读一次就不再读了 —— 那是开机时刻，
  早于任何降级。**运行中翻这个位，后期不会关。**
- **第 2 级（回落占位几何）**：`state.placeholder` 在 `packages/app/src` 里**零个消费者**。
- **第 3 级（重载）**：真的重载，会话内最多两次。**只有这一级是真的。**

于是正式程序里的阶梯实际是：空转 → 空转 → 重载。

> P21 的形状：`/dev/degrade.html` 把三级全打绿了，`docs/10` 的证据栏也抄了它的日志。
> **但那个页面自己注册了三个处理器**，所以它测的是"事件发得出去吗"，
> 不是"有人接吗"。仪表答对了它自己问的那个问题，而那不是我们要问的问题。

`docs/10` 已经写了「舞台/creature 还没认领（要在 main.ts 收口时接）」—— 这一条没有被忘记，
只是**从"待办"变成了"已经在现场跑着的现状"**，而现状这一侧没有人复述过。

**✅ 已闭（2026-09-13）。** 照 §5-③ 做的：`src/shell/degrade-wire.ts` 把
第 1 级接到 `stage.setPost(false)`（控件条「渲染」组按 `P` 的同一条路，**不是**翻 `flags.nopost`），
第 2 级接到 `creature.remorph(toPlaceholderGenome(genome))`；`main.ts` 在 creature 建好之后
调一次 `wireDegrade()`。另补一条上面没写到的：`morph()` 在已降级之后不再把真几何装回来 ——
否则下一次升档会让**降级自己撤销自己**，而画面上看不出发生过什么。

**这次不是在 dev 页上打绿的。** 正式程序（dist + `vite preview`）上注入了一次真的连续出错：
用 CDP 把 `GPUCanvasContext.prototype.getCurrentTexture` 换成每帧抛异常，
等前两级降完立刻还原让帧循环恢复，再读 HUD（`/?demo=1&debug=1&theme=porcelain&tier=2&seed=777&clip=jumpingjacks`）：

| | 注入前 | 两级降完 |
|---|---|---|
| **接线之前** | 30 instances / **171k 面** / 36 draw | 30 instances / **171k 面** / 36 draw |
| **接线之后** | 30 instances / **171k 面** / 36 draw | 33 instances / **47k 面** / 28 draw |

接线之前那一列就是"空转"的读数：阶梯在控制台上说了「第 2 级：回落占位几何」，
`<html data-sb-degrade=placeholder>` 也写上了，而画面上一个三角形都没变。
接线之后 HUD 多出 `degraded 回落占位几何` 与 `errors 60`，控制台三级齐全
（`连续 30/60/90 帧出错`），没有任何一条 `处理器自己炸了`。

> 一句留给下一个人的边界：这条注入是从**外面**打进渲染路径的，不是自然发生的掉帧。
> 「真机上因为发热/驱动掉到连续出错」这件事本轮仍然**没有**跑到 ——
> 跑到的是"一次真的连续出错会不会真的有人接"，而那正是 D4 问的那个问题。

### D5 · `assets/models/` 是空的 ⚠️

不是 bug，是一件开场前必须做的事，写在这里免得它继续只活在自检页的一行 ⚠ 里：
**现场断网时，摄像头这条路起不来**（姿态模型要从 Google 的 CDN 下）。
自检页说得很清楚且两个环境一致，属于仪表合格、事情没做。

### 做对了的那些（同样要记下来）

- 第 4 行 **`parts.json` 缺失**：灰胶囊人和成品身体一眼可辨，观众自己看得出不对劲。
  这是全表里唯一一条"降级本身自带观众可见信号"的路径。
- 第 9 行 **慢网**：加载态在 8 秒时主动说人话，20 秒再换一句。它不靠定时器编进度，
  没信号的地方宁可停着不动（`shell/loading.ts` 文件头第 2 条）—— 这正是 P21 想要的姿态。
- 第 2 行 **HUD 的 `infer`**：0 Hz 与 30 Hz 读数不同，能把"设备坏了"和"没人来"分开。
  仪表是对的，只是现场不挂。
- 第 12 行 **自检页**：`parts.json` 与模型两条都显式挡了 `text/html`，
  没掉进 SPA 回退那个"200 但不是 JSON"的坑。**漏掉这层防护的只有片段索引那一条**（D3）。

## 5. 交给别人的三条（本轮不归我动的文件）

按 `docs/02` P6：看见别处的问题写进输出，不顺手改。

### ① 现场档下的"它看不见了" — 先改开机 URL，再谈改代码

针对 D1。**分两步，第一步不动一行代码。**

**第一步（零改动，今天就能做）**：开机 URL 改成 `/?kiosk=1&preview=on`。
第 20 行已实测：摄像头这条路死掉时，左上角那块小屏幕是黑的 +
「打开摄像头，它就能看见你」，观众和操作员都看得见。
`docs/38 §5`「Nobody is detected」那一节把它列为最快的诊断工具，这条建议只是
把它从"出事之后的排查手段"提前成"开机就带着的默认"。
代价是展厅画面上多一块小屏幕 —— 那是策展取舍，不是代码取舍
（`shell/kiosk.ts` 里 `?preview=` 的注释已经把这件事定性成策展决定）。

**第二步（要改代码，`packages/app/src/main.ts`，这一轮不归我动）**：
`?preview=on` 说的是「它看不见你」，读起来像"请你站好一点" ——
而摄像头被拒是**设备坏了，观众怎么站都没用**。如果要把这两件事分开，
建议做成"现场档专用、极低存在感"的一行，而不是把 HUD 搬到现场：

- 位置：`main.ts:264` 那两行 `showNotice` 附近；
- 判据**不要**用 `capture.lastError`（`main.ts:286` 附近的注释已经说明了理由：
  那上面会留着"GPU delegate 回落 CPU"这种已经被兜住的旧账），
  改用和 HUD `infer` 同一个真信号 —— **推理频率是不是 0**，
  外加 `capture.lastError !== null` 作为与门；
- 行为：`flags.kiosk` 且该条件连续成立 N 秒（建议 10 秒，避开启动窗口）→
  挂一行 `showNotice`，文案说结果不说术语（照 `COPY.boot.*` 的写法，
  例如「它现在看不见 / It cannot see right now」），**且不自动淡出**，
  因为这一条恰恰要留在屏幕上等人来看见；
- 为什么值得破一次「现场静默」的规矩：`docs/23 §S0` 说"观众对这条信息无能为力"，
  那是对**渲染回落**说的 —— 画面照样成立，只是便宜一点。摄像头死掉不是同一件事：
  **作品这一刻没有在发生**，而观众恰好是唯一会在场的人。

### ② 把 `?gl=off` 接到正式程序上 — `shell/kiosk.ts` + `main.ts` ✅ 已做（2026-09-13）

针对 D2。两处，都很小：

- `packages/app/src/shell/kiosk.ts`：`Flags` 加 `gl: boolean`（或 `forceFallback`），
  `readFlags()` 里 `gl: q.get('gl') !== 'off'` —— 注意认不出来的值按没写过处理，
  规矩同 `?scene=` / `?shading=` / `?cam=`；
- `packages/app/src/main.ts:195` 那次 `void chooseTheme({ … })`：
  加 `forceFallback: !flags.gl`。`ChooseOptions.forceFallback` 已经存在，
  `choose.ts:447` 已经在用它，**不需要动 `choose/**`**；
- 顺带解锁：接上之后，§3 里第 14 / 15 两行（没有 WebGPU、环起不来）
  才第一次具备在这台机器上跑的条件。

### ③ 让降级阶梯的前两级真的有人接 — `main.ts` / `stage/**` / `creature/**` ✅ 已做（2026-09-13）

针对 D4。`docs/10` 里那句「要在 main.ts 收口时接」就是这件事：

- 在 `main.ts` 里，`stage` 与 `creature` 建好之后各 `registerDegradeHandler()` 一次：
  `'post'` → 调 stage 关后期的那条既有路径（控件条「渲染」组已经有它）；
  `'placeholder'` → 让 creature 换回占位几何（`library` 那侧的能力已经齐了）；
- 在那之前，请**不要**再把 `/dev/degrade.html` 的日志当成"阶梯跑通了"的证据 ——
  那个页面注册的是它自己的三个处理器。`docs/10` 的相应行已按这次实测改写。

## 6. 这次动了什么

| 文件 | 改了什么 |
|---|---|
| `packages/app/vite.config.ts` | `demoIndex()` 加 `configureServer`，dev server 自己发 `/demo/index.json`（D3） |
| `docs/10-SURFACES.md` | 只改证据栏里**这次实测推翻了的**那两处（降级阶梯、`?gl=off`）。历史计数一个字没动 —— 那张表开头就写着「表里的数字是当时量到的，不是现状……改掉它们就成了伪造记录」 |
| `docs/36-DEGRADATION-AUDIT.md` | 本文件 |

**没有动**：`src/ui/**`、`choose/**`、`capture/**`、`acts/**`、`stage/**`、
`creature/**`、`main.ts`、`core/src/{tuning,arc}.ts`、`assets/parts/curation.json`、
`packages/factory/**`、`docs/13`、`docs/40`、`vercel.json` —— 这一轮归别人。
落在这些文件里的结论全部写进 §5，没有一条被顺手改掉。
