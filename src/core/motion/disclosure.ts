/**
 * V1.3 VB-16 — the expand-in-place state machine, without a DOM.
 *
 * Clicking a follow-up question expands *that bubble* into its answer and the
 * other follow-ups leave. Closing brings them back. Both directions change the
 * height of the block mid-interaction, so both have to be animated rather than
 * cut — which means neither "open" nor "closed" is a single state. There is a
 * transitional state on the way in and another on the way out, and exactly one
 * question at a time about every item: is it resting, is it the expanded one,
 * is it a ghost on its way out, is it coming back, or is it not there at all.
 *
 * That question is pure, and it is the part that is easy to get subtly wrong,
 * so it lives here with tests rather than as a tangle of booleans inside a
 * component. What the panel keeps for itself is the part that genuinely needs
 * a browser: measuring boxes, running the height transition, and holding on to
 * focus while the siblings unmount (components/DeepDive.tsx).
 *
 * THE TWO TRANSITIONAL STATES EXIST FOR THE SAME REASON
 * A leaving item and a collapsing answer are both taken *out of layout flow*
 * the instant the interaction starts, so the block's natural height is already
 * its destination height and one transition can carry the box there. They stay
 * mounted, ghosted, for the length of that transition, and only then go.
 * `docs/design-system.html` §06: 200ms, the default for anything that moves.
 */

/** How long a ghost lives, and how long the height takes. §06's `--base`. */
export const EXPAND_MS = 200;

export type ExpandPhase =
  /** Nothing open. Every chip rests. */
  | { readonly kind: 'closed' }
  /** `index` is opening: its answer is in flow, the others are ghosts. */
  | { readonly kind: 'opening'; readonly index: number }
  /** `index` is open and alone — the others are unmounted. */
  | { readonly kind: 'open'; readonly index: number }
  /** `index` is closing: its answer is a ghost, the others are back, fading in. */
  | { readonly kind: 'closing'; readonly index: number };

export const CLOSED: ExpandPhase = { kind: 'closed' };

/**
 * What one item is doing right now.
 *
 * - `rest` — a closed chip, in flow.
 * - `expanded` — the open one: chip plus answer, both in flow.
 * - `collapsing` — the open one on the way back: its answer is a ghost.
 * - `leaving` — a sibling on its way out: a ghost, out of flow.
 * - `entering` — a sibling coming back: in flow, fading in.
 * - `gone` — not rendered.
 */
export type ItemRole = 'rest' | 'expanded' | 'collapsing' | 'leaving' | 'entering' | 'gone';

export function roleOf(phase: ExpandPhase, index: number): ItemRole {
  switch (phase.kind) {
    case 'closed':
      return 'rest';
    case 'opening':
      return phase.index === index ? 'expanded' : 'leaving';
    case 'open':
      return phase.index === index ? 'expanded' : 'gone';
    case 'closing':
      return phase.index === index ? 'collapsing' : 'entering';
  }
}

/** Whether the item is in the tree at all. */
export function isRendered(role: ItemRole): boolean {
  return role !== 'gone';
}

/**
 * Whether the answer text is on screen for this role.
 *
 * True through `collapsing` as well as `expanded`: the answer fades out as the
 * bubble shrinks, because cutting it on the first frame would leave an empty
 * box collapsing around nothing.
 */
export function showsAnswer(role: ItemRole): boolean {
  return role === 'expanded' || role === 'collapsing';
}

/**
 * `aria-expanded` for a chip.
 *
 * Deliberately *not* `showsAnswer`. The moment someone presses the trigger to
 * close it, the control is closed as far as they and their screen reader are
 * concerned; the 200ms of ghost is this file's business, not theirs.
 */
export function isExpanded(phase: ExpandPhase, index: number): boolean {
  const role = roleOf(phase, index);
  return role === 'expanded';
}

/** The item that owns the surface right now, ghost included, or `null`. */
export function activeIndex(phase: ExpandPhase): number | null {
  return phase.kind === 'closed' ? null : phase.index;
}

/** A phase with a transition in flight, and therefore with an `index`. */
export type MovingPhase = Extract<ExpandPhase, { kind: 'opening' | 'closing' }>;

/** Whether a transition is in flight — the panel animates height only then.
 * A type guard, so the caller gets the index without re-testing the kind. */
export function isMoving(phase: ExpandPhase): phase is MovingPhase {
  return phase.kind === 'opening' || phase.kind === 'closing';
}

/**
 * Pressing chip `index`.
 *
 * `animate` is the caller's answer to `prefers-reduced-motion`: with motion
 * off there is no ghost and no transitional state at all, and the result is
 * the same end state one step earlier. Reduced motion is not a slower
 * animation, it is no animation — the disclosure still opens, still announces,
 * still keeps focus.
 */
export function toggle(phase: ExpandPhase, index: number, animate: boolean): ExpandPhase {
  const closing = activeIndex(phase) === index && phase.kind !== 'closing';
  if (closing) return animate ? { kind: 'closing', index } : CLOSED;
  return animate ? { kind: 'opening', index } : { kind: 'open', index };
}

/** The end of a transition: `opening` lands open, `closing` lands closed. */
export function settle(phase: ExpandPhase): ExpandPhase {
  if (phase.kind === 'opening') return { kind: 'open', index: phase.index };
  if (phase.kind === 'closing') return CLOSED;
  return phase;
}
