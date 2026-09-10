# The facet decision — how one install holds more than one life

Adam, 2026-09-10: "Let handle the facet decision first.  It likely most
materialy impacts the way we collect, store and use the values collected
in the interview."

The red team's one structural finding (`docs/ELITE-FILE-SPIKE.md` §4.1):
the many-hatted person — the nurse with the Etsy shop — gets one blended
file, and the white paper's own distractor evidence (§4) means the other
life's context actively degrades answers about this one. This document
works the decision against the shipped code, names the real costs of each
option, and recommends. The ruling is Adam's; it is recorded at the end.

---

## 1 · The fact that shapes everything

`Answers.values` is `Record<questionId, AnswerValue>` — **one value per
question id**. "What's your role?" holds exactly one answer. A second
life is not a *tag* on that answer; it is a *second answer to the same
question*, which means the map itself must fork. Every option below is a
different answer to "where does the fork live?"

The freshness stamps (`answeredAt`, `reflectedAt`, `assistedAt`) key off
the same ids — compound `${blockId}#${recordIndex}#${fieldKey}` inside
repeatables — and `recordIds` is index-aligned with `repeatables`. Any
fork that reaches inside this structure drags all four maps with it.

## 2 · The precedent that already decided this shape once

`core/files/answersKey.ts`, Adam's decision of 2026-08-24, when the
Skills interview needed its own answers:

> **wb:answers gets one key per flow, not namespacing inside it.** Every
> consumer in the product already takes a whole `Answers` —
> `findPosition`, `sectionHealthMap`, `generateContextFileParts`,
> `parseContextFile`, `recommend`, `FileDrawer`, `FileView`, `Home` — so
> giving each file its own `Answers` under its own key means not one of
> them changes. Namespacing inside `wb:answers` would have touched every
> key lookup in the product, which is the reason it was deferred twice.

The facet decision is the same fork at the next scale up: a *life* is to
the install what a *flow* was to the answers. The consumer list has only
grown since (the Grounds, the proof bundle, the baseline report, the
resume place, the derived Actions) — every one of them takes a whole
`Answers` and would keep doing so under per-key separation.

## 3 · The options, priced against the code

### A · Facet tags inside one Answers (namespacing inside)

Tag values and records with a domain; exports filter by tag.

- **Storage:** `values` cannot hold two answers to one question, so the
  map forks per facet anyway — but *inside* the structure, taking the
  three stamp maps and `recordIds` alignment with it. `SCHEMA_VERSION`
  moves; a migration rewrites every install.
- **Collect:** every question needs to know which facet is being
  answered; `findPosition` and the cursor become facet-aware.
- **Use:** every consumer named in the precedent grows a facet
  parameter. The roundtrip contract (generate → parse → restore, byte
  stable) needs facet representation in the FILE format — new headings
  or annotations, new parse rules, restore ambiguity.
- **Verdict:** this is the namespacing-inside shape the 2026-08-24
  ruling rejected, at larger scale, plus a file-format change. Maximum
  blast radius, and the "one blended file with filters" it produces is
  not even what the person hands their assistant — they hand one life.

### B · Multi-profile — one Answers per life, per-key (the seam extends)

Each life ("profile") owns a full `Answers` set under its own keys. A
small registry (`wb:profiles`: id, name, createdAt) and an active
pointer. `answersKeyFor(file)` becomes `answersKeyFor(file, profile)` —
the table's own doc says it is THE whole seam, and it is.

- **Storage:** the first profile rides the LEGACY keys (`wb:answers`,
  `wb:answers:skills`, `wb:answers:actions`) exactly as they are — the
  same no-migration trick the seam used last time. Additional profiles
  get suffixed keys. **No install migrates; `SCHEMA_VERSION` does not
  move.** An install that never adds a second profile stores byte-for-
  byte what it stores today.
- **Collect:** the interview is untouched — it runs against the active
  profile's `Answers`, one life at a time, which is also the honest
  answer to question design: no question needs to ask "which life?"
  because the person already chose by being in that profile.
- **Use:** every consumer keeps taking a whole `Answers`. Generate,
  parse, restore, freshness, recommend, the Grounds, the proof bundle,
  the baseline — unchanged per profile. **The scoped export the red team
  asked for falls out for free: the profile IS the scope.** Each life
  generates its own Context.md/Skills.md/Actions.md, and the person
  hands each assistant exactly one life — which is what the distractor
  evidence says to do anyway.
- **Real costs, named:** a profile switcher surface (Home or the chrome
  bar) + a "start another file" door; per-profile satellites decided
  (baseline runs and resume place go per-profile; pack subscriptions and
  splash-seen stay install-wide); dev reset clears all; e2e walk-ins
  pin the default profile. Copy work for the switcher. That is the whole
  bill — UI and satellites, zero core-logic surgery.
- **Duplication, accepted:** shared truths (your name, how you write)
  are answered per profile in V1. The fast-follow that softens it —
  "start from a copy of <profile>" at creation — is one answers-clone,
  cheap, and explicitly NOT in this decision's scope.

### C · One-life V1, compromise named

Ship as-is; state publicly (site, civic materials) that a file holds one
working life and a second life wants a second browser profile (Chrome
profiles already give a free, crude version of B — separate storage per
Chrome profile).

- **Cost now:** zero. **Cost later:** the civic median (job seekers with
  a side hustle, caregivers who work) hits the blend immediately, and
  the red team's point was that this population is the program's core,
  not its edge. The Chrome-profile workaround is real but nobody
  discovers it unaided.

## 4 · Recommendation

**B — multi-profile, as the existing seam's extension.** Three
independent lines converge on it:

1. **The precedent:** per-key separation is how this codebase already
   solved the identical shape, and the reasons compounded rather than
   aged — the consumer list is longer now.
2. **The physics:** `values`' one-value-per-question means A forks the
   map anyway, just in the most expensive place. B is the same fork in
   the cheapest place — the seam built to hold it.
3. **The product truth:** the person never wants the blended artifact.
   They hand an assistant one life. B makes storage match use, and the
   scoped export stops being a feature to build and becomes a fact.

C remains the honest fallback if V1 scope must shrink — but B's core
cost is a switcher UI, not surgery, and the civic timeline wants B.

## 5 · What B does NOT decide (kept out of scope)

- Cross-profile sharing/copying of answers (fast-follow candidate).
- A skill belonging to two lives (today: it's in the profile it was
  written in; packs/library remain install-wide and can carry a skill
  across).
- User-facing naming of the concept (Adam's call, recorded below).
- i18n, teams, and everything else the spike deferred.

## 6 · The ruling

**RESOLVED 2026-09-10 — Adam: Option B, multi-profile. The user-facing
name is "Brains"** — each profile literally is a workbrain: your Work
brain, your Shop brain. The build contract that follows: the first
brain rides the legacy keys unmigrated (`SCHEMA_VERSION` does not
move); `answersKeyFor` grows the brain parameter as the one seam; the
switcher surface and per-brain satellites (baseline runs, resume
place) land with the interview-builder work; pack subscriptions and
splash-seen stay install-wide; "start from a copy of <brain>" is a
fast-follow, not this scope.
