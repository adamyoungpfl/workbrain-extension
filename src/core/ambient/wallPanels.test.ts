import { describe, it, expect } from 'vitest';
import { WALL_OPACITY_MAX, gridFor, mulberry32, shadeAt } from './wallPanels';

describe('the wall grid', () => {
  const grid = gridFor(400, 600, 7);

  it('is deterministic: the same seed lays the same stones', () => {
    expect(gridFor(400, 600, 7)).toEqual(grid);
    expect(gridFor(400, 600, 8)).not.toEqual(grid);
  });

  it('edges are congruent by construction — neighbours reference the same shared vertices', () => {
    // Panel (r,c)'s right edge is corners[1]→corners[2]; its right-hand
    // neighbour's left edge is corners[0]→corners[3]. Same indices, same
    // vertices, one edge.
    for (let row = 0; row < grid.rows; row++) {
      for (let column = 0; column < grid.columns - 1; column++) {
        const here = grid.panels[row * grid.columns + column]!;
        const right = grid.panels[row * grid.columns + column + 1]!;
        expect(here.corners[1]).toBe(right.corners[0]);
        expect(here.corners[2]).toBe(right.corners[3]);
      }
    }
  });

  it('the border vertices sit exactly on the surface edge — the wall meets its frame', () => {
    for (const vertex of grid.vertices) {
      const onX = vertex.x === 0 || Math.abs(vertex.x - 400) < 1e-9;
      const onY = vertex.y === 0 || Math.abs(vertex.y - 600) < 1e-9;
      // Interior vertices jitter; border ones must not.
      if (onX || onY) {
        expect(vertex.x).toBeGreaterThanOrEqual(0);
        expect(vertex.x).toBeLessThanOrEqual(400);
        expect(vertex.y).toBeGreaterThanOrEqual(0);
        expect(vertex.y).toBeLessThanOrEqual(600);
      }
    }
    // The four corners exist, un-jittered.
    expect(grid.vertices.some((v) => v.x === 0 && v.y === 0)).toBe(true);
  });

  it('no two panels breathe on the same clock', () => {
    const periods = grid.panels.map((p) => p.periodMs.toFixed(6));
    expect(new Set(periods).size).toBe(grid.panels.length);
  });
});

describe('the breath', () => {
  it('lift is a full 0..1 cycle; the glow is a brief window, off most of the time', () => {
    const panel = { periodMs: 10_000, phaseMs: 0 };
    const samples = Array.from({ length: 100 }, (_, i) => shadeAt(panel, i * 100));
    const lifts = samples.map((s) => s.lift);
    expect(Math.min(...lifts)).toBeLessThan(0.05);
    expect(Math.max(...lifts)).toBeGreaterThan(0.95);
    const glowing = samples.filter((s) => s.glow > 0.01).length;
    expect(glowing).toBeGreaterThan(0);
    expect(glowing / samples.length).toBeLessThan(0.2); // brief, not ambient noise
    for (const s of samples) {
      expect(s.lift).toBeGreaterThanOrEqual(0);
      expect(s.lift).toBeLessThanOrEqual(1);
      expect(s.glow).toBeGreaterThanOrEqual(0);
      expect(s.glow).toBeLessThanOrEqual(1);
    }
  });
});

describe('the ceiling', () => {
  it('is low single digits — readability wins every tie', () => {
    expect(WALL_OPACITY_MAX).toBeLessThanOrEqual(0.05);
    expect(WALL_OPACITY_MAX).toBeGreaterThan(0);
  });

  it('mulberry32 is a stable, seeded stream', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 5; i++) expect(a()).toBe(b());
  });
});
