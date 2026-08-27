# Beta sprint — the plan of record

`docs/BETA-CHANGE-SPEC.md` is WHAT changes and why; the design review
(`docs/Workbrain Beta Review.dc.html`, frames 1a–1f, 2a–2d, 5a–5c) is what it
should look like. **This file is how it gets built here** — task ids, the
decisions already taken, what each change breaks, and the order.

Nothing in this file overrules `docs/GUARDRAILS.md`. Where the spec needs a
guardrail to move, that move is written down as its own task (BS-10) and is
Adam's call, not a side effect of building something else.

## The thesis, in one paragraph

The hour only works if a stranger *feels* the difference three times.
Everything else is in service of them reaching those moments: pace is what
gets them there, Home and the drawer are subtraction and legibility around
them, the feedback door is how the beta pays us back. The mechanic that makes
all of it legal is **the person judges, the panel never reads** — every payoff
is a short list of statements they tick, so every number in the product is
counted from their own ticks and nothing is observed. That is the same
authorship test `docs/GUARDRAILS.md` already applies to measurement, held one
notch tighter.

Strategically the extension **stops selling and starts proving**: §6 strips the
pitch from Home and keeps the door, §3/§4 end on a receipt that a tester
forwards, and commerce stays on the portal. The free identity-free base does
its job; Workbrain+ is a door, not a storefront.

---

## Task ids

| Id | Workstream | Spec |
|---|---|---|
| **BS-00** | Build identity — one version scheme, stamped and visible | prereq for §2, §9 |
| **BS-01** | Type and contrast calibration | §1 |
| BS-01a | Emit the type scale as tokens (it is declared and never written) | §1 |
| BS-01b | Sweep the literals onto the tokens — **shared components and surviving surfaces only** (see note) | §1 |
| BS-01c | Label the 12 icon-only controls; one filled primary per screen | §1 |
| **BS-02** | Feedback door | §2 |
| **BS-03** | Proof: round trip and gating | §3 |
| BS-03a | Micro-proof at minute six | §3 |
| BS-03b | One copy, no attach — the file rides inside the prompt | §3.1 |
| BS-03c | The waiting state | §3.2 |
| BS-03d | The judged landing, and the receipt | §3.3 |
| **BS-04** | Proof two — the capability proof (new surface) | §4 |
| **BS-05** | Interview pace — runs, beats, the written slip, the payoff card | §5 |
| BS-05a | Runs and the beat row | §5 |
| BS-05b | Next as a filled primary; Skip on screen | §5 |
| BS-05c | The written-line slip, inline, once per answer | §5 |
| BS-05d | The run-boundary payoff card | §5, §7.1 |
| BS-05e | Presentation scheduling — no kind twice in a run | §5 |
| BS-05f | Jump to… | §5 |
| **BS-06** | Home — subtraction, and one primary | §6 |
| **BS-07** | Drawer chrome and the brain leaf card | §7 |
| BS-07a | Drawer chrome: three navigations become one | §7.1 |
| BS-07b | Node chips on the stage | §7.1 |
| BS-07c | The five-part leaf card | §7.2, §7.3 |
| BS-07d | The purpose line — the one new authored field | §7.4 |
| **BS-08** | Multiples — rows that say what a record holds | §8 |
| **BS-09** | Splash — the held seconds buy the decision | §9 |
| **BS-10** | Guardrail and open-decision amendments | this file |
| **BS-11** | VB-142 — the reference prompt asks for three examples | V2.9 survivor |

---

## Decisions already taken

Recorded so they are not re-litigated mid-build. Each is Adam's, dated
2026-08-27 unless noted.

**D1 · A run is bounded by its module, and the last run absorbs the
remainder.** Context's modules are 8, 4, 5, 2, 2, 5, 7, 2, 2, 2, 2 questions,
so 8 becomes 5+3, 7 becomes 5+2, and a 2-question module is one run of 2.
A run boundary is therefore always a real section boundary, which is what lets
the payoff card say *"Initiatives is lit up"* rather than the weaker "five
answered". "Run 2 of 3" means *within this section* — a small honest number,
and the only one that stays true when repeatables add questions. No global
total is printed anywhere.

*Consequence, and the standing assumption:* six modules are 2 questions long,
so a full-panel brain takeover every run would fire eleven-plus times in
Context alone. The card has **two weights** — a *light* card for runs under 3
(the lines just written, keep going, inline, no takeover) and the *full* card,
brain and all, for runs of 4+ and for any run completing a section that holds
records. Correct this if the light card turns out to be worth skipping
entirely.

**D2 · The micro-proof assembles its own small task.** The existing proof
prompt is already the person's own words — `proofQuestion()` returns their
`goal_want` answer (`src/core/flow/proofAdapter.ts:149`). Reusing it at minute
six would spend proof one's reveal before it happens and make its baseline
step read as going backwards. So the micro-proof builds a short task naming
something they just typed ("Draft a note to Priya about Northstar") and sends
it with the ten answers inline; `goal_want` stays untouched for proof one.

*Fallback ladder, since the first ten questions are Orientation and may name
nobody:* a named person → a named initiative → their role → their own words
about what good looks like → if none exist, the goal task with the ten answers,
where the wow is "it already sounds like me" rather than "it knows Priya".
Built as a pure function in `core/` so it is testable against a thin seed.

**D3 · Three earlier calls are deliberately reversed.**
1. V1.1 VB-02's "no printed count" — §5 prints "run 2 of 3" and "two left in
   this run". Five is not a number anyone bargains with; the ban stands for
   global totals only.
2. V2.8 VB-134 and V2.9 VB-147's price card — the price and the four bullets
   move to the page already linked. The door stays.
3. V1.1 VB-01's welcome lockup and V2.6 VB-125's file lockup — both go; the
   chrome bar says "this is Workbrain" and survives every state.

**D4 · V2.9 slices B–E are killed and folded in**, keeping VB-142 (BS-11).
The table lives in `docs/V2.9-REFINEMENT.md` under SUPERSEDED.

**D5 · The receipt is a file, never a hosted link.** `docs/OPEN.md` #4 is
still open and its default assumption stands. BS-03d and BS-04 save a file and
do not grow sharing.

**D6 · Two guardrails move (BS-10), and only these two.**
- The row banning "a tour, a coach-mark overlay" is stale: `TourSlide` /
  `tourStart` already ship in-flow (V2.5 VB-114's dime tour). It should read
  *no dismissible overlay pointing at UI; in-flow orientation is fine*, which
  is what the V1.1 plan actually argued.
- The feedback door needs its own row: user-initiated, opens the person's own
  mail client, transmits nothing itself, and the diagnostic block carries
  build + surface + question id and **no authored content**. It passes the
  authorship test; it just is not written down yet.

---

## Still open — needed before the tasks they block

From the change spec's §11, minus the ones now answered:

| # | Question | Blocks |
|---|---|---|
| O1 | Does a skipped answer read differently from an unanswered one on the leaf card, or share the empty state? | BS-07c |
| O2 | Who writes the ~nine purpose lines, and do they ship with the card or behind it? | BS-07d |
| O3 | `fileFinished` counts a skip as a gap, so one skipped optional question keeps Skills.md locked forever. Intended? | BS-06, and the Skills unlock generally |
| O6b | D1 bans printed digits. The progressbar's spoken count (`aria-valuetext`, "Question 3 of 38") is not printed — assumption is it becomes **run-scoped** rather than global, so a screen-reader user gets what the beat row gives everyone else. Correct if the spoken total should go entirely. | BS-05a |

**Closed since:** O4 (the file carries the reference examples, prompts about
something else do not), O5 and O10 (taken as calls — see below), O6/O7/O8/O9
(answered as D1/D3/D4/D6 in the rulings table).

Answered already, recorded here so they are not re-asked: the run shape (D1),
the micro-proof prompt (D2), `FileOutlineNode` is `{id, label, questionIds,
children}` so the purpose line is genuinely a new field
(`src/schema/flow.types.ts:250`), `nodeDetails` has exactly one non-leaf
consumer — List mode at `src/panel/surfaces/FileDrawer.tsx:666` — so it stays,
and `docs/OPEN.md` #4 governs the receipt while #2 and #1 inform Home.

---

## What each workstream breaks

Filled from three read-only sweeps over the tree — the type-and-geometry
census, the prompt audit and the spec-collision census. Counts are tests that
go red, not files touched.

### The suite — what goes red, per workstream

**~188 test claims break: 77 REWRITE, 92 RETARGET, 19 DELETE.**

| § | Workstream | Broken | R/RT/D | The riskiest one |
|---|---|---|---|---|
| 1 | Type + contrast | 8 (+3 at risk) | 5/3/0 | `file-slots.spec.ts:237` — locked cards are told apart by a **dashed** edge, a non-colour signal. §1 says dashed means empty, never locked |
| 2 | Feedback door | **9 or ~50** | 3/6/0 | `drawerBounds(viewportHeight)` takes the raw viewport; 11 spec files compute geometry from it. See the decision below |
| 3 | Proof round trip | 19 | 13/3/3 | `src/core/report/scoring.test.ts` — the whole file asserts `ScoreEntry {at, value: number}`. Ticks are not a number and `scoreDelta` has no meaning |
| 4 | Proof two | 3 | 0/3/0 | `home.spec.ts:518` — `toHaveCount(3)` tiles; a fourth door has nowhere to go |
| 5 | Interview pace | 38 | 12/26/0 | `button-cluster.spec.ts:295` — *"the assertion that fails if someone puts the boxes back."* §5 puts the box back on Next |
| 6 | Home | 33 | 13/16/4 | `welcome.a11y.spec.ts:63` — axe `.include('.home-welcome')` **throws** on a missing selector rather than failing cleanly |
| 7 | Drawer + leaf card | **56** | 24/22/10 | `brain-globe.spec.ts:1398` ×4 — *"has no panel, card or box around it."* §7.2 is a card with a tinted panel and a 3px rule |
| 8 | Multiples | 11 | 3/8/0 | `multiples.spec.ts:276` — `.filerow .sb` must read "4 of 4 answered"; §8 deletes that sentence |
| 9 | Splash | 11 | 4/5/2 | `Splash.test.tsx:143` — exactly one button in `.splash`; §9 adds three |

### Three sizing corrections to the spec's own estimates

**§2 is small or large depending on one decision, and the spec assumes small.**
There is no app-level chrome bar today — every surface draws its own head
(`App.tsx:345` renders a bare `<main>`; `Home.tsx:498` has `.home-chrome`).
"Present on every surface" therefore means *creating* one, and
`drawerBounds(viewportHeight)` (`src/core/drawer/height.ts:320`) takes the raw
viewport. Eleven spec files compute their expected geometry from `PANEL.height`
directly. **A 44px in-flow bar makes every "fits", "never overlaps", "clears the
band" claim in those files wrong by 44px — ~50 tests.** Drawn *over* the
surface, or Home-only, the cascade never fires and §2 is ~9. **This is the
single largest cost swing in the sprint** and it is a layout decision, not an
engineering one.

**§5's cost is not the beat row — it is the filled Next.** The beat row is
about 8 tests. Making Next a filled primary reaches `button-cluster` (7),
`save-note` (4), `nav-dock` (4), `nav-melt` (4) and `question-fill` (9),
because `NavButton.tsx`'s 26px-painted / 44px-pressable split **exists only
because VB-41 removed the containers**. Putting the box back means deleting
that split, `navPaintHeight()`, `FLOW_NAV_RING_REACH` and the ring-on-wrapper
`:has()` rule, then re-deriving `FLOW_NAV_HEIGHT`. Worth doing — the review is
right that the thing done forty-nine times should be a button — but it is a
core-geometry change wearing a CSS change's clothes.

**§7 is two workstreams with disjoint blast radii.** 7.1 (chrome, mode pills,
and `BRAIN_NAV_BAND = 30` — a term in `BRAIN_MIN_HEIGHT`, `BRAIN_OPEN_HEIGHT`
and `brainStageSize`) versus 7.2 (the leaf card, ~30 broken tests and four
unanswered product questions). Already split as BS-07a/b vs BS-07c/d; they
should also be sequenced apart. Note that dropping the nav band is a
*favourable* change to the fit — its own comment records 30 was chosen over 44
to keep `BRAIN_MIN_HEIGHT` under a 700px panel's ceiling — but every derived
number moves.

### Ten product decisions the spec reverses

These are the ones where the fix is a decision, not a selector — and where an
agent left alone would quietly re-decide them. D1–D9 are recorded in test
comments, several signed by Adam.

| | The shipped decision | What the spec does |
|---|---|---|
| **D1** | *"prints no digit anywhere on screen — that is the whole point of the bar"* (`FlowProgress.test.tsx:38`, and `flow-progress.spec.ts:95` over the whole `.flow`) | §5 prints a run counter, a remainder line and a markdown slip. **Decide: is the ban "no global total" or "no digit at all"?** They are different rules and the test encodes the stricter one. Also: does the screen-reader total (`aria-valuetext: "Question 3 of 38"`) survive? |
| **D2** | A numeric 0–10 is typed and one number is stored (`proof.spec.ts:188`, `scoring.test.ts`) | §3.3 replaces it with ticks. `ScoreEntry {at, value: number}` → `{at, ticked[]}`; `scoreDelta` loses its last caller; `S.storedScores` ("Proof scores you typed") becomes a lie; **and `GUARDRAILS.md` admits this key on the grounds that it is "a self-reported 0–10 the person typed"** — still authored, still legal, but the row's wording moves with the schema |
| **D3** | Icon-only is *correct* here — VB-22 for the mode toggles, and **VB-91, where Adam resolved a naming collision (two controls named Back) by making the stage side iconic** (`work-brain.spec.ts:446`) | §1 labels all of them. §7.1's pills and §5's labelled footer **re-create the exact collision VB-91 resolved** |
| **D4** | Dashed = locked, and it is one of the non-colour signals a11y claims depend on (`file-slots.spec.ts:247`, `breadcrumb.a11y.spec.ts:308`) | §1 makes dashed mean empty only. **A replacement non-colour signal for "locked" is needed or the a11y claim goes with it** |
| **D5** | A list leaf and an answer leaf are *"structured identically every time"* (`brain-globe.spec.ts:1445`, 40 lines of defence) | §7.2 opens by naming that as the bug |
| **D6** | VB-50: the drawer is **one colour**, no element paints a ground (`one-surface.spec.ts:452`, `brain-globe.spec.ts:1398` ×4 — transparent, zero borders, no shadow, radius 0, *and the same for every descendant*) | §7.2 is a tinted panel, a 3px rule, an amber variant and an orb ring — four grounds and three edges. **The largest single design conflict in the sprint**, and VB-50 was itself Adam's deliberate reversal of a shipped decision |
| **D7** | Item names render in the brain (`brain-globe.spec.ts:778` asserts `'Manager / Team Lead'`) | §7.2's hard constraint forbids exactly that. The cleanest DELETE in the sprint — the claim ceases to be true by design |
| **D8** | "Most people name three or four" is a first-class `RecKind` and its *ranking* is the feature (`recommendations.spec.ts:221` asserts it is **not** shown when three stronger ones outrank it) | §6 moves it to Multiples — an engine change, and it changes what ranks fourth |
| **D9** | Workbrain+ shows its price and four goods (`home.spec.ts:390`, commented as *"Adam's explicit reversal of V2.6's no-prices call"*) | §6 removes the pitch. **Third position on this question in three releases** |
| **D10** | `GUARDRAILS.md` bans *"a tour, a coach-mark overlay"* | §9 adds a splash tour door. `TourSlide` exists but as **interview content** (VB-114's dime tour), not an overlay. No test enforces the guardrail and `npm run audit` does not check it — but the guardrail says *stop and ask* |

### Adam's rulings on the ten (2026-08-27)

| | Ruling | What it means for the build |
|---|---|---|
| **D1** | **No digit at all — the strict ban stands.** | The beat row is **marks and words only**. "Two left in this run" spells its number; "run 2 of 3" becomes "second run of three" or goes. See the scope note below — the shipped test cannot survive §5 *as written* even under this ruling, and why that is not a re-decision. |
| **D2** | **Ticks on screen, the count stored as a number.** | The person ticks; `ScoreEntry` keeps `{at, value: number}` and **`scoring.ts` survives nearly intact** — 5 of its 8 unit tests stand. The panel still never reads an answer: every number is counted from their own ticks. Two consequences below. |
| **D3** | **Label them.** VB-91's collision is re-opened deliberately; it gets solved with words, not by going back to icons. | Two controls must not both be called "Back". The stage's way up and the trail's root are the same journey — the trail keeps "Work brain" and the stage's control takes the noun it actually does ("Zoom out"), or the stage control goes entirely under §7.1, which drops it anyway. **§7.1 resolves D3 by subtraction**: with Back/Home gone from the band, only the mode pills need words. |
| **D4** | **Agreed — an alternate signal for locked.** | Dashed retires to "empty". Locked is carried by the **padlock** (`LockGlyph`, already shared by the shelf and the switcher) plus the sentence that says what unlocks it. Both non-colour, both already shipped; the a11y proofs re-point at them rather than losing a signal. |
| **D5** | **Good** — a list leaf and an answer leaf may differ. | VB-31's "structured identically every time" is retired for the leaf tier; parts 1, 2, 4 and 5 still hold identically, which is the honest half of that decision. |
| **D6** | **Good** — the leaf card gets its panel. | VB-50's one-colour drawer is amended for the leaf card specifically. **The rule that survives:** a ground has to earn its keep by carrying meaning (the tint IS the state — node colour, amber for incomplete, dashed for empty). Chrome stays one colour; only the value block paints. |
| **D7** | **Delete.** | The item-name assertions go. No item name, per-item field or preview renders in the brain view — the constraint is now enforced by the absence of the test that contradicted it. |
| **D8** | **Good** — the nudge moves to Multiples. | It stops being a `RecKind` in `core/recommend/engine.ts`; the ranking changes and `recommendations.spec.ts:221`'s fourth-place claim is rewritten around whatever now ranks there. |
| **D9** | **Good** — Workbrain+ loses the pitch. | Third position in three releases, taken knowingly. Price and bullets live on the linked page. |
| **D10** | **Keep the tour door; amend the guardrail.** | `GUARDRAILS.md`'s row becomes *"a dismissible overlay pointing at UI, or a what's-new modal — in-flow orientation is fine"*, which is what the V1.1 plan argued and what VB-114's dime tour already ships. BS-10 carries the edit. |

**D2's two consequences.**
1. **`scoreDelta` loses its last caller.** The checklist asks only about the
   with-file answer ("which of these did the second one get right?"), so there
   is no baseline count to subtract from. `scoreDelta` and its three unit tests
   go (`src/core/report/scoring.ts:32`), and `S.proofScoreDelta` with them.
2. **The entry needs its denominator.** Proof one ticks a fixed four; proof two
   ticks however many steps the person wrote, which varies per skill. `value: 2`
   alone cannot say "two of four" versus "six of seven", so `ScoreEntry` gains
   `of: number`. Both numbers are authored — the count is their ticks, the
   denominator is their own checklist — so the guardrail's authorship test is
   satisfied, and its row updates with the schema (BS-10).
   `S.storedScores` ("Proof scores you typed") is rewritten to match what is
   actually kept.

### BS-01b does not sweep every one of the 116

The spec puts §1 first *"because every other screen inherits it"*, which is
right — and it is exactly why the sweep should not touch the screens that
later workstreams **rebuild**. Home is 19 of the sub-13px literals and §6 is
mostly subtraction; the leaf card's six go with §7.2; FlowProgress's label
goes with §5; Multiples' rows are shared with §7.2 and rebuilt in §8; the
splash's loader line is deleted outright by §9. Sweeping those now means
editing them twice and re-measuring twice.

**So BS-01b is the shared components and the surfaces that survive** — the
controls every screen inherits (Button, Pill, Field, DeepDive, DividedLine,
VerticalPick, OrbGroup, ReadOnlyBlock, Toast, DictationHint, Banner, FileRow,
SectionHealth, Recommendation, WorkShelf, Meter) plus the drawer's List rows.
Everything else gets its type right **as part of its own workstream**, where
building against the tokens is free because the markup is being rewritten
anyway. The floors still land everywhere before the beta; they just land once
per surface instead of twice.

The order within the sweep is unchanged and still matters: **the core
constants lead, the CSS follows.** `DRAWER_ROW_HEIGHT`, `FLOW_NAV_TARGET` and
the dock's welded set are what the geometry specs mirror, so a raise there is
what the specs re-measure against — the reverse order leaves the gate red for
no useful reason.

### Two calls taken under Adam's standing latitude on rendering

**The globe keeps its caps (O10).** §1 sends section labels to 13px sentence
case; §7.1 says leave the node labels alone. The tie-breaker is not taste:
`core/flow/globeLabels.ts` computes its truncation budget *from* the fact that
uppercase at `.08em` runs about a third wider, and `brain-globe.spec.ts:1274`
welds tracking to size. Map labels are conventionally caps — the review
concedes it — so the stage is exempt from the sentence-case rule and
`globeLabels.ts` is untouched. Every other section label converts.

**The chrome bar is app-level, and `drawerBounds` learns about it (O5).**
§2 asks for a Feedback control "present on every surface", which Home-only does
not satisfy and drawing-over-the-surface only fakes. The ~50-test cascade is
real but it is **RETARGET, not REWRITE**: those specs derive their geometry
from one function. So the chrome height becomes a core constant that
`drawerBounds(viewportHeight)` subtracts, the eleven spec files that import
that function inherit the correction for free, and only the specs doing their
own `PANEL.height` arithmetic need touching. Sized honestly: one constant, one
signature, and a re-measure — not fifty rewrites.

**D1's scope note, which is implementation and not a re-decision.**
`flow-progress.spec.ts:95` asserts no digit in the **whole `.flow` innerText**.
§5's written-line slip prints the person's own answer back to them, and a
person who types "Q4 pricing review" has just put a digit on screen. The ban is
about **the panel's own voice**, not about the person's words — so the claim
narrows to the panel's chrome and copy, and the slip is excluded by the same
reasoning that lets a question's own text contain whatever the person typed.
Every number the *product* says stays spelled out.

### Two more traps worth naming

**The Meter's "What moves this?" is an a11y trap as drawn.** `.meter-top`,
`.meter-track` and `.meter-ticks` are all `aria-hidden="true"`
(`Meter.test.tsx:61`) — the drawing is decoration over one real progressbar.
A control placed *beside the percentage* lands inside that hidden subtree and
becomes unreachable. It has to sit outside the drawing.

**Four tests are zero-collection proofs. They are guards, not chores.**
`home.spec.ts:462` (the exact storage key list), `drawer-drag.spec.ts:347`
(nothing about drawer height is written down), `recommendations.spec.ts:~240`
(nothing stored but the answers), `list-orbs.spec.ts:406`. §2, §3, §4 and §7
all add state that could trip them — including §7.1's *"give the brain the
whole panel once per run"*, which must not remember that it did. **If one of
these goes red, that is the signal working.** Protect; never rewrite to pass.

### Type and controls — the map for BS-01

**116 of the panel's 137 declared font-sizes are under 15px**: 64 under 13px
(hard-floor violations), 36 at 13–13.9, 16 at 14–14.9. `Home.css` owns 19 of
the sub-13px ones. Two are dead CSS (`Home.css:530`, `FileDrawer.css:828`) and
can just go.

**The finding that changes the shape of the work: the type scale is declared
but never emitted.** `design/tokens.json:128-136` holds a real scale — display
32 / wordmark 26 / question 22 / section 17 / body 15 / support 13 / label 12
caps — and `scripts/tokens.mjs` emits **none of it**. `src/panel/tokens.css`
has colours, radii, motion and `--target-min`, and **not one `--type-*`
property**. Every size in the panel is a hand-typed literal. So §1 is not "one
pass over the type scale"; it is 116 individual edits *unless we emit the scale
first*, in which case it is a token change plus a mechanical sweep and every
future calibration is one line.

**BS-01 therefore splits in two:**
- **BS-01a · Emit the scale.** Extend `scripts/tokens.mjs` to write the `type`
  group into `tokens.css`, with the floors already applied (`support` 13 →
  the new smallest, `body` 15, plus the instructional step). The token file's
  own note already says *"never below 14px anywhere"* while 100 declarations
  sit below 14 — the doc and the CSS have been disagreeing for a while.
- **BS-01b · Sweep the literals onto the tokens**, file by file, biggest
  first: Home (19), BrainGlobe (6), NodeSummary (6), Breadcrumb (5), FileTree
  (5), FileDrawer (5).

**The geometry constants move with the type, and this is what actually
breaks.** `DRAWER_ROW_HEIGHT = 44` (`src/core/drawer/height.ts:85`) is the
number four "the row is exactly 44px" e2e claims mirror
(`file-accordion.spec.ts:571`, `:643`, `list-orbs.spec.ts:316`,
`section-health.spec.ts:767`). Raising row type without raising that constant
breaks all four at once — and the dock has its own welded set
(`FLOW_NAV_TARGET === 44`, `navPaintHeight() === 26`,
`FLOW_NAV_LABEL + navHitPadding()*2 === 44`, `src/core/flow/dock.test.ts`).
**Raise the constants in core first, then the CSS**; the specs follow the
constants, which is the order that keeps the gate honest.

**Blast radius on the suite: ~88 assertions LIKELY to break**, ~101 possible,
~90 unlikely (the 44px *floors* only get happier). The likely set is exact-band
heights (20), no-clipping / fits-in-400px claims (41), explicit font-size
assertions (7) and reserved-room windows (20).

**One conflict §1 has to resolve, not just absorb.** `brain-globe.spec.ts:1274`
welds the globe label's tracking to its size (`tracking ≈ size × 0.08`) and
pins `11 ≤ size ≤ 14`. That is not test pedantry: `core/flow/globeLabels.ts`
exists *because* uppercase at `.08em` runs about a third wider, and the whole
label-shortening budget is computed from it. §1's "section labels become 13px
sentence case" therefore has a **core logic consequence** on the stage — either
the globe keeps its caps (and is exempted, on the grounds that map labels are
conventionally caps, which the review itself concedes) or `globeLabels.ts`'s
budget is recomputed. Recommend the exemption; it is one sentence in the doc
and no code.

**Icon-only controls: 12, not 6** — the review undercounted by half. `Sheet`'s
close, `ReadOnlyBlock`'s copy, `Recommendation`'s hide (up to 3 at once),
`FlowProgress`'s home, the narrator toggle, Flow's rephrase, Home's upload
(shipped this morning), the two drawer mode buttons, the globe's back and home,
the brain turn cue, and FileTree's orb toggle (one per expandable row). Thirteen
if the drawer handle counts — it is focusable and keyboard-operable with no
visible text.

**Filled primaries: one real violation and five zeroes.** `Flow` shows **two**
whenever AI Assist is activated — the AssistBar's "Copy the prompt"
(`AssistBar.tsx:100`) and the cluster's Next (`Flow.tsx:2469`) are in the same
form. Zero on `SkillsShare`, `Multiples` at rest, `FileDrawer`, and on Home in
the started-with-no-recommendation branch — which §6 fixes by construction when
the recommendation becomes the hero. One implicit primary to make explicit:
`ActionsFileView.tsx:69` omits `variant` and relies on the default.

### Prompt assemblies — the map for BS-03b and BS-11

**15 code paths put text on the clipboard or into the person's AI.** Ten are
copy-prompt builders; three are file bodies (they *are* the context); two relay
the AI's own reply back.

**Only 4 of the 10 carry anything beyond the answer in front of the person** —
`interviewMePrompt` (`src/core/flow/interviewMe.ts:56`, carries `goal_want`
alone), the `terms_depend_on` rewrite (`source.ts:1037`, the one builder that
reaches for a prior answer), `proofQuestion` (`proofAdapter.ts:149`, which *is*
one prior answer), and `evaluationPrompt` (`proofSource.ts:74`, the richest —
both replies plus the goal). The other six are `interpret.buildPrompt`
rewrites that receive `(raw, ctx)` and use only `raw`.

**Three builders run inside repeatable blocks and none names its record** —
`role_mandate` (`source.ts:436`), `initiative_description` (`source.ts:710`),
`skill_steps` (`skillsSource.ts:205`) — plus `interviewMePrompt`, which renders
on eleven in-record text questions. The plumbing already exists:
`Flow.tsx:1336-1342` puts `ctx.record` on the context handed to every builder,
and `repeatableRecordTitle` (`generate.ts:74`) is the function to call, because
it is what the file itself prints — so a prompt and Context.md cannot disagree
about what a record is called. **VB-141 needs no new plumbing.** The comment at
`skillsSource.ts:201-204` claiming the record is unreachable is stale and gets
deleted with the change.

**The standing law is not violated anywhere today.** All ten are already behind
sanctioned chrome — `ReadOnlyBlock` on screen, or `ReadOnlyBlock` one press
behind the AssistBar expander. §3.1 and VB-141 can both be built without moving
that line.

**The file, measured.** Generated in-memory from the real `contextModules` with
every text answer set to that question's own shipped `ideas[0]`: a fully
answered file with two records per block is **7.6 KB / 191 lines**; the
realistic heavy end (six records, long assisted answers) is **29 KB / 288
lines**. Clipboard size is a non-issue at three orders of magnitude under any
limit.

**But `ReadOnlyBlock` has no length ceiling** —
`src/panel/components/ReadOnlyBlock.css` sets `pre-wrap` with no `max-height`
and no `overflow`. A 191-line file inside the expander is roughly 4,700px of
single pre-wrap run in a 400px panel. It will not break layout (the two-zone
flow caps and scrolls it) but it makes the expander a very long internal scroll
with the copy button pinned at its top. The drawer already solved this:
`FilePreview` splits one `<pre>` **per section** and puts the whole thing behind
a disclosure (`FileDrawer.tsx:1298-1318`). BS-03b borrows that treatment.

**Three traps BS-03b must not fall into:**
1. **The baseline must not get the file.** `promptFor` returns the same text
   for `baseline` and `withContext` deliberately (`proofAdapter.ts:162-164`);
   inlining has to branch on `genKey` or the proof measures nothing.
2. `attachHintFor` and its fallback sentence (*"Or just paste Context.md's text
   directly"*) must not both fire — `Flow.tsx:2283-2287` becomes conditional
   when the file rides inside.
3. `SKIPPED_ANSWER_MARKER` (`generate.ts:34`) starts being read by the AI
   rather than only by the person. Keeping it is probably right — it tells the
   AI not to guess — but it is a decision, not an accident.

**What the prompts could honestly carry** (the audit lists it per builder, with
question ids): the voice six — `voice_directness`, `voice_formality`,
`voice_qualification`, `shape_structure`, `shape_ask_placement`, `shape_length`
— plus `peeves` and `never_words` are the highest-leverage additions to any
rewrite prompt, because the AI is writing in the person's voice and those are
the exact levers. `skill_steps` is the standout: `skill_trigger`,
`skill_inputs`, `skill_tools` and `skill_data_home` are all answered *before*
it in the same record and all currently unused — a complete brief sitting idle.

### Two defects the audit turned up

**DEF-1 · AI Assist is broken in the Skills interview.** Skills mounts with
`answersKey={ANSWERS_KEY.skills}` (`App.tsx:295`), so `Flow` loads only
`wb:answers:skills`. `interviewMePrompt` reads `goal_want` and `goal_service`
from that store, where they do not exist — so **every AI Assist in Skills says
"your AI" instead of naming the service, and never shows the service door**
(`AssistBar.tsx:114-121`). Anything cross-file needs a second
`getLocal(ANSWERS_KEY.context)` read. This also caps what VB-141 can do in
Skills until that read exists.

**DEF-2 · The grader audits a file it has never seen.** `evaluationPrompt`'s
rubric asks the AI to judge "anything the with-Context answer invented that the
file doesn't support" and "what this Context.md is missing" — with the file
absent from the prompt. §3.1's inlining fixes this for free at the grade step.

### One decision this forced — RESOLVED (Adam, 2026-08-27)

**The file carries the reference examples; prompts about something else do
not.** Not an exclusion — a scope rule, and it needs no new guardrail.

`reference_example_primary` and `reference_example_second`
(`source.ts:1145`, `:1166`) are the only two questions in the interview whose
instruction is **paste**, not **describe**. Every other text answer is authored
on the spot, about the person, in response to our question. These two are a
real document lifted out of their actual work — and real documents contain
other people. `docs/GUARDRAILS.md` already draws exactly this line for the one
other place the product takes a paste: *"the raw chat export never touches
storage… their history contains other people — pasted emails, client details,
colleagues."* Same category of input, already treated as its own thing.

They are also the only unbounded fields in the file, and so the single biggest
variance between a 7.6 KB file and a 29 KB one.

**How it builds:** the two keys carry a `scope: 'file'` marker (or the
assembler holds the pair by id — decide at BS-03b, it is one line either way).
The file generator is unaffected. Prompt builders that carry prior context skip
them. The proof's **with-file** run is not "a prompt about something else" —
the file is the point there, the person is deliberately handing their AI their
context, and the examples are exactly what teach it their voice — so it
carries them, as does anything else that sends the file itself.

The V2.9 decision this refines is `docs/V2.9-REFINEMENT.md`'s decision 5
(VB-141's comfort check), answered "green light" as *nothing excluded*. That
answer stands for every other answer in the file.

---

## Build order

The spec's own order holds, with one change: **§1 is not small.** "No rendered
text below 13px" in a 400px panel moves height laws that a large share of the
geometry specs assert against — the two-zone flow cap, the drawer peek, the
44px band, the fits-in-400px claims. It stays first, because everything
inherits it, but it is budgeted as real work with its own gate rather than as
a stylesheet pass.

1. **BS-00 + BS-01** — build identity, then the calibration. Everything after
   this inherits the type scale, so doing it later means re-measuring twice.
2. **BS-02 + BS-09** — the feedback door and the splash. Both are small, both
   want BS-00's stamp, and shipping them early means the earliest testers
   already have a way to answer back.
3. **BS-03** — the proof round trip. The spine.
4. **BS-05** — pace, which is what gets anyone to BS-03 at all.
5. **BS-04** — proof two, the new surface.
6. **BS-06 + BS-08** — Home and Multiples, both mostly subtraction, both
   inheriting BS-01.
7. **BS-07** — drawer chrome and the leaf card, the largest new UI, and the
   one with a blocking open question (O1, O2).
8. **BS-11** — VB-142, whenever there is a gap; it depends on nothing.

House rules unchanged: vertical slices, every slice behind a full
`npm run check`, one commit per slice, all new copy `[DRAFT]`-marked for the
morning pass.
