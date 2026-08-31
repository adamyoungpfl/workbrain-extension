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
