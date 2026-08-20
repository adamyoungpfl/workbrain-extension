# Content that already exists — port it, do not write it

Several Release 1 tasks need content that is already written and in production in the sibling
Next.js app. Writing a fresh version is the single easiest way to lose the product's voice,
and it will not be obvious in review because the invented version reads fine on its own.

Sibling repo: `../modelcitizen/`

| Task | Needs | Already exists at | Notes |
|---|---|---|---|
| R1-05 ✅ | The 12 modules | `src/lib/contextInterviewFlow.ts` | Done. 133 of 134 strings ported verbatim. |
| R1-05 ✅ | File outline | `src/lib/contextInterviewFlow.ts` → `CONTEXT_FILE_OUTLINE` (~line 1245) | Done — `contextOutline` in `flow.ts`. |
| R1-09 ✅ | `Context.md` generation | `src/lib/contextInterviewFlow.ts` → `generateContextFile()` (~line 1429) | Done. Literal always-emitted text ported verbatim to `src/core/files/source.ts`; the emitter itself is a reimplementation against this repo's schema in `src/core/files/generate.ts` (see that file's header comment for why a byte-copy of the function body wasn't possible). The parser — new work, the web app never read the file back — is `src/core/files/parse.ts`; round-trip tested in `src/core/files/roundtrip.test.ts`. |
| R1-09 ✅ | The System Grounding Rule paragraph | same file | Done. Byte-identical in `src/core/files/source.ts`'s `SYSTEM_GROUNDING_RULE`, asserted in `generate.test.ts` against an independently hand-typed copy of the source. |
| R1-11 ✅ | Baseline demo prompt | `src/components/WorkBrainContextInterview.tsx` → `BASELINE_PROMPT` (~line 397) | Done. Ported verbatim to `src/core/flow/proofSource.ts`'s `BASELINE_PROMPT`. |
| R1-11 ✅ | Grading rubric prompt | same file, ~line 429–443 | Done. Ported verbatim to `evaluationPrompt()` in `src/core/flow/proofSource.ts`. Five criteria, ends with "top areas of opportunity"; Adam specified point 5 explicitly, not re-derived. |
| R1-11 ✅ | Per-service attach tips | same file | Done. Ported to `PROOF_SERVICES` in `src/core/flow/proofSource.ts` (one line per AI service saying where its attach control is), consumed via `attachHintFor()` in `src/core/flow/proofAdapter.ts`. |
| R1-12 | Freshness sentences | — | New work. See `src/panel/strings.ts`. |
| VB-05 ✅ | The `beats` reveal mechanic | `src/components/WorkBrainContextInterview.tsx` → `renderEmphasized` / `beatHoldMs` (~lines 497–515) and `.wbci-beat` / `.wbci-emphasis` in `src/app/globals.css` (~5378–5381) | Done. Behaviour, not copy: the `__word__` split-on-a-capturing-group parse, 200wpm + a flat 2s hold, the 400ms fade, and bold-plus-underline emphasis are all ported unchanged to `src/core/flow/beats.ts` + `src/panel/components/Beats.{tsx,css}`, so the two implementations read at the same pace. Two deliberate differences: the parse returns data rather than React nodes (`core/` may not touch the DOM), and reduced motion renders every beat at once rather than only disabling the transition. The beats *content* was already ported at R1-05 (`ARCHITECTURE_ORIENTATION_BEATS` in `source.ts`); nothing rendered it until now. |
| VB-05 | Module transition copy | — | New work, approved in `docs/V1.1-COPY-DRAFT.md`. Ten transitions in `src/panel/strings.ts`'s `moduleIntros`. |
| VB-07 ✅ | The file tree's derived states | `src/components/WorkBrainContextInterview.tsx` → `outlineNodeReached` / `outlineNodeCurrent` (~lines 1648–1658) | Done. Behaviour, not copy. Ported unchanged (including "only top-level answers count — a repeatable's seed question is what marks its section") to `src/core/flow/outline.ts`, where they are pure and unit-tested in `outline.test.ts`. `core/` rather than beside the component because they are folds over `wb:answers`, exactly what `docs/ARCHITECTURE.md` says belongs there. |
| VB-07 ✅ | The terminal aesthetic | same file → `useTypewriterOnChange` (~line 208); `.wbci-ft-cursor` / `@keyframes wbciFtBlink` in `src/app/globals.css` (~5840–5852) | Done. Ported unchanged to `src/panel/components/FileTree.{tsx,css}`: 15ms a character, keyed off a row's own state rather than its text, **never replaying on mount** (a resumed session must not re-print every already-written row), plus the 2.2s `steps(1)` cursor blink so it snaps rather than fades. One difference: the preference is read at the moment a transition happens rather than captured at mount, because this component deliberately never remounts. |
| VB-07 ✅ | The accordion + click-to-navigate rows | same file → `FileTree` / `FileTreeRow` (~lines 1669–1831), and `cursorForQuestionId` in `src/lib/contextInterviewFlow.ts` (~line 1325) | Done. One section open at a time, auto-syncing to the active section with a manual override until the active section moves; reached/current rows are real navigation, unreached rows are deliberately inert. `cursorForQuestionId` becomes `positionForQuestionId` in `src/core/flow/outline.ts` and returns a `Position`, not a `{moduleIndex, nodeIndex}` cursor — this runner derives position rather than storing one. It feeds `Flow.tsx`'s existing `viewing` seam (built at R1-12), not a parallel one. |
| VB-07 | The drawer layout | — | **Deliberately not ported.** The source is a 360px right-hand grid column whose own `max-width: 900px` rule stacks it *below* the question — in a 400px panel that means it scrolls off screen while you answer, i.e. the thing this feature exists to prevent. Re-authored as a bottom-docked drawer (`src/panel/surfaces/FileDrawer.{tsx,css}`), collapsed to a peek. Two things the source does not have at all and this needs: a scroll container, and keeping the current row inside it. |
| VB-07 | Row contrast | — | **Deliberately not ported.** The source renders unreached rows below contrast threshold, arguing WCAG's disabled-control exemption. `docs/GUARDRAILS.md` writes no such exemption and says "nothing distinguished by colour alone", so here untouched rows are `--ink-3` (4.71:1) and every row also carries an ASCII state marker (`[ ]` / `[x]` / `[>]`) and a visually hidden word. Reached vs current stays a one-family strength difference, as ported — `--green` vs the new `--green-strong`, deepening rather than lightening because this canvas is light. |
| VB-07b ✅ | The live file text | `src/components/WorkBrainContextBuilder.tsx`'s preview note | Done. The note is verbatim in `src/panel/strings.ts`'s `filePreviewNote`. The Builder's `FILE_BLOCKS` + `minStep` reveal system is **not** ported and is not needed: `core/files/generate.ts` already omits a section with nothing in it, so sections appear as they are answered for free. `generateContextFileParts` adds per-section output; `generateContextFile` is now one field of it, so the preview and the download are the same bytes by construction (asserted in `generate.test.ts` and end-to-end in `tests/e2e/file-tree.spec.ts`). |

## How to port

1. Read the source. Do not open it in the same breath as writing the target — read, then write.
2. Copy strings **byte for byte**. No re-punctuation, no smart quotes swapped for straight ones,
   no "slight tightening".
3. Where the web version's shape does not fit, adapt in an **adapter with a test**, exactly as
   R1-05 did with `source.ts` + `adapter.ts`. Do not reshape the source content by hand.
4. Add a test that asserts a sample of the ported strings matches the source. R1-05's
   `adapter.test.ts` is the pattern.

## What is NOT in the sibling app

The panel's own chrome — buttons, empty states, errors, banners, freshness sentences, the home
surface. All of that is new, and all of it lives in `src/panel/strings.ts`. Add strings there,
never inline in a component.
