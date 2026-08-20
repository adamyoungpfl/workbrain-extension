# Handoff — starting the build

Read in this order. It is about 45 minutes of reading and it saves the first three sessions.

| # | File | What it settles |
|---|---|---|
| 1 | `CLAUDE.md` | How to work in this repo. Loaded automatically every session. |
| 2 | `docs/GUARDRAILS.md` | The hard constraints. Read before writing anything that touches permissions, storage, network or the person's data. |
| 3 | `docs/workbrain-spec.html` | The product. 17 sections. §02 is the binding constraint, §05 is what the product must survive, §13–14 are the audit and the report. |
| 4 | `docs/design-system.html` | Tokens, components, states, motion, accessibility, and §08 — the copy rules, which are binding. |
| 5 | `docs/ARCHITECTURE.md` | Module map, storage contract, message contract, the `core/` purity rule. |
| 6 | `docs/RELEASE-1.md` | The actual backlog with acceptance criteria. |
| 7 | `docs/TESTING.md` | How to verify an MV3 extension, including driving the panel in Playwright. |
| 8 | `docs/OPEN.md` | Unresolved product decisions. **Do not resolve these in code.** |

Reference prototypes — behaviour, not code to copy:
`docs/prototype-v1-sidepanel.html` (cue system, three hand-off postures)
`docs/prototype-v2-os.html` (home surface, drift, capture, packs, briefing)

## The one thing you must supply before starting

**The interview questions.** `src/core/flow/flow.ts` is a stub. The real content is already on
this machine at `../modelcitizen/src/lib/contextInterviewFlow.ts` (1,447 lines). Port it at R1-05
through an explicit adapter — the source types are close to `src/schema/flow.types.ts` but not
identical.

The wording is the product's voice. An agent asked to "write the interview questions" will
produce competent, generic ones, and the thing that makes this product sound like a person
talking will be gone. Port verbatim.

## How to run the first session

1. **Plan mode first.** Give it `CLAUDE.md`, `GUARDRAILS.md`, `ARCHITECTURE.md`, `RELEASE-1.md`
   and ask for a plan for R1-01 through R1-04 only. Read the plan. Check it against the
   acceptance criteria yourself before approving.
2. **One task at a time**, in order. Each ends with `npm run check` green and the extension
   loadable. Do not let it batch four tasks and hand back a large diff.
3. **Commit per task**, message referencing the task id.
4. **Stop at R1-05.** That is where the real question content lands, and it needs your eyes.

## Where an agent will drift, and what it looks like

| Drift | Looks like | Correction |
|---|---|---|
| Adding "just a little" telemetry | A `track()` helper, a Sentry init, a version-check ping | `GUARDRAILS.md` — zero collection, not minimal |
| Reaching for a dependency | `date-fns`, `lucide-react`, `marked`, `zustand` | `docs/DEPENDENCIES.md` — two runtime deps, both justified |
| Putting logic in components | `chrome.storage` called from a `.tsx` | The `core/` purity rule. If it is worth testing, it moves. |
| Storing derived state | `progress`, `percentComplete`, `currentGate` in storage | Derive on render. Stored progress drifts and starts lying by month four. |
| Improving the copy | "Continue", "Get Started", "Oops!" | Copy rules in `CLAUDE.md`, examples in design system §08 |
| Adding a confirmation dialog | `window.confirm`, a `<Modal>` component | Nothing here is destructive. Sheets only. |
| Making an error visible | "Unsupported site", a red banner when a selector is missing | Degrade silently. `GUARDRAILS.md`, degradation table. |
| Inventing a metric | A score out of 100, an estimated dollar saving | `core/report/METRICS.md` |
| Requesting host permissions early | `host_permissions` in the manifest | Optional, in context, tier 1 and later only |

## Verifying it actually works

`npm run check` is the gate, but two things need a human:

- **Load it unpacked and use it as a stranger.** Do not use the keyboard shortcuts you know
  about. Do not skip the reading. The failure mode this product has is that it makes sense
  to the person who built it.
- **Run one real person through the interview without helping them.** Say nothing for fifteen
  minutes and write down every place they hesitate. That list is the next sprint.

## What is deliberately not in this repo

The marketing site, the skills library page, and pack hosting all live on the existing Model
Citizen site. The extension references them by URL and knows nothing else about them.
