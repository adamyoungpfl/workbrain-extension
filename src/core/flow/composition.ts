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
/**
 * V2.3 VB-94 note, after a wrong turn worth recording: the cluster moved
 * in-flow INSIDE the filled area, so this offset needed NO change — the fill
 * still runs to the note band's gap, with the cluster composing inside it.
 * An earlier fix added the cluster's band here on a misread of a spec
 * failure whose real cause was the fixed note being counted as a content
 * row; the addition broke the fill by exactly the amount it "fixed".
 * `questionSurfaceOffset` stays as the alias the split introduced, so the
 * two names cannot drift apart again.
 */
export function questionSurfaceOffset(drawerHeight: number): number {
  return flowBottomReserve(drawerHeight) + PANEL_SURFACE_TOP;
}

export function questionAreaOffset(drawerHeight: number): number {
  return questionSurfaceOffset(drawerHeight);
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

/* ── The cluster, and where the slack is allowed to fall ──────────────────
 *
 * VB-17 shipped once and missed. Filling the panel down to the dock was read
 * as "share the leftover pixels out evenly", so the answer band was centred in
 * the room it was given — which on the real built extension at 400x760, on
 * `preferred_name`, put a 124px hole between the question and its own field
 * AND a 140px one between the last control and the save note. Two dead bands
 * where V1.2 had one. Blanker, not less blank.
 *
 * The rule that replaces it, and the thing the code below exists to make
 * checkable:
 *
 *   The question, its help and its controls are ONE CLUSTER, spaced by the
 *   ordinary margins that say "these belong together", anchored at the top.
 *   The leftover room falls in ONE seam, below the cluster, above the dock.
 *
 * The first half of that is a statement about gaps between adjacent things on
 * screen, so it can only be checked by measuring a real layout — which is what
 * tests/e2e/question-fill.spec.ts does. But *judging* a list of measurements is
 * arithmetic, and arithmetic belongs here, tested without a browser
 * (CLAUDE.md's one architectural rule). The e2e measures; this decides.
 *
 * The old e2e checked only the cluster's outer bounds — the top row was near
 * the top, the bottom row was near the bar — which is exactly why a 124px hole
 * between two of the rows in the middle sailed through it.
 */

/**
 * The widest gap between two adjacent things inside the cluster that still
 * reads as related spacing, in px.
 *
 * 32 is a little over the biggest margin this surface actually uses to
 * separate two related rows — the hint's 18px bottom margin plus the flow's own
 * 4px row gap, the readonly block's 18px, the idea row's 12px — with enough
 * headroom that ordinary typographic spacing never trips it and nothing that
 * reads as a hole ever passes. It is a ceiling on a mistake, not a spacing
 * value: no rule in Flow.css is derived from it.
 */
export const CLUSTER_MAX_INTERNAL_GAP = 32;

/** One measured thing on the question surface — a rendered row's own box, in
 * viewport pixels, named by whatever the measurer calls it. */
export interface MeasuredRow {
  readonly name: string;
  readonly top: number;
  readonly bottom: number;
}

/** The vertical space between two adjacent rows, and which two they were —
 * the name is what makes a failure say where the hole is rather than just how
 * big it was. */
export interface MeasuredGap {
  readonly after: string;
  readonly before: string;
  readonly gap: number;
}

/**
 * Every seam between consecutive rows, top to bottom.
 *
 * Sorted here rather than trusted, because a caller reading the DOM gets rows
 * in document order and a fixed or flex-reordered element would put them out of
 * visual order. Overlaps clamp to zero: two rows on top of each other is a
 * different bug, and reporting it as a negative gap would let it masquerade as
 * the tightest spacing on the screen.
 */
export function gapsBetween(rows: readonly MeasuredRow[]): MeasuredGap[] {
  const ordered = [...rows].sort((a, b) => a.top - b.top);
  const gaps: MeasuredGap[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const previous = ordered[i - 1]!;
    const next = ordered[i]!;
    gaps.push({ after: previous.name, before: next.name, gap: Math.max(0, next.top - previous.bottom) });
  }
  return gaps;
}

/** The worst seam in a list, or null when there was never more than one row. */
export function widestGap(gaps: readonly MeasuredGap[]): MeasuredGap | null {
  return gaps.reduce<MeasuredGap | null>((worst, gap) => (worst === null || gap.gap > worst.gap ? gap : worst), null);
}

/** What `inspectCluster` found. */
export interface ClusterInspection {
  /** Every seam between two rows of the cluster itself. */
  readonly internal: MeasuredGap[];
  /** The widest of them, which is the one a failure should name. */
  readonly worst: MeasuredGap | null;
  /** The one seam the leftover room is allowed to fall into: between the
   * cluster's last row and the foot row pinned above the dock. Null when the
   * surface has no foot row, or nothing above it. */
  readonly slack: MeasuredGap | null;
  /** Whether the cluster still reads as one composed thing. */
  readonly composed: boolean;
}

export interface ClusterOptions {
  /**
   * The row pinned to the foot of the surface — the save note. Everything
   * above it is the cluster; the seam immediately before it is the slack, and
   * is the only one on the screen allowed to be wide.
   */
  readonly footRow?: string;
  /** Override for `CLUSTER_MAX_INTERNAL_GAP`, for a surface with a reason. */
  readonly maxInternalGap?: number;
}

/**
 * Judges a measured question surface against VB-17's rule.
 *
 * Everything above `footRow` is the cluster and every seam inside it must be
 * ordinary spacing. The single seam between the cluster and the foot row is
 * the slack and is deliberately unbounded — it is the whole point: on a short
 * question at the drawer's peek it is most of the lower half of the panel, and
 * that is the composition working, not failing.
 *
 * A surface with no foot row (nothing matched, or a screen that renders none)
 * is all cluster, and then every seam on it is held to the threshold — which
 * is the safe direction to be wrong in.
 */
export function inspectCluster(rows: readonly MeasuredRow[], options: ClusterOptions = {}): ClusterInspection {
  const limit = options.maxInternalGap ?? CLUSTER_MAX_INTERNAL_GAP;
  const ordered = [...rows].sort((a, b) => a.top - b.top);
  const footIndex = options.footRow === undefined ? -1 : ordered.findIndex((row) => row.name === options.footRow);
  const cluster = footIndex === -1 ? ordered : ordered.slice(0, footIndex);
  const internal = gapsBetween(cluster);
  const worst = widestGap(internal);
  const slack =
    footIndex <= 0 ? null : gapsBetween([ordered[footIndex - 1]!, ordered[footIndex]!])[0] ?? null;
  return { internal, worst, slack, composed: worst === null || worst.gap <= limit };
}
