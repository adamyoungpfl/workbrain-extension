import type { FileSlotId } from '../files/slots';
import { chooseFile } from '../files/toggle';
import type { FileToggleItem } from '../files/toggle';
import type { GlobeNodeState } from './illumination';

/**
 * V1.8 VB-48 — THE WORK BRAIN ABOVE THE CONTEXT BRAIN.
 *
 * VB-48, verbatim: "The Brain visual gains a zoom level *above* the current
 * one: the Context brain becomes a **child** of the **work brain**, which
 * carries each file as its own node. Both Brain and List then navigate the
 * whole work-brain surface consistently."
 *
 * This file is the whole of that idea as arithmetic and rules: where the file
 * nodes sit, what the camera does between the two tiers, and what pressing one
 * of them means. `BrainGlobe.tsx` renders it; `FileDrawer.tsx` holds the one
 * piece of state both views read. Neither decides anything here.
 *
 * ── DOES THE EXISTING CAMERA GENERALISE TO THREE TIERS? NO — IT COMPOSES ───
 *
 * VB-48 asks that this be confirmed rather than assumed, so here is the answer
 * in the place it is acted on.
 *
 * `computeFrame`'s `zoomClock` is not a general zoom. It is "how far into one
 * of twelve VERTICES the camera has flown", and three separate things are
 * welded to that meaning:
 *
 *  1. it selects a vertex and walks THAT vertex to the origin (`tx`/`ty` are
 *     `-selected.x * ez`), which has no counterpart one level up — the tier
 *     above does not pick a vertex, it picks a whole solid;
 *  2. it pushes the perspective camera in (`CAMERA - ZOOM_CAMERA_PUSH * ez`),
 *     which is a projection change on the icosahedron's own vertices and means
 *     nothing to a scene that is not the icosahedron;
 *  3. it runs to 1.09, not to 1, because the children's stagger tail rides on
 *     it (see `ZOOM_TAIL`), and half the component reads it as a progress bar
 *     for that stagger (`inside`, the label fades, `childLayout`).
 *
 * Extending that one number below zero to mean "and now pull back out of the
 * whole file" would give every one of those three readings a range it was never
 * written for. So the second tier is its OWN clock and its own transform,
 * applied AROUND the existing scene — exactly the way V1.4's `splitClock` is
 * its own clock and deliberately not folded into the zoom (BrainGlobe.tsx says
 * why: "they overlap and one clock cannot be in two places at once"). The
 * existing camera is untouched: at the file tier this transform is the
 * identity, which is what makes every V1.2–V1.7 behaviour on that stage
 * survive unchanged.
 *
 * ── WHAT IS LOCKED IS NOT DECIDED HERE ────────────────────────────────────
 *
 * One source of truth for lockedness across all three surfaces (Home's shelf,
 * the drawer's toggle, and now the Brain): `core/files/slots.ts`, through
 * `core/files/toggle.ts`. `chooseNav` below is `chooseFile` plus a tier, so a
 * locked node on the globe refuses the move for the same reason and in the same
 * code as a locked segment on the toggle.
 *
 * **NOTHING HERE IS STORED.** Which tier you are on and which file you are
 * looking at are facts about a glance at the panel, exactly like the drawer's
 * height, its mode and the globe's pose (docs/ARCHITECTURE.md, "nothing derived
 * is stored"). There is no `wb:tier` key and there must never be one.
 *
 * **NO COPY LIVES HERE.** Nodes carry ids and numbers; `src/panel/strings.ts`
 * owns every word (CLAUDE.md).
 */

// ── Where you are ──────────────────────────────────────────────────────────

/**
 * The two tiers.
 *
 * `work` — the work brain: one node per file, the Context brain among them.
 * `file` — inside one file's own solid, which is every version of this stage
 *          that shipped before V1.8.
 */
export type BrainTier = 'work' | 'file';

/**
 * WHERE BOTH VIEWS ARE LOOKING. One value, held once, read by Brain and by
 * List — VB-48's "shared navigation state ... so switching file or zoom level
 * in one view is reflected in the other".
 */
export interface BrainNav {
  readonly tier: BrainTier;
  readonly file: FileSlotId;
}

/**
 * What the drawer opens on: inside Context, exactly as it did before V1.8.
 *
 * Deliberately not the work tier. The drawer's job while somebody is answering
 * questions is to show the file they are answering, and opening one level out
 * would put a shelf between every session and the thing it is about. The work
 * brain is a level you pull back to, which is what "the brain pulls back" says.
 */
export const BRAIN_NAV_HOME: BrainNav = { tier: 'file', file: 'context' };

/**
 * Pressing a file — on a node at the work tier, or on the List's toggle.
 *
 * ONE RULE FOR BOTH VIEWS, and it is `chooseFile`'s: a locked file is not
 * enterable and an unknown one is no move at all. When the move is refused the
 * TIER does not change either — a press that cannot open Skills must not
 * quietly zoom into Context instead.
 *
 * A press on the file already on screen is a real move at the work tier (it is
 * how you go in) and a no-op at the file tier, which falls out of returning the
 * same nav rather than being special-cased.
 */
export function chooseNav(nav: BrainNav, wanted: FileSlotId, items: readonly FileToggleItem[]): BrainNav {
  const file = chooseFile(nav.file, wanted, items);
  if (file !== wanted) return nav;
  if (nav.tier === 'file' && nav.file === file) return nav;
  return { tier: 'file', file };
}

/** Out of the file and back to the work brain. Keeps the file, because the way
 * back in is the node you just came out of. */
export function pullBack(nav: BrainNav): BrainNav {
  return nav.tier === 'work' ? nav : { tier: 'work', file: nav.file };
}

/**
 * What a file node is worth to the edges that meet it.
 *
 * The same three-state vocabulary the solid's own vertices use
 * (core/globe/illumination.ts), so the work brain's edges are lit by the very
 * function the context brain's are — an open file conducts, a locked one is
 * turned down. No second brightness rule, and therefore no way for the two
 * tiers to disagree about what "on" looks like.
 */
export function workNodeState(item: FileToggleItem): GlobeNodeState {
  return item.lock ? 'inactive' : 'active';
}

// ── Where the file nodes sit ───────────────────────────────────────────────

/**
 * How far the file nodes ring the middle of the stage, in view units (the
 * SVG's own -100..100 box).
 *
 * 46 puts three nodes at the corners of a triangle that fills the stage without
 * any of them reaching the rim: the top node's own silhouette ends at ~-65 and
 * the lower two carry a label under them at ~74, inside the 100 the box has.
 * Measured on the 260px stage, which is the smallest the drawer ever opens
 * Brain at (core/drawer/mode.ts).
 */
export const WORK_RING = 46;

/**
 * A file node's radius in view units — the empty ones.
 *
 * The file that HAS a solid does not use this: it is drawn as its own solid,
 * shrunk (`WORK_SOLID_SCALE`), whose silhouette is about 19 units. So an empty
 * file is visibly the smaller thing, which is honest — it has nothing in it —
 * and is a second cue on top of the dashed rim that says the same in a shape.
 */
export const WORK_NODE_R = 13;

/**
 * What the child solid is drawn at when it is a node of the work brain.
 *
 * 0.3 of full size. The icosahedron's silhouette is ~63 view units, so the
 * Context node is a ~19-unit cluster: plainly a network of orbs rather than a
 * dot, and plainly smaller than the stage it grows to fill. Lower than 0.24 and
 * the twelve orbs merge into a smudge at 260px; higher than ~0.35 and the node
 * crowds the two beside it.
 */
export const WORK_SOLID_SCALE = 0.3;

/** One file node's home, in view units. Index 0 is at the top and the rest run
 * clockwise, so the shelf's own order — Context, Skills, Actions — is the order
 * a reader's eye takes them in. */
export function workNodePosition(index: number, count: number): { x: number; y: number } {
  if (count <= 0) return { x: 0, y: 0 };
  if (count === 1) return { x: 0, y: 0 };
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
  return { x: Math.cos(angle) * WORK_RING, y: Math.sin(angle) * WORK_RING };
}

/**
 * The work brain's own edges: every file joined to every other.
 *
 * A ring and not the dependency chain, even though the shelf IS a chain
 * (core/files/slots.ts). Three nodes joined in a line is a V with a corner in
 * it, which reads as a broken triangle rather than as an object; and the
 * brightness rule already says which files are real, so the edges do not have
 * to carry the ordering as well. At three nodes a ring and a full mesh are the
 * same three edges.
 */
export function workEdges(count: number): Array<readonly [number, number]> {
  if (count < 2) return [];
  const edges: Array<readonly [number, number]> = [];
  for (let a = 0; a < count; a++) {
    for (let b = a + 1; b < count; b++) edges.push([a, b] as const);
  }
  return edges;
}

// ── The camera between the tiers ───────────────────────────────────────────

/**
 * The transform wrapped around the whole existing stage — the second tier, and
 * the only thing about the picture that the tier changes.
 *
 * `scale` and a translate, in SVG's own order: `translate(x y) scale(k)` maps a
 * point p to `(x + k·p)`. So at t=0 the file's solid is drawn at
 * `WORK_SOLID_SCALE` centred on its node's home, and at t=1 it is `translate(0
 * 0) scale(1)` — the identity, which is the stage every earlier version of this
 * component drew. That identity is not a nicety: it is what lets the fly-in,
 * the split, the summaries and the morph carry on being measured in exactly the
 * coordinates they were written in.
 *
 * `t` arrives ALREADY EASED, like `computeFrame`'s `ez`. The curve is the
 * component's (docs/design-system.html §06 allows one), and keeping it there
 * makes this function exact arithmetic a unit test can pin to the pixel.
 */
export interface WorkCamera {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

export function workCamera(t: number, home: { x: number; y: number }): WorkCamera {
  const e = t < 0 ? 0 : t > 1 ? 1 : t;
  const away = 1 - e;
  return {
    scale: WORK_SOLID_SCALE + (1 - WORK_SOLID_SCALE) * e,
    // `+ 0` normalises the negative zero a node above the middle produces at
    // e=1 (`-46 * 0` is `-0`). It prints as `-0` in the DOM attribute and is
    // not equal to `0` by `Object.is`, which is the kind of difference that
    // turns "the file tier is exactly the identity" into a flake.
    x: home.x * away + 0,
    y: home.y * away + 0,
  };
}

/**
 * A point of the inner stage, in the outer stage's coordinates.
 *
 * The SVG gets the transform above; the HTML overlay of real buttons cannot,
 * because it is positioned in percentages of the stage box (see BrainGlobe.tsx
 * decision 2 — every control is a real `<button>`, not a `<g tabindex>`). So
 * the overlay maps its own positions through the same camera, here, once. Two
 * copies of this arithmetic is a globe whose orbs and whose hit targets drift
 * apart at every frame of the transition.
 */
export function applyWorkCamera(camera: WorkCamera, x: number, y: number): { x: number; y: number } {
  return { x: camera.x + camera.scale * x, y: camera.y + camera.scale * y };
}

/**
 * How present the OTHER file nodes are, 1 at the work tier and 0 inside a file.
 *
 * They leave faster than the camera arrives (the 1.7) so the stage is one solid
 * for the back half of the flight rather than a solid with two ghosts beside
 * it. Below `WORK_NODE_GONE` they are not drawn at all and their buttons are
 * out of the tab order — a control nobody can see is not a control
 * (BrainGlobe.tsx says the same about the sections you have flown away from).
 */
export function workNodeFade(t: number): number {
  const e = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.max(0, 1 - e * 1.7);
}

/** Below this the other files are gone: nothing drawn, nothing focusable. */
export const WORK_NODE_GONE = 0.02;
