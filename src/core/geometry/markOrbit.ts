/**
 * V1.7 VB-34 — the splash's camera: a drifting orbit around the mark.
 *
 * WHAT THIS IS NOT. It is not `markSpin.ts`. That file holds the *logo's* own
 * camera — orthographic, a fixed 14° tilt, one axis, constant speed — and it
 * is right for the welcome screen and the status bar, where the mark is a
 * small permanent decoration and a steady turn is the least distracting thing
 * it can do.
 *
 * A splash is a different job. VB-34 asks for "camera slowly changing
 * perspective in a loop — cinematic rather than a spin", and a constant-speed
 * turn about one axis is exactly what that sentence rules out. So this is a
 * second camera over the *same solid*: the vertices, the edges and the
 * rotation all come from `./icosahedron.ts` and none of them is re-derived
 * here, and the depth ramps that make the drawing read as a sphere come from
 * `markSpin.ts`'s `markFrameFrom`. What lives in this file is only the path
 * the camera takes.
 *
 * THREE THINGS MOVE, NOT ONE
 *   yaw    — around the solid. Accumulates to exactly one full turn per loop.
 *   pitch  — above and below its equator, so the shape is seen from over the
 *            top and then from underneath rather than always side-on.
 *   camera — distance, and therefore *perspective*. This is the one that
 *            makes the difference between "the object is turning" and "the
 *            camera is moving", because it is the only one that changes the
 *            shape of the projection rather than the orientation of the
 *            subject. `icosahedron.ts`'s `project` is already a perspective
 *            projection with a camera distance parameter; pushing that
 *            parameter is the whole trick.
 *
 * HOW IT DRIFTS RATHER THAN SPINS
 * The path is four viewpoints, and the camera eases from each to the next on
 * `core/motion/easing.ts`'s curve — the one curve `docs/design-system.html`
 * §06 allows. That curve has zero slope at *both* ends, so the camera settles
 * into every viewpoint and leaves it again from rest. That is the difference
 * a person actually sees: a spin has one speed, this has a rhythm.
 *
 * WHY THE LOOP HAS NO SEAM
 * Two facts, and neither is a fudge factor:
 *   1. The wrap is just another segment. The fourth viewpoint eases back into
 *      the first, with the first's yaw carried a full turn forward, so value
 *      is continuous across the wrap by construction.
 *   2. Because the easing curve rests at both ends, *velocity* is zero at the
 *      wrap as well — the same as at every other viewpoint. A loop can be
 *      continuous in position and still visibly tick if the speed jumps; this
 *      one cannot, and `markOrbit.test.ts` measures it rather than asserting
 *      the arithmetic looks right.
 *
 * Pure, and a function of an absolute clock — same contract as
 * `spinAngleAt`, for the same reason: a component that remounts must pick the
 * camera up where it was, not snap it back to the first viewpoint.
 */
import { ICOSAHEDRON_VERTICES, project, rotate } from './icosahedron';
import { ease } from '../motion/easing';
import {
  MARK_CENTRE,
  MARK_SPIN_MS,
  MARK_STATIC_ANGLE,
  MARK_TILT,
  markFrameFrom,
  type MarkFrame,
  type ProjectedVertex,
} from './markSpin';

const TAU = Math.PI * 2;

/** Where the camera is, at one moment. Distances are in vertex units. */
export interface OrbitView {
  /** Around the solid. Absolute and accumulating, not wrapped to 0..2π. */
  readonly yaw: number;
  /** Above (+) or below (−) the solid's equator, in radians. */
  readonly pitch: number;
  /** Camera distance. Smaller is nearer, and nearer is more perspective. */
  readonly camera: number;
}

/**
 * The four viewpoints, in order, looping back to the first.
 *
 * Chosen, not derived, and worth saying why each is where it is:
 *
 * - **0** is the logo. `MARK_STATIC_ANGLE` at `MARK_TILT` is the pose
 *   `mark.svg` was exported at, and a long camera (6.0) is the least
 *   perspective this file ever applies. So the loop passes through the mark
 *   the product ships, and the reduced-motion still frame is that same
 *   viewpoint rather than a fifth drawing invented for the purpose.
 * - **1** drops below the equator and pushes in hard. This is the beat that
 *   sells it as a camera: the near face swells, the far face shrinks away.
 * - **2** climbs over the top and pulls back out.
 * - **3** settles near the equator, still fairly close, and hands back to 0.
 *
 * The pitches stay inside ±0.55 rad. Past roughly a radian the solid starts
 * presenting a pole to the camera, the drawing loses its silhouette and reads
 * as a flat rosette — the same failure `icosahedron.ts`'s `MAX_TILT` guards
 * the globe against, though this path is nowhere near needing a clamp.
 *
 * The camera never goes below 3.0. `project` divides by
 * `camera - (z / PHI) * 0.9`, and the solid's own circumradius makes that
 * term as large as ~1.06, so anything approaching 1.06 sends the near vertex
 * to infinity. 3.0 leaves a factor of nearly three in hand.
 */
export const ORBIT_VIEWS: readonly OrbitView[] = [
  { yaw: MARK_STATIC_ANGLE, pitch: MARK_TILT, camera: 6.0 },
  { yaw: MARK_STATIC_ANGLE + 1.85, pitch: -0.34, camera: 3.2 },
  { yaw: MARK_STATIC_ANGLE + 3.4, pitch: 0.52, camera: 4.4 },
  { yaw: MARK_STATIC_ANGLE + 5.05, pitch: -0.1, camera: 3.5 },
];

/**
 * One trip around the loop.
 *
 * `MARK_SPIN_MS`, deliberately: nine seconds is the revolution
 * `../modelcitizen/src/components/ModelSphere.tsx` chose and the welcome
 * mark already turns at, so the two marks in this product move at the same
 * tempo instead of at two arbitrary ones. Four viewpoints across it puts each
 * camera move at 2.25 seconds, which is a move you watch rather than a cut.
 *
 * Not one of §06's three durations, and it should not be. Those govern
 * *transitions* — a thing changing state in response to a person. This is
 * ambient, the same category as the mark's own spin, and 200ms of it would be
 * a strobe.
 */
export const ORBIT_PERIOD_MS = MARK_SPIN_MS;

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Where the camera is at a moment on a monotonic clock.
 *
 * Takes an absolute timestamp rather than time-since-mount — see
 * `spinAngleAt`'s note in markSpin.ts, which this deliberately mirrors.
 *
 * Negative inputs are handled by the same `x - floor(x)` the spin uses, which
 * is a true modulo for negatives where `%` is not.
 */
export function orbitViewAt(nowMs: number, periodMs: number = ORBIT_PERIOD_MS): OrbitView {
  const views = ORBIT_VIEWS;
  const n = views.length;
  if (!(periodMs > 0) || n === 0) return views[0] ?? { yaw: 0, pitch: 0, camera: 6 };

  const turns = nowMs / periodMs;
  const phase = turns - Math.floor(turns);
  const walked = phase * n;
  // `phase` is < 1, so `walked` is < n and the floor is in range. The clamp is
  // for the one case floating point can produce a phase that rounds to 1.
  const i = Math.min(n - 1, Math.floor(walked));
  const from = views[i]!;
  const rawTo = views[(i + 1) % n]!;
  // The wrap is a segment like any other — the first viewpoint, one whole
  // turn further round. That is what makes the loop continuous instead of
  // snapping the yaw back by 2π at the boundary.
  const to = i === n - 1 ? { ...rawTo, yaw: rawTo.yaw + TAU } : rawTo;

  const t = ease(walked - i);
  return {
    yaw: mix(from.yaw, to.yaw, t),
    pitch: mix(from.pitch, to.pitch, t),
    camera: mix(from.camera, to.camera, t),
  };
}

/**
 * How far the furthest vertex ever gets from the centre, anywhere on the
 * path, in vertex units.
 *
 * Measured over the real path at module load rather than bounded on paper.
 * The extent under a perspective camera depends on yaw, pitch *and* distance
 * together — a vertex swings wide exactly when it is also nearest and so most
 * magnified — and a hand-derived bound for that would be a number nobody
 * could check. Sampling the actual function is checkable: `markOrbit.test.ts`
 * re-derives it at a different sample count and asserts the drawing stays
 * inside the viewBox, circles and all.
 *
 * 720 samples is one every 12.5ms of a nine-second loop, roughly one per
 * frame, and it costs about 8,600 rotations once.
 */
const FIT_SAMPLES = 720;

function furthestVertex(): number {
  let max = 0;
  for (let s = 0; s < FIT_SAMPLES; s++) {
    const view = orbitViewAt((s / FIT_SAMPLES) * ORBIT_PERIOD_MS);
    for (const v of ICOSAHEDRON_VERTICES) {
      const p = project(rotate(v, view.pitch, view.yaw), view.camera);
      const r = Math.hypot(p.x, p.y);
      if (r > max) max = r;
    }
  }
  return max;
}

export const ORBIT_EXTENT = furthestVertex();

/**
 * The projected radius the widest moment of the orbit is framed to, in
 * viewBox units.
 *
 * Smaller than `MARK_RADIUS`'s 98 because a node is drawn *around* its centre
 * and perspective magnifies it: at the closest viewpoint the outermost node
 * carries a radius near 17, and 88 + 17 leaves fifteen units of viewBox to
 * spare. The mark therefore never touches its own edge at any point on the
 * path, which is what stops the splash clipping a corner off the solid for a
 * few frames every loop.
 */
export const ORBIT_RADIUS = 88;

/** Vertex units to viewBox units, for this camera. */
export const ORBIT_SCALE = ORBIT_RADIUS / ORBIT_EXTENT;

/**
 * Every vertex as seen from one viewpoint, in viewBox coordinates.
 *
 * Depth is normalised against this frame's own near and far vertices, exactly
 * as `projectMark` does and for the same reason: with a camera that moves,
 * an absolute ramp would make the whole mark brighten and dim as it drifted.
 * The magnification is *not* normalised — it is returned as `gain` and is the
 * one thing here that an orthographic camera cannot say.
 */
export function projectOrbit(view: OrbitView): ProjectedVertex[] {
  const rotated = ICOSAHEDRON_VERTICES.map((v) => rotate(v, view.pitch, view.yaw));
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const { z } of rotated) {
    if (z < zMin) zMin = z;
    if (z > zMax) zMax = z;
  }
  const span = zMax - zMin || 1;
  return rotated.map((v) => {
    const p = project(v, view.camera);
    return {
      x: MARK_CENTRE + p.x * ORBIT_SCALE,
      // Flipped, because SVG's y runs downward. Same convention as projectMark.
      y: MARK_CENTRE - p.y * ORBIT_SCALE,
      depth: (v.z - zMin) / span,
      gain: p.scale,
    };
  });
}

/** The whole mark from one viewpoint — thirty edges, twelve nodes, furthest
 * first. Shading is `markSpin`'s, so this is the same logo seen differently
 * and not a second drawing of it. */
export function orbitFrame(view: OrbitView): MarkFrame {
  return markFrameFrom(projectOrbit(view));
}

/**
 * The still, composed frame `prefers-reduced-motion` gets: viewpoint 0, which
 * is the pose `mark.svg` exports, through this camera at its longest and so
 * least distorting.
 *
 * Not `markFrame(MARK_STATIC_ANGLE)` — nearly, but not quite. The splash's
 * camera is a perspective one, and a still frame drawn through a *different*
 * camera to the moving one would be a second drawing to keep in step. Being
 * the first viewpoint of the real path makes it the frame the animation
 * itself passes through, which is the only version that cannot drift.
 */
export const ORBIT_STILL: MarkFrame = orbitFrame(ORBIT_VIEWS[0]!);
