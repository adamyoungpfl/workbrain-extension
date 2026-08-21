/**
 * V1.3 VB-16 — when the follow-up chips shimmer, expressed as data.
 *
 * The shimmer itself is CSS (components/DeepDive.css). What is here is the
 * decision about *when* it runs, kept pure so the choice is one value in one
 * place rather than a keyframe edit — the same shape as `STATUS_MARK_SPIN` in
 * components/FlowProgress.tsx, and for the same reason: three plausible
 * answers, one of them shipped, the other two a constant away.
 *
 * See components/DeepDive.tsx for which one ships and why.
 */

export type ShimmerTrigger =
  /** One pass when the question first appears, then still. Ships. */
  | 'once'
  /** Only under the pointer or on focus. Zero motion at rest. */
  | 'hover'
  /** Never stops. What "shimmer" most literally means. */
  | 'continuous'
  /** No shimmer. What the attract collapses to once it has played. */
  | 'none';

/**
 * The keyframe name, shared with DeepDive.css.
 *
 * Exported because "it played once and then stopped" is only provable by
 * naming the animation and asking the browser whether it is still running
 * (`document.getAnimations()`), which tests/e2e/deep-dive.spec.ts does.
 */
export const SHIMMER_KEYFRAME = 'wb-dd-shimmer';

/** One sweep, in ms. §06's `--slow`, mirrored for tests. */
export const SHIMMER_SWEEP_MS = 320;

/** Gap between one chip's sweep and the next. §06's `--fast`, mirrored. */
export const SHIMMER_STAGGER_MS = 120;

/**
 * How long the whole attract lasts, for `count` chips.
 *
 * Not read by the CSS — the stagger is a `calc()` there. This is for anyone
 * who needs to wait it out: tests, and the judgement about whether a one-time
 * attract is short enough to be one. Three chips: 560ms.
 */
export function attractMs(count: number): number {
  if (count <= 0) return 0;
  return SHIMMER_SWEEP_MS + (count - 1) * SHIMMER_STAGGER_MS;
}

/**
 * The `data-shimmer` value to render, given the shipped trigger and whether
 * the one-time attract has already played.
 *
 * Only `once` burns out. `hover` and `continuous` are steady states, and
 * `none` was already nothing.
 */
export function shimmerState(trigger: ShimmerTrigger, attracted: boolean): ShimmerTrigger {
  return trigger === 'once' && attracted ? 'none' : trigger;
}

/**
 * Whether an `animationend` means the attract is over.
 *
 * The last chip's sweep is the one that matters, because the sweeps are
 * staggered — burning out on the first would cancel its neighbours mid-pass.
 * Driven by the real event rather than a timer so the burn-out cannot drift
 * away from the animation it is supposed to follow.
 */
export function isAttractOver(
  trigger: ShimmerTrigger,
  animationName: string,
  index: number,
  count: number,
): boolean {
  return trigger === 'once' && animationName === SHIMMER_KEYFRAME && index === count - 1;
}
