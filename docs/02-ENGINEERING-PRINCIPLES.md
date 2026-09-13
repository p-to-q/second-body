# 02 · Engineering Principles

> This document was originally written in Chinese. **This English text is now the
> source of truth.** The Chinese original has been superseded, not archived
> alongside it — two copies of a rulebook drift, and a drifted rulebook is worse
> than none. The old wording is recoverable from git history if you need it.

> **This is the constitution for everyone working on the project, sub-agents
> included. Where it conflicts with a task card, this document wins.**
> Any change that violates one of these is reverted. No discussion.

## Where this lands

We are making **one installation artwork** — not a product, not a framework, not
a demo. What we finally ship is: ninety seconds in which a stranger stands in
front of a screen, and the one frame out of those ninety seconds that is worth
screenshotting and sending to someone.

But **the code has to be finished like a craft object.** Those two statements do
not pull against each other; they are the same statement:

> The show happens once. A piece that is not finished cleanly underneath will
> break at **exactly the moment you least want it to** — with an audience
> standing in front of it.

So "craft object" here is not an aesthetic demand. It is a reliability demand.
The concrete standard is §craft below.

## §craft · What "done" means

Something is done when **the parts nobody sees are finished too**:

- **The error path is designed as deliberately as the happy path.** The audience
  must never see "something went wrong" (`docs/23-SPEC-ui.md` §S8).
- **Empty states are designed, not forgotten.** What the screen looks like with
  no assets, no person, and no network is part of the artwork.
- **Every module carries its own evidence.** A check you did not run is written
  `Not run` plus the reason; "I think it should work" is not evidence.
- **Comments are written for the person opening this file for the first time six
  months from now**, not for yourself. Explain *why it is this way* rather than
  restating what the code does. Above all, write down **the traps you fell
  into** — that is the most expensive information in the file.
- **A TODO is not a deliverable.** If you leave one, say who, under what
  condition it becomes live, and what they are supposed to do.
- **Deleting is harder than adding, and worth more.** For every extra module,
  dependency, or UI element, you must be able to say why it should *not* be
  deleted.

## §plan · How each round decides what to do

Rank work by asking, in this order:

1. **Does this make the artwork more real?** Not "does this make the pipeline
   smoother". (We have already been burned here once: the pipeline, the
   contracts and the orchestration were all solid, and the artwork still did not
   stand up — because it had only one mode of expression. See
   `docs/18-BODY-PLANS.md` §5.)
2. **Is it solving a problem we have actually confirmed?** Confirmed means
   someone saw it, or there is a number. Do not pre-optimise an unconfirmed
   problem.
3. **If it fails, does it wreck the show?** If so, build the fallback first and
   the feature second.
4. **Is it cheap?** At equal payoff, always do the cheap one first — cheap is
   what makes it affordable to be wrong.

## P0 · Contract first, implementation second

Every cross-module type, constant, and file format lives in exactly two places:

- `packages/core/src/types.ts` — every shared runtime type
- `docs/03-SPEC-part-library.md` — the on-disk asset format (`parts.json`)

**Both are frozen.** If your task makes you feel you have to change them, the
task card is wrong: **stop, write "contract change needed: `<reason>`" in your
task output, and do not edit them yourself.**

## P1 · Pure functions first, in every module

- Computational modules (filtering, skeleton construction, motion features,
  genome) **must be pure**: input → output, no global state, no DOM, no
  `Date.now()`, no `Math.random()`.
- Anything that needs state becomes a `createX()` factory returning a closure —
  state held explicitly, and `reset()`-able.
- Anything that needs randomness **must** take an `Rng` argument
  (`packages/core/src/rng.ts`). Bare `Math.random()` is forbidden.
  The reason: the same `seed` must produce the same body forever, or the show
  cannot be reproduced, cannot be debugged, and cannot mint a keepsake QR code.
- Anything that needs time **must** take `dt` or `t` as an argument. Reading a
  clock from inside a module is forbidden.

## P2 · Never throw inside the frame loop

Nothing in the render loop is allowed to `throw`. The strategy:

```ts
// ✅ right
const part = library.get(id) ?? library.fallback(slot);   // missing asset → placeholder geometry
if (!Number.isFinite(v)) v = lastGood;                     // NaN → hold last frame

// ❌ wrong
const part = library.get(id)!;   // blows up in front of the audience
```

- Treat every external input (camera, model output, network) as **untrusted** by
  default: it may be NaN, Infinity, undefined, or an empty array.
- The first line of every `update(dt)` entry point clamps and sanitises input.
- One top-level `safeFrame()` wraps the loop in try/catch: it logs with
  `console.error` and continues to the next frame. **It never breaks rAF.**

## P3 · Every fallback path must exist and must have been exercised

| Failure | Fallback | Owner |
|---|---|---|
| WebGPU unavailable | three.js `WebGPURenderer` falls back to the WebGL2 backend on its own | runtime |
| `parts.json` missing or corrupt | procedural placeholder geometry (capsules/boxes), **the app keeps running** | runtime |
| a single `.glb` fails to load | that slot falls back to placeholder geometry, other slots unaffected | runtime |
| tracking lost < 1s | hold the last pose, slight idle drift | runtime |
| tracking lost > 1s | enter LEAVING → dissolve | runtime |
| Hyper3D API fails | the slow loop gives up silently; the fast loop is completely unaffected | factory/runtime |
| camera permission denied | show one line of guidance and replay recorded pose data (demo mode) | runtime |

**The app must run when `assets/parts/parts.json` does not exist.** This one is
hard-required: it is what lets runtime development and asset production proceed
fully in parallel without blocking each other.

## P4 · Units and coordinate systems are defined exactly once

See `docs/04-SPEC-rig-and-attach.md` §1. In brief:

- **Units: metres.** Every length, position and velocity is metres or
  metres per second. Pixels are not allowed to appear.
- **Coordinate system: the three.js right-handed system, Y-up, -Z into the
  screen.**
- **Mirroring happens in one place and one place only**: `mediapipeToWorld()`.
  Every line of code after it lives in an already-mirrored world.
- Any function that performs a coordinate conversion must carry `To` in its name
  (`mediapipeToWorld`, `worldToScreen`).

## P5 · The performance budget is a requirement, not an optimisation

Target: **1440p / 60fps / Apple-silicon MacBook Pro**.

| Item | Budget |
|---|---|
| part instances on screen | ≤ 64 |
| total triangles | ≤ 250k |
| single part `.glb` | ≤ 5k tris, ≤ 1.5 MB |
| draw calls | ≤ 40 |
| CPU JS per frame | ≤ 4 ms |
| inference (MediaPipe) | independent of rendering, ≥ 30 Hz, latency ≤ 60 ms |

A module over budget does not get merged. The numbers themselves live in
`packages/core/src/tuning.ts` (`BUDGET`); the live readout is the HUD in
`packages/app/src/shell/hud.ts`, which mounts when you pass `?debug=1`.

## P6 · One task = one file + one acceptance criterion

The task-card format (`docs/11-TASKS.md`) is fixed:

```
### T-xx Title
- File:       packages/.../foo.ts       ← touch only this file (and its test)
- Depends on: T-yy is done
- Contract:   import these types from types.ts, do not redeclare them
- Do:         ...
- Do not:     ...
- Acceptance: `npm run test -w @smu/core -- foo` passes, and <observable phenomenon>
```

- **Do not refactor other files on the way past.** If you see a bug elsewhere,
  write it into your task output; do not touch it.
- **Do not introduce new runtime dependencies.** If you need one, ask for it in
  your output with the reasoning spelled out. Same for devDependencies.
- **Do not add abstraction layers.** This is a project that will be thrown away
  or exhibited in 48 hours — it is not a library to be maintained for five years.

## P7 · Every module carries runnable evidence

- Every module in `packages/core` gets a `*.test.ts` using the built-in
  `node:test` + `node:assert`. Zero dependencies.
- For visual or interaction changes, the "evidence" is a screenshot or a
  ten-second screen recording, dropped in `scratch/evidence/` and cited in your
  output.
- "I think it should work" ≠ evidence. A task with no evidence counts as unfinished.

## P8 · Secrets live in exactly one place

- `RODIN_API_KEY` is read only from `.env`, used only inside
  `packages/factory`, and **never enters a browser bundle**.
- A hard-coded key anywhere in any file = immediate revert.
- When the slow loop needs the browser to trigger a generation, it goes through
  a localhost proxy served by `packages/factory`; the key stays on the Node side.

## P9 · Determinism and reproducibility

- Part generation (factory) uses fixed `seed`s; `recipes/*.json` is the single
  source of truth, and results are recorded in `assets/raw/ledger.json`.
- A recipe that already succeeded is **never regenerated** — it saves credits and
  it keeps the assets stable.
- At runtime a body is fully determined by `Genome { seed, tier }`. Given a seed,
  it must reproduce pixel for pixel.

## P10 · The show comes first

Any approach that is "more elegant but more likely to break on site" is not
chosen. Concretely:

- No dependency on the network (the slow loop is the single exception, and its
  failure must not affect the main experience).
- No dependency on login, no dependency on cloud state.
- Starting up = open one URL, go fullscreen, done. Nobody types a second command
  into a terminal.
- There is a `?demo=1` mode: with no camera it replays recorded pose data, for
  showing judges and for surviving a dead network.

---

# Earned the hard way (P11–P20)

> Each of these carries the thing that taught it to us.
> **A principle without a story does not survive three days.**

## P11 · A bad contract is fixed by its owner, never patched downstream

A task card's acceptance criterion was wrong once: it demanded an assertion that
raising the left hand puts `handL` at world +X. In fact MediaPipe's `left_*` is
**the subject's** left side, which — facing the camera — appears on the right of
the image, and after mirroring lands at -X.

The agent holding that card **did not** bend the implementation to make the test
go green. It stopped and reported upward — which was the right call. The fix was:
change the contract, write down the derivation (the "left and right" section of
`docs/04` §1), and make sure the next person cannot get it backwards again.

> Find a problem in a contract → stop and report `contract change needed:
> <reason>`. Never accommodate a wrong spec in order to pass acceptance.

## P12 · A bad upstream multiplies into a batch of bad downstream

The asset line found that the anchor images for three species were themselves
fragmentary or contained multiple objects. It **stopped and asked a human**
rather than generating fifteen more pieces of garbage from a bad anchor and
calling it delivered.

> When one stage's output becomes the next stage's input, validate it first.
> On a pipeline that costs money, "just finish it and see" is the most expensive
> way to work.

## P13 · A destructive default has to be designed to be safe

`factory:normalize --ids=` used to rewrite the entire index down to just the
named pieces. Someone used it for a targeted normalisation → an index of 186
parts became an index of 2 → the runtime went to an empty stage. And the only
visible symptom was "the app seems broken"; there was no way to tell from the
screen that the index had been gutted.

> The default semantics of a "partial" operation must be **merge**, not replace.
> If an operation can delete things you did not name, its default behaviour is
> wrong.

## P14 · The measuring instrument will lie to you

`await`-ing `renderAsync()` every frame pushes rendering into the microtask
queue, which makes the **frame-time readout itself wrong**. Left to be discovered
while tuning performance on site, this is brutal to track down — because the
number you are trusting is the thing that is broken.

> Confirm the measurement is right before you optimise the thing being measured.

## P15 · Do not turn a conclusion from data back into a formula for elegance

The table of "which slots copy the torso silhouette" came from eyeballing 186
parts. We nearly replaced it with a rule — "aspect ratio < 1.6 counts as
near-cubic" — which dropped `foot` (ratio 2.1), and `foot` was the worst offender
of the lot.

> A list you got by looking at things gets to stay a list.
> Swapping it for a formula to save a few lines trades correctness for elegance.

## P16 · An extension point must carry its own fault isolation

The Director behind the gameplay extension point (`docs/16-SPEC-acts.md`)
specifies: an Act that throws three times in a row is permanently disabled and
falls back to `follow`.

> Making "try any new idea you like" *safe* is the precondition for that space
> existing at all. Nobody uses an extension point twice if it can take the whole
> artwork down with it.

## P17 · No real person, no invented numbers

The capture line finished the whole chain but refused to answer "which way do
MediaPipe's axes point" — because there was no real human on that machine who
could stand in front of the camera and crouch. It reported `partial`, and stated
plainly: "ten minutes to solve, but it needs a person with a body."

> This is the hardest form of §craft's "every module carries its own evidence":
> **better an honest half-finished thing than a fabricated finished one.**

## P18 · Synthetic data has to shout from the path that uses it

A direct consequence of P17: the project contains a procedurally generated
placeholder pose file. It had a note inside it — but **you only saw the note if
you opened the file**. So we added a `console.warn` on the load path, and now
every single use of it reminds you once.

> A trap that is only labelled in the documentation is still a trap.
> It has to make a noise **at the moment somebody steps on it**.

## P19 · Leave headroom in parallelism; long jobs must resume from where they stopped

We once ran nine lines at once, hit the session quota, and **all nine were
interrupted together**. What survived: what had been committed, and what had been
written to a file. What died: whatever was still in memory.

> More parallel is not better. Every additional line raises the odds of
> "everything fails at once". Long jobs must be designed to resume from the point
> of interruption — the idempotent ledger is what saved the asset line, because
> a rerun only retries the failures.

## P20 · The orchestrator's own hand slips too

In order: `git add -A` pulled five worktrees into the index as submodules; a
wait command handed out as `pgrep -f "cli.ts generate"` matched the very shell
that was waiting on it, hanging two agents for half an hour; and sharing the main
working directory with the asset line collided on the git index.

> The orchestrator's mistakes get **multiplied by the parallelism**.
> So every instruction the orchestrator sends out should be checked as though it
> were going to be executed ten times.

(The concrete orchestration discipline is `docs/15-ORCHESTRATION.md` §6.)

## P21 · Your instruments lie in the direction that flatters you

Five times, in five different disguises, the same failure:

| What we trusted | What it actually said | How it was found |
|---|---|---|
| Poster numbers "computed, never typed" | Computed **once**, then frozen at 191 parts while the repo moved to 208 | Someone re-derived them for an unrelated task |
| `/dev/*.html` pause button | `dt` was clamped to `[1/240, 1/15]`, so "pass 0 to freeze" still advanced 1/240s per frame; a thousand virtual frames ran before the screenshot | A transition's "mid frame" looked identical to its end state |
| `until grep ALLDONE out.log` | All 24 screenshots were on disk; the producer just never reached the final `echo` | A wait loop hung for nine minutes with no timeout |
| Harvest sources pinned to `main` | The upstream mesh can change under you, and `check:parts` still reports 0 errors | Read during a review, not caught by any check |
| Frame-time HUD showing milliseconds | `frame 2.42ms` at **16 fps**. The mass renderer had never once hit frame rate — three shipped species run as slideshows | An agent measured fps with a rAF counter because a figure looked sluggish |

None of these were lies anyone told. Every one was an instrument reporting a
number that was **true about the wrong thing**, and in every case the wrong
thing was the flattering thing: the count that was right yesterday, the frame
that never advanced, the marker instead of the artefact, the branch instead of
the commit, the milliseconds instead of the rate.

> **Ask what your instrument would show if the thing were broken.**
> If the answer is "the same as now", it is not an instrument.

Three rules that fall out of it, in the order they cost us:

1. **Measure the artefact, not the marker.** A marker means the producer *said*
   it finished. The artefact means it *did*.
2. **A derived number is only true at the moment it was derived.** Either
   re-derive it at the moment of use, or stamp it with what it was derived from.
3. **Report the units the failure would show up in.** Milliseconds hide a stall
   that frames per second cannot; a still frame hides a frame rate that a rAF
   counter cannot.

This principle outranks the instinct to add another check. Five of these got
past a suite that was green every single time — because each check was asking
the flattering question.
