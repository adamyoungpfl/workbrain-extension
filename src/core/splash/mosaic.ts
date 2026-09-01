import { seededRandom } from './field';

/**
 * V2.9 — THE MOSAIC. The splash's show, rebuilt (Adam, 2026-09-01).
 *
 * V2.7 VB-129's field tumbled twenty-six shard windows through the mark's
 * gravity. Adam's call: "instead of it starting as spinning elements, we just
 * make it short product shots of familiar work and personal project surfaces…
 * irregular shaped cells or panels that are each flashing through a series of
 * short images or quick animated actions. No single action should be detailed
 * or important, but all should feel distantly familiar."
 *
 * So the panels hold still and the CONTENT moves. Nothing spins, nothing
 * tumbles, nothing is tracked across the screen — the eye is not asked to
 * follow anything, which is the point of "no single action is important". What
 * accelerates is the cut rate: a slow, colourful flicker at the start,
 * quickening until the cells are changing faster than they can be read, and
 * that is what breaks into the white.
 *
 * ── WHY A JITTERED GRID AND NOT A VORONOI ─────────────────────────────────
 * Irregular cells that cover the stage with no seams and no gaps, from an
 * arithmetic anybody can check. A grid's INTERIOR vertices are pushed off
 * their lattice points by a seeded amount; every cell is the quad between four
 * such vertices, so neighbours share moved corners exactly and the tiling
 * stays watertight by construction. Edge vertices stay pinned, so the mosaic
 * fills its frame to the millimetre.
 *
 * A Voronoi would give prettier cells and needs a diagram, clipping, and a
 * degenerate-case story. This needs none of those and reads as panels, which
 * is what was asked for.
 *
 * ── AND WHY THE FLASH IS A FUNCTION OF TIME ───────────────────────────────
 * `frameAt(t, cell)` is total: hand it any instant and it says which image
 * that cell is holding. No per-cell timers, no state to drift, and every
 * property worth having — that the rate only ever rises, that neighbours do
 * not cut in lockstep, that no index ever falls outside the set — is a unit
 * test rather than something to squint at.
 */

/** The stage, in its own coordinates. The painter scales to the panel. */
export const STAGE_W = 400;
export const STAGE_H = 700;

/** Columns and rows of panels. Fifteen cells: enough that the screen reads as
 *  many surfaces at once, few enough that each is big enough to be a picture
 *  of something rather than a swatch. */
export const COLS = 3;
export const ROWS = 5;
export const CELL_COUNT = COLS * ROWS;

/** How far an interior vertex may leave its lattice point, as a fraction of
 *  the cell. Past about a third the quads start turning inside out. */
const JITTER = 0.26;

export interface Point {
  x: number;
  y: number;
}

/**
 * The mosaic's cells, as closed quads in stage coordinates.
 *
 * Deterministic for a given seed: the same seed is the same mosaic every time,
 * which is what makes it testable and what keeps the splash from looking like
 * a different product on every open.
 */
export function makeMosaic(seed = 20260901): Point[][] {
  const rand = seededRandom(seed);
  const stepX = STAGE_W / COLS;
  const stepY = STAGE_H / ROWS;

  // The lattice, jittered once. Vertices on the frame stay put so the mosaic
  // fills the stage exactly; only the interior moves.
  const grid: Point[][] = [];
  for (let r = 0; r <= ROWS; r += 1) {
    const row: Point[] = [];
    for (let c = 0; c <= COLS; c += 1) {
      const edge = r === 0 || c === 0 || r === ROWS || c === COLS;
      const dx = edge ? 0 : (rand() - 0.5) * 2 * JITTER * stepX;
      const dy = edge ? 0 : (rand() - 0.5) * 2 * JITTER * stepY;
      row.push({ x: c * stepX + dx, y: r * stepY + dy });
    }
    grid.push(row);
  }

  const cells: Point[][] = [];
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      cells.push([
        grid[r]![c]!,
        grid[r]![c + 1]!,
        grid[r + 1]![c + 1]!,
        grid[r + 1]![c]!,
      ]);
    }
  }
  return cells;
}

/** Seconds a cell holds one image at the very start — a slow, readable cut. */
export const HOLD_START_S = 0.68;
/** And at the end, where the cells are changing faster than they can be read. */
export const HOLD_END_S = 0.07;

/**
 * How long one image is held, `t` seconds in.
 *
 * Geometric rather than linear: a linear ramp between the same two ends spends
 * most of its length already fast, so the acceleration is over before it is
 * noticed. Halving repeatedly is what "speeding up" looks like.
 *
 * `over` is the span the ramp is spread across — the swell's start, so the
 * cells reach their fastest exactly as the white begins to take them.
 */
export function holdAt(t: number, over: number): number {
  const p = over <= 0 ? 1 : Math.max(0, Math.min(1, t / over));
  return HOLD_START_S * (HOLD_END_S / HOLD_START_S) ** p;
}

/**
 * Total elapsed "cuts" at time `t` — the integral of the rate, which is what
 * lets `frameAt` be a pure function of the clock instead of a counter.
 *
 * Closed form for the geometric ramp above, with the linear tail past `over`
 * where the hold is constant.
 */
export function cutsBy(t: number, over: number): number {
  if (t <= 0) return 0;
  const k = Math.log(HOLD_END_S / HOLD_START_S);
  const ramp = Math.min(t, over);
  // ∫ dt / (A·e^(k·t/over)) from 0 to ramp
  /* `k` is negative (the hold SHRINKS), so `e^(-k·t/over)` grows above 1 and
     the bracket has to be `(e^… − 1)`. Written the other way round it returns
     a negative cut count, which the monotonicity test caught immediately. */
  const cuts = over <= 0 ? 0 : (over / (HOLD_START_S * -k)) * (Math.exp((-k * ramp) / over) - 1);
  const tail = t > over ? (t - over) / HOLD_END_S : 0;
  return cuts + tail;
}

/**
 * Which image cell `cell` is holding at `t` seconds.
 *
 * Two things keep the wall from pulsing as one object. Each cell is OFFSET
 * along the cut sequence by a seeded amount, so neighbours change at different
 * moments; and each walks the image set by its own stride, so two cells that
 * do happen to cut together are not showing the same picture.
 */
export function frameAt(t: number, cell: number, imageCount: number, over: number): number {
  if (imageCount <= 0) return 0;
  const phase = ((cell * 7919) % 1000) / 1000;
  const n = Math.floor(cutsBy(Math.max(0, t), over) + phase);
  /* WALKED ONE AT A TIME FROM A DIFFERENT START, not strided.

     A per-cell stride looked like a cheap way to keep neighbours off the same
     picture, and it quietly trapped cells in short loops: any stride sharing a
     factor with the image count cycles through only `count / gcd` images, so a
     cell with stride 6 over 18 images showed the same three pictures for the
     whole show. Stepping by one from a per-cell offset means every panel walks
     the entire set, and the offset does the separating. */
  return (((n + cell * 5) % imageCount) + imageCount) % imageCount;
}

/**
 * How far the mosaic has bleached, 0 to 1, `t` seconds in.
 *
 * The cells do not simply get covered by the white overlay — they LOSE THEIR
 * COLOUR into it, starting a little before the swell does. Adam: "they start
 * with colour and as the animation cycle speeds up, the animation builds
 * fading to white." A wall that is still fully saturated at the instant a
 * white sheet drops over it reads as a cut; one already draining reads as the
 * same event arriving.
 */
export function bleachAt(t: number, swellAt: number): number {
  const from = swellAt * 0.55;
  if (t <= from) return 0;
  if (t >= swellAt) return 1;
  return (t - from) / (swellAt - from);
}
