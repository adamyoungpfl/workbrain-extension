import { describe, expect, it } from 'vitest';
import {
  CELL_COUNT,
  COLS,
  HOLD_END_S,
  HOLD_START_S,
  ROWS,
  STAGE_H,
  STAGE_W,
  bleachAt,
  cutsBy,
  frameAt,
  holdAt,
  makeMosaic,
  stageAt,
  tintAt,
} from './mosaic';

const OVER = 3.8; // SPLASH_BEATS.swellAt

describe('makeMosaic — irregular panels that still tile', () => {
  it('makes one quad per cell', () => {
    const cells = makeMosaic();
    expect(cells).toHaveLength(CELL_COUNT);
    expect(CELL_COUNT).toBe(COLS * ROWS);
    expect(cells.every((c) => c.length === 4)).toBe(true);
  });

  it('fills the stage exactly — the frame vertices never move', () => {
    // A gap at the edge would show the page through the wall.
    const cells = makeMosaic();
    const xs = cells.flat().map((p) => p.x);
    const ys = cells.flat().map((p) => p.y);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...xs)).toBe(STAGE_W);
    expect(Math.max(...ys)).toBe(STAGE_H);
  });

  it('is watertight: neighbours share moved corners exactly', () => {
    // The whole reason for jittering a grid rather than scattering cells.
    const cells = makeMosaic();
    const topLeft = cells[0]!;
    const toItsRight = cells[1]!;
    expect(toItsRight[0]).toEqual(topLeft[1]);
    expect(toItsRight[3]).toEqual(topLeft[2]);
    const below = cells[COLS]!;
    expect(below[0]).toEqual(topLeft[3]);
    expect(below[1]).toEqual(topLeft[2]);
  });

  it('is actually irregular — interior corners left their lattice points', () => {
    const cells = makeMosaic();
    const stepX = STAGE_W / COLS;
    const onLattice = (p: { x: number; y: number }) =>
      Math.abs(p.x % stepX) < 0.001 || Math.abs((p.x % stepX) - stepX) < 0.001;
    expect(cells.flat().some((p) => !onLattice(p))).toBe(true);
  });

  it('is the same mosaic every time for a seed, and different across seeds', () => {
    // The splash must not look like a different product on every open.
    expect(makeMosaic(7)).toEqual(makeMosaic(7));
    expect(makeMosaic(7)).not.toEqual(makeMosaic(8));
  });
});

describe('the cut rate accelerates', () => {
  it('starts slow enough to read and ends faster than reading', () => {
    expect(holdAt(0, OVER)).toBeCloseTo(HOLD_START_S, 5);
    expect(holdAt(OVER, OVER)).toBeCloseTo(HOLD_END_S, 5);
  });

  it('only ever speeds up — never a beat where it slows', () => {
    let previous = Infinity;
    for (let t = 0; t <= OVER; t += 0.05) {
      const hold = holdAt(t, OVER);
      expect(hold).toBeLessThanOrEqual(previous + 1e-9);
      previous = hold;
    }
  });

  it('holds flat at its fastest past the ramp rather than running away', () => {
    expect(holdAt(OVER * 2, OVER)).toBeCloseTo(HOLD_END_S, 5);
  });

  it('counts cuts monotonically, from zero', () => {
    expect(cutsBy(0, OVER)).toBe(0);
    expect(cutsBy(-1, OVER)).toBe(0);
    let previous = -1;
    for (let t = 0; t <= OVER * 1.5; t += 0.1) {
      const cuts = cutsBy(t, OVER);
      expect(cuts).toBeGreaterThanOrEqual(previous);
      previous = cuts;
    }
  });

  it('gets through far more cuts in the last second than the first', () => {
    // The acceleration has to be visible, not merely present.
    const first = cutsBy(1, OVER) - cutsBy(0, OVER);
    const last = cutsBy(OVER, OVER) - cutsBy(OVER - 1, OVER);
    expect(last).toBeGreaterThan(first * 4);
  });
});

describe('frameAt — what each panel is holding', () => {
  const IMAGES = 18;

  it('never points outside the image set', () => {
    for (let t = 0; t < 6; t += 0.03) {
      for (let cell = 0; cell < CELL_COUNT; cell += 1) {
        const i = frameAt(t, cell, IMAGES, OVER);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(IMAGES);
      }
    }
  });

  it('does not cut the whole wall in lockstep', () => {
    // Fifteen panels changing on the same frame is one flashing rectangle,
    // not a mosaic. Each cell is offset along the cut sequence.
    let sameMoment = 0;
    const before = Array.from({ length: CELL_COUNT }, (_, c) => frameAt(1.0, c, IMAGES, OVER));
    const after = Array.from({ length: CELL_COUNT }, (_, c) => frameAt(1.04, c, IMAGES, OVER));
    for (let c = 0; c < CELL_COUNT; c += 1) if (before[c] !== after[c]) sameMoment += 1;
    expect(sameMoment).toBeLessThan(CELL_COUNT);
  });

  it('shows a spread of images at any instant, not one picture fifteen times', () => {
    const shown = new Set(
      Array.from({ length: CELL_COUNT }, (_, c) => frameAt(1.4, c, IMAGES, OVER)),
    );
    expect(shown.size).toBeGreaterThan(CELL_COUNT / 2);
  });

  it('every cell does change over the show', () => {
    for (let cell = 0; cell < CELL_COUNT; cell += 1) {
      const seen = new Set<number>();
      for (let t = 0; t < 3.8; t += 0.02) seen.add(frameAt(t, cell, IMAGES, OVER));
      expect(seen.size).toBeGreaterThan(3);
    }
  });

  it('degrades to a still frame rather than dividing by nothing', () => {
    expect(frameAt(2, 0, 0, OVER)).toBe(0);
    expect(frameAt(2, 3, 1, OVER)).toBe(0);
  });
});

describe('stageAt — one thing moves, then two', () => {
  it('opens already showing a picture, with only the treatment moving', () => {
    // The flat opening shade is gone (2026-09-02): every tile holds a picture
    // from the first frame and recolours it. One thing changing is a rhythm.
    expect(stageAt(0, OVER)).toBe('colour');
    expect(stageAt(OVER * 0.3, OVER)).toBe('colour');
  });

  it('starts cutting pictures too for the back half', () => {
    expect(stageAt(OVER * 0.6, OVER)).toBe('full');
    expect(stageAt(OVER, OVER)).toBe('full');
  });

  it('only ever moves forward', () => {
    const order: Record<string, number> = { colour: 0, full: 1 };
    let previous = -1;
    for (let t = 0; t <= OVER * 1.4; t += 0.05) {
      const rank = order[stageAt(t, OVER)] as number;
      expect(rank).toBeGreaterThanOrEqual(previous);
      previous = rank;
    }
  });
});

describe('tintAt — colour cuts on its own beat', () => {
  it('stays inside the palette', () => {
    for (let t = 0; t < 5; t += 0.05) {
      for (let cell = 0; cell < CELL_COUNT; cell += 1) {
        const i = tintAt(t, cell, 8, OVER);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(8);
      }
    }
  });

  it('does not change colour on the same frame it changes picture', () => {
    // Two things moving together read as one thing flickering. Over a whole
    // run, the two sequences must not be the same sequence.
    let sameEverywhere = true;
    for (let t = 0; t < 3.5; t += 0.04) {
      for (let cell = 0; cell < CELL_COUNT; cell += 1) {
        if (tintAt(t, cell, 8, OVER) !== frameAt(t, cell, 8, OVER)) sameEverywhere = false;
      }
    }
    expect(sameEverywhere).toBe(false);
  });

  it('gives a spread of colours across the wall at any instant', () => {
    const shown = new Set(
      Array.from({ length: CELL_COUNT }, (_, c) => tintAt(1.4, c, 8, OVER)),
    );
    expect(shown.size).toBeGreaterThan(3);
  });

  it('degrades to a single colour rather than dividing by nothing', () => {
    expect(tintAt(2, 3, 0, OVER)).toBe(0);
  });
});

describe('bleachAt — the wall drains through the whole back half', () => {
  it('is full colour while the wall is still building', () => {
    expect(bleachAt(0, OVER)).toBe(0);
    expect(bleachAt(OVER * 0.4, OVER)).toBe(0);
  });

  it('starts draining where the pictures start, and is white by the swell', () => {
    // One continuous drain rather than a wall at full strength meeting a
    // white sheet.
    expect(bleachAt(OVER * 0.6, OVER)).toBeGreaterThan(0);
    expect(bleachAt(OVER * 0.6, OVER)).toBeLessThan(1);
    expect(bleachAt(OVER, OVER)).toBe(1);
    expect(bleachAt(OVER + 2, OVER)).toBe(1);
  });

  it('holds its colour late, then goes quickly', () => {
    // Eased, not linear: the wall stays legible while it is worth looking at,
    // and the white then reads as an event rather than a slow dissolve.
    const half = bleachAt(OVER * 0.73, OVER);
    expect(half).toBeLessThan(0.4);
  });

  it('rises without ever stepping back', () => {
    let previous = -1;
    for (let t = 0; t <= OVER; t += 0.05) {
      const v = bleachAt(t, OVER);
      expect(v).toBeGreaterThanOrEqual(previous);
      previous = v;
    }
  });
});
