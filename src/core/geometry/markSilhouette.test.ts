import { describe, it, expect } from 'vitest';
import {
  MARK_CENTRE,
  MARK_RADIUS,
  MARK_STATIC_ANGLE,
  MARK_VIEWBOX,
  markFrame,
} from './markSpin';
import {
  MARK_SILHOUETTE_STILL,
  markSilhouettePoints,
  pointsAttribute,
} from './markSilhouette';

/**
 * V1.7 VB-39. The one thing that matters here is that the silhouette and the
 * node graph are the same object seen from the same place — a logo that is
 * subtly a different solid in the status bar than on the welcome screen is
 * worse than having no silhouette at all.
 *
 * That is checkable exactly, not approximately: every corner of the outline is
 * a projected vertex, and every projected vertex is a node centre in
 * `markFrame`. Both round to two decimals through identical arithmetic, so the
 * assertion is equality, not closeness.
 */

const nodeCentres = (angle: number) =>
  new Set(markFrame(angle).nodes.map((n) => `${n.cx},${n.cy}`));

describe('the mark’s silhouette', () => {
  it('has every corner on a node of the node graph at the same angle', () => {
    for (let i = 0; i < 60; i++) {
      const angle = (i / 60) * Math.PI * 2;
      const centres = nodeCentres(angle);
      for (const p of markSilhouettePoints(angle)) {
        expect(
          centres.has(`${p.x},${p.y}`),
          `corner ${p.x},${p.y} is not a node of the mark at ${angle.toFixed(3)}`,
        ).toBe(true);
      }
    }
  });

  it('is six to ten corners — an icosahedron’s shadow, not a circle', () => {
    for (let i = 0; i < 120; i++) {
      const n = markSilhouettePoints((i / 120) * Math.PI * 2).length;
      expect(n).toBeGreaterThanOrEqual(6);
      expect(n).toBeLessThanOrEqual(10);
    }
  });

  it('stays inside the viewBox, and fills it the way the node graph does', () => {
    for (let i = 0; i < 60; i++) {
      const points = markSilhouettePoints((i / 60) * Math.PI * 2);
      const xs = points.map((p) => p.x);
      const ys = points.map((p) => p.y);
      for (const v of [...xs, ...ys]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(MARK_VIEWBOX);
      }
      // The solid's circumradius is the mark's radius, so the widest the
      // shadow can be is the full 2·radius and the narrowest is well inside
      // it. Anything outside this band means the camera has been rescaled.
      const width = Math.max(...xs) - Math.min(...xs);
      expect(width).toBeGreaterThan(MARK_RADIUS);
      expect(width).toBeLessThanOrEqual(MARK_RADIUS * 2 + 0.01);
    }
  });

  it('is centred on the mark’s own centre', () => {
    // The solid is centred on the origin, so its shadow's extremes must
    // straddle the centre in both axes at every angle.
    for (let i = 0; i < 60; i++) {
      const points = markSilhouettePoints((i / 60) * Math.PI * 2);
      const xs = points.map((p) => p.x);
      const ys = points.map((p) => p.y);
      expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(MARK_CENTRE, 6);
      expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(MARK_CENTRE, 6);
    }
  });

  it('actually turns — every angle of a half revolution draws a different outline', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      seen.add(pointsAttribute(markSilhouettePoints((i / 40) * Math.PI)));
    }
    expect(seen.size).toBe(40);
  });

  it('repeats every half turn, because the solid does', () => {
    // The vertical axis runs through two opposite edge midpoints, so turning
    // the icosahedron 180° about it maps it exactly onto itself: (x,y,z) →
    // (−x,y,−z) sends every vertex to another vertex. The node graph hides
    // that — its five gradients ride on individual vertices and they swap —
    // but a shadow has no colour, so the silhouette genuinely repeats. Worth
    // pinning: it is why a continuous spin of the silhouette has a half-length
    // period, and someone who later finds that surprising should find it here
    // rather than in a bug report.
    // Compared as a set of corners, not as a string: which corner the walk
    // starts from depends on which one is leftmost, and a pose with a vertical
    // side breaks that tie either way. A closed polygon draws identically
    // whichever of its corners is written first, so that difference is real
    // and irrelevant.
    const corners = (angle: number) =>
      [...markSilhouettePoints(angle).map((p) => `${p.x},${p.y}`)].sort();
    for (let i = 0; i < 40; i++) {
      const angle = (i / 40) * Math.PI;
      expect(corners(angle + Math.PI)).toEqual(corners(angle));
    }
  });

  it('ships the same still pose the node graph does', () => {
    expect(MARK_SILHOUETTE_STILL).toEqual(markSilhouettePoints(MARK_STATIC_ANGLE));
    const centres = nodeCentres(MARK_STATIC_ANGLE);
    for (const p of MARK_SILHOUETTE_STILL) {
      expect(centres.has(`${p.x},${p.y}`)).toBe(true);
    }
  });

  it('writes an SVG points attribute and nothing else', () => {
    const attribute = pointsAttribute(MARK_SILHOUETTE_STILL);
    expect(attribute).toMatch(/^-?[\d.]+,-?[\d.]+( -?[\d.]+,-?[\d.]+)+$/);
    expect(attribute.split(' ')).toHaveLength(MARK_SILHOUETTE_STILL.length);
  });
});
