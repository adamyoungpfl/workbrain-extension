/**
 * V1.3 VB-17 — how much of the panel the question owns.
 *
 * The complaint this exists to answer: the question sat at the top of the
 * panel at its own natural height and left a wide blank band between the last
 * thing it printed and the docked chrome underneath. The screen read as
 * half-empty rather than composed.
 *
 * The rule is **a composition, not a magic number**: the question, its
 * controls and its answer area together occupy the panel from the top down to
 * the docked chrome — which, at the drawer's resting height, is roughly the
 * top 60% of the panel. That "roughly 60%" is not typed anywhere as a length;
 * it *falls out* of geometry that already exists (core/drawer/height.ts's
 * resting height and core/flow/dock.ts's bar), and `questionAreaFraction`
 * below is what lets a test hold that geometry to it. Change the resting
 * drawer height enough and composition.test.ts fails, which is exactly the
 * conversation that should happen.
 *
 * **The layout distributes space; it does not set it.** The panel publishes
 * one number from here — `questionAreaOffset` — and the stylesheet subtracts
 * it from `100dvh`. The viewport term stays in CSS on purpose: `dvh` is live,
 * so a panel someone drags wider or a window someone resizes recomposes
 * without a resize listener, a re-render, or a second copy of
 * `window.innerHeight` in this surface. Everything that is *arithmetic* is
 * here, tested without a browser, exactly as core/flow/dock.ts's own header
 * argues (CLAUDE.md's one architectural rule).
 *
 * **Nothing here is stored.** Like everything else about the dock, these are
 * functions of the drawer's current height — itself ephemeral session state
 * (docs/ARCHITECTURE.md, "nothing derived is stored").
 */

import { flowBottomReserve } from './dock';

/**
 * The gap between the top of the panel and the top of the flow surface, in px.
 *
 * It is the panel document's body margin — the browser's own 8px, which this
 * product has never overridden. The same number is already written down, for
 * the same reason, in Flow.css's note on the docked bar's 26px gutter ("the
 * panel's 8px body margin plus the flow's 18px gutter"). It appears here
 * because the question area is measured from the top of the *viewport* — that
 * is what `100dvh` is — while the flow surface starts one body margin lower,
 * and the difference is what stops the block overshooting the docked bar by
 * exactly that margin.
 */
export const PANEL_SURFACE_TOP = 8;

/**
 * The share of the panel the question area is meant to read as — VB-17's
 * "roughly the top 60%".
 *
 * Nothing computes a length from this. It is the statement of the rule, and
 * `questionAreaFraction` is how it is checked against the geometry that
 * actually produces the layout.
 *
 * **It is a floor, not a target to hit.** The complaint VB-17 answers is
 * half-emptiness: too little of the panel doing any work. A taller panel with
 * the drawer still at its peek gives the question *more* than 60% — 71% on a
 * 900px panel — and that is the right answer, not a violation, because the
 * alternative is the same blank band moved down the screen. The ceiling on
 * this direction is the drawer's own minimum height (core/drawer/height.ts),
 * which guarantees the file never becomes a sliver.
 */
export const QUESTION_AREA_TARGET_FRACTION = 0.6;

/**
 * How far below the target still reads as "roughly 60%".
 *
 * Five points. A short panel — 600px, the smallest this is designed for —
 * lands at 56%, because the docked chrome is a fixed number of pixels and
 * takes proportionally more of a small screen. Any panel taller than about
 * 660px clears 60% outright.
 */
export const QUESTION_AREA_TOLERANCE = 0.05;

/**
 * The other end of the same rule: at its resting height the drawer still has
 * to read as a real object rather than a rule at the bottom of the screen. If
 * the question area ever exceeded this at rest, the peek would have become
 * decoration.
 */
export const QUESTION_AREA_CEILING_FRACTION = 0.75;

/**
 * What the question area is measured *down from* the viewport's full height:
 * everything the flow surface does not own — the docked chrome and its gap
 * (core/flow/dock.ts), plus the margin above the surface itself.
 *
 * This is the one number the panel needs. Flow.tsx publishes it as
 * `--flow-area-offset` and Flow.css subtracts it from `100dvh`; the stylesheet
 * adds nothing up, here or anywhere else.
 */
export function questionAreaOffset(drawerHeight: number): number {
  return flowBottomReserve(drawerHeight) + PANEL_SURFACE_TOP;
}

/**
 * How tall the question area is on a panel this tall, with the drawer at this
 * height. Never negative: a panel shorter than its own furniture leaves the
 * question no room rather than a negative one, and the surface simply scrolls
 * (docs/GUARDRAILS.md's degradation rule — less, never broken).
 */
export function questionAreaHeight(viewportHeight: number, drawerHeight: number): number {
  if (!Number.isFinite(viewportHeight)) return 0;
  return Math.max(0, Math.round(viewportHeight - questionAreaOffset(drawerHeight)));
}

/** The same measurement as a share of the panel — the form VB-17's rule is
 * written in, and the only form worth asserting against. */
export function questionAreaFraction(viewportHeight: number, drawerHeight: number): number {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return 0;
  return questionAreaHeight(viewportHeight, drawerHeight) / viewportHeight;
}

/**
 * Whether a panel this tall, with the drawer here, still reads as "the
 * question fills the top 60%".
 *
 * Deliberately a predicate over the *real* geometry rather than a constant
 * anyone can edit: the layout is not built from this, it is judged by it. See
 * `QUESTION_AREA_TARGET_FRACTION` on why more than 60% passes and less does
 * not.
 */
export function fillsQuestionArea(viewportHeight: number, drawerHeight: number): boolean {
  return questionAreaFraction(viewportHeight, drawerHeight) >= QUESTION_AREA_TARGET_FRACTION - QUESTION_AREA_TOLERANCE;
}
