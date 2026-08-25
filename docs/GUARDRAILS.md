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
holds. `wb:report.scores` (a self-reported 0–10 the person typed) is on the right side of it;
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
- A tour, a coach-mark overlay, or a "what's new" modal.
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
