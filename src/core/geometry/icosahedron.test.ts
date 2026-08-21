import { describe, it, expect } from 'vitest';
import {
  CAMERA,
  ICOSAHEDRON_EDGES,
  ICOSAHEDRON_VERTICES,
  MAX_TILT,
  PHI,
  clampTilt,
  depth,
  deriveEdges,
  faceRotation,
  paintOrder,
  project,
  rotate,
  shortestTurn,
  squaredDistance,
  vertexDegrees,
} from './icosahedron';
import type { Vec3 } from './icosahedron';

/**
 * V1.2 VB-14a. The globe is a picture, and a picture cannot be reviewed in a
 * diff — but the solid underneath it has a structural signature that no typo
 * survives. Thirty edges, five at every vertex, rotation that preserves every
 * distance, projection that grows monotonically as things come towards you.
 * Any one coordinate mistyped breaks at least two of these.
 */
describe('the solid', () => {
  it('has twelve vertices, every coordinate 0, ±1 or ±PHI', () => {
    expect(ICOSAHEDRON_VERTICES).toHaveLength(12);
    for (const v of ICOSAHEDRON_VERTICES) {
      for (const c of [v.x, v.y, v.z]) {
        expect([0, 1, -1, PHI, -PHI]).toContain(c);
      }
    }
  });

  it('is the three cyclic permutations of (0, ±1, ±PHI), with no vertex repeated', () => {
    const keys = new Set(ICOSAHEDRON_VERTICES.map((v) => `${v.x},${v.y},${v.z}`));
    expect(keys.size).toBe(12);
    // Four vertices lie in each of the three coordinate planes.
    const inPlane = (pick: (v: Vec3) => number) => ICOSAHEDRON_VERTICES.filter((v) => pick(v) === 0).length;
    expect(inPlane((v) => v.x)).toBe(4);
    expect(inPlane((v) => v.y)).toBe(4);
    expect(inPlane((v) => v.z)).toBe(4);
  });

  it('every vertex sits on one sphere — the circumradius is sqrt(1 + PHI²)', () => {
    const expected = Math.sqrt(1 + PHI * PHI);
    for (const v of ICOSAHEDRON_VERTICES) {
      expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(expected, 12);
    }
  });

  it('derives exactly thirty edges', () => {
    expect(ICOSAHEDRON_EDGES).toHaveLength(30);
  });

  it('gives every vertex exactly five neighbours', () => {
    const degrees = vertexDegrees();
    expect(degrees).toHaveLength(12);
    for (const [i, degree] of degrees.entries()) {
      expect(degree, `vertex ${i} has ${degree} edges, not five`).toBe(5);
    }
  });

  it('lists each edge once, low index first, with no vertex joined to itself', () => {
    const seen = new Set<string>();
    for (const [a, b] of ICOSAHEDRON_EDGES) {
      expect(a).toBeLessThan(b);
      const key = `${a}-${b}`;
      expect(seen.has(key), `edge ${key} listed twice`).toBe(false);
      seen.add(key);
    }
  });

  it('every edge is the same length, and every non-edge is clearly longer', () => {
    const edgeKeys = new Set(ICOSAHEDRON_EDGES.map(([a, b]) => `${a}-${b}`));
    for (let a = 0; a < 12; a++) {
      for (let b = a + 1; b < 12; b++) {
        const d2 = squaredDistance(ICOSAHEDRON_VERTICES[a]!, ICOSAHEDRON_VERTICES[b]!);
        if (edgeKeys.has(`${a}-${b}`)) expect(d2).toBeCloseTo(4, 12);
        // The next shell out is at 4·PHI² ≈ 10.47 — nowhere near the epsilon.
        else expect(d2).toBeGreaterThan(9);
      }
    }
  });

  it('a single mistyped coordinate breaks the signature — the test would have caught it', () => {
    const broken = ICOSAHEDRON_VERTICES.map((v, i) => (i === 3 ? { ...v, y: -1.1 } : v));
    const edges = deriveEdges(broken);
    const degrees = vertexDegrees(12, edges);
    expect(edges.length === 30 && degrees.every((d) => d === 5)).toBe(false);
  });
});

describe('rotate', () => {
  const ANGLES: Array<[number, number]> = [
    [0, 0],
    [0.4, 0],
    [0, 1.9],
    [-1.2, 2.7],
    [0.83, -4.1],
  ];

  it('is an isometry — every pairwise distance survives every rotation', () => {
    for (const [rx, ry] of ANGLES) {
      const turned = ICOSAHEDRON_VERTICES.map((v) => rotate(v, rx, ry));
      for (let a = 0; a < 12; a++) {
        for (let b = a + 1; b < 12; b++) {
          expect(squaredDistance(turned[a]!, turned[b]!)).toBeCloseTo(
            squaredDistance(ICOSAHEDRON_VERTICES[a]!, ICOSAHEDRON_VERTICES[b]!),
            10,
          );
        }
      }
    }
  });

  it('preserves length, so the solid never inflates or shrinks as it turns', () => {
    const r = Math.sqrt(1 + PHI * PHI);
    for (const [rx, ry] of ANGLES) {
      for (const v of ICOSAHEDRON_VERTICES) {
        const t = rotate(v, rx, ry);
        expect(Math.hypot(t.x, t.y, t.z)).toBeCloseTo(r, 10);
      }
    }
  });

  it('at zero angles it is the identity', () => {
    for (const v of ICOSAHEDRON_VERTICES) {
      const t = rotate(v, 0, 0);
      expect(t.x).toBeCloseTo(v.x, 12);
      expect(t.y).toBeCloseTo(v.y, 12);
      expect(t.z).toBeCloseTo(v.z, 12);
    }
  });

  it('spins about y first and tilts about x second — the order the mark uses', () => {
    const v: Vec3 = { x: 1, y: 0, z: 0 };
    // A quarter turn about y takes +x to -z; the following tilt then moves
    // that z into y. Doing it the other way round would leave y at zero.
    const t = rotate(v, Math.PI / 2, Math.PI / 2);
    expect(t.x).toBeCloseTo(0, 12);
    expect(t.y).toBeCloseTo(1, 12);
    expect(t.z).toBeCloseTo(0, 12);
  });

  it('a full turn about either axis comes back to where it started', () => {
    const tau = Math.PI * 2;
    for (const v of ICOSAHEDRON_VERTICES) {
      const spun = rotate(v, 0, tau);
      const tilted = rotate(v, tau, 0);
      for (const t of [spun, tilted]) {
        expect(t.x).toBeCloseTo(v.x, 10);
        expect(t.y).toBeCloseTo(v.y, 10);
        expect(t.z).toBeCloseTo(v.z, 10);
      }
    }
  });
});

describe('project', () => {
  it('is monotonic in z — nearer is always bigger', () => {
    let previous = -Infinity;
    for (let z = -PHI; z <= PHI + 1e-9; z += PHI / 20) {
      const { scale } = project({ x: 1, y: 1, z });
      expect(scale).toBeGreaterThan(previous);
      previous = scale;
    }
  });

  it('uses the camera the prototype chose: scale = CAM / (CAM - z / PHI * 0.9)', () => {
    for (const z of [-PHI, -1, 0, 1, PHI]) {
      const { scale } = project({ x: 0, y: 0, z });
      expect(scale).toBeCloseTo(CAMERA / (CAMERA - (z / PHI) * 0.9), 12);
    }
  });

  it('leaves the plane through the origin untouched', () => {
    const p = project({ x: 3, y: -2, z: 0 });
    expect(p.scale).toBeCloseTo(1, 12);
    expect(p.x).toBeCloseTo(3, 12);
    expect(p.y).toBeCloseTo(-2, 12);
  });

  it('pushing the camera in exaggerates the depth spread', () => {
    const wide = project({ x: 1, y: 0, z: PHI }, CAMERA).scale / project({ x: 1, y: 0, z: -PHI }, CAMERA).scale;
    const close = project({ x: 1, y: 0, z: PHI }, 3.1).scale / project({ x: 1, y: 0, z: -PHI }, 3.1).scale;
    expect(close).toBeGreaterThan(wide);
  });

  it('never divides by zero for any point on the solid, at any camera it uses', () => {
    for (const camera of [CAMERA, 3.1, 2.5]) {
      for (const v of ICOSAHEDRON_VERTICES) {
        for (const [rx, ry] of [
          [0, 0],
          [1.2, 2.2],
          [-1.2, 5],
        ]) {
          const { scale } = project(rotate(v, rx!, ry!), camera);
          expect(Number.isFinite(scale)).toBe(true);
          expect(scale).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('depth', () => {
  it('maps the back of the solid to 0 and the front to 1', () => {
    expect(depth(-PHI)).toBeCloseTo(0, 12);
    expect(depth(PHI)).toBeCloseTo(1, 12);
    expect(depth(0)).toBeCloseTo(0.5, 12);
  });

  it('is monotonic', () => {
    let previous = -1;
    for (let z = -2; z <= 2; z += 0.05) {
      const t = depth(z);
      expect(t).toBeGreaterThanOrEqual(previous);
      previous = t;
    }
  });

  it('clamps, because the circumradius is larger than PHI', () => {
    expect(Math.sqrt(1 + PHI * PHI)).toBeGreaterThan(PHI);
    expect(depth(1.902)).toBe(1);
    expect(depth(-1.902)).toBe(0);
  });
});

describe('paintOrder', () => {
  it('orders back to front, so drawing in sequence puts near over far', () => {
    const points: Vec3[] = [
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: -1 },
      { x: 0, y: 0, z: 0 },
    ];
    expect(paintOrder(points)).toEqual([1, 2, 0]);
  });

  it('covers every index exactly once', () => {
    const turned = ICOSAHEDRON_VERTICES.map((v) => rotate(v, 0.3, 1.1));
    const order = paintOrder(turned);
    expect([...order].sort((a, b) => a - b)).toEqual([...Array(12).keys()]);
  });

  it('is stable for ties, so a resting pose does not flicker between frames', () => {
    const flat: Vec3[] = [
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 3, y: 0, z: 0 },
    ];
    expect(paintOrder(flat)).toEqual([0, 1, 2]);
  });
});

describe('clampTilt', () => {
  it('holds the globe inside ±1.2 radians so it cannot tumble past a pole', () => {
    expect(MAX_TILT).toBe(1.2);
    expect(clampTilt(4)).toBe(1.2);
    expect(clampTilt(-4)).toBe(-1.2);
    expect(clampTilt(0.6)).toBe(0.6);
  });
});

describe('faceRotation', () => {
  it('brings any vertex to the front — maximum z, dead centre of the screen', () => {
    const r = Math.sqrt(1 + PHI * PHI);
    for (const v of ICOSAHEDRON_VERTICES) {
      const { rx, ry } = faceRotation(v);
      const faced = rotate(v, rx, ry);
      expect(faced.z).toBeCloseTo(r, 10);
      expect(faced.x).toBeCloseTo(0, 10);
      expect(faced.y).toBeCloseTo(0, 10);
      expect(depth(faced.z)).toBe(1);
    }
  });

  it('never needs a tilt the clamp would refuse', () => {
    for (const v of ICOSAHEDRON_VERTICES) {
      expect(Math.abs(faceRotation(v).rx)).toBeLessThan(MAX_TILT);
    }
  });

  it('leaves every other vertex somewhere it can still be seen or reached', () => {
    // Facing one node must not collapse the rest onto it: the solid still has
    // its full extent, so nothing is hidden behind the node in front.
    for (const v of ICOSAHEDRON_VERTICES) {
      const { rx, ry } = faceRotation(v);
      const spread = ICOSAHEDRON_VERTICES.map((other) => rotate(other, rx, ry));
      const distinct = new Set(spread.map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`));
      expect(distinct.size).toBeGreaterThan(6);
    }
  });
});

describe('shortestTurn', () => {
  it('takes the short way round', () => {
    const tau = Math.PI * 2;
    expect(shortestTurn(0.1, tau - 0.1)).toBeCloseTo(-0.2, 12);
    expect(shortestTurn(tau - 0.1, 0.1)).toBeCloseTo(0.2, 12);
    expect(shortestTurn(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2, 12);
  });

  it('never asks for more than half a turn', () => {
    for (let a = -10; a < 10; a += 0.37) {
      for (let b = -10; b < 10; b += 0.53) {
        expect(Math.abs(shortestTurn(a, b))).toBeLessThanOrEqual(Math.PI + 1e-12);
      }
    }
  });
});
