/**
 * V1.4 VB-22 — where the drawer's surface ends.
 *
 * The complaint: the mode switch and the docked nav read as two strips stacked
 * on the drawer. They should read as the drawer's own edge. So the bar takes
 * the stage's colour, the nav above it carries that colour up into the panel
 * white, and — the specific ask — **the fade begins wherever the bar has been
 * dragged to**, tracking the handle rather than sitting at a fixed height.
 *
 * The tracking is free: the nav is already pegged to the drawer's top edge
 * (V1.2 VB-11, core/flow/dock.ts), so a gradient anchored to the bottom of
 * that bar begins at the handle by construction and cannot drift from it. What
 * is *not* free is the shape of the ramp, and that is what this file is.
 *
 * ── The problem the shape solves ──────────────────────────────────────────
 *
 * Back / Next / Skip sit inside those 60px. A ramp that ran the stage colour
 * to white evenly across them would put every control on a background that
 * travels the whole luminance range down its own height — and against a range
 * that wide **no fixed colour holds a boundary**: whatever the control's edge
 * is, the ramp passes through it somewhere and the contrast there is 1:1.
 * That is not a treatment that can be tuned, it is arithmetic, and it rules
 * out "just pick a colour that works at both ends" outright.
 *
 * docs/V1.4-REFINEMENT.md offers two ways out — give the buttons their own
 * solid ground so the gradient passes behind them, or interpolate their
 * treatment with the variable driving the gradient. This is the first, with
 * the second folded into how the ground is chosen: **every nav control gets an
 * opaque ground taken from the dock's own palette** (Flow.css's `--dock-chip`
 * and friends), so its label is read against a colour that does not move, and
 * the control still belongs to the surface it grew out of rather than sitting
 * on top of it.
 *
 * The ramp is then shaped so the ground has a boundary along its whole height:
 *
 *   0 → NAV_RAMP_FOOT     the stage colour, lifting fast. This is the foot of
 *                         the bar, under the buttons, and it is what makes the
 *                         nav visibly continuous with the drawer's own head.
 *   NAV_RAMP_FOOT → top   the long, slow half, running out into `--canvas`
 *                         exactly at the bar's top edge.
 *
 * `NAV_RAMP_FOOT_MIX` is the whole trick: by the time the ramp reaches the
 * bottom of the buttons it has already lifted far enough off the stage colour
 * that a chip cut from that stage clears 3:1 against it, and every pixel
 * further up is lighter still. The value is not a taste decision — it is the
 * smallest lift that clears the floor with room to spare, and
 * chrome.test.ts holds it to that against the real token values.
 *
 * **The ramp stops at the bar's top edge, deliberately.** It would look softer
 * running on into the question area, and it would then be painting over
 * content: `flowBottomReserve` (core/flow/dock.ts) reserves the bar and eight
 * pixels, nothing more, and on a 600px panel there is not eight pixels of
 * slack left to spend (core/flow/composition.ts). A dock that hides the save
 * note is a worse dock than one whose fade is 60px long.
 *
 * **Nothing here is stored.** Like the rest of the dock's geometry these are
 * constants and functions of the drawer's current height, which is itself
 * ephemeral session state (docs/ARCHITECTURE.md, "nothing derived is stored").
 */

import { mixSrgb } from '../color/contrast';
import type { Rgb } from '../color/contrast';
import { FLOW_NAV_HEIGHT, FLOW_NAV_INSET } from '../flow/dock';

/**
 * How tall the fade is, measured up from the drawer's top edge.
 *
 * Exactly the bar — see the header on why it does not run any further up the
 * panel. Written as the bar's own height rather than as 60 so the two cannot
 * drift apart.
 */
export const NAV_RAMP_HEIGHT = FLOW_NAV_HEIGHT;

/**
 * The fast part at the bottom, in px: the strip below the buttons, which is
 * the only place a ramp this short can do its steep work without a control
 * standing in it.
 *
 * It is the bar's own inset, so the ramp's first stop lands exactly on the
 * bottom edge of Back / Next / Skip. That is what makes the boundary check
 * below a statement about the whole button rather than about its middle.
 */
export const NAV_RAMP_FOOT = FLOW_NAV_INSET;

/**
 * How far the ramp has travelled from the stage colour toward `--canvas` by
 * the top of the foot — i.e. at the bottom edge of the buttons.
 *
 * 0.45 is chosen, not tuned: it is where a chip cut from the dark stage
 * (`--globe-panel`, the deepest ground the dock uses) clears 3:1 against the
 * ramp beside it with about half a point of headroom, and where the primary's
 * near-black keyline clears it by a full point. chrome.test.ts checks both
 * against the token values themselves, so a change to either end of the ramp
 * fails there rather than on someone's screen.
 */
export const NAV_RAMP_FOOT_MIX = 0.45;

/**
 * The knee, in px, and how far the ramp has travelled by it.
 *
 * The floor is cleared by the foot alone; this stop is about how the fade
 * *looks*. Two stops make one straight line from the stage colour to the
 * canvas, and a straight line through the middle of that range parks a broad
 * flat grey across the bar — a grey slab under the question rather than a
 * surface running out. Bending the ramp here keeps the deep colour near the
 * drawer's own edge, where it reads as that edge, and gets the top half of the
 * bar most of the way to white.
 *
 * It only ever *lightens* what is above the foot, so every contrast the foot
 * guarantees is guaranteed by more here — `navRampMixAt` is monotone and
 * chrome.test.ts holds it to that.
 */
export const NAV_RAMP_KNEE = 26;
export const NAV_RAMP_KNEE_MIX = 0.8;

/**
 * V1.6 VB-29 — the white margin the drawer's pane sits inside, in px.
 *
 * The complaint: the drawer bleeds edge to edge, so the panel reads as a
 * surface running off the screen rather than as one app with a framed pane in
 * it. The frame is the app's **own** margin, which is why this is 8 and not a
 * number somebody liked: 8px is the panel body's margin, so the pane's sides
 * land in the same column every screen in the product already uses (it is also
 * the first term of the docked bar's 26px gutter — see Flow.css).
 *
 * **It is drawn INSIDE the drawer's own box**, as a border in `--canvas` with
 * the background clipped to the padding box (FileDrawer.css). That is not a
 * detail: the height the handle announces, the room `flowBottomReserve`
 * reserves and the edge the nav bar is pegged to are all one number, and a
 * frame added *outside* the box would make the drawer eight pixels taller than
 * the number every one of those is computed from. The same reasoning the 1px
 * top rule was kept in the box model for at V1.2.
 *
 * Everything positioned against the drawer's padding box therefore inherits
 * the inset for free — the head band, both content layers and the flight layer
 * — and the two things that do *not* are handled where they are drawn: the
 * globe's stage size (core/drawer/mode.ts's `brainStageSize`, which has to know
 * how much room is really left) and the nav ramp above (Flow.css, which insets
 * its gradient by this so the frame runs on up the bar rather than stopping in
 * a notch at the drawer's top corners).
 */
export const DOCK_FRAME = 8;

/** docs/GUARDRAILS.md's text floor. Here so a test states the rule by name. */
export const DOCK_TEXT_MIN_CONTRAST = 4.5;

/** docs/GUARDRAILS.md's floor for an interactive boundary (WCAG 1.4.11). */
export const DOCK_BOUNDARY_MIN_CONTRAST = 3;

/** The bottom edge of Back / Next / Skip, measured up from the drawer's top
 * edge — where the ramp's foot ends and the long half begins. */
export const NAV_CONTROL_BOTTOM = FLOW_NAV_INSET;

/** Their top edge, on the same axis. The ramp is nearly `--canvas` by here. */
export const NAV_CONTROL_TOP = FLOW_NAV_HEIGHT - FLOW_NAV_INSET;

/** One stop of the fade: how far up the bar it sits, and how much `--canvas`
 * has been mixed into the stage colour by then. */
export interface NavRampStop {
  readonly at: number;
  readonly mix: number;
}

/**
 * The fade, as the browser will draw it: four stops, straight lines between
 * them, in the same order Flow.css writes them.
 *
 * It exists as data rather than as a formula because both ends need it — the
 * stylesheet gets the three numbers it cannot compute (Flow.tsx publishes
 * them), and `navRampColorAt` predicts the painted pixel from the same table,
 * which is what lets a screenshot be checked against the model instead of
 * against a swatch someone typed.
 */
export const NAV_RAMP_STOPS: readonly NavRampStop[] = [
  { at: 0, mix: 0 },
  { at: NAV_RAMP_FOOT, mix: NAV_RAMP_FOOT_MIX },
  { at: NAV_RAMP_KNEE, mix: NAV_RAMP_KNEE_MIX },
  { at: NAV_RAMP_HEIGHT, mix: 1 },
];

/**
 * How much `--canvas` is mixed into the stage colour `y` px above the drawer's
 * top edge — 0 at the edge itself, 1 at the top of the bar.
 *
 * Clamped at both ends rather than extrapolated: below the drawer's edge is
 * the drawer, which is the stage colour outright, and above the bar is the
 * panel, which is `--canvas` outright. A caller sampling either does not want
 * a number off the end of a line.
 */
export function navRampMixAt(y: number): number {
  if (!Number.isFinite(y) || y <= 0) return 0;
  if (y >= NAV_RAMP_HEIGHT) return 1;
  let previous = NAV_RAMP_STOPS[0]!;
  for (const stop of NAV_RAMP_STOPS.slice(1)) {
    if (y <= stop.at) {
      const span = stop.at - previous.at;
      const along = span <= 0 ? 1 : (y - previous.at) / span;
      return previous.mix + along * (stop.mix - previous.mix);
    }
    previous = stop;
  }
  return 1;
}

/**
 * What the bar is painted `y` px above the drawer's top edge.
 *
 * This is a *prediction* of the browser's own two-stop gradient, in the same
 * gamma-encoded sRGB it interpolates in (see `mixSrgb`), which is what lets
 * tests/e2e/dock-surface.spec.ts check a screenshot against the model instead
 * of against a hard-coded swatch. If the two ever disagree, one of them is
 * wrong and the test says which pixel.
 */
export function navRampColorAt(y: number, stage: Rgb, canvas: Rgb): Rgb {
  return mixSrgb(stage, canvas, navRampMixAt(y));
}
