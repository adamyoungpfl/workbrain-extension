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

import { FLOW_NAV_CLEARANCE, FLOW_NAV_HEIGHT } from '../flow/dock';

/** The grab handle's own height — its TARGET, since V2.0 VB-72 split that from
 * the band it sits in. 44px because it is a control and the accessibility floor
 * (docs/GUARDRAILS.md) has no exception for a control that happens to look like
 * a rule. Exported so the two terms below can be read as a subtraction from it
 * rather than as two magic numbers. */
export const DRAWER_HANDLE_HEIGHT = 44;

/* ── V2.0 VB-72: LESS AIR ABOVE THE BREADCRUMBS ──────────────────────────
 *
 * The complaint: too much empty drawer between the grip and the trail. The
 * measurement, before: the grip's last painted pixel is 7px below the drawer's
 * top edge (it straddles the edge by half of its 14), the band under it ran the
 * handle's full 44, and the trail centres 11.5px words in its own 44 — so the
 * air between the grip and the first word of the breadcrumb was 53px. Above the
 * same edge, V1.7 VB-41 leaves 22px between the painted nav cluster and the top
 * of the grip. One side of the seam had two and a half times the air of the
 * other, and the wide side was the empty one.
 *
 * WHAT DOES NOT MOVE, because both are asserted numbers:
 *   · VB-41's clearances. `navPaintGapAboveDrawer()` is still 29px to the
 *     drawer's edge and 22px to the grip (tests/e2e/button-cluster.spec.ts).
 *     Nothing above the seam changes — not the bar's height, not the cluster,
 *     not the grip, which still straddles the edge exactly as it did.
 *   · VB-44/VB-58's 25px between the save note and the nav's painted words
 *     (`saveNotePaintGapAboveNav()`, tests/e2e/save-note.spec.ts).
 *
 * WHAT MOVES: the band under the grip, and only the part of it that is empty.
 * The handle is still a 44px target — docs/GUARDRAILS.md has no exception for
 * a control that looks like a rule — but 44px of TARGET is not 44px of drawer.
 * It keeps its floor by reaching UP into the clearance VB-41 already measured,
 * and it stops exactly where the nav's own hit boxes stop, so no press that
 * would have landed on Back, Next or Skip now lands on the handle instead.
 * That is the same paint-box/hit-box split VB-41 gave the nav and V1.3 VB-15
 * gave the buttons: shrink the paint, keep the target.
 *
 * The air that leaves is 20px, and the breadcrumb comes up by exactly that.
 */

/**
 * How much of the handle's 44 sits INSIDE the drawer — the band the trail
 * begins under.
 *
 * Derived from `FLOW_NAV_CLEARANCE` rather than chosen: the clearance is the
 * gap VB-41 leaves between the nav's hit boxes and the drawer's top edge, so it
 * is exactly the room the handle can take without touching another control.
 * Shrink VB-41's clearance and this band grows back rather than the two
 * quietly overlapping — dock.test.ts and height.test.ts hold both ends.
 */
export const DRAWER_HANDLE_BAND = DRAWER_HANDLE_HEIGHT - FLOW_NAV_CLEARANCE;

/**
 * How far the handle reaches above the drawer's top edge, over the panel's own
 * canvas, to keep its 44px target — and the pixels the drawer gets back.
 *
 * The grip is 14px and straddles that edge, so this has to clear 7 or the
 * handle would not cover its own visible representation. It does, twice over.
 */
export const DRAWER_HANDLE_OVERHANG = DRAWER_HANDLE_HEIGHT - DRAWER_HANDLE_BAND;

/** A tree row is exactly one 44px target tall (FileTree.css). */
export const DRAWER_ROW_HEIGHT = 44;

/**
 * V1.9 VB-52 — the breadcrumb band, in px.
 *
 * A full 44 and not the 28px chip the strip it replaces laid out at
 * (components/FileTypeToggle.css, V1.8). That strip could shrink its own row
 * because the hit box overhung it and the overhang landed on list rows inside
 * the same scrolling box. This band sits directly under the drag handle, and an
 * overhang here would land on the handle — taking pixels off a 44px control to
 * give them to another one, which is not a saving, it is a swap that breaks
 * docs/GUARDRAILS.md's floor twice over. So the band is the floor itself and
 * nothing overlaps anything.
 */
export const DRAWER_CRUMB_HEIGHT = 44;

/**
 * V1.9 VB-52 — the extra line the breadcrumb takes while the files are open.
 *
 * The lock sentence, printed under the file chips. It appears only while the
 * trail is offering the files, so it is not part of `DRAWER_CHROME_HEIGHT`
 * below: the drawer's floor and its resting height are about the state it
 * spends its life in, not the two seconds somebody is picking a file.
 */
export const DRAWER_CRUMB_NOTE = 18;

/**
 * V1.9 VB-51 — the view bar under the visual, in px.
 *
 * Two icon buttons, so 44: docs/GUARDRAILS.md floors every control at 44 and
 * says "including icon buttons" in as many words. This is the band the mode
 * pair moved down into — it is not new furniture, it is the same two buttons
 * one band lower — but the band it left was the handle's, which stays 44
 * whether anything sits in it or not. That is the honest cost of the mockup and
 * it is paid below, in the drawer's own heights, rather than by quietly
 * shrinking the peek.
 */
export const DRAWER_VIEW_BAR_HEIGHT = 44;

/**
 * Everything in the drawer that is not the file: the handle's band, the
 * breadcrumb under it, and the view bar along the bottom.
 *
 * Named once because four numbers are derived from it — the floor, the resting
 * height, the height Brain hands over at and the height Brain opens to
 * (core/drawer/mode.ts) — and a drawer whose chrome and whose arithmetic
 * disagree is a globe with its edge cut off.
 *
 * V2.0 VB-72: the first term is the handle's BAND rather than its target. The
 * two were the same number until the handle started reaching above the drawer's
 * edge for the rest of its 44, and this is the one that has to be right: it is
 * the space the chrome takes away from the file and from the globe's stage, and
 * twenty pixels of it are now outside the drawer altogether.
 */
export const DRAWER_CHROME_HEIGHT = DRAWER_HANDLE_BAND + DRAWER_CRUMB_HEIGHT + DRAWER_VIEW_BAR_HEIGHT;

/**
 * ── V1.9: THE DRAWER DOES NOT GROW. THE CHROME INSIDE IT DID ─────────────
 *
 * VB-51 and VB-52 put two more 44px bands inside this box, and the obvious move
 * — make the drawer 88px taller so the file keeps its rows — is not available.
 * Every pixel the drawer takes at rest comes out of the question, and the
 * question's composition is a rule with tests on it:
 *
 *  · V1.3 VB-17: at the resting height the question area is roughly the top 60%
 *    of the panel, and a 600px panel and a 900px panel must land within 15
 *    points of each other (core/flow/composition.ts, composition.test.ts). That
 *    second clause is the tight one — it puts the ceiling on this constant at
 *    189px, three above where V1.1 left it.
 *  · V1.3 VB-17 again, in the browser: the whole answer cluster inside the top
 *    third on the shortest question, and a tall hint's worked examples above the
 *    nav band (tests/e2e/question-fill.spec.ts, tests/e2e/save-note.spec.ts).
 *
 * So the resting height stays exactly what V1.1 shipped and V1.2 kept to the
 * pixel, and the FILE pays for the two bands. What that costs is honest and
 * worth stating: the peek was 134px of body with a 37px file strip stuck to the
 * top of it (~2 rows of file), and it is now 46px of body with nothing stuck to
 * it (~1 row).
 *
 * It is not the loss it looks like, for one reason: the breadcrumb prints the
 * name of the section being written, which is the job the peek's rows were
 * doing. What the peek says at rest is unchanged — you are here, this much is
 * done — and the row underneath is now the confirmation rather than the whole
 * message. Anything more than that is one drag away, as it always was.
 */

/**
 * The smallest the drawer may get: the chrome, one row, and the band's refund.
 *
 * The floor is what a person drags down to when they want the question and not
 * the file, and one row is the least that still shows the section being written
 * underneath the trail that names it.
 *
 * It says one row where V1.8 said two, and that is a correction rather than a
 * reduction: V1.8's floor was `44 + 44 * 2` and delivered about one row of
 * file, because 37px of the body it left was the file-type strip stuck to the
 * top of it. This is the number that was always true, written down.
 *
 * V2.0 VB-72 — WHERE THE TWENTY PIXELS GO, AND WHY NOT HERE. The band above the
 * trail gave up `DRAWER_HANDLE_OVERHANG`, and the drawer could have given them
 * up too: 156px instead of 176. It does not, and that is the decision rather
 * than an oversight. The floor and the peek below are the two numbers V1.1
 * fixed and V1.9 kept to the pixel against real pressure, and V1.9's own note
 * above records what paid for the two new bands — the FILE, down from about two
 * rows of it to one. VB-72 is the refund on that, so it goes where the debt is:
 * same drawer, same composition, more file inside it.
 */
export const DRAWER_MIN_HEIGHT = DRAWER_CHROME_HEIGHT + DRAWER_ROW_HEIGHT + DRAWER_HANDLE_OVERHANG;

/**
 * V2.3 VB-99 — the CLOSED notch, below the peek: the grabber's band plus one
 * status line (the mark, the current section, X/Y · Z%). It is a resting
 * state, not a point on the drag range — `clampDrawerHeight` still floors at
 * `DRAWER_MIN_HEIGHT`, and the drawer reaches closed only by the explicit
 * moves that mean it (dragging past the floor and releasing, or the keyboard
 * collapse), so a hand easing the drawer down never falls into it by a pixel.
 * Clicking or Enter on the grabber from closed opens to the minimum. The flow
 * surface reserves whatever height this is, exactly as it does for every
 * other height, so the question area gains the difference.
 */
export const DRAWER_CLOSED_HEIGHT = DRAWER_HANDLE_BAND + 26;

/**
 * V2.3 VB-99 — how far past the floor a drag must be pulled, at release, to
 * mean "close" rather than "I stopped at the bottom". The clamp holds the
 * VISIBLE drawer at the floor the whole time, so this is measured on the
 * unclamped target — pure intent, invisible until it is acted on. Two
 * keyboard steps' worth: past a wobble, within a flick.
 */
export const DRAWER_CLOSE_PULL = 32; // = DRAWER_STEP * 2, asserted in height.test.ts — the
// constant is declared later in this file and a forward reference would be a
// TDZ error, so the relationship is a test rather than an expression.

/**
 * Whether releasing this drag means CLOSE. The drag's own arithmetic
 * (`drawerHeightFromDrag`) never returns below the floor — the drawer never
 * *shows* an in-between — so intent is read from where the unclamped target
 * would have been: `DRAWER_CLOSE_PULL` or more past the floor at the moment
 * of release. Easing down to the floor and letting go lands AT the floor,
 * target == min, and stays open — the contract on `DRAWER_CLOSED_HEIGHT`.
 */
export function shouldCloseOnRelease(
  startHeight: number,
  startY: number,
  pointerY: number,
  bounds: DrawerBounds,
): boolean {
  const unclamped = startHeight + (startY - pointerY);
  return unclamped <= bounds.min - DRAWER_CLOSE_PULL;
}

/**
 * Where it starts, every session — 186px, the peek V1.1 shipped and V1.2 kept
 * to the pixel (FileDrawer.css's 132px body under a 44px header).
 *
 * The terms have changed and the total has not, which is the whole point: see
 * the note above for what the ceiling on this number is and why it is not
 * negotiable. VB-12 changed how the drawer is resized, V1.9 changed what is
 * inside it, V2.0 VB-72 changed how much of it is empty, and none of them
 * changed what it looks like when nobody has touched it.
 */
export const DRAWER_REST_HEIGHT = DRAWER_MIN_HEIGHT + 10;

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
  /** V2.3 VB-99 — the key crossed the closed boundary. `close` is only ever
   * offered from the floor (a second Home), `open` only from closed; neither
   * is reachable by a nudge, which is the "never by a pixel" contract. */
  readonly close?: true;
  readonly open?: true;
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
  closed = false,
): DrawerKeyChange | null {
  // V2.3 VB-99 — from CLOSED, every key that means "more drawer" opens to the
  // minimum (Adam: the grabber "opens to the minimum height it is set at
  // now"), End goes where End always goes, and the shrinking keys are spent:
  // there is nowhere further down to be.
  if (closed) {
    switch (key) {
      case 'Enter':
      case 'ArrowUp':
      case 'ArrowRight':
      case 'PageUp':
      case 'Home':
        return { height: bounds.min, settle: 'jump', open: true };
      case 'End':
        return { height: bounds.max, settle: 'jump', open: true };
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'PageDown':
        return null;
      default:
        return null;
    }
  }
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
      // V2.3 VB-99 — a second Home, already standing on the floor, is the
      // keyboard's deliberate step past it: close. One press parks at the
      // floor; pressing again says you meant lower. Symmetric with the drag's
      // pull-past-the-floor, and unreachable by any nudge.
      if (current <= bounds.min) return { height: bounds.min, settle: 'jump', close: true };
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
