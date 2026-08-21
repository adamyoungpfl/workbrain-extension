/**
 * The one easing curve, available to JavaScript.
 *
 * `docs/design-system.html` §06 is binding and allows exactly one curve:
 * `cubic-bezier(.2,0,0,1)`. CSS gets it for free from the `--ease` token.
 * Anything driven by `requestAnimationFrame` — VB-13's spin-on-change turn of
 * the status-bar mark — has to compute the same curve itself, or the product
 * ends up with two different accelerations depending on which technology
 * happened to draw the motion.
 *
 * Pure: no DOM, no clock, no `window`. Given the same fraction it returns the
 * same number, which is what makes the spin testable without a browser.
 */

/** The §06 curve's control points. P0 and P3 are always (0,0) and (1,1). */
const P1X = 0.2;
const P1Y = 0;
const P2X = 0;
const P2Y = 1;

/** Cubic Bézier component for control values `a` (P1) and `b` (P2) at `t`. */
function bezier(a: number, b: number, t: number): number {
  const u = 1 - t;
  return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t;
}

/**
 * `t` such that `x(t) === x`, by bisection.
 *
 * Bisection rather than Newton–Raphson on purpose. x(t) for this curve has a
 * derivative of 0.6 at t=0 and stays positive throughout, so it is invertible,
 * but Newton can still overshoot outside [0,1] on a curve whose second control
 * point sits at x=0. Thirty halvings settle to better than 1e-9 — far below a
 * device pixel — and, unlike Newton, cannot diverge.
 */
function solveT(x: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (bezier(P1X, P2X, mid) < x) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * The §06 easing curve as a function: progress in, eased progress out.
 *
 * Clamped at both ends, so a frame that arrives a millisecond late (or a
 * clock that runs backwards across a tab suspend) can never produce a value
 * outside 0..1 and send whatever it drives past its end state.
 */
export function ease(fraction: number): number {
  if (!(fraction > 0)) return 0; // also catches NaN
  if (fraction >= 1) return 1;
  return bezier(P1Y, P2Y, solveT(fraction));
}
