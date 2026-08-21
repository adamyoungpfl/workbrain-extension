import { describe, it, expect } from 'vitest';
import {
  BRAIN_MIN_HEIGHT,
  BRAIN_OPEN_HEIGHT,
  BRAIN_STAGE_MIN,
  BRAIN_STAGE_PAD,
  MORPH_DOT_SIZE,
  MORPH_FADE_OUT_MS,
  MORPH_LIST_SCALE,
  MORPH_MS,
  brainDriftAllowed,
  brainFitsIn,
  brainStageSize,
  heightForMode,
  modeForHeight,
  morphPoints,
  morphTransform,
} from './mode';
import { DRAWER_HANDLE_HEIGHT, DRAWER_MIN_HEIGHT, DRAWER_REST_HEIGHT, drawerBounds } from './height';

/** The real side panel: 400px wide, about this tall on a laptop. */
const PANEL = 700;
const BOUNDS = drawerBounds(PANEL);

describe('modeForHeight', () => {
  it('hands Brain over to List below the threshold, and only below it', () => {
    expect(modeForHeight('brain', BRAIN_MIN_HEIGHT)).toBe('brain');
    expect(modeForHeight('brain', BRAIN_MIN_HEIGHT + 1)).toBe('brain');
    expect(modeForHeight('brain', BRAIN_MIN_HEIGHT - 1)).toBe('list');
    expect(modeForHeight('brain', DRAWER_MIN_HEIGHT)).toBe('list');
  });

  it('is reversible: the request survives a drag through the threshold', () => {
    // The whole reason the *request* is what is held, not the result. Drag
    // down past the threshold and Brain hands over; drag back up and it
    // returns, because nothing about what was asked for changed.
    const walk = [320, 240, 180, 179, 140, 132, 200, 400];
    const seen = walk.map((height) => modeForHeight('brain', height));
    expect(seen).toEqual(['brain', 'brain', 'brain', 'list', 'list', 'list', 'brain', 'brain']);
  });

  it('never promotes List to Brain, however tall the drawer gets', () => {
    for (const height of [132, 180, 300, 400, 900]) expect(modeForHeight('list', height)).toBe('list');
  });

  it('a height that is not a number reads as List', () => {
    // List works at any size; a globe drawn into a NaN box does not.
    expect(modeForHeight('brain', Number.NaN)).toBe('list');
  });
});

describe('heightForMode', () => {
  it('expands the drawer when Brain is asked for while it is short', () => {
    const grown = heightForMode('brain', DRAWER_MIN_HEIGHT, BOUNDS);
    expect(grown).toBeGreaterThanOrEqual(BRAIN_MIN_HEIGHT);
    expect(grown).toBe(BRAIN_OPEN_HEIGHT);
    // And the mode it was asked for is now genuinely available at that height.
    expect(modeForHeight('brain', grown)).toBe('brain');
  });

  it('only ever grows — a drawer already taller than the globe needs is left alone', () => {
    for (const height of [BRAIN_OPEN_HEIGHT, BOUNDS.max]) {
      expect(heightForMode('brain', height, BOUNDS)).toBe(height);
    }
    // ...and one that is legal for Brain but smaller than it wants still grows
    // to the size the globe is worth showing at. "Expands to fit it", not
    // "expands to the smallest height that is not illegal".
    expect(heightForMode('brain', BRAIN_MIN_HEIGHT, BOUNDS)).toBe(BRAIN_OPEN_HEIGHT);
  });

  it('the resting peek is short enough to be expanded by choosing Brain', () => {
    // If the drawer opened as tall as Brain wants, "asking for Brain expands
    // it" would never be exercised by anyone — and the peek would not be a
    // peek. This pins the two constants against each other.
    expect(DRAWER_REST_HEIGHT).toBeLessThan(BRAIN_OPEN_HEIGHT);
    expect(heightForMode('brain', DRAWER_REST_HEIGHT, BOUNDS)).toBeGreaterThan(DRAWER_REST_HEIGHT);
  });

  it('choosing List never resizes anything', () => {
    for (const height of [DRAWER_MIN_HEIGHT, DRAWER_REST_HEIGHT, 300, BOUNDS.max]) {
      expect(heightForMode('list', height, BOUNDS)).toBe(height);
    }
  });

  it('cannot escape the panel’s own bounds, however short the panel', () => {
    const tiny = drawerBounds(420);
    const grown = heightForMode('brain', DRAWER_MIN_HEIGHT, tiny);
    expect(grown).toBeLessThanOrEqual(tiny.max);
    expect(grown).toBeGreaterThanOrEqual(tiny.min);
  });
});

describe('brainFitsIn', () => {
  it('is offered on a real panel and withheld on one that cannot hold it', () => {
    expect(brainFitsIn(drawerBounds(700))).toBe(true);
    expect(brainFitsIn(drawerBounds(600))).toBe(true);
    // 300px of panel leaves the drawer at its 132px floor — there is no
    // height at which Brain would be usable, so it is not on the menu.
    expect(brainFitsIn(drawerBounds(300))).toBe(false);
  });
});

describe('brainStageSize', () => {
  it('is the drawer minus its handle and padding, squared off by the narrower side', () => {
    expect(brainStageSize(324, 400)).toBe(324 - DRAWER_HANDLE_HEIGHT - BRAIN_STAGE_PAD * 2);
    // A panel narrower than the drawer is tall: width wins.
    expect(brainStageSize(600, 400)).toBe(400 - BRAIN_STAGE_PAD * 2);
  });

  it('never goes below the floor, whatever it is handed', () => {
    expect(brainStageSize(0, 0)).toBe(BRAIN_STAGE_MIN);
    expect(brainStageSize(-500, 400)).toBe(BRAIN_STAGE_MIN);
    expect(brainStageSize(Number.NaN, 400)).toBe(BRAIN_STAGE_MIN);
  });

  it('at the handover threshold it is still a globe, not a badge', () => {
    expect(brainStageSize(BRAIN_MIN_HEIGHT, 400)).toBeGreaterThanOrEqual(BRAIN_STAGE_MIN);
  });
});

describe('brainDriftAllowed', () => {
  it('turns only in Brain, only above the peek, and never mid-morph', () => {
    expect(brainDriftAllowed('brain', 300, false)).toBe(true);
    expect(brainDriftAllowed('brain', 300, true)).toBe(false);
    expect(brainDriftAllowed('list', 300, false)).toBe(false);
    // VB-14's open item 3, stated where it is tested: drift stops at the peek.
    expect(brainDriftAllowed('brain', DRAWER_MIN_HEIGHT, false)).toBe(false);
    expect(brainDriftAllowed('brain', BRAIN_MIN_HEIGHT - 1, false)).toBe(false);
  });
});

describe('morphPoints', () => {
  const host = { x: 20, y: 100, width: 400, height: 300 };
  const brain = { x: 120, y: 150, width: 20, height: 20 };
  const list = { x: 40, y: 380, width: 12, height: 12 };

  it('reports both ends in the layer’s own coordinates', () => {
    const [point] = morphPoints(host, [{ id: 'sec1', brain, list }]);
    expect(point!.id).toBe('sec1');
    expect(point!.brain).toEqual({ x: 110, y: 60, r: 10 });
    // Centred on the row's marker, and drawn small enough to settle inside it
    // rather than cover it — see MORPH_LIST_SCALE.
    expect(point!.list.x).toBe(26);
    expect(point!.list.y).toBe(286);
    expect(point!.list.r).toBeCloseTo(6 * MORPH_LIST_SCALE, 5);
    expect(point!.list.r).toBeLessThan(point!.brain.r);
  });

  it('drops a section that is missing either end rather than guessing one', () => {
    const points = morphPoints(host, [
      { id: 'sec1', brain, list },
      { id: 'sec2', brain, list: null },
      { id: 'sec3', brain: null, list },
      { id: 'sec4', brain: null, list: null },
    ]);
    expect(points.map((p) => p.id)).toEqual(['sec1']);
  });

  it('a zero-sized box still gets a radius a browser can draw', () => {
    const [point] = morphPoints(host, [{ id: 'sec1', brain: { x: 0, y: 0, width: 0, height: 0 }, list }]);
    expect(point!.brain.r).toBe(1);
  });
});

describe('morphTransform', () => {
  it('places a node and sizes it against the dot it is drawn as', () => {
    expect(morphTransform({ x: 10, y: 20, r: MORPH_DOT_SIZE / 2 })).toBe(
      'translate3d(10.00px, 20.00px, 0) scale(1.000)',
    );
    expect(morphTransform({ x: 0, y: 0, r: MORPH_DOT_SIZE / 4 })).toBe('translate3d(0.00px, 0.00px, 0) scale(0.500)');
  });
});

describe('the morph’s own clock', () => {
  it('is the 520ms VB-14 chose, and every part of it fits inside', () => {
    expect(MORPH_MS).toBe(520);
    // The mode being left is gone well before the nodes land on the one
    // arriving — otherwise the flight happens over a blank drawer.
    expect(MORPH_FADE_OUT_MS).toBeLessThan(MORPH_MS / 2);
  });
});
