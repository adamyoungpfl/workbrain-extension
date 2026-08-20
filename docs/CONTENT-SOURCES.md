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
