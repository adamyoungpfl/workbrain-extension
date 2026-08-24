/**
 * V1.7 VB-39 — the mark as a silhouette.
 *
 * The tab icon and the status-bar mark stop being a drawing of twelve nodes
 * and thirty edges and become the *shape* the solid casts: one filled outline,
 * and — where there is room for them — the creases where its visible faces
 * meet. Everything here is that shape, as arithmetic.
 *
 * WHY THIS IS A SEPARATE FILE FROM `markSpin.ts`
 * Same split `icosahedron.ts` / `markSpin.ts` already draws, for the same
 * reason: what lives here is a fact about *the solid* — which faces point at
 * the camera at a given orientation, which edges bound the shadow, what the
 * outline is — and it holds whatever camera you put in front of it. The mark's
 * own camera (its tilt, its radius, its 240×240 viewBox) belongs to
 * `markSilhouette.ts`, and `scripts/icons.mjs` brings a third camera of its
 * own. All three share the geometry below and none of them owns it.
 *
 * NOTE THE `.ts` ON THE IMPORT — IT IS LOAD-BEARING
 * `scripts/icons.mjs` imports this module directly, under Node's type
 * stripping, so that the icon set is generated from the geometry the panel
 * actually ships rather than from a second copy of it that can drift. Node
 * resolves real files, not TypeScript's extensionless specifiers, so the
 * extension has to be written out. `allowImportingTsExtensions` in
 * tsconfig.json is what lets `tsc` accept it, and Vite resolves it unchanged.
 * Keep this module's imports on files that do the same: anything reached from
 * here is reached by Node too.
 *
 * TWO WAYS TO FIND THE OUTLINE, AND WHY BOTH ARE HERE
 * `outlineEdges` finds it in 3D — an edge bounds the silhouette when one of
 * its two faces points at the camera and the other points away. `convexHull`
 * finds it in 2D, from the projected points alone, knowing nothing about
 * faces. For a convex solid the two must describe the same polygon, and
 * `silhouette.test.ts` asserts that across a hundred-odd orientations — every
 * hull corner on the outline ring, the ring closed, everything else inside
 * it. That is not duplication for its
 * own sake: the hull is what the panel draws (it needs no face data and cannot
 * be tripped by a face turned exactly edge-on), the face partition is what
 * gives the icon its creases, and each one checks the other's arithmetic.
 */
import {
  ICOSAHEDRON_EDGES,
  ICOSAHEDRON_VERTICES,
  rotate,
  type Vec3,
} from './icosahedron.ts';

/** A point on the drawing surface. `y` runs *down*, as SVG's does. */
export interface Point2 {
  readonly x: number;
  readonly y: number;
}

/** Three vertex indices, ascending. */
export type Face = readonly [number, number, number];

/** An edge, as the pair of vertex indices `ICOSAHEDRON_EDGES` reports. */
export type Edge = readonly [number, number];

/**
 * The twenty faces, derived rather than listed — `icosahedron.ts`'s own
 * argument, applied one dimension up. A face is a triangle of three mutually
 * adjacent vertices, which is a fact about the edge list, not a table to
 * maintain and mistype. Emitted with indices ascending and in ascending order,
 * so the output is stable and a test can name a face.
 */
export function deriveFaces(
  vertexCount: number = ICOSAHEDRON_VERTICES.length,
  edges: readonly Edge[] = ICOSAHEDRON_EDGES,
): readonly Face[] {
  const neighbours = Array.from({ length: vertexCount }, () => new Set<number>());
  for (const [a, b] of edges) {
    neighbours[a]!.add(b);
    neighbours[b]!.add(a);
  }
  const faces: Face[] = [];
  for (let a = 0; a < vertexCount; a++) {
    for (const b of neighbours[a]!) {
      if (b <= a) continue;
      for (const c of neighbours[b]!) {
        if (c > b && neighbours[a]!.has(c)) faces.push([a, b, c] as const);
      }
    }
  }
  return faces;
}

/** The twenty faces of the shipped solid. Computed once at module load. */
export const ICOSAHEDRON_FACES: readonly Face[] = deriveFaces();

/**
 * Which faces point at the camera, given already-rotated vertices.
 *
 * The camera looks down −z, so a face is front-facing when its *outward*
 * normal has a positive z. Outwardness is free here and needs no winding
 * convention to be maintained by hand: the solid is centred on the origin and
 * convex, so the outward normal is simply whichever of ±(b−a)×(c−a) points the
 * same way as the face's own centroid.
 *
 * A face turned exactly edge-on (normal z of 0) counts as facing away. That is
 * a coin toss on a measure-zero case; what matters is that it is decided the
 * same way for both faces of an edge, which it is.
 */
export function frontFaces(
  rotated: readonly Vec3[],
  faces: readonly Face[] = ICOSAHEDRON_FACES,
): readonly boolean[] {
  return faces.map(([ia, ib, ic]) => {
    const a = rotated[ia]!;
    const b = rotated[ib]!;
    const c = rotated[ic]!;
    const ux = b.x - a.x;
    const uy = b.y - a.y;
    const uz = b.z - a.z;
    const vx = c.x - a.x;
    const vy = c.y - a.y;
    const vz = c.z - a.z;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const outward =
      nx * (a.x + b.x + c.x) + ny * (a.y + b.y + c.y) + nz * (a.z + b.z + c.z) >= 0;
    return (outward ? nz : -nz) > 0;
  });
}

export interface EdgePartition {
  /**
   * The edges that bound the shadow: one face towards the camera, one away.
   * For a convex solid these form a single closed ring — the silhouette.
   */
  readonly outline: readonly Edge[];
  /**
   * The edges where two visible faces meet. These are the creases that make a
   * filled silhouette read as a solid rather than as a flat cut-out.
   */
  readonly creases: readonly Edge[];
  /** Edges with no visible face at all. Never drawn; returned for the tests. */
  readonly hidden: readonly Edge[];
}

/**
 * Sort every edge by how many of its two faces face the camera.
 *
 * Each edge of a closed solid belongs to exactly two faces, so the count is
 * always 0, 1 or 2 and the three buckets partition all thirty.
 */
export function partitionEdges(
  rotated: readonly Vec3[],
  faces: readonly Face[] = ICOSAHEDRON_FACES,
  edges: readonly Edge[] = ICOSAHEDRON_EDGES,
): EdgePartition {
  const front = frontFaces(rotated, faces);
  const seen = new Map<string, number>();
  const key = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
  faces.forEach(([a, b, c], i) => {
    if (!front[i]) return;
    for (const [p, q] of [
      [a, b],
      [b, c],
      [a, c],
    ] as const) {
      const k = key(p, q);
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
  });

  const outline: Edge[] = [];
  const creases: Edge[] = [];
  const hidden: Edge[] = [];
  for (const edge of edges) {
    const count = seen.get(key(edge[0], edge[1])) ?? 0;
    if (count === 1) outline.push(edge);
    else if (count >= 2) creases.push(edge);
    else hidden.push(edge);
  }
  return { outline, creases, hidden };
}

/**
 * The convex hull of a set of points, as indices into that set, walking the
 * boundary in one consistent rotational direction.
 *
 * Andrew's monotone chain: sort by x then y, sweep once for each half of the
 * boundary, and drop any point that fails to turn. Points that sit exactly on
 * a hull edge are dropped along with the interior ones — a polygon with a
 * redundant vertex on one of its sides draws identically and compares badly.
 *
 * Chosen over "walk the outline edges" for the panel because it needs only the
 * projected points: no faces, no normals, and no behaviour to define for a
 * face that has turned exactly edge-on mid-animation.
 */
export function convexHull(points: readonly Point2[]): readonly number[] {
  if (points.length < 3) return points.map((_, i) => i);
  const order = points
    .map((_, i) => i)
    .sort((a, b) => points[a]!.x - points[b]!.x || points[a]!.y - points[b]!.y);
  const turn = (o: number, a: number, b: number) =>
    (points[a]!.x - points[o]!.x) * (points[b]!.y - points[o]!.y) -
    (points[a]!.y - points[o]!.y) * (points[b]!.x - points[o]!.x);
  const half = (sequence: readonly number[]): number[] => {
    const chain: number[] = [];
    for (const p of sequence) {
      while (chain.length >= 2 && turn(chain[chain.length - 2]!, chain[chain.length - 1]!, p) <= 0) {
        chain.pop();
      }
      chain.push(p);
    }
    // The last point of each half is the first of the other's.
    chain.pop();
    return chain;
  };
  return [...half(order), ...half([...order].reverse())];
}

/**
 * Twice the area a triangle covers on screen, signed. Used only for its size,
 * so the sign is dropped by the caller — it flips with the face's winding and
 * carries no information the culling has not already extracted.
 */
function projectedArea(points: readonly Point2[], [ia, ib, ic]: Face): number {
  const a = points[ia]!;
  const b = points[ib]!;
  const c = points[ic]!;
  return Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
}

/** The area a closed polygon covers, from its points in boundary order. */
export function polygonArea(points: readonly Point2[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export interface SilhouetteOptions {
  /**
   * The smallest facet worth a crease, as a fraction of the whole silhouette's
   * area. Zero — the default — draws every crease the culling finds.
   *
   * This exists because "visible" and "worth drawing" are different questions.
   * A face turned almost edge-on is genuinely facing the camera and its crease
   * is genuinely there, a hair inside the outline. Drawn, it slices a sliver
   * off the edge of the shape that reads as a chip in the icon rather than as
   * a facet — seen, at 128px, before this option existed. Above about 0.04 the
   * grazing facets drop out and what is left is the handful of faces a person
   * would say they can see.
   */
  readonly minFacet?: number;
}

export interface SilhouetteFrame {
  /**
   * Every vertex, projected orthographically into drawing coordinates and in
   * `ICOSAHEDRON_VERTICES` order. Unscaled: one unit here is one unit of the
   * solid's own construction, and giving it a radius is the camera's job.
   */
  readonly points: readonly Point2[];
  /** The outline, as indices into `points`, in boundary order. */
  readonly hull: readonly number[];
  /** The creases between visible faces, as index pairs. */
  readonly creases: readonly Edge[];
}

/**
 * The whole silhouette at one orientation: where every vertex lands, what its
 * outline is, and which creases are visible inside it.
 *
 * `rx`/`ry` are `icosahedron.ts`'s rotation, unchanged — spin about the
 * vertical axis first, then tilt — so a caller that already knows how to pose
 * the node graph poses the silhouette the same way and gets the same object
 * seen from the same place.
 *
 * Pure, and allocating a fresh frame per call. Twelve vertices and twenty
 * faces is a few hundred flops; the animation that calls this sixty times a
 * second spends more in the one attribute it then writes.
 */
export function silhouetteAt(
  rx: number,
  ry: number,
  { minFacet = 0 }: SilhouetteOptions = {},
): SilhouetteFrame {
  const rotated = ICOSAHEDRON_VERTICES.map((v) => rotate(v, rx, ry));
  // y is negated once, here: the solid's y runs up and every drawing surface
  // this feeds runs it down.
  const points = rotated.map(({ x, y }) => ({ x, y: -y }));
  const hull = convexHull(points);
  const { creases } = partitionEdges(rotated);
  if (minFacet <= 0) return { points, hull, creases };

  const floor = minFacet * polygonArea(hull.map((i) => points[i]!));
  const tooThin = new Set<string>();
  ICOSAHEDRON_FACES.forEach((face) => {
    if (projectedArea(points, face) >= floor) return;
    const [a, b, c] = face;
    for (const [p, q] of [[a, b], [b, c], [a, c]] as const) {
      tooThin.add(p < q ? `${p},${q}` : `${q},${p}`);
    }
  });
  return {
    points,
    hull,
    // A crease belongs to two visible faces. Drop it if *either* of them is
    // too foreshortened to be a facet anybody can see.
    creases: creases.filter(([a, b]) => !tooThin.has(a < b ? `${a},${b}` : `${b},${a}`)),
  };
}
