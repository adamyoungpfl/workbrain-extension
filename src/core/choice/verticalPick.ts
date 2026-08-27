/**
 * V2.4 VB-108 · V2.5 VB-118 — WHICH QUESTIONS ARE ASKED AS A VERTICAL PICK.
 *
 * ── THE SCOPE, AND WHY IT IS A LIST OF ONE (decision 10) ──────────────────
 *
 * docs/V2.4-REFINEMENT.md VB-108, in its own words: "this question only".
 * `context_scope` — Work / Personal / Both — is the one question asked this
 * way; the pattern is documented for later spread, and widening it later is a
 * line here rather than a rewrite — the same deliberate-line contract as
 * `orbs.ts`'s ORB_CHOICE_QUESTIONS, which is this file's template.
 *
 * V2.5 VB-123 reuses the same GRAMMAR (the `VerticalPick` component) for the
 * merged role_standing/role_durability screen, but that pairing is its own
 * seam — core/choice/pairedPick.ts — not an entry in this list. This list
 * answers one question only: which standalone chips questions stand as a
 * vertical pick.
 *
 * ── WHY THE RULE IS HERE AND NOT AN `if` IN THE SURFACE ───────────────────
 *
 * The orbs.ts reasoning, verbatim: a panel-era decision about presentation,
 * recorded in exactly one place, keyed by the data it decorates — the port
 * stays a port (`source.ts` is never edited), and there is one file to read
 * to learn which questions look like this.
 *
 * ── WHAT THE TREATMENT IS, AND WHAT IT IS NOT (V2.5 VB-118) ───────────────
 *
 * V2.4 stood the ordinary pills up as rows (`PillGroup variant='vertical'`).
 * VB-118 retires that posture for a selector that is deliberately NOT a
 * button-look: free-standing icon tiles with a modern radio indicator —
 * `components/VerticalPick.tsx`. What did NOT change is the contract: the
 * SAME chips-and-Next semantics (single select, committed by Next, NEVER an
 * auto-advance — docs/GUARDRAILS.md), the same roving tabindex whose arrows
 * already run both axes (core/choice/roving.ts), the same storage key
 * (`context_scope`), the same stored values. Paint and posture only.
 */

/** The questions asked as a vertical pick. See the header before adding. */
export const VERTICAL_PICK_QUESTIONS: readonly string[] = ['context_scope'] as const;

/**
 * Whether this question's choices stand as a vertical pick. `kind` is
 * checked as well as `id` — the orbs.ts line: a question that stopped being
 * a chips pick would have to stop standing like one.
 */
export function usesVerticalPick(step: { id: string; kind: string }): boolean {
  return step.kind === 'chips' && VERTICAL_PICK_QUESTIONS.includes(step.id);
}
