/**
 * V2.3 VB-97 — the wall panels: geometry and clocks for the faint
 * tessellated layer behind the question area. "Congruent random edges,
 * panels breathing up and down on unsynchronized clocks with a brief faint
 * color glow — something vibrant under the surface" (Adam,
 * docs/V2.3-REFINEMENT.md), with readability the constraint that wins
 * every tie: the layer's whole compositing opacity is capped in the low
 * single digits (WALL_OPACITY_MAX), and measured text contrast on top of
 * it must be unchanged.
 *
 * Pure module, on purpose (the one architectural rule): everything here is
 * arithmetic over a seed and a clock, so the tessellation's claims —
 * congruent shared edges, deterministic layout, unsynchronized breathing —
 * are tested without a browser. The canvas painting lives in
 * src/panel/components/WallPanels.tsx and draws exactly what this returns.
 */

/** The layer's compositing opacity ceiling — "low single digits". The
 * panel component sets this on the canvas; nothing inside the drawing may
 * exceed what this lets through. */
export const WALL_OPACITY_MAX = 0.04;

/** Deterministic PRNG (mulberry32). Seeded, so a layout is reproducible in
 * tests and stable across re-renders of the same surface. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface WallVertex {
  x: number;
  y: number;
}

export interface WallPanel {
  /** Corner indices into the grid's shared vertex list, clockwise. Shared
   * BY CONSTRUCTION: neighbouring panels reference the same vertex objects,
   * which is what makes every edge congruent with its neighbour's. */
  corners: [number, number, number, number];
  /** Breathing period in ms — distinct per panel (see gridFor), so no two
   * panels rise and fall together. */
  periodMs: number;
  /** Phase offset in ms. */
  phaseMs: number;
  /** Which of the four brand hues this panel's glow borrows. */
  hue: number;
}

export interface WallGrid {
  vertices: WallVertex[];
  panels: WallPanel[];
  columns: number;
  rows: number;
}

/** Panel size target in CSS px — coarse on purpose: a 400px panel reads as
 * a wall of a dozen-odd stones, not a mosaic. */
const CELL = 96;
/** Interior vertices jitter by up to this fraction of a cell, giving the
 * "random edges" while edges stay shared. Border vertices stay put so the
 * tessellation meets the surface's own edges cleanly. */
const JITTER = 0.34;
/** Breathing periods: slow, in a band wide enough that clocks drift apart
 * quickly. The glow window is a brief slice of each cycle. */
const PERIOD_MIN_MS = 9_000;
const PERIOD_SPAN_MS = 8_000;

export function gridFor(width: number, height: number, seed: number): WallGrid {
  const columns = Math.max(2, Math.round(width / CELL));
  const rows = Math.max(2, Math.round(height / CELL));
  const random = mulberry32(seed);
  const vertices: WallVertex[] = [];
  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column <= columns; column++) {
      const edge = row === 0 || column === 0 || row === rows || column === columns;
      const jx = edge ? 0 : (random() * 2 - 1) * JITTER * (width / columns);
      const jy = edge ? 0 : (random() * 2 - 1) * JITTER * (height / rows);
      vertices.push({ x: (column / columns) * width + jx, y: (row / rows) * height + jy });
    }
  }
  const at = (row: number, column: number) => row * (columns + 1) + column;
  const panels: WallPanel[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      panels.push({
        corners: [at(row, column), at(row, column + 1), at(row + 1, column + 1), at(row + 1, column)],
        periodMs: PERIOD_MIN_MS + random() * PERIOD_SPAN_MS,
        phaseMs: random() * PERIOD_MIN_MS,
        hue: Math.floor(random() * 4),
      });
    }
  }
  return { vertices, panels, columns, rows };
}

export interface PanelShade {
  /** 0..1 — how far up this panel currently breathes. Feeds a lightness
   * delta in the painter; the layer opacity cap does the real limiting. */
  lift: number;
  /** 0..1 — the brief colour glow, nonzero only inside a short window of
   * the cycle. */
  glow: number;
}

/** Where a panel's breath is at time `nowMs`. Pure fold over the clock. */
export function shadeAt(panel: Pick<WallPanel, 'periodMs' | 'phaseMs'>, nowMs: number): PanelShade {
  const t = ((nowMs + panel.phaseMs) % panel.periodMs) / panel.periodMs;
  // A full slow sine for the breath...
  const lift = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
  // ...and a brief raised-cosine bump for the glow, occupying ~12% of the
  // cycle so at any moment only the odd panel is glowing.
  const window = 0.12;
  const into = (t - 0.44) / window;
  const glow = into > 0 && into < 1 ? 0.5 - 0.5 * Math.cos(into * Math.PI * 2) : 0;
  return { lift, glow };
}
