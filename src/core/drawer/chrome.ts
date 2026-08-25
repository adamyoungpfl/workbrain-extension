/**
 * The drawer's surface, as a contract: what colour it is, and what every
 * variable drawn on it has to clear to be allowed there.
 *
 * ── What used to be here, and why it is not ──────────────────────────────
 *
 * V1.4 VB-22 put a gradient above the drawer and most of this file was the
 * shape of that ramp. V1.7 VB-41 took the fade away and `NAV_RAMP_*`,
 * `navRampMixAt` and `navRampColorAt` were deleted rather than left exported
 * with no caller.
 *
 * **V1.9 VB-50 deletes `DOCK_FRAME` on the same rule.** V1.6 VB-29 put a white
 * border down the drawer's sides and across its bottom so the pane read as a
 * framed object; VB-50 makes the whole lower panel one colour edge to edge,
 * which is a frame's opposite. Adam's decision of 2026-08-24 records that as
 * intended — "the white frame goes ... a deliberate reversal of a shipped
 * decision" — so the constant went with the border, and with it the term it
 * contributed to `BRAIN_MIN_HEIGHT`, `BRAIN_OPEN_HEIGHT` and `brainStageSize`
 * (core/drawer/mode.ts). The globe is eight pixels taller and sixteen wider
 * than it was, because that is genuinely how much room there now is.
 *
 * What survives is what was never about either the fade or the frame: the two
 * floors, and the palette below that is measured against them.
 *
 * **Nothing here is stored.** Like the rest of the dock's geometry these are
 * constants, and the drawer's height they are read alongside is ephemeral
 * session state (docs/ARCHITECTURE.md, "nothing derived is stored").
 */

/** docs/GUARDRAILS.md's text floor. Here so a test states the rule by name. */
export const DOCK_TEXT_MIN_CONTRAST = 4.5;

/** docs/GUARDRAILS.md's floor for an interactive boundary (WCAG 1.4.11). */
export const DOCK_BOUNDARY_MIN_CONTRAST = 3;

/**
 * ── V1.9 VB-50 — ONE SURFACE, AND THE PALETTE THAT HAS TO LIVE ON IT ──────
 *
 * "The whole panel is a single colour. No hover tint, no pressed state, no
 * 'default to background' — buttons through to the bottom bar read as one
 * fluid piece of app rather than controls sitting on a surface."
 *
 * The cost of that sentence is the reason this list exists. Until VB-50 half
 * the drawer's controls were read against a ground of their own: a hovered row
 * lifted to white, a pressed toggle sat in a filled chip, the List's whole pane
 * was the panel's light `--surface` while the chrome around it was dark. Take
 * the grounds away and **every one of those controls is now read against one
 * colour** — so every ink, every keyline and every state accent has to clear
 * its floor against that one colour, and the honest way to say so is a list
 * that a test can walk.
 *
 * The mapping is deliberately the panel's own palette, one step over: the dark
 * field's stand-in for `--primary` is `--globe-focus`, for `--green` is
 * `--globe-ring`, for `--amber` is `--amber-line`, for `--ink` is
 * `--globe-label` and for `--ink-2`/`--ink-3` is `--globe-detail-key`. Nothing
 * new was invented — every value is already in design/tokens.json's `globe`
 * group, THE ONE SANCTIONED DARK SURFACE (docs/V1.2-REFINEMENT.md).
 *
 * `src/core/drawer/chrome.test.ts` reads design/tokens.json and holds every row
 * of this to its floor; `tests/e2e/one-surface.spec.ts` then proves the browser
 * really painted that colour behind that control.
 */
export const DOCK_SURFACE_TOKEN = 'globe.field';

/** What a role is for, which is what decides the floor it has to clear. */
export type DockRoleKind = 'text' | 'boundary';

export interface DockRole {
  /** The custom property the panel dresses from, without its leading `--`. */
  readonly name: string;
  /** Its value, as `group.key` into design/tokens.json. */
  readonly token: string;
  readonly kind: DockRoleKind;
  /** What is drawn in it, so a failing row says what is on screen. */
  readonly what: string;
}

export const DOCK_ROLES: readonly DockRole[] = [
  { name: 'dock-ink', token: 'globe.label', kind: 'text', what: 'section names, file names, the rung you are on' },
  {
    name: 'dock-ink-quiet',
    token: 'globe.detail-key',
    kind: 'text',
    what: 'counts, percentages, the trail’s rungs, the grip’s two bars',
  },
  { name: 'dock-accent', token: 'globe.focus', kind: 'text', what: 'the focus ring, and the chosen view' },
  { name: 'dock-here', token: 'globe.focus', kind: 'text', what: 'the section the interview is standing in' },
  { name: 'dock-done', token: 'globe.ring', kind: 'text', what: 'a section that is finished' },
  { name: 'dock-due', token: 'amber-line', kind: 'text', what: 'a section that has aged past its clock' },
  { name: 'dock-edge', token: 'dock-edge', kind: 'boundary', what: 'every broken edge that means “not yet”' },
];

/**
 * The five orb colours, which are not `--dock-*` variables but are drawn on
 * this field in both views since V1.8 VB-45 — and carry meaning, so they are
 * held to WCAG 1.4.11 rather than to nothing.
 */
export const DOCK_ORB_TOKENS: readonly string[] = [
  'globe.node-1-mid',
  'globe.node-2-mid',
  'globe.node-3-mid',
  'globe.node-4-mid',
  'globe.node-5-mid',
];

/**
 * The one thing on the field that is deliberately NOT in `DOCK_ROLES`: the
 * hairline between two rows.
 *
 * docs/GUARDRAILS.md floors an interactive border at 3:1 and names `--divider`
 * as the one that is exempt, because a divider carries no meaning — take every
 * rule out of the list and the rows still read, in the same order, saying the
 * same things. This is that variable's opposite number on the dark field, and
 * it is written down here so "why is this one not measured" has an answer in
 * the same file as the measurements.
 */
export const DOCK_LINE_TOKEN = 'globe.edge-far';

/** The floor a role of this kind has to clear against `DOCK_SURFACE_TOKEN`. */
export function dockRoleFloor(kind: DockRoleKind): number {
  return kind === 'text' ? DOCK_TEXT_MIN_CONTRAST : DOCK_BOUNDARY_MIN_CONTRAST;
}
