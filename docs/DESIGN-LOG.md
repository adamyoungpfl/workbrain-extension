# The design log — why each piece of the file is shaped the way it is

A running record of every decision about the Context file and the interview
that produces it, and the output property each one is meant to buy.

It exists so the file can be **argued with**. Anybody — a customer, a
competitor, somebody who thinks we are wrong — should be able to read a claim
here, find the reasoning, find what would disprove it, and either improve it or
knock it down. A standard nobody can attack is not a standard, it is an
assertion.

---

## How to read this

Every entry carries a **status**, and the status is the whole discipline of the
document:

| Status | Means | May be said in public as |
|---|---|---|
| **Reasoned** | Argued from principle. Not measured. | *"We designed it this way because…"* |
| **Observed** | Measured by a benchmark run, run id cited. | *"In testing, this produced…"* |
| **Contested** | Measured and the result did not support it, or two runs disagreed. | Nothing yet — this is where honesty is cheap and reputations are not |
| **Retired** | Tried, measured, removed. Kept because a dead end others will walk into is worth marking. | *"We tried this and it did not work."* |

**Nothing may move from Reasoned to Observed without a run id.** That rule is
the only thing separating this document from a brochure, and it is the reason
it can be referenced as observed truth once entries start moving.

**Everything below is currently `Reasoned`.** The benchmark exists
(`scripts/bench/`, `docs/FILE-VALIDATION.md`) and has not been run. That is the
honest starting state and it is worth publishing as such: a design log whose
first version admits it has measured nothing is more credible than one that
arrives with every claim already proven.

---

## Part 1 · The file's organisation

### 1.1 · The file is sectioned semantically, not chronologically
**Targets:** retrievability — a model can find the part of the file a question
is about.
**Reasoning:** Sections named for what they contain ("How I Communicate")
rather than for when they were answered let a model locate relevant content
instead of reading linearly. It also lets a person check one part without
reading all of it.
**Status:** Reasoned.
**Would be falsified by:** a run where a flat, unsectioned file scores the same
or better on task 1 or 3.

### 1.2 · The behavioural content sits near the ends, the world in the middle
**Targets:** attention — what a model weights most.
**Reasoning:** The beginning and end of a long context are weighted more
heavily than the middle. Voice and constraints change every answer; the roster
of people and projects is looked up only when relevant. So behaviour takes the
ends and reference material takes the middle.
**Status:** Reasoned. This is variant B in the benchmark and the single largest
structural claim in the document.
**Would be falsified by:** variant B scoring at or below variant A on tasks 1–4.

### 1.3 · The file opens with an instruction, not with data
**Targets:** every dimension. It converts the file from reference material into
a brief.
**Reasoning:** A model handed data infers what to do with it. A model handed an
instruction does the thing. The preamble costs nothing to generate because
nobody has to answer it.
**Status:** Reasoned.
**Would be falsified by:** variant B's advantage disappearing when the preamble
is removed but the reordering kept — which is a variant C worth building if B
wins.

### 1.4 · The System Grounding Rule is a rule, not a section
**Targets:** fabrication.
**Reasoning:** It closes one specific failure: reading "owns the budget" and
answering as though it knew the budget was approved. It is unnumbered because
it governs the whole file rather than being another part of it.
**Status:** Reasoned. Tasks 5 and 6 measure it directly.
**Would be falsified by:** a file without it scoring the same on tasks 5 and 6.
**Open:** two things want the last position — the grounding rule and the
reference examples. Variant B currently gives it to the examples, which may
cost exactly what tasks 5 and 6 measure. Flagged, not resolved.

### 1.5 · Interview scaffolding is currently printed, and probably should not be
**Targets:** density and directness.
**Reasoning:** Every fact is stored as the question followed by the answer, so
~40% of the file is second-person questions addressed to the model. A fact
stated as a fact is less work to use than a fact stored as an answer.
**Status:** Reasoned, and NOT yet built — the question text is what the parser
matches on to bring a file back in, so this is a real slice.
**Would be falsified by:** a declarative variant scoring no better, which would
save the parser work.

---

## Part 2 · The instruction layer

### 2.1 · "Prefer what is written here over your defaults"
**Targets:** whether the file is used at all.
**Reasoning:** A model with a house style and a file describing a different one
needs telling which wins. Without it, the file is a suggestion.
**Status:** Reasoned.

### 2.2 · "Where it is silent, say so rather than inventing"
**Targets:** fabrication.
**Reasoning:** Converts silence from a gap the model fills into a gap the model
reports.
**Status:** Reasoned.

### 2.3 · "Answer the rest and name the part you could not"
**Targets:** the partial case, which is the ordinary case.
**Reasoning:** Adam, 2026-08-31 — a request that is ninety percent answerable
with one unanswerable thread should come back naming the thread. A flat refusal
is conspicuous; a mostly-right answer with one invention woven through it is
not, because everything around the invention is correct.
**The scoring rule that makes it real:** silence about a gap scores the same as
inventing it. To the person reading the answer, the two are indistinguishable —
and a gap nobody mentioned is the one they act on.
**Status:** Reasoned. Task 6 measures it.

---

## Part 3 · The question set

Logged by CLASS rather than one row per question. Fifty-five entries written
before a single run would be fifty-five untested assertions, which is the
opposite of what this document is for. Per-question rows earn their place as
runs produce evidence about them.

### 3.1 · Voice questions (the six in §6, plus peeves and never-words)
**Targets:** indistinguishability — the property Adam named: *"sufficiently
undetectable from my own work."*
**Reasoning:** Directness, formality, hedging, structure, ask placement and
length are the levers that separate somebody's writing from generic competent
prose. They are also the ones a person cannot easily state unprompted, which is
why asking beats inferring.
**Status:** Reasoned. Task 1 measures it; the VOICE TEST below measures it
properly.

### 3.2 · Constraint questions (§9)
**Targets:** trust, and the cost of a mistake.
**Reasoning:** Constraints cannot be inferred from anything. A model has no way
to know that drafts must never be sent. This is the section whose absence is
most expensive and whose presence is cheapest.
**Status:** Reasoned. Task 2 measures it.

### 3.3 · Reference examples (§10)
**Targets:** voice, by showing rather than describing.
**Reasoning:** The highest-signal content in the file. A paragraph somebody
actually wrote carries rhythm, sentence length and vocabulary that no
adjective captures. BS-11 changed this from one required plus one optional to
one question asking for three deliberately different ones, because two
separate asks produced two samples of the same register.
**Status:** Reasoned.
**Open:** still the thinnest section by volume relative to its value.

### 3.4 · Two questions in the file are about the product, not the person
`goal_service` and `goal_want` steer the assist bar and the goal gate. They are
currently the first thing a model reads.
**Status:** Reasoned — recommended for removal from the file while still being
asked. Variant B drops them.

### 3.4b · A question's FRAME beats its hint, every time
**Targets:** whether the baseline is runnable at all.
**Found by:** Adam, 2026-08-31, answering `goal_want` "as naturally as I could":

> *"I would like to be able to point my AI at an email or all my emails from
> this morning and have it tell me which ones are important… I'd like to have
> that be the way I start every day."*

An excellent answer to the question asked, and **unrunnable as a baseline**: no
AI can reach his inbox, so both conditions fail identically and the comparison
measures nothing.

**The finding is not that the answer was wrong.** The hint already said exactly
the right thing — *"one real task from this week beats a wish… pick something
it can actually do"* — and it did not work.

> **CORRECTED 2026-09-02 (D9). The hint was never on screen.**
>
> `showsHint` (panel/surfaces/Flow.tsx) stands a hint down whenever its
> question carries deep-dive chips, so the two do not make the same point
> twice. `goal_want` has two chips. **That hint had never rendered, once, in
> the life of the product** — including on the run this principle was drawn
> from.
>
> So the evidence says the frame beat *nothing*. The principle below may well
> be true, and it is a reasonable thing to expect; it is no longer something
> this log has grounds to assert. It is an open question with a way to settle
> it — see *Settling it* below — and it is written here as one.

**Proposed, not established: when a question's frame and its hint disagree, the
frame wins**, because the frame is what somebody answers.
*"What do you want it to do better"* is a wish frame, and no hint argues a
person out of answering the question they were asked.

**Fixed by reframing rather than by structuring the input.** The question now
asks *"What would you hand your AI right now?"* — an instance rather than an
ambition — and the instruction to type it as they would type it moved into the
hint, where the design system puts instructions.
**Status:** Reasoned. Unmeasured, and the measurement is cheap: the next few
real answers either come back runnable or they do not.
**Would be falsified by:** answers that are still wishes, in which case the
input probably does want structuring — a short form rather than a box — and
this entry becomes Contested rather than quietly rewritten.

### 3.4c · `goal_want` is carrying three jobs
It is the product's motivating question, the assist's goal line, AND the
baseline task. Those want different things from one sentence: motivation likes
ambition, measurement needs an instance. The reframe above bets that an
instance serves all three, because a concrete task motivates fine and an
ambition cannot be run.
**Status:** Reasoned. If 3.4b is falsified, splitting the question — keep the
ambition, ask separately for one runnable task — is the next move, and it costs
a screen at the most expensive moment in the product.

### 3.5 · Nothing resolves two preferences that contradict each other
"As short as possible" and "show your work" can pull against each other and
nothing says which wins, so the model picks — differently on different days,
which reads to the person as the file not working.
**Status:** Reasoned. The only NEW question this analysis recommends.

---

## Part 4 · The voice test — planned, not built

The benchmark measures whether the file is used, obeyed, and not embroidered.
It cannot measure the thing Adam actually wants to claim:

> *"They are sufficiently undetectable from my own work, or they are an
> improvement in the ways that I lack."*

That is two claims and they need different tests.

### 4.1 · Indistinguishability — a blind discrimination test
Collect a set of short pieces the person genuinely wrote. Produce matched
pieces from the same prompts with the file loaded. Shuffle, strip identifying
detail, and ask **someone who knows their writing** to say which is which.

**The measure is how close to chance they land.** Fifty percent means
indistinguishable. Anything reliably above it means the file has a tell, and
the interesting part is *which* pieces gave it away.

**Why a person and not a classifier:** the claim is about being undetectable to
a reader, not to a detector. A colleague opening an email is the population
that matters.

**The honest floor:** this needs real writing from a real person, which makes
it a validation run rather than a standard run. It cannot be published as a
fixture and it should not pretend to be.

### 4.2 · "An improvement in the ways that I lack" — a preference test
The harder and more interesting claim. Same prompts, three outputs: what they
wrote themselves, the model without the file, the model with it. They pick
their preferred, blind, and say why in one line.

**The result worth having is not "with-file wins".** It is the *reason column*:
the places where the with-file answer beat their own are the specific gaps the
file is covering, and those are the sentences that belong in marketing —
because they are the customer's own words about their own work.

### 4.3 · What may be said publicly, and when
- After 4.1: *"In blind testing, readers who know my writing identified the
  AI-assisted version at close to chance."* Only with the number, and only
  after enough samples that the number means something.
- After 4.2: *"Given three versions, I preferred the one written with my
  context file N times out of M — and here is what it did better."*
- **Not before either:** any claim of indistinguishability. It is the most
  attackable sentence in the pitch and the easiest to check.

---

## The log's own rule

An entry moves from **Reasoned** to **Observed** only with a run id, and moves
to **Contested** the moment a run disagrees with it — *before* anybody argues
about why. A design log that only ever accumulates confirmations is a marketing
document wearing a lab coat, and it will be read as one.


---

## Settling "frame beats hint" (D9, Adam, 2026-09-02)

Adam: *"How and where do I validate or report this so that we can lock in the
current experience and decide if we need to modify?"*

### Why there is no instrumented answer

This is a question about what PEOPLE write, and the product cannot measure it.
`docs/GUARDRAILS.md` forbids analytics including local-only counting, and that
is not a rule to route around for a design question. So validation is
observation, by hand, on real answers — which is slower and, for a question
this shape, no less sound: the sample that matters is small, and reading the
actual sentences tells you more than a count would.

### What changed, so it is worth re-asking

Both halves are now as strong as they can be made:

- **The frame** asks what somebody would TELL their AI to do — an order, not a
  wish.
- **The hint** is on screen for the first time, under the box, at question
  size, in three lines, and it lights as they type.
- **The seeds** show eighteen finished imperative prompts before a word is
  typed.

If the frame still beats the hint, it should show as answers that mimic the
FRAME and ignore the three lines. If the hint is now carrying weight, answers
should look like the seeds.

### The capture, and it is four fields

For each real person who answers `goal_want`, with their knowledge, record:

| Field | How to fill it |
|---|---|
| The answer, verbatim | Copy it out of the box before they press Next. |
| **Imperative?** | Does it open with a verb? `asOrder()` in `core/flow/imperative.ts` answers this — if it returns a rewrite, the answer was a wish. |
| **Runnable unattached?** | Could an AI do this with nothing but the sentence? "Draft my weekly update" yes; "summarise these notes" no. |
| **Took a seed?** | Did they click an example, or type from scratch? Visible over their shoulder. |

Nothing here is stored by the product. It is a notebook.

### What settles it

**Twelve answers from people who are not Adam.** Then:

- **10+ imperative and runnable** → the direction works. Lock it, and record
  the principle as *frame and hint together*, which is what was actually
  shipped — the log should not credit the frame alone for a screen that has
  both.
- **6 or fewer** → the frame is doing the work and the hint is not, and the
  original principle stands after all. Next move is option 2 from the
  2026-08-31 options list: verb chips, whose cost was corpus bias and is now
  worth paying.
- **Between** → look at WHICH ones failed. If the wishes cluster on people who
  never scrolled to the hint, it is a layout problem; if they read it and wrote
  a wish anyway, it is a copy problem.

### Where to write it down

Here, as a dated block under this section. Twelve rows and a paragraph. The
point of this log is that decisions are *"understood by normal people… argued
about, disagreed with and improved upon"*, and a principle corrected in public
by its own evidence is the strongest thing in it.

**Not started.** Needs real testers, which is the beta.
