# CLAUDE.md — Workbrain extension

Read this first, every session. It is the operating manual for this repo.
If something here conflicts with a doc in `docs/`, this file wins and the doc is stale — say so.

## Required reading — loaded every session

@docs/GUARDRAILS.md
@docs/OPEN.md

Everything else in `docs/` is **not** auto-loaded. Read it with the Read tool when the task
touches it, and do not read the big HTML files end to end — go to the section you need:

| Read this | Before |
|---|---|
| `docs/ARCHITECTURE.md` | any structural work, storage, or messaging |
| `docs/RELEASE-1.md` | starting any task — it holds the acceptance criteria |
| `docs/TESTING.md` | writing tests |
| `docs/DEPENDENCIES.md` | adding any package |
| `docs/workbrain-spec.html` | product questions. §02 constraint, §05 lifecycle, §13–14 audit and report |
| `docs/design-system.html` | UI work. §04 components, §05 patterns, §06 motion, §07 a11y, §08 copy |
| `docs/STORE.md` | manifest or listing work |
| `docs/CONTENT-SOURCES.md` | **any task needing copy or logic that may already exist in ../modelcitizen** |
| `docs/prototype-v2-os.html` | behaviour reference only — do not copy its code, it is a mock |

## What this is

A Manifest V3 Chrome extension. A side panel that builds and maintains three plain-text files
describing a person's working context, their repeatable methods, and what they want automated.

**Everything runs in the browser.** No accounts, no server of ours, no AI calls of ours.
The person's own AI does all generative work via copy/paste or an optional assisted hand-off.

Product spec, design system and prototypes live in `docs/`. Read `docs/GUARDRAILS.md` before
writing any code that touches permissions, storage, network, or the person's data.

## Stack

- React 18 + TypeScript (`strict: true`, no `any` without a comment explaining why)
- Vite + `@crxjs/vite-plugin` for MV3 packaging
- Vitest for unit tests, Playwright for integration
- No UI framework, no CSS-in-JS. Plain CSS with custom properties generated from `design/tokens.json`.

## The one architectural rule

```
src/core/**  →  pure TypeScript. No `chrome.*`. No DOM. No fetch except through an injected client.
src/panel/** →  React. May call core. May call chrome.* through src/core/storage only.
src/background/**, src/content/**  →  thin. Message routing and DOM poking. No business logic.
```

If logic is worth testing, it belongs in `core/` and it is tested without a browser.
When you find yourself importing `chrome` into `core/`, you have put the logic in the wrong place.

## Commands

```bash
npm install
npm run dev          # Vite dev build, watch mode, writes dist/
npm run build        # production build -> dist/
npm run zip          # build + package dist/ as dist.zip for the Chrome Web Store
npm run typecheck    # tsc --noEmit
npm run test         # vitest run  (unit, core/ only, fast)
npm run test:watch
npm run e2e          # playwright, loads dist/ as an unpacked extension
npm run a11y         # axe-core pass over panel surfaces
npm run audit        # guardrail checks — deps, core purity, permissions, copy location, reading level
npm run check        # typecheck + audit + test + build + e2e + a11y — the gate before you say "done"
npm run check:fast   # the half needing no browser — typecheck + audit + unit + build (~30s)
npm run check:e2e    # the half that does — build + e2e + a11y (~6 min on an idle machine)
```

Load unpacked: `chrome://extensions` → Developer mode → Load unpacked → select `dist/`.

**Dev-only reset (V1.2 VB-09).** In a development build, `Ctrl+Alt+Shift+R` anywhere in the panel
clears `chrome.storage.local` *and* `.sync` and reloads to the welcome screen — no DevTools needed.
It is gated on `import.meta.env.DEV` and is absent from production builds; `src/panel/devReset.ts`
explains why that is not the settings page `docs/GUARDRAILS.md` forbids.

**You must build with `npm run build:dev` for the chord to exist.** `npm run build` forces
`NODE_ENV=production` — Vite does this for the build command regardless of `--mode` — so
`import.meta.env.DEV` is false and the whole handler is dead-code-eliminated. A `dist/` from
`npm run build` has no reset in it, by design. The dogfooding loop is:

```bash
npm run build:dev        # dist/ WITH the reset chord
# chrome://extensions -> reload icon on Workbrain's card
# open the panel -> Ctrl+Alt+Shift+R to wipe and land on the welcome screen
```

Ship and verify with `npm run build` / `npm run check`, which are what `npm run zip` uses.

**`npm run dev` writes a `dist/` that is NOT self-contained.** It is a shell that loads its code
from the Vite dev server on `localhost:5173`, so it only works while that terminal is running. Stop
the server and the loaded extension breaks with:

```
Failed to construct 'WebSocket': The URL 'ws://localhost:undefined/?token=…' is invalid
WebSocket connection to 'ws://localhost:5173/?token=…' failed: net::ERR_CONNECTION_REFUSED
Uncaught (in promise) TypeError: Failed to fetch
```

That is not a code problem — the `dist/` is pointing at a dev server that is gone. Fix it with
`npm run build:dev` and reload the extension.

**Rule of thumb:** use `npm run dev` only while you are actively iterating with the terminal open.
The moment you want a build that survives on its own — dogfooding later, handing it to someone,
walking away — use `npm run build:dev`.

**Dev-only voice audition (V1.3 VB-18).** In a development build the panel's console has `wbVoices`:
`list()` every installed voice, `roles()` to see which voice each narrator role resolves to,
`play('Samantha')` for one, and `audition()` to hear every English voice read a real interview
question in turn (`stop()` to stop). It exists so the narrator's voice is chosen by ear rather than
from a list of names. Same gate, same reasoning, same proof — `src/panel/voice/audition.ts`, and
`tests/e2e/narrator.spec.ts` greps `dist/` to show it never ships.

**Looking at a sequence (V2.9 slice 3).** `node scripts/film.mjs` writes `film/strip.png` — one
browser launch, N frames of the real extension, one contact sheet with the time under each frame.
A screenshot at a single instant says almost nothing about choreography, and relaunching a browser
per frame is the cost that makes people stop looking. `film/` is gitignored.

```bash
npm run build
node scripts/film.mjs --from 2 --to 6 --n 9                       # across the reveal
node scripts/film.mjs --el ".splashreveal-part[data-part='time']" # one section, big enough to judge
node scripts/film.mjs --rolodex --from 0 --to 0.62 --n 8          # one CSS turn, posed
node scripts/film.mjs --still                                     # the reduced-motion frame
```

`--rolodex` waits for the whole reveal to settle, then restarts the animation paused at a negative
delay. The shutter is slower than a 620ms turn, so a mid-turn frame has to be POSED rather than
chased — waiting for one gets whatever the screenshot happens to land on.

## How to work here

1. **Plan before building.** For anything larger than a single file, produce a plan and check it
   against `docs/RELEASE-1.md` acceptance criteria before writing code.
2. **Vertical slices.** Every change leaves the extension loadable and the panel usable.
   Never leave the tree in a state where `npm run build` fails.
3. **Types first.** Add or update the type/schema in `src/schema/` before the implementation.
   The schemas are the contract; the code conforms to them, not the other way around.
4. **Tests with fixtures.** `tests/fixtures/` holds synthetic data with known expected outputs.
   Anything in `core/audit` or `core/report` gets a test asserting exact numbers against a fixture.
5. **Run `npm run check` before claiming a task is finished.** A task with a failing check is not finished.
   Use `check:fast` while iterating — thirty seconds, and it catches most of what breaks. The full
   gate is still what "done" means.

   **The suite is timing-sensitive and this machine is also a workstation.** On 2026-09-02 the full
   gate ran 6 minutes and green while the machine was idle, and 11–21 minutes with nine to twelve
   animation tests failing while Chrome and an editor were open — every one of them passing again
   run serially. If a run comes back red with timing tests in it, re-run the failing FILES with
   `--workers=2` before believing it. CI (`.github/workflows/check.yml`) exists to take that
   judgement call away: the same two commands on a machine doing nothing else, with `retries: 2`
   on, reporting a blip as *flaky* rather than as a failure.

   **And one red that is NOT load (2026-09-02):** running `npm run build:dev` (or `npm run dev`)
   while a check's e2e phase is mid-flight rewrites `dist/` as a DEVELOPMENT bundle under the
   running suite. The tell is `narrator.spec`'s bundle scan reporting `wbVoices` leaked into
   production — a deterministic assertion that cannot flake — plus a handful of behavior tests
   (React dev mode changes timings) failing beside it. The fix is `npm run build` and a re-run;
   the lesson is: dogfood on a dev build OR run the gate, not both at once.
6. **Ask rather than assume** on anything in `docs/OPEN.md`. Those are unresolved product decisions,
   not gaps for you to fill.

## The companion site (`site/`)

`site/` is myworkbrain.org: three static files, no build, no dependencies —
the README there is the contract, especially the HASH SLUGS table (the panel
deep-links by hash; add slugs, never rename). Deploys via Vercel's Git
integration: push to master and the connected project redeploys (vercel.json
at the repo root serves `site/` as the output; .vercelignore keeps the
upload to the site alone). The app and site now live in one repo so they
move in concert — when the app gains a door to the site, the slug lands in
the README table in the same commit.

## The interview content

`src/core/flow/flow.ts` is a stub. The real 12 modules live in the sibling repo at
`../modelcitizen/src/lib/contextInterviewFlow.ts` (1,447 lines), with the runner it feeds at
`../modelcitizen/src/components/WorkBrainContextInterview.tsx`.

Port the questions **verbatim** at R1-05. The wording is the product's voice; paraphrasing it
produces competent generic questions and loses the thing that makes this sound like a person
talking. Where a question is too long for a 400px panel, add a `panelQ` field — do not edit `q`.

The source file's types are close to `src/schema/flow.types.ts` but not identical (it uses
`QuestionOption.key/label`, `interpret: {via}`, `skipIf`). Write an explicit adapter with a test,
rather than reshaping the source by hand.

## Component ideation leads with modern SaaS norms

Adam, 2026-09-03, a standing design principle: "ideation for components
should lead with design patterns that resemble modern SaaS and ecommerce
norms." When sketching a new control, start from what a person already
uses daily — integration pickers, checklist accordions, inline wordmark
selectors, quiet borderless lists — not from bespoke chrome. Rounded
chip clusters and heavy card grids read as dated; slim, familiar,
low-chrome patterns read as good hands. (First applied: the baseline
errand's service picker went from pill chips to wordmark links.)

And its sibling (Adam, 2026-09-03): "Visual balance should be default
placement for all elements if it is up for debate about where to start
on a design layout." When placement or measure is genuinely undecided,
choose the option that balances against the elements already on screen —
a note under an input spans the input's width, siblings share edges,
slack lands where it evens the composition. Debate ends at balance;
only a stated reason moves something off it.

**The alert pulse is one component.** `src/panel/components/alertPulse.css`
is THE standard highlight across the interview canvas (Adam, 2026-09-03:
"same style for all of them… the standard way to apply highlight").
`wb-alert` on the element calling attention to itself; add
`wb-alert--input` when that element is an input (the field itself wears
the colour). Never invent a new attention style — wear the class.

## Copy lives in one file

Every user-facing string in the panel goes in `src/panel/strings.ts`. Never inline one in a
component — `npm run audit` warns on it. Interview question wording is the exception: it is
ported verbatim and lives in `src/core/flow/source.ts`.

Before writing any new string, check `docs/CONTENT-SOURCES.md` — a surprising amount of this
product's copy already exists in the sibling Next.js app and must be ported, not rewritten.

## Copy rules

The interface is mostly words and the words are specified, not improvised.
`docs/design-system.html` §08 is binding. Short version:

- Second person, present tense, active voice.
- No product nouns the person did not bring. They know "file", "notes", "list".
  They do not know "context object", "artifact", "schema", "gate".
- Buttons are verbs the person would say: "Answer 2 questions", not "Continue".
- Errors say what to do next, never what went wrong. Never apologise, never blame.
- Target reading grade 7. If a sentence runs past 20 words, split it.

The four steps are **Baseline · Context · Skill · Prove** in the interface
(pass 4c, 2026-09-08 — the journey spine, superseding Name · Repeat · Act ·
Share at Adam's word: the old four "doesn't capture the momentum or spirit
of the goal"). "Gate" is still an internal word.

## Definition of done

- [ ] `npm run check` passes
- [ ] Keyboard-only path through the changed screens works
- [ ] Reduced-motion equivalent exists for any new cue and preserves the instruction
- [ ] Any new string passes the copy rules
- [ ] No new permission in `manifest.config.ts` without an entry in `docs/GUARDRAILS.md`
- [ ] No new runtime dependency without a line in `docs/DEPENDENCIES.md` justifying it
- [ ] `npm run audit` clean — no new warnings, no strings left in components
