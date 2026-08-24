/**
 * The drawer's chrome, as numbers: the frame its pane sits inside, and the two
 * contrast floors everything drawn on that chrome is held to.
 *
 * ── What used to be here, and why it is not (V1.7 VB-41) ─────────────────
 *
 * V1.4 VB-22 put a gradient above the drawer — the docked nav faded from the
 * stage's colour at the handle up into the panel's white — and most of this
 * file was the shape of that ramp: where its steep foot ended, how far it had
 * lifted by the bottom edge of the buttons, and a model of the painted pixel
 * so a screenshot could be checked against it.
 *
 * VB-41 takes the fade away. The docked nav is text and icons on the panel's
 * own canvas now, with clear space above the handle (core/flow/dock.ts), so
 * there is no ramp to shape, nothing standing in one, and no moving background
 * to predict. `NAV_RAMP_*`, `navRampMixAt` and `navRampColorAt` were deleted
 * rather than left exported with no caller: a module nobody imports is a
 * module the next person has to read before they can be sure of that.
 *
 * What survives is what was never about the fade — the frame below, and the
 * two floors, which now do the same job for a flat background that they did
 * for a moving one. src/core/color/contrast.ts survives with them, and is what
 * tests/e2e/button-cluster.spec.ts uses to assert the new treatment from real
 * pixels.
 *
 * **Nothing here is stored.** Like the rest of the dock's geometry these are
 * constants, and the drawer's height they are read alongside is ephemeral
 * session state (docs/ARCHITECTURE.md, "nothing derived is stored").
 */

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
 * how much room is really left) and the bar above, which used to inset its
 * gradient by this so the frame ran on up the bar rather than stopping in a
 * notch at the drawer's top corners. V1.7 VB-41 leaves that bar the panel's own
 * canvas from edge to edge, so there is no notch to avoid: the frame simply
 * continues into the panel it is cut from.
 */
export const DOCK_FRAME = 8;

/** docs/GUARDRAILS.md's text floor. Here so a test states the rule by name. */
export const DOCK_TEXT_MIN_CONTRAST = 4.5;

/** docs/GUARDRAILS.md's floor for an interactive boundary (WCAG 1.4.11). */
export const DOCK_BOUNDARY_MIN_CONTRAST = 3;
