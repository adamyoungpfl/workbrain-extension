# The measurement spine — next steps and the decisions in the way

Adam, 2026-08-31:

> *"Coming into the app from scratch, their basic prompt creates a baseline.
> Once we complete the context file, we compare to baseline. If the baseline
> prompt is something that can be a skill, then we build and execute that skill
> and compare that to where we started with no file. The audit and the
> viability of any piece only matters if it is going to help produce a better
> output and provides us defensible reasoning for why we ask the specific
> questions and why we organize the file like we do, keeping only what makes
> the file most productive."*

That is a thesis, not a feature request, and it is the strongest one this
product has had. Three comparisons on one axis:

```
   arrival            after Context.md         after a skill
      │                      │                       │
   no file  ────────────►  file  ──────────────►  file + recipe
      └──────────────── same task, three times ──────┘
```

Everything else in the product becomes answerable against it: **a question
earns its place by moving one of those arrows.**

---

## What already exists

More than it looks, and it is worth knowing before building anything.

| Piece | Where | State |
|---|---|---|
| **The baseline task** | `goal_want`, asked in the goal gate at minute one | Shipped. *"What's the one thing you want it to do better today?"* is exactly the baseline prompt |
| **The task used unchanged in both conditions** | `promptFor` | Shipped, and deliberately identical between runs |
| **Both answers stored** | `proof_baseline_answer`, `proof_context_answer` in `wb:answers` | Shipped |
| **The person's own verdict** | `wb:report.scores` — `{ value, of }` | Shipped |
| **What the AI says it used and missed** | `core/proof/selfReport.ts` | Shipped today |
| **A skills interview that produces recipes** | Skills.md | Shipped |
| **An A/B harness over file shapes** | `scripts/bench/` | Shipped, one run in |

**The spine is mostly wiring, not invention.** What is missing is the third
comparison, the longitudinal link between the runs, and — the real gap — any
route from evidence back to the interview.

---

## The gaps, in the order they bite

### G1 · The baseline is captured too late to be a baseline
Today the "no file" answer is collected *during* the proof, which happens after
the interview. So it is a no-file answer produced by somebody who has already
done the work — fine as a control for the file's content, useless as a record
of where they started.

**This is the central design tension of the whole thesis** and it is a real
one: capturing a true arrival baseline means asking somebody to go and run a
prompt in their AI *before* the product has given them anything. That is the
highest-friction moment in the product and the likeliest place to lose them.

### G2 · Nothing links one run to the next
`proof_baseline_answer` is a single slot. Run the proof twice and the second
overwrites the first, so "compare to where you started" has nothing to compare
to.

### G3 · No skill-shaped detection
Nothing decides whether a `goal_want` could become a skill. *"Draft my Monday
status update"* is skill-shaped; *"help me think about my career"* is not.

### G4 · No route from evidence back to the interview
The thesis ends with *"keeping only what makes the file most productive"*. There
is no mechanism by which a question is retired, and no place a piece of
evidence about a question lands.

---

## The decisions, with a recommendation on each

### D1 · When is the baseline captured?
| | |
|---|---|
| **(a) At arrival, before the interview** | Truest baseline. Asks for real work at the worst moment. |
| **(b) At the proof, as today** | No friction, and it is a fair control for the file. It is not "where you started". |
| **(c) Offered at arrival, not required** — *recommended* | The goal gate already asks the question; add "want to see what your AI does with that right now?" as a door, not a step. Everyone who takes it gets a true baseline; everyone who does not still gets (b). |

**Why (c):** it costs nothing to skip, and the people most likely to take it are
the ones most likely to care about the comparison later. It also gives the
product something honest to say at minute one — *"here is what it does without
me"* — which is a stronger opening than any promise.

### D2 · Is a stored history of runs a usage log?
This is the guardrail question and it needs settling before G2 is built.

**The authorship test:** the answers are pasted by the person, the verdict is
ticked by the person. Neither is observed by the product. That is the same
footing as `wb:report.scores`, which is already kept — so **a history of runs
is on the right side of the line**, and a *count of how often somebody opened
the proof* is not.

**Recommended rule, for GUARDRAILS:** the product may keep runs the person
performed and judged. It may not keep anything about their behaviour around
those runs — not when, not how often, not how long they took.

### D3 · Does the third comparison need the skill executed?
Adam's *"build and execute that skill"* implies a run. The cheaper version
compares **file** vs **file + recipe** as two prompts, which the person runs
the same way they run the others.

**Recommended:** the cheap version first. It answers the same question — does
the recipe add anything over the file — and needs no new execution machinery.

### D4 · How is "skill-shaped" decided?
| | |
|---|---|
| **(a) A fold over the goal text** | Fast, wrong sometimes, invisible when wrong. |
| **(b) Ask them** — *recommended* | One question at the right moment: *"is this something you do more than once?"* That is the definition of a skill in this product, and it is the person's to answer. |

**Why (b):** it is also a better question than the classifier would be. A goal
somebody does weekly is a skill whether or not it reads like one.

### D5 · What happens to a question the evidence does not support?
The end of the thesis, and the part with teeth.

**Recommended mechanism:** the design log gains a per-question row the moment
there is evidence about it — from `MISSING` in self-reports, from benchmark
runs, from the proof. A question with no evidence stays. A question the
evidence argues against moves to **Contested**, and a question that stays
contested across two runs is **retired** — removed from the interview, kept in
the log with the reason.

**The rule that makes it honest:** retirement is a decision somebody makes and
signs, not a threshold that fires. The log records who and why.

---

---

## The decisions, RULED (Adam, 2026-08-31)

| | Ruling |
|---|---|
| **D1** | Door, not step — **and the door goes on the splash page.** |
| **D2** | Agreed. Runs are keepable; behaviour around them is not. Written into `GUARDRAILS.md`. |
| **D3** | Agreed. File vs file+recipe as two prompts, before any execution machinery. |
| **D4** | Agreed. Ask whether it repeats rather than classifying it. |
| **D5** | Agreed. Contested, then retired by a decision somebody signs. |

### One thing D1 needs resolving before it can be built

**The splash runs before the goal exists.** `goal_want` is the first question of
the interview (V2.3 VB-93's gate), and the splash is upstream of all of it — so
a door there has no task to run yet. Three ways, and the third is the one that
keeps Adam's placement:

1. **Move the goal gate onto the splash.** Truest to "the door is on the
   splash", and it puts a text question on a screen designed as a held moment.
2. **Run the canned baseline prompt instead.** No goal needed, and it measures
   a task that is nobody's — which is the one thing the spine cannot afford,
   since the whole argument is that it is *their* task, three times.
3. **The splash door opens a short path** — *"start by seeing where you are"* →
   the goal gate → the offer to run it now → the interview. **Recommended.**
   The door is on the splash, and what it opens is the two questions that make
   a baseline possible. It also reads better than the alternative: the splash
   already offers the tour, and this is the same shape of offer.

---

## The sequence

**1 · Close G2 — make runs a history. DONE (2026-08-31).**
`ProofRun` on `ReportState`, and `core/report/runs.ts`: `appendRun`,
`runsForTask`, `comparison`, `latestTask`, `missingTally`.

Two decisions inside it worth knowing:

- **Grouping is by TASK, not by time.** A person can change their goal, and
  when they do the old runs must stay under the old task rather than silently
  joining the new one. A comparison between two different questions is not a
  comparison.
- **The baseline is pinned to the FIRST run; context and skill take the
  LATEST.** The baseline is a historical fact — where they started — and a
  later "no file" run by somebody who has since done the interview is not that.
  The other two measure the file as it is now, so the newest is the true one.

**2 · Close G1 with D1(c). DONE (2026-08-31), resolution 3.**

The splash gains a door — *"Start by seeing where you are"* — drawn above the
tour's and a step louder than it, because it is the one offer on that screen
that **expires**. The tour can be taken any time; a baseline only before
somebody starts.

What it opens is the path, not a prompt: the goal gate, then
`surfaces/BaselineOffer.tsx`, then the interview. That is what resolves the
ordering problem — at the splash there is no goal yet, so a door that tried to
run one would be running a task that is nobody's.

Three conditions gate the offer, and each is load-bearing: the session came
through the door, the goal exists, and no baseline for that task has been
recorded. Whether they came through the door is **ephemeral state in `App`**,
not storage — a stored flag would be a fact about how somebody arrived, which
is behaviour rather than work and is what D2's row forbids keeping.

"Not now" is a real answer and costs nothing: the proof's own baseline still
runs later. Anything that made this feel required would trade the interview for
the measurement of it.

**3 · The comparison surface. DONE (2026-08-31).**
`surfaces/Comparison.tsx`, opened from a Home row that appears only once there
is something to compare — a row onto an empty screen teaches somebody the
product is not ready.

Both proof runs are recorded **at the verdict**, not at the two commits that
produced them. One place, and the only one that holds everything a run needs at
once: the task, both answers, the score and the self-report. Writing at each
commit would mean two half-runs and a later stitch, and a stitch comes apart.
It also means a run exists only once somebody has JUDGED it, which is exactly
where D2 draws its line.

**Nothing is derived into a verdict.** No percentage, no arrow, no score out of
a hundred — `GUARDRAILS.md` bans a composite score and the reason bites here:
a number we computed over two pieces of prose would be the one thing on that
screen we made up. The reader is the judge, which is also the only way the
comparison means anything to them.

**A missing stage is a stated absence, not a gap.** Most people will have two
stages and — until step 4 — nobody has three, so the skill row says what would
fill it and a missing baseline says why it can no longer be filled. A greyed
box with no explanation reads as something broken.

### One shipped claim this superseded, and it is worth knowing

`proof.spec.ts` has asserted since R1-11: *"NEITHER ANSWER EVER REACHES THE
REPORT. The panel shows them and records a number the person chose; it never
keeps what the AI wrote."*

D2 rules the opposite, explicitly — *"the product may keep runs the person
performed and judged — the task, what their AI wrote back, their own verdict"*.
So the claim is superseded rather than deleted, and both halves of why are
recorded in the test:

- What R1-11 was really protecting **survives in a narrower form**: we do not
  accumulate AI output nobody judged. A run is written at the verdict, which is
  the moment somebody judged it.
- The answers were **never actually absent from storage.** `wb:answers` has held
  both in single slots since R1-11. What the report gains is a HISTORY, which
  is the whole of G2 — a single slot cannot say "compared to where you started"
  because the second run overwrites the first.

**RULED (Adam, 2026-08-31):** *"D2 is good with the change that preserves the
intent of the guardrail."* So the supersession is signed rather than inherited,
and the intent it preserves is the narrower claim above — **we do not
accumulate AI output nobody judged.** That sentence, not the original absolute,
is what a future change has to answer to.

**4 · Close G3/G4 with D4(b).** After a proof, if the goal is repeatable, offer
to make it a skill — then the third comparison lands in the same surface.

**5 · Close G4's other half — the evidence route.** `MISSING` items aggregate
into a review the design log can be updated from. Not automatic: a list
somebody reads.

**6 · Then, and only then, back to the interview.** With runs behind us, the
question "are we collecting the right things" stops being an argument and
becomes a report — which is exactly the order Adam is asking for.

---

## What this does to the beta

**It does not block it.** Steps 1–3 are the spine's minimum and none of them
touches the interview. The interview changes — adding, removing, rewording —
are step 6 and they want the evidence first.

**The honest risk:** this is a second product surface (a comparison view) and a
new storage shape, arriving while §5's canvas work and R-16's Concept 2 are
mid-flight. Sequencing it after the beta ships is defensible; sequencing it
before means the beta ships with the argument the product is actually about.
That is Adam's call and it is a real one.

---

## The baseline is contaminated by memory, and we found out by running it

**2026-09-01. Adam ran the first real baseline.** He took the seeded example
"Explain what I do to someone non-technical" and ran it in his personal Gemini
account — the one he uses for work and personal things. It returned three
polished, fully-specified descriptions of his actual job: dashboards for
leaders, IT support response times, service delivery health, enterprise
reporting.

`scripts/bench/detect.ts` on that answer returns **zero namings**. Not one
sentence in it says "I don't know what you do."

### What that means

That account has memory of him. So the run was not "your AI with nothing
loaded" — the phrase this product prints on the screen. It was *Gemini with
everything it has already learned about Adam over months of use.*

The condition the spine calls "baseline" is not, for most people, an empty
model. It is whatever their assistant has already accumulated: memory, custom
instructions, prior threads. Anybody who has used one AI heavily has a
contaminated baseline by definition, and they are exactly the people most
likely to try this product.

### It changes the claim, and the honest version is stronger

The claim on the screen is *file versus nothing*. The measurable claim is
**file versus whatever that one assistant happens to remember**, which is a
harder bar and a different sentence.

It is also the better product argument, and the run is the evidence:

- Gemini knew him. Claude and ChatGPT did not, and will not.
- That memory is **per-vendor, per-account, invisible, and non-portable.** He
  cannot read it, correct it, or take it anywhere.
- The file is the same knowledge made portable, inspectable and correctable.

"Your AI already knows some of this, in a form you cannot see or move" is a
truer pitch than "your AI knows nothing about you", and it survives contact
with the exact user who would otherwise say *"but Gemini already does this."*

### The measurement problem underneath it

The comparison as designed asks somebody to judge two answers. That measures
**perceived quality**, and this answer would score well on it while telling us
almost nothing.

The axis that matters is **groundedness** — is this true about me, and does it
say so when it is not. A fabricated answer and a well-grounded one can look
equally good on a screen. The detector distinguishes them; a reader's verdict
does not.

`docs/GUARDRAILS.md` deliberately keeps the self-report block off the baseline
run, because asking a model which parts of the file it used would tell it a
file exists. That reasoning holds. But it also means baseline fabrication is
undetectable *by design* — and this run shows the way through: `detect()`
measured it **from the answer text alone**, with no added instruction and
nothing sent anywhere. Counting namings on a pasted answer is the same shape
as the R-16 self-report parse: read on render, dies with the screen.

### Open, for Adam

1. Does the baseline screen say what it currently says, or does it name the
   memory problem and ask them to use a temporary chat?
2. Does the comparison stay a quality verdict, or gain a groundedness signal?
3. Does the marketing claim become the portable-memory argument above?

**None of these are resolved in code.** They are product decisions in the sense
`docs/OPEN.md` means it.

### A detector bug found on the way

Running `detect()` on this answer produced eight `second-manager` findings, all
of them markdown headings — "The Simple 3-Part Breakdown" read as an asserted
name. The same false-positive class was fixed once for `**Status:**` labels and
was clearly not fixed generally. The `namings` count is sound; the `findings`
list needs the structural rule tightened before it is trusted again.
