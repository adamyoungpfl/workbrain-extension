# Backlog — the quality standard, and intake of an existing file

**Status: backlog. Not scheduled.** Three related pieces, deliberately sequenced: define what
"great" means first, because the other two need something to normalize *toward* and score *against*.

Written 2026-08-20.

---

## Why this order

Intake without a standard just moves an unknown-quality file into a new format. The standard is the
load-bearing piece — it defines the target that normalization aims at, gives an imported file
something to be measured by, and is the only part that produces value on its own (someone can score
a file they already have without adopting anything).

---

## What already exists

Worth inventorying before building, because several pieces are further along than they look.

**A grading rubric already ships.** `evaluationPrompt()` in `src/core/flow/proofSource.ts` is a
five-point rubric run by the person's own AI, and two of its points are already about sendability:
*"Which answer would need the least editing before I could send it as-is"* and *"A score out of 10
for each, on how ready-to-send it is."* But it scores **the output**, not the file — it measures the
file indirectly, through its effect on an answer. What's proposed here scores **the artifact
directly**. Both are legitimate; the indirect one is more honest, the direct one is instant and
needs no round trip. They should share vocabulary, not compete.

**Score storage exists and is a time series.** `ReportState.scores: ScoreEntry[]` where
`ScoreEntry = { at, value }` (`src/schema/storage.types.ts`). "So they can baseline" is already the
shape this holds — a score now, a score later, the difference between them. `core/report/scoring.ts`
has `makeScoreEntry`/`appendScore`/`scoreDelta`.

**Import exists, but only for our own files.** `parseContextFile` hard-fails unless the System
Grounding Rule paragraph is present and byte-identical (`src/core/files/parse.ts:259`). A file
Workbrain didn't write is rejected today, by design. That is exactly the gap this item closes.

**Editing largely exists.** Every question can be re-answered; Home deep-links into a specific one
(R1-12); the file tree makes sections directly navigable (VB-07). What's missing isn't editing — it's
a *review pass* over everything an import brought in, rather than walking 49 questions to find it.

---

## Part A · The standard ("what great is")

Mostly authoring, not code. Deliverable: a written standard plus a scoring instrument that runs as
a prompt in the person's own AI.

### The framing that makes it scoreable

A context file has exactly one job: **change what AI produces.** Everything else is decoration. So
the standard scores whether it can — not whether it's thorough, tidy, or well written.

### Five dimensions — diagnostic, deliberately not summed

1. **Coverage** — are the load-bearing areas present at all? The ten sections of
   `CONTEXT_FILE_OUTLINE` are the reference shape, and they're already written down.
2. **Specificity** — named, concrete, checkable. The single biggest driver of whether output
   changes. *"I manage a team"* changes nothing; *"I manage the six-person reporting team; Priya
   approves anything over budget"* changes everything.
3. **Actionability** — does it state preferences and rules AI can follow, or only facts it can
   recite? A file of pure description doesn't alter behaviour. This is what Modules 6, 7 and 10
   exist to capture.
4. **Currency** — is it still true? A confidently stale file is worse than a thin current one,
   because it produces confident wrong output.
5. **Voice** — is there enough real sample to imitate, not just described preferences? This is why
   Module 11 asks for a pasted paragraph.

### One guardrail this design must respect

`docs/GUARDRAILS.md` bans *"a composite score out of 100. Real metrics only."* So:

- The five dimensions are **diagnostic** — they say what to fix. They are never weighted and summed
  into an overall number.
- **Sendability may be a single score** (out of 10, matching the proof loop's existing scale)
  because it's one genuine judgment — *how much editing before this is usable* — not a blend of
  five sub-scores wearing a trenchcoat.

That distinction is the whole difference between a real metric and a vanity one, and it's worth
holding even though a single rolled-up number would demo better.

### Who does the scoring

Split it honestly along what each side can actually know:

| | Who | Why |
|---|---|---|
| **Structural completeness** — which sections exist, which are empty, how many named entities/initiatives | The panel, locally | Pure derivation over answers. No content judgment. Instant, offline, free. |
| **Quality** — specificity, actionability, currency, voice, sendability | The person's own AI | A judgment about content, which the panel deliberately does not make. `strings.ts` already promises *"The panel never reads or scores it."* |

The second half is the same copy/paste hand-off the proof loop already uses. No new architecture.

### Generalizing to "any standard prompt"

Doable, with a caveat worth stating: a rubric that scores everything scores nothing well. Coverage
and Currency are context-file-specific; Specificity, Actionability and Sendability generalize
cleanly to any prompt. Suggest a shared three-dimension core with a context-file extension, rather
than one instrument stretched over both.

---

## Part B · Intake and normalization of an existing file

### The insight that makes this cheap

Deterministically parsing an arbitrary third-party context file into 49 question ids is genuinely
hard and would be brittle. But it doesn't need to be done deterministically — **normalization is a
prompt, not a parser.**

Workbrain emits: *here is my existing file, here is the target structure, rewrite it into that
structure without inventing anything.* The person's AI does the mapping. The output is a valid
Workbrain `Context.md` — **which the existing R1-10 import already ingests, unchanged.**

This is the same architectural through-line as `docs/PROPOSAL-estate-connector.md`: anything that
can produce a valid Context.md gets ingestion for free. The file format is turning out to be the
product's real integration surface.

### What still needs building

- **The normalization prompt itself**, including the exact target structure and a hard instruction
  against inventing content not present in the source. Fabrication is the main failure mode here.
- **A "what came from where" review pass.** An imported file is a large set of answers the person
  never typed. They must be able to see and correct them without walking all 49 questions. This is
  the real UI work in Part B, and it overlaps with the review pass the estate-connector proposal
  needs — build once, if both happen.
- **Provenance.** Should an imported-and-normalized answer be visibly marked as such until
  confirmed? That's a genuine schema question (`Answers` has no notion of provenance today) and the
  same question the estate proposal raises. Answer it once, for both.
- **A gentler `parse.ts` failure mode.** Today an unrecognized file is a flat rejection. With intake,
  "this isn't one of ours — want help converting it?" becomes the more useful response.

---

## Part C · Editing what came in

Mostly already built (see the inventory above). The genuine gap is the review pass named in Part B,
not editing itself. Worth confirming that before scoping any new surface — the cheapest version of
Part C may be zero new UI beyond what the file tree already gives.

---

## Where it lives — app or site

Both are viable and they serve different purposes:

- **In the panel** — natural home for the structural half, since it already has the answers. Also
  where the score belongs over time (`wb:report.scores` is already a time series).
- **On the site** — a standalone "score your context file" tool needs no install, works for people
  who have a file from somewhere else entirely, and is a natural qualification instrument for the
  human services the spec says this product exists to feed. It also sidesteps the extension's
  permission and store-review surface completely.

Suggest the standard is written once, as data, and rendered in both places rather than authored
twice. If the site version ships first it doubles as a cheap test of whether the rubric is any good
before a single line of panel code is written.

---

## Open questions

1. **Does sendability get one number, or is even that too rolled-up?** The proof loop already
   established "out of 10, ready-to-send" as a real judgment. Reusing it keeps one scale across the
   product; inventing a second scale would be worse than either.
2. **Is a scored baseline motivating or discouraging?** Someone who scores 3/10 on a file they were
   proud of may leave rather than improve. The proof loop avoids this by measuring *improvement*,
   not absolute quality. Worth deciding whether this instrument does the same.
3. **Provenance in `Answers`** — schema change, or transient import-review state? Shared with
   `docs/PROPOSAL-estate-connector.md`; decide once.
4. **What happens to content that doesn't map?** A third-party file may contain genuinely useful
   things Workbrain's 49 questions never ask about. Dropping it silently is the wrong answer; so is
   inventing a junk-drawer section. Unresolved.
