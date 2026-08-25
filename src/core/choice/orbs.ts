/**
 * V2.0 VB-60 — WHICH QUESTIONS ARE ASKED AS ORBS, AND WHICH ORB IS WHICH.
 *
 * ── THE SCOPE, AND WHY IT IS A LIST OF ONE ───────────────────────────────
 *
 * docs/V2.0-REFINEMENT.md VB-60 is headed "Choosing 1:N as orbs" and its first
 * sentence names exactly one question: "**The roles question** (`role_names`,
 * multi-select) stops being pills." So that is what ships, and the widening is
 * a line in the array below rather than a rewrite — but it is a deliberate
 * line, not an oversight:
 *
 * The Context interview has six multi-selects and the other five are not the
 * same shape of question. `peeves` and `never_words` carry TEN options each,
 * `guardrails_list`'s options are whole sentences ("Require my approval before
 * changing anything in a system"). An orb is a marker beside a label, the way
 * a section's orb sits beside its name in the List — ten of them, or six
 * sentence-length ones, is a wall, and a travelling outline crawling around a
 * wall for fifteen seconds is not the "anchor to action" VB-60 asks for. The
 * roles question is six short nouns, and it is the question the brand's own
 * object was asked for on.
 *
 * ── WHY THE RULE IS HERE AND NOT AN `if` IN THE SURFACE ──────────────────
 *
 * Same reason `core/flow/deepDive.ts` is a core module keyed by question id
 * rather than a field somebody adds to `source.ts`: this is a **panel-era
 * decision about presentation**, the port stays a port (docs/V2.0-REFINEMENT.md
 * FLAG 2 — `source.ts` is never edited), and there is exactly one place to
 * read to find out which questions look like this. A `step.id === 'role_names'`
 * buried in `Flow.tsx`'s render would answer the same question and would be
 * findable by nobody.
 */

/** The questions asked as orbs. See the header before adding to it. */
export const ORB_CHOICE_QUESTIONS: readonly string[] = ['role_names'] as const;

/**
 * Whether this question's choices are drawn as orbs rather than as pills.
 *
 * Takes the two fields it actually reads rather than a whole `Step`, so core
 * stays free of the schema's React-facing shape and the test can hand it a
 * literal. `kind` is checked as well as `id` because "choosing one or many" is
 * what the orbs say — a question that stopped being a multi-select would have
 * to stop wearing them, and this is the line that would notice.
 */
export function usesOrbChoice(step: { id: string; kind: string }): boolean {
  return step.kind === 'multi' && ORB_CHOICE_QUESTIONS.includes(step.id);
}

/**
 * Whether the orb at `index` wears the travelling outline right now.
 *
 * The view comes straight from `core/motion/rotation.ts`'s `viewFor` — the
 * follow-up link's own machine, which FLAG 1 requires (one implementation,
 * both places). Its two answers land here as:
 *
 *   `one`  the outline is on one choice, and moves.
 *   `all`  every choice is outlined at once — reduced motion, or a group with
 *          nothing to travel between.
 *
 * The second is the still equivalent, and it carries MORE of the instruction
 * than the moving one rather than less: "any of these" said about all of them
 * simultaneously (docs/GUARDRAILS.md).
 */
export function isOutlined(view: { kind: 'one'; index: number } | { kind: 'all' }, index: number): boolean {
  return view.kind === 'all' || view.index === index;
}
