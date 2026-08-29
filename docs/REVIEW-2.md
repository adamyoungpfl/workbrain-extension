# Adam's second review — sorted, flagged, specced

From the in-place copy review, 2026-08-28. Twenty-odd notes, sorted into what
they actually are: eight are words, six are small visual work, three are real
features, and one is a choreography piece that depends on two of the others.

Task ids are `R-01` … `R-13`. House rules unchanged: vertical slices, every
slice behind a full `npm run check`, one commit per slice, new copy `[DRAFT]`.

## The four decisions taken before building

| # | Question | Adam's answer |
|---|---|---|
| D1 | What fills `Current: [ ]` on the Context card | **The section you're in** — "Current: My World" |
| D2 | Which control is "the recentering button" | **`BrainTurnCue`** — "Drag the brain to turn it", the tip that appears over the stage and retires itself |
| D3 | What "energy" means on the orbs | **Glow + slow pulse on started.** Complete glows steadily, started breathes, untouched is dim. Pulse stops under reduced motion; the glow stays |
| D4 | How literal the file-page → interview transition is | **A real morph** — the brain and list visibly shrink into the collapsed drawer |

---

## Slice one — the words (R-01, R-02)

### R-01 · Home's rows and tags

| Where | Was | Now |
|---|---|---|
| under `proofCta` | (old sub) | Grab your file and find out right now if context matters! |
| next-move row | Run a Skill For Real | **Skill Training** |
| its sub | (old) | Try and refine your skills. Unlocks automatically with your 2nd skill. |
| Certified sub | Built and tested by Model Citizen | Skills that make us all stronger, built and tested by Model Citizen. |
| Workbrain+ tag | Real help every month, from us | Your personal technology implementation manager. Maximizing your workbrain with your purpose and intent |
| `makeUpName` | Give me something....bold! | **Give me something…bolder!!** (supersedes this morning's) |

### R-02 · The feedback sheet leads with the honest ask

Adam: *"Swap on the text. Make it four lines and adjust the input areas to
accommodate. I want to push people to be honest. I don't need or want the
praise, I need the problems as clearly stated as they can."*

- His line becomes the sheet's **lead**, not its body — the swap he asked for.
- The lead is allowed **four lines** at 400px, and the textarea gives up the
  height rather than the sheet growing a scroll.
- The body under it stops being polite. `[DRAFT]`, for his pass.

**Flagged:** "no praise" is a real instruction and a copy rule at once. The
body should ask for the problem, not for a rating — and it must still not
blame the person for having one (`design-system.html` §08: errors never blame).

---

## Slice two — small visual (R-03 … R-06)

### R-03 · The collapsed drawer sits a hair low
Adam: *"add just a little padding below the status and the logo label. Just a
bit more padding will make it look centered."* Padding **below**, so the pair
rises inside the band it already has. No geometry constant moves —
`DRAWER_REST_HEIGHT` and the peek's arithmetic are untouched, which is what
keeps this out of the fifteen specs that measure the drawer.

### R-04 · Inputs get depth
A subtle **inset** shadow on text inputs, weighted to the **top and right**.
One rule, on the shared field style, so every input in the product gets it at
once and none of them can drift. Must not change the box's height — the flow's
two-zone arithmetic is measured against it.

### R-05 · The step cue stops rotating
Adam: *"Drop the rotating Current / Next above the progress bar. Just keep it
locked to Current and that should be the same color as the same status on the
Context card below."*

This lands on top of this morning's build, and takes half of it back out. What
stays: `core/home/stepCue.ts` (the fold still says which step is current), the
`spoken` sentence for assistive tech, and the reduced-motion path — which is
now the *only* path. What goes: the second half, the keyframes, and the pair.

**The colour is the point.** "Current" on the meter and "Current" on the card
below become one colour, so the two are visibly the same claim.

### R-06 · The turn cue is anchored, not popped
D2. `BrainTurnCue` currently appears over the stage and retires itself on three
different conditions. Adam: *"Let's just anchor it in the corner. It pops up
and disappears right now and it doesn't look great."*

Anchored in the stage's corner, one position, no arrival animation. It still
retires — a tip nobody needs forever is still a tip — but it stops *moving*.

---

## Slice three — the brain's states (R-07, R-13)

### R-07 · Orbs and sub-nodes say what they are
D3. Three states, and the fold for them **already exists**:
`core/globe/illumination.ts` has separated *active* (anything in it) from
*complete* since V1.5 VB-25, and it is what drives edge brightness today. What
is missing is the ORB reading it.

| State | Orb | Sub-node |
|---|---|---|
| untouched | dim, no halo | dim, no halo |
| started | halo + **slow pulse** (~4s) | halo + pulse, smaller |
| complete | brighter steady halo | steady halo |

**Never colour alone** (`GUARDRAILS.md`): the halo is a size and a brightness
change as well as a hue, and `nodeChipFor` already puts a word or a count on
the node. Under `prefers-reduced-motion` the pulse stops and the glow stays —
the three states are still told apart, which is what the guardrail requires of
a still equivalent.

### R-13 · Which questions are done, when you explore ahead
Adam: *"If people can explore nodes that are not yet complete in the interview
flow, they will need a way to know which questions are complete and which are
not."*

The leaf card is where this belongs — it already lists what a section holds.
Per-question done/not-done marks on that list, from the same `answered` fold
`jumpTargets` uses. **Not started tonight**; specced so it is not re-derived.

---

## Slice four — Home's cornerstones (R-08)

Adam: *"give it some depth like it is raised off the screen a bit and some kind
of glow or outline to make it pop… Make the skills file also have a raised but
still dormant look so these stand out as the subtle cornerstones of the app."*

- **Context, active**: raised (a real shadow, not a border), plus a glow or
  outline in the file's own accent.
- **Skills, dormant**: the same raise, none of the glow. Present, not calling.
- **Status**: `Current` becomes `Current: [the section you're in]` (D1), and it
  **blinks above** the card.

**Flagged — the blink.** A hard on/off blink fails WCAG 2.2.2 and reads as an
error state. Building it as a **slow pulse** (opacity 1 → 0.55 over ~2.5s),
stopped entirely under `prefers-reduced-motion`, which keeps the attention Adam
wants without the failure mode. Say the word if you want it harder.

---

## Slice five — the command cluster (R-09)

Adam: *"a tighter, neater cluster for the next/skip and prompt/ai assist
buttons… a polished set of buttons in a command cluster that contains the
buttons required for that question… considerate of users' vanishing attention
span and a need to keep them actively moving."*

**This is the highest-risk area in the codebase and the estimate should say
so.** The cluster is governed by VB-17's composed-cluster law, VB-41's
clearance, the nav melt's travel arithmetic (`core/flow/navMelt.ts`), the
paint/press split, and `core/flow/dock.ts`'s constants — and roughly thirty
tests assert numbers that come out of those. BS-05b changed the *fill* of one
button in that cluster and cost a full day, most of it spent on two bugs that
were not in the cluster at all.

So R-09 is specced as **one slice on its own, with its own gate**, and it does
not share a commit with anything else.

What it is, concretely: the four controls a question can offer (Back, Next,
Skip, and the assist pair) drawn as one bounded group rather than four things
that happen to be near each other — a shared ground, one radius, the primary
carrying the fill it already has, the quiet ones reading as quiet *inside* the
group rather than as loose words beside it.

---

## Slice six — the dark file page, and the way in (R-10, R-11, R-12)

These three are one story and R-12 needs the other two first.

### R-10 · The file home page goes dark
Adam: *"We make the whole panel the dark color of the lower display panel for
the interview. It has the dark background already which means no rework on the
visual or geometry or colors. The list below inherits the same color palette
and fonts and design as the list view."*

He is right that the globe needs no rework — it is drawn on the dock's own
ground already. **The list is the work**, and so is every contrast measurement
on that surface: the e2e suites measure real pixels against real grounds, so a
surface that changes ground re-measures. That is the honest estimate, not the
palette swap.

### R-11 · "Start Interview" / "Resume Interview", and the button row
- The `Edit the file` door becomes **Start Interview**, or **Resume Interview**
  when any answer is stored for that file.
- The row becomes **`back | start/resume | download`**.
- **Download is dormant until there is something to download** — Adam: *"which
  I think has to at least be a name."*

**Flagged:** taking `preferred_name` as that name, since it is the first real
question in the flow and the one the rest of the product personalises from. It
is also already the thing `nameGenerator` exists to fill. Confirm if you meant
a different one.

**The sweep:** `Edit the file` is clicked by name in **58 e2e spec files**.
Mechanical, but it is the largest single test edit in the project's history and
it belongs in its own commit.

### R-12 · The morph
D4. The page's brain and list visibly shrink and settle into the collapsed
drawer as the question screen arrives — so the interview's panel is legibly the
same object as the page they just left.

Depends on R-10 (the thing that morphs must already be dark) and R-11 (the
control that triggers it). Needs a **still fallback** that carries the same
meaning under `prefers-reduced-motion`, per the guardrail — most likely the
question screen arriving with the drawer already collapsed, which is today's
behaviour, so the fallback is free.

---

---

## Backlog, for tomorrow (R-14, R-15)

Adam, 2026-08-29. Not tonight's work; recorded here so it is not re-derived.

### R-14 — MEASURED (2026-08-29). Two of the three worries are already answered.

`scripts/canvas-census.mjs` drives the real built extension through all 34
top-level questions, at both ends of the drawer's drag, via BS-05f's Jump
sheet. `store/canvas/census.json` holds every number. What it found changes
what the concepts should be about.

**The letter size is already constant.** 22px on every question, at both drawer
ends, all 34. There is no type-size inconsistency to fix — `TypedHeading` has
one size and always has.

**The rephrase control is already in one place.** 54px from the top of the
panel, on every question that has one, at both ends. My own spec said it
"rides the question row and therefore moves down the screen as the question
grows" — that was wrong, and `.flow-q-row`'s `align-items: flex-start` is why:
the control pins to the TOP of the row, so a taller question grows underneath
it rather than pushing it down.

**The real inconsistency is that it is not always there.** 27 of 34 questions
have a rephrase control; **7 do not** — `preferred_name`, `professional_name`,
`goal_service`, `goal_want`, `audience_variance`, and both gates. A control
that is in the same place every time but present only four times in five is
harder to learn than one that moves, because the thing being learned is
whether to look at all.

**What DOES vary, hugely, is the question's height.** 28px to 165px — 1 to 6
visual lines, a six-fold swing:

| lines | questions |
|---|---|
| 1 | 2 |
| 2 | 16 |
| 3 | 11 |
| 4 | 2 |
| 5 | 2 |
| 6 | 1 |

Two thirds sit at two or three lines. The tail is what breaks the rhythm:
`initiatives_gate` (6 lines, 30 words), `entities_gate` (5), `risk_tolerance`
(5), `role_names` (4).

**And the tail costs the answer its room.** At the drawer's ceiling the answer
area collapses to **44px** on both gates — the accessibility floor exactly,
with nothing to spare. The same two questions that break the visual rhythm are
the two that put the layout at its limit.

**So the brief re-aims.** "Consistency of letter sizes" is done. "Consistency
of finding the rephrase button" is a question about PRESENCE, not position.
The template's real job is the one Adam named third and probably felt first:
*"big changes in text size and text length will create fall off"* — it is the
LENGTH, and it is four or five questions doing most of the damage.

### R-14 — FOUR CONCEPTS, drawn (2026-08-29)

**https://claude.ai/code/artifact/696970ca-65d2-41a4-9b8d-5b4e14d24c8b**

Four directions at real 400px size against the real questions, with a switcher
so each one can be watched meeting the thirty-word case. None of them is about
letter sizes, because the census says that problem does not exist — each is an
answer to LENGTH, and each pays for it somewhere different.

| # | Direction | Its bet | What it costs |
|---|---|---|---|
| 1 | **The Fixed Stage** | One box of fixed height; the type steps down to fit | Two questions still will not fit at 18px; the air above a five-word question has to be designed |
| 2 | **The Conversation** | The question is a spoken turn, not a heading — variance stops being a defect when the form is meant to vary | A bubble at 400px eats width to its own padding; the narrator becomes load-bearing |
| 3 | **Type as the Art** | Size is a function of word count — constant area, varying voice | It breaks the one thing that IS consistent today; three sizes in a row may read as instability |
| 4 | **The Headline** | Every screen is one bold line of eight words, the full wording quieter beneath | Thirty-four headlines have to be written and be right |

Each states what it KEEPS, because the brief was explicit that this must not
redo what already works: all four leave the two-zone layout, the cluster, the
drawer and the narrator alone. Concepts 1 and 2 are re-skins of the question
zone; 3 is a type rule; 4 is a content change wearing a type change.

**Every one of them puts the rephrase control on all thirty-four screens**,
which is the census's real finding about it. Concept 4 is the only one that
makes the seven absences visible as a design problem rather than hiding them
as an absence.

`scripts/canvas-concepts.py` builds the page from `store/script/questions.json`
and `store/canvas/census.json`, so the concepts cannot drift from the flow they
are drawn against.

### R-14 · A design pattern for the interview canvas

> *"My focus is on the consistency of the letter sizes and the consistency of
> finding and hitting the rephrase button… Big changes in text size and text
> length will create fall off. To balance the space, I want to take a pass at a
> strong, bold, engaging design template that feels a bit like art and
> conversation… concepts to consider that don't redo what is done, which is
> very good. If I had unlimited time and money and talent, what would I do that
> would make this stronger, more engaging, more successful."*

Two halves, and they want different work:

**The consistency half is measurable and should be measured first.** The
question is the one element on that screen whose size is not fixed — `TypedHeading`
prints whatever the flow gives it, and the flow's questions run from four words
to thirty. A census of rendered question height and type size across all 55
questions, at both drawer ends, is the input to any template. So is the
rephrase control's position, which today rides the question row and therefore
moves down the screen as the question grows — which is exactly the "consistency
of finding and hitting it" Adam is naming.

**The concepts half is a design exercise, not a build.** Three or four
directions, drawn at real size against real questions, as an interactive
artifact he can manipulate — the standing pattern
(`feedback_design_review_via_artifacts`). The brief is explicitly *not* to redo
what works, so each concept states what it keeps.

### R-15 · The question-by-question script document

> *"an interactive document that gives me each question and its rephrases so I
> can edit them. For the same document, I need to see the current script for
> audio for that page question as well. I want to be able to walk through it in
> sequence and see the step, the kind of response it requires, think through my
> answer, and consider what changes I want to make to visual or audible content
> or cues."*

The same machinery as BR-01's in-place review, on a different axis: sequence
rather than surface. Per question, in flow order — the question as asked, every
rephrasing, the narrator's script for that screen, the answer KIND (what shape
of response it wants), its hint and deep-dives, and a box to write in. The
walk-through is the point, so it wants prev/next as well as a list.

**What has to be dug out:** the narrator's script per screen is assembled at
render time rather than authored in one place (`src/panel/voice/`), so the
document needs a fold that says what would be spoken for a given position —
which is worth building anyway, because right now nothing can answer "what does
this screen say out loud" without running it.

---

---

## Two things the build turned up, for the next pass

**The globe's labels crowd each other.** Visible in `store/copy/11-drawer-brain.png`:
"MY VOICE", "VOCABULARY", "AUDIENCES", "EXAMPLES" and "GUARDRAILS" overlap one
another and the chips beside them at the resting stage size. Pre-existing —
R-07 only made it easier to see, because a glow draws the eye to a node whose
name is half under its neighbour's. It belongs with R-14's canvas pass, since
the fix is a layout rule and not a per-label nudge.

**The glow may want to be stronger.** At 208px the difference between started
and complete reads, but it reads quietly. The spread and opacity are two
numbers in `BrainGlobe.css` and the state fold does not change — say louder and
it is a one-line move.

---

## What fits tonight

**R-01 → R-06**, as two commits: the words, then the small visual. Every one of
them is bounded, none touches the cluster or the dock's arithmetic, and R-05
mostly *removes* code written this morning.

R-07 and R-08 next if the gate is quick. R-09 through R-13 are specced above
and want their own sessions — R-09 because of what it sits on, R-10/11/12
because they are one story that is not worth starting at the end of a day.


---

# R-16 · Concept 2, the Conversation — chosen, and what it costs

Adam, 2026-08-29: *"Let's go with 2 and call out any compromises we need to
consider to keep the flow solid. If we need to consider removing the rephrase
to simplify the flow and design, that is acceptable. Rephrase is nice to have,
not have to have."*

## The measurement that decides the rephrase question

A bubble is not free horizontally, and at 400px horizontal room is the whole
game. From `store/canvas/census.json`, the question's measured width today:

| | measure |
|---|---|
| a question WITH a rephrase control | **292px** |
| a question WITHOUT one (7 of 34) | **348px** |

So the rephrase control already costs the question **56px of measure** — it is
a 50px box plus its gap, and it takes that room from the sentence on 27 of the
34 screens.

The bubble costs **63px**: the 26px mark, a 9px gap, and 14px of padding on
each side of the bubble itself.

Which gives three futures, and only one of them is good:

| | question measure | vs today |
|---|---|---|
| today, with rephrase | 292px | — |
| **Concept 2 keeping the rephrase** | **229px** | **22% narrower** |
| **Concept 2 dropping it** | **285px** | 7px narrower — a wash |

**Keeping both makes the problem this whole pass exists to fix meaningfully
worse.** At 229px the thirty-word question goes from six lines to roughly
eight, and the two gates already leave the answer exactly 44px at the drawer's
ceiling. That is the compromise, stated plainly: the bubble and the rephrase
control cannot both have the room.

**Dropping it pays for the bubble almost exactly.** Adam's instinct is
arithmetically right — the rephrase is what the conversation costs.

## The compromises, in the order they bite

**1 · The mark means the product has a face, and it did not before.**
A 26px mark beside every question is a speaker. Today nothing in this product
claims to be talking — the questions are the product's voice but nobody is
pictured saying them. This is a product decision wearing a design change, and
it is the one I would want ruled on rather than assumed. The alternative is a
bubble with no mark, which still reads as a turn and claims nothing.

**2 · A bordered box behaves worse than a bare heading when the room runs out.**
V2.8's two-zone rule shrinks the question zone at weight 3 against the answer's
1. A heading that loses room simply scrolls. A bordered, filled bubble that
loses room clips its own frame, which reads as broken rather than as tight. So
the bubble gets a background and **no border**, and it scrolls inside itself
with the ground intact — the same call `ReadOnlyBlock` already makes.

**3 · The reply must not indent.**
Drawn as a real conversation the answer sits indented under the bubble, which
costs the answer area another ~35px of width on screens where the census says
it is already at the 44px floor. **The answer takes full width.** The turn
still reads from the mark and the bubble; the reply does not have to be
inset to be understood as a reply.

**4 · The narrator is opt-in, so the metaphor has to work silently.**
VB-18: nothing is ever narrated that the person did not choose to hear, and the
toggle ships off. A conversation you cannot hear is the normal case, not the
degraded one — so nothing about the bubble may depend on audio, and no copy
may imply it.

**5 · `TypedHeading` becomes better, not worse.**
The question types itself in on arrival (V1.2 VB-10). Inside a bubble that
stops being an effect and becomes the obvious thing — a message being written.
This is the one place Concept 2 gets something for free.

**6 · The question stays an `<h2>`.**
The bubble and the mark are decoration and are `aria-hidden`. The accessible
name, the reading order and the narrator's script are unchanged.

## What removing the rephrase actually removes

- `.flow-rephrase`, `REPHRASE_ICON`, `S.rephrase` and `S.rephraseShort`
  (BS-01c's word, added yesterday).
- Four e2e specs whose subject it is: `rephrase.spec.ts`,
  `rephrase.a11y.spec.ts`, and the two that walk past it
  (`follow-up-rotation`, `orb-choice`).
- **The seven-of-thirty-four inconsistency the census found** — a control
  present four times in five is harder to learn than one that is never there.

**`step.rephrasings` STAYS in the data.** Thirty-six questions carry alternate
wordings and they are good ones; they simply stop having a button. The obvious
home for them is the narrator, which can offer a different wording on a repeat
listen without spending a pixel — recorded here rather than built, because it
is a feature and not a consequence.

## The slice

One commit, its own gate. It touches the question zone and nothing below it:
the cluster, the dock's arithmetic and the drawer are all untouched, which is
what keeps this out of R-09's blast radius.
