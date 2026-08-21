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

/**
 * How tall the docked navigation bar is, in px.
 *
 * 44 for the buttons — the accessibility floor (docs/GUARDRAILS.md), and the
 * same floor `DRAWER_HANDLE_HEIGHT` is built on — plus 8 above and below, which
 * is the smallest gap that keeps a focus ring (2px, 2px offset) clear of both
 * edges of the bar. Fixed rather than measured: the bar holds at most three
 * buttons on one row and never wraps in a 400px panel, and a measured height
 * would mean the drawer's ceiling could not be computed until after first
 * paint.
 */
export const FLOW_NAV_HEIGHT = 60;

/**
 * The room above and below the buttons inside that bar, in px — the "8 above
 * and below" the height above is built from, given a name at V1.4 VB-22.
 *
 * It stopped being a description of the bar's padding and became geometry the
 * moment the bar took a gradient: the ramp's steep half has to finish exactly
 * where the buttons start, or the boundary a control needs against its own
 * background is not there along its whole height. See core/drawer/chrome.ts.
 * core/drawer/chrome.test.ts holds the two constants to each other.
 */
export const FLOW_NAV_INSET = 8;

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
