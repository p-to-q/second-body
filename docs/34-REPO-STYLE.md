# 34 · Repo Style — how p-to-q writes a README, and where we differ

> Written in English on purpose: this is engineering discipline, not part of the
> artwork. See `docs/index.md` for which documents are English and which stay
> Chinese.
>
> **Method.** Every observation below cites a repository and a line. The
> fourteen public p-to-q READMEs were read in full via the GitHub API on
> 2026-09-13 (`gh api repos/p-to-q/<name>/readme`), together with nine
> `AGENTS.md` files and `https://www.ptoq.io/work`. Line numbers refer to the
> decoded README of that repository. Nothing here is from memory.
>
> **Coverage caveat.** `gh repo list p-to-q` returns 16 repositories (15 public,
> 1 private and archived). **`sonde` is not one of them** — `gh api
> repos/p-to-q/sonde` returns 404, and `ptoq.io/work` links "sonde" to
> `github.com/moapacha/sonde`, a different owner. No claim below is based on it.
>
> **The repository has since been renamed** to `see-me-see-u`. Every
> `second-body:N` citation below is left **exactly as written**: it names the
> repository as it was at the moment it was read, and rewriting a citation to
> match a later name would make it a false citation. The rows are evidence, not
> prose.
>
> **Reading the `second-body` rows.** Every `second-body:N` citation describes our
> README **as it stood before this pass** (commit `9e2ed4b`). That is the "before"
> state §12 exists to justify changing; the current README no longer matches those
> rows, which is the point.

---

## 0 · The one-sentence answer

**A p-to-q README reads like a museum wall label attached to a workshop
door.** A short, flat, unsold statement of what the thing *is* — then an equally
flat statement of what it is *not* and what does *not* work yet — then the two
or three commands that run it, then a list of doors into `docs/`. It never
sells, and it never doubles as a manual.

---

## 1 · Title

**Bare name. No emoji. No tagline glued onto the H1.**

| Repo | H1 |
|---|---|
| matter | `# Matter` (`matter:1`) |
| aleph | `# Aleph` (`aleph:1`) |
| murmur | `# Murmur` (`murmur:1`) |
| wittgenstein | `# Wittgenstein` (`wittgenstein:3` — line 1 is a bare banner `<img>`) |
| via | `# via` (`via:1`, lowercase) |
| jiko | `# [jiko]` (`jiko:1`) |
| carburetor | `# [carburetor]` (`carburetor:1`) |

Two conventions worth naming:

- The bracket form `[jiko]` / `[carburetor]` mirrors the org's own wordmark
  `[p → q]` (`site:8`), and `ptoq.io/work` repeats it: `[[carburetor]](<repo url>)`.
- **Zero emoji in any H1 across all fourteen repos.** The guess in the brief was
  right.

## 2 · The one-liner underneath

Three shapes, all third person. Never "We built…".

**(a) Blockquote tagline, `Name — noun phrase`:**
`> Matter — An interface for unfinished thought.` (`matter:3`)
`> **Aleph is a reverse prompt search engine.**` (`aleph:3`)

**(b) Bold standalone line, often lowercase, often two stacked:**
`**The modality harness for text-first LLMs.**` (`wittgenstein:5`)
`**a phone you refuel.**` (`carburetor:3`)
`**instant decision making instrument**` / `**a traffic light for your own
thoughts.**` (`jiko:3`, `jiko:5`)

**(c) One declarative paragraph, `X is a …`:**
`Matter is an environment where thought becomes touchable material.`
(`matter:5`)
`Murmur is a humming-to-song studio.` (`murmur:3`)
`jiko is a small physical signal instrument. it listens to one spoken
intention…` (`jiko:9`)
`A small thing that lives in your menubar and occasionally farts.` (`flatus:7`)

Most repos use **(a or b) followed by (c)**: a compressed label, then one
paragraph of mechanism. Imperative openers are essentially absent — the single
exception is `See the paths before you build.` (`via:6`), immediately followed
by a declarative (`via:8`).

First person plural exists but **never opens**: `## How we think about it`
(`aleph:49`), `## What We Tried To Make Deliberately` (`murmur:229`).

## 3 · Emoji

The split tracks audience, and the quiet cluster is the house style.

- **Zero emoji:** matter, aleph, jiko, site, repo-template, aleph-benchmark,
  centrifuge-sort, agent_lifeRestart, second-body. (`via`'s nine "symbol" hits
  are box-drawing characters in an ASCII tree, `via:128-131`.)
- **Functional only:** carburetor uses `⚠️` / `✅` purely as table status tokens,
  with the legend spelled out — `⚠️ = measured at bench-prototype scale`
  (`carburetor:40`).
- **Heavy:** wittgenstein alone (73 occurrences, 22 distinct), as modality
  row-icons inside tables (`wittgenstein:39-42`).

Matter's `AGENTS.md` states the rule the quiet cluster follows:
`never add open-source framing — no badges, no contribution invitations, no
"PRs welcome"` (`matter AGENTS.md:20-21`).

## 4 · Length

Actual `wc -l` / `wc -w` on the decoded content:

| repo | lines | words | | repo | lines | words |
|---|---|---|---|---|---|---|
| aleph-benchmark | 22 | 136 | | agent_lifeRestart | 140 | 822 |
| centrifuge-sort | 36 | 84 | | repo-template | 161 | 945 |
| **second-body** | **72** | **201** | | via | 188 | 1324 |
| site | 76 | 233 | | aleph | 252 | 1835 |
| matter | 93 | 593 | | wittgenstein | 476 | 3379 |
| carburetor | 102 | 774 | | murmur | 609 | 3067 |
| jiko | 115 | 546 | | flatus | 135 | 845 |

Median ≈ 118 lines / 798 words, and the distribution is **bimodal**: a quiet
cluster (matter 93/593, carburetor 102/774, jiko 115/546) and a maximal cluster
(murmur 609/3067, wittgenstein 476/3379, aleph 252/1835). Murmur's bulk is a
200-line getting-started section and a 39-row env-var table
(`murmur:255-455`, `:465-503`) — that is a hackathon judging artefact, not the
house voice.

**The target band for an art-installation repo is 90–130 lines.** Our 72 lines
are not too short; the problem is what is in them (§9).

## 5 · Fixed sections, and their order

There is no single fixed skeleton, but there is a recurring **order**:

```
identity → negative space → status → run → docs map → license
```

Concrete section lists:

- **matter** (`matter:11,41,75`): `## State` · `## Run` · `## Read`. Three.
- **jiko** (all lowercase): `## what it is not` · `## the ritual` ·
  `## signal states` · `## hardware direction` · `## three surfaces` ·
  `## quickstart` · `## docs` · `## contributing` · `## license`
- **aleph**: `## The image` · `## What it is` · `## What it is not` ·
  `## How we think about it` · `## Current status` · `## Repository map` ·
  `## Quick start` · `## Hosted API` · `## Short-term plan` ·
  `## Long-term plan` · `## Release gate` · `## License`
- **carburetor**: `## two units` · `## three editions` ·
  `## receipts (not claims)` · `## you cannot call on it` ·
  `## architecture (five layers)` · `## two surfaces, one architecture` ·
  `## quickstart` · `## docs map` · `## how to help` · `## License`

Three recurring formulae that are effectively org idioms:

| Idiom | Where |
|---|---|
| A **negative-space** section | `## What it is not` (`aleph:40`), `## what it is not` (`jiko:17`), `## What via does not claim` (`via:167`), `## you cannot call on it` (`carburetor:42`) |
| `## receipts (not claims)` | verbatim in `wittgenstein:117` and `carburetor:31` |
| `## two surfaces, one architecture` | verbatim in `wittgenstein:231` and `carburetor:62` |

A **docs map is near-universal**: `## Read` (`matter:75`), `## Repository map`
(`aleph:142`), `## docs` (`jiko:81`), `## Docs map` (`wittgenstein:277`),
`## docs map` (`carburetor:80`).

**Nobody writes a `## Features` section.** Feature lists are reframed into
stance: `## What it is` / `## What it is not`, `## What We Tried To Make
Deliberately` (`murmur:229`), `## signal states` (`jiko`), `## two units`
(`carburetor`).

## 6 · Badges, images, live links

| repo | badges | images | live link form |
|---|---|---|---|
| matter | 0 | 0 | none — localhost only (`matter:48`) |
| aleph | 0 | 0 | prose: `**Live site:** [https://aleph.ptoq.io](https://aleph.ptoq.io)` (`aleph:9`) |
| murmur | 0 | 0 (3 mermaid) | prose: `**Production**: https://murmur.ptoq.io` (`murmur:592`) |
| jiko | 0 | 0 | inside a status blockquote: `[site live](https://jiko.ptoq.io)` (`jiko:11`) |
| carburetor | 0 | 1 SVG (`carburetor:5`) | — |
| via | 2 | 1 SVG (`via:15`) | — |
| wittgenstein | 9 | banner + contrib + star-history | — |
| **second-body** | **3, all with empty `()` hrefs** | 0 | **none** |

**Ten of fourteen have zero badges**; wittgenstein alone holds 9 of the org's
15. Live URLs are written as a prose line, not as a shield. Images, when
present, are a single meaningful artefact (an exploded view, a route map), never
a screenshot gallery — except `centrifuge-sort`, which *is* a photo essay
(`centrifuge-sort:8-31`).

## 7 · Language

- **English only:** matter, aleph, murmur, jiko, via, wittgenstein, carburetor,
  site, repo-template, flatus, aleph-benchmark, centrifuge-sort — twelve of
  fourteen.
- **Bilingual via two files with a switcher:** `agent_lifeRestart:1` —
  `[English](README.md) | [中文](README-zh_CN.md)` (quoted verbatim; those two paths are agent_lifeRestart's, not ours).
- **Chinese only: `second-body`.** 523 CJK characters, every heading included.
  It is the only repo in the organisation whose front door is not readable by
  someone who lands on it from GitHub search.

Non-English text does appear inside English READMEs, but only as **quotation**:
`> _Die Grenzen meiner Sprache bedeuten die Grenzen meiner Welt._ — Tractatus
5.6` (`wittgenstein:17`).

## 8 · Tone

**Person.** Third person about the object by default (`via keeps the prompt
light`, `via:21`). Second person for instructions and for describing the
audience's experience: `it does not tell you what to do. the final choice stays
with you.` (`jiko:9`); `both ask you to wait with them.` (`carburetor:19`).
First person plural is reserved for stance sections, never the opening.

**Restraint is an explicit, repeated device — every mature repo carries a
disclaimer.** This is the single strongest signature of the house style:

- `Still gated: live material transforms, their deployed controls, and the
  strict large-tree performance receipt.` (`matter:34-36`)
- `The release is intentionally honest about evidence:` (`aleph:135`), then
  `they are low-fit exploratory runs, not polished success demos` (`aleph:138`)
- `Numbers are cheap; files are not.` (`wittgenstein:139`)
- `Adding a row requires a script + a CI gate, not a number in a slide.`
  (`wittgenstein:127`)
- `A structurally valid map does not make its recommendation automatically
  correct.` (`via:172`)
- `They document the benchmark package and scoring flow, but they are not real
  cross-model leaderboard results.` (`aleph-benchmark:14`)

We already had one of these and it was the best line in the file —
`**跑通了什么以 docs/10-SURFACES.md 为准**，不以本文件为准。` (`second-body:49`).
The rewrite keeps it, in English, and adds what is still only `experimental`.

**Hedges attach to a named mechanism**, never to vague softening:
`It remains a nudge, not a required reasoning procedure.` (`via:27`).

**Aphorism is allowed — exactly two lines of it, and only in the art and
hardware projects:** `In an age of too many answers, restraint is radical.`
(`jiko:15`); `mk i is loud. mk ii is silent. both wait.` (`carburetor:19`);
`**Craft over scale.**` (`site:25`). The rule seems to be: earn it with
mechanism first, spend it once, stop.

**Self-deprecation is in the register too:** aleph's long-term-plan checkbox
`- [ ] Get accused, at least once, of reinventing Kolmogorov complexity for
prompts; answer with receipts, caveats, and a cleaner run contract.`
(`aleph:232`).

## 9 · Conventions around the README

**AGENTS.md, never CLAUDE.md.** Present in 9 of 16 repos — matter (98 lines),
aleph (58), murmur (181), jiko (15), wittgenstein (170), second-body (66),
repo-template (78), carburetor (346), agent_lifeRestart (23). **No repo has a
root `CLAUDE.md`.**

**The `Forecloses:` change-log format is matter's, and it is verbatim ours.**
`matter docs/changes.md:11-16`:

```
## YYYY-MM-DD — one line
Changed:    what is now true
Why:        the reason, not the restatement
Forecloses: what this makes harder or impossible
```

under `Append-only. Newest first. A few lines per entry.` (`:3`). Note the
**path**: matter uses `docs/changes.md`; root `CHANGELOG.md` is what the
software repos use (aleph, murmur, via, wittgenstein, carburetor,
repo-template, flatus). Nobody uses a root `CHANGES.md`. Ours is
`docs/CHANGES.md` — close to matter, differing only in case.

**The surfaces table lives in a dedicated doc, and the README links to it.**

| repo | path | statuses |
|---|---|---|
| matter | `matter docs/surfaces.md`, `\| Surface \| Status \| Evidence \|` | `implemented / measured / specified / unsupported`; opens `This is the honest inventory.` |
| second-body | `docs/10-SURFACES.md` | `stable / experimental / stub / spec-only / archived` |
| aleph | `aleph docs/surfaces.md` | listed as read-route item 7 in its AGENTS.md |
| repo-template | ships a `surfaces.md` under its own `docs/` as a default file | + `## Decision-bearing surfaces` (`repo-template AGENTS.md:45`) |

matter's README points at it in one line — a link reading "See docs/surfaces.md for
the exact boundary" (`matter:38`). **Ours does the same** (`second-body:49`)
— this is a place we already match.

**The 5-field stop block.** matter states it as prose rather than a template:
`run the narrowest relevant check and report status, scope, exact validation,
risks, and one next step.` (`matter AGENTS.md:87-88`). Our `AGENTS.md` template
(`Status / Scope / Validation / Risks / Next`) is the same five fields, written
as a fill-in block. Keeping the block is right; it is the stricter form of an
existing org convention.

## 10 · What goes in the README vs. elsewhere

**Install commands: always in the README, but three to six lines.**
matter is `npm install` / `npm run dev` and nothing else (`matter:43-46`).
jiko's `## quickstart` is six lines (`jiko:62-79`). carburetor's is six
(`carburetor:71-78`). The maximal cluster (murmur's 200-line getting-started)
is the outlier, not the model.

**API reference: only aleph documents an endpoint in-README** (`## Hosted API`,
`POST /api/search`, `aleph:179-210`). Everyone else points outward: wittgenstein
→ its own docs/codec-protocol.md; via → `skills/via-route/references/route-spec.md`
(`via:165`); murmur → its own docs/architecture.md (`murmur:16-23`).

**Licensing is a closing prose paragraph, not a section with a shield.**
matter closes with `Proprietary and confidential. Copyright 2026 Wooden Computer
Co., Ltd. All rights reserved. No license is granted; see LICENSE and NOTICE.` (`matter:90-93`, links elided).

## 11 · ptoq.io/work

Twelve entries, one line each, format `name - lowercase description`. No year,
no status, no images, no paragraphs. The page closes with `Q.E.D.`

Verbatim:

- `[flatus](https://flatus.ptoq.io) - a small thing that lives in your menubar and occasionally farts`
- `[centrifuge-sort](<gist url>) - physical sorting algorithm that shouldn't exist`
- `[[carburetor]](https://github.com/p-to-q/carburetor) - a phone you refuel`
- `[matter](https://matter.ptoq.io) - make thought matter (as a BCI). [[PDF]]`
- `[murmur](https://murmur.ptoq.io/) - get the melody out of your head. [[PDF]]`

Lowercase, no terminal period, bare noun phrase, zero adjectives of praise. Note
that the site line and the README tagline are **allowed to differ**: matter's
site line is `make thought matter (as a BCI)` while its README tagline is
`An interface for unfinished thought.` (`matter:3`). The site line is the
shorter, blunter one.

---

## 12 · Where our README was furthest from the house style

Ranked, worst first. Item 1 is the answer to "the one thing least like them".

**1. It is the only Chinese README in the organisation, and the opening does not
say what the work is.** Twelve of fourteen repos are English-only (§7). Worse
than the language: the first 60 lines of the old file were a *disambiguation
note* about why the artwork title and the repo codename differ
(`second-body:3-5`), three broken badges (`:7-9`), and then a description that
opens `实时交互艺术装置` — "real-time interactive art installation" — a category
label, not the piece. Nowhere in it does a reader learn that **they pick a
species and a life-size body stands up on their own skeleton**. matter's second
line already tells you what matter does (`matter:5`). Ours did not.

**2. Three badges, all with empty hrefs** (`second-body:7-9`) — `[![check](...)]()`.
Ten of fourteen p-to-q repos have zero badges, and matter's AGENTS.md names
badges specifically as the open-source framing to avoid
(`matter AGENTS.md:20-21`). The numbers in them (`parts-191`) had also already
drifted: `assets/parts/parts.json` now holds 198.

**3. Half the file was an operating manual.** `## 资产工厂` listed six factory
commands with credit costs; `## 结构` drew a package tree. No p-to-q README
carries a per-subcommand cost table. matter's entire `## Run` is two commands.
That content belongs in `docs/`, which is what §10 shows every other repo doing.

**4. No live link, no `/about`, no poster.** aleph, murmur, jiko and flatus all
put the live URL in the first fifteen lines. We had one deployed at
`second-body.ptoq.io` (`scripts/set-domain.sh`) and did not link it, and four
finished A1 posters in `assets/brand/` that appeared nowhere.

**5. No negative-space section.** Four repos have one (§5). For an installation
that deliberately does *not* do skinning and deliberately keeps 3D generation
out of the fast loop, this is the section with the most to say — and it is the
section that stops a reader from filing the wrong issue.

### What we were already doing right

- Deferring status to the surfaces table rather than the README
  (`second-body:49`), which is matter's exact move (`matter:38`).
- `## 这个仓库值得看的三件事` — "the three things in this repo worth looking at" —
  is the same reframing of a feature list that `## What We Tried To Make
  Deliberately` (`murmur:229`) performs.
- `AGENTS.md` rather than `CLAUDE.md`; the `Forecloses:` change log; a surfaces
  table with an evidence column. All three are org conventions we already match.
