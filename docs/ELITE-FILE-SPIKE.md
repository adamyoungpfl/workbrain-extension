# The elite file, defined — a spike before the interview builders

Adam, 2026-09-10: "I want to define the core elements of an 'elite' context
file and how the skills and actions apply to it. The same goes for the
Skills… lead with being able to define 'good' and 'great' so it can drive
the goal of the user… early thought leadership and also early material for
the civic accelerator and an anchor to tie good to that other programs
would have to refute."

This spike does four things: defines Good and Great so they can be
measured, not admired; names the core elements of the elite Context.md and
how Skills and Actions attach to it; specifies the skill builder — one
spine, many shapes; and states the anchor claims a competing program would
have to refute. It ends with what this demands from the interview builders
(the next work) and the small set of calls that are Adam's.

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
common deliverable, and type nothing else. The file is Good when:

1. The answer knows **who is asking and who the audience is**.
2. It uses **the person's own names for things** — their systems, their
   teams, their vocabulary.
3. It arrives in **the format they would otherwise have corrected it
   into**.
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
| 6 | **Direction** — what I'm driving at now; what next looks like | Good 1, Great 3 | Initiatives |
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

## 4 · The anchor — claims a competing program must refute

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

## 5 · What this demands from the interview builders (the next work)

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
   an exclusion list the file prints — Great 4 in the person's words.

## 6 · Adam's calls (small, none blocking the doc)

1. **Naming:** Good / Great / "elite file" as used here — ratify or
   rename.
2. **Objective retrofit:** existing skills without an Objective — prompt
   to add on next edit (recommended), or leave until touched.
3. **The public version:** this doc is internal grammar. The
   thought-leadership piece (site essay, civic handout) is a rewrite
   with the same spine — say when, and which surface it lands on
   (roadmap row exists once decided).
