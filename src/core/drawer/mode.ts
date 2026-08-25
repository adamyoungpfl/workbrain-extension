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

import { DRAWER_CHROME_HEIGHT, clampDrawerHeight } from './height';
import type { DrawerBounds } from './height';

/** The two modes, by the names they carry in the interface. "Brain" passes
 * docs/design-system.html §08 because it is already in the product's own name;
 * "List" is a word everyone brought with them. */
export type DrawerMode = 'brain' | 'list';

/** Breathing room around the globe inside the drawer, per side, in px. */
export const BRAIN_STAGE_PAD = 10;

/** The smallest stage the globe is ever asked to draw itself into. Kept at
 * V1.2's own number so "too short for Brain" still means the same picture; it
 * is the floor a degenerate viewport cannot ask below. */
export const BRAIN_STAGE_MIN = 116;

/**
 * How big a globe is worth showing, in px — VB-14's "at 300px it's excellent".
 *
 * 260 rather than 300 because the drawer's ceiling on a 700px panel is 376 and
 * the chrome takes some of it. V1.9 VB-51 and VB-52 put two more bands inside
 * that chrome — the breadcrumb above the visual and the view bar below it — so
 * the same arithmetic that chose 260 now chooses 208: `376 - 132 - 20 - 8`,
 * with a few pixels of slack so the ideal is not sitting exactly on the ceiling
 * of the panel it was measured against.
 *
 * V1.9 VB-50 hands eight of those pixels back — the frame that term counted is
 * gone (core/drawer/chrome.ts) — and the number is deliberately left at 208
 * rather than pushed up to spend them. The slack under the ceiling is what
 * stops the ideal globe depending on a clamp nobody can see, and more of it is
 * better than less.
 *
 * That is the cost of the mockup, stated where it is paid. The alternative was
 * a globe that opens taller than the drawer is allowed to be, which
 * `heightForMode` would silently clamp — a showcase visual whose size depended
 * on a clamp nobody could see.
 */
export const BRAIN_STAGE_IDEAL = 208;

/**
 * The height at which Brain stops being usable, in px — VB-14's own "~180px",
 * re-derived for V1.9's chrome.
 *
 * Below this the drawer hands the stage over to List on its own. It is a
 * threshold on the *drawer's* height rather than on the stage's because the
 * drawer's height is the number the person is dragging and the number the
 * handle announces; the stage is what is left after the chrome.
 *
 * Derived rather than typed, so it cannot drift from `brainStageSize` below:
 * this is exactly the height at which that function stops being able to give
 * the globe `BRAIN_STAGE_MIN`.
 */
export const BRAIN_MIN_HEIGHT = DRAWER_CHROME_HEIGHT + BRAIN_STAGE_MIN + BRAIN_STAGE_PAD * 2;

/**
 * What the drawer expands to when Brain is chosen while it is too short.
 *
 * VB-14: "Asking for Brain expands the drawer to fit it." Clamped by the
 * caller to the panel's own bounds, so a short panel gets as much of this as
 * it can hold rather than a drawer that has quietly become the surface.
 *
 * V1.9 VB-50 takes the frame back out of the sum. V1.6 VB-29's border was a
 * band `brainStageSize` had to subtract, so this had to add it; one solid
 * surface edge to edge (core/drawer/chrome.ts) leaves nothing there to pay for,
 * and every term here is again a band the drawer really has.
 */
export const BRAIN_OPEN_HEIGHT = DRAWER_CHROME_HEIGHT + BRAIN_STAGE_IDEAL + BRAIN_STAGE_PAD * 2;

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

/**
 * V1.6 VB-32 — how long the landed nodes take to hand over to the rows
 * underneath them, in ms.
 *
 * The flight now ends ON the row's marker, at the marker's own size and
 * position (see `MORPH_LIST_SCALE`), which leaves one frame where a lit orb
 * and the mark it became are the same object in two colours. Unhandled, that
 * frame is a blink. 120ms is docs/design-system.html §06's colour value — the
 * shortest change in the system — and it is spent standing still: the node has
 * already arrived, so nothing moves during it and the still-frame version of
 * the cue is unchanged.
 *
 * It is a phase of the morph and not a fade attached to the flight, which is
 * what makes it interruptible: changing mode mid-landing puts the layer back
 * to `run`, and the opacity transition restarts from wherever it had got to
 * rather than leaving a node that finished fading and then travelled
 * invisibly.
 */
export const MORPH_LAND_MS = 120;

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
 *
 * V1.6 VB-29 subtracted a frame from both terms — once from the height, twice
 * from the width. **V1.9 VB-50 removes the frame**, so both of those terms are
 * gone and the globe is eight pixels taller and sixteen wider than it was. That
 * is not a windfall, it is the room the border was standing in; the direction
 * this matters in is the dangerous one, because the stage clips what will not
 * fit (`overflow: hidden`, FileDrawer.css) and a size computed against a box
 * WIDER than the real one shows as a globe with its edge cut off rather than as
 * a globe that is slightly too big.
 *
 * V1.9 VB-51/VB-52 replace the handle term with the whole chrome — the handle,
 * the breadcrumb above the stage and the view bar below it — for exactly that
 * reason. `extra` is the one band that comes and goes: the lock line the
 * breadcrumb prints while it is offering the files
 * (`DRAWER_CRUMB_NOTE`). It is a parameter rather than a constant because it is
 * true for as long as a menu is open and false the rest of the time, and a
 * globe that ignored it would spend that moment clipped along its bottom edge.
 */
export function brainStageSize(height: number, width: number, extra = 0): number {
  if (!Number.isFinite(height) || !Number.isFinite(width) || !Number.isFinite(extra)) return BRAIN_STAGE_MIN;
  const tall = height - DRAWER_CHROME_HEIGHT - BRAIN_STAGE_PAD * 2 - Math.max(0, extra);
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
 * ── V1.6 VB-32: 0.45 → 1, and why that is the fix ─────────────────────────
 *
 * The flight never regressed. Sampled frame by frame it still leaves the
 * sphere, still travels, and still ends on the marker's own centre to within a
 * pixel. What it stopped doing is *reading as itself*: at 0.45 the orb spent
 * the last third of its flight shrinking to an eight-pixel bullet and then
 * winked out somewhere inside the row, which is a dot fading out near the
 * marker rather than the orb becoming it.
 *
 * 0.45 was the right answer to the drawer VB-14b shipped into, where the
 * marker was three characters of bare monospace and a disc at the marker's
 * full size covered the text it was landing on. VB-19 gave the marker a box
 * and V1.6 VB-33 made it a real tile at roughly orb size — so the thing the
 * orb is flying at is now orb-shaped and orb-sized, and the honest landing is
 * the full one: `endOf`'s `min(width, height) / 2` puts the arriving node dead
 * centre on the tile at exactly the tile's height (FileTree.css keeps that
 * height a contract for this reason).
 *
 * Still deliberately a SIZE and not a fade, for the reason 0.45 was: an
 * opacity ramp cannot be restarted when a morph is interrupted mid-flight (the
 * property does not change, so no new transition begins), and a node that
 * finished fading and then carried on travelling invisibly would be a worse
 * bug than the one it fixed.
 */
export const MORPH_LIST_SCALE = 1;

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
