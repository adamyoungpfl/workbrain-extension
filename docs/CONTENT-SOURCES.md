# Content that already exists — port it, do not write it

Several Release 1 tasks need content that is already written and in production in the sibling
Next.js app. Writing a fresh version is the single easiest way to lose the product's voice,
and it will not be obvious in review because the invented version reads fine on its own.

Sibling repo: `../modelcitizen/`

| Task | Needs | Already exists at | Notes |
|---|---|---|---|
| R1-05 ✅ | The 12 modules | `src/lib/contextInterviewFlow.ts` | Done. 133 of 134 strings ported verbatim. |
| R1-05 ✅ | File outline | `src/lib/contextInterviewFlow.ts` → `CONTEXT_FILE_OUTLINE` (~line 1245) | Done — `contextOutline` in `flow.ts`. |
| **R1-09** | `Context.md` generation | `src/lib/contextInterviewFlow.ts` → `generateContextFile()` (~line 1429) | Walks `CONTEXT_FILE_OUTLINE` and emits markdown. **Port the emitter, then write the parser** — the parser is new work because the web app never needed to read the file back. |
| **R1-09** | The System Grounding Rule paragraph | same file | Fixed text, always appended. Must be byte-identical. |
| **R1-11** | Baseline demo prompt | `src/components/WorkBrainContextInterview.tsx` → `BASELINE_PROMPT` (~line 397) | Currently `"Draft a status update for my manager."` |
| **R1-11** | Grading rubric prompt | same file, ~line 429–443 | Five criteria, ends with "top areas of opportunity". Adam specified point 5 explicitly — do not re-derive the rubric. |
| **R1-11** | Per-service attach tips | same file | One line per AI service saying where its attach control is. |
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
