# Beta remainder — what is left after BS-00…BS-11

Every task id in `docs/BETA-SPRINT.md` has landed. This file holds the three
pieces of real work that were never in that sprint, scoped so none of them has
to be re-discovered. Same house rules: vertical slices, every slice behind a
full `npm run check`, one commit per slice.

| Id | Item | Blocked on | Shape |
|---|---|---|---|
| **BR-01** | The `[DRAFT]` copy pass | Adam's read | Editing, not building |
| ~~**BR-02**~~ | ~~DEF-1 — AI Assist is broken in the Skills interview~~ | — | **DONE.** One seam, three call sites |
| **BR-03** | R1-13 — store submission package | non-code assets | Mostly not code |

---

## BR-01 · The `[DRAFT]` copy pass

Every string written since V1.1 carries a `[DRAFT]` marker, by standing
agreement, so nothing reaches a tester as our voice until it has been read as
yours. The markers are the worklist and they have never been cleared.

### The census

**91 markers across 16 files.** Five of those are in test files — they pin
draft copy rather than being copy — so **86 markers are real**, and because a
marker sits on a comment block that can cover several entries, they cover more
strings than that.

| Where | Markers | What kind of copy |
|---|---|---|
| `src/panel/strings.ts` | 55 | Every user-facing panel string. 53 marked comment blocks covering **≈142 of the file's 370 entries** — the largest single read |
| `src/core/flow/overrides.ts` | 6 | Questions we authored rather than ported (`audience_needs`, the goal gate) |
| `src/core/flow/assistCopy.ts` | 6 | The AI Assist bar's instructions |
| `src/core/flow/reflectFrames.ts` | 4 | The reflect step's framing lines |
| `src/core/flow/assistThresholds.ts` | 4 | When the assist offers itself, and in what words |
| `proofAdditions.ts`, `nameGenerator.ts`, `interviewMe.ts`, `assistServices.ts` | 2 each | Proof services, generated names, the interview-me prompt, service labels |
| `deepDive.ts`, `pairedPick.ts`, `Flow.tsx` | 1 each | One deep-dive answer, the paired-pick frame, one inline note |

### What the pass is, and what it is not

**It is a read, not a rewrite.** The copy rules in `CLAUDE.md` and
`docs/design-system.html` §08 were applied when each string was written; three
automated checks already enforce the mechanical half — `npm run audit`'s
reading-level pass, `deepDive.test.ts`'s grade-7 and 20-word assertions, and
the audit's "no string inlined in a component" rule. What no check can see is
whether a sentence sounds like you. That is the whole job.

**It is not a refactor.** No string moves file, no key is renamed. A reworded
string that a test asserts on fails as a copy change, which is the design —
see `flow-progress.spec.ts`'s note on reading approved copy from `strings.ts`
rather than retyping it.

### The slices

Run it as reads, not as one pass, because the surfaces have different voices
and mixing them is how a register slips:

1. **The interview's own words** — `overrides.ts`, `deepDive.ts`,
   `pairedPick.ts`, `reflectFrames.ts`. This is the product's voice at its most
   exposed. 12 markers.
2. **The AI-facing prompts** — `assistCopy.ts`, `assistThresholds.ts`,
   `interviewMe.ts`, `assistServices.ts`, `proofAdditions.ts`. Different
   audience: these are read by a model, not a person, and "sounds like Adam" is
   the wrong test for them. 16 markers.
3. **The panel** — `strings.ts`, in the order the file already groups things:
   Home, the flow chrome, the drawer, the proof, the sheets. 55 markers,
   ≈142 entries. Split across sittings; the file's own section comments are the
   natural seams.

### The review page

**https://claude.ai/code/artifact/f7eb11de-ee12-4689-9b97-35900bed1e04**

All 204 strings, extracted from the source and grouped by slice, rendered in
the panel's own type stack so a line reads the way it will ship. Each row has
the string, its key, and its "why" behind a disclosure. OK / Flag per row,
saved in the device's own storage, and a button that copies the flagged list as
text to hand back.

The census in this file counts MARKERS (86 real ones). The page counts STRINGS,
because a marker sits on a comment block that can cover several — 204 is the
number of lines somebody actually has to read.

### How a slice lands

Adam edits in place, or marks a line and I redraft it. Either way the marker
comes off when the line is approved — **`[DRAFT]` present means unread**, and
that has to stay true or the marker stops being a worklist. Then
`npm run check`, one commit per slice.

### Acceptance

- No `[DRAFT]` remains in `src/` outside test files.
- `npm run audit` clean (reading level, string location).
- No key renamed, no string moved file.

---

## BR-02 · DEF-1 — AI Assist is broken in the Skills interview — **DONE**

*Shipped as specced. The one thing the spec did not anticipate: the Skills row
unlocks only for a finished Context (`core/files/slots.ts`), so the e2e needed a
full `finishedContext()` fold — three specs had each grown their own copy, and
this is now `tests/e2e/fixtures/answers.ts`. The three existing copies were left
alone: rewriting passing specs to make a point about duplication is how a defect
fix turns into a refactor.*

### The defect, exactly

`Flow` loads **one** answers store: `getLocal(answersKey)` at
`src/panel/surfaces/Flow.tsx:703`. Skills mounts it with
`answersKey={ANSWERS_KEY.skills}` (`App.tsx:346`, `:447`, `:464`), so inside
the Skills interview `ctx.answers` is the *skills* store.

Two builders reach across files and neither knows it:

| Call site | Reads | Consequence in Skills |
|---|---|---|
| `interviewMe.ts:58` | `ctx.answers['goal_want']` | The prompt loses its "the thing I most want you to do better" line — the AI interviews without knowing what it is for |
| `assistServices.ts:44`, via `goalServiceLabelFor` | `ctx.answers['goal_service']` | Every assist says **"your AI"** instead of naming the service, and the service door never appears |

Both keys live in the Context store, where the goal gate wrote them. In Skills
they are simply absent, so both fall to their "no answer" branch — silently,
which is why this shipped. It is a degradation that looks like a design.

`interviewMePrompt` renders on **eleven** in-record text questions, so this is
not a corner.

### The fix

**One new optional field on `FlowContext`, and the three reads move onto it.**

```ts
// src/schema/flow.types.ts
export interface FlowContext {
  answers: Record<string, AnswerValue>;
  repeatables: Record<string, Record<string, AnswerValue>[]>;
  record?: Record<string, AnswerValue>;
  /** The CONTEXT store's values, for the few builders that are cross-file.
   *  Absent when the flow IS Context — `answers` is already that store. */
  contextAnswers?: Record<string, AnswerValue>;
}
```

- `Flow` gains a second `getLocal(ANSWERS_KEY.context)` beside the existing
  effect, **only when `answersKey !== ANSWERS_KEY.context`**, and puts the
  result on the context it already builds at `Flow.tsx:1593-1595`.
- `interviewMePrompt` and `assistServices` read
  `ctx.contextAnswers ?? ctx.answers` — one expression, and Context's own flow
  is byte-identical because the fallback is what it reads today.

**Why not merge the two stores into `ctx.answers`.** Every `keyOf` lookup in
the runner would start seeing foreign answers, and a skills question that
happened to share a key with a context one would resolve to the wrong store.
A named second channel cannot collide.

### Degradation

The Context store may be empty (somebody who opened Skills first). Both call
sites already have a no-answer branch and it stays: no goal line, "your AI",
no service door — which is correct, because there genuinely is no answer. What
changes is that it stops happening to people who *did* answer.

### Files

`src/schema/flow.types.ts`, `src/panel/surfaces/Flow.tsx`,
`src/core/flow/interviewMe.ts`, `src/core/flow/assistServices.ts`, plus
`interviewMe.test.ts` and `assistServices.test.ts`.

### Acceptance

- A unit test per builder proving the cross-file read: a `ctx` whose `answers`
  has no `goal_want`/`goal_service` but whose `contextAnswers` does produces
  the goal line and the named service.
- A unit test proving the Context flow is unchanged — same output with
  `contextAnswers` absent.
- An e2e in the Skills interview: with the goal gate answered in Context, the
  assist names the service and shows its door.
- `src/core/**` stays pure — the second read is in `Flow`, not in core.

### What this unblocks

VB-141 (record-aware prompts) in Skills, which the sprint noted was capped
until this read existed.

---

## BR-03 · R1-13 — store submission package

The last item from Release 1, and the only one still open. **Most of it is not
code**, which is why it has never fitted into a build sprint.

### Already done

- `manifest.config.ts` requests **only** `storage` and `sidePanel`, pinned by
  `manifest.spec.ts`.
- Icons ship at 16 / 32 / 48 / 128 (`public/icons/`).
- `npm run zip` builds `dist.zip` from a production build.
- `docs/STORE.md` holds the single-purpose statement, the permission
  justifications, the data disclosure, and a **draft** privacy policy.

### Not done — and none of it is code

`docs/STORE.md`'s listing checklist is eight items, all unticked:

| Item | Who | Note |
|---|---|---|
| Title, 45 chars | Adam | |
| Short description, 132 chars | Adam | Leads with the person's problem, not the mechanism |
| Detailed description | Adam | What it does, then the privacy position, then who it is for |
| 1280×800 screenshots ×4 | **Blocked on BR-01** | Home, a question, the proof moment, the file — every one of them full of `[DRAFT]` copy today |
| Small promo tile 440×280 | Design | |
| Category: Productivity | Adam | |
| Support URL | Adam | Needs somewhere to point |
| Privacy policy **published at a URL** | Adam | The draft exists; it needs a host |

### The ordering that matters

**Screenshots come after BR-01.** Four 1280×800 images of a panel whose copy is
still marked unread is a listing that has to be reshot. This is the one hard
dependency between the three items.

### The code half, such as it is

One slice, and it is verification rather than building:

- `npm run zip` from a clean tree; unpack `dist.zip` and confirm the manifest
  in the artefact requests two permissions and nothing else.
- Confirm the production bundle carries no dev-only surface — `narrator.spec`
  already greps the built chunks for `wbVoices`, and `devReset` is
  dead-code-eliminated under `npm run build`. **Build from a clean tree, not
  from a `dist/` that probes have been landing in** (`docs/BETA-SPRINT.md`: a
  contaminated `dist/` looks exactly like a broken guardrail).
- Check the store listing's data disclosure against what the product actually
  does, now that BS-02's feedback door exists — it opens a mail client and puts
  a diagnostic block on the clipboard. `GUARDRAILS.md` has the row; the listing
  does not mention it yet, and **Chrome's User Data FAQ Q3 requires local-only
  handling to be disclosed too.**

### Acceptance (R1-13's own, unchanged)

`dist.zip` builds; the manifest requests only `storage` and `sidePanel`; a
reviewer reading the listing can tell exactly what data is collected (none).

---

## Suggested order

1. **BR-02** first. It is the only one that is purely mine, it is small, and it
   is a live defect a beta tester will hit.
2. **BR-01** next, in its three reads. It is the long pole and everything
   visible waits on it.
3. **BR-03** last, because the screenshots do.
