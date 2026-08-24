import { describe, it, expect } from 'vitest';
import { detailBand } from './detailBand';

/**
 * V1.6 VB-31.
 *
 * The three things this fold has to guarantee are the three VB-31 accepts on,
 * and all three are arithmetic rather than taste: the text can never reach the
 * orb it describes, it stays on the smallest stage the drawer opens Brain at,
 * and it is centred on the node — dead-centred wherever the stage allows it and
 * never further off than the allowance it was given. Proving them here means
 * the browser only has to confirm the numbers were actually applied — see
 * tests/e2e/brain-globe.spec.ts.
 *
 * The numbers below are the real ones: the featured orb lands at 21% of the
 * stage's width and dead on its vertical middle, with a radius of 9.5% of the
 * stage (FEATURE_X / FEATURE_Y / FEATURE_R in components/BrainGlobe.tsx, folded
 * through the same `pct` the overlay is positioned with). 260 is the smallest
 * stage the drawer opens Brain at; 300 is its resting one.
 */

const NODE = { nodeX: 0.21, nodeY: 0.5, nodeRadius: 0.095 };
const SHAPE = { driftAllowance: 0.5, edge: 8, gap: 10 };
const STAGES = [260, 280, 300, 340, 380];

describe('VB-31 — the band never reaches the node', () => {
  it('starts below the orb’s lowest point at every stage the drawer opens', () => {
    for (const size of STAGES) {
      const band = detailBand({ size, ...NODE, ...SHAPE });
      const orbBottom = (NODE.nodeY + NODE.nodeRadius) * size;
      expect(band.top, `stage ${size}`).toBeGreaterThanOrEqual(orbBottom + SHAPE.gap);
    }
  });

  it('ends at the stage’s floor, so the text is capped rather than trusted', () => {
    for (const size of STAGES) {
      const band = detailBand({ size, ...NODE, ...SHAPE });
      expect(band.top + band.room, `stage ${size}`).toBeLessThanOrEqual(size - SHAPE.edge + 0.001);
    }
  });

  it('still describes a real band at BRAIN_STAGE_MIN, the smallest stage that exists', () => {
    // core/drawer/mode.ts's floor: 180px of drawer, less the 44px handle and
    // 2 × 10px of pad, is a 116px stage. Brain is not even the mode below that,
    // but it IS reachable, and a band that came out negative or inverted there
    // would be a picture that breaks a screen (docs/GUARDRAILS.md).
    const band = detailBand({ size: 116, ...NODE, ...SHAPE });
    expect(band.width).toBeGreaterThan(0);
    expect(band.room).toBeGreaterThan(0);
    expect(band.top).toBeGreaterThan((NODE.nodeY + NODE.nodeRadius) * 116);
    expect(band.centre - band.width / 2).toBeGreaterThanOrEqual(SHAPE.edge - 0.001);
    expect(band.centre + band.width / 2).toBeLessThanOrEqual(116 - SHAPE.edge + 0.001);
  });

  it('reports no room at all rather than a negative one when a stage is too small', () => {
    // Not a stage the drawer ever opens — the point is that the arithmetic
    // degrades to "draw nothing" instead of to a negative height.
    const band = detailBand({ size: 30, ...NODE, ...SHAPE });
    expect(band.room).toBe(0);
  });
});

describe('VB-31 — the block stays on the stage', () => {
  it('keeps both edges inside the stage’s own margin at every size', () => {
    for (const size of STAGES) {
      const band = detailBand({ size, ...NODE, ...SHAPE });
      expect(band.centre - band.width / 2, `stage ${size}`).toBeGreaterThanOrEqual(SHAPE.edge - 0.001);
      expect(band.centre + band.width / 2, `stage ${size}`).toBeLessThanOrEqual(size - SHAPE.edge + 0.001);
    }
  });

  it('never asks for more width than the stage has, however generous the allowance', () => {
    const band = detailBand({ size: 260, ...NODE, driftAllowance: 40, edge: 8, gap: 10 });
    expect(band.width).toBe(260 - 16);
    // ...and having taken the whole stage, it is no longer centred on anything
    // but the stage — which the drift reports honestly rather than hiding.
    expect(band.drift).toBeCloseTo(260 / 2 - 0.21 * 260, 5);
  });
});

describe('VB-31 — centred on the node, within a stated allowance', () => {
  it('is dead-centred on the node when no drift is allowed at all', () => {
    for (const size of STAGES) {
      const band = detailBand({ size, ...NODE, driftAllowance: 0, edge: 8, gap: 10 });
      expect(band.drift, `stage ${size}`).toBe(0);
      expect(band.centre, `stage ${size}`).toBeCloseTo(NODE.nodeX * size, 5);
      // And that is exactly why the allowance exists: dead-centred on a node at
      // 21% of the smallest stage is 93px of measure.
      if (size === 260) expect(Math.round(band.width)).toBe(93);
    }
  });

  it('is dead-centred at any allowance once the node is on the stage’s own axis', () => {
    for (const driftAllowance of [0, 0.5, 1, 3]) {
      const band = detailBand({ size: 260, nodeX: 0.5, nodeY: 0.5, nodeRadius: 0.095, driftAllowance, edge: 8, gap: 10 });
      expect(band.drift, `allowance ${driftAllowance}`).toBe(0);
    }
  });

  it('never drifts further than the allowance, and spends it on measure', () => {
    for (const size of STAGES) {
      const allowed = SHAPE.driftAllowance * NODE.nodeRadius * size;
      const band = detailBand({ size, ...NODE, ...SHAPE });
      const dead = detailBand({ size, ...NODE, driftAllowance: 0, edge: 8, gap: 10 });
      expect(band.drift, `stage ${size}`).toBeLessThanOrEqual(allowed + 0.001);
      // Every px of drift bought two of measure — that is the whole trade.
      expect(band.width - dead.width, `stage ${size}`).toBeCloseTo(2 * band.drift, 5);
      // Always towards the middle of the stage, never away from it.
      expect(band.centre, `stage ${size}`).toBeGreaterThanOrEqual(NODE.nodeX * size);
    }
  });

  it('holds a node against the far edge to the same rule, mirrored', () => {
    const band = detailBand({ size: 300, nodeX: 0.79, nodeY: 0.5, nodeRadius: 0.095, ...SHAPE });
    const mirror = detailBand({ size: 300, ...NODE, ...SHAPE });
    expect(band.width).toBeCloseTo(mirror.width, 5);
    expect(band.centre).toBeCloseTo(300 - mirror.centre, 5);
    expect(band.centre).toBeLessThan(0.79 * 300);
  });

  it('is very nearly the same shape whatever the stage', () => {
    // The trade is expressed in fractions of the stage, so the block is the
    // same proportion of every stage to within the one term that is not — the
    // px margin at the edges, which is 6% of a 260px stage and 4% of a 380px
    // one, or 1.5 points of proportion across the range the drawer covers. A
    // test demanding exact proportion would be demanding that the margin scale
    // too, which would put it at 3px on the smallest stage.
    const ratios = STAGES.map((size) => detailBand({ size, ...NODE, ...SHAPE }).width / size);
    for (const ratio of ratios) expect(Math.abs(ratio - ratios[0]!)).toBeLessThan(0.02);
    // ...and it always grows with the stage, never the other way round.
    const widths = STAGES.map((size) => detailBand({ size, ...NODE, ...SHAPE }).width);
    for (let i = 1; i < widths.length; i++) expect(widths[i]!).toBeGreaterThan(widths[i - 1]!);
  });
});
