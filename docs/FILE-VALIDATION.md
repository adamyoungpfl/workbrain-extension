# Is Context.md the right artefact? — a structural validation

Asked 2026-08-31, before adding or changing any more questions: *"I want to
understand if the structure of the file we are producing is optimal and
defensible as a best practice for optimizing a user's use of AI tools… I want
to be sure I am not optimizing for an output that will not do what I expect it
to do."*

Read against a real file: 182 lines, 7.0 KB, every question answered, generated
from the shipped flow with each text question's own example answer.

---

## First, what "best practice" actually is here

There is no settled standard for a personal context document, and any claim
that there is would be worth distrusting. What exists is convergent
practitioner consensus plus a few findings that are well supported:

- **Explicit instruction beats implicit data.** A model told *"write in this
  voice"* does better than one handed a voice description and left to infer
  the instruction.
- **Position matters.** The beginning and the end of a long context are
  weighted more heavily than the middle. What sits in the middle of a 7KB file
  is doing less work than what sits at either end.
- **Density matters at the margin, not much in the middle.** At 7KB this file
  is nowhere near a context limit. Verbosity costs attention, not room.
- **Declarative beats interrogative.** A fact stated as a fact is less work to
  use than a fact stored as an answer to a question.

Everything below is measured against those four, and each one is named where it
applies so the reasoning can be argued with rather than taken.

---

## What the file already gets right, and should not lose

**1 · The System Grounding Rule is the best thing in it.**

> *"Responsibilities, expertise, and initiative or project membership described
> above establish scope and capability — they are not proof that a specific
> activity occurred in a given time period."*

This closes a real and specific failure mode: a model that reads "owns the
budget" and then answers "you approved the Q3 budget on the 14th" as though it
knew. Most context documents have nothing like it. **Keep it, and move it** —
see below.

**2 · The voice section (§6) is unusually complete.** Directness, formality,
hedging, structure, ask placement, length, and a peeves list. That is the
section with the highest leverage on output quality, and it is the one most
personal-context files skip entirely.

**3 · The never-do list (§9) is a real constraint set**, not a preference.
Constraints are the thing a model most needs stated because it cannot infer
them.

**4 · Semantic numbered sections** are locatable and stable, which matters for
the round trip as much as for the model.

---

## Five structural problems, worst first

### 1 · The file is written as an interview transcript, not as a brief

Every fact is stored as the QUESTION followed by the answer:

```markdown
**What should AI call you?**
Alex
```

Roughly 40% of the file's bytes are interview scaffolding. A model has to strip
the frame before it can use the fact, and the frame is second-person questions
addressed to *it*, which is a slightly strange thing to hand a model as
reference material.

The declarative equivalent is shorter and unambiguous:

```markdown
- **Name:** Alex (Alexandra Chen professionally)
- **Role:** Manages a team that keeps reporting accurate and on time
```

**This is the single highest-value change and it is also the most expensive**,
because the question text is what `core/files/parse.ts` matches on to bring a
file back in. Changing the format means changing the round trip. It is doable —
the labels become keys rather than sentences — but it is a real slice, not a
tweak.

### 2 · The most valuable content is in the least-weighted position

The file opens with **§1 About This Context** — which AI you use, what you want
it to do better *today*, whether this is for work or life. Two of those three
are **product** questions: they drive the assist bar and the goal gate. They
are not facts about the person, and they are sitting in the highest-attention
position in the document.

Meanwhile the behavioural payload — voice (§6), constraints (§9), examples
(§10) — is in the middle and at the end.

**Recommended order**, without changing the interview:

1. A short **directive preamble** (see 3)
2. **Who I am** — name, role, responsibilities
3. **How to write for me** — today's §6, plus §5 rendered as directives
4. **What never to do** — today's §9, plus the System Grounding Rule
5. **My world** — people, initiatives, vocabulary
6. **Reference examples** — last, where recency weighting helps them most

The generator decides section order (`core/files/generate.ts`); the interview
order does not have to match it and arguably should not.

### 3 · The file has no instruction at the top — it is data with no verb

Line 3 is a provenance note ("nothing in this file ever left the browser"),
which is a trust statement for the person and noise for the model. There is no
line telling the AI what to DO with what follows.

A preamble costs nothing to generate — it is authored once, not asked — and it
is the cheapest large improvement available:

> *This file describes how one person works. Use it to match their voice,
> respect their constraints, and skip the context they would otherwise have to
> re-explain. Prefer what is written here over your defaults. Where this file
> is silent, say so rather than inventing a preference.*

That last sentence is doing real work: it converts silence from a gap the model
fills into a gap the model reports.

### 4 · Preferences are stored as adjectives, not as instructions

§5 reads as a column of isolated values:

```markdown
**How much reasoning do you want to see before AI just gives you the answer?**
Just the answer
```

A model can use that, but it has to do the translation. The same fact as a
directive — *"Give the answer without showing the reasoning"* — is what it
needs to end up with anyway.

**This needs no new questions.** The stored answer key already maps to a
sentence; the generator would carry a directive template per option. It is a
generator change, not an interview change.

### 5 · Nothing says what wins when two preferences collide

"As short as possible" (§6) and "Show your work, not just the result" (§9) can
contradict each other. Nothing in the file resolves it, so the model picks, and
it will pick differently on different days — which reads to the person as the
file not working.

**This one probably IS a new question**, and it is the only new question this
review recommends. Something in the register of: *"When being brief and being
thorough pull against each other, which do you want by default?"*

---

## On the questions themselves: add, change, remove

| | Change | Why |
|---|---|---|
| **Add (1)** | A tie-break question — brief vs thorough | The only genuine gap. Nothing resolves conflicting preferences today |
| **Remove from the file** | `goal_service`, `goal_want` | Product questions that steer the assist and the goal gate. Keep asking them; stop printing them. They are the first thing the model reads and they are about us, not the person |
| **Weight up** | `reference_example_primary` | BS-11 already made it ask for three. It is the highest-signal content in the file and still the thinnest section. Consider a second prompt for a *different register* rather than more of the same |
| **Leave alone** | Everything else | The coverage is good. The problem is presentation, not interrogation |

**The headline for planning: this is mostly not a question problem.** Four of
the five findings are `core/files/generate.ts` changes — order, preamble,
directive rendering, section grouping. One is a parser change (declarative
format). Exactly one is a new question.

That is good news for the beta: the interview does not need reopening.

---

## What would actually validate this, and what I cannot

Everything above is a structural argument. It is defensible and I would defend
it, but it is not evidence.

**The product already contains the instrument.** The proof loop runs the same
prompt twice, once with the file and once without, and asks the person to
judge. That is an A/B harness for exactly this question — it is currently
pointed at *"does the file help?"* and could be pointed at *"does version A of
the file help more than version B?"*

The honest ranking of confidence:

1. **High** — the preamble and the reordering will help. These follow directly
   from position and instruction effects and cost almost nothing.
2. **Medium** — declarative format over Q&A. Strong reasoning, real cost, and I
   would want it measured before paying for the parser work.
3. **Untested** — everything about magnitude. I cannot tell you whether this
   file takes an answer from 6/10 to 8/10 or from 6/10 to 6.5/10 without
   running it.

**The cheapest real validation:** generate the file in two shapes, run the same
three prompts through both, and read the outputs side by side. Half a day, and
it turns every "high confidence" above into a fact.

---

# The benchmark — `scripts/bench/`

Built 2026-08-31. Adam: *"Let's start with the comparison apparatus so that we
can establish a baseline to improve from starting from the first test. If there
is no standard, then I will work to establish a standard that other models will
have to measure up to."*

**Scoring page: https://claude.ai/code/artifact/6ae104ff-6d00-46ec-b3b3-abffa673cd91**

```
npx vite-node --config vitest.config.ts scripts/bench/run.ts
```

Writes `store/bench/<stamp>/` — one paste-ready prompt per task × variant, both
variant files, and a manifest.

## What makes it a standard rather than an opinion

**One fixture, many shapes.** Every variant is built from the same synthetic
answers, each text answer being that question's own shipped `ideas[0]`. The
file's structure is the only thing that changes between cells, so a difference
in the scores is attributable to it and to nothing else.

**Synthetic on purpose.** A benchmark run against a real person's file cannot
be published, cannot be re-run by anybody else, and cannot be compared across
models — which is three of the four things a standard has to be.

**Five tasks, fixed for good.** A benchmark whose tasks move is not a
benchmark. Changing one means a new task-set version, never an edit. Each is
pointed at a different section so no single improvement can carry the score,
and each carries a *what a good answer looks like* written before any run — so
the rubric cannot be bent to fit whatever came back.

**Task 5 is the sharpest.** It asks for something the file cannot support
("what did I get done last week?"). The right answer is a refusal. It is the
only direct test of whether the System Grounding Rule does anything, and a
confident narration of last week scores zero.

**A rubric fixed in advance**, five dimensions, 0–3 each: specific to them,
sounds like them, respects the constraints, ready to send, and invents nothing.
The last is a penalty dimension — most rubrics only reward, and a file that
makes a model more fluent AND more confidently wrong is worse than no file.

**Blind, with the sides flipped between tasks** so a habit cannot form.

**Model-agnostic, and that is the point.** The harness calls no AI. It prints
prompts a person pastes anywhere, which measures the FILE rather than a vendor
— and it can be pointed at a model nobody has shipped yet without changing a
line.

**Comparable across runs.** The manifest pins the task-set version, the
fixture's hash and the variant ids. Change any of them and the runs are two
different experiments, which the manifest makes visible rather than silent.

## The guardrail question, answered

`docs/GUARDRAILS.md` says the product makes no AI calls and never transmits the
person's content. Nothing here touches the extension: it lives in `scripts/`,
ships in nothing, calls nothing, and the content it prints is a synthetic
fixture rather than anybody's file.

## Run 001

Variant A (as it ships) is 5,676 bytes; variant B (instructed and reordered) is
5,585 — B is *smaller* despite gaining a preamble, because dropping the two
product questions costs more than the preamble adds.

**Nothing has been run yet.** The apparatus exists; the baseline is the first
thing it produces.

## A flaw the apparatus found in variant B, before a single run

Verifying the pack end to end turned up something the argument had missed:
**two things want the last position.**

`FILE-VALIDATION.md` §2 argues the reference examples should go last, where
recency weighting helps them most. That is probably right. But putting them
there displaces the **System Grounding Rule** from the end of the file — where
it has always sat — into the middle, position six of ten.

The grounding rule is the one instruction in the file whose whole job is to
survive being read. Moving it to the least-weighted position to make room for
the examples may cost exactly the thing task 5 measures.

**So watch task 5.** If B wins elsewhere and loses there, that is the cause,
and the follow-up is a **variant C**: everything B does, except the grounding
rule stays last. That is a one-line change to `ORDER` in `variants.ts` and it
isolates the question cleanly.

This is what the harness is for. The argument in this document did not catch
it; building the thing the argument implied did.

## On who runs it

**Not me, and the reason is the point of the whole exercise.** I wrote variant
B and I wrote the rubric. A model that knows the hypothesis is not a clean
subject, and reporting its own outputs as the first data point would be
advocacy with a number attached.

The first run wants a model that has never seen this conversation. The scoring
page has a **Copy this prompt** button on every cell, so a run is: copy, paste
into the AI, paste the answer back, score. Ten cells, roughly ten minutes.

If a second subject is wanted afterwards, running the identical pack through a
different model is free and is the cheapest way to learn whether a result is
about the FILE or about one vendor's habits.

---

# Task set v2 — the partial-retrievability case, and running it for real

Adam, 2026-08-31, two things at once.

## 1 · The failure mode task 5 could not see

> *"If I ask a question that is 90% on target with context but I slip in a
> reference to wanting to know 'how many clowns will be in the circus car' —
> which is not relevant and would not be able to be backed by any of my data —
> that should come back as data that cannot be retrieved."*

Task 5 tests a **flat** refusal: a question the file cannot support at all. That
is the easy case, and it is easy precisely because a refusal is conspicuous.

The dangerous case is a request that is mostly answerable with one thread that
is not — because everything around the invention is correct, so nothing looks
wrong. It is also the ordinary case: most real prompts are mostly-answerable.

**Task 6** is that, and it is now the sharpest thing in the set:

> *"Draft a short note to my manager covering where the migration stands, what
> is at risk, and how many people from the vendor are joining Thursday's
> call."*

The first two come from the file. The third is nowhere in it.

**The scoring rule that makes it work:** answering the answerable parts is not
enough. The unanswerable part must be NAMED. **Silence about it scores the same
as inventing it**, because to the person reading the answer the two are
indistinguishable — and a gap nobody mentioned is the one a person acts on.

The rubric gains a sixth dimension for it, *"Names what it cannot answer"*, and
a run is now scored out of 90.

## 2 · The instruction had to be strengthened to match

The preamble said only *"where this file is silent, say so rather than
inventing a preference"* — which covers preferences and does not reach the
partial case at all. It now says three things it did not:

> **Answer only what this file supports.** Where it is silent, say so plainly
> rather than inventing a preference, a fact, a number or a name.
>
> **If part of a request cannot be answered from this file, answer the rest and
> name the part you could not.** Do not quietly leave it out — an answer with a
> gap nobody mentioned is indistinguishable from an answer that made something
> up. Saying "this file does not tell me that" is always the better answer.

This is the principle Adam named, written as an instruction the model can
follow rather than as a property we hope it has.

## 3 · Running it against a real file

> *"I need to do this with a real example that I can actually validate. The
> prompt is just for dummy data and so the details are all generated."*

Correct, and it does not undo the case for the fixture. They measure different
things and a standard needs both:

| | Fixture run | Validation run |
|---|---|---|
| **Measures** | the file's STRUCTURE | whether it works for a real person |
| **Publishable** | yes | no |
| **Comparable across models** | yes | no |
| **Can score "invents nothing" honestly** | **no** | yes |

That last row is the whole of Adam's point. **A synthetic file makes
fabrication invisible**, because every detail in it was invented to begin with
— there is no way to tell a true statement from a false one about a person who
does not exist. Only a reader who knows the truth can score that dimension, and
task 6 is the one that needs it most.

```
WB_BENCH_FILE=~/Downloads/Context.md WB_BENCH_STAMP=mine-001 \
  npx vite-node --config vitest.config.ts scripts/bench/run.ts
```

Writes to `store/bench/private/`, which is **git-ignored** — a personal context
file is exactly the thing this product exists to keep off other people's
machines, and that has to be true of our own tooling first.
