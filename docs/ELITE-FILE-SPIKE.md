# The elite file, defined — a spike before the interview builders

Adam, 2026-09-10: "I want to define the core elements of an 'elite' context
file and how the skills and actions apply to it. The same goes for the
Skills… lead with being able to define 'good' and 'great' so it can drive
the goal of the user… early thought leadership and also early material for
the civic accelerator and an anchor to tie good to that other programs
would have to refute."

Adam's clarification, 2026-09-10: "I don't want to reaffirm my design so
much as make sure that it is not missing critical pieces that would make
it underperform for some people." That is the spike's actual job, and §4
is its heart: a red team against the design, population by population,
asking who the current file structure quietly fails. §§1–3 exist to make
those misses visible — you cannot see what a bar excludes until the bar
is stated — and §1's own wording gets amended where the red team caught
it. Coherence with the white paper (which §2 shows) is necessary and NOT
sufficient; a design can agree with its own paper and still underperform
for a nurse with an Etsy shop.

Everything here stands on two things that already exist: the shipped
generators (`core/files/` — the eleven Context modules, the Skills recipes,
the derived Actions) and the white paper (`site/durable-context.pdf`),
whose §7 artifacts, §9 measurements and §11 five-minute test are the
published evidence base. Nothing in this spike contradicts either; where
it goes further, it says so.

---

## 1 · Good and Great, defined first

The definitions lead because everything else serves them: every interview
question exists to move a person up this ladder, every app surface exists
to show them where they stand, and the civic credential tiers are these
rungs with a ceremony attached.

**The ladder has three rungs. Each is testable. None is a vibe.**

### Started

The file exists, and a fresh assistant given the file knows who the person
is. One run, one check. This rung exists so the first session of anything
— the app's first module, a civic cohort's first evening — has a summit a
beginner can reach.

### Good — passes the five-minute test, on file

The white paper's §11 diagnostic, turned from a diagnostic into a bar.
Open a fresh conversation, paste the file, ask for the person's most
common ask — a deliverable if they make one, the situation they most
often bring if they don't (red team #3) — and type nothing else. The
file is Good when:

1. The answer knows **who is asking and who the audience is**.
2. It uses **the person's own names for things** — their systems, their
   teams, their vocabulary.
3. It arrives in **the format they would otherwise have corrected it
   into** — or, for a situational ask, weighs the factors they would
   have had to list by hand.
4. The setup cost was **zero words beyond the request itself**.

Good is binary and observable in a single run — which is exactly what
makes it teachable. It is also the honest floor: most working files in
the wild, including most "custom instructions," fail line 2 or 3.

### Great — survives what breaks Good

Good is one run on one day. Great is what remains true across repetition,
rephrasing, and time — the three forces the white paper shows are what
actually break these systems (§4, §5). A file is Great when:

1. **Paraphrase-stable.** Ten differently-worded asks of the same
   recurring job land inside the acceptable band — because the method is
   written and reused, not improvised at the keyboard (§5's design
   conclusion, made personal).
2. **Delta-proven.** The baseline exists — the same ask, captured before
   the file — and the with-file run beats it on the §9 measures: context
   typed per prompt near zero, clarifying exchanges down, the result
   actually used. The proof is on file, not remembered.
3. **Self-reporting.** Every claim carries its date. The file can say
   which of its own claims are past their half-life — drift is visible
   before it misleads. (The app's Fresh / Drifting / Unanswered states
   are this rubric line, already built.)
4. **Curated.** The smallest high-signal set that produces the behavior
   (§4: volume is not the objective; a 300-token focused context beat a
   113,000-token complete one). An elite file is defined as much by what
   it excludes — and its boundaries section says so in writing.
5. **Inheritable.** A stranger — a successor, or just a different
   assistant — can act on it without the author in the room. Names
   defined, formats shown by example, methods followable step by step.
   This is the paper's §8 team-layer test applied to one person.
6. **Skill-backed.** The person's recurring jobs exist as skills, and
   every skill states an objective its output can be scored against —
   which is what makes "prove it" a scoring, not an opinion.
7. **Owned and portable.** Plain text, on the person's device, consumed
   by whichever assistant is in front of them. The format guarantees this
   rung line for free — it is on the rubric because the rubric is public,
   and this is the line most competing programs fail.

**Naming note for Adam:** the brief uses both "great" and "elite." This
spike uses *Good / Great* as the public pair (they alliterate, they
ladder, grade 7 reads them instantly) and *elite file* as the name for a
file that has held Great over time — the thing the board night certifies.
Ratify or rename; the rubric doesn't care.

### Why the rubric drives the user's goal

Every line above is checkable — most by the app itself (the audit and
recommend engines already weigh freshness and coverage; the Grounds
already run baseline-versus-file). So the app can always answer the only
motivational question that matters: **"where am I on the ladder, and what
is the next thing Great needs?"** That sentence is the product's goal
engine, the interview's editorial test, and the civic curriculum's spine,
all at once.

---

## 2 · The elite Context.md — core elements

The eleven interview modules are the questionnaire. These seven elements
are what the questionnaire exists to fill. The distinction matters for
the builder work: modules can merge, split, or reorder; the elements are
the contract.

| # | Element | Fills rubric line | Today's module(s) |
|---|---|---|---|
| 1 | **Identity & scope** — who I am, what I'm responsible for, where my authority stops | Good 1 | About Me, Responsibilities & Boundaries |
| 2 | **Audiences** — who receives my work, what each expects, what each already knows | Good 1, Good 3 | Audience Profiles, How I Communicate |
| 3 | **My world** — the systems I work in, the tools I touch, where the data lives | Good 2 | My World |
| 4 | **Names** — my vocabulary: what words mean here, which terms are load-bearing | Good 2, Great 5 | Vocabulary & Knowledge |
| 5 | **Settled decisions** — what has been decided and is not up for re-litigation; constraints I operate under | Great 1, Great 5 | How I Think, Responsibilities & Boundaries |
| 6 | **Trajectory** — what I'm driving at now, AND who I'm becoming; the target the file should lean toward, not just the present it describes (red team #2) | Good 1, Great 3 | Initiatives |
| 7 | **Exemplars** — one real specimen of my most common deliverable, marked "like this" | Good 3, Great 5 | Reference Examples |

Two structural properties complete the element list, and both are already
built: the **System Grounding Rule** (the file tells the assistant how to
consume it) and **per-claim freshness** (every answer dated, half-life
tracked — rubric Great 3).

And one element is deliberately about absence: **Context Boundaries** —
what the file refuses to contain. In the elite frame this is not a
privacy footnote; it is rubric Great 4 made into a section. A file that
can say "I left X out on purpose" is curated; a file that can't is just
short.

The white paper's §7 says four artifacts must be written down: Identity,
Decisions, Method, Evaluation. The mapping is now exact — and worth
saying out loud in the thought-leadership version, because it means the
three files are the paper's argument, implemented:

- **Identity + Decisions → Context.md** (elements 1–7 above).
- **Method → Skills.md** (§3 below).
- **Evaluation → the per-skill Objective + the Proving Grounds** — the
  definition of good lives *inside* the artifact it judges, and the
  Grounds are the instrument that reads it.
- **Actions.md** is not a fourth artifact — it is the Method artifact
  re-addressed to a different reader (the implementer), derived, never
  interviewed (V2.2 decision #1, unchanged).

---

## 3 · The skill builder — one spine, many shapes

The variety problem is real: "write my weekly status," "review a PR,"
"turn meeting notes into tickets," and "run the monthly close" are not
the same shape of work. The consistency requirement is also real: a
builder that reshapes itself per skill is unapproachable. The resolution
is the oldest one in schema design — **a fixed spine, with archetypes
that tune the prompts, never the shape.**

### The spine (every skill, no exceptions)

| Field | Status | Notes |
|---|---|---|
| Name | shipped | the recipe's callable name |
| **Objective** | **NEW — required** | what a good finished one lets the person do, in checkable terms. Asked FIRST (see below). |
| Trigger | shipped | when this runs |
| Inputs | shipped | what it needs before starting |
| Tools | shipped | which systems it touches (feeds the Actions derivation) |
| Steps | shipped | the method, in order, as written |
| Output | shipped | the shape handed back |
| **Checks** | **NEW** | what must be true before the output is trusted; the known failure modes |
| **Example** | **NEW — optional, elite** | one real good output, pasted; the paraphrase-stability anchor |
| Autonomy | shipped (V2.2) | I run it / draft for approval / fully automatic / never |
| Freshness | shipped pattern | dated like every other claim |

The one ordering decision that carries Adam's "lead with good and great":
**the builder asks the Objective before the Steps.** "When this goes
well, what does the finished thing let you do?" comes before "how do you
do it?" — because a person who has said what good looks like writes
sharper steps, and because the Objective is what the Proving Grounds
scores. Objective-first is the interview-level enactment of the whole
rubric.

### The archetypes (five, tuning only the prompts)

| Archetype | The job sounds like | An Objective sounds like | The Output shape |
|---|---|---|---|
| **Producer** | "Write the weekly status" | "Leadership can act on it without a follow-up question; one page; leads with what changed" | a named deliverable, format shown by Example |
| **Transformer** | "Turn meeting notes into tickets" | "Every action item becomes exactly one ticket; nothing invented, nothing dropped" | mapped structure, source → target |
| **Judge** | "Review the draft / the PR" | "Every finding names its line and its reason; nothing above severity X missed" | findings list with verdicts |
| **Researcher** | "Pull what changed this week" | "Every claim carries its source; what's missing is named as missing" | sourced brief |
| **Coordinator** | "Run the month-end checklist" | "Every step done or escalated; nothing silently skipped" | checklist with status |

The archetype is picked early (or inferred from how the trigger is
phrased and confirmed with one chip), and its only power is choosing
which follow-up prompts fire and which Output shapes are offered as
chips. The saved skill is spine-shaped regardless — which is what keeps
the Grounds, the Actions derivation, packs, and parsing all
archetype-blind. Flexibility for the person, consistency for the system.

### Good and Great for a skill

Same ladder, smaller unit. A skill is **Good** when a stranger's
assistant, given the recipe alone, produces an acceptable output — the
recipe test, one run. A skill is **Great** when it holds across runs and
rewordings (the pass^k idea from §9, at personal scale), states an
Objective the Grounds can score, and names its failure modes in Checks.
The elite Skills.md is not the longest one; it is the one where every
recurring job that matters has a Great skill and nothing else is in the
file.

---

## 4 · The red team — who this design underperforms, and what's missing

Each entry: the population, where the current design breaks for them,
the missing piece, and when it must be decided. "Pre-builder" means the
interview/answer-type work cannot start cleanly until it's settled.

### 1 · The many-hatted — the biggest structural gap

**Who:** anyone whose life is not one job. The nurse with the Etsy shop.
The teacher who freelances. The caregiver who job-hunts. In a civic
cohort this is closer to the median than the exception.
**Where it breaks:** the file has one identity, one world, one voice —
so either the answers blur into mush, or one life dominates. And §4 of
the paper makes it worse than dilution: the *other* life's context is a
measured distractor that actively degrades answers about this one.
**Missing piece:** facets — answers tagged by domain, and a scoped
export ("just my shop file") so the person hands each assistant only
the life in play. Alternatively multi-profile storage (several files
per install). Either way it touches `wb:answers`' shape, which is why
this is the one true **pre-builder blocker**: question design depends
on whether an answer knows which life it belongs to.
**Interim honesty:** today's design serves the one-job person well and
the many-hatted person with a compromise nobody chose.

### 2 · The person in transition — the civic core

**Who:** job seekers, students, returners, career changers — the exact
populations the Accelerator convenes.
**Where it breaks:** the interview captures who you ARE; the assistant
then faithfully produces the past. A file that says "retail associate"
in every section writes retail-shaped cover letters at someone aiming
at bookkeeping. For this population the present-tense file is not
weak — it is actively backward-anchoring.
**Missing piece:** target-state capture as first-class — current role
AND target, the gap named, what to lean on. (§2's element table now
says Trajectory for this reason.) The Good test for them runs against
the target, not the past. **Pre-builder** — it is question design.

### 3 · The advice-seeker — work that isn't documents

**Who:** tradespeople, caregivers, clinicians off-hours, and everyone
using AI for life rather than deliverables — meal plans, benefits
navigation, a hard email to a landlord. "Business, life, and
technology" is the civic promise; the module set is work-shaped.
**Where it breaks:** the five-minute test said "deliverable"; the
exemplar element says "paste a specimen"; the skill spine demands
Steps → Output. A situational ask has none of those.
**Missing piece:** (a) the Good test rewritten (done above); (b) the
spine's Steps field accepts a second method style — **principles**
("the questions I ask, the factors I weigh, the lines I won't cross")
— so judgment work becomes a skill without faking a procedure; (c)
module copy that admits non-work answers without contortion
("Responsibilities" cannot stall a retiree). **Pre-builder.**

### 4 · The thin writer

**Who:** low-confidence writers, ESL speakers, anyone for whom typed
prose is the tax — again, civic-median, not edge.
**Where it breaks:** in this design, file quality currently EQUALS
writing fluency, and the guardrails (rightly) forbid in-app AI polish
— so the thin writer has no remedy inside the product.
**Missing piece:** the polish HAND-OFF — the same copy-paste pattern
as everything else: "rough answer → your own AI tightens it → paste it
back," offered on long-text questions. Plus chips-first capture so a
short answer still lands structured, and exemplar weighting (show
beats tell precisely when telling is hard). **Pre-builder** — it is an
answer-type feature.

### 5 · The mis-self-reporter

**Who:** everyone, worst on adjective questions. People describe the
communicator they wish they were; the file then encodes the wrong
persona confidently, and the assistant performs it.
**Missing piece:** a specimen-first bias in question design — "paste
two things you actually wrote" outranks "describe your tone," and the
generated file cites the specimens rather than the adjectives.
**Pre-builder principle**, zero schema cost.

### 6 · The regulated worker

**Who:** healthcare, finance, government, legal — people whose
employer forbids pasting work specifics into an assistant.
**Where it breaks:** their honest file is nearly empty, or a policy
violation. The design never tells them there is a third option.
**Missing piece:** the abstraction pattern, taught in-product:
placeholder conventions ("Client A," generic system names), a
boundaries question that captures the redaction stance, and copy that
says plainly this is a legitimate way to hold the file. Mostly copy;
one question. Also a civic session-two teaching moment. **Pre-builder,
cheap.**

### 7 · The variety worker

**Who:** gig workers, ops firefighters — high task variety, nothing
repeats at the step level, so "what repeats?" (the Skills opener)
returns silence and the second interview stalls at its front door.
**Missing piece:** triggers phrased on situations ("when a new offer
lands") rather than calendar repetition, plus the principles method
style from #3b — their repeatable thing is judgment, not procedure.
**Pre-builder copy/prompt work.**

### 8 · The set-and-forget user — two grounding-rule lines, shippable now

**Who:** generates once, never reopens the panel. The drift check runs
on open (OPEN #1), so it never fires for them; meanwhile the paper's
§3.5 problem arrives — the assistant's own memory ingests the pasted
file and re-serves stale paraphrases of it for months.
**Missing piece:** the FILE defends itself. Two lines in the System
Grounding Rule: **(a)** "answers here carry dates — if one looks past
its shelf life, say so before relying on it"; **(b)** "this file
supersedes anything you remember about me from earlier
conversations." Line (b) is the file asserting its own precedence —
the exact thing Appendix A.5 shows no vendor documents, answered from
the user's side. Zero schema cost, first in the build queue after the
spike is ratified (it is app code: gate, clips-check, the works).

### 9 · The non-English speaker — named so it's a decision, not an oversight

Interview copy, generated headings (which are parse anchors), and
narration are all English. Internationalizing is real work touching
the roundtrip contract. **Deferred deliberately** — and the civic host
materials should say "English cohorts for now" out loud rather than
let a host discover it.

### What the red team says about §§1–3

The rubric survived with two amendments (the ask-not-deliverable test,
the trajectory element). The skill spine survived with one (a second
method style). The element list survived with reframes, not removals.
The structure that did NOT survive intact is the single-context file —
#1 is a genuine missing piece with a schema decision behind it, and it
gates the builders.

---

## 5 · The anchor — claims a competing program must refute

The thought-leadership posture: publish the definition of good, with its
measurements, and make disagreement expensive. Six claims, each
falsifiable, each resting on the white paper's cited evidence:

1. **A context file that has never been tested against a baseline is a
   belief, not a tool.** To refute: show a trustworthy improvement claim
   with no before.
2. **A definition of "good" with no measurement attached is not a
   definition.** To refute: produce one that is.
3. **Volume is not quality.** A file built by accumulation will lose to
   a curated one (§4's evidence). To refute: overturn the distractor
   literature.
4. **A method that lives only in someone's head fails the paraphrase
   test by construction** (§5). To refute: show improvised phrasing
   holding across ten rewordings.
5. **Durable context a person cannot export, edit, and carry is a vendor
   feature, not their file.** To refute: argue lock-in is durability.
6. **A credential that certifies attendance rather than evidenced use
   certifies nothing.** To refute: defend the participation ribbon.

And the structural kicker Adam named, stated plainly: **because the file
is plain text the person fully controls, any critique of a specific
element is itself just an edit** — find a flaw in the rubric's element
list and a Workbrain user can apply the fix to their own file this
afternoon. A competing program that finds a real weakness has improved
our users' files; only a flaw in *"written, owned, portable, measured"*
itself would touch the foundation, and that is the ground the white
paper already defends with citations. Critique strengthens the format;
that asymmetry is the moat.

**Civic lock:** the credential tiers are the rubric with a ceremony.
Session 4's Certificate of Completion = **Good, demonstrated once, in
the room** (the five-minute test passed on the person's own baseline).
Work Brain Certified at a board night = **Great, evidenced over time**
(they came back and showed use). The curriculum doesn't need a separate
standards document — this rubric is it, and §7.1/§7.3's survey measures
in the civic notes are already the rubric's instruments.

---

## 6 · What this demands from the interview builders (the next work)

The spike exists to make the question/prompt/answer-type work decidable.
The requirements it sets:

1. **Every question maps to a rubric line.** A question that fills no
   element and serves no rung gets cut — curation applies to the
   interview before it applies to the file.
2. **Objective-first skill building.** The skill interview opens with
   the good-outcome question, then trigger/steps. Archetype confirmed
   with one chip, never a form fork the person has to understand.
3. **Answer types the rubric needs:** an exemplar-paste type (a real
   specimen, stored verbatim, marked "like this" — Good 3); a
   term-and-meaning pair type (Names — Good 2); a structured audience
   type (who + what they expect + what they already know — Good 1);
   "not sure" first-class everywhere it can be true (V2.2 law); dates
   automatic on everything (Great 3).
4. **The ladder is surfaced, not implied.** Home (or the file drawer)
   shows the rung and the single next thing Great needs — the
   recommend engine's weights get re-derived from this rubric so the
   nudge and the definition can never disagree.
5. **Boundaries are asked, not inferred.** One question whose answer is
   an exclusion list the file prints — Great 4 in the person's words,
   including the regulated worker's redaction stance (red team #6).
6. **The facet call comes first** (red team #1) — whether answers carry
   a domain tag (with scoped exports) or the install supports multiple
   profiles. Question design cannot start until an answer knows which
   life it belongs to.
7. **Two method styles in the skill spine** — steps for procedures,
   principles for judgment (red team #3, #7) — one chip, same spine.
8. **The polish hand-off on long-text answers** (red team #4) — rough →
   the person's own AI → pasted back; the guardrails' own pattern.
9. **Specimen-first style capture** (red team #5) — paste-what-you-wrote
   outranks describe-yourself wherever both could serve.
10. **The two grounding-rule lines ship first** (red team #8) —
    staleness self-report and file-over-memory precedence; smallest
    change, largest reach, fully inside the existing contract.

## 7 · Adam's calls

1. **The facet decision (blocks the builders):** domain-tagged answers
   with scoped exports, or multi-profile storage, or explicitly ship V1
   as the one-life file with the compromise named. This is the red
   team's one structural finding; everything else is question and copy
   work inside the existing shape.
2. **Naming:** Good / Great / "elite file" as used here — ratify or
   rename.
3. **Objective retrofit:** existing skills without an Objective — prompt
   to add on next edit (recommended), or leave until touched.
4. **The grounding-rule pair** (red team #8): approve the two lines and
   they are the first build after this spike.
5. **The public version:** this doc is internal grammar. The
   thought-leadership piece (site essay, civic handout) is a rewrite
   with the same spine — say when, and which surface it lands on.
6. **English-only, said aloud** (red team #9): confirm the civic host
   materials state it until i18n is scheduled.
