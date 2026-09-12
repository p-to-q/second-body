# 15 · Orchestration — the rules for running lines in parallel

> Originally written in Chinese. **This English text is now the source of truth**;
> the Chinese version has been superseded rather than kept alongside it. The old
> wording is recoverable from git history.

> The main effort is the **code base**, pushed by several sub-agents on their own
> worktree branches. The asset factory is a **side line** running in the main
> working directory (large binaries do not merge well across branches).
> This document is the orchestrator's ledger: who is changing what, in what order
> it merges, and how conflicts get handled.

## 1. Lanes

| Line | Branch | Files it owns | Card |
|---|---|---|---|
| Main A · capture | worktree | `packages/app/src/capture/**`, `dev/capture.html` | T-01 (resolves U1/U2 along the way) |
| Main B · rig | worktree | `packages/core/src/{skeleton,stabilize}.ts` + tests | T-02 / T-04 |
| Main C · motion | worktree | `packages/core/src/motion.ts` + tests | T-06 |
| Main D · assembly | worktree | `packages/app/src/{assets,creature}/**`, `dev/figure.ts` | T-07 |
| Main E · chooser | worktree | `packages/app/src/{choose,vendor}/**`, `dev/choose.html` | T-18 |
| Side F · assets | **main working directory** | `assets/**`, `packages/factory/**` | T-13 + new species |

## 2. Three hard rules

1. **Nobody touches a frozen contract**: `packages/core/src/types.ts`,
   `tuning.ts`, `docs/03`, `docs/04`. If you need one changed, **stop and
   report** `contract change needed: <reason>`; the orchestrator makes the change
   once and broadcasts it. The single exception: main line A may edit the axis
   table in `docs/04` §1, because that table is A's own measured result.
2. **Nobody touches `packages/core/src/index.ts`.** It is the one file every line
   would otherwise reach for; the orchestrator adds the exports at merge time.
   This rule alone drops the conflict surface across five lines to nearly zero.
3. **Do not fix things outside your lane on the way past.** See a bug elsewhere,
   write it into your closing report; do not touch it.

## 3. Merge order

```
F assets  ── merge any time; it only touches assets/ and factory/, and conflicts with nobody
B rig   ─┐
C motion ┼─→ merge core first (B and C touch only their own files)
         │
A capture┼─→ then the three non-overlapping app lines (A / D / E)
D assembly┤
E chooser┘
         └─→ finally the orchestrator adds the core/index.ts exports and runs npm run check once
```

Every line runs `npm run check` itself before merging in. Run it once more over
the whole tree afterwards.

## 4. Work that can only happen after merging (dependencies already ordered)

- `T-09 Stage` (lighting / post) depends on D assembly
- `T-16 kiosk + ?demo=1 replay` depends on A capture
- `T-17 slow loop` depends on D assembly (hot swap) + F assets (the anchor image
  has to be sent along with the generation request)
- **Assembling the main program `packages/app/src/main.ts`** depends on A+B+C+D+E
  all being merged. This is the orchestrator's own job, not a sub-agent's: the
  order of operations within one frame is already fixed in `docs/06` §1, and it
  just has to be followed.

## 5. Closing-report format (identical for every line)

```
Status:     done / partial / blocked
Scope:      what changed
Validation: the exact commands you ran; for anything you did not run, write Not run plus the reason
Risks:      what might still be wrong
Next:       one concrete next step
```

**You may only call something passing if you ran it.** A check written as
`Not run`, with a reason, is a complete answer; "it should work" is not.

## 6. Traps we fell into (the orchestrator's own mistakes, written down so they stop recurring)

### 6.6 `until grep "<标记>" <文件>` —— 生产者死了，等待者会等到天荒地老

`6.1` 记的是 `pgrep` 匹配到等待自己的那条 shell。这是同一个坑的另一半，
**而且更隐蔽**：这次匹配没问题，问题是**它等的那个标记永远不会被写出来**。

实际发生的（2026-09-13 06:07–06:16）：一条线批量截了 24 张图，
图**全部成功写到磁盘**（每张 790 KB），但两个无头 Chrome 没有退出，
于是产出脚本走不到最后那句 `echo ALLDONE`。等待循环因此挂了九分半，
而且如果没人管，它会一直挂下去 —— `until` 没有超时。

更坑的是 `burst.log` 看起来像"在进行中"：每行文件名后面的尺寸列是空的，
读起来像截图失败了。实际上那只是汇报格式的问题，**磁盘上的文件是好的**。
"看起来像坏了"和"真的坏了"在这里是两件事。

**规则**：任何 `until <条件>; do sleep N; done` 都必须带**超时**和**兜底判据**。

```bash
# 坏：生产者一死就永远挂着
until grep -q ALLDONE out.log; do sleep 5; done

# 好：超时 + 直接看真正想要的东西（文件本身），而不是一个标记
for i in $(seq 60); do
  [ "$(ls out-*.png 2>/dev/null | wc -l)" -ge 24 ] && break
  sleep 5
done
```

**判据要盯产物，不要盯标记。** 标记是生产者"说"它做完了；产物是它**真的**做完了。
标记会因为任何一个中间环节挂掉而丢失，而产物不会。

清理的顺序也记一下：先杀那两个无头 Chrome（活儿已经干完，只是没退），
如果循环仍不退出，说明写标记的那个 shell 本身已经没了 —— 直接杀循环。

### 6.1 `pgrep -f "<string>"` matches the very shell that is waiting on it

```bash
until ! pgrep -f "cli.ts generate" >/dev/null; do sleep 10; done   # ❌ never exits
```

The waiting shell's own command line contains the string `cli.ts generate`, so
`pgrep -f` matches itself. Real cost: two agents hung for 32 and 26 minutes. The
correct forms:

```bash
until ! pgrep -f "[c]li.ts generate" >/dev/null; do sleep 10; done  # ✅ the bracket defeats the self-match
# or filter by executable: ps -eo comm=,args= | awk '$1=="node" && /cli\.ts generate/'
```

### 6.2 Two agents sharing one working directory → a race on the git index

The asset line works in the main directory (binaries do not suit branch merges)
and the orchestrator committed from that same directory. The result: after the
asset line's `git add` but before its `git commit`, the orchestrator's commit
swept up all 106 of its files. Nothing was lost, but the work was filed under
someone else's name.

**Rule**: one writer at a time per directory. When that is unavoidable, use
`git commit -o <pathspec>` — it commits only the named paths and sidesteps the
shared index.

### 6.3 Several worktrees each starting a dev server → the ports drift

The docs hard-code `5173`, but that port may already be held by another
worktree. A server that lands on 5174 is reading **that worktree's** `assets/`,
and inside a worktree `assets/raw/` is empty (it is gitignored). Any write-back
middleware then writes files into the wrong directory.

**Rule**: any task card that starts a dev server must first confirm which
directory the port actually corresponds to.

### 6.4 An agent rebasing onto a *moving* `main` will stage the deletion of frozen contracts

T-16 used `git reset --soft main` while tidying its commits. During its run, the
orchestrator had landed a new commit on `main` (the tier-A body plans). So for a
moment its staging area read: **delete `packages/core/src/bodyplan.ts`, and
remove the `bodyPlan` field from the frozen contract `types.ts`.**

It did not commit that state — it went back to its old baseline, redid the work,
and rebased, which was right, and it raised the issue itself. But a less alert
agent would have **silently deleted something another line had just landed**.

**Rules**:
- When tidying commits, do not use `git reset --soft main` — `main` moves. Use
  `git reset --soft <the sha your branch started from>`; that sha does not move.
- Before committing, always run `git diff --cached --stat`: **any file outside
  your own lane is a mistake**, and `packages/core/src/types.ts` and `tuning.ts`
  above all.
- An orchestrator landing commits on `main` while agents are running must realise
  this changes what "relative to main" means on every branch.

### 6.5 A file named in a task card has to be a file that is already **committed**

The card written for the `mass` line contained two false premises:

- "Read `docs/22-RESEARCH-procedural-bodies.md`, it has a skeleton you can copy
  and measured numbers" — that document was still untracked at the time, and the
  worktree had been branched from a commit, so it simply was not there.
- "Read `AGENTS.md`, especially the new §craft and §plan" — those two sections
  are in `docs/02`, not in `AGENTS.md`.

The agent reported this honestly ("both premises are false; every number here is
one I measured myself") rather than pretending to have read them. But it burned a
round re-doing the research.

**Rule**: before dispatching a card, run

```bash
git status --porcelain docs/ packages/    # a `??` means it is not committed yet
```

and confirm that every path the card names exists in **the commit the worktree
can see**. A worktree cannot see what is sitting uncommitted in your working
directory — which is very easy to forget.

**Second occurrence; the rule was not enough.** The `/making` line reported that
`docs/26` did not exist in the repository, while it was plainly visible on the
trunk. The cause was a timing gap: the worktree was branched from `028513e`
(23:28) and `docs/26` landed in `e5b098e` (23:32), four minutes later. The file
*was* committed — the commit just happened after the card was dispatched.

So `git status --porcelain` is not the test. The test is **HEAD at the moment of
dispatch**:

```bash
git log -1 --format=%h -- <every path the card names>   # this commit must be an ancestor of HEAD
```

On ordering there is exactly one rule: **commit first, dispatch second**, with
nothing in between.

**Third occurrence. The rule becomes hard: every task card opens with a
self-check.**

After the first two I thought "commit before dispatching" was the fix. The third
proved it was not. The sound-effects line's worktree baseline sat at `9e2ed4b`,
while the synthesised sound layer had already merged into `main` at `f4fa630`.
It was unmistakably on the trunk when I dispatched, and unmistakably absent on
its side. **The commit a worktree was branched from is not necessarily the one
you assume.**

So the test can no longer be "I can see it from here". It has to be **the agent
verifying it on its own side**. From now on, every task card opens like this:

```
## First, one thing: confirm the baseline
<three to five executable checks covering the paths, exports and symbols the card names>
**If any one of them fails, stop and report immediately. Do not start work.**
```

The trade is plain: the self-check costs the agent thirty seconds. Skipping it
costs either a wasted round (twice) or an agent building a second, parallel
foundation because it could not see the first (nearly the third time — which
would have meant two AudioContexts, two mute paths, two test pages).

Worth adding: that line **stopping to report was correct**. `AGENTS.md` says to
stop and report when you touch a frozen contract or need to go outside your lane,
and it did, delivering the part that did not depend on the missing foundation
(the event list). Re-dispatching carried that list into the new card, so none of
the work was lost. The real cost is not the wasted round — it is that a line with
no source for its intent will invent one, and what comes back looks complete
while failing to match the standard. That kind of error is far harder to spot
than an error message.

## 7. The orchestrator's own checklist

- [ ] For every line that returns, read the Validation section first, the diff second
- [ ] After merging, add the `core/index.ts` exports and run `npm run check` over everything
- [ ] Update `docs/10-SURFACES.md` (the only trustworthy status table)
- [ ] Handle contract-change requests centrally and broadcast them to the lines still running
- [ ] Assemble `packages/app/src/main.ts`, following the per-frame order in `docs/06` §1
