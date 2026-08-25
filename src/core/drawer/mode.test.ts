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
import { DOCK_FRAME } from './chrome';
import { DRAWER_CHROME_HEIGHT, DRAWER_CRUMB_NOTE, DRAWER_MIN_HEIGHT, DRAWER_REST_HEIGHT, drawerBounds } from './height';

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
    const T = BRAIN_MIN_HEIGHT;
    const walk = [T + 140, T + 40, T, T - 1, T - 40, DRAWER_MIN_HEIGHT, T + 20, T + 200];
    const seen = walk.map((height) => modeForHeight('brain', height));
    expect(seen).toEqual(['brain', 'brain', 'brain', 'list', 'list', 'list', 'brain', 'brain']);
  });

  it('never promotes List to Brain, however tall the drawer gets', () => {
    for (const height of [DRAWER_MIN_HEIGHT, BRAIN_MIN_HEIGHT, 300, 400, 900]) {
      expect(modeForHeight('list', height)).toBe('list');
    }
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
    // 300px of panel leaves the drawer at its own floor — there is no height
    // at which Brain would be usable, so it is not on the menu.
    expect(brainFitsIn(drawerBounds(300))).toBe(false);
  });
});

describe('brainStageSize', () => {
  it('is the drawer minus its chrome, its padding and its frame, squared off by the narrower side', () => {
    // V1.6 VB-29: the frame is along the bottom and down both sides, so it
    // costs the height one of itself and the width two. V1.9 VB-51/VB-52: the
    // chrome is three bands now, not one.
    expect(brainStageSize(324, 400)).toBe(324 - DRAWER_CHROME_HEIGHT - BRAIN_STAGE_PAD * 2 - DOCK_FRAME);
    // A panel narrower than the drawer is tall: width wins.
    expect(brainStageSize(600, 400)).toBe(400 - BRAIN_STAGE_PAD * 2 - DOCK_FRAME * 2);
  });

  it('gives back the line the breadcrumb takes while it is offering the files', () => {
    // The globe is drawn into a box the CSS has already shortened, so a size
    // that ignored the open menu would be a globe clipped along its bottom
    // edge for as long as the menu is open (FileDrawer.css's `overflow`).
    const tall = 420;
    expect(brainStageSize(tall, 400, DRAWER_CRUMB_NOTE)).toBe(brainStageSize(tall, 400) - DRAWER_CRUMB_NOTE);
    // Never an excuse to grow: a negative extra is not a taller globe.
    expect(brainStageSize(tall, 400, -40)).toBe(brainStageSize(tall, 400));
  });

  /**
   * THE ASSERTION THE FRAME COULD HAVE BROKEN SILENTLY.
   *
   * The stage clips (FileDrawer.css), so a globe sized against the box the
   * drawer had *before* the frame would simply lose its edge — and nothing
   * would fail. This states the real box: the drawer's height less the frame
   * along its bottom, less the head band, less the stage's own padding.
   */
  it('always fits the box the frame leaves, at every height a real panel allows', () => {
    for (const height of [BRAIN_MIN_HEIGHT, 240, 320, BOUNDS.max]) {
      const room = height - DOCK_FRAME - DRAWER_CHROME_HEIGHT - BRAIN_STAGE_PAD * 2;
      expect(brainStageSize(height, 400), `${height}px tall`).toBeLessThanOrEqual(Math.max(room, BRAIN_STAGE_MIN));
      expect(brainStageSize(height, 400)).toBeLessThanOrEqual(400 - DOCK_FRAME * 2 - BRAIN_STAGE_PAD * 2);
    }
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
    // Centred on the row's marker, and — V1.6 VB-32 — drawn AT the marker's
    // own size rather than as a bullet inside it. See MORPH_LIST_SCALE.
    expect(point!.list.x).toBe(26);
    expect(point!.list.y).toBe(286);
    expect(point!.list.r).toBeCloseTo(6 * MORPH_LIST_SCALE, 5);
  });

  /**
   * V1.6 VB-32 — the landing, stated as the thing the task asks for: the
   * flight ends **on the row's own glyph, at its size and position**.
   *
   * Written against a real marker's box (FileTree.css's 26 x 18 tile) rather
   * than against the square fixture above, because the marker is wider than it
   * is tall and `endOf` takes the smaller side — which is what puts an orb the
   * height of the tile dead centre on it instead of one wide enough to hang
   * off both ends of the row.
   */
  it('lands a node on the row marker’s own box, centred and at its size', () => {
    const glyph = { x: 22, y: 400, width: 26, height: 18 };
    const [point] = morphPoints(host, [{ id: 'sec1', brain, list: glyph }]);
    expect(point!.list.x).toBe(glyph.x - host.x + glyph.width / 2);
    expect(point!.list.y).toBe(glyph.y - host.y + glyph.height / 2);
    expect(point!.list.r * 2).toBe(Math.min(glyph.width, glyph.height));
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
