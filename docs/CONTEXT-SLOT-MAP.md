# The slot map — every value an optimal file holds, and the question that fills it

Adam, 2026-09-12: "Create the list of categories and values that need to be
included in an example optimal context file and skills file. Then create a
list of the questions that would need to be asked by a regular person…
suggested minimum and maximum character counts… Bonus if we can use a single
question/prompt to answer multiple info slots… list the suggested and
alternative collection methods."

This is the bridge between `docs/ELITE-FILE-SPIKE.md` (which defines *what
Good and Great mean*) and the interview-builder work (which has to *ask for
it*). Rows are in **ask order**. The Status column grades each slot against
what the shipped flow asks today — that is the "missing or misformed" list
Adam wanted to fall out of this.

**How to read the character counts.** MIN is the floor below which the value
stops being useful to a model (a two-word answer to "what do you do" cannot
ground anything). MAX is where the value starts costing more attention than
it returns — the curation rung, enforced at the question rather than
apologised for later. They are targets for guidance copy and soft warnings,
never hard validation: a person who needs 900 characters gets 900.

**Collection method legend.** `text` short field · `long` multiline ·
`chips` pick-many from options + "something else" · `scale` 3–5 point choice
· `pairs` term → meaning rows · `record` repeatable structured block ·
`paste` specimen pasted whole · `handoff` composed prompt run in their own
AI, pasted back · `derive` computed from other answers, never asked ·
`stamp` automatic (date, id).

---

## Part 1 · Context.md — the seven elements, slot by slot

### A · Orientation (asked once, shapes everything after)

| # | Slot | The question, as a person would be asked it | Min–Max chars | Method (alt) | Status today |
|---|---|---|---|---|---|
| A1 | Scope | "Are we building this for your work, your personal life, or both?" | n/a (choice) | chips (—) | **Keep** — `context_scope` exists and drives later phrasing. |
| A2 | The pain | "What do you find yourself explaining over and over?" | 40–200 | text (chips of common answers) | **Keep** — `stop_explaining`. Doubles as a motivation anchor the ladder can reference later. |

### B · Identity & scope (element 1)

| # | Slot | Question | Min–Max | Method (alt) | Status |
|---|---|---|---|---|---|
| B1 | Preferred name | "What should AI call you?" | 2–40 | text (—) | **Keep** — `preferred_name`. |
| B2 | Professional name | "Do you use a different name professionally?" | 0–60 | text (—) | **Keep** — `professional_name`, correctly optional. |
| B3 | What you do | "How would you describe what you do?" | 80–400 | long (handoff: tighten my answer) | **Keep** — `self_description`. Add the polish hand-off for thin writers (spike red team #4). |
| B4 | Roles | "What are your roles — the ones distinct enough that AI should know about each separately?" | 3–60 each | record (chips seed) | **Keep** — `roles` + per-role record. |
| B5 | Role mandate | "In a sentence or two, what are you there to accomplish?" | 60–300 | long (—) | **Keep** — `role_mandate`. |
| B6 | Role standing / durability | "Is this primary, secondary, or occasional?" · "Current, or past-but-useful?" | n/a | scale (—) | **Keep** — feeds freshness. |
| B7 | Owned responsibilities | "What are you personally responsible for?" | 60–500 | long (chips by role type) | **Keep** — `responsibilities`. |
| B8 | Contributed, not owned | "What work do you contribute to but do not own?" | 40–300 | long (—) | **Keep** — `contribution_boundaries`. Rare and valuable; most files never state it. |
| B9 | Negative responsibility | "What do people assume is yours but isn't?" | 40–300 | long (—) | **Keep** — `negative_responsibility`. |
| B10 | Decision rights | "What kinds of decisions can you make yourself?" | 60–400 | long (chips: alone / with a nod / needs approval) | **Keep** — `decision_rights`. |
| B11 | Expertise | "What do people come to you for?" | 40–300 | long (—) | **Keep** — `expertise`. |

### C · My world (element 3)

| # | Slot | Question | Min–Max | Method (alt) | Status |
|---|---|---|---|---|---|
| C1 | Entities — name | "What's their name — or its name, if this is a tool or team?" | 2–60 | record (—) | **Keep** — `entity_name`. |
| C2 | Entity type | "What kind of thing is this?" | n/a | chips (—) | **Keep** — `entity_type`. |
| C3 | Why it matters | "In a sentence, why does AI need to know about this?" | 40–200 | text (—) | **Keep** — `entity_relevance`. |
| C4 | Aliases | "Any other names, nicknames or shorthand this goes by?" | 0–120 | text (—) | **Keep** — `entity_aliases`; directly serves the "uses your names" test. |
| C5 | **Systems of record** | **"Where does the real answer live — which system do you check when you need the truth?"** | 40–250 | chips + text (—) | **MISSING.** The flow captures entities but never where data lives. Good 2 and every Actions derivation need it. |

### D · Names (element 4)

| # | Slot | Question | Min–Max | Method (alt) | Status |
|---|---|---|---|---|---|
| D1 | Load-bearing terms | "What terms, tools or shorthand does your work depend on that an outsider would get wrong?" | 60–600 | **pairs** (long, today) | **MISFORMED.** Asked as one prose blob (`terms_depend_on`). A model uses term→meaning pairs far better, and pairs let the file print a glossary. Same question, new answer type. |
| D2 | Banned words | "Are there words or phrases you never want to see in your own writing?" | 0–200 | chips + text (—) | **Keep** — `never_words`. |

### E · Audiences (element 2)

| # | Slot | Question | Min–Max | Method (alt) | Status |
|---|---|---|---|---|---|
| E1 | Audience name | "Who do you write to regularly?" | 3–40 each | record (chips seed) | **MISFORMED.** `audiences_list` is a flat list. |
| E2 | What they expect | "What does this one expect from you that the others don't?" | 40–250 | long (—) | **MISSING** as a per-audience field; only the flat `audience_variance` exists. |
| E3 | What they already know | "What can you assume they already know — what would be condescending to explain?" | 40–250 | long (—) | **MISSING.** This is the single most useful audience field and no flow asks it. |

### F · Settled decisions & standards (element 5)

| # | Slot | Question | Min–Max | Method (alt) | Status |
|---|---|---|---|---|---|
| F1 | Standards | "What would you actually send a draft back over?" | 60–500 | long (chips) | **Keep** — `standards_list`; excellent phrasing, keep verbatim. |
| F2 | Guardrails | "What should AI never do without asking you first?" | 40–400 | chips + text (—) | **Keep** — `guardrails_list`. |
| F3 | Peeves | "What makes you rewrite something on sight?" | 40–300 | long (—) | **Keep** — `peeves`. |
| F4 | **Settled decisions** | **"What's already been decided that you don't want reopened — a tool, a format, a way of doing it that's final?"** | 60–400 | long (—) | **MISSING.** The paper's §7 names Decisions a first-class artifact; the flow has standards and guardrails but never "this is settled." Highest-half-life content in the file. |
| F5 | **Redaction stance** | **"Is there anything about your work you can't put in writing here — client names, case details, anything under policy?"** | 0–300 | chips + text (—) | **MISSING.** The regulated-worker fix (spike red team #6). Also the honest place to teach placeholders. |
| F6 | **Boundaries / what's out** | **"What should this file deliberately stay out of?"** | 0–250 | long (—) | **MISSING.** Great 4 — curation stated by the person, not inferred. |

### G · Trajectory (element 6)

| # | Slot | Question | Min–Max | Method (alt) | Status |
|---|---|---|---|---|---|
| G1 | Initiative name | "What's this initiative called?" | 3–60 | record (—) | **Keep**. |
| G2 | What & why | "In a couple sentences, what is this and why does it matter?" | 80–400 | long (—) | **Keep**. |
| G3 | Status | "Where does this stand right now?" | n/a | chips (—) | **Keep** — feeds freshness. |
| G4 | Success | "What does success look like for this?" | 60–300 | long (—) | **Keep**. |
| G5 | Constraints | "Any constraints AI should know — budget, timeline, dependencies, risks?" | 0–400 | long (—) | **Keep**. |
| G6 | Out of scope | "Anything explicitly out of scope that people keep assuming is included?" | 0–250 | long (—) | **Keep**. |
| G7 | **Target state** | **"What are you working toward that isn't true yet — a role, a certification, a kind of work you want more of?"** | 40–300 | long (chips by scope) | **MISSING, and it is the civic blocker.** A present-tense file writes retail-shaped cover letters for someone aiming at bookkeeping (spike red team #2). |
| G8 | **The gap** | **"What's between you and that — what would you need to show or learn?"** | 40–300 | long (—) | **MISSING.** Turns the target into something a tool can actually help with. |

### H · Exemplars (element 7)

| # | Slot | Question | Min–Max | Method (alt) | Status |
|---|---|---|---|---|---|
| H1 | Primary specimen | "Paste something you wrote that you were proud of." | 400–4000 | **paste** (upload · handoff) | **Keep** — `reference_example_primary`. |
| H2 | Why it's good | "What makes this one good — what would you lose if someone 'improved' it?" | 40–250 | long (—) | **MISSING.** A specimen without its why teaches imitation, not judgment. |
| H3 | Second specimen | "Want to add a second, from a different context?" | 0–4000 | paste (—) | **Keep** — `reference_example_second`. |
| H4 | **Anti-specimen** | **"Paste something that came back wrong — a draft you had to rewrite."** | 0–2000 | paste (—) | **MISSING, high value.** What to avoid is learned faster from one bad example than from ten adjectives. |

### I · Voice (the self-report block — flagged as a family)

| # | Slot | Question | Min–Max | Method | Status |
|---|---|---|---|---|---|
| I1–I7 | Directness · formality · hedging · structure · ask placement · length · thinking style | "How direct should AI default to…" etc. | n/a | scale | **MISFORMED as a family.** Seven self-report scales where H1/H4 specimens would do the job better (spike red team #5: people describe the writer they wish they were). **Recommendation:** keep 2 (length, directness) as quick calibrators, derive the rest from the specimens, and ask the remaining ones only if no specimen was pasted. |

### J · Structural (never asked)

| # | Slot | Source | Status |
|---|---|---|---|
| J1 | Grounding rule | Constant, printed into every file | **Built** (pass 5w, with the self-defence pair). |
| J2 | Per-claim date | `stamp` on every answer | **Built.** |
| J3 | Brain (which life) | Chosen by being in that Brain — never a question | **Decided** (`docs/FACET-DECISION.md`). |

---

## Part 2 · Skills.md — the spine, slot by slot

Ask order matters more here than anywhere else: **Objective first** (spike
§3), because a person who has said what good looks like writes sharper steps.

| # | Slot | Question | Min–Max | Method (alt) | Status |
|---|---|---|---|---|---|
| S1 | Name | "What do you call this job when you ask for it?" | 3–60 | text (—) | **Keep** — `skill_name`. |
| S2 | **Objective** | **"When this goes well, what does the finished thing let you do?"** | 60–300 | long (—) | **MISSING — the single biggest gap in the product.** Nothing can be scored without it; the Grounds literally cannot grade a skill that has none. |
| S3 | Trigger | "What sets this off — a day, an event, a request?" | 20–160 | chips + text (—) | **MISFORMED for variety workers.** Offer situation triggers ("when a new offer lands"), not just calendar ones (red team #7). |
| S4 | Inputs | "What do you need in front of you before you can start?" | 20–300 | chips + text (—) | **Keep** — `skill_inputs`. |
| S5 | Tools / systems | "Where does that come from, and where does the result go?" | 20–300 | chips + text (—) | **Keep** — `skill_tools`; feeds the Actions derivation. |
| S6 | **Method — steps** | "Walk me through it the way you'd tell a new coworker." | 120–1500 | long (handoff: turn my rough notes into steps) | **Keep** — `skill_steps`, but add the hand-off alternative. |
| S7 | **Method — principles** | **"What do you weigh when you decide? What lines won't you cross?"** | 120–800 | long (—) | **MISSING.** Judgment work has no steps; without this, caregivers, advisers and gig workers can't write a skill at all (red team #3b, #7). One chip picks which style. |
| S8 | Output | "What shape does the finished thing take?" | 20–200 | chips + text (—) | **Keep** — `skill_output`. |
| S9 | **Checks** | **"How do you know it's right before you send it? What usually goes wrong?"** | 40–400 | long (—) | **MISSING.** This is the Evaluation artifact from the paper's §7, and the thing that makes a proof honest. |
| S10 | **Example** | **"Paste one good finished one."** | 0–3000 | paste (—) | **MISSING (optional, elite).** The paraphrase-stability anchor. |
| S11 | Autonomy | "Would you want this to run without you?" | n/a | chips (—) | **Keep** — `skill_autonomy`, already V2.2's decision. |
| S12 | Owner / data | who runs it · what it touches | 0–120 | chips (—) | **Keep** — feeds Actions. |

---

## Part 3 · The bonus — one question, several slots

Each of these is one thing a person answers and several slots the file
fills. They are the highest-leverage questions in the interview and should
be treated as such in the builder work.

| The one question | Slots it fills | How |
|---|---|---|
| **"Paste something you wrote that you were proud of."** | H1 exemplar · I1–I7 voice family · D1 names (terms in use) · E-hints (who it was written to) | Specimen-first: derive the voice scales and harvest candidate terms, then **confirm** rather than ask. Biggest single reduction in question count available. |
| **"Paste something that came back wrong."** | H4 anti-specimen · F3 peeves · F1 standards | The rewrite reflex is easier to show than to describe. |
| **"What do you find yourself explaining over and over?"** | A2 pain · B7 responsibilities (hints) · D1 terms (hints) · first skill candidate | Already asked; currently harvested for none of the downstream slots. |
| **"Walk me through it the way you'd tell a new coworker."** | S6 steps · S4 inputs · S5 tools · S8 output | Parse the narration for nouns and offer them back as confirmable chips. |
| **"What's already been decided that you don't want reopened?"** | F4 settled decisions · F2 guardrails (hints) · G5 constraints (hints) | One answer, three sections. |
| **"What are you working toward that isn't true yet?"** | G7 target · G8 gap · B3 self-description (tense check) | Also flips the file from past-tense to forward-leaning for job seekers. |
| **The memory extraction hand-off** (`handoff`) | B1–B3 · D1 · I-family · E1 — as **drafts only** | Seeds the file from what their AI already believes, every field marked machine-inferred and requiring confirmation (pass 5y/5z: free seed, paid audit). |

---

## Part 4 · What this says about the current flows

**Add these eleven (ordered by value):** S2 Objective · G7 Target state ·
E3 What they already know · S9 Checks · F4 Settled decisions · C5 Systems of
record · S7 Principles method · H2 Why it's good · F5 Redaction stance ·
H4 Anti-specimen · G8 The gap.

**Reshape these four:** D1 terms → pairs · E1–E2 audiences → records ·
S3 trigger → situations as well as calendar · I1–I7 voice → derive from
specimen, ask only as fallback.

**Keep verbatim — these are the flow's best work:** "What would you actually
send a draft back over?", "What do people assume is your responsibility but
isn't?", "What should AI never do without asking you first?", "Paste
something you wrote that you were proud of."

**Net effect on length.** Eleven added, seven made conditional (the voice
family minus two), four reshaped without adding count. The interview gets
*shorter* for anyone who pastes a specimen, and longer only for people who
skip it — which is the right incentive.
