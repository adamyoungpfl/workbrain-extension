import type { Step } from '../../schema/flow.types';

/**
 * V2.5 VB-120 (FLAG 3) — the per-kind character thresholds behind the
 * recheck rebalance and the AI Assist nudge.
 *
 * ONE table, TWO consumers, and the number means the same thing to both:
 *
 *  - `findPosition`'s reflect condition (core/flow/runner.ts): an
 *    unassisted text answer UNDER its threshold skips the recheck — there
 *    is not enough written for a playback to be worth the screen — while an
 *    answer at or over it reflects exactly as R1-07 always has.
 *  - The panel's nudge (Flow.tsx): while a text question's DRAFT is under
 *    its threshold and unassisted, the AI Assist chip reads
 *    "AI Assist (Recommended)" with the one sanctioned cue at its gentle
 *    cadence, and opens the sheet in its encouraging wording variant.
 *
 * FLAG 3's law, kept structurally: thresholds are evaluated LIVE — against
 * the draft as it is typed, against the stored value as it is walked —
 * and NEVER stored. Nothing here writes; nothing anywhere persists a
 * "was under threshold" fact; a threshold change in this file re-judges
 * every answer on the next derivation, which is exactly what live means.
 * And the nudge these numbers drive must never shame: the wording lives in
 * assistCopy.ts under its own no-deficiency assertion.
 *
 * THE KINDS ([DRAFT] values — Adam's morning review adjusts numbers):
 *
 *  | kind                | threshold | meaning                            |
 *  |---------------------|-----------|------------------------------------|
 *  | multiline text      | 80 chars  | under a sentence or two of substance|
 *  | single-line text    | 0 chars   | never nudged, never skipped — a    |
 *  |                     |           | name-length answer IS the answer   |
 *  | everything else     | 0 chars   | pills/chips/gen have no draft to   |
 *  |                     |           | measure                            |
 *
 * Per-question overrides ride `ASSIST_THRESHOLD_OVERRIDES` — empty today,
 * present so a future "this one question deserves a higher bar" is one
 * data line rather than a second mechanism.
 */

/** [DRAFT] A multiline answer under this many characters skips the recheck
 * and earns the nudge. */
export const ASSIST_THRESHOLD_MULTILINE = 80;

/** [DRAFT] Single-line text: 0 — `length < 0` is impossible, so a
 * single-line answer is never under threshold: never nudged, and its
 * recheck behaviour is exactly what it was before V2.5. */
export const ASSIST_THRESHOLD_SINGLE_LINE = 0;

/** [DRAFT] Per-question exceptions, by step id. Empty on purpose — the
 * seam, not a policy. */
export const ASSIST_THRESHOLD_OVERRIDES: Record<string, number> = {};

/** The threshold for one step — override first, then its kind's row. */
export function assistThreshold(step: Pick<Step, 'id' | 'kind' | 'multiline'>): number {
  const override = ASSIST_THRESHOLD_OVERRIDES[step.id];
  if (override !== undefined) return override;
  if (step.kind !== 'text') return 0;
  return step.multiline ? ASSIST_THRESHOLD_MULTILINE : ASSIST_THRESHOLD_SINGLE_LINE;
}

/**
 * Whether this text — a live draft or a stored answer — is under the
 * step's threshold. Trimmed first: whitespace is not substance, and a
 * draft of eighty spaces earning its way past the recheck would make the
 * threshold a keyboard trick.
 */
export function underAssistThreshold(step: Pick<Step, 'id' | 'kind' | 'multiline'>, text: string): boolean {
  return text.trim().length < assistThreshold(step);
}
