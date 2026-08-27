# Workbrain — Beta change spec

Everything agreed in the design review, as a diff from the current build.
Nine workstreams, ordered by what unblocks the beta. Each carries its own
current state, change, files, and acceptance criteria, so they can be
picked up independently.

Source of truth for the visuals: the design review doc (side-by-side
mocks of current vs. proposed, ids 1a–1f, 2a–2d, 5a–5c).

## The four structural calls

1. **Home has no primary.** Thirteen stacked sections, roughly 1,470px of
   scroll in a 760px panel, two of the four largest being marketing.
2. **The interview hides its own pace.** Defensible for one sitting; risky
   for forty-nine questions with people who have never seen the product.
3. **The best feature is the least visible.** The file assembling live, and
   the brain. The drawer rests at one row and most testers will never drag it.
4. **Proof is gated, and it is the only thing that matters.** Nothing else in
   the hour survives if the person never feels the difference.

## One principle that resolves most of the detail

The person judges, the panel never reads. Every payoff in the flow is a
short list of statements the user ticks off themselves. It keeps the
zero-collection guarantee intact, it is faster than asking for a numeric
score, and ticking four boxes is itself a completion.

## Sprint order

| § | Workstream | Why here |
|---|---|---|
| 1 | Type and contrast calibration | Every other screen inherits it; doing it first avoids rework |
| 2 | Feedback door | Smallest change with the largest effect on what the beta returns |
| 3 | Proof: round trip and gating | If proof does not land, no other change earns its keep |
| 4 | Proof two — the capability proof | One new surface, and the thing testers repeat to other people |
| 5 | Interview pace | Decides whether anyone reaches §3 at all |
| 6 | Home | Mostly subtraction; benefits from §1 landing first |
| 7 | Drawer chrome and the brain leaf card | Self-contained; the largest single piece of new UI |
| 8 | Multiples | Shares its row component with §7 |
| 9 | Splash | Cheap, and last because it changes least about whether people finish |

§1, §2 and §9 are small. §3, §4, §5 and §7 are the sprint's real content.

---

## 1 · Type and contrast calibration

The interview screen is well sized — 22px question, 15px field. Home and the
drawer are not: card descriptions and status lines run 11.5px, tile labels
10.5–11px, meta 11px in monospace. The product is legible where it is a form
and squinty everywhere it is a dashboard. For a friends-and-family beta
spanning a wide age range, that is the difference between "this is nice" and
finishing.

This touches no colour, radius, motion or copy. One pass over the type scale
and the button variants.

| Role | Now | Floor |
|---|---|---|
| Anything instructional | 11.5–15px | **15px** |
| Body, descriptions, status | 11.5px | **14px** |
| Smallest text anywhere | 10.5px | **13px** |
| Section labels | 12px caps, .08em | **13px, sentence case** |
| Primary buttons per screen | 0–1 | **exactly 1, filled** |
| Icon-only controls | 6 | **0 — label them** |

Three further rules from measuring the mocks:

- **No text over an orb or node fill, at any tier.** Every contrast failure
  found in review was a label sitting on a mid-blue circle. Text goes on a
  card or on the near-black stage.
- **Dashed borders mean "empty", never "locked".** A dashed disabled tile
  reads as broken. Locked things become rows that explain when they unlock.
- **Lead with the friendly noun, not the filename.** "Context.md" in
  monospace on every surface signals "for people who know what a file
  extension is." The friendly word is already derived; make it primary and
  the filename secondary.

**Files:** `src/panel/surfaces/Home.css`, `FileDrawer.css`, `Multiples.css`,
`src/panel/components/FileRow.css`, `Pill.css`, `Meter.css`, `Banner.css`,
`Button.css`. Add a labelled-button variant where icon-only controls exist.
If new type steps are wanted as tokens, edit `design/tokens.json` and
regenerate — never hand-edit `src/panel/tokens.css`.

**Acceptance:** no rendered text below 13px anywhere in the panel; every
screen has exactly one filled primary; no control communicates by icon
alone; contrast check passes 4.5:1 on all body text, light and dark grounds.

---

## 2 · Feedback door

There is no way for a tester to tell you anything, and the beta exists to
collect exactly that. Zero-collection does not forbid this — it forbids
*silent* collection.

Add a Feedback control to the chrome bar, present on every surface. It opens
a sheet with a prefilled `mailto:` and a "copy a diagnostic block" button
carrying build number, current surface, and current question id — never
anything the person authored. The user presses send; nothing is transmitted
by the extension. Offer it a second time, once, immediately after the proof
delta, which is the one moment a friend will write a paragraph unprompted.

- Add a visible build stamp on the splash and in the sheet. When someone says
  "it did the thing", you need to know which build.
- The sheet states plainly what the diagnostic block contains and what it does not.

**Files:** `src/panel/App.tsx` (chrome bar), a new feedback sheet component,
`src/panel/strings.ts`, and wherever build metadata already lives.

**Acceptance:** reachable in one press from every surface; the mail draft
opens prefilled; the diagnostic block contains no user content; nothing
leaves the browser without the user pressing send in their own mail client.

---

## 3 · Proof: round trip and gating

Proof is currently one destination at the end, reached from a tile disabled
until `contextFinished`. It should be a beat that happens three times inside
the hour.

| Beat | When | What it is |
|---|---|---|
| Micro-proof | After run 2, ~6 min | One prompt, one round trip. No baseline, no scoring. Offered once, skippable. |
| Proof one | On Context finishing, ~20 min | The existing loop, fired automatically rather than waiting in a tile. Ends by handing into Skills. |
| Proof two | After two skills, ~38 min | See §4. |

Three round trips is the whole budget. Each one is a chance to lose someone
in another tab, which is what the rest of this section is about.

### 3.1 · One copy, no attach

Put the file inline in what gets copied, so prompt and context are a single
paste. Attaching a downloaded file in another application is the hardest
thing the hour asks of anyone, and it is unnecessary — the file is text.
State it on screen: "Your file comes along inside the message. You do not
need to attach anything." Keep a secondary route for people who prefer
attaching, and keep `attachHintFor` for that path, naming the exact gesture
in the service they chose.

### 3.2 · The waiting state (new)

Today the panel looks identical whether someone is mid-errand or has not
started, so returning from another tab means re-reading the screen. Add an
explicit held-place state: a confirmation that the copy happened and the
place is held, a dashed empty paste box that visibly wants content, a "copy
the prompt again" secondary, and a disclosure for the commonest real failure
— the AI replies with a question instead of an answer.

Nothing spins and nothing counts down. There is no server call to wait for,
so a spinner would be a lie and a timer would be pressure.

### 3.3 · The landing, judged by the user

Replace the numeric scoring in `proofScoreDelta` with four checkboxes the
person ticks: used my manager's name, knew which project is mine, sounded
like me, asked for the right thing. The primary button's label is written
from the count. Show the two answers side by side above it, verbatim, with
an explicit line saying the panel never reads or scores them.

Three steps, shown as three numbered steps with a time estimate. End on an
artifact: a saved one-page receipt. It is the most shareable thing the
product produces and today it evaporates.

**Files:** the proof surface and its module definition,
`src/panel/surfaces/Flow.tsx` / `.css`, `src/panel/strings.ts`, clipboard
assembly, receipt export, and wherever `contextFinished` gates entry.

**Acceptance:** the micro-proof is reachable before Context is complete; one
copy action yields a paste that needs no attachment; returning to the panel
mid-errand shows the held-place state; no numeric score is asked of the user
anywhere; the receipt saves.

---

## 4 · Proof two — the capability proof (new surface)

This is the screen that sells the product and it does not exist. Proof one
buys trust; this buys the sentence a tester repeats to a colleague.
Everything it needs is already collected in
`src/core/flow/skillsSource.ts`: `skill_name`, `skill_trigger`,
`skill_steps`, `skill_output`, `skill_tools`. The prompt is one line of
assembly over answers you already hold.

**Screen one, the offer.** Name the skill, its cadence, its step count and
its output shape. Show the first two steps in the person's own words, then
the single sentence they will send — "Run my Weekly ops report for this
week." One primary: copy it, with the recipe. One secondary: pick a
different one.

**Screen two, the payoff.** Their own steps as a checklist. They tick what
the AI actually did. The summary line is written from the count — "Six of
your seven steps, first try" — followed by what it means going forward, in
one sentence. Primary: save a one-page receipt. Secondary: fix the step it
missed, which routes back into the Skills interview for that step.

One round trip only. No baseline, because the absence of a before is the
point. Nothing is scored by the panel; the artifact and the checklist are
the argument.

**Files:** new surface plus its module entry, prompt assembly from
`src/core/flow/skillsSource.ts` answers, `src/panel/strings.ts`, receipt
export shared with §3, and a route back into Skills for a single step.

**Acceptance:** the assembled prompt contains the user's steps, output
format, cadence and tool names verbatim; the checklist is generated from
their steps, not a fixed list; "fix the step it missed" lands on that step;
the receipt saves; the surface is reachable after two skills without
finishing all of Skills.

---

## 5 · Interview pace

The decision not to print "question 12 of 38" is right about the wrong
number: a far-away total invites bargaining. Five does not. Replace the
hidden count with runs of five.

- **A beat row of five marks** — filled, standing, empty — plus a
  plain-language remainder ("two left in this run") and which run of how
  many. No global total anywhere.
- **Next becomes a filled primary.** The action taken forty-nine times is
  currently an underlined word in a mostly empty band, and Skip is not on
  screen at all. Keep the cluster; give it a hierarchy: Back and Skip quiet,
  Next filled and wide.
- **Show the file writing itself, inline, once per answer.** A two-line slip
  under the answer holding the actual markdown that just landed. This is the
  drawer's payoff delivered where the eye already is, and the cheapest way to
  make the product feel like it is doing something.
- **A run-boundary payoff card** at every fifth answer: the section lighting
  up on the globe, the lines just written, and three choices — keep going,
  read my file, stop here for now. The explicit stop is a feature;
  `welcomeTime` promises it and no screen in the interview offers it.
- **Variety by scheduling, not new content.** Orbs, divided lines, paired
  picks, vertical picks, pills and the reflect frame already exist; nobody
  experiences that range because sequencing follows content order. Score each
  module so no run of five repeats a presentation kind twice, and open each
  run with the kind that has been quiet longest.
- **Add "Jump to…"** — a filter over the outline you already hold, using
  `positionForQuestionId`. Forty-nine questions with no search is the one
  missing utility every comparable browser tool has.

**Files:** `src/panel/surfaces/Flow.tsx` / `.css`,
`src/panel/components/FlowProgress.tsx` / `.css`,
`src/panel/components/NavButton.css`, `src/panel/strings.ts`, the
module/question definitions for presentation scheduling, and a new
run-boundary component.

**Acceptance:** no screen states a global question total; the beat row
advances correctly across module boundaries; Next is the only filled control
on the question screen; the written-line slip shows real file content; the
run card appears every fifth answer and its stop option exits cleanly with
position preserved; no run of five repeats a presentation kind.

---

## 6 · Home

Thirteen sections, roughly 1,470px of scroll in a 760px panel, and a
first-time eye has nowhere to land. Target is about 810px with one obvious
primary. Mostly subtraction.

- **Drop the welcome lockup.** Chrome bar, lockup and welcome card all say
  "this is Workbrain" within 180px. The chrome bar wins because it survives
  every state. Roughly 84px back.
- **Promote the recommendation to hero,** above the meter, directly under the
  chrome. It is the reason to open the panel on day nine and it is currently
  item four, in amber, competing with a full-bleed price card. Add a time
  estimate to the verb.
- **Collapse the three action tiles and the secondary banners** into one row
  list with subtitles. Dormant items become rows that explain when they
  unlock, not dashed disabled squares.
- **Workbrain+ keeps its door, loses the pitch.** The four bullets and the
  price belong on the page already linked. On Home they cost about 230px and
  make the panel read as a storefront on the screen people open to do work.
- **Move the "most people name three or four" nudge** out of the
  recommendation stack and onto the Multiples screen.
- **Add "What moves this?"** beside the percentage — a sheet listing the four
  segments and what fills them. The number is honest and completely opaque today.

**Files:** `src/panel/surfaces/Home.tsx` / `.css`,
`src/panel/components/Banner.css`, `FileRow.css`, `Meter.tsx` / `.css`,
`src/panel/strings.ts`.

**Acceptance:** Home fits in roughly one and a half panel heights; the
recommendation is the first content under the chrome and the only filled
primary; no disabled dashed tiles remain; the plus card is a single-row door.

---

## 7 · Drawer chrome and the brain leaf card

### 7.1 · Drawer chrome

- **Three navigations are stacked in 112px** — breadcrumb, then Back/Home,
  then the mode switch. Back and Home duplicate the mark and the trail root;
  drop them and the peek gains a row.
- **Label the mode buttons.** Two unlabelled glyphs on a dark field, choosing
  between two views most people have never seen. Make them labelled pills.
- **Replace the peek's zeroed row with a status line** — "4 of 10 sections ·
  1 line just added" says more than a row reading 0 of 6 and 0% under a trail
  that already names the section.
- **Give the brain the whole panel once per run,** unasked, as the
  run-boundary payoff, then hand back to the question. The morph,
  illumination and glow already exist; only the timing changes. Nobody drags
  the drawer, so the reward has to arrive on its own.
- **Node labels:** the size is already `var(--brainglobe-label-size)` at
  12px/650, which is fine. Leave it and add a count chip beside the name — a
  number when the node holds a list, a state word when there is something to
  say ("due", "not yet", reusing the List's own wording), dashed when nothing
  is answered, never two chips. Pressing the name opens the node; pressing
  the chip opens it at the list.

### 7.2 · The leaf card

Selecting a sub-node currently renders `brainglobe-detail` as a definition
list from `nodeDetails`, question label first. So a leaf holding a list and a
leaf holding one answer look identical, a list leaf has no count, and there
is no route to the editor or statement of what the field is for.

Replace it with one card of five parts in a fixed order. Parts 1, 2, 4 and 5
are identical for both leaf types; only part 3 varies.

| # | Part | Content | Source |
|---|---|---|---|
| 1 | Header | 13px orb in the node's colour · name 19px/680 · close | `nodeSummary.label` |
| 2 | Purpose line | One sentence: what this field is for, 14px muted | **New authored string** |
| 3 | Value block | The only variant: answer, or count + noun | `itemKind` selects, `items` supplies |
| 4 | State chip | Exactly one, or none: age or health | `elapsed`, `answered`/`total` |
| 5 | Action | One full-width button, 46px min, never two | `positionForQuestionId` / `positionForRecord` |

**Single entry** (`itemKind === 'answer'`): value block is a tinted panel
with a 3px left rule in the node's colour, answer at 17px/600. Chip reads
"Answered *n* days ago". Action **Change this answer**, secondary fill,
routing to that question.

**List** (`itemKind === 'record'`): same block position and rule, count at
34px/700 tabular beside the noun at 17px/600, optional norming line beneath.
Chip reads "Last added *n* days ago". Action **Open the list** with a
chevron, into the Multiples screen. When any item is incomplete, the block's
tint and rule go amber and a third line states the fact *without naming the
item*; the orb takes an amber ring.

Satellite dots inside the orb halo — three or four, unlabelled, positions
meaningless — are the only signal of plurality on the canvas. Enough to
distinguish a list node at a glance, cheap enough never to need maintaining.

> **Hard constraint.** No item name, per-item field, or item preview renders
> anywhere in the brain view. If a design question can only be answered by
> naming an item, the answer is that it belongs in the editor.

### 7.3 · State matrix

| State | Orb | Value block | Action |
|---|---|---|---|
| Answer, filled | Solid, node colour | Tinted, node rule | Secondary |
| Answer, empty | Hollow ring | Dashed, muted | Primary blue |
| Answer, skipped | Hollow ring | Dashed; says it was skipped | Primary blue |
| List, healthy | Solid + satellite dots | Tinted, node rule, count | Secondary |
| List, incomplete | Solid + amber ring | Amber tint and rule | Secondary |
| List, empty | Hollow ring | Dashed, muted | Primary blue |

### 7.4 · The one new field

Part 2 cannot be derived. Add an optional purpose line per leaf node — one
sentence, under about twelve words, saying what the field is *for* rather
than what it contains. It lives with the outline node definition, surfaces
through `strings.ts` like every other user-facing string, and absent is a
legal state: the card omits part 2 and closes the gap. Do not ship a
placeholder.

Starting examples:
- *People* — "The people whose names AI should already know."
- *Never do* — "What AI should never do when it writes as you."
- *Projects* — "The named efforts you have underway right now."

**Files:** `src/panel/components/BrainGlobe.tsx` (leaf renderer, keeping the
existing tier/nav contract), `src/core/flow/nodeSummary.ts` (count, noun,
incomplete flag; confirm `itemKind` is set for every leaf), the outline node
definition for the purpose line, `src/core/globe/detailBand.ts` (leaf tier
gives the card the lower portion, globe compresses to a strip, never-occlude
preserved above), `src/panel/surfaces/FileDrawer.tsx` / `.css`,
`src/panel/components/Breadcrumb.css`, `src/panel/strings.ts`.
`src/core/flow/nodeDetails.ts` stops being the leaf input — leave it if List
mode consumes it, delete only after confirming no other caller.

**Acceptance:** every leaf shows the five-part card with parts 1, 4 and 5 in
identical positions across variants; a list leaf states its count and never
renders an item name; every action lands on the right question or list with
no intermediate screen; empty, skipped and incomplete render without layout
shift; a leaf with no purpose line renders correctly; no text over any orb
fill; brain and List still agree on the current section.

---

## 8 · Multiples

- **Rows say what the record holds, not just a count.** "4 of 5 answered" is
  a fact about the form. Print the two or three things the record actually
  contains — available in the node detail data — and the list becomes a view
  of the person's world.
- **Replace the repeated person glyph with a completeness ring** in the same
  slot, carrying progress and health in the existing palette. The identical
  silhouette on every row is repetitions of no information.
- **"Add another" becomes the last row of the list,** not a bordered button
  below it. Reads as one more of the thing above, and saves height per group.
- **Receive the "most people name three or four" nudge** from Home.
- **Share the row component with §7.2's list destination** — same rows, same
  rings, same last-row add, built once for light and dark grounds.

**Files:** `src/panel/surfaces/Multiples.tsx` / `.css`,
`src/panel/components/FileRow.css`, `SectionHealth.css`,
`src/panel/strings.ts`.

**Acceptance:** each row shows record content, not only a count; incomplete
records are visibly distinct; adding is reachable from the list itself; the
row component is shared with the brain's list destination.

---

## 9 · Splash

- **Spend the held seconds on the decision, not on a drain bar.**
  `SPLASH_BEATS.idleMs` holds the reveal while a whimsy line cycles; the
  tagline is read in two seconds and then people wait. Replace the progress
  line with the two sentences that answer "what is this and what will it cost
  me" — the same content `welcomeTime` gives one screen later, said where the
  decision is made.
- **Make Skip visible.** Any click already exits, but nothing says so, so
  people sit through it politely.
- **Add a 30-second tour door.** `TourSlide` and `tourStart` exist. This is
  the only moment anyone will accept an orientation.
- **Show the build stamp** (§2).

**Files:** `src/panel/surfaces/Splash.tsx` / `.css`, `src/panel/strings.ts`.

**Acceptance:** the value proposition and time cost are on screen before the
primary; skip is discoverable without trying; the tour is reachable and
skippable; the build is identifiable; reduced-motion path unchanged.

---

## 10 · Out of scope

Per-item browsing inside the brain, and per-type item overviews. The count
row in §7.2 is built as a *door* so this stays open: the affordance and its
position do not change if a later sprint points it at an item list instead of
the editor. Two decisions to defer — whether the item overview is a new brain
tier or the editor with a better header, and whether each type gets a bespoke
layout or declares two headline fields into a shared one. Signal to watch in
the beta: testers pressing the count expecting to browse.

Also excluded and worth a later look: a keyboard-shortcut sheet, undo, and a
"what's new" note for testers who reload a build.

---

## 11 · Open questions

1. Does a skipped answer read differently from an unanswered one on the leaf
   card, or do they share the empty state?
2. Where does the incomplete-item flag come from for record leaves, and is it
   already computed?
3. Does the noun in the count block come from the node definition or the
   record type?
4. Who writes the purpose lines, and do they ship in this sprint or behind
   the card?
5. Where exactly does `FileOutlineNode` live, and does anything besides the
   leaf renderer consume `nodeDetails`?
6. Is a run always exactly five, or does the last run of a module absorb the
   remainder?
7. Does the micro-proof reuse the proof-one prompt or get its own?
8. Which of these does `docs/OPEN.md` already consider an unresolved product
   decision that must not be settled in code?

Questions 1–5 block §7. Question 6 blocks §5. Question 7 blocks §3.
Question 8 should be checked before starting anything.
