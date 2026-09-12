# 15 · Orchestration —— 并行推进的规则

> 主线是**代码底座**，由多个子代理在各自 worktree 分支上推。
> 素材工厂是**侧线**，在主目录跑（二进制大文件不适合分支合并）。
> 这份文档是编排者的台账：谁在改什么、按什么顺序合、冲突怎么处理。

## 1. 泳道

| 线 | 分支 | 归属文件 | 卡 |
|---|---|---|---|
| 主线 A · 采集 | worktree | `packages/app/src/capture/**`、`dev/capture.html` | T-01（顺带解 U1/U2） |
| 主线 B · 骨架 | worktree | `packages/core/src/{skeleton,stabilize}.ts` + 对应测试 | T-02 / T-04 |
| 主线 C · 运动 | worktree | `packages/core/src/motion.ts` + 测试 | T-06 |
| 主线 D · 装配 | worktree | `packages/app/src/{assets,creature}/**`、`dev/figure.ts` | T-07 |
| 主线 E · 选择页 | worktree | `packages/app/src/{choose,vendor}/**`、`dev/choose.html` | T-18 |
| 侧线 F · 素材 | **主目录** | `assets/**`、`packages/factory/**` | T-13 + 新物种生成 |

## 2. 三条硬规则

1. **冻结契约谁都不许改**：`packages/core/src/types.ts`、`tuning.ts`、`docs/03`、`docs/04`。
   需要改就**停下来报告**"需要变更契约：<原因>"，由编排者统一改并广播。
   唯一例外：主线 A 可以改 `docs/04 §1` 的轴向表，因为那是它实测出来的结论。
2. **`packages/core/src/index.ts` 谁都不许动。** 它是唯一会被多条线同时碰到的文件，
   由编排者在合并时统一补导出。这条规则让 5 条线的冲突面降到接近 0。
3. **泳道外的文件不要顺手改。** 看到别处有 bug，写进收尾报告，不要动手。

## 3. 合并顺序

```
F 素材   ── 随时合，它只动 assets/ 和 factory/，和谁都不冲突
B 骨架 ─┐
C 运动 ─┼─→ 先合 core（B、C 只碰各自的文件）
        │
A 采集 ─┼─→ 再合 app 里互不重叠的三条（A / D / E）
D 装配 ─┤
E 选择页┘
        └─→ 最后由编排者补 core/index.ts 的导出，跑一次 npm run check
```

每条线合进来之前必须自己 `npm run check` 通过。合完再整体跑一次。

## 4. 合并后才能做的事（依赖已经排好）

- `T-09 Stage`（灯光/后期）依赖 D 装配
- `T-16 kiosk + ?demo=1 回放` 依赖 A 采集
- `T-17 慢回路` 依赖 D 装配（热插拔）+ F 素材（anchor 图要一起送进生成）
- **主程序 `src/main.ts` 的组装**依赖 A+B+C+D+E 全部合完 —— 这是编排者的活，不发给子代理：
  一帧的顺序在 `docs/06 §1` 已经写死了，照抄即可。

## 5. 收尾报告格式（所有线统一）

```
Status:     done / partial / blocked
Scope:      改了什么
Validation: 跑过的确切命令；没跑的写 Not run 加理由
Risks:      可能还不对的地方
Next:       一个具体的下一步
```

**跑过才能说通过。** 没跑的检查写 `Not run` 加理由是完整的答案；说"应该能跑"不是。

## 6. 踩过的坑（编排者的错，记下来别再犯）

### 6.1 `pgrep -f "<字符串>"` 会匹配到等待自己的那条 shell
```bash
until ! pgrep -f "cli.ts generate" >/dev/null; do sleep 10; done   # ❌ 永远不退出
```
等待用的 shell 自己的命令行里就含 `cli.ts generate` 这个字符串，`pgrep -f` 匹配到自己。
实际后果：两个代理各挂了 32 分钟和 26 分钟。正确写法：
```bash
until ! pgrep -f "[c]li.ts generate" >/dev/null; do sleep 10; done  # ✅ 方括号骗过自身匹配
# 或者按可执行文件过滤：ps -eo comm=,args= | awk '$1=="node" && /cli\.ts generate/'
```

### 6.2 两个代理共用一个工作目录 → git index 竞争
素材线在主目录工作（二进制不适合分支合并），我又在同一个目录提交，
结果它 `git add` 之后、`git commit` 之前被我的提交把 106 个文件一并带走了。
文件没丢，但挂在了别人的信息下。
**规则**：同一目录里同时只能有一个写者。不得已时用
`git commit -o <pathspec>`（只提交指定路径，绕开共享 index）。

### 6.3 多个 worktree 各自起 dev server，端口会串
文档里写死 `5173`，但那个端口可能被另一个 worktree 占着；
落到 5174 的服务读的是**那个 worktree 的 `assets/`**，而 worktree 里
`assets/raw/` 是空的（被 gitignore）。写回类的中间件会把文件写进错误的目录。
**规则**：任务卡里凡是要开 dev server 的，都必须先确认端口对应的是哪个目录。

### 6.4 代理 rebase 到"正在移动的 main"上，会暂存出删除冻结契约的变更

T-16 在整理提交时用了 `git reset --soft main`。而在它工作期间，
编排者往 main 上落了一个新提交（A 档身体方案）。
于是它的暂存区一度显示：**要删掉 `packages/core/src/bodyplan.ts`、
并从冻结契约 `types.ts` 里移除 `bodyPlan` 字段**。

它没有提交那个状态，退回旧基线重做再 rebase —— 这是对的，而且它主动报了上来。
但换一个不够警觉的代理，这一步会**静默删掉别人刚落地的东西**。

**规则**：
- 代理整理提交时不要用 `git reset --soft main`（main 会动）。
  用 `git reset --soft <自己分支的起点 sha>`，那个 sha 是不动的。
- 提交前一律 `git diff --cached --stat` 看一眼：**出现自己泳道以外的文件就是错的**，
  尤其是 `packages/core/src/types.ts` / `tuning.ts` 这两个冻结契约。
- 编排者在有代理在跑时往 main 落提交，要意识到这会让所有分支的"相对 main"含义发生变化。

### 6.5 任务卡里引用的文件，必须是**已提交**的文件

给 mass 那条线写的任务卡里有两处假前提：
- "读 `docs/22-RESEARCH-procedural-bodies.md`，里面有可照抄的骨架和实测数字" ——
  那份文档当时还是 untracked，worktree 是从提交分出去的，里面根本没有。
- "读 `AGENTS.md`（尤其新加的 §craft 和 §plan）" —— 那两节在 `docs/02`，不在 `AGENTS.md`。

代理如实报了上来（"这两个前提是假的，所有数字是我自己测的"），没有假装读过。
但它因此白花了一轮去重新调研。

**规则**：发任务卡之前跑一次
```bash
git status --porcelain docs/ packages/    # 有 ?? 就是还没提交
```
凡是卡里点名要读的路径，都要确认它在 **worktree 能看到的那个提交**里。
worktree 看不见你工作区里没提交的东西 —— 这一点很容易忘。

## 7. 编排者自己的清单

- [ ] 每条线回来先看 Validation 那一栏，再看 diff
- [ ] 合完补 `core/index.ts` 导出，整体 `npm run check`
- [ ] 更新 `docs/10-SURFACES.md`（唯一可信状态表）
- [ ] 契约变更请求统一处理并广播给还在跑的线
- [ ] 组装 `src/main.ts`，按 `docs/06 §1` 的一帧顺序
