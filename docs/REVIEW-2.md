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

## What fits tonight

**R-01 → R-06**, as two commits: the words, then the small visual. Every one of
them is bounded, none touches the cluster or the dock's arithmetic, and R-05
mostly *removes* code written this morning.

R-07 and R-08 next if the gate is quick. R-09 through R-13 are specced above
and want their own sessions — R-09 because of what it sits on, R-10/11/12
because they are one story that is not worth starting at the end of a day.
