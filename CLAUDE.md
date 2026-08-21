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

**Dev-only voice audition (V1.3 VB-18).** In a development build the panel's console has `wbVoices`:
`list()` every installed voice, `roles()` to see which voice each narrator role resolves to,
`play('Samantha')` for one, and `audition()` to hear every English voice read a real interview
question in turn (`stop()` to stop). It exists so the narrator's voice is chosen by ear rather than
from a list of names. Same gate, same reasoning, same proof — `src/panel/voice/audition.ts`, and
`tests/e2e/narrator.spec.ts` greps `dist/` to show it never ships.

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
6. **Ask rather than assume** on anything in `docs/OPEN.md`. Those are unresolved product decisions,
   not gaps for you to fill.

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

The four steps are **Name · Repeat · Act · Share** in the interface. "Gate" is an internal word.

## Definition of done

- [ ] `npm run check` passes
- [ ] Keyboard-only path through the changed screens works
- [ ] Reduced-motion equivalent exists for any new cue and preserves the instruction
- [ ] Any new string passes the copy rules
- [ ] No new permission in `manifest.config.ts` without an entry in `docs/GUARDRAILS.md`
- [ ] No new runtime dependency without a line in `docs/DEPENDENCIES.md` justifying it
- [ ] `npm run audit` clean — no new warnings, no strings left in components
