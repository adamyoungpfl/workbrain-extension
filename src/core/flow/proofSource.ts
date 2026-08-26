/**
 * A verbatim snapshot of the proof-loop content from
 * ../modelcitizen/src/components/WorkBrainContextInterview.tsx (as of
 * 2026-08-20, uncommitted in that repo at port time — see R1-11 in
 * docs/RELEASE-1.md and docs/CONTENT-SOURCES.md). Copied mechanically
 * (`sed -n '<range>p'`, not retyped) from that file's exact line ranges:
 *
 *   - BASELINE_PROMPT           — line 397
 *   - SERVICES (incl. attachTip) — lines 417–423
 *   - evaluationPrompt()         — lines 434–450 (the five-point rubric)
 *   - the fallback attach sentence — lines 1385–1388 (JSX text; the
 *     &rsquo; entities are the source's own way of escaping a curly
 *     apostrophe in JSX text — decoded here to the actual character, not
 *     swapped for a straight quote, per docs/CONTENT-SOURCES.md: "no smart
 *     quotes swapped for straight ones")
 *
 * A SEPARATE file from source.ts on purpose: source.ts's own header comment
 * scopes it specifically to contextInterviewFlow.ts, ported at R1-05. This
 * content comes from a different upstream file entirely (the *runner*
 * component, not the flow data), so folding it into source.ts would misstate
 * source.ts's own documented provenance. See proofAdapter.ts for the pure
 * transform into this repo's schema shape, and proofAdapter.test.ts for the
 * verbatim spot-checks (independently re-typed from the source read, not
 * derived from this file, so a mis-port here would actually be caught).
 *
 * NOT hand-edited — any wording fix belongs upstream in modelcitizen, then
 * re-ported. Excluded on purpose: everything else in that component
 * (JSX layout, the narrator/speech-synthesis wiring, the download/copy
 * mechanics, the review-step state machine) — none of it is proof-loop
 * *content*, and R1-11 is manual copy/paste only regardless of what that
 * prototype also does with a downloadable file or a narrator voice.
 */

/** One AI service the person might paste into — key order matches
 * manifest.config.ts's `optional_host_permissions` exactly (chatgpt.com,
 * claude.ai, gemini.google.com, copilot.microsoft.com), confirmed by
 * proofAdapter.test.ts. `attachTip` is verbatim; the visible chip *label*
 * is NOT ported here — it's new panel chrome and lives in strings.ts
 * (`S.proofServiceOptions`), per this task's own instruction that a chip
 * label isn't "content" the way an instructional sentence is. */
export interface ProofService {
  key: string;
  attachTip: string;
}

export const PROOF_SERVICES: ProofService[] = [
  { key: 'chatgpt', attachTip: 'Click the + / paperclip near the message box and attach Context.md.' },
  { key: 'claude', attachTip: 'Click the paperclip icon (or drag the file in) and attach Context.md.' },
  { key: 'gemini', attachTip: 'Click the + / attach icon near the message box and attach Context.md.' },
  { key: 'copilot', attachTip: 'Click the attach/paperclip icon near the message box and attach Context.md.' },
  { key: 'other', attachTip: 'Look for a paperclip, +, or "attach file" icon near the message box.' },
];

/** Module 12's self-demo prompt, run twice — once with nothing loaded, once
 * with Context.md loaded. */
export const BASELINE_PROMPT = 'Draft a status update for my manager.';

/** The fixed sentence paired with every attachTip (source lines 1385–1388),
 * so the safety net never drifts per-service and always covers whatever the
 * visitor's actual UI looks like. */
export const ATTACH_FALLBACK_SUFFIX = "Or just paste Context.md’s text directly if you don’t see one.";

/** V2.3 VB-93 — `promptUsed` parameterizes the one variable in this ported
 * template: when the person named a goal at the gate, the proof ran THEIR
 * question, and the grader must be told the truth about what was asked. The
 * template's own words are untouched; the default keeps every pre-goal
 * caller byte-identical.
 *
 * The THIRD prompt — a grading prompt embedding both pasted-back answers,
 * asking a fresh, file-free AI session to score them. Rubric point 5 is
 * what makes the recommendations screen possible without this app ever
 * parsing anything itself — it just asks the grading AI to hand back "areas
 * of opportunity," then relays whatever comes back verbatim. */
export function evaluationPrompt(before: string, after: string, promptUsed: string = BASELINE_PROMPT): string {
  return `I ran the exact same prompt through an AI twice — once with nothing loaded, once with my personal Context.md file loaded. Here are both answers. Evaluate them side by side:

1. Which answer is more specific to my actual role, team, and standards — and which parts prove it.
2. Which answer would need the least editing before I could send it as-is.
3. Anything the "with Context.md" answer got wrong or invented that the file doesn't actually support.
4. A score out of 10 for each, on how ready-to-send it is.
5. The top 2-3 specific areas of opportunity — what this Context.md file is missing or should clarify to get an even better answer.

PROMPT USED: "${promptUsed}"

BEFORE (nothing loaded):
${before.trim() || '[not captured]'}

AFTER (with Context.md loaded):
${after.trim() || '[not captured]'}`;
}
