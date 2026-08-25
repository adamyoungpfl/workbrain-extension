import { describe, it, expect } from 'vitest';
import {
  HIGHLIGHT_RADIUS,
  HIGHLIGHT_REACH,
  SCENE_LIGHT,
  SHADE_RADIUS,
  SHADE_REACH,
  highlightExtent,
  orbLight,
  shadeExtent,
  stagePoint,
} from './lighting';
import type { ScenePoint } from './lighting';

/**
 * V1.9 VB-54.
 *
 * The three questions the spec asks by name — a light directly behind an orb,
 * directly in front, and off-axis — plus the one promise that has to hold
 * everywhere rather than at three chosen points: the highlight never leaves the
 * orb. That last one is swept over a dense grid of positions AND over a set of
 * light placements, because "at every position" is the claim and three
 * hand-picked cases cannot make it.
 */

const ORIGIN: ScenePoint = { x: 0, y: 0, z: 0 };

/** A grid over the whole normalised stage and a little past it, plus the depth
 * the globe's own solid reaches (±0.6 — see BrainGlobe.tsx's GEO and PHI). */
function everyOrbPosition(): ScenePoint[] {
  const points: ScenePoint[] = [];
  for (let x = -1.4; x <= 1.4001; x += 0.2) {
    for (let y = -1.4; y <= 1.4001; y += 0.2) {
      for (let z = -0.8; z <= 0.8001; z += 0.2) {
        points.push({ x: Number(x.toFixed(3)), y: Number(y.toFixed(3)), z: Number(z.toFixed(3)) });
      }
    }
  }
  return points;
}

describe('VB-54 — a highlight is a reading of where the light is', () => {
  it('a light directly in FRONT of an orb puts the highlight dead centre, fully lit', () => {
    const light = orbLight(ORIGIN, { x: 0, y: 0, z: 3 });
    expect(light.facing).toBeCloseTo(1, 10);
    expect(light.highlight).toBeCloseTo(1, 10);
    expect(light.shade).toBeCloseTo(0, 10);
    expect(light.hx).toBeCloseTo(0, 10);
    expect(light.hy).toBeCloseTo(0, 10);
    // Nothing to darken, and nowhere for it to be.
    expect(light.sx).toBeCloseTo(0, 10);
    expect(light.sy).toBeCloseTo(0, 10);
  });

  it('a light directly BEHIND an orb leaves no highlight at all, and the whole face shaded', () => {
    const light = orbLight(ORIGIN, { x: 0, y: 0, z: -3 });
    expect(light.facing).toBeCloseTo(-1, 10);
    expect(light.highlight).toBe(0);
    expect(light.shade).toBeCloseTo(1, 10);
    // Zero offset here is a highlight of size zero, not a highlight in the
    // middle — `highlight` is what says which (see lighting.ts).
    expect(light.hx).toBeCloseTo(0, 10);
    expect(light.hy).toBeCloseTo(0, 10);
  });

  it('a light exactly SIDE-ON is half shaded, with the highlight thrown to the rim', () => {
    const light = orbLight(ORIGIN, { x: 4, y: 0, z: 0 });
    expect(light.facing).toBeCloseTo(0, 10);
    expect(light.highlight).toBe(0);
    expect(light.shade).toBeCloseTo(0.5, 10);
    // As far toward the rim as the offset is allowed to go, on the light's side.
    expect(light.hx).toBeCloseTo(HIGHLIGHT_REACH, 10);
    expect(light.hy).toBeCloseTo(0, 10);
  });

  it('OFF-AXIS: the highlight moves toward the light and the terminator away from it', () => {
    // Light up and to the left, in front — the product's own placement.
    const light = orbLight(ORIGIN, SCENE_LIGHT);
    expect(light.hx).toBeLessThan(0);
    expect(light.hy).toBeLessThan(0);
    // The two are one axis, not two decisions.
    expect(light.sx).toBeCloseTo((-light.hx / HIGHLIGHT_REACH) * SHADE_REACH, 10);
    expect(light.sy).toBeCloseTo((-light.hy / HIGHLIGHT_REACH) * SHADE_REACH, 10);
    // In front, so still catching most of the light.
    expect(light.facing).toBeGreaterThan(0.5);
    expect(light.shade).toBeLessThan(0.3);
  });

  it('THE POINT OF THE WHOLE FILE: two orbs either side of the light are lit differently', () => {
    // VB-24 deleted a highlight baked into each orb's own local space because
    // every orb wore it identically. If these two ever agree, this feature has
    // regressed to exactly that.
    const near = orbLight({ x: -0.6, y: -0.6, z: 0 });
    const far = orbLight({ x: 0.6, y: 0.6, z: 0 });

    // The far orb's highlight is thrown much further toward its rim...
    expect(Math.hypot(far.hx, far.hy)).toBeGreaterThan(Math.hypot(near.hx, near.hy) * 1.5);
    // ...and it is the one carrying the shading.
    expect(far.shade).toBeGreaterThan(near.shade * 1.5);
    // Both are still pulled the same way — one light, not two.
    expect(near.hx).toBeLessThan(0);
    expect(far.hx).toBeLessThan(0);
    expect(near.hy).toBeLessThan(0);
    expect(far.hy).toBeLessThan(0);
  });

  it('an orb in front of the light and one behind it disagree about which is shaded', () => {
    // The light sits at z = 1.5, so an orb pushed past it is BACK-lit while
    // its neighbour at the same x/y is front-lit. Depth changes the shading,
    // which is what "a point in the scene" means rather than "a direction".
    const inFront = orbLight({ x: SCENE_LIGHT.x, y: SCENE_LIGHT.y, z: 0 });
    const behind = orbLight({ x: SCENE_LIGHT.x, y: SCENE_LIGHT.y, z: 3 });
    expect(inFront.facing).toBeCloseTo(1, 10);
    expect(behind.facing).toBeCloseTo(-1, 10);
    expect(behind.shade).toBeGreaterThan(inFront.shade);
  });

  it('shade and highlight are two readings of one number, and never disagree', () => {
    for (const orb of everyOrbPosition()) {
      const light = orbLight(orb);
      expect(light.shade).toBeCloseTo((1 - light.facing) / 2, 10);
      expect(light.highlight).toBe(light.facing > 0 ? light.facing : 0);
      expect(light.shade).toBeGreaterThanOrEqual(0);
      expect(light.shade).toBeLessThanOrEqual(1);
    }
  });

  it('a light exactly ON an orb resolves to straight-ahead rather than to NaN', () => {
    const light = orbLight({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 3 });
    for (const value of [light.hx, light.hy, light.sx, light.sy, light.highlight, light.shade, light.facing]) {
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(light.facing).toBe(1);
    expect(light.hx).toBe(0);
    expect(light.hy).toBe(0);
  });
});

describe('VB-54 — the highlight never leaves the orb', () => {
  /** Every light worth trying: the product's own, plus the extremes that make
   * the offset as large as it can be (side-on, and grazing from every corner). */
  const LIGHTS: ScenePoint[] = [
    SCENE_LIGHT,
    { x: 0, y: 0, z: 5 },
    { x: 0, y: 0, z: -5 },
    { x: 5, y: 0, z: 0 },
    { x: -5, y: 0, z: 0 },
    { x: 0, y: 5, z: 0 },
    { x: 0, y: -5, z: 0 },
    { x: 3, y: 3, z: 0.0001 },
    { x: -3, y: -3, z: -0.0001 },
    { x: 0.05, y: 0.05, z: 0.05 },
  ];

  it('at every orb position, under every light, both blobs stay inside the rim', () => {
    const positions = everyOrbPosition();
    expect(positions.length).toBeGreaterThan(1000);
    let worstHighlight = 0;
    let worstShade = 0;
    for (const light of LIGHTS) {
      for (const orb of positions) {
        const lit = orbLight(orb, light);
        worstHighlight = Math.max(worstHighlight, highlightExtent(lit));
        worstShade = Math.max(worstShade, shadeExtent(lit));
      }
    }
    // Strictly inside, with the margin VB-45's hairline depends on. The budget
    // is compared with a float's worth of slack: a unit vector's components
    // come back off `Math.hypot` an ulp either side of exact, and a test that
    // called that a leak would be measuring IEEE-754 rather than the picture.
    const ULP = 1e-9;
    expect(worstHighlight).toBeLessThanOrEqual(HIGHLIGHT_REACH + HIGHLIGHT_RADIUS + ULP);
    expect(worstHighlight).toBeLessThan(1);
    expect(worstShade).toBeLessThanOrEqual(SHADE_REACH + SHADE_RADIUS + ULP);
    expect(worstShade).toBeLessThan(1);
  });

  it('and the two budgets are declared, not discovered — the constants sum to under one', () => {
    expect(HIGHLIGHT_REACH + HIGHLIGHT_RADIUS).toBeLessThan(1);
    expect(SHADE_REACH + SHADE_RADIUS).toBeLessThan(1);
    // A terminator IS most of a hemisphere; a highlight is a spot. If these
    // ever invert, the picture has stopped being a sphere.
    expect(SHADE_RADIUS).toBeGreaterThan(HIGHLIGHT_RADIUS);
    expect(HIGHLIGHT_REACH).toBeGreaterThan(SHADE_REACH);
  });

  it('the highlight reaches the rim as the light swings sideways, and comes back', () => {
    // Not a constant offset wearing a scene's name: sweep the light around the
    // orb and the offset traces a full circle out to the reach and back.
    const seen: number[] = [];
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
      const light = orbLight(ORIGIN, { x: Math.cos(angle) * 3, y: Math.sin(angle) * 3, z: 3 });
      seen.push(Math.hypot(light.hx, light.hy));
      // Always pointing at the light.
      expect(Math.atan2(light.hy, light.hx)).toBeCloseTo(Math.atan2(Math.sin(angle), Math.cos(angle)), 6);
    }
    // A ring, so every sample is the same distance out — and it is a real
    // distance, not zero.
    expect(Math.max(...seen) - Math.min(...seen)).toBeLessThan(1e-9);
    expect(seen[0]!).toBeGreaterThan(0.2);
  });
});

/**
 * V2.0 VB-60 — the picker measures its orbs and converts them here, so this is
 * the only arithmetic between a painted pixel and the scene. See `stagePoint`.
 */
describe('a painted point in stage space', () => {
  const frame = { left: 20, top: 100, width: 200, height: 80 };

  it('puts the frame’s own corners on the stage’s corners', () => {
    expect(stagePoint(20, 100, frame)).toEqual({ x: -1, y: -1, z: 0 });
    expect(stagePoint(220, 180, frame)).toEqual({ x: 1, y: 1, z: 0 });
    expect(stagePoint(120, 140, frame)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('keeps screen’s downward y, which is what both callers draw in', () => {
    expect(stagePoint(120, 110, frame).y).toBeLessThan(0);
    expect(stagePoint(120, 170, frame).y).toBeGreaterThan(0);
  });

  it('is flat — the picker is a pane, like the List’s', () => {
    expect(stagePoint(50, 150, frame).z).toBe(0);
  });

  it('resolves a frame with no extent to the centre rather than to NaN', () => {
    // A group measured before layout, or in a test with no browser. `orbLight`
    // reads the centre as lit from straight ahead: neutral, and drawable.
    const nothing = { left: 0, top: 0, width: 0, height: 0 };
    const point = stagePoint(0, 0, nothing);
    expect(point).toEqual({ x: 0, y: 0, z: 0 });
    expect(Number.isNaN(orbLight(point).hx)).toBe(false);
  });

  it('an orb further right sees the light from further away, and its highlight moves left', () => {
    // The whole reason the picker measures rather than models: this
    // relationship BETWEEN neighbours is the cue, and it only exists if the
    // positions are the ones actually painted (see the header on VB-23).
    const left = orbLight(stagePoint(40, 140, frame));
    const right = orbLight(stagePoint(200, 140, frame));
    expect(right.hx).toBeLessThan(left.hx);
    expect(right.sx).toBeGreaterThan(left.sx);
    // Same light, so both still point at it: up and to the left of both.
    expect(left.hy).toBeLessThan(0);
    expect(right.hy).toBeLessThan(0);
  });
});
