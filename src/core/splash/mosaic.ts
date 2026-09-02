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

/** Columns and rows of panels. GLYPH-SCALE since 2026-09-02 (Adam:
 *  "Instead of 4-5 tiles per row, I am thinking like 20-25. Only large
 *  enough to make out what they are in theory, like a glyph.") — ~18px
 *  panes, seven hundred of them, each just barely a picture. The flurry is
 *  the point now; recognising any one pane never was. */
/** Pulled back to two-thirds each way (Adam, 2026-09-02: "too busy now to
 *  the point of imperceptible") — still glyphs, now big enough to be read
 *  as the things they are. */
export const COLS = 14;
export const ROWS = 23;
export const CELL_COUNT = COLS * ROWS;

/** How far an interior vertex may leave its lattice point, as a fraction of
 *  the cell. Raised with the sketch pass for more irregular panes; past
 *  about a third the quads start turning inside out, so this is close to
 *  the ceiling on purpose. */
const JITTER = 0.32;

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
/** A cheap stateless hash to [0, 1) — the same trick every shader uses.
 *  Deterministic on purpose: a pure clock cannot roll dice, and chaos that
 *  replays identically is chaos a test can hold still. */
function jitter(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function frameAt(t: number, cell: number, imageCount: number, over: number): number {
  if (imageCount <= 0) return 0;
  /* CHAOS THAT BUILDS TO ORDER (Adam, 2026-09-02: "It needs to seem chaotic
     that builds to order, not organized chaos to start"). The old clock ran
     one shared accelerating schedule with per-cell phase offsets — organized
     chaos, formulaic from the first second. Now every cell draws each cut's
     interval separately: early intervals average the slow hold with ±85%
     scatter, and the scatter dies as the rate rises, so the wall converges
     from scattered, unpredictable flips into one urgent synchronized
     flicker at the swell. The accumulation walks at most a couple hundred
     short steps and stays a pure function of (t, cell).

     WALKED ONE AT A TIME FROM A DIFFERENT START, not strided — the stride
     trap (short image loops when the stride shares a factor with the count)
     is documented on the old clock and still applies. */
  const clamped = Math.max(0, t);
  let acc = jitter(cell * 13.7) * HOLD_START_S;
  let k = 0;
  while (acc <= clamped && k < 200) {
    const p = over <= 0 ? 1 : Math.min(1, acc / over);
    const ease = p * p * (3 - 2 * p);
    const base = HOLD_START_S + (HOLD_END_S - HOLD_START_S) * ease;
    const chaos = 1 - ease;
    acc += base * (1 + (jitter(cell * 97.3 + k * 7.1) - 0.5) * 1.7 * chaos);
    k += 1;
  }
  return (((k + cell * 5) % imageCount) + imageCount) % imageCount;
}

/**
 * THE DAWN (Adam, 2026-09-02: "make it start lighter"). A white wash the
 * wall opens under, gone by mid-show — so the arc runs light, into full
 * ink, into the swell's white: the sketch develops like a print coming up.
 */
export function dawnAt(t: number, over: number): number {
  const p = over <= 0 ? 1 : Math.min(1, Math.max(0, t / (over * 0.45)));
  return 1 - p * p * (3 - 2 * p);
}

/**
 * WHAT THE WALL IS SHOWING, `t` seconds in (Adam, 2026-09-02).
 *
 * "Each panel starts in a single light tone shade and the panels are like a
 * patchwork behind it. The panels first start to cycle through colors and then
 * as speed picks up cycles through both images and colors getting lighter and
 * lighter until it fades to white."
 *
 * REVISED 2026-09-02, at Adam's word: "I want the individual tiles to be full
 * individual tints of the original image. So, like how PowerPoint would let
 * you choose a different color treatment for the overall image, I want that
 * affect on each individual tile. First tint color changes on the same image
 * in each tile. Then the images start to cycle along with the tint colors."
 *
 * So the flat opening is gone. There are two stages now:
 *
 *   `colour` — every tile holds ONE picture and recolours it. The wall is
 *              already showing something from the first frame, and what moves
 *              is the treatment rather than the subject. One thing changing
 *              is a rhythm; two would be a flicker.
 *   `full`   — the pictures start cutting too, so both are moving, and the
 *              combinations run together into the white.
 *
 * The build still runs one-thing-then-two, which is what gives the ending
 * somewhere to come from — it just starts from a picture instead of from a
 * flat shade, which is a stronger opening frame and costs nothing.
 */
export type MosaicStage = 'colour' | 'full';

/** Fraction of the run to the swell at which pictures start cutting too. */
const COLOUR_UNTIL = 0.46;

export function stageAt(t: number, over: number): MosaicStage {
  const p = over <= 0 ? 1 : Math.max(0, t) / over;
  if (p < COLOUR_UNTIL) return 'colour';
  return 'full';
}

/**
 * Which hue a panel is wearing.
 *
 * Separate from `frameAt` on purpose: colour and picture cut on the same clock
 * but not in step, so a panel changing its picture is not also changing its
 * colour on the same frame. Two things moving together read as one thing
 * flickering.
 */
export function tintAt(t: number, cell: number, hues: number, over: number): number {
  if (hues <= 0) return 0;
  const n = Math.floor(cutsBy(Math.max(0, t), over) + ((cell * 5701) % 1000) / 1000);
  return (((n + cell * 3) % hues) + hues) % hues;
}

/**
 * How far the mosaic has bleached, 0 to 1, `t` seconds in.
 *
 * The cells do not simply get covered by the white overlay — they LOSE THEIR
 * COLOUR into it. Adam: "getting lighter and lighter until it fades to white."
 *
 * It begins where the pictures do, so the whole second half of the show is one
 * continuous drain rather than a wall at full strength meeting a white sheet.
 * The curve is eased rather than linear: most of the lightening happens late,
 * so the wall stays legible while it is still worth looking at and then goes
 * quickly, which is what makes the white read as an event rather than as a
 * slow dissolve.
 */
export function bleachAt(t: number, swellAt: number): number {
  const from = swellAt * COLOUR_UNTIL;
  if (t <= from) return 0;
  if (t >= swellAt) return 1;
  const p = (t - from) / (swellAt - from);
  return p * p;
}
