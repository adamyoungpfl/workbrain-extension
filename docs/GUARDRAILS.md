# Guardrails

Hard constraints. Every one of these exists because breaking it destroys something the product
cannot recover — usually trust, sometimes store approval, sometimes both.

These are not preferences. If a task appears to require breaking one, **stop and ask** rather
than finding a clever way around it.

## Never, without exception

| Rule | Why |
|---|---|
| **No analytics, telemetry, error reporting, or beacons.** Not Sentry, not Plausible, not a pixel, not a "just count installs" ping. **This includes local-only measurement that never leaves the device.** | A deliberate choice, not a compliance necessity — and stronger for being one. *Correction, 2026-08-24:* this row previously claimed the store forbids collection. It does not. The [User Data FAQ Q8](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) permits analytics "reasonably necessary to maintain, secure, or measure the performance and reliability" of disclosed functionality, with disclosure. We are stricter than required because the promise is the product. What the store *does* say (FAQ Q3, verbatim) is that local-only handling **must still be disclosed**: *"even when data is processed or stored locally on a user's device and is not transmitted."* So "we keep it on-device" buys nothing — it still ticks a category, and the install panel has no field for "locally only." |
| **No accounts, logins, email capture, or identity of any kind** in the individual product. | The install is the sign-up. This is the entire trust proposition. |
| **No `<all_urls>`, no `tabs` permission, no `scripting` beyond the four named AI origins.** | Broad host access raises review scrutiny and frightens the exact user we are designing for. |
| **No permission requested at install beyond `storage` and `sidePanel`.** Host permissions are optional and requested in context. | Install is the highest-friction moment in the product. |
| **The raw chat export never touches storage.** Parse in memory, persist only what the person ticked. | Their history contains other people — pasted emails, client details, colleagues. |
| **Never transmit the person's content anywhere.** Not to us, not to their AI without them seeing the exact text first, not to a pack publisher. | — |
| **A skill pack is data, never code.** No HTML, no `<script>`, no `eval`, no `dangerouslySetInnerHTML`. Markdown rendered as text. | A pack is untrusted third-party content fetched over the network. Treat it like a hostile input, because one day it will be. |
| **No remote code, no CDN at runtime, no dynamic `import()` of a URL.** Everything ships in the bundle. | MV3 forbids it and the store will reject it. |
| **No modal dialogs.** Sheets only, and only for short self-contained tasks. | Nothing in this product is destructive enough to need confirming. A modal that teaches gets dismissed unread. |
| **No feature that only works online.** | The product must work on a plane. |

## The one thing the product sends, and who sends it

**BS-02's feedback door (2026-08-27).** The beta exists to collect what testers
think, and until it shipped there was no way for one to tell us anything. This
row exists so that is a written decision rather than a quiet exception.

| Rule | Why |
|---|---|
| **The feedback door may open the person's own mail client with a draft, and may put a diagnostic block on their clipboard. It may not send anything itself.** No fetch, no beacon, no endpoint — `src/core/feedback/report.ts` returns a `mailto:` string and a block of text, and has no client of any kind. | The rule above is *no silent collection*, not *no collection*. A draft the person reads and presses send on, in their own client, is the opposite of silent. |
| **The diagnostic block carries build, screen, question id and a timestamp — and nothing the person authored.** Its shape is a closed set of typed fields with nowhere to put an answer, not a filter over free input. | A filter is something somebody forgets to update. A shape with no field for an answer cannot leak one, and `report.test.ts` walks a fully-answered flow to prove it. |
| **The question ID is in; the question TEXT is out.** | `role_mandate` says where somebody was. The wording says nothing more, and moving interview content around starts a habit. |
| **The sheet states what the block holds, on the sheet, above the buttons.** | "We take nothing you wrote" is a claim somebody should be able to check before they act, not after. The block itself is four lines and they can read it. |

**And one thing the prompt now asks for (R-16, 2026-08-31).** The with-file
proof prompt ends with a visible block asking the AI to report which parts of
the file it drew on, what it needed and could not find, and what it guessed at.

| Rule | Why |
|---|---|
| **The ask is IN the prompt the person reads before sending.** It is not hidden, not appended after they press copy, and not different from what they see. | The clause above is "not to their AI **without them seeing the exact text first**". A hidden instruction breaks precisely that, and it is the first thing anybody auditing this product would look for. Visible extra instructions are prompt; invisible ones would be the product doing to its users what it warns them about. |
| **Nothing it returns is stored.** `core/proof/selfReport.ts` parses the pasted answer on render and the result dies with the screen. | A log of what somebody's AI said about their file, accumulated across runs, is a usage log — the flat ban above. The authorship test settles it cleanly: the person did not type it and we did not observe it. |
| **It is shown as a CLAIM, in those words.** "What your AI said it used", and a line saying to treat it as a hint rather than a finding. | A model's self-report is not instrumentation. Read as fact, a wrong one would have somebody rewriting a good file. |
| **The baseline run never carries it.** | The two conditions differ by the file and nothing else, and asking a model with no file which parts of the file it used would also tell it a file exists. |

**And the run history (D2, Adam, 2026-08-31).** `docs/MEASUREMENT-SPINE.md`
keeps the same task's answers across stages, so a person can see where they
started against where they are.

| Rule | Why |
|---|---|
| **The product may keep runs the person PERFORMED and JUDGED** — the task, what their AI wrote back, their own verdict, and the gaps the AI named. | Authorship, not transmission. They pasted the answer and ticked the verdict; the product observed neither. Same footing as `wb:report.scores`, kept since R1-11. |
| **This SUPERSEDES R1-11's "neither answer ever reaches the report"** (ratified 2026-08-31). What that claim protected survives in a narrower and more useful form: **we do not accumulate AI output nobody judged.** A run is written at the verdict — the moment somebody judged it — and never before. | The original was absolute and, it turned out, not quite true of the product it described: `wb:answers` had held both answers in single slots since R1-11. What the report gains is a HISTORY, and a single slot cannot say "compared to where you started" because the second run overwrites the first. The narrower sentence is the one a future change has to answer to. |
| **It may keep NOTHING about their behaviour around those runs.** Not when they opened the proof, not how often, not how long they took, not whether they abandoned one. | Those are facts about the person rather than about the work, and not one of them is authored. This is the line the authorship test draws, and a run history is exactly the feature that would blur it if nobody wrote it down. |
| **Of a self-report, only `MISSING` is kept.** `used` and `unsure` are read on the screen and dropped. | `MISSING` feeds a decision — it is the evidence a question is retired on (D5). The other two inform nothing later, and keeping data because it might one day be useful is how a usage log begins. |

**And the groundedness read (D2, Adam, 2026-09-02).** The comparison counts, on
screen, how many lines of a pasted answer named something the AI could not know.

| Rule | Why |
|---|---|
| **It reads what came back. It never adds anything to the prompt.** | The R-16 self-report is kept off the baseline because asking a model which parts of the file it used would tell it a file exists — the two conditions must differ by the file and nothing else. That reasoning holds, which is exactly why this does not ask. |
| **Nothing it computes is stored.** `core/proof/grounded.ts` runs on render and the result dies with the screen. | A count of how grounded somebody's AI sounded, accumulated across runs, is a usage log. The authorship test settles it: they did not type it and we did not observe it. |
| **It is shown as a COUNT with its caveat attached** — "a count of what it admitted, not a check of whether it was right." | A regex over English cannot know whether a claim is true. Read as a score, a low number would have somebody rewriting a good file. |

**Still forbidden, unchanged:** anything that measures without being asked,
anything that reports on its own schedule, and any count of what the person did
— including local-only. The test in the next section is what separates them: a
build number is a fact about the SOFTWARE, and a count of panel opens is not.

## Degradation is mandatory

Every enhancement falls back to the manual path, **silently**.

| If this fails | Then |
|---|---|
| Composer selector not found on an AI site | Panel returns to copy-and-paste. Says nothing. No error, no "unsupported site" banner. |
| Pack fetch fails | Keep the last good pack. Retry later. Do not tell the person unless they opened the pack screen. |
| Export parse fails | "I couldn't read that one. Here's how to get a fresh export." Never an error code, never a stack trace. |
| Storage write fails | Keep the in-memory state, tell them plainly, offer the download. Never lose an answer silently. |
| Migration fails | Restore from the pre-migration export written automatically before it ran. |

There is no state in which this product is broken. Only states in which it is doing less.

## The test for anything that looks like measurement
**The test, when something looks borderline:** *a number the person typed is data; a number the
product observed is telemetry.* Authorship, not transmission, and not derivability.

That last word matters. `docs/ARCHITECTURE.md`'s "nothing derived is stored" is the **wrong guard**
for this class of question — `wb:recs` was admitted on the argument that a dismissal isn't
derivable, and a usage log makes exactly the same argument and wins. Authorship is the guard that
holds. `wb:report.scores` (what the person ticked, and the length of the checklist
they ticked it against — `{ value, of }`, both authored: the count is their ticks
and the denominator is their own steps) is on the right side of it;
a count of panel opens is not, however local it stays.


## Accessibility floor — not negotiable, not deferrable

- Every control ≥ 44 × 44 px, including icon buttons.
- Focus visible on everything focusable: 2px `--primary` ring, 2px offset. Never `outline: none` without an equal replacement.
- Text contrast ≥ 4.5:1. Interactive borders ≥ 3:1 (`--border-i`, never `--divider`).
- Nothing distinguished by colour alone.
- `prefers-reduced-motion` honoured by every cue, and the still version **still carries the instruction**.
- Full keyboard path through every flow. Arrow keys within pill groups.
- Status changes announced via `aria-live="polite"`. Nothing steals focus.

## Things that look helpful and are not

An agent will be tempted by all of these. Do not add them.

- A settings page. Two toggles live in the header; everything else is a default we chose.
- **A dismissible overlay pointing at UI, or a "what's new" modal.**
  *Amended 2026-08-27 (BS-09/BS-10, Adam's D10).* This row used to ban "a
  tour" outright, and had been stale since V2.5 VB-114 shipped the dime tour
  — three real interview steps, with the narrator reading them and the
  runner's `skipIf` keeping them away from anyone already underway. That is
  in-flow orientation, which is what the V1.1 plan argued for when it rejected
  a coach-mark overlay in the same breath. §9 adds a door to those same slides
  from the splash, because it is the one moment somebody accepts an
  orientation. **What stays banned is the overlay:** anything laid over the
  interface pointing at parts of it, and anything that interrupts to announce
  itself.
- Notifications of any kind outside the panel.
- A confirmation dialog before anything.
- Auto-advance after selecting a choice — it removes the person's sense of control.
- A composite score out of 100. Real metrics only.
- A dollar figure the person did not author by entering their own hourly rate.
- Streaks, badges, gamification, or nudges framed as guilt.
- A dependency that "just" adds a nice animation, date library, or icon set.

## Permission tiers

Requested in this order, never earlier, never bundled.

| Tier | Grants | Requested when |
|---|---|---|
| 0 | `storage`, `sidePanel` | Install |
| 1 | Write to the composer on four named AI origins | They click "put it in <AI> for me" |
| 2 | Read what **the person types** — never the reply | Only if they turn on ongoing measurement |
| 3 | Read the AI's reply | Explicit, per site, never default. Ships last, if at all. |

Tier 2 and tier 3 are different claims and must never be requested together or described in the
same sentence. Every measurement in the product runs at tier 2.
