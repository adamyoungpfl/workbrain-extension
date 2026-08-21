/**
 * V1.2 VB-12 — how tall the file drawer is.
 *
 * The drawer stopped being collapsed-or-expanded and became continuously
 * resizable, so "how tall is it" turned from a boolean into arithmetic with
 * real edges: a peek it may never shrink below, a ceiling that must never
 * cover the question, a drag that has to survive a pointer leaving the window,
 * and a keyboard equivalent that steps through the same range.
 *
 * All of that is arithmetic, so all of it is here rather than in the
 * component — the repo's one architectural rule (CLAUDE.md): if it is worth
 * testing, it belongs in core/ and it is tested without a browser. FileDrawer
 * supplies two numbers from the DOM (the viewport's height and the pointer's
 * y) and renders what comes back.
 *
 * **Nothing here is stored.** The height is a fact about this glance at the
 * panel, exactly like `Flow`'s Back history and the drawer's own scroll
 * position (docs/ARCHITECTURE.md, "Nothing derived is stored"). These
 * functions are given the current height and hand back the next one; where it
 * lives between calls is React state that dies with the panel.
 */

import { FLOW_NAV_HEIGHT } from '../flow/dock';

/** The grab handle's own height. 44px because it is a control and the
 * accessibility floor (docs/GUARDRAILS.md) has no exception for a control
 * that happens to look like a rule. Exported so the drawer's minimum can be
 * read as "the handle, plus two rows of tree" rather than as a magic number. */
export const DRAWER_HANDLE_HEIGHT = 44;

/** A tree row is exactly one 44px target tall (FileTree.css). */
export const DRAWER_ROW_HEIGHT = 44;

/**
 * The smallest the drawer may get: the handle plus two rows.
 *
 * Two rows is the floor because the drawer scrolls the section being written
 * into view (FileDrawer.tsx) and a one-row peek would show that section with
 * no sign of anything above or below it — a list of one is not a list. It is
 * also comfortably clear of VB-14's "~90px" note about the peek being where
 * people spend most of their time.
 */
export const DRAWER_MIN_HEIGHT = DRAWER_HANDLE_HEIGHT + DRAWER_ROW_HEIGHT * 2;

/**
 * Where it starts, every session: the handle plus three rows — the same peek
 * V1.1 shipped (FileDrawer.css's 132px body under a 44px header). VB-12
 * changes how the drawer is resized, not what it looks like when you have
 * never touched it.
 */
export const DRAWER_REST_HEIGHT = DRAWER_HANDLE_HEIGHT + DRAWER_ROW_HEIGHT * 3 + 10;

/**
 * Space that stays above the drawer no matter what, in px.
 *
 * VB-12: "a maximum that never fully covers it". 260px is the flow's own top
 * padding (20) plus the module label and its progress bar (~44) plus three
 * lines of a 22px/1.25 question (~83) plus its hint and the gap under it
 * (~60), with the rest as slack. Measured against the tallest real question
 * in the ported interview, not guessed.
 *
 * This is the question's own room and nothing else. V1.2 VB-11 moved Back /
 * Next / Skip down onto the drawer's top edge, which put a second piece of
 * furniture between the question and the drawer — that bar is
 * `FLOW_NAV_HEIGHT` and is subtracted separately in `drawerBounds`, so this
 * number stays exactly the measurement it always was.
 */
export const DRAWER_QUESTION_RESERVE = 260;

/**
 * And a second ceiling, as a fraction of the panel: on a very tall panel
 * `DRAWER_QUESTION_RESERVE` alone would let the drawer take 80% of the screen,
 * which is a drawer that has quietly become the surface. The question is the
 * primary object here; the file is what it is writing.
 */
export const DRAWER_MAX_FRACTION = 0.62;

/** One arrow key. Small enough to aim with, big enough that crossing the
 * range does not take forty presses. */
export const DRAWER_STEP = 16;

/** Page Up / Page Down — a row and a half, so paging feels like paging. */
export const DRAWER_PAGE_STEP = 64;

export interface DrawerBounds {
  readonly min: number;
  readonly max: number;
}

/** Whether a height change was a nudge (an arrow key) or a jump (Home, End,
 * or the collapse toggle). The two settle at different speeds — see
 * FileDrawer.css. A pointer drag is neither: it tracks the pointer exactly and
 * has no settle at all. */
export type DrawerSettle = 'nudge' | 'jump';

export interface DrawerKeyChange {
  readonly height: number;
  readonly settle: DrawerSettle;
}

function round(value: number): number {
  return Math.round(value);
}

/**
 * The range the drawer may be dragged through, for a panel this tall.
 *
 * Derived from the viewport on every call rather than stored, so a panel the
 * person resizes gets honest bounds without anything having to be invalidated.
 * Degenerate viewports collapse to `min === max` rather than throwing or
 * producing an inverted range — a drawer that cannot be resized is a worse
 * drawer, not a broken panel (docs/GUARDRAILS.md's degradation rule).
 *
 * V1.2 VB-11: the navigation bar is now pegged to the drawer's top edge and
 * rides up with it, so the ceiling has to clear the question *and* the bar.
 * That is the only reason `FLOW_NAV_HEIGHT` appears here — the reserve itself
 * is unchanged, and the two terms stay separate so each one still says what it
 * is protecting.
 */
export function drawerBounds(viewportHeight: number): DrawerBounds {
  if (!Number.isFinite(viewportHeight)) return { min: DRAWER_MIN_HEIGHT, max: DRAWER_MIN_HEIGHT };
  const room = viewportHeight - DRAWER_QUESTION_RESERVE - FLOW_NAV_HEIGHT;
  const capped = Math.min(room, viewportHeight * DRAWER_MAX_FRACTION);
  return { min: DRAWER_MIN_HEIGHT, max: Math.max(DRAWER_MIN_HEIGHT, round(capped)) };
}

/** Every height that reaches the DOM goes through here. */
export function clampDrawerHeight(height: number, bounds: DrawerBounds): number {
  if (!Number.isFinite(height)) return bounds.min;
  return round(Math.min(Math.max(height, bounds.min), bounds.max));
}

/** Where the drawer sits when nobody has touched it — the V1.1 peek, clamped,
 * because a short panel's ceiling can be lower than the resting height. */
export function restingDrawerHeight(bounds: DrawerBounds): number {
  return clampDrawerHeight(DRAWER_REST_HEIGHT, bounds);
}

/**
 * The height for a pointer at `pointerY`, given where the drag began.
 *
 * Computed from the *start* of the gesture rather than accumulated per move
 * event, so the drawer cannot drift away from the grip over a long drag and
 * so a pointer dragged past either end and back comes straight back to the
 * grip instead of resuming from wherever the clamp parked it.
 *
 * The screen's y axis points down and the drawer grows upwards, hence the
 * subtraction. That sign is the whole reason this is a named function and not
 * an expression inlined in a move handler.
 */
export function drawerHeightFromDrag(
  startHeight: number,
  startY: number,
  pointerY: number,
  bounds: DrawerBounds,
): number {
  return clampDrawerHeight(startHeight + (startY - pointerY), bounds);
}

/**
 * The keyboard equivalent of the drag — VB-12 is explicit that a drag-only
 * control fails the keyboard-path guardrail.
 *
 * Follows the WAI-ARIA window-splitter pattern, which is what a focusable
 * `role="separator"` is: arrows nudge, Page Up/Down move further, Home and End
 * go to the ends, and Enter collapses to the peek or restores the height it
 * was last dragged to. `Home` is the *minimum* and `End` the maximum because
 * that is the order `aria-valuemin`/`aria-valuemax` announce, and a control
 * whose Home key does the opposite of its own announced range is a puzzle.
 *
 * Returns `null` for a key this control does not handle, which is the
 * component's signal to leave the event alone rather than swallowing it.
 *
 * @param restore Height to return to when Enter un-collapses — the caller
 *   remembers the last non-peek height. Clamped like anything else, so a
 *   remembered height from a taller panel cannot escape the current bounds.
 */
export function drawerHeightForKey(
  key: string,
  current: number,
  bounds: DrawerBounds,
  restore: number,
): DrawerKeyChange | null {
  const nudge = (delta: number): DrawerKeyChange => ({
    height: clampDrawerHeight(current + delta, bounds),
    settle: 'nudge',
  });
  const jump = (height: number): DrawerKeyChange => ({ height: clampDrawerHeight(height, bounds), settle: 'jump' });

  switch (key) {
    // Up and Right grow it, Down and Left shrink it. Both axes are accepted
    // because a horizontal separator announces itself as horizontal, and the
    // horizontal arrows are what some screen-reader users will reach for.
    case 'ArrowUp':
    case 'ArrowRight':
      return nudge(DRAWER_STEP);
    case 'ArrowDown':
    case 'ArrowLeft':
      return nudge(-DRAWER_STEP);
    case 'PageUp':
      return nudge(DRAWER_PAGE_STEP);
    case 'PageDown':
      return nudge(-DRAWER_PAGE_STEP);
    case 'Home':
      return jump(bounds.min);
    case 'End':
      return jump(bounds.max);
    case 'Enter':
      // Already at the peek: restore. Otherwise collapse to the peek. The
      // restore value falling at the peek itself (nothing to go back to) is
      // answered with the resting height, so Enter is never a no-op.
      if (current <= bounds.min) {
        const target = clampDrawerHeight(restore, bounds);
        return jump(target <= bounds.min ? restingDrawerHeight(bounds) : target);
      }
      return jump(bounds.min);
    default:
      return null;
  }
}

/**
 * How far open the drawer is, 0–100, for the separator's `aria-valuetext`.
 *
 * `aria-valuenow` carries the real height in px because that is the number the
 * range is expressed in and the number that must move monotonically. Nobody
 * wants to hear "one hundred and eighty-six" though, so the spoken form is a
 * percentage of the range. A range with no room in it reads as fully open,
 * because it is: there is nowhere else for it to go.
 */
export function drawerOpenPercent(height: number, bounds: DrawerBounds): number {
  const span = bounds.max - bounds.min;
  if (span <= 0) return 100;
  return round(((clampDrawerHeight(height, bounds) - bounds.min) / span) * 100);
}
