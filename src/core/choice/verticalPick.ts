/**
 * V2.4 VB-108 — WHICH QUESTIONS ARE ASKED AS A VERTICAL PICK LIST.
 *
 * ── THE SCOPE, AND WHY IT IS A LIST OF ONE (decision 10) ──────────────────
 *
 * docs/V2.4-REFINEMENT.md VB-108, in its own words: "this question only".
 * `context_scope` — Work / Personal / Both — becomes a vertical list with an
 * icon per choice and a small animation; the pattern is documented for later
 * spread, and **nothing else converts this pass**. So the list below holds
 * one id, and widening it later is a line here rather than a rewrite — the
 * same deliberate-line contract as `orbs.ts`'s ORB_CHOICE_QUESTIONS, which is
 * this file's template.
 *
 * ── WHY THE RULE IS HERE AND NOT AN `if` IN THE SURFACE ───────────────────
 *
 * The orbs.ts reasoning, verbatim: a panel-era decision about presentation,
 * recorded in exactly one place, keyed by the data it decorates — the port
 * stays a port (`source.ts` is never edited), and there is one file to read
 * to learn which questions look like this.
 *
 * ── WHAT THE TREATMENT IS, AND WHAT IT IS NOT (FLAG 5) ────────────────────
 *
 * A vertical pick is still the SAME chips-and-Next contract: the same
 * PillGroup, the same roving tabindex (whose arrows already run both axes —
 * core/choice/roving.ts), the same commit on Next, and NEVER an auto-advance
 * (docs/GUARDRAILS.md). What changes is paint and posture: rows instead of a
 * wrap, a drawn icon per choice, and a small idle motion whose
 * reduced-motion still carries the same information (Pill.css).
 */

/** The questions asked as a vertical pick list. See the header before adding. */
export const VERTICAL_PICK_QUESTIONS: readonly string[] = ['context_scope'] as const;

/**
 * Whether this question's choices stack as a vertical pick list. `kind` is
 * checked as well as `id` — the orbs.ts line: a question that stopped being
 * a chips pick would have to stop standing like one.
 */
export function usesVerticalPick(step: { id: string; kind: string }): boolean {
  return step.kind === 'chips' && VERTICAL_PICK_QUESTIONS.includes(step.id);
}
