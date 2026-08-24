/**
 * V1.2 VB-11 — the geometry of the docked chrome under a question.
 *
 * Back / Next / Skip used to sit in the flow's own footer, at the end of the
 * scrolling question, with the file drawer below them as a separate object.
 * VB-11 pegs them to the drawer's top edge instead, so the two read as one
 * docked unit and the buttons keep the same relationship to the drawer at
 * every height the person drags it to.
 *
 * That turns "how much room does the panel's furniture take" from a single
 * number (the drawer) into a small sum, and a sum is arithmetic — so it lives
 * here rather than in a `calc()` nobody can test (CLAUDE.md's one
 * architectural rule). Flow.tsx sets the results as custom properties and
 * Flow.css only ever reads them, so the numbers exist in exactly one place.
 *
 * **Nothing here is stored.** These are functions of the drawer's current
 * height, which is itself ephemeral session state (see core/drawer/height.ts
 * and docs/ARCHITECTURE.md) — recomputed on every render, written down never.
 */

/* ── V1.7 VB-41: the cluster, and the two boxes every control in it has ───
 *
 * The complaint: Back / Next / Skip sat in boxes, eight pixels above the
 * drawer's grab handle, and the two read as one row of furniture — you could
 * not tell the buttons from the thing you drag. VB-41's answer is text and
 * icons with no containers at all, centred, with real space above the handle.
 *
 * Dropping the container takes away the box a focus ring used to hug and the
 * ground contrast was measured against, so the control now has TWO boxes and
 * the numbers below are what keeps them in a fixed relationship:
 *
 *   the PAINTED box   the label, plus a little air. What you see, what the
 *                     ring goes round, and 26px tall.
 *   the HIT box       44 x 44, the accessibility floor (docs/GUARDRAILS.md),
 *                     which overhangs the painted box by `navPaintOverhang()`
 *                     on every side and is pulled back out of the layout by
 *                     exactly that, so the cluster reads at its painted size.
 *
 * This is V1.3 VB-15's split — 30px painted, 44px pressable, ring moved to the
 * painted box — applied to a control with no bubble to hug. See
 * components/DeepDive.css, which did it first and holds the reasoning.
 *
 * The arithmetic is here rather than in a `calc()` because it is arithmetic
 * (CLAUDE.md's one architectural rule): Flow.tsx publishes the results as
 * custom properties and Flow.css only ever reads them. dock.test.ts holds the
 * ring inside the hit box and the painted cluster clear of the handle.
 */

/** The accessibility floor for anything pressable (docs/GUARDRAILS.md), and
 * the same 44 the drawer's own handle is built on. */
export const FLOW_NAV_TARGET = 44;

/** The label's own line box, in px. Named here because it is the term both
 * boxes are measured from — the hit box is padding around it and the painted
 * box is a little air around it — and Flow.css sets `line-height` from this
 * rather than the other way round. */
export const FLOW_NAV_LABEL = 18;

/** The air around the label that the ring hugs, in px.
 *
 * Four, not zero: an outline drawn tight to the glyphs cuts the descender of
 * "Skip" and reads as an underline rather than a ring. Four is the smallest
 * that clears a descender at 14px and still reads as "this word", which is the
 * whole point of moving the ring off the 44px box. */
export const FLOW_NAV_PAINT_PAD = 4;

/**
 * The clear space between the bottom of the hit boxes and the drawer's top
 * edge, in px — VB-41's "padding above the drawer".
 *
 * This is the fix for the actual complaint, so it is a number with a job
 * rather than a taste: with the overhang the hit box gives back, it puts
 * `navPaintGapAboveDrawer()` = 29px between the last painted pixel of the
 * cluster and the drawer's edge, and 22px between it and the top of the grip,
 * which straddles that edge by half of its 14px. The old bar had 8px, and 8px
 * is how two things become one.
 *
 * It is not larger because every pixel here is taken from the question:
 * `FLOW_NAV_HEIGHT` is subtracted from the drawer's ceiling
 * (core/drawer/height.ts) and reserved under the question
 * (core/flow/composition.ts), and on the 600px panel that composition is
 * checked at there are only a few pixels of slack left.
 */
export const FLOW_NAV_CLEARANCE = 20;

/** The focus ring, as docs/GUARDRAILS.md specifies it: 2px wide, 2px clear of
 * what it surrounds. Both terms together are how far outside the painted box
 * the ring reaches, which is the only thing this file needs from it. */
export const FLOW_NAV_RING_REACH = 4;

/**
 * How tall the docked navigation bar is, in px.
 *
 * One hit box, then the clearance above the drawer. There is deliberately
 * nothing above the hit box: the painted control is `navPaintOverhang()` px
 * short of the top of its own hit box already, and the ring fits inside that,
 * so a top inset would be a second helping of the same space — paid for out of
 * the question's room (see `FLOW_NAV_CLEARANCE`).
 *
 * Fixed rather than measured: the bar holds at most three controls on one row
 * and never wraps in a 400px panel, and a measured height would mean the
 * drawer's ceiling could not be computed until after first paint.
 */
export const FLOW_NAV_HEIGHT = FLOW_NAV_TARGET + FLOW_NAV_CLEARANCE;

/** The padding above and below the label that makes the hit box 44px tall. */
export function navHitPadding(): number {
  return (FLOW_NAV_TARGET - FLOW_NAV_LABEL) / 2;
}

/** How tall the painted box is: the label and its air. */
export function navPaintHeight(): number {
  return FLOW_NAV_LABEL + FLOW_NAV_PAINT_PAD * 2;
}

/**
 * How far the hit box overhangs the painted one, top and bottom — and so the
 * negative margin that takes the overhang back out of the layout.
 *
 * VB-15's move exactly: shrink the paint, keep the target. The cluster is laid
 * out at `navPaintHeight()` while the box you can press is still the full 44.
 */
export function navPaintOverhang(): number {
  return navHitPadding() - FLOW_NAV_PAINT_PAD;
}

/**
 * The gap between the last painted pixel of the cluster and the drawer's top
 * edge, in px — what a person actually sees between the buttons and the
 * handle, and the number VB-41 is asking for.
 *
 * It is the bar's clearance plus the overhang the hit box gives back, which is
 * why the clearance can be smaller than the gap it produces.
 */
export function navPaintGapAboveDrawer(): number {
  return FLOW_NAV_CLEARANCE + navPaintOverhang();
}

/**
 * The breathing space between the last thing in the question and the docked
 * bar, in px. Carried over unchanged from V1.1's reservation, which had the
 * same 8px under the question before the drawer began.
 */
export const FLOW_NAV_GAP = 8;

/** A height the DOM could not give us is worth zero, never NaN — a NaN here
 * would reach `padding-bottom` as an invalid value and silently drop the whole
 * reservation, putting the drawer over the question. */
function usable(height: number): number {
  return Number.isFinite(height) ? Math.max(0, Math.round(height)) : 0;
}

/**
 * Everything pinned to the bottom of the panel: the drawer, plus the
 * navigation bar now riding on its top edge.
 *
 * This is the number `drawerBounds` has to keep clear of the question — see
 * core/drawer/height.ts, whose ceiling dropped by `FLOW_NAV_HEIGHT` when the
 * nav moved down here.
 */
export function dockedChromeHeight(drawerHeight: number): number {
  return usable(drawerHeight) + FLOW_NAV_HEIGHT;
}

/**
 * What the flow surface reserves beneath itself, in px, so the docked chrome
 * covers nothing: the chrome's own height plus the gap.
 *
 * This is what makes the pair a dock rather than an overlay (the same job
 * V1.1's drawer-height-only reservation did): the page is exactly this much
 * taller than its content, so every part of the question can be scrolled clear
 * of the bar and the drawer.
 */
export function flowBottomReserve(drawerHeight: number): number {
  return dockedChromeHeight(drawerHeight) + FLOW_NAV_GAP;
}
