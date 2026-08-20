# Release 1 — parity, well made

**What it is:** the side panel, the Context interview panel-native, the file, the proof loop,
manual hand-off only. **No host permissions at all.**

**What it is testing:** will people finish an interview in a panel, and does the proof land?
**Kill signal:** they install and never reach the proof.

Everything below is sized to be finished and verified in one sitting. Each task is done when
its acceptance criteria pass and `npm run check` is green.

---

## R1-01 · Repo skeleton
Vite + React + TS strict, `@crxjs/vite-plugin`, manifest as `manifest.config.ts`.
Vitest and Playwright configured. `npm run check` runs and passes on an empty suite.
**Accept:** `npm run build` produces a `dist/` that loads unpacked and opens an empty panel.

## R1-02 · Tokens → CSS
`npm run tokens` generates `src/panel/tokens.css` from `design/tokens.json`.
**Accept:** every custom property in the generated file traces to a token; no hex literal
appears anywhere else in `src/`. Add a lint rule or a test that greps for `#` in `.css`.

## R1-03 · Component library
Button, Pill, Field, ReadOnlyBlock, FileRow, Banner, Meter, Toast, Sheet — per
`docs/design-system.html` §04, all states, all keyboard behaviour.
**Accept:** component tests pass; axe clean; every control ≥44×44; arrow keys move within a pill group.

## R1-04 · Storage client + migrations
Typed wrapper over `chrome.storage`, split keys per `docs/ARCHITECTURE.md`, `SCHEMA_VERSION = 1`,
migration runner with pre-migration export.
**Accept:** migration tests pass including the restore-on-failure path.

## R1-05 · Flow data
Port the 12 modules from `../modelcitizen/src/lib/contextInterviewFlow.ts` (1,447 lines) **verbatim**, via an explicit adapter with a test. Do not paraphrase
a single question. Where the panel needs shorter wording, add a `panelQ` field rather than editing `q`.
**Accept:** every question renders; module and section indices drive the rail and the outline correctly.

## R1-06 · Flow runner
One generic component for all step kinds. Back / Next / Skip. Skip never disabled.
No auto-advance on selection.
**Accept:** keyboard-only pass from first question to the end; answers persist across a panel close/reopen.

## R1-07 · Reflect step
Open-text answers play back verbatim before committing. Keep / tighten with my AI / say it again.
**Accept:** the played-back text is byte-identical to what was typed.

## R1-08 · Cue engine
Chain runner + the verbs `sweep`, `ring`, `ringViolet`, `focus`, `bob`, `point`.
Reduced-motion form for each that preserves the instruction.
**Accept:** engine tests pass; with `prefers-reduced-motion: reduce`, every cue still visibly marks its target.

## R1-09 · File generate + parse
`Context.md` generation from answers, and the parser that reads it back.
**Accept:** the round-trip property test passes. Skipped questions are omitted entirely,
never rendered as empty placeholders. The System Grounding Rule paragraph is always present.

## R1-10 · Download and import
Download the file. Import a previously downloaded file and restore answers.
**Accept:** export → clear storage → import → identical answers. This is the backup story; treat
a failure here as a release blocker.

## R1-11 · The proof loop
Four steps: baseline, with-context, grade, recommendations. Manual copy/paste only.
Service chips drive the per-service attach hint.
**Accept:** completing it writes one score to `wb:report.scores`; the pasted text is never parsed,
scored, or stored beyond the field it was pasted into.

## R1-12 · Home surface (minimal)
Files with freshness, one next-move card, the quiet "talk to a person" row.
Derived entirely — nothing about progress is stored.
**Accept:** changing a durability answer changes the next move with no other action.

## R1-13 · Store submission package
Manifest single-purpose statement, icons, `npm run zip`, privacy policy published,
listing copy per `docs/STORE.md`.
**Accept:** `dist.zip` builds; manifest requests only `storage` and `sidePanel`; a reviewer
reading the listing can tell exactly what data is collected (none).

---

## Out of scope for Release 1 — do not build these
Fill-only hand-off · any host permission · the history audit · the improvement report ·
skills · packs · actions · drift check · narrator/mic (ship the toggles disabled or omit them).

Adding any of these early is the most likely way this release slips.
