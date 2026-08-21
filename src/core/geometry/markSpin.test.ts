import { describe, it, expect } from 'vitest';
import { ICOSAHEDRON_VERTICES } from './icosahedron';
import {
  MARK_STATIC_ANGLE,
  MARK_SPIN_MS,
  MARK_VIEWBOX,
  NODE_GRADIENT,
  markFrame,
  projectMark,
  spinAngleAt,
} from './markSpin';

/**
 * The shipped static mark, transcribed from `../modelcitizen/public/mark.svg`
 * by V1.1's `BrandMark` and kept here as a fixture.
 *
 * This is the load-bearing test in the file. VB-13 promises a reduced-motion
 * user "exactly today's static mark". The way that promise is kept is by the
 * still pose being a real frame of the rotation rather than a second drawing —
 * so if `markFrame(MARK_STATIC_ANGLE)` ever stops matching these numbers, the
 * promise is broken and this fails.
 *
 * [x1, y1, x2, y2, strokeWidth, strokeOpacity].
 */
const EXPORTED_EDGES: readonly (readonly [number, number, number, number, number, number])[] = [
  [72.93, 44.18, 167.07, 34.04, 3.96, 0.69],
  [72.93, 44.18, 153.91, 88.43, 4.51, 0.83],
  [72.93, 44.18, 86.09, 51.58, 3.57, 0.59],
  [72.93, 44.18, 22.89, 116.82, 3.88, 0.67],
  [72.93, 44.18, 64.8, 139.59, 4.46, 0.81],
  [167.07, 34.04, 153.91, 88.43, 4.25, 0.76],
  [167.07, 34.04, 86.09, 51.58, 3.31, 0.53],
  [167.07, 34.04, 175.2, 100.41, 3.2, 0.5],
  [167.07, 34.04, 217.11, 123.18, 3.78, 0.65],
  [72.93, 205.96, 167.07, 195.82, 3.44, 0.56],
  [72.93, 205.96, 153.91, 188.42, 4.09, 0.72],
  [72.93, 205.96, 86.09, 151.57, 3.15, 0.49],
  [72.93, 205.96, 22.89, 116.82, 3.62, 0.6],
  [72.93, 205.96, 64.8, 139.59, 4.2, 0.75],
  [167.07, 195.82, 153.91, 188.42, 3.83, 0.66],
  [167.07, 195.82, 86.09, 151.57, 2.89, 0.42],
  [167.07, 195.82, 175.2, 100.41, 2.94, 0.44],
  [167.07, 195.82, 217.11, 123.18, 3.52, 0.58],
  [153.91, 188.42, 153.91, 88.43, 4.64, 0.86],
  [153.91, 188.42, 217.11, 123.18, 4.17, 0.74],
  [153.91, 188.42, 64.8, 139.59, 4.59, 0.85],
  [153.91, 88.43, 217.11, 123.18, 4.33, 0.78],
  [153.91, 88.43, 64.8, 139.59, 4.75, 0.89],
  [86.09, 151.57, 86.09, 51.58, 2.76, 0.39],
  [86.09, 151.57, 175.2, 100.41, 2.65, 0.36],
  [86.09, 151.57, 22.89, 116.82, 3.07, 0.47],
  [86.09, 51.58, 175.2, 100.41, 2.81, 0.4],
  [86.09, 51.58, 22.89, 116.82, 3.23, 0.51],
  [175.2, 100.41, 217.11, 123.18, 3.28, 0.52],
  [22.89, 116.82, 64.8, 139.59, 4.12, 0.73],
];

/** [cx, cy, r, gradient], in the export's paint order — furthest first. */
const EXPORTED_NODES: readonly (readonly [number, number, number, number])[] = [
  [86.09, 151.57, 6.5, 2],
  [175.2, 100.41, 6.73, 4],
  [86.09, 51.58, 7.22, 3],
  [167.07, 195.82, 7.83, 4],
  [22.89, 116.82, 8.63, 1],
  [167.07, 34.04, 9.0, 2],
  [72.93, 205.96, 9.0, 3],
  [217.11, 123.18, 9.37, 5],
  [72.93, 44.18, 10.17, 1],
  [153.91, 188.42, 10.78, 5],
  [64.8, 139.59, 11.27, 2],
  [153.91, 88.43, 11.5, 1],
];

/**
 * An edge, to the precision the export was written at, with its two ends in a
 * fixed order.
 *
 * Compared as a set rather than in sequence because edge paint order is not
 * observable here: every edge is stroked in the one `--brand-edge` colour, and
 * compositing a single colour at differing alphas gives the same result in any
 * order. Node order *is* observable — five gradients, opaque fills — and is
 * asserted in sequence below.
 */
const edgeKey = (x1: number, y1: number, x2: number, y2: number, w: number, o: number) => {
  const a = `${x1.toFixed(1)},${y1.toFixed(1)}`;
  const b = `${x2.toFixed(1)},${y2.toFixed(1)}`;
  const ends = a < b ? `${a}|${b}` : `${b}|${a}`;
  return `${ends}|${w.toFixed(1)}|${o.toFixed(2)}`;
};

describe('markFrame — fidelity to the shipped mark', () => {
  it('is the shipped static mark, edge for edge, at the export’s own angle', () => {
    const { edges } = markFrame(MARK_STATIC_ANGLE);
    expect(edges).toHaveLength(EXPORTED_EDGES.length);
    const drawn = new Set(edges.map((e) => edgeKey(e.x1, e.y1, e.x2, e.y2, e.width, e.opacity)));
    expect(drawn.size).toBe(30); // no edge drawn twice
    for (const [x1, y1, x2, y2, w, o] of EXPORTED_EDGES) {
      const wanted = edgeKey(x1, y1, x2, y2, w, o);
      expect(drawn.has(wanted), `the export's edge ${wanted} is not drawn`).toBe(true);
    }
  });

  it('is the shipped static mark, node for node, colour for colour, in the same paint order', () => {
    const { nodes } = markFrame(MARK_STATIC_ANGLE);
    expect(nodes).toHaveLength(EXPORTED_NODES.length);
    nodes.forEach((n, i) => {
      const [cx, cy, r, gradient] = EXPORTED_NODES[i]!;
      // Within half of the export's own last printed digit.
      expect(n.cx, `node ${i} cx`).toBeCloseTo(cx, 1);
      expect(n.cy, `node ${i} cy`).toBeCloseTo(cy, 1);
      expect(n.r, `node ${i} r`).toBeCloseTo(r, 1);
      expect(n.gradient, `node ${i} gradient`).toBe(gradient);
    });
  });

  it('gives every vertex a real gradient — the degrade-to-one fallback is never reached', () => {
    expect(NODE_GRADIENT).toHaveLength(ICOSAHEDRON_VERTICES.length);
    // The export uses all five, and uses each of them more than once. If the
    // vertex list upstream were ever reordered or rescaled, the position
    // lookup would miss and every node would collapse to gradient 1 — this is
    // the assertion that catches it.
    const used = new Map<number, number>();
    for (const g of NODE_GRADIENT) used.set(g, (used.get(g) ?? 0) + 1);
    expect([...used.keys()].sort()).toEqual([1, 2, 3, 4, 5]);
    for (const [g, count] of used) expect(count, `gradient ${g} used once only`).toBeGreaterThan(1);
  });
});

describe('markFrame — as it turns', () => {
  it('a full turn returns every vertex to where it started', () => {
    const start = projectMark(0);
    const round = projectMark(Math.PI * 2);
    round.forEach((v, i) => {
      expect(v.x).toBeCloseTo(start[i]!.x, 9);
      expect(v.y).toBeCloseTo(start[i]!.y, 9);
      expect(v.depth).toBeCloseTo(start[i]!.depth, 9);
    });
  });

  it('actually moves the vertices — a quarter turn is not a no-op', () => {
    const start = projectMark(0);
    const quarter = projectMark(Math.PI / 2);
    const moved = quarter.filter((v, i) => Math.abs(v.x - start[i]!.x) > 1);
    expect(moved.length).toBeGreaterThan(8);
  });

  it('keeps the near–far contrast constant: depth spans 0..1 at every angle', () => {
    for (let i = 0; i < 64; i++) {
      const depths = projectMark((i / 64) * Math.PI * 2).map((v) => v.depth);
      expect(Math.min(...depths)).toBe(0);
      expect(Math.max(...depths)).toBe(1);
    }
  });

  it('paints nodes furthest-first at every angle, so near ones always overlap far ones', () => {
    for (let i = 0; i < 48; i++) {
      const radii = markFrame((i / 48) * Math.PI * 2).nodes.map((n) => n.r);
      expect(radii).toEqual([...radii].sort((a, b) => a - b));
    }
  });

  it('keeps a vertex’s colour with the vertex as it turns', () => {
    const at = (angle: number) => new Map(markFrame(angle).nodes.map((n) => [n.vertex, n.gradient]));
    const first = at(0);
    for (let i = 1; i < 24; i++) {
      expect(at((i / 24) * Math.PI * 2)).toEqual(first);
    }
  });

  it('never draws outside its own viewBox', () => {
    for (let i = 0; i < 48; i++) {
      for (const n of markFrame((i / 48) * Math.PI * 2).nodes) {
        expect(n.cx - n.r).toBeGreaterThanOrEqual(0);
        expect(n.cy - n.r).toBeGreaterThanOrEqual(0);
        expect(n.cx + n.r).toBeLessThanOrEqual(MARK_VIEWBOX);
        expect(n.cy + n.r).toBeLessThanOrEqual(MARK_VIEWBOX);
      }
    }
  });

  it('always joins edges to real nodes — no line left floating off a vertex', () => {
    for (const angle of [0, 1, 2.5, 4, MARK_STATIC_ANGLE]) {
      const { edges, nodes } = markFrame(angle);
      const positions = new Set(nodes.map((n) => `${n.cx},${n.cy}`));
      for (const e of edges) {
        expect(positions.has(`${e.x1},${e.y1}`)).toBe(true);
        expect(positions.has(`${e.x2},${e.y2}`)).toBe(true);
      }
    }
  });

  it('always draws thirty edges and twelve nodes, whatever the angle', () => {
    for (let i = 0; i < 32; i++) {
      const frame = markFrame((i / 32) * Math.PI * 2);
      expect(frame.edges).toHaveLength(30);
      expect(frame.nodes).toHaveLength(12);
    }
  });
});

describe('spinAngleAt', () => {
  it('is phase-continuous on an absolute clock — a remount cannot restart it', () => {
    // The status-bar mark is remounted on every question. Two components
    // sampling the same instant must agree on the pose, or the mark jumps.
    expect(spinAngleAt(1_234_567.5)).toBe(spinAngleAt(1_234_567.5));
    expect(spinAngleAt(4000)).toBeCloseTo(spinAngleAt(4000 + MARK_SPIN_MS), 9);
  });

  it('covers exactly one revolution per period, in order', () => {
    expect(spinAngleAt(0)).toBe(0);
    expect(spinAngleAt(MARK_SPIN_MS / 4)).toBeCloseTo(Math.PI / 2, 9);
    expect(spinAngleAt(MARK_SPIN_MS / 2)).toBeCloseTo(Math.PI, 9);
    expect(spinAngleAt(MARK_SPIN_MS)).toBeCloseTo(0, 9);
  });

  it('stays inside one turn for any timestamp, however large', () => {
    for (const t of [0, 17, 9999, 1e9, 1e12]) {
      const a = spinAngleAt(t);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(Math.PI * 2);
    }
  });

  it('refuses to divide by a zero period', () => {
    expect(spinAngleAt(500, 0)).toBe(0);
  });
});
