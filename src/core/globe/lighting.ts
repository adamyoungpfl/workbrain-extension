/**
 * V1.9 VB-54 — one light, and every orb shaded from its own place under it.
 *
 * ── WHY THIS EXISTS, AND WHY IT IS NOT A RETURN TO WHAT VB-24 DELETED ─────
 *
 * V1.2 drew each orb as a three-stop radial with a white specular dot baked in
 * at a FIXED offset — 35% / 30% of the orb's own box, whatever the orb was and
 * wherever it sat. V1.4 VB-23 and V1.5 VB-24 took that away on purpose, and the
 * reason is written into BrainGlobe.css: twelve circles each lit from their own
 * top-left read as twelve stickers, not as twelve spheres. A highlight in an
 * orb's LOCAL space carries no information about the scene, so the eye reads it
 * as pattern rather than as light.
 *
 * VB-54 asks for the opposite thing and it is not the same thing wearing a new
 * name: **one fixed point in the scene**, and every orb's highlight offset and
 * terminator computed from ITS OWN position relative to that point. An orb to
 * the right of the light has its highlight pushed left; an orb in front of the
 * light has it dead centre; an orb behind the light has none at all. That
 * relationship between neighbouring orbs is the whole cue, and it is exactly
 * what a per-orb constant could never produce.
 *
 * ── WHY IT IS HERE AND NOT IN THE COMPONENT ──────────────────────────────
 *
 * CLAUDE.md's one architectural rule, and one more thing on top of it: V1.8
 * VB-45 put the very same orbs in the List's rows, so the shading rule now has
 * TWO callers. A rule implemented twice is two rules that agree until somebody
 * edits one of them — the exact failure `core/freshness/sectionLife.ts` exists
 * to prevent one level up — and if the two views light an orb differently the
 * Brain↔List morph stops reading as one object moving and goes back to being
 * two objects swapping. So the maths is a pure function of (orb, light), it is
 * tested without a browser, and both surfaces call it.
 *
 * NOTHING HERE IS STORED. Every value is recomputed from a position on the
 * frame that draws it (docs/ARCHITECTURE.md, "nothing derived is stored").
 *
 * ── THE SPACE ────────────────────────────────────────────────────────────
 *
 * Normalised STAGE space, so that one light constant can serve two surfaces of
 * completely different sizes:
 *
 *   x   −1 at the surface's left edge, +1 at its right
 *   y   −1 at the top, +1 at the bottom  — SCREEN's downward y, not maths' up,
 *       because both callers hand over positions they are about to draw with
 *   z   0 on the surface, positive toward the viewer
 *
 * A caller converts its own units into this once (the globe divides by its
 * viewBox half-width; the List places a row by how far down the list it is) and
 * the light needs no per-surface variant. That is what makes "the same light"
 * a fact rather than a coincidence of two similar-looking constants.
 */

export interface ScenePoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * THE LIGHT. One position, in the normalised space above, and the only one in
 * the product.
 *
 * Up and to the LEFT and well in FRONT — the classic three-quarter key, which
 * is where a reader's eye already assumes light comes from and therefore the
 * placement that costs no attention to understand.
 *
 * The distance is the taste decision and it is a real one. Put the light far
 * away and every orb sees it from nearly the same angle, so every highlight
 * lands in the same place and the picture is back to stickers. Put it close and
 * the orbs nearest it blow out while the far ones go black. These numbers put
 * the source about one stage-width out: across the solid's own extent the
 * highlight travels roughly a fifth of an orb's radius on the near side to
 * four-fifths of it on the far side, which is plainly one source without any
 * orb losing its own colour.
 */
export const SCENE_LIGHT: ScenePoint = { x: -1.05, y: -1.25, z: 1.5 };

/**
 * How far the highlight's CENTRE may travel from the orb's, as a fraction of
 * the orb's radius, and how big the highlight itself is in the same units.
 *
 * They are published together because their SUM is the promise: the highlight
 * never crosses the orb's rim, at any light position, ever. 0.56 + 0.34 = 0.90,
 * so there is a tenth of the radius of clear orb outside the highlight even
 * when the light is exactly edge-on and the offset is at its maximum.
 *
 * That margin is not neatness. V1.8 VB-45 gave the List's orb a 1px hairline in
 * its own deep colour specifically to clear WCAG 1.4.11's 3:1 against the
 * near-white pane, and a highlight allowed to reach the rim would paint over
 * the very edge that measurement depends on.
 */
export const HIGHLIGHT_REACH = 0.56;
export const HIGHLIGHT_RADIUS = 0.34;

/**
 * The same two numbers for the terminator — the darkened limb on the side away
 * from the light.
 *
 * It slides FURTHER and is bigger, and both of those were found by looking. A
 * terminator is not a spot in the middle of the dark side — it is the far LIMB,
 * and a shadow blob sitting near the orb's centre reads as a smudge on a disc
 * rather than as a sphere turning away. 0.5 + 0.48 = 0.98 puts the darkest
 * point half a radius out on the side away from the light and takes its soft
 * edge to the rim, which is where the dark side of a sphere actually ends —
 * while still keeping every pixel of it inside the orb it belongs to.
 */
export const SHADE_REACH = 0.5;
export const SHADE_RADIUS = 0.48;

/**
 * Where the LIMB begins, as a fraction of the radius — the third of the three
 * layers, and the one that has nothing to do with which way the light is.
 *
 * A sphere lit from DIRECTLY IN FRONT has no terminator anywhere and is still
 * obviously a sphere, because its own curvature turns the surface away from the
 * viewer at the rim whatever the light is doing. The two directional layers
 * above cannot say that: at zero offset they are both concentric, so the
 * terminator lands in the middle of the face and reads as a smudge on a disc.
 *
 * This is the thing that has to be true for a column of List rows in
 * particular. Those orbs sit almost directly under the light — `shade` for the
 * top row is about 0.015 — so the direction has almost nothing to say about
 * them and the roundness has to come from somewhere that is not the light.
 *
 * Inside this fraction the orb is its own flat colour; outside it, it sinks
 * toward its deep one, reaching it at the rim.
 */
export const LIMB_INNER = 0.5;

/**
 * What one orb does under the light.
 *
 * Offsets are fractions of the orb's own radius, in the same screen-facing axes
 * as the input: positive x is right, positive y is DOWN. A caller multiplies by
 * whatever radius it is drawing at, in whatever unit it draws in, and the
 * geometry is correct at any size — which is what lets an 18px row orb and a
 * 6px orb at the back of the solid be lit by one function.
 */
export interface OrbLight {
  /** Where the specular highlight sits, relative to the orb's centre. */
  readonly hx: number;
  readonly hy: number;
  /** Where the terminator's darkest point sits. Always opposite the highlight —
   * they are the two ends of one axis, which is what makes an orb read as round
   * rather than as a disc with a dot on it. */
  readonly sx: number;
  readonly sy: number;
  /**
   * How strongly the orb catches the light, 0..1. 1 when the light is directly
   * between the orb and the viewer; 0 the moment the light passes behind the
   * orb's own horizon, because at that point every lit part of the sphere is
   * facing away and there is nothing for a highlight to be.
   */
  readonly highlight: number;
  /**
   * How much of the visible face is turned away from the light, 0..1. 0 for a
   * face-on orb, 0.5 for one lit exactly from the side, 1 for one lit from
   * directly behind.
   *
   * Deliberately the physical quantity and NOT a paint opacity. How dark a
   * shaded orb is drawn is a rendering decision that differs between the two
   * surfaces — a muted orb on a near-black stage has far less room to darken
   * than an 18px orb on a white pane — so each caller applies its own gain to
   * this, exactly as `EDGE_LIGHT_LEVEL` is applied to `edgeLight`.
   */
  readonly shade: number;
  /**
   * The cosine the two above are folded from: +1 light in front, 0 side-on,
   * −1 directly behind. Published because it is the quantity a test can reason
   * about without unfolding the two mappings.
   */
  readonly facing: number;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * The whole of VB-54, in eight lines.
 *
 * 1. `u` is the unit direction from the orb to the light. Everything else is a
 *    reading of it, which is why one function covers both surfaces.
 * 2. `facing` is `u.z` — the cosine between "toward the light" and "toward the
 *    viewer". A sphere's brightest point is the one whose normal is `u`, so
 *    when `u` points at the viewer that point is the centre of the disc we can
 *    see, and when `u` points sideways it is on the rim.
 * 3. The highlight's offset is `u`'s own screen components. That is an
 *    orthographic projection of the brightest point onto the orb's face, which
 *    is exact for a sphere and, at the sizes drawn here, indistinguishable from
 *    the perspective answer. It is scaled by `HIGHLIGHT_REACH` so the blob
 *    stays inside the rim — see that constant.
 * 4. The terminator is the same axis, negated.
 *
 * ── The two degenerate cases, both real ──────────────────────────────────
 *
 * A light exactly ON the orb's centre has no direction at all. It is reachable:
 * the List places its orbs on a straight line and a light could be moved onto
 * one. It resolves to "lit from straight ahead" — the neutral answer, no NaN,
 * no highlight flung to infinity.
 *
 * A light exactly BEHIND an orb (`u = (0, 0, −1)`) has a direction but no
 * screen-space component, so the offsets are zero and `highlight` is zero. That
 * is right and not a fallback: a sphere lit from directly behind shows a
 * uniformly dark face with no highlight anywhere on it. The offset being zero
 * is a highlight of size zero, not a highlight in the middle.
 */
export function orbLight(orb: ScenePoint, light: ScenePoint = SCENE_LIGHT): OrbLight {
  const dx = light.x - orb.x;
  const dy = light.y - orb.y;
  const dz = light.z - orb.z;
  const distance = Math.hypot(dx, dy, dz);

  // The light is inside the orb. Read it as straight ahead — see the header.
  const ux = distance === 0 ? 0 : dx / distance;
  const uy = distance === 0 ? 0 : dy / distance;
  const uz = distance === 0 ? 1 : dz / distance;

  const highlight = clamp01(uz);
  return {
    hx: ux * HIGHLIGHT_REACH,
    hy: uy * HIGHLIGHT_REACH,
    sx: -ux * SHADE_REACH,
    sy: -uy * SHADE_REACH,
    highlight,
    // (1 − cos)/2: 0 face-on, 0.5 side-on, 1 from directly behind.
    shade: clamp01((1 - uz) / 2),
    facing: uz,
  };
}

/**
 * How far the highlight's own edge reaches from the orb's centre, as a fraction
 * of the radius — the number the promise above is made of.
 *
 * A function rather than a constant so a test can ask it of a real answer
 * instead of re-multiplying the constants and proving only that arithmetic
 * works. Same for the terminator below.
 */
export function highlightExtent(light: OrbLight): number {
  return Math.hypot(light.hx, light.hy) + HIGHLIGHT_RADIUS;
}

export function shadeExtent(light: OrbLight): number {
  return Math.hypot(light.sx, light.sy) + SHADE_RADIUS;
}

/** A painted box, in whatever pixel space the caller measured it in. */
export interface Frame {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * V2.0 VB-60 — A PAINTED POINT, IN THE SPACE THIS FILE DEFINES.
 *
 * The two callers this file already had could each model their own layout: the
 * globe knows where it put every node, and the List's rows are an evenly
 * spaced column, so `FileTree.tsx`'s `listOrbLight` computes a place from a row
 * index and says out loud that it is a model rather than a measurement.
 *
 * VB-60's picker cannot do that, and the reason is worth stating rather than
 * apologising for. Its orbs sit in a WRAPPING flow: how many land on a line
 * depends on the width of the words beside them, on the panel's width — which
 * a person can drag — and on how many roles they have added of their own. There
 * is no index arithmetic that yields those positions, so a model here would not
 * be a simplification of the layout, it would be a different layout that the
 * light was computed for and nobody could see.
 *
 * So the picker measures. It can afford to: seven orbs, measured when the
 * option list or the panel's width changes, and never on a keystroke — which is
 * precisely the cost `listOrbLight` refused to put on every row of the List on
 * every character of the interview.
 *
 * WHAT THIS FUNCTION IS FOR is that the conversion into stage space then lives
 * HERE, with the space it converts into, instead of being a division scattered
 * through a component. The space's own file owns the only way in, so a surface
 * cannot quietly hold a second opinion about where −1 is.
 *
 * `z` is 0: the picker is flat, like the List's pane. It is the orb's own place
 * ACROSS AND DOWN the group that varies, which is the whole of what makes a
 * scattered handful of circles read as one lit object rather than seven
 * stickers (see this file's header on VB-23).
 *
 * A frame with no extent — an unmounted group, a `getBoundingClientRect` before
 * layout, a jsdom test — resolves to the centre, which `orbLight` reads as lit
 * from straight ahead. Neutral, no NaN, no orb flung off the stage; the same
 * degenerate-case discipline as `orbLight` itself.
 */
export function stagePoint(x: number, y: number, frame: Frame): ScenePoint {
  const across = frame.width > 0 ? ((x - frame.left) / frame.width) * 2 - 1 : 0;
  const down = frame.height > 0 ? ((y - frame.top) / frame.height) * 2 - 1 : 0;
  return { x: across, y: down, z: 0 };
}
