/**
 * V1.7 VB-39 — the Workbrain mark's silhouette, in the mark's own camera.
 *
 * `silhouette.ts` knows the shape the solid casts. `markSpin.ts` knows the
 * camera the logo was exported through — a 14° tilt, a projected radius of 98
 * about (120, 120), and the pose the still mark sits at. This file is the one
 * place those two meet, and it is deliberately three lines of arithmetic: the
 * whole point of the split is that neither of them had to learn about the
 * other.
 *
 * So the silhouette is the *same object at the same angle* as the node graph
 * beside it on the welcome screen. Turn them both to 204° and every hull
 * corner lands exactly on a node's centre — `markSilhouette.test.ts` asserts
 * that against `markFrame`, which is the check that stops these two drawings
 * ever becoming two different logos.
 *
 * ONLY THE OUTLINE, AND WHY
 * `silhouetteAt` also returns the creases between visible faces. Nothing in
 * the panel draws them: the mark it replaces is 24px, and at that size the
 * creases are the same grey mud that made `scripts/icons.mjs` give up on the
 * full node graph at 16px (looked at, in a real panel, before deciding). The
 * icon generator draws them at 32px and above, where there is room. They are
 * returned rather than dropped so the two consumers share one computation.
 */
import { MARK_CENTRE, MARK_SCALE, MARK_STATIC_ANGLE, MARK_TILT } from './markSpin';
import { silhouetteAt, type Point2 } from './silhouette';

/**
 * Two decimals, matching `markSpin.ts` and so the precision `mark.svg` itself
 * exports at. Also keeps short the one attribute the animation rewrites per
 * frame.
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The mark's outline at a spin angle, as viewBox points ready to draw.
 *
 * Between six and ten points depending on where the solid has turned to —
 * an icosahedron's shadow gains and loses corners as it rotates, and that
 * changing corner count is the silhouette's only depth cue, so it is not
 * smoothed away.
 */
export function markSilhouettePoints(spinAngle: number): readonly Point2[] {
  const frame = silhouetteAt(MARK_TILT, spinAngle);
  return frame.hull.map((i) => {
    const p = frame.points[i]!;
    return {
      x: round2(MARK_CENTRE + p.x * MARK_SCALE),
      y: round2(MARK_CENTRE + p.y * MARK_SCALE),
    };
  });
}

/** An SVG `points` attribute — the one string the animation writes per frame. */
export function pointsAttribute(points: readonly Point2[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}

/** The still silhouette: the pose `mark.svg` was exported at, as an outline. */
export const MARK_SILHOUETTE_STILL: readonly Point2[] =
  markSilhouettePoints(MARK_STATIC_ANGLE);
