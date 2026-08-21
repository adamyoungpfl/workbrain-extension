/**
 * V1.2 VB-14a — the Brain globe's geometry.
 *
 * Pure maths, no DOM, no React. Everything the globe draws is a fold over the
 * functions below, so a mistyped coordinate or a wrong rotation shows up as a
 * failing unit test rather than as a slightly-wrong picture nobody notices.
 *
 * PORTED, NOT INVENTED. The construction is the same golden-ratio icosahedron
 * as `../modelcitizen/src/components/ModelSphere.tsx` and the mark generator
 * behind `BrandMark.tsx`. Three deliberate differences from that source:
 *
 * 1. **The vertices are not normalised to the unit sphere.** ModelSphere
 *    divides each one by its length; keeping the raw construction means every
 *    coordinate is exactly 0, ±1 or ±PHI, an edge is exactly length 2, and the
 *    edge test below is an exact integer comparison instead of a fuzzy one.
 *    Scale is a rendering decision and belongs to the component.
 *
 * 2. **Edges are derived, never listed.** ModelSphere hardcodes twenty faces
 *    and walks them for edges. A face list is twenty more chances to typo.
 *    An edge is simply a pair whose squared distance is 4 — a fact about the
 *    solid, not a table to maintain — and the tests assert the structural
 *    signature that falls out of it: thirty edges, every vertex with exactly
 *    five neighbours.
 *
 * 3. **Projection is perspective, not orthographic.** ModelSphere fakes depth
 *    with per-node radius and opacity only. VB-14 asked for a camera that can
 *    push in during the fly-in, so `project` divides by distance and returns
 *    the scale it used, which the component then applies to radii and stroke
 *    widths as well as positions.
 */

/** The golden ratio. Every coordinate in the solid is 0, ±1 or ±PHI. */
export const PHI = (1 + Math.sqrt(5)) / 2;

/** The camera's distance from the origin, in the same units as the vertices.
 * Chosen in the prototype (docs/V1.2-REFINEMENT.md VB-14) — do not re-tune. */
export const CAMERA = 4.6;

/** How far the globe may tilt away from the equator, in radians. Past this it
 * tumbles over a pole and the labels turn upside down, which is exactly what
 * VB-14 says must never happen. */
export const MAX_TILT = 1.2;

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** A vertex after `project`: screen-space x/y in vertex units, plus the
 * perspective factor that produced them. The factor is returned rather than
 * discarded because radius, stroke width and bloom size all key off it too. */
export interface Projected {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

/**
 * The twelve vertices, as the three cyclic permutations of (0, ±1, ±PHI).
 *
 * Written out rather than generated from a permutation loop: this is the
 * definition, and a reader checking it against a textbook should see the
 * textbook's own three rows. The order is fixed and load-bearing — callers
 * index into it, and `ICOSAHEDRON_EDGES` reports index pairs.
 */
export const ICOSAHEDRON_VERTICES: readonly Vec3[] = [
  { x: 0, y: 1, z: PHI },
  { x: 0, y: 1, z: -PHI },
  { x: 0, y: -1, z: PHI },
  { x: 0, y: -1, z: -PHI },
  { x: 1, y: PHI, z: 0 },
  { x: 1, y: -PHI, z: 0 },
  { x: -1, y: PHI, z: 0 },
  { x: -1, y: -PHI, z: 0 },
  { x: PHI, y: 0, z: 1 },
  { x: PHI, y: 0, z: -1 },
  { x: -PHI, y: 0, z: 1 },
  { x: -PHI, y: 0, z: -1 },
];

/** Squared length of an icosahedron edge in this construction. Two adjacent
 * vertices differ by exactly 2 along one axis, or by (±1, ±(PHI-1), ±PHI)
 * whose squares sum to 4 because PHI² = PHI + 1. */
const EDGE_LENGTH_SQ = 4;

/** Floating point slack. The two ways an edge arises above agree to within a
 * few ulps, and the next-shortest pair is at squared distance ~10.5, so the
 * gap this has to sit inside is enormous. */
const EPSILON = 1e-9;

export function squaredDistance(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Every pair of vertices one edge length apart, as index pairs, low index
 * first, in ascending order. Derived, so the only thing that can be wrong is
 * a vertex — and the tests catch that.
 */
export function deriveEdges(vertices: readonly Vec3[] = ICOSAHEDRON_VERTICES): ReadonlyArray<readonly [number, number]> {
  const edges: Array<readonly [number, number]> = [];
  for (let a = 0; a < vertices.length; a++) {
    for (let b = a + 1; b < vertices.length; b++) {
      if (Math.abs(squaredDistance(vertices[a]!, vertices[b]!) - EDGE_LENGTH_SQ) < EPSILON) {
        edges.push([a, b] as const);
      }
    }
  }
  return edges;
}

/** The thirty edges of the solid above. Computed once at module load. */
export const ICOSAHEDRON_EDGES: ReadonlyArray<readonly [number, number]> = deriveEdges();

/** How many edges meet at each vertex. Five, for every one of them — the
 * cheapest whole-shape assertion there is. */
export function vertexDegrees(
  vertexCount: number = ICOSAHEDRON_VERTICES.length,
  edges: ReadonlyArray<readonly [number, number]> = ICOSAHEDRON_EDGES,
): number[] {
  const degrees = new Array<number>(vertexCount).fill(0);
  for (const [a, b] of edges) {
    degrees[a] = (degrees[a] ?? 0) + 1;
    degrees[b] = (degrees[b] ?? 0) + 1;
  }
  return degrees;
}

/**
 * Turn a point by `ry` about the vertical axis, then tilt it by `rx` about
 * the horizontal one.
 *
 * The order matters and is the source's: spin first, tilt second. Spinning a
 * tilted globe walks its poles around the screen; tilting a spun one keeps
 * the axis where you put it, which is what makes a drag feel like a trackball
 * rather than a gimbal.
 */
export function rotate(point: Vec3, rx: number, ry: number): Vec3 {
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const x1 = point.x * cy + point.z * sy;
  const z1 = -point.x * sy + point.z * cy;

  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const y2 = point.y * cx - z1 * sx;
  const z2 = point.y * sx + z1 * cx;

  return { x: x1, y: y2, z: z2 };
}

/**
 * Perspective projection. `scale = CAM / (CAM - z / PHI * 0.9)` — the value
 * chosen from the working prototype (docs/V1.2-REFINEMENT.md). Dividing z by
 * PHI first normalises the solid's own extent, so the same camera constant
 * would hold if the geometry were ever rescaled.
 *
 * y is returned unflipped. SVG's downward y is a rendering convention and the
 * component applies it; keeping it out of here means a test can reason about
 * "up" without holding a coordinate flip in its head.
 */
export function project(point: Vec3, camera: number = CAMERA): Projected {
  const scale = camera / (camera - (point.z / PHI) * 0.9);
  return { x: point.x * scale, y: point.y * scale, scale };
}

/**
 * Depth, normalised to 0 at the back and 1 at the front. Everything visual
 * keys off this: radius, opacity, colour, stroke width, label size and label
 * weight all read `t` and nothing else, so depth cueing stays one decision
 * rather than six.
 *
 * Clamped, and deliberately so. The solid's circumradius is
 * sqrt(1 + PHI²) ≈ 1.902, larger than PHI, so a vertex rotated to point
 * straight at the camera sits slightly past the ends of this range. The
 * formula is the prototype's and is not re-derived; the clamp keeps its
 * output inside 0..1 where every consumer expects it.
 */
export function depth(z: number): number {
  const t = (z + PHI) / (2 * PHI);
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** The painter's algorithm: indices ordered back to front, so drawing them in
 * sequence puts near nodes over far ones. Ties keep their original order. */
export function paintOrder(points: readonly Vec3[]): number[] {
  return points
    .map((point, index) => ({ point, index }))
    .sort((a, b) => a.point.z - b.point.z || a.index - b.index)
    .map((entry) => entry.index);
}

/** Keep a tilt inside ±MAX_TILT so the globe cannot roll past its poles. */
export function clampTilt(rx: number): number {
  return rx < -MAX_TILT ? -MAX_TILT : rx > MAX_TILT ? MAX_TILT : rx;
}

/**
 * The rotation that brings `vertex` to the front of the globe — the one
 * facing the camera, at maximum z.
 *
 * This is what makes the globe keyboard-operable rather than drag-only:
 * focusing a node turns the globe to face it, so a person who never touches
 * the pointer still sees the node they are on, with its label the right way
 * up. Solved rather than searched — `rotate` spins about y first, so choosing
 * ry to zero the x component and then rx to zero the y component lands the
 * vertex on the +z axis exactly.
 *
 * Every vertex of this solid needs a tilt of at most atan2(PHI, 1) ≈ 1.017
 * radians, comfortably inside MAX_TILT, so the clamp never fights this.
 */
export function faceRotation(vertex: Vec3): { rx: number; ry: number } {
  const ry = Math.atan2(-vertex.x, vertex.z);
  const planar = Math.hypot(vertex.x, vertex.z);
  const rx = Math.atan2(vertex.y, planar);
  return { rx: clampTilt(rx), ry };
}

/**
 * Shortest signed turn from `from` to `to` about a full circle. A globe asked
 * to spin from 350° to 10° should move ten degrees forward, not 340° back.
 */
export function shortestTurn(from: number, to: number): number {
  const tau = Math.PI * 2;
  let delta = (to - from) % tau;
  if (delta > Math.PI) delta -= tau;
  if (delta < -Math.PI) delta += tau;
  return delta;
}
