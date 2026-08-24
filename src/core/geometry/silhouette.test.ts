import { describe, it, expect } from 'vitest';
import {
  ICOSAHEDRON_EDGES,
  ICOSAHEDRON_VERTICES,
  rotate,
  type Vec3,
} from './icosahedron';
import {
  ICOSAHEDRON_FACES,
  convexHull,
  deriveFaces,
  frontFaces,
  partitionEdges,
  polygonArea,
  silhouetteAt,
  type Edge,
  type Point2,
} from './silhouette';

/**
 * V1.7 VB-39.
 *
 * A silhouette is one of those drawings where a mistake looks like a design
 * decision — a corner in the wrong place is still a plausible polygon, and
 * nobody spots it. So almost nothing below asserts a coordinate. What it
 * asserts are the properties a shadow of a convex solid cannot fail to have,
 * at hundreds of orientations:
 *
 * - the faces really are the icosahedron's twenty, with every edge on two of
 *   them and every vertex on five;
 * - the outline edges form exactly one closed ring;
 * - that ring is convex on screen, and every other vertex projects inside it;
 * - the ring and the 2D convex hull — computed from the projected points
 *   alone, knowing nothing about faces — describe the same polygon.
 *
 * The last one is the load-bearing test. Two independent routes to the same
 * answer means an error in either shows up as a disagreement rather than as a
 * slightly wrong picture.
 */

/** A spread of orientations, deterministic so a failure is reproducible. */
function orientations(count: number): Array<{ rx: number; ry: number }> {
  const out: Array<{ rx: number; ry: number }> = [];
  for (let i = 0; i < count; i++) {
    // Two incommensurable steps, so the samples never fall into a pattern
    // that happens to dodge a whole class of pose.
    out.push({ rx: i * 0.37 - 1.1, ry: i * 0.7911 });
  }
  return out;
}

const rotateAll = (rx: number, ry: number): Vec3[] =>
  ICOSAHEDRON_VERTICES.map((v) => rotate(v, rx, ry));

const key = (e: Edge) => (e[0] < e[1] ? `${e[0]},${e[1]}` : `${e[1]},${e[0]}`);

/** Walk a set of edges as a graph and report the cycles it forms. */
function rings(edges: readonly Edge[]): number[][] {
  const neighbours = new Map<number, number[]>();
  for (const [a, b] of edges) {
    neighbours.set(a, [...(neighbours.get(a) ?? []), b]);
    neighbours.set(b, [...(neighbours.get(b) ?? []), a]);
  }
  const seen = new Set<number>();
  const found: number[][] = [];
  for (const start of neighbours.keys()) {
    if (seen.has(start)) continue;
    const ring: number[] = [];
    let current = start;
    let previous = -1;
    while (current !== undefined && !seen.has(current)) {
      seen.add(current);
      ring.push(current);
      const next = (neighbours.get(current) ?? []).find((n) => n !== previous && !seen.has(n));
      previous = current;
      current = next!;
    }
    found.push(ring);
  }
  return found;
}

/** Signed area, twice over. Sign tells you which way round the polygon goes. */
function signedArea(points: readonly Point2[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum;
}

describe('the faces', () => {
  it('are the icosahedron’s twenty', () => {
    expect(ICOSAHEDRON_FACES).toHaveLength(20);
  });

  it('put every edge on exactly two of them', () => {
    const count = new Map<string, number>();
    for (const [a, b, c] of ICOSAHEDRON_FACES) {
      for (const edge of [[a, b], [b, c], [a, c]] as Edge[]) {
        count.set(key(edge), (count.get(key(edge)) ?? 0) + 1);
      }
    }
    expect(count.size).toBe(30);
    for (const [edge, n] of count) {
      expect(n, `edge ${edge} borders ${n} faces, not two`).toBe(2);
    }
    // And they are the same thirty the solid already knows about.
    expect([...count.keys()].sort()).toEqual(ICOSAHEDRON_EDGES.map(key).sort());
  });

  it('put every vertex on exactly five', () => {
    const count = new Array<number>(12).fill(0);
    for (const face of ICOSAHEDRON_FACES) for (const v of face) count[v]! += 1;
    expect(count).toEqual(new Array(12).fill(5));
  });

  it('are triangles of genuinely adjacent vertices, not any three points', () => {
    const adjacent = new Set(ICOSAHEDRON_EDGES.map(key));
    for (const [a, b, c] of ICOSAHEDRON_FACES) {
      for (const edge of [[a, b], [b, c], [a, c]] as Edge[]) {
        expect(adjacent.has(key(edge)), `${key(edge)} is not an edge of the solid`).toBe(true);
      }
    }
  });

  it('are derived from the edge list, so a wrong vertex is the only way to be wrong', () => {
    expect(deriveFaces()).toEqual(ICOSAHEDRON_FACES);
    // Fewer edges, fewer triangles — nothing is hardcoded.
    expect(deriveFaces(12, ICOSAHEDRON_EDGES.slice(0, 10)).length).toBeLessThan(20);
  });
});

describe('which faces the camera can see', () => {
  it('sees about half of them, and never none or all', () => {
    for (const { rx, ry } of orientations(120)) {
      const visible = frontFaces(rotateAll(rx, ry)).filter(Boolean).length;
      expect(visible, `${visible} of 20 faces visible at ${rx},${ry}`).toBeGreaterThanOrEqual(6);
      expect(visible).toBeLessThanOrEqual(14);
    }
  });

  it('turning the solid right round shows every face at some point', () => {
    const everSeen = new Array<boolean>(20).fill(false);
    for (const { rx, ry } of orientations(200)) {
      frontFaces(rotateAll(rx, ry)).forEach((f, i) => {
        if (f) everSeen[i] = true;
      });
    }
    expect(everSeen.every(Boolean)).toBe(true);
  });
});

describe('the outline', () => {
  it('accounts for all thirty edges, every time', () => {
    for (const { rx, ry } of orientations(120)) {
      const { outline, creases, hidden } = partitionEdges(rotateAll(rx, ry));
      expect(outline.length + creases.length + hidden.length).toBe(30);
    }
  });

  it('is a single closed ring', () => {
    for (const { rx, ry } of orientations(120)) {
      const { outline } = partitionEdges(rotateAll(rx, ry));
      const found = rings(outline);
      expect(found, `outline broke into ${found.length} pieces at ${rx},${ry}`).toHaveLength(1);
      // Closed: every vertex on the ring has exactly two outline edges.
      const degree = new Map<number, number>();
      for (const [a, b] of outline) {
        degree.set(a, (degree.get(a) ?? 0) + 1);
        degree.set(b, (degree.get(b) ?? 0) + 1);
      }
      for (const [vertex, d] of degree) {
        expect(d, `vertex ${vertex} has ${d} outline edges`).toBe(2);
      }
      expect(found[0]!.length).toBe(degree.size);
    }
  });

  it('is convex on screen, and everything else projects inside it', () => {
    for (const { rx, ry } of orientations(120)) {
      const { points, hull } = silhouetteAt(rx, ry);
      const ring = hull.map((i) => points[i]!);
      expect(ring.length).toBeGreaterThanOrEqual(6);

      // Every turn goes the same way — the definition of convex.
      const sign = Math.sign(signedArea(ring));
      expect(sign).not.toBe(0);
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        const c = ring[(i + 2) % ring.length]!;
        const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
        expect(Math.sign(cross), `the outline turns back on itself at ${rx},${ry}`).toBe(sign);
      }

      // And no vertex escapes it.
      const inside = new Set(hull);
      for (let v = 0; v < points.length; v++) {
        if (inside.has(v)) continue;
        const p = points[v]!;
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i]!;
          const b = ring[(i + 1) % ring.length]!;
          const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
          expect(
            Math.sign(cross) === sign || Math.abs(cross) < 1e-9,
            `vertex ${v} sits outside the outline at ${rx},${ry}`,
          ).toBe(true);
        }
      }
    }
  });

  it('agrees with the 3D face partition — two routes, one polygon', () => {
    for (const { rx, ry } of orientations(120)) {
      const rotated = rotateAll(rx, ry);
      const { outline } = partitionEdges(rotated);
      const { hull } = silhouetteAt(rx, ry);

      // The hull drops points that sit exactly on one of its own sides, so it
      // is a subset of the ring rather than always equal to it. What must
      // hold is that it contains no vertex the outline does not.
      const onOutline = new Set(outline.flat());
      for (const v of hull) {
        expect(onOutline.has(v), `hull corner ${v} is not on the outline at ${rx},${ry}`).toBe(true);
      }
      // At a generic orientation nothing is collinear and the two agree exactly.
      expect(hull.length).toBeLessThanOrEqual(onOutline.size);
      expect(hull.length).toBeGreaterThanOrEqual(6);
    }
  });

  it('never draws a crease that runs along the outline', () => {
    for (const { rx, ry } of orientations(60)) {
      const { outline, creases } = partitionEdges(rotateAll(rx, ry));
      const edge = new Set(outline.map(key));
      for (const crease of creases) {
        expect(edge.has(key(crease)), `${key(crease)} is both a crease and the outline`).toBe(false);
      }
    }
  });
});

describe('convexHull', () => {
  it('keeps the corners of a square and drops what is inside it', () => {
    const square: Point2[] = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
      { x: 1, y: 1 },
    ];
    expect([...convexHull(square)].sort()).toEqual([0, 1, 2, 3]);
  });

  it('drops a point lying exactly on a side', () => {
    const withMidpoint: Point2[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 2 },
    ];
    expect([...convexHull(withMidpoint)].sort()).toEqual([0, 2, 3]);
  });

  it('hands back everything it was given when there is no hull to find', () => {
    expect(convexHull([])).toEqual([]);
    expect(convexHull([{ x: 1, y: 1 }])).toEqual([0]);
    expect(convexHull([{ x: 1, y: 1 }, { x: 2, y: 2 }])).toEqual([0, 1]);
  });
});

describe('facets too foreshortened to see', () => {
  it('are dropped, and only the creases change', () => {
    for (const { rx, ry } of orientations(60)) {
      const all = silhouetteAt(rx, ry);
      const culled = silhouetteAt(rx, ry, { minFacet: 0.04 });
      expect(culled.points).toEqual(all.points);
      expect(culled.hull).toEqual(all.hull);
      expect(culled.creases.length).toBeLessThanOrEqual(all.creases.length);
      const kept = new Set(culled.creases.map(key));
      for (const crease of culled.creases) {
        expect(all.creases.map(key)).toContain(key(crease));
      }
      expect(kept.size).toBe(culled.creases.length);
    }
  });

  it('drops more as the threshold rises, and everything at 1', () => {
    const counts = [0, 0.02, 0.05, 0.1, 1].map(
      (minFacet) => silhouetteAt(-0.3, 0.62, { minFacet }).creases.length,
    );
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    expect(counts[0]).toBeGreaterThan(0);
    expect(counts.at(-1)).toBe(0);
  });

  it('leaves the default alone — nothing is culled unless it is asked for', () => {
    expect(silhouetteAt(-0.3, 0.62, {})).toEqual(silhouetteAt(-0.3, 0.62));
    expect(silhouetteAt(-0.3, 0.62, { minFacet: 0 })).toEqual(silhouetteAt(-0.3, 0.62));
  });

  it('measures a polygon the way a polygon is measured', () => {
    expect(
      polygonArea([
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
        { x: 0, y: 3 },
      ]),
    ).toBeCloseTo(12, 12);
    // Wound the other way, the same area.
    expect(
      polygonArea([
        { x: 0, y: 3 },
        { x: 4, y: 3 },
        { x: 4, y: 0 },
        { x: 0, y: 0 },
      ]),
    ).toBeCloseTo(12, 12);
  });
});

describe('silhouetteAt', () => {
  it('projects all twelve vertices, in the solid’s own order', () => {
    const { points } = silhouetteAt(0.2, 0.3);
    expect(points).toHaveLength(12);
    const rotated = rotateAll(0.2, 0.3);
    points.forEach((p, i) => {
      expect(p.x).toBeCloseTo(rotated[i]!.x, 12);
      // y is flipped exactly once, for SVG's downward axis.
      expect(p.y).toBeCloseTo(-rotated[i]!.y, 12);
    });
  });

  it('is pure — same angle, same frame, no shared mutable state', () => {
    const a = silhouetteAt(0.4, 1.1);
    const b = silhouetteAt(0.4, 1.1);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });

  it('gains and loses corners as it turns, which is the only depth cue it has', () => {
    const counts = new Set(orientations(200).map(({ rx, ry }) => silhouetteAt(rx, ry).hull.length));
    expect(counts.size, 'the outline never changed shape across a full turn').toBeGreaterThan(1);
  });
});
