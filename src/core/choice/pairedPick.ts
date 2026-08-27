import type { Module, Step } from '../../schema/flow.types';

/**
 * V2.5 VB-123 (decision 4, confirmed) — role_standing + role_durability:
 * ONE SCREEN, STILL TWO STORED KEYS.
 *
 * ── THE MECHANISM, CHOSEN AND NAMED (the spec asked for this note) ────────
 *
 * The merge is a PAIRED-QUESTION PRESENTATION SEAM, not a schema change and
 * not a new Step kind. This file declares which two adjacent single-selects
 * share a screen; the flow data, the storage keys, the outline, the
 * generated file and `findPosition` are all untouched. The panel
 * (Flow.tsx's StepView) reads the pair and, when the position lands on
 * EITHER half, renders both facets in the VB-118 tile grammar and commits
 * both keys on one Next — the R1-11 grade screen's own precedent, where two
 * score fields ride one step's commit (`scoreSubStep`), generalised to a
 * whole companion question.
 *
 * Why this shape won over the alternatives the spec floated:
 *
 *  - A new `presentation` Step kind would have threaded a second notion of
 *    "what is this screen" through `findPosition`, sectionHealth, generate,
 *    parse and the narrator — five files re-learning one fact. The pair map
 *    teaches it to exactly one renderer.
 *  - Patching the flow data (merging the questions in overrides.ts) would
 *    have been a SCHEMA change in disguise: one stored key, one file bullet
 *    — and the round-trip law says files must stay byte-compatible.
 *
 * ── HOW EVERY RESUME CASE FALLS OUT, WITH NO RUNNER CHANGE ────────────────
 *
 * `findPosition` derives the first unanswered field, and the merged screen
 * answers both keys — so:
 *
 *  - Fresh walk: position lands on role_standing; the screen collects both;
 *    after one Next both keys are in the record, and findPosition walks
 *    PAST role_durability because it is answered. The companion never gets
 *    a screen of its own on the forward path — "findPosition skips
 *    role_durability when answered (it will be, by the merged screen)".
 *  - Pre-merge file with standing answered, durability not: position lands
 *    on role_durability STANDALONE — and the same paired renderer shows the
 *    standing facet pre-filled from the record (what exists) while asking
 *    for the mark (what doesn't). Asked standalone, answered in company.
 *  - Deep links (Home's next-move card, the record list) point at either id
 *    and get the same screen, because the pair is symmetric: `pairFor`
 *    answers for both halves.
 *
 * ── COMMIT AND SKIP RULES (the panel enforces these; tests pin them) ──────
 *
 *  - Next requires a pick in the POSITION facet (ordinary requiredness) and
 *    in the companion ONLY where the companion has no stored entry — a
 *    companion already answered (or explicitly skipped: null IS an entry)
 *    is never re-demanded.
 *  - The companion is committed ONLY when its draft differs from storage:
 *    re-stamping `answeredAt` on an untouched answer would falsify the
 *    freshness clocks (core/freshness reads those stamps — the due-role
 *    card is built on them).
 *  - Skip nulls the position facet (a skip's ordinary meaning) and the
 *    companion only where it has no stored entry — never overwriting a
 *    stored companion answer the person did not ask to change.
 *
 * ── THE CAPTIONS (interview wording, measured here) ───────────────────────
 *
 * The facet that is NOT the screen's heading still needs a visible line
 * naming what its tiles answer. Those lines are interview wording, so they
 * live in core beside the questions — the deepDive.ts pattern — and
 * pairedPick.test.ts runs the same reading-grade and sentence-length
 * harness overrides.test.ts runs, because `npm run audit` only measures
 * src/panel/strings.ts. The group's ACCESSIBLE name stays the real ported
 * question; the caption is the visible shorthand.
 */

export interface PairedPick {
  /** The half the flow reaches first — the screen's usual heading. */
  anchorId: string;
  /** The half that rides along — asked on the same screen, stored under its
   * own key exactly as before. */
  companionId: string;
}

/** The pairs. One tonight (decision 4); adding one later is a line here. */
export const PAIRED_PICKS: readonly PairedPick[] = [
  { anchorId: 'role_standing', companionId: 'role_durability' },
] as const;

/** [DRAFT] The visible line over a facet when it is not the screen's
 * heading. Keyed by question id; the group's aria-label stays the ported
 * question itself. */
export const PAIR_CAPTIONS: Record<string, string> = {
  role_standing: 'How big a role is this?',
  role_durability: 'Still current, or useful history?',
};

/** The pair a question belongs to, from either half. */
export function pairFor(stepId: string): PairedPick | undefined {
  return PAIRED_PICKS.find((p) => p.anchorId === stepId || p.companionId === stepId);
}

/**
 * Whether this step is asked as half of a paired screen. `kind` is checked
 * as well as `id` — the orbs.ts line, once more: a question that stopped
 * being a chips pick would have to stop sharing a chips screen.
 */
export function usesPairedPick(step: { id: string; kind: string }): boolean {
  return step.kind === 'chips' && pairFor(step.id) !== undefined;
}

/**
 * Both halves of a pair, resolved to the real Steps in the adapted flow.
 * They live inside a repeatable block (the pair's only current tenant is
 * the roles loop), so the walk covers blocks and top-level nodes alike.
 * `undefined` — never a throw — when either half is missing: the renderer
 * then falls back to the ordinary single-question screen, which is the
 * degradation table's "doing less, never broken".
 */
export function pairedStepsFor(
  modules: Module[],
  pair: PairedPick,
): { anchor: Step; companion: Step } | undefined {
  let anchor: Step | undefined;
  let companion: Step | undefined;
  for (const module of modules) {
    for (const node of module.nodes) {
      const fields = 'fields' in node ? node.fields : [node];
      for (const field of fields) {
        if (field.id === pair.anchorId) anchor = field;
        if (field.id === pair.companionId) companion = field;
      }
    }
  }
  return anchor && companion ? { anchor, companion } : undefined;
}
