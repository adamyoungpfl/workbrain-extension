# Spike — the Skills and Actions interviews

Run 2026-08-24. **Scoping only. Nothing built. Skills is buildable after two decisions; Actions is
blocked on a business question, not a design one.**

---

## What these files actually are
`strings.ts`'s "How you work" / "What should happen automatically" is shorthand. The spec's OS-model
table is the real definition, and it hides three consequences:

- **Skills is authoring, not describing.** Its unit is one runnable recipe per recurring deliverable
  — trigger, inputs, steps in order, output shape. Each is a pack-publishable unit, and §07 splits
  ownership, so **every skill needs a personal/team marking**.
- **Actions is a feasibility interview, not an automation builder.** The spec designs it to *end
  honestly*: finishing at "not sure where the data lives" is a valid outcome that routes to TIM.
  Actions.md is expected to record **what cannot be done**.
- §07 assigns anything in Actions.md to the **employer** side of the take-it-with-you split, so
  Actions answers must be detachable as a block.

## Source content — it exists, and `docs/CONTENT-SOURCES.md` is stale
No `skillsInterviewFlow.ts` or `actionsInterviewFlow.ts` exists (verified by filename search,
repo-wide grep including `.next`, and `git log --diff-filter=D` — nothing was deleted). **But two
shipped production wizards do:**

| Asset | Path | Gives us |
|---|---|---|
| Skills wizard, 1,803 lines | `../modelcitizen/src/components/WorkBrainSkillsBuilder.tsx` | 6 step titles + ledes, per-field micro-copy, four seed lists usable as `ideas[]`/`options[]`, an assist prompt usable as `interpret.buildPrompt` |
| Actions wizard, 1,238 lines | `../modelcitizen/src/components/WorkBrainActionsBuilder.tsx` | 4 step titles + ledes, micro-copy, source seeds, the generator and its **fixed safety footer** |
| Data models | `../modelcitizen/src/components/workbrain/shared.tsx` | `SkillDraft = {name, trigger, inputs[], tools[], steps[], output}` |
| **54 authored skills** | `../modelcitizen/src/lib/skillLibrary.ts` | A complete validated answer-space for every Skills field — the richest single asset |

**So: Skills is a form-factor conversion (~6 wizard steps → ~18 questions). Actions is a thinner
port plus real authoring. Neither is writing from nothing; neither is R1-05's verbatim port
either** — there is no module structure, no `rephrasings`, no `beats`, no repeatable wrapper to copy.

Add the missing rows to `docs/CONTENT-SOURCES.md`.

## Proposed shape (proposal, not spec)
**Skills — 6 modules, ~18 questions.** What repeats → *(repeatable: one per skill)* trigger/inputs/
tools → write it as steps (`interpret: ai-assist` + reflect) → what comes back → yours or the
team's → review.

**Actions — 4 modules, ~11 questions.** Which skill (seeded from Skills) → where it reads → *(repeatable:
one per action)* what it may do + approval tier → the honest ending.

**No new question `kind` is required for either.** That is the good news and it should be defended
— `QuestionKind` is consumed by `Flow.tsx`, `generate.ts`, `parse.ts`, `nodeDetails.ts`,
`nodeSummary.ts` and `ideas.ts`.

## What comes free, and what does not
**Free** (everything keys off `Module[]` + an `Answers`): the runner, `findPosition`, reflect,
deep-dive and module-transition machinery, the ideas button, `FileTree`, `sectionHealth`, `Beats`,
cues, `addAnother`, the work brain. V1.8's `ANSWERS_KEY` table is the entire storage seam.

**Per-flow work:** `skillsSource.ts` + `skillsAdapter.ts`; entries in the global `deepDive` /
`addAnother` / `moduleIntros` maps; `slots.ts`'s `BUILT` array; and `recommend/engine.ts`, whose
shape is general but whose **every rule is Context-specific**.

**The file:** `generate.ts`/`parse.ts` already take `modules`/`outline` as parameters, so the walk
generalises today. What does not: both import `FILE_TITLE`, `fileIntroLine`,
`GROUNDING_RULE_HEADING` and `SYSTEM_GROUNDING_RULE` as module constants, and `parse.ts:258`
hardcodes `'System Grounding Rule'` as its validity check. **Lift those four into a per-file
`FileCopy` record and thread it through** — small and mechanical.

Actions' framing paragraph already exists verbatim in the sibling repo and should be ported
byte-for-byte. **Skills has no equivalent and needs one written** — its job is different: it tells
the AI to follow a recipe exactly rather than improvise.

---

## DECISIONS NEEDED

### 1. Actions' depth is a business boundary — BLOCKING
`WorkBrainActionsBuilder.tsx`'s own header says its shallowness is deliberate: it covers *"the part
that's genuinely the same for everyone (the approval-gate PATTERN)… rather than anything about
which real system to connect or how to calibrate risk for a specific business — that's the paid
1:1/Team work."*

**A rich Actions interview may cannibalise TIM.** Combined with `docs/OPEN.md` #5 (still unresolved:
what a useful ending is for someone who answers "not sure" twice) and the spec's design that Actions
*routes* to TIM, **Actions is not buildable until this is settled.** Skills is unaffected.

### 2. The Context→Skills seed the product promises does not exist
`WorkBrainContextBuilder.tsx` tells people *"This list becomes the skills you build at Gate 2 — you
won't have to invent them later."* But that lives in the **Builder**. The **ported Interview** has
no recurring-deliverables question at all, and `responsibilities_list` is free-text, which cannot
seed a repeatable the way `role_names` (a `multi`) seeds `roles`.

- **(a)** Add one `multi` question to Context. Delivers the promise; breaks the verbatim-port
  contract and ripples into `CONTEXT_FILE_OUTLINE`, `SECTION_HALF_LIFE_DAYS`, the round-trip
  fixtures and every full-flow test.
- **(b)** Ask it as Skills' own opening question, seeding Skills' own repeatable. Self-contained,
  no ripple, loses the "you won't have to invent them later" payoff.

*Spike recommends (b).* Note V2.0's FLAG 2 already decided that flow changes go through the adapter
rather than editing `source.ts`, which makes (a) cheaper than it looks — but it still ripples.

### 3. What does "finished" mean for a file whose length the person chooses?
Skills is **repeatable-dominated**. Finished at one skill, or one per named deliverable?
`summariseSectionHealth` has no answer for this today, and `fileFinished` feeds `slots.ts`, Home's
locked rows, the file toggle, the breadcrumb, `nextMove` and the globe — the same
completeness-rippling trap V2.0's VB-61/63 already hit.

---

## Risks worth carrying forward
1. **Global id namespaces collide silently.** `SECTION_HALF_LIFE_DAYS`, `DEEP_DIVE`, `ADD_ANOTHER`
   and `moduleIntros` are flat `string → value` maps keyed on `sec1`…`sec10`. A Skills outline
   reusing `sec1` inherits Context's 365-day clock **with no error**. Prefix ids (`skl*`, `act*`)
   from question one.
2. **Lock ordering:** Skills→Actions is *essential* (Actions seeds from a named skill).
   Context→Skills is *staging only* under option (b) — a one-line change in `FILE_SLOT_IDS`.
3. **Gate naming has no sibling backing.** The extension says Name · Repeat · Act · Share; the
   sibling repo says "Remember" for gate 1 in three of four sources and "Spread" for gate 5. Worth
   reconciling before either file's copy is written.
4. **`OPEN.md` #3 decides whether Skills' team module exists at all** — whether pack skills are
   copied into `Skills.md` or referenced read-only.
