# North Star — the app, the membership, the portal

Captured 2026-08-26 from Adam's reframe; the four collisions below were DECIDED same-day.
This document is the end state every round gets checked against. If a task appears to fight it,
stop and say so — the same rule GUARDRAILS.md carries, one level up.

## The tagline

> **How you do anything is how your AI does everything.**

(SUPERSEDES all earlier lines — Adam, 2026-08-26, during V2.6: "That supersedes all others and
is the standard now." It replaced "Workbrain. Making the way you do anything how your AI does
every thing." Lands on Home's lockup, the splash, the store listing, and the site.)

## The model

**Free, forever, identity-free:** everyone downloads the app and builds the context and skills
base for free. The install is the sign-up. This upgrades anyone, and it is the business
proposition's foundation — we give away the thing that makes AI know its person.

**Membership (paid):** the extension becomes the front of a centralized way to manage your
Workbrain —
- a **private skills library**: add new skills and shared skills from other people and places to
  your profile instantly (the pack system GUARDRAILS.md already legislates: data, never code;
  referenced with "make my own copy", per OPEN.md #3);
- **evaluate my file**: one button returns recommendations and uses AI to apply them — the
  person's own AI (DECIDED, below), through the copy/run/paste-back grammar the product already
  teaches, auto-applied through the existing parse/restore path;
- **evergreen monitoring and manicuring**: the freshness machinery (half-lives, stale verdicts,
  VB-110's dates) plus the update-and-prune ritual, with nudges arriving portal-side (DECIDED,
  below), never as extension notifications;
- **synchronization across devices** (shape flagged below).

**The portal** (the site — the Stripe/Cal.com stack already live there): where members and
non-members access services —
- (a) Workbrain training;
- (b) member resources — locked for non-members, "coming soon" for now;
- (c) **TIM services**: custom skills building, actions configuration, and hive-mind setups for
  teams and enterprises.
Individuals expand their own personal Workbrain to make themselves more powerful than they
started. Scheduling blocks of time, requesting full implementations — managed in the portal,
reachable from the app.

## Why the architecture already points here (the viability audit)

- **The file is the API.** Generate → parse → answers is lossless, so anything the portal or an
  AI ever produces can land as a file the extension already ingests. "AI updates your file" is
  the restore path wearing a new button.
- **Evaluation exists in embryo**: the proof loop is BYO-AI evaluation; `core/recommend` already
  produces recommendations; interview-me is the gather-via-their-AI pattern.
- **Freshness is built**; the paid tier sells acting on it.
- **Packs were always in the DNA** (GUARDRAILS' pack rules; OPEN.md #3).
- **Sync has a friendly shape**: per-question `answeredAt` makes latest-wins-per-question merge
  natural.

## The four collisions — DECIDED 2026-08-26

1. **Identity.** The free product stays identity-free forever; membership identity lives
   portal-side; the extension accepts a **pasted member key** (v1 — no OAuth surface, no
   store-review risk). GUARDRAILS' "no accounts in the individual product" stands, scoped exactly
   as written.
2. **Evaluation runs on the person's own AI** — shape (a). The button builds the evaluation
   prompt, hands it to THEIR AI, and auto-applies the paste-back. No transmission to us, zero
   inference cost, ships on today's architecture. Our-server evaluation (shape b) is BACKLOG,
   behind its own separately-consented story.
   *Recorded interpretation on sync (flag — correct me if wrong):* "a" read as the
   no-transmission stance generally, so sync starts with the non-transmitting options — the file
   through the portal by the person's own hand, and chrome.storage.sync where its ~100KB quota
   allows — with member cloud sync joining the (b) backlog behind the same consent story.
3. **The degradation law extends to the paid tier** (DECIDED yes): the library keeps its last
   good fetch, sync queues offline, evaluation falls back to copy/paste. Nudges are portal-side
   email; the extension never notifies (GUARDRAILS stands).
4. **Money never enters the extension** (DECIDED yes): purchases, scheduling, and service
   requests live on the portal; the extension deep-links out. Also the safe side of Chrome Web
   Store policy.

## Where current work could fight the end state (watch these)

1. **Skills need an interchange schema** — stable ids, versions, provenance, referenced-vs-copied
   — BEFORE the library exists and before more skills features land. Retrofitting identity onto
   hand-built skills is the one genuinely painful migration. **Queued as the next spike; awaiting
   Adam's go.**
2. **Storage keys assume one person, one device.** The sync design should be written (not built)
   before the key-space grows further.
3. **The splash stays pinned** — it is where the tagline and the free→member story land.

## What this changes about nothing

The guardrails remain law for the free product, unsoftened. Every paid feature is an enhancement
over a manual path that keeps working on a plane. The trust proposition — local, yours,
no identity, nothing transmitted — is the moat, not the obstacle.


---

## The claim changes (D3, Adam, 2026-09-02)

**Decided:** *"It has to be defensible or it's worthless."*

### What we used to say

That an AI starts from zero every time, and the file is what gives it a
starting point. Some version of *"your AI knows nothing about you"* runs
through the splash, the orientation beats and the site.

### Why it is not defensible

Adam ran the first real baseline in his own Gemini account and got back three
polished, fully-specific descriptions of his actual job — dashboards for
leaders, IT support response times, service delivery health. That account
remembers him. `core/proof/grounded.ts` on that answer returns **zero** namings:
it never once says it is guessing.

Anybody who leans on one assistant has the same thing, and they are the people
most likely to try this product. To them, "your AI knows nothing about you" is
plainly false on the evidence in front of them — and a claim somebody can
disprove in one paste takes the rest of the argument down with it.

### What we say instead

> **Your AI already knows some of this — in a form you cannot see, correct, or
> take anywhere.**

Every part of that is checkable, and the same run is the evidence:

| Claim | How it is checked |
|---|---|
| It already knows some of this | Ask your usual assistant to describe your work. It will. |
| You cannot see it | There is no page that shows you what it remembers, only settings that clear it. |
| You cannot correct it | You can add to it. You cannot open it and fix a wrong line. |
| You cannot take it anywhere | Gemini knew Adam. Claude and ChatGPT did not, and will not. |
| The file is the same knowledge, portable | It is a text file. It opens in anything and pastes into everything. |

### What this costs, and why it is still the better trade

It is a harder bar. "Nothing versus something" is an easy comparison to win;
"an invisible thing you cannot move versus a file you own" asks somebody to
value portability and control, which takes a sentence more to explain.

It is also the only version that survives the person who says *"but Gemini
already does this"* — which is the objection the product will meet most often,
from exactly the audience that matters. The old claim had no answer to it. This
one is an answer to it.

### Where it has to land

- The splash's orientation beats (`ORIENTATION_WHY_BEATS` in
  `core/flow/overrides.ts`) — currently "AI starts from **zero** every time".
- Any site copy in `../modelcitizen` making the old claim. **Not touched from
  here** — that repo is Adam's, and this is a note that the work exists.
