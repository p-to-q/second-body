# 17 · 慢回路 —— 服务端

> 观众的剪影 → Rodin → 规范化 → **长到身上，并且留在池子里给下一个人**。
> 这是作品的排他主张（把实时 AI 3D 生成放进交互回路里）落到代码的那一半。
> 前端接线不在本文范围内；本文最后一节就是前端要调的接口。

状态与证据见 `docs/10-SURFACES.md`。协议的上位规格是 `docs/06-SPEC §5`，
Rodin 的事实卡是 `docs/07-HYPER3D-API.md`（**不要凭记忆改客户端**）。

---

## 1. 为什么是 dev server 中间件，不是 serverless

`packages/core/src/types.ts` 里 `SlowJob.url` 的注释写着「由 **localhost 代理**提供」。
这不是将就：**装置跑在一台本地机器上，那台机器上就有 factory**。

于是慢回路可以直接复用三样已经存在、已经被验证过的东西：
key 只在 Node 侧（P8）、glb 落本地盘、规范化用的是 `normalize.ts` **同一份**代码。
云函数版本要么把这三件事各抄一遍（三处会漂的地方），要么把带 meshoptimizer 的工具链塞进 lambda。

代价说清楚：**线上 Web 版没有这条回路**，而且是如实标注的 ——
`/__slow` 是 `apply: 'serve'`，生产构建里根本不存在，前端拿到 404 就静默关掉它（P3）。

| | 有慢回路吗 | 怎么起 |
|---|---|---|
| `npm run dev` / `npm run dev:slow` | **有** | dev server 中间件 |
| `npm run kiosk`（build + preview） | 没有 | preview 上是干净的 404（见 §7） |
| Vercel 线上版 | 没有 | 静态托管，真 404 |

> ⚠️ 现场（kiosk）今天跑的是 `npm run kiosk` = 生产构建 = **没有慢回路**。
> 要让这条回路在现场活着，现场那台机器得跑 `npm run dev`（或者由收口的人决定
> 给 preview 也接一份 —— 那是一个产品判断，不是一个技术障碍）。这条写在 `docs/10` 的"还没接上"里。

## 2. 时序

```
浏览器                          dev server (/__slow)                 Rodin
   │  POST 剪影 PNG  ───────────►  预算闸门（同步，超了当场拒）
   │  ◄─────────── {id, submitted}   ← 立刻返回，不阻塞
   │                                 └─► 余额检查 → 提交 ────────────►
   │  GET /__slow/<id> ──────────►  generating                       │ 30–90s
   │  ◄─────────── {generating}                                      │
   │       （每 5s，最多 24 次 —— SLOW_LOOP.pollIntervalMs/maxPolls） │
   │                                 ◄──────────── glb ──────────────┘
   │                                 规范化（主轴+Y/socketA原点/长度1/减面）
   │                                 写血统池 + lineage.json
   │  GET /__slow/<id> ──────────►  ready + PartMeta + url
   │  GET <url> ─────────────────►  model/gltf-binary
   │  creature.graft(slot, meta, geometry)
```

看门狗与轮询是**两条独立的超时**，缺一不可：
`rodin.ts` 的 8 分钟只盖住轮询，而下载、规范化、写盘都在它之外。
`SLOW_LOOP.jobTimeoutMs` 是服务端的墙钟上限，**任何**一步卡住都由它把任务推进 `failed`。
这条回路里唯一比"失败"更糟的是"永远停在 generating"——前端只会一直转圈。

## 3. 端点

全部挂在 `/__slow`，登记在 `packages/app/vite.config.ts`（跟 `/__anchor` `/__curate` `/__demo` 排在一起），
逻辑在 `packages/factory/src/slow-http.ts` + `slow.ts`。

### `POST /__slow?slot=&session=&species=`
请求体 = 剪影 PNG 的**原始字节**（不是 multipart，不是 base64）。

| 参数 | 必填 | 说明 |
|---|---|---|
| `slot` | 否 | 默认 `SLOW_LOOP.targetSlots[0]`（`spine`）。不在 `targetSlots` 里 → 400 |
| `session` | 否 | **匿名**会话号，`[a-z0-9_-]{1,64}`。不给就服务端生成 `anon-xxxxxxxx` |
| `species` | 否 | 观众选的物种 = `PartMeta.family`。决定借哪条配方的 prompt，也决定这件将来被谁抽到 |

→ `200 SlowJob`（`{id, status:'submitted', slot, submittedAt}`）

### `GET /__slow/<jobId>`
→ `200 SlowJob`：`submitted | generating | ready | failed`。
`ready` 时带 `url`（可直接 fetch 的 glb）与 `meta`（合规 `PartMeta`，含 `localGirth`）。
`failed` 时带 `error`，是**人能看懂的一句中文**，不是错误码。
→ `404 {code:'NO_JOB'}`（也包括 id 形状不对 —— 不存在的东西不该有第二种回答）

### `GET /__slow/part/<partId>.glb`
→ `200 model/gltf-binary`，已过完整规范化（满足 `docs/03 §6`）。
同一件也可以走 publicDir 取：`/parts/lineage/<partId>.glb`（dev 下 `assets/` 是静态根）。
`SlowJob.url` 用前者：它和这条回路同生共死，不会出现"任务说 ready 但文件 404"。

### `GET /__slow/lineage?species=&limit=`
→ `200 {ok, chance, total, parts: PartMeta[], entries: [{id, session, createdAt, species, slot, provider}]}`
血统池候选。`parts` 就是标准 `PartMeta`，前端把它并进 `PartLibraryIndex.parts` 就能被 `makeGenome` 抽到。

**错误一律是结构化 JSON**：`{ok:false, code, error}`，绝不静默退化成 200。

| code | HTTP | 意思 |
|---|---|---|
| `BAD_REQUEST` | 400 | 不是 PNG / 槽位不在 `targetSlots` / 剪影是空的 |
| `TOO_LARGE` | 413 | 剪影 > 8MB（真人全身 mask 实测 20–120KB） |
| `METHOD` | 405 | POST-only 的口子被 GET 了，反之亦然 |
| `BUDGET_SESSION` | 429 | 这个人已经触发过 `SLOW_LOOP.maxPerSession` 次 |
| `BUDGET_DAY` | 429 | 今天到 `maxCreditsPerDay` 了 |
| `BUDGET_JOB` | 503 | 单次单价超过 `maxCreditsPerJob`（配置错了，不是观众的错） |
| `NO_JOB` / `NO_PART` | 404 | 没有这个任务 / 这件 |
| `DISABLED` | 503 / 404 | 模块没加载起来 / **生产构建里根本没有这条回路** |
| `INTERNAL` | 500 | 兜底。中间件里抛出去会把 dev server 的请求挂死，所以一律翻成 JSON |

## 4. 预算

这个口子花真钱。前端的冷却是礼貌，下面这些才是钱 —— 它们全在 Node 侧，
**且全部在 `SLOW_LOOP` 里**（`packages/core/src/tuning.ts`，旋钮不许散落）。

| 旋钮 | 默认 | 挡什么 |
|---|---|---|
| `maxPerSession` | 1 次 | 同一个人刷。**次数**闸门，独立于钱 —— 假客户端花 0 credits，光看钱拦不住第二次 |
| `maxCreditsPerJob` | 1 | 配置把单价调飞了 |
| `maxCreditsPerSession` | 1 | 同一个人的总支出 |
| `maxCreditsPerDay` | 20 | 一个开放日的天花板（≈ 40 次生成） |
| `balanceReserve` | 5 | 账户余额不足时不提交。与 `generate.ts` 的批量闸门同一条规矩 |

记账落在血统池索引里（`lineage.json` 的 `spend` / `sessions` / `attempts`），跨天自动清零。

两条纪律，都是踩过的形状：
- **先扣后跑。** 三个人同时按下去必须撞在同一本账上，否则就是三倍支出。
- **失败全退**（credits 和那一次机会都退）。生成坏了不该算用掉了这个人的一次 ——
  `docs/07 §3` 本来就写着"剪影没检测到物体 → 换一帧重试一次"。
  成功则按 Rodin 返回的 `consumed` 对账，把预扣换成实耗。

## 5. 血统池（模型留下后果的那一半）

生成出来的件不只给当前这个人用，它**留下来**：

```
assets/parts/lineage/
  ├── lineage.json                       索引
  ├── spine.porcelain.lin8b3679.glb      现场长出来的件（已规范化）
  └── head.coral.lin3f10ab.glb
```

- **不放进 `assets/parts/` 主库**：主库是策展过的（`curation.json`、`docs/14 §5`），
  血统池是现场长出来的、没人筛过的。两者混在一起，`check:parts` 和策展流程都会失去意义。
- 件的 id 沿用主库的 `<slot>.<theme>.<variant>` 命名（variant = `lin` + jobId 尾巴），
  所以它落进 genome 的候选池时和主库的件**没有区别** —— 不需要为它在运行时加分支。
- `tier: 3`：现场件是给演化到顶的身体的礼物，不是开场就能拿到的东西。
- `.gitignore` 掉：它是**这台机器**的记忆，不是仓库的内容。clone 下来应该是空的，
  然后由站到摄像头前面的人重新长出来。`shipAssets` 在 build 时从本地盘把它复制进 dist。

`lineage.json` 的形状：

```jsonc
{
  "version": 1,
  "entries": [{
    "id": "spine.porcelain.lin8b3679",   // = PartMeta.id
    "job": "slow-mtylyb3a-8b3679",
    "session": "anon-live1",             // 谁触发的（匿名号，不含任何身份信息）
    "createdAt": "2026-09-12T16:37:00.494Z",
    "species": "porcelain",              // 哪个物种 = PartMeta.family
    "slot": "spine",                     // 哪个槽位
    "credits": 0.5,
    "provider": "hyper3d",               // 或 "fake"（SLOW_FAKE 跑出来的）
    "meta": { /* 完整 PartMeta */ }
  }],
  "spend":    { "2026-09-12": 1.5 },     // 日闸门
  "sessionsDay": "2026-09-12",
  "sessions": { "anon-live1": 0.5 },     // 人均支出
  "attempts": { "anon-live1": 1 },       // 人均次数
  "totalCredits": 1.5
}
```

索引上限 `lineageMaxParts`（240）到了之后丢**最旧的索引条目**，
但**不删 glb** —— 删文件是不可逆的，而"这件是谁留下的"这条痕迹丢了就找不回来（文件还在盘上，可人工捡回）。

抽中规则的服务端那一半：`GET /__slow/lineage` 按 `species` 过滤、按时间倒序、最多 `lineageServeLimit`（64）件。
概率那一半是前端的：`SLOW_LOOP.lineageChance`（0.35）也一并由这个端点吐回去，
省得同一个数字在两边各写一遍。

## 6. 失败矩阵

| 情况 | 出口 | 有测试？ |
|---|---|---|
| Rodin 超时 / 排队太久 | `failed` +「生成超时…稍后再试」 | ✅ `slow.test.ts` 看门狗那条 |
| 任何一步卡死（网络/下载/规范化） | 看门狗 `jobTimeoutMs` → `failed` +「服务端等待超过 Ns，已放弃」 | ✅ |
| HTTP 429 | `rodin.ts` 读 `Retry-After` 自己等；重试 5 次仍不过 → `failed` +「被限流了」 | 由 `rodin.ts` 覆盖 |
| 剪影里没认出物体 | `failed` +「换一帧（人要整个在画面里）」 | ✅ |
| 内容策略拒绝 | `failed` +「这张剪影被内容策略拒绝了」 | 同一条路径 |
| 账号并发上限 | `rodin.ts` 自己等（最多 30 次×15s） | 由 `rodin.ts` 覆盖 |
| Rodin 账户余额不足 | `failed` +「Rodin 账户余额不足」；提交前的余额闸门先拦一道 | 分支已写，`Not run` |
| **未焊接的百万面网格**（`docs/07 §3` 第 3 条） | 容差焊接 + 逐级放宽误差减面 → 仍然 ready、仍然 ≤5000 面 | ✅ 造了个 6000 面不共享顶点的网格跑真流水线 |
| 减面兜不住 / 长度不是 1 / socketA 不在原点 | **当成失败**，不交出去 —— 挂上去是歪的，观众只会觉得作品坏了 | 分支已写，`Not run` |
| 下载列表里没有 glb | `failed` +「生成完成但下载列表里没有 glb」 | 分支已写，`Not run` |
| 超预算 | 提交**当场**被拒（`BUDGET_*`），一次生成都不会发起 | ✅ 两条 |
| 生产构建 | `/__slow` 全线 404 | ✅ curl 打过 dist（见 §7） |

## 7. 离线验证（不烧 credits）

```bash
npm run dev:slow            # = SLOW_FAKE=1 npm run dev -w @sb/app
```

`SLOW_FAKE=1` 时不调 Rodin：从 `assets/parts/` 里按 seed 挑一件同槽位的已有 glb 当"生成结果"，
**后续流程一步不少**——规范化、写血统池、写索引、返回 `SlowJob`。它验不了的只有 Rodin 本身。

为什么必须有这条路：这条回路每验证一次就烧一次真钱，而需要被反复验证的恰恰是它**后面**的部分。

自动化的那一份在 `packages/app/test/slow.test.ts`（随 `npm run check` 跑，47 条里有 8 条是它）：
端到端 + HTTP 外壳 + 上面那张失败矩阵。测试写进临时目录，绝不碰真的 `assets/`。

手工取证：`scratch/evidence/slow-loop-dev.log`（dev 端到端 + 全部拒绝路径）、
`scratch/evidence/slow-loop-prod.log`（`vite preview` 打 dist，`/__slow` 全线 404）。

## 8. 前端要调的接口

```ts
// 1. 触发（进入 ALIVE 且过了 SLOW_LOOP.armAfter 秒；每人 maxPerSession 次）
const png: Blob = await maskToPng(capture.latest().mask);   // 白形黑底，docs/07 §4B
const res = await fetch(`/__slow?slot=spine&session=${sessionId}&species=${theme}`,
                        { method: 'POST', body: png, signal: AbortSignal.timeout(SLOW_LOOP.requestTimeoutMs) });
if (!res.ok) { slowLoop.disabled = true; return; }      // 404=生产构建没有这条回路；429=预算；一律静默关掉
const job: SlowJob = await res.json();

// 2. 轮询（SLOW_LOOP.pollIntervalMs / maxPolls）
const st: SlowJob = await (await fetch(`/__slow/${job.id}`)).json();
// st.status === 'failed' → st.error 是人话，进 debug HUD，不要弹给观众

// 3. 到货
if (st.status === 'ready') {
  const geometry = await loadGlb(st.url!);              // MeshoptDecoder 必须挂上，见 library.ts
  creature.graft(slotKeyOf(st.slot), st.meta!, geometry);
}

// 4. 血统：开场组 genome 之前拉一次，按 lineageChance 决定要不要把前人的件放进候选
const lin = await (await fetch(`/__slow/lineage?species=${theme}`)).json();
if (rng.next() < lin.chance && lin.parts.length) {
  index.parts = index.parts.concat(rng.pick(lin.parts));         // 就是标准 PartMeta，makeGenome 照抽
}
```

四条纪律（P3 / `docs/06 §5`）：
1. 全程 `try/catch` + `requestTimeoutMs` 超时；任何失败 → `slowLoop.disabled = true`，本次会话不再尝试。
2. **404 是正常答案**，不是错误 —— 线上 Web 版本来就没有这条回路。
3. 慢回路的任何状态都不允许影响快回路的帧率或姿态。
4. `session` 由前端生成并在本次会话里保持不变；它是匿名的，**不许**放进任何可以关联到人的东西。
