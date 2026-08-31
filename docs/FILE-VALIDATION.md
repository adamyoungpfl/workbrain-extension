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
