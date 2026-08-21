/**
 * V1.2 VB-14b — which of the drawer's two modes is showing, and where the
 * nodes are while it changes.
 *
 * docs/V1.2-REFINEMENT.md's "Iteration three — DIRECTION CHOSEN" settles the
 * shape of this: two modes in one drawer, named `Brain` and `List`, with
 * **height governing mode** — "Below ~180px Brain is unusable, so the drawer
 * hands over to List automatically. Asking for Brain expands the drawer to fit
 * it. The two are linked, not independent."
 *
 * All of that is arithmetic, so all of it is here rather than in the
 * component — CLAUDE.md's one architectural rule. `FileDrawer` supplies the
 * numbers the DOM knows (the drawer's height, the viewport's width, four
 * measured boxes per section) and renders what comes back.
 *
 * **Nothing here is stored.** Which mode is showing is a fact about this
 * glance at the panel, exactly like the height it is derived from
 * (core/drawer/height.ts) and like the position the whole flow is derived from
 * (docs/ARCHITECTURE.md, "nothing derived is stored"). Close the panel and it
 * opens on List at the peek again.
 *
 * THE ONE IDEA WORTH READING TWICE. The mode on screen is not state — it is
 * `modeForHeight(what the person asked for, how tall the drawer is)`. Holding
 * the *request* rather than the *result* is what makes the coupling
 * reversible: drag below the threshold and Brain hands over to List, drag back
 * up and Brain returns, because the request never changed. A stored
 * "effective mode" would need an effect to correct it on every drag frame, and
 * would spend a frame disagreeing with itself each time.
 */

import { DRAWER_HANDLE_HEIGHT, clampDrawerHeight } from './height';
import type { DrawerBounds } from './height';

/** The two modes, by the names they carry in the interface. "Brain" passes
 * docs/design-system.html §08 because it is already in the product's own name;
 * "List" is a word everyone brought with them. */
export type DrawerMode = 'brain' | 'list';

/**
 * The height at which Brain stops being usable, in px — VB-14's own "~180px".
 *
 * Below this the drawer hands the stage over to List on its own. It is a
 * threshold on the *drawer's* height rather than on the stage's because the
 * drawer's height is the number the person is dragging and the number the
 * handle announces; the stage is what is left after the handle.
 */
export const BRAIN_MIN_HEIGHT = 180;

/** Breathing room around the globe inside the drawer, per side, in px. */
export const BRAIN_STAGE_PAD = 10;

/**
 * How big a globe is worth showing, in px — VB-14's "at 300px it's excellent".
 * 260 rather than 300 because the drawer's ceiling on a 700px panel is 380 and
 * the handle takes 44 of it; 260 fits with the pad and still reads as the
 * showcase visual rather than as a badge.
 */
export const BRAIN_STAGE_IDEAL = 260;

/** The smallest stage the globe is ever asked to draw itself into. Falls out
 * of `BRAIN_MIN_HEIGHT` (180 - 44 - 20 = 116) and exists as a floor so a
 * degenerate viewport cannot ask for a negative size. */
export const BRAIN_STAGE_MIN = 116;

/**
 * What the drawer expands to when Brain is chosen while it is too short.
 *
 * VB-14: "Asking for Brain expands the drawer to fit it." Clamped by the
 * caller to the panel's own bounds, so a short panel gets as much of this as
 * it can hold rather than a drawer that has quietly become the surface.
 */
export const BRAIN_OPEN_HEIGHT = DRAWER_HANDLE_HEIGHT + BRAIN_STAGE_IDEAL + BRAIN_STAGE_PAD * 2;

/**
 * The morph, in ms. VB-14: "Mode change is a morph, not a swap: every node
 * flies to its list-row position while the edges fade and the rows resolve
 * underneath (~520ms)."
 *
 * Longer than docs/design-system.html §06's 320ms for a drawer, and
 * deliberately: 520 was chosen by the product owner from a working prototype
 * after the 320ms version was rejected for popping. §06's *curve* still
 * governs — `cubic-bezier(.2,0,0,1)`, the only easing in the system — and
 * every duration derived from this one is below.
 */
export const MORPH_MS = 520;

/**
 * How long the mode being left takes to get out of the way, in ms.
 *
 * Short, and shorter than the mode arriving takes to resolve: the arriving one
 * fades up across the whole `MORPH_MS`, so for most of the flight the nodes
 * are travelling over the thing they are travelling towards rather than over a
 * blank drawer. Found by looking at it — an earlier version held the arriving
 * mode back until the outgoing one had finished and left 200ms of empty white
 * in the middle of the transition.
 */
export const MORPH_FADE_OUT_MS = 200;

/** The flying node's own box, in px, before its per-end scale. Its radius is
 * half of this, which is what `MorphEnd.r` is measured against. */
export const MORPH_DOT_SIZE = 16;

/** Whether this panel is tall enough to offer Brain at all. On a viewport so
 * short that the drawer's ceiling is under the handover threshold, the mode is
 * not on the menu — a control that cannot do its job is worse than no control
 * (docs/GUARDRAILS.md's degradation rule). */
export function brainFitsIn(bounds: DrawerBounds): boolean {
  return bounds.max >= BRAIN_MIN_HEIGHT;
}

/**
 * The mode actually on screen: what was asked for, unless the drawer is too
 * short to honour it.
 *
 * Written as `!(height >= …)` rather than `height < …` so a NaN height — which
 * compares false against everything — resolves to List, the mode that works at
 * any size, instead of to a globe drawn into no space at all.
 */
export function modeForHeight(requested: DrawerMode, height: number): DrawerMode {
  if (requested !== 'brain') return 'list';
  return height >= BRAIN_MIN_HEIGHT ? 'brain' : 'list';
}

/**
 * The height the drawer should be at, given the mode just chosen.
 *
 * VB-14: "Asking for Brain expands the drawer to fit it." **To fit it**, not
 * merely to clear the handover threshold — so the bar is `BRAIN_OPEN_HEIGHT`,
 * the height at which the globe is the showcase visual it exists to be, rather
 * than `BRAIN_MIN_HEIGHT`, the height below which it stops working at all.
 * Those are two different numbers doing two different jobs, and using the
 * threshold here would hand someone the worst legal globe and call it done.
 *
 * It only ever grows. A person who has dragged the drawer taller than the
 * globe needs keeps the height they chose; the panel does not tidy up after
 * them. Choosing List resizes nothing at all — List works at every height, so
 * there is nothing to fix.
 */
export function heightForMode(mode: DrawerMode, height: number, bounds: DrawerBounds): number {
  const current = clampDrawerHeight(height, bounds);
  if (mode !== 'brain') return current;
  return Math.max(current, clampDrawerHeight(BRAIN_OPEN_HEIGHT, bounds));
}

/**
 * How big a square the globe gets, given the drawer's height and the panel's
 * width. Square because the solid is; the smaller of the two dimensions wins,
 * so it is never clipped by the drawer it is inside.
 */
export function brainStageSize(height: number, width: number): number {
  if (!Number.isFinite(height) || !Number.isFinite(width)) return BRAIN_STAGE_MIN;
  const tall = height - DRAWER_HANDLE_HEIGHT - BRAIN_STAGE_PAD * 2;
  const wide = width - BRAIN_STAGE_PAD * 2;
  return Math.max(BRAIN_STAGE_MIN, Math.round(Math.min(tall, wide)));
}

/**
 * Whether the globe should be turning by itself right now.
 *
 * VB-14's open item 3, in one function: "Drift must stop at the peek height
 * and pause entirely when the panel loses focus." The peek is covered twice
 * over — Brain is not even the mode below `BRAIN_MIN_HEIGHT`, and the height
 * test is written out anyway so the rule is stated where it is tested rather
 * than implied by another one.
 *
 * The two conditions this cannot see — `prefers-reduced-motion` and
 * `document.visibilityState` — are the component's, because they are readings
 * of the browser rather than facts about the drawer (see BrainGlobe.tsx).
 */
export function brainDriftAllowed(mode: DrawerMode, height: number, morphing: boolean): boolean {
  if (morphing) return false;
  return modeForHeight(mode, height) === 'brain' && height >= BRAIN_MIN_HEIGHT;
}

// ── The morph's arithmetic ─────────────────────────────────────────────────

/** A measured box, in the same coordinates for every input. Structurally what
 * `DOMRect` gives back, declared here so nothing in core/ has to know that a
 * DOM exists. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Where one end of a flight is, relative to the layer drawing it: a centre
 * and a radius, both in px. */
export interface MorphEnd {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

/** One section's flight, from where it sits in the globe to where its row is. */
export interface MorphPoint {
  readonly id: string;
  readonly brain: MorphEnd;
  readonly list: MorphEnd;
}

/** What the caller measured for one section. Either end may be missing — a
 * section with no row yet, or a globe that has not painted — and a flight with
 * a missing end is dropped rather than guessed at. */
export interface MorphMeasurement {
  readonly id: string;
  readonly brain: Box | null;
  readonly list: Box | null;
}

/**
 * How much of the row marker's own size a node arriving in List is drawn at.
 *
 * A node lands on the `[x]` in its row, and at the marker's full size it
 * covers the marker — so the instant the flight layer unmounts, a 14px disc
 * blinks out of existence. Found by screenshotting the last frames of a
 * flight, which is the only way that kind of thing is ever found.
 *
 * At 0.45 the node settles *inside* the brackets as a small bullet and the
 * hand-off is six pixels wide instead of fourteen. Deliberately a size and not
 * a fade: an opacity ramp cannot be restarted when a morph is interrupted
 * mid-flight (the property does not change, so no new transition begins), and
 * a node that finished fading and then carried on travelling invisibly would
 * be a worse bug than the one it fixed.
 */
export const MORPH_LIST_SCALE = 0.45;

/** A box's centre and half-width, in the layer's own coordinates. */
function endOf(box: Box, host: Box, scale = 1): MorphEnd {
  return {
    x: box.x - host.x + box.width / 2,
    y: box.y - host.y + box.height / 2,
    r: Math.max(1, (Math.min(box.width, box.height) / 2) * scale),
  };
}

/**
 * Every section that can really fly, in layer coordinates.
 *
 * Both ends are measured from the live DOM every time a morph starts, rather
 * than computed from the geometry: the globe may be at any pose the person
 * left it in and the list may be scrolled anywhere, and a node that flies to
 * where a row *would* be if nothing had moved is exactly the "it pops" this
 * task exists to fix.
 *
 * A section missing either end is dropped, silently. The morph is a cue, not
 * a mechanism — losing one node's flight costs a moment of polish, while
 * throwing would cost the drawer (docs/GUARDRAILS.md: degrade, never break).
 */
export function morphPoints(host: Box, measured: readonly MorphMeasurement[]): MorphPoint[] {
  const points: MorphPoint[] = [];
  for (const item of measured) {
    if (!item.brain || !item.list) continue;
    points.push({ id: item.id, brain: endOf(item.brain, host), list: endOf(item.list, host, MORPH_LIST_SCALE) });
  }
  return points;
}

/** The CSS `transform` for one end of a flight. The scale is against
 * `MORPH_DOT_SIZE`'s own radius, so a node keeps the size it had in the mode
 * it is leaving and arrives at the size the mode it is entering draws. */
export function morphTransform(end: MorphEnd): string {
  const scale = (end.r / (MORPH_DOT_SIZE / 2)).toFixed(3);
  return `translate3d(${end.x.toFixed(2)}px, ${end.y.toFixed(2)}px, 0) scale(${scale})`;
}
