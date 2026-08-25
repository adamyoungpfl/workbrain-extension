import { describe, it, expect } from 'vitest';
import {
  BRAIN_MIN_HEIGHT,
  BRAIN_OPEN_HEIGHT,
  BRAIN_STAGE_IDEAL,
  BRAIN_STAGE_MIN,
  BRAIN_STAGE_PAD,
  BRAIN_YIELD_BAND,
  MORPH_DOT_SIZE,
  MORPH_FADE_OUT_MS,
  MORPH_LIST_SCALE,
  MORPH_MS,
  brainDriftAllowed,
  brainFitsIn,
  brainStageFits,
  brainStageRoom,
  brainStageSize,
  heightForMode,
  modeForHeight,
  morphPoints,
  morphTransform,
  nextBrainYield,
  shownDrawerMode,
} from './mode';
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
    // V2.1 VB-75 — this line used to expect `true`. A 600px viewport caps the
    // drawer at a 144px stage: enough to paint the old minimum globe, not
    // enough to paint the globe at reading size, and reading size is now the
    // bar. "It either is important enough to see at reading size or not
    // important enough to use and just stay in list view." On this panel the
    // view bar is not rendered at all and the drawer is simply the List.
    expect(brainFitsIn(drawerBounds(600))).toBe(false);
    expect(brainFitsIn(drawerBounds(300))).toBe(false);
  });
});

describe('brainStageSize', () => {
  it('is the drawer minus its chrome and its padding, squared off by the narrower side', () => {
    // V1.9 VB-51/VB-52: the chrome is three bands, not one. V1.9 VB-50: there
    // is no frame left to subtract — the drawer is one colour edge to edge, so
    // the stage really does reach both edges (core/drawer/chrome.ts).
    expect(brainStageSize(324, 400)).toBe(324 - DRAWER_CHROME_HEIGHT - BRAIN_STAGE_PAD * 2);
    // A panel narrower than the drawer is tall: width wins.
    expect(brainStageSize(600, 400)).toBe(400 - BRAIN_STAGE_PAD * 2);
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
   * THE ASSERTION A CHANGED BOX COULD BREAK SILENTLY.
   *
   * The stage clips (FileDrawer.css), so a globe sized against a box bigger
   * than the drawer's real one simply loses its edge — and nothing fails. This
   * states the real box at every height a real panel allows: the drawer's
   * height, less its three chrome bands, less the stage's own padding.
   *
   * It is the assertion V1.9 VB-50 had to be checked against, because removing
   * the frame moves this box outward by eight pixels vertically and sixteen
   * horizontally. Growing INTO room that is genuinely there is safe; the
   * failure mode is growing past it.
   */
  it('always fits the box the drawer really leaves, at every height a real panel allows', () => {
    for (const height of [BRAIN_MIN_HEIGHT, 240, 320, BOUNDS.max]) {
      const room = height - DRAWER_CHROME_HEIGHT - BRAIN_STAGE_PAD * 2;
      expect(brainStageSize(height, 400), `${height}px tall`).toBeLessThanOrEqual(Math.max(room, BRAIN_STAGE_MIN));
      expect(brainStageSize(height, 400)).toBeLessThanOrEqual(400 - BRAIN_STAGE_PAD * 2);
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

/**
 * V2.0 VB-70 — the threshold, pinned to the picture rather than typed beside
 * it.
 *
 * The claim this block has to make honest is the one in the spec: "the stage's
 * displayed height becomes the minimum for Brain to be available". So every
 * assertion below is written against `brainStageSize` — the number the globe is
 * really drawn at — and `BRAIN_MIN_HEIGHT` is checked as a *consequence* of it
 * rather than being the thing under test.
 */
describe('brainStageRoom and brainStageFits — the threshold is the stage', () => {
  it('the room and the size are the same number until the clamp catches', () => {
    expect(brainStageRoom(324, 400)).toBe(brainStageSize(324, 400));
    // Below the arithmetic floor they part company: the size stops shrinking
    // and the room keeps falling. V2.1 VB-75 moved `BRAIN_MIN_HEIGHT` well
    // above this point — the threshold and the clamp used to coincide and no
    // longer do — so the short height is derived from the clamp itself, which
    // is the thing this assertion is actually about.
    const clampHeight = DRAWER_CHROME_HEIGHT + BRAIN_STAGE_MIN + BRAIN_STAGE_PAD * 2;
    const short = clampHeight - 20;
    expect(brainStageRoom(short, 400)).toBeLessThan(brainStageSize(short, 400));
  });

  /**
   * V2.1 VB-75 — this block used to assert `fits === room >= brainStageSize`:
   * "fits exactly while the stage can paint the globe it is given". That
   * equivalence WAS the old rule, and it is gone on purpose — a stage that can
   * paint a 150px globe without clipping it is still not offering Brain,
   * because 150px is below the size the globe was designed to be read at.
   * The claim now: fits exactly while the stage has room for the IDEAL.
   */
  it('fits exactly while the stage has room for the globe at reading size', () => {
    for (const height of [BRAIN_MIN_HEIGHT - 40, BRAIN_MIN_HEIGHT - 1, BRAIN_MIN_HEIGHT, BRAIN_MIN_HEIGHT + 1, BRAIN_MIN_HEIGHT + 60]) {
      const room = brainStageRoom(height, 400)!;
      expect(brainStageFits(height, 400), `${height}px tall`).toBe(room >= BRAIN_STAGE_IDEAL);
    }
    // And the ideal really is what a just-fitting stage paints — the shown
    // globe is never smaller than the globe "show me the Brain" opens.
    expect(brainStageSize(BRAIN_MIN_HEIGHT, 400)).toBe(BRAIN_STAGE_IDEAL);
  });

  it('BRAIN_MIN_HEIGHT is where that answer turns over, so the constant cannot drift', () => {
    expect(brainStageFits(BRAIN_MIN_HEIGHT, 400)).toBe(true);
    expect(brainStageFits(BRAIN_MIN_HEIGHT - 1, 400)).toBe(false);
  });

  /**
   * V2.1 VB-75, stated as the property it is. Adam: "It either is important
   * enough to see at reading size or not important enough to use and just stay
   * in list view." So: there is NO height and no ordinary width at which the
   * drawer offers Brain and paints the globe smaller than the size it opens
   * at. The two constants being equal is the implementation; this is the
   * behaviour, swept across the whole range rather than sampled at the edge.
   */
  it('no shown globe is ever smaller than the one "show me the Brain" opens', () => {
    for (let height = DRAWER_MIN_HEIGHT; height <= 900; height += 1) {
      if (!brainStageFits(height, 400)) continue;
      expect(brainStageSize(height, 400), `${height}px tall`).toBeGreaterThanOrEqual(BRAIN_STAGE_IDEAL);
    }
    expect(BRAIN_MIN_HEIGHT).toBe(BRAIN_OPEN_HEIGHT);
  });

  it('a panel too narrow for the globe fails at every height — width is part of the picture', () => {
    // `modeForHeight` cannot see this: it is a threshold on the height alone.
    // A real side panel is never this narrow; the point is that the answer now
    // comes from the stage's own two measurements rather than from one of them.
    // V2.1 VB-75: the width bar is the IDEAL too — a panel wide enough for a
    // 116px globe but not a 208px one gets the List, same as a short one.
    const narrow = BRAIN_STAGE_IDEAL + BRAIN_STAGE_PAD * 2 - 1;
    expect(brainStageFits(BOUNDS.max, narrow)).toBe(false);
    expect(brainStageFits(BOUNDS.max, narrow + 1)).toBe(true);
  });

  it('is false rather than NaN-true when it is handed nothing usable', () => {
    expect(brainStageRoom(Number.NaN, 400)).toBeNull();
    expect(brainStageFits(Number.NaN, 400)).toBe(false);
    expect(brainStageFits(300, Number.NaN)).toBe(false);
  });
});

describe('nextBrainYield — out is a necessity, back in is a suggestion', () => {
  const W = 400;

  it('hands the drawer over the moment the stage cannot paint the globe', () => {
    expect(nextBrainYield(false, BRAIN_MIN_HEIGHT, W)).toBe(false);
    expect(nextBrainYield(false, BRAIN_MIN_HEIGHT - 1, W)).toBe(true);
    expect(nextBrainYield(false, DRAWER_MIN_HEIGHT, W)).toBe(true);
  });

  it('does not hand it back until there is a whole band of room to spare', () => {
    // Back over the threshold is NOT enough — that is the thrash.
    expect(nextBrainYield(true, BRAIN_MIN_HEIGHT, W)).toBe(true);
    expect(nextBrainYield(true, BRAIN_MIN_HEIGHT + BRAIN_YIELD_BAND - 1, W)).toBe(true);
    expect(nextBrainYield(true, BRAIN_MIN_HEIGHT + BRAIN_YIELD_BAND, W)).toBe(false);
  });

  /**
   * THE TEST THE SPEC ASKS FOR BY NAME: "a drag hovering on the threshold
   * cannot flip modes every frame".
   *
   * Driven the way a hand does it — a pointer parked on the boundary, wobbling
   * a pixel or two either side, sixty samples of it — and folded exactly as the
   * drawer folds it. One change of mode, ever: out, and then nothing.
   */
  it('a pointer jittering on the boundary changes mode once and then stops', () => {
    let yielded = false;
    const seen: boolean[] = [];
    for (let frame = 0; frame < 60; frame++) {
      const wobble = [0, -1, 1, -2, 2, -3, 3][frame % 7]!;
      yielded = nextBrainYield(yielded, BRAIN_MIN_HEIGHT + wobble, W);
      seen.push(yielded);
    }
    const flips = seen.filter((value, index) => index > 0 && value !== seen[index - 1]).length;
    expect(flips, 'the mode flipped more than once on a still hand').toBeLessThanOrEqual(1);
    expect(seen[seen.length - 1], 'it settled in the mode that works at any size').toBe(true);
  });

  it('and it is a real hysteresis, not a one-way door', () => {
    let yielded = false;
    yielded = nextBrainYield(yielded, BRAIN_MIN_HEIGHT - 10, W); // dragged short
    expect(yielded).toBe(true);
    // V2.1 VB-75 made BRAIN_OPEN_HEIGHT and BRAIN_MIN_HEIGHT the same number,
    // so the return has to clear the hysteresis band past it — landing exactly
    // on the threshold is the thrash the band exists to refuse.
    yielded = nextBrainYield(yielded, BRAIN_OPEN_HEIGHT + BRAIN_YIELD_BAND, W); // dragged tall again
    expect(yielded).toBe(false);
  });

  it('a panel that got narrower yields too, at the same height', () => {
    const narrow = BRAIN_STAGE_IDEAL + BRAIN_STAGE_PAD * 2 - 1;
    expect(nextBrainYield(false, BRAIN_OPEN_HEIGHT, narrow)).toBe(true);
  });
});

describe('shownDrawerMode — nobody is yanked into Brain', () => {
  it('shows what was asked for, unless Brain had to give the drawer up', () => {
    expect(shownDrawerMode('brain', false)).toBe('brain');
    expect(shownDrawerMode('brain', true)).toBe('list');
  });

  /**
   * VB-70: "a person who explicitly chose List must not be yanked into Brain
   * just because they made the drawer taller."
   *
   * There is no height and no yield state that turns a `list` request into a
   * Brain on screen. The only way into Brain is to ask for it.
   */
  it('never turns a List request into Brain, however much room appears', () => {
    for (const yielded of [true, false]) expect(shownDrawerMode('list', yielded)).toBe('list');
  });
});

describe('brainDriftAllowed', () => {
  it('turns only in Brain, only above the peek, and never mid-morph', () => {
    // V2.1 VB-75: 300px used to be comfortably in Brain and is now below the
    // threshold — drift heights are stated relative to it, not as literals.
    expect(brainDriftAllowed('brain', BRAIN_MIN_HEIGHT + 20, false)).toBe(true);
    expect(brainDriftAllowed('brain', BRAIN_MIN_HEIGHT + 20, true)).toBe(false);
    expect(brainDriftAllowed('list', BRAIN_MIN_HEIGHT + 20, false)).toBe(false);
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
