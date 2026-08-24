/**
 * V1.8 VB-42 — one follow-up at a time, rotating, without a DOM.
 *
 * The follow-ups under a question stop being a row of chips and become a
 * single text link that changes every five seconds. **The rotation is
 * presentation only** (docs/V1.8-REFINEMENT.md, DECISIONS 1): a rotating link
 * still expands in place when it is clicked, exactly as V1.3 VB-16 does today,
 * so `core/motion/disclosure.ts` is still the machine that runs the click and
 * nothing here replaces any of it. What this module decides is only *which
 * follow-ups are on screen and whether the clock is running*.
 *
 * WCAG 2.2.2 (PAUSE, STOP, HIDE) IS WHY THIS FILE HAS SO MANY REASONS IN IT.
 * The success criterion applies to content that auto-updates, starts
 * automatically, lasts more than five seconds and is presented alongside other
 * content — which is this, precisely. So there is a `hold` for every way the
 * rotation must stop, and one static presentation it falls back to:
 *
 * - **hover** and **focus** — or the link changes identity between the moment
 *   someone decides to click and the click itself, which is the failure the
 *   criterion exists to prevent. Both are holds rather than a stop, so moving
 *   away resumes.
 * - **answering** — Adam's own rule: the list renews "until the person clicks
 *   Next or starts typing an answer". Next unmounts the question entirely.
 * - **open** — a disclosure is expanded. Advancing the index under an open
 *   answer would swap the content someone is reading, and the siblings are
 *   unmounted anyway (VB-16).
 * - **the visible stop control** — `mode: 'all'`. Not a hold: it is the
 *   person saying "stop", and it is the mechanism 2.2.2 requires. It shows the
 *   whole list, so stopping the motion also gives back everything the rotation
 *   was taking turns showing.
 * - **prefers-reduced-motion** — the static list, with no rotation scheduled
 *   at all. The still version carries the same information because it carries
 *   *more* of it: every follow-up at once (docs/GUARDRAILS.md).
 *
 * ONE ENTRY IS NEVER A ROTATION. Most questions carry one or two follow-ups
 * and none carries more than three (core/flow/deepDive.ts). With one there is
 * nothing to rotate to, nothing auto-updates, 2.2.2 does not apply, and
 * offering a stop control for motion that never happens would be noise — so
 * `viewFor` collapses that case to the list and `offersStop` says no.
 */

/** Five seconds — VB-42 asks for this number by name. */
export const ROTATE_MS = 5000;

/**
 * A reason the clock is not running *right now*, all of them temporary.
 * Stopping for good is `mode`, not a hold — see the header.
 */
export type RotationHold = 'hover' | 'focus' | 'answering' | 'open';

export interface RotationInput {
  /** How many follow-ups this question has. */
  readonly count: number;
  /** What the surface asked for: 'one' rotates, 'all' is the static list. */
  readonly mode: 'one' | 'all';
  /** `prefers-reduced-motion: reduce`. */
  readonly reduced: boolean;
  readonly holds: readonly RotationHold[];
}

/** What is on screen: one link at `index`, or every follow-up at once. */
export type FollowUpView =
  | { readonly kind: 'one'; readonly index: number }
  | { readonly kind: 'all' };

/** Wrap `index` into `count`, whatever either of them is. */
export function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  const wrapped = Math.trunc(index) % count;
  return wrapped < 0 ? wrapped + count : wrapped;
}

/** The next follow-up along, wrapping at the end. The list "keeps renewing". */
export function nextIndex(index: number, count: number): number {
  return clampIndex(index + 1, count);
}

/**
 * Whether this question rotates at all — the one condition the stop control,
 * the clock and the single-link presentation all agree about.
 */
export function rotates(input: RotationInput): boolean {
  return input.mode === 'one' && !input.reduced && input.count > 1;
}

/** What to render. Anything that is not a rotation is the static list. */
export function viewFor(input: RotationInput, index: number): FollowUpView {
  if (!rotates(input)) return { kind: 'all' };
  return { kind: 'one', index: clampIndex(index, input.count) };
}

/**
 * Whether the five-second clock should be running this instant.
 *
 * Deliberately not "is it rotating": a held rotation is still a rotation — the
 * link stays where it is, the stop control stays on screen, and letting go of
 * the pointer starts the clock again.
 */
export function isRunning(input: RotationInput): boolean {
  return rotates(input) && input.holds.length === 0;
}

/**
 * Whether to show the visible stop. Exactly `rotates`, and named separately
 * because it is a different question that happens to share an answer: WCAG
 * 2.2.2 asks for the control wherever the motion is possible, not only while
 * it is moving.
 */
export function offersStop(input: RotationInput): boolean {
  return rotates(input);
}
