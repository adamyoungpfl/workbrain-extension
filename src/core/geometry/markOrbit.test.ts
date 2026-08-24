import { describe, expect, it } from 'vitest';
import {
  ORBIT_EXTENT,
  ORBIT_PERIOD_MS,
  ORBIT_RADIUS,
  ORBIT_SCALE,
  ORBIT_STILL,
  ORBIT_VIEWS,
  orbitFrame,
  orbitViewAt,
  projectOrbit,
} from './markOrbit';
import { MARK_RADIUS, MARK_STATIC_ANGLE, MARK_TILT, MARK_VIEWBOX, markFrame } from './markSpin';
import { ICOSAHEDRON_EDGES, ICOSAHEDRON_VERTICES, PHI } from './icosahedron';

/**
 * V1.7 VB-34. The splash's camera path, tested as arithmetic — which is the
 * point of it being in core/ at all.
 *
 * Three of VB-34's accept criteria are claims about this file and nothing
 * else: that the loop has no seam, that the motion is a drift rather than a
 * spin, and that the reduced-motion still frame carries the same picture.
 * The e2e spec can show the splash appears and can be skipped; only this can
 * show the *path* is right, at every moment rather than at the handful a
 * screenshot catches.
 */

const TAU = Math.PI * 2;

/** Dense enough to be about one sample per frame of the real loop. */
const SAMPLES = 1440;
const at = (s: number) => orbitViewAt((s / SAMPLES) * ORBIT_PERIOD_MS);

describe('the path visits the viewpoints it says it does', () => {
  it('starts on the logo — the pose mark.svg was exported at', () => {
    const first = ORBIT_VIEWS[0]!;
    expect(first.yaw).toBe(MARK_STATIC_ANGLE);
    expect(first.pitch).toBe(MARK_TILT);
  });

  it('lands exactly on each viewpoint, at even shares of the loop', () => {
    ORBIT_VIEWS.forEach((view, i) => {
      const t = (i / ORBIT_VIEWS.length) * ORBIT_PERIOD_MS;
      expect(orbitViewAt(t)).toEqual(view);
    });
  });

  it('turns exactly one full revolution per loop, so the yaw wraps cleanly', () => {
    const start = orbitViewAt(0).yaw;
    // Just short of the wrap, so this reads the fourth segment rather than
    // the next loop's first.
    const end = orbitViewAt(ORBIT_PERIOD_MS - 1e-9).yaw;
    expect(end - start).toBeCloseTo(TAU, 6);
  });

  it('never puts the camera anywhere the projection blows up', () => {
    // `project` divides by camera - (z / PHI) * 0.9, and the solid's
    // circumradius makes that subtrahend as large as this.
    const worst = (Math.hypot(1, PHI) / PHI) * 0.9;
    for (let s = 0; s < SAMPLES; s++) {
      expect(at(s).camera).toBeGreaterThan(worst * 2);
    }
  });

  it('keeps the pitch well clear of the poles', () => {
    for (let s = 0; s < SAMPLES; s++) {
      expect(Math.abs(at(s).pitch)).toBeLessThan(0.8);
    }
  });
});

describe('the loop has no seam', () => {
  it('is the same picture one whole loop later', () => {
    for (const t of [0, 137, 2250, 4500, 8999]) {
      expect(orbitFrame(orbitViewAt(t + ORBIT_PERIOD_MS))).toEqual(orbitFrame(orbitViewAt(t)));
    }
  });

  it('the wrap moves the mark no further than any other step does', () => {
    /** How far the furthest node travels between two consecutive samples. */
    const step = (a: number, b: number) => {
      const fa = orbitFrame(orbitViewAt(a)).nodes;
      const fb = orbitFrame(orbitViewAt(b)).nodes;
      // Nodes are sorted by depth, so compare by vertex identity, not slot.
      const byVertex = new Map(fb.map((n) => [n.vertex, n]));
      let max = 0;
      for (const n of fa) {
        const m = byVertex.get(n.vertex)!;
        max = Math.max(max, Math.hypot(m.cx - n.cx, m.cy - n.cy));
      }
      return max;
    };

    const dt = ORBIT_PERIOD_MS / SAMPLES;
    let biggestOrdinary = 0;
    for (let s = 0; s < SAMPLES; s++) {
      const a = s * dt;
      // Skip the two steps that straddle the wrap; they are measured below.
      if (s !== SAMPLES - 1) biggestOrdinary = Math.max(biggestOrdinary, step(a, a + dt));
    }

    const acrossTheWrap = step(ORBIT_PERIOD_MS - dt / 2, ORBIT_PERIOD_MS + dt / 2);
    // Not "small" — smaller than the biggest step the loop takes anywhere
    // else. A seam is a step out of scale with its neighbours, and there
    // isn't one. It is in fact tiny, because the easing curve rests at every
    // viewpoint and the wrap is a viewpoint.
    expect(acrossTheWrap).toBeLessThan(biggestOrdinary);
  });

  it('comes to rest at the wrap exactly as it does at every other viewpoint', () => {
    const dt = ORBIT_PERIOD_MS / SAMPLES;
    const speed = (t: number) => Math.abs(orbitViewAt(t + dt).yaw - orbitViewAt(t).yaw);
    const segment = ORBIT_PERIOD_MS / ORBIT_VIEWS.length;

    // At each viewpoint, including the wrap at t = 0 / t = period.
    const atRest = ORBIT_VIEWS.map((_, i) => speed(i * segment));
    // Mid-segment, where the camera is actually travelling.
    const moving = ORBIT_VIEWS.map((_, i) => speed(i * segment + segment / 2));

    for (const r of atRest) {
      for (const m of moving) {
        expect(r).toBeLessThan(m / 10);
      }
    }
  });
});

describe('it drifts — it is not a spin', () => {
  it('the yaw speed varies by more than an order of magnitude', () => {
    const dt = ORBIT_PERIOD_MS / SAMPLES;
    const speeds: number[] = [];
    for (let s = 0; s < SAMPLES; s++) {
      const t = s * dt;
      speeds.push(Math.abs(orbitViewAt(t + dt).yaw - orbitViewAt(t).yaw));
    }
    const fastest = Math.max(...speeds);
    const slowest = Math.min(...speeds);
    // A constant-speed spin would put this ratio at 1.
    expect(fastest / slowest).toBeGreaterThan(10);
  });

  it('changes perspective, not only orientation', () => {
    const gains: number[] = [];
    for (let s = 0; s < SAMPLES; s++) {
      for (const p of projectOrbit(at(s))) gains.push(p.gain!);
    }
    // The near-to-far size ratio the camera itself produces. Under an
    // orthographic camera — markSpin's — every one of these would be 1.
    expect(Math.max(...gains) / Math.min(...gains)).toBeGreaterThan(1.5);
  });

  it('moves the camera off the one axis markSpin turns on', () => {
    const pitches = new Set<number>();
    for (let s = 0; s < SAMPLES; s++) pitches.add(Math.round(at(s).pitch * 1e6));
    expect(pitches.size).toBeGreaterThan(SAMPLES / 2);
  });
});

describe('the drawing stays inside its own viewBox', () => {
  it('every node, circle included, at every moment of the loop', () => {
    for (let s = 0; s < SAMPLES; s++) {
      for (const n of orbitFrame(at(s)).nodes) {
        expect(n.cx - n.r).toBeGreaterThan(0);
        expect(n.cy - n.r).toBeGreaterThan(0);
        expect(n.cx + n.r).toBeLessThan(MARK_VIEWBOX);
        expect(n.cy + n.r).toBeLessThan(MARK_VIEWBOX);
      }
    }
  });

  it('the fit is measured from the path, not guessed', () => {
    // Re-derived here at a different sample count than the module used. If
    // ORBIT_SCALE were a hand-tuned number this would not agree.
    let max = 0;
    for (let s = 0; s < SAMPLES; s++) {
      for (const p of projectOrbit(at(s))) {
        max = Math.max(max, Math.hypot(p.x - MARK_VIEWBOX / 2, p.y - MARK_VIEWBOX / 2));
      }
    }
    expect(max).toBeCloseTo(ORBIT_RADIUS, 1);
    expect(ORBIT_SCALE).toBeCloseTo(ORBIT_RADIUS / ORBIT_EXTENT, 12);
  });
});

describe('it is the same solid, drawn the same way', () => {
  it('twelve nodes and thirty edges, at every moment', () => {
    for (let s = 0; s < SAMPLES; s += 7) {
      const frame = orbitFrame(at(s));
      expect(frame.nodes).toHaveLength(ICOSAHEDRON_VERTICES.length);
      expect(frame.edges).toHaveLength(ICOSAHEDRON_EDGES.length);
    }
  });

  it('keeps each vertex on its own brand gradient, however the camera moves', () => {
    const still = markFrame(MARK_STATIC_ANGLE);
    const expected = new Map(still.nodes.map((n) => [n.vertex, n.gradient]));
    for (let s = 0; s < SAMPLES; s += 11) {
      for (const n of orbitFrame(at(s)).nodes) {
        expect(n.gradient).toBe(expected.get(n.vertex));
      }
    }
  });

  it('paints furthest first, so near nodes cover far ones', () => {
    for (let s = 0; s < SAMPLES; s += 13) {
      const view = at(s);
      const depths = projectOrbit(view).map((p) => p.depth);
      const order = orbitFrame(view).nodes.map((n) => depths[n.vertex]!);
      for (let i = 1; i < order.length; i++) {
        expect(order[i]!).toBeGreaterThanOrEqual(order[i - 1]!);
      }
    }
  });
});

describe('the still frame reduced motion gets', () => {
  it('is a real frame of the path, not a fifth drawing', () => {
    expect(ORBIT_STILL).toEqual(orbitFrame(orbitViewAt(0)));
    expect(ORBIT_STILL).toEqual(orbitFrame(orbitViewAt(ORBIT_PERIOD_MS)));
  });

  it('is the whole mark — every node and every edge', () => {
    expect(ORBIT_STILL.nodes).toHaveLength(12);
    expect(ORBIT_STILL.edges).toHaveLength(30);
  });

  it('is recognisably the pose the logo ships at', () => {
    // The same viewpoint as mark.svg, and the check has to allow for the two
    // ways this camera differs from that one: it frames to ORBIT_RADIUS
    // rather than MARK_RADIUS, and it has perspective where the export has
    // none. Normalise the framing, and what is left is the lens — under 12
    // viewBox units out of 240 at the very worst node. Rotate the solid to
    // any other viewpoint and this is off by fifty or more, so it is a real
    // assertion that the still frame is the logo's own pose.
    const shipped = new Map(markFrame(MARK_STATIC_ANGLE).nodes.map((n) => [n.vertex, n]));
    const k = ORBIT_RADIUS / MARK_RADIUS;
    const c = MARK_VIEWBOX / 2;
    for (const n of ORBIT_STILL.nodes) {
      const s = shipped.get(n.vertex)!;
      const sx = c + (s.cx - c) * k;
      const sy = c + (s.cy - c) * k;
      expect(Math.hypot(n.cx - sx, n.cy - sy)).toBeLessThan(12);
    }
  });
});

describe('clocks', () => {
  it('is a function of the absolute clock, so a remount continues the drift', () => {
    expect(orbitViewAt(3000)).toEqual(orbitViewAt(3000 + ORBIT_PERIOD_MS * 5));
  });

  it('handles a clock before zero rather than running the path backwards', () => {
    expect(orbitViewAt(-ORBIT_PERIOD_MS + 1200)).toEqual(orbitViewAt(1200));
  });

  it('a period of zero parks on the first viewpoint instead of dividing by it', () => {
    expect(orbitViewAt(1234, 0)).toEqual(ORBIT_VIEWS[0]);
    expect(orbitViewAt(1234, -1)).toEqual(ORBIT_VIEWS[0]);
  });
});
