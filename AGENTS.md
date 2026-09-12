# Agent Instructions — SECOND BODY

> Originally written in Chinese. **This English text is now the source of truth**;
> the Chinese version has been superseded rather than kept alongside, because two
> copies of a rulebook drift and a drifted rulebook is worse than none. The old
> wording is in git history. (Documents that are part of the *artwork* — `docs/PRD.md`,
> `docs/00`, `docs/25`, `docs/26`, `docs/27`, `docs/31`, and every code comment
> under `packages/` — stay in Chinese on purpose. See `docs/index.md`.)

A real-time interactive installation: camera → human pose → rigid parts attached
to a skeleton → WebGPU render, plus a slow loop that sends the visitor's
silhouette to a 3D generation model. TypeScript (run directly as `.ts` via Node
type-stripping — there is no build step) + three.js WebGPU + a Node asset
pipeline.

## Before you start: confirm your baseline

Worktrees are branched from a commit that is often **behind** `main`, and the
files a task card names may simply not exist in yours. This has cost us four
rounds of wasted work (`docs/15-ORCHESTRATION.md` §6.5). So, first:

```bash
git rev-list --count HEAD..main     # not 0 → `git merge main` before anything else
ls <every path your task card names>
```

Then re-check after merging. **If any check still fails, stop and report. Do not
start work.** Thirty seconds of self-check versus a wasted round, or — worse — an
agent that silently builds a second, parallel foundation because it could not see
the first one.

## Reading route (read only the part your change needs)

1. `docs/00-PROJECT-BRIEF.md` — always; 30 seconds
2. `docs/02-ENGINEERING-PRINCIPLES.md` — before any non-trivial change
3. parts / asset format → `docs/03-SPEC-part-library.md`
4. rig / coordinates / attachment → `docs/04-SPEC-rig-and-attach.md`
   (**where hidden bugs are most likely**)
5. evolution / genome / lifecycle → `docs/05-SPEC-genome-and-evolution.md`
6. cross-module interfaces → `docs/06-SPEC-runtime-protocol.md`
7. boundary or layering questions → `docs/01-ARCHITECTURE.md`
8. calling Hyper3D → `docs/07-HYPER3D-API.md` (**do not write the client from memory**)
9. themes / opening chooser → `docs/12-SPEC-themes.md`
10. web deployment → `docs/13-DEPLOY.md`
11. on-site behaviour and risk → `docs/09-RISKS-AND-UNKNOWNS.md`

`docs/08-OPEN-SOURCE-BASE.md` is background, not a contract.
`docs/10-SURFACES.md` is the single source of truth for *what actually runs* —
**update it once your code change lands.**
`docs/11-TASKS.md` holds the task cards.
`docs/index.md` is the full map; `docs/34-REPO-STYLE.md` is the house style for
the repo's front door.

## Invariants

- **Never throw inside the frame loop.** Every fallback path must exist and must
  have been exercised (P2 / P3).
- **Units and coordinate systems are defined once, in `docs/04-SPEC`.** Do not
  restate them elsewhere and do not patch around them.
- `packages/core` may not import `three` and may not touch `window` / `fs`.
  Dependencies point downward only.
- All randomness arrives via an injected `Rng`; all time arrives via an injected
  `dt`. `Math.random()` and reading a clock inside a module are forbidden.
- The app must run normally when `parts.json` is absent (placeholder geometry).
- Never commit `.env`, API keys, or footage of real people.
- Add no dependencies without first writing down why the platform's own
  capability, or fifty local lines, would be worse.
- Every tunable number lives in `packages/core/src/tuning.ts`. A constant tuned
  anywhere else is in the wrong place.
- `docs/archive/` is a trace of what happened, not a current instruction.

## Change discipline

Before any non-trivial change, write these five lines:

```
Outcome:    what one person can do once this is finished
Boundary:   the smallest surface of the system this touches
Invariants: what must still hold afterwards
Proof:      the commands to run / the on-site check
Non-goals:  the adjacent work being deliberately excluded
```

One coherent change at a time. Do not fold in unrelated refactors, dependency
upgrades, file moves, or reformatting.

Three frozen contracts — `docs/03`, `docs/04`, and
`packages/core/src/types.ts` — **are not yours to edit. Stop and report
`contract change needed: <reason>`** and let the contract owner make the change
and broadcast it.

Commits: `<type>(<domain>): <imperative, lowercase, no trailing period>`.
`type` is one of feat / fix / perf / test / docs / chore. `domain` names a
domain, not a directory: `rig` / `genome` / `factory` / `render` / `capture` /
`stage` / `protocol`.

## Report when you stop

```
Status:     done / partial / blocked
Scope:      what changed
Validation: the exact commands you ran; for anything you did not run, write Not run plus the reason
Risks:      what might still be wrong
Next:       one concrete next step
```

**You may only call something passing if you ran it.** A check written as
`Not run`, with a reason, is a complete answer; "it should work" is not.
The one gate before merging is `npm run check`.
