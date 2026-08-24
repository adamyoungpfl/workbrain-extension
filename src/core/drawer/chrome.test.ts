import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { contrastRatio, mixSrgb } from '../color/contrast';
import type { Rgb } from '../color/contrast';
import { FLOW_NAV_HEIGHT, FLOW_NAV_INSET } from '../flow/dock';
import {
  DOCK_BOUNDARY_MIN_CONTRAST,
  DOCK_FRAME,
  DOCK_TEXT_MIN_CONTRAST,
  NAV_CONTROL_BOTTOM,
  NAV_CONTROL_TOP,
  NAV_RAMP_FOOT,
  NAV_RAMP_FOOT_MIX,
  NAV_RAMP_HEIGHT,
  navRampColorAt,
  navRampMixAt,
} from './chrome';

/**
 * V1.4 VB-22 — the ramp, and the floor it has to clear.
 *
 * Two halves. The first is ordinary arithmetic about a gradient. The second is
 * the point of the file: it reads **the real values out of design/tokens.json**
 * and checks that every colour the dock puts on that gradient clears
 * docs/GUARDRAILS.md — text at 4.5:1, an interactive boundary at 3:1 — at the
 * bottom edge of the buttons, in their middle, and at their top edge.
 *
 * Reading the tokens rather than restating them is deliberate. A test with the
 * hex values copied into it passes forever while the product drifts; this one
 * fails the moment someone edits `--globe-panel` or the stage colours, which is
 * exactly the conversation that should happen. tests/e2e/dock-surface.spec.ts
 * then proves the same thing about the pixels a browser really painted — this
 * proves it about the palette we chose.
 */

interface TokenFile {
  color: Record<string, { value?: string } & Record<string, { value?: string }>>;
}

// From the repo root, which is where vitest runs: under jsdom `import.meta.url`
// is an http URL and readFileSync will not take one.
const tokens = JSON.parse(readFileSync(resolve(process.cwd(), 'design/tokens.json'), 'utf8')) as TokenFile;

function hex(text: string): Rgb {
  return {
    r: parseInt(text.slice(1, 3), 16),
    g: parseInt(text.slice(3, 5), 16),
    b: parseInt(text.slice(5, 7), 16),
  };
}

/** One token by name, `group.key` for the two nested palettes. Throws rather
 * than returning a default: a renamed token must break this file loudly. */
function token(name: string): Rgb {
  const [head, tail] = name.split('.');
  const group = tokens.color[head!];
  if (!group) throw new Error(`no such token group: ${head}`);
  const entry = tail === undefined ? group : (group as Record<string, { value?: string }>)[tail];
  const value = entry?.value;
  if (typeof value !== 'string') throw new Error(`no such token: ${name}`);
  return hex(value);
}

const CANVAS = token('canvas');
/**
 * The stage the dock takes its colour from, per mode.
 *
 * V1.6 VB-30 made those two the SAME colour: the bar takes the Brain visual's
 * dark field in List as well, so the ramp's foot is that field in both modes
 * and every control in the bar stands on it in both. Kept as a map rather than
 * collapsed to one constant because the two modes are still two cases that
 * have to be checked — the assertions below are the ones that would catch the
 * day one of them drifts back.
 */
const STAGE = { brain: token('globe.field'), list: token('globe.field') };

/** V1.6 VB-30. What is left of "List's own lighter stage": the ground the
 * drawer's CONTENT sits on, which the bar above it no longer shares. */
const PANE_LIST = token('surface');

/** Where a control's edge meets the ramp: its bottom, its middle, its top. */
const EDGES = [NAV_CONTROL_BOTTOM, (NAV_CONTROL_BOTTOM + NAV_CONTROL_TOP) / 2, NAV_CONTROL_TOP];

function againstRamp(colour: Rgb, stage: Rgb): number {
  return Math.min(...EDGES.map((y) => contrastRatio(colour, navRampColorAt(y, stage, CANVAS))));
}

describe('the bar the buttons sit in', () => {
  it('is exactly the docked bar, and the buttons are inset inside it', () => {
    expect(NAV_RAMP_HEIGHT).toBe(FLOW_NAV_HEIGHT);
    expect(NAV_RAMP_FOOT).toBe(FLOW_NAV_INSET);
    // The bar is one 44px control plus its inset above and below — the sum
    // core/flow/dock.ts's FLOW_NAV_HEIGHT is written as prose.
    expect(FLOW_NAV_HEIGHT - FLOW_NAV_INSET * 2).toBe(44);
    // …which is what makes the ramp's steep half finish exactly where the
    // buttons begin.
    expect(NAV_CONTROL_BOTTOM).toBe(NAV_RAMP_FOOT);
    expect(NAV_CONTROL_TOP).toBe(FLOW_NAV_HEIGHT - FLOW_NAV_INSET);
  });
});

describe('the frame the pane sits inside (VB-29)', () => {
  it('is the panel’s own margin, and the first term of the bar’s gutter', () => {
    // 8px is not a number somebody liked: it is the panel body's own margin,
    // which is why the pane's sides land in the column the rest of the product
    // already uses. Flow.css writes that gutter as one number (26) with the
    // sum in a comment, so this is where the first term is pinned.
    expect(DOCK_FRAME).toBe(8);
    expect(DOCK_FRAME).toBeLessThan(NAV_RAMP_FOOT + DOCK_FRAME);
    // Small enough that the bar's own inset still clears it — the ramp is
    // inset by exactly this, and its steep foot is the same height, so the
    // frame never reaches the buttons.
    expect(DOCK_FRAME).toBeLessThanOrEqual(FLOW_NAV_INSET);
  });
});

describe('navRampMixAt', () => {
  it('starts at the stage colour and ends at the canvas', () => {
    expect(navRampMixAt(0)).toBe(0);
    expect(navRampMixAt(NAV_RAMP_HEIGHT)).toBe(1);
  });

  it('clamps rather than running off either end', () => {
    expect(navRampMixAt(-40)).toBe(0);
    expect(navRampMixAt(4000)).toBe(1);
    expect(navRampMixAt(Number.NaN)).toBe(0);
  });

  it('has lifted by NAV_RAMP_FOOT_MIX at the bottom edge of the buttons', () => {
    expect(navRampMixAt(NAV_RAMP_FOOT)).toBeCloseTo(NAV_RAMP_FOOT_MIX, 10);
  });

  it('only ever lightens, and does most of its work in the foot', () => {
    let previous = -1;
    for (let y = 0; y <= NAV_RAMP_HEIGHT; y++) {
      const mix = navRampMixAt(y);
      expect(mix).toBeGreaterThanOrEqual(previous);
      previous = mix;
    }
    // Under an eighth of the height carries nearly half the change.
    expect(NAV_RAMP_FOOT / NAV_RAMP_HEIGHT).toBeLessThan(0.15);
    expect(NAV_RAMP_FOOT_MIX).toBeGreaterThan(0.4);
  });
});

describe('navRampColorAt', () => {
  it('is the stage colour at the drawer edge and the canvas at the top', () => {
    expect(navRampColorAt(0, STAGE.brain, CANVAS)).toEqual(STAGE.brain);
    expect(navRampColorAt(NAV_RAMP_HEIGHT, STAGE.brain, CANVAS)).toEqual(CANVAS);
  });

  it('agrees with a plain sRGB mix at the stop it was given', () => {
    expect(navRampColorAt(NAV_RAMP_FOOT, STAGE.brain, CANVAS)).toEqual(
      mixSrgb(STAGE.brain, CANVAS, NAV_RAMP_FOOT_MIX),
    );
  });
});

/**
 * THE REASON THE RAMP HAS A FOOT.
 *
 * Spread the same fade evenly across the bar and the buttons stand in a
 * background that travels most of the luminance range down their own height.
 * There is then no colour — none, not a darker one, not a lighter one, not a
 * cleverer one — that holds 3:1 along the whole edge of a control, because the
 * ramp passes *through* whatever luminance the edge has and the contrast there
 * is 1:1. This searches the entire greyscale for the best any fixed edge could
 * do and shows it falls short, which is what rules out "just pick a better
 * colour" as an answer and makes the foot geometry rather than taste.
 */
describe('an evenly spread ramp', () => {
  it('cannot be given a boundary by any fixed colour', () => {
    const evenRamp = (y: number): Rgb => mixSrgb(STAGE.brain, CANVAS, y / NAV_RAMP_HEIGHT);
    let best = 0;
    for (let level = 0; level <= 255; level += 1) {
      const candidate = { r: level, g: level, b: level };
      let worst = Infinity;
      for (let y = NAV_CONTROL_BOTTOM; y <= NAV_CONTROL_TOP; y += 1) {
        worst = Math.min(worst, contrastRatio(candidate, evenRamp(y)));
      }
      best = Math.max(best, worst);
    }
    expect(best).toBeLessThan(DOCK_BOUNDARY_MIN_CONTRAST);
  });

  it('is fixed by the foot: the dock’s own chip clears the floor all the way up', () => {
    expect(againstRamp(token('globe.panel'), STAGE.brain)).toBeGreaterThanOrEqual(
      DOCK_BOUNDARY_MIN_CONTRAST,
    );
  });
});

describe('Brain — every nav control on the dark stage', () => {
  it('bounds each control against the ramp along its whole edge', () => {
    // Back and Skip are chips cut from the dock's own deep navy…
    expect(againstRamp(token('globe.panel'), STAGE.brain)).toBeGreaterThanOrEqual(3);
    // …and every control, Next included, carries the stage's own near-black
    // keyline, which is what gives the primary a boundary its fill cannot.
    expect(againstRamp(token('globe.field'), STAGE.brain)).toBeGreaterThanOrEqual(3);
    // Stated as the thing it is protecting against: the primary's fill alone
    // is invisible against the middle of this ramp.
    expect(againstRamp(token('primary'), STAGE.brain)).toBeLessThan(3);
  });

  it('reads every label against its own ground, not against the ramp', () => {
    expect(contrastRatio(token('globe.label'), token('globe.panel'))).toBeGreaterThanOrEqual(
      DOCK_TEXT_MIN_CONTRAST,
    );
    expect(contrastRatio(token('globe.detail-key'), token('globe.panel'))).toBeGreaterThanOrEqual(
      DOCK_TEXT_MIN_CONTRAST,
    );
    expect(contrastRatio(token('ink-inv'), token('primary'))).toBeGreaterThanOrEqual(
      DOCK_TEXT_MIN_CONTRAST,
    );
  });

  it('carries the bar’s own light text on the stage itself', () => {
    // The two mode toggles and the section count, which sit on the drawer's
    // head rather than in the ramp.
    expect(contrastRatio(token('globe.detail-key'), STAGE.brain)).toBeGreaterThanOrEqual(
      DOCK_TEXT_MIN_CONTRAST,
    );
    expect(contrastRatio(token('globe.label'), STAGE.brain)).toBeGreaterThanOrEqual(
      DOCK_TEXT_MIN_CONTRAST,
    );
    // The pressed toggle's own chip, and the ring the dark stage focuses with
    // (--primary measures 2.90:1 here, which is why it is not this).
    expect(contrastRatio(token('globe.label'), token('globe.panel'))).toBeGreaterThanOrEqual(
      DOCK_TEXT_MIN_CONTRAST,
    );
    expect(contrastRatio(token('globe.focus'), STAGE.brain)).toBeGreaterThanOrEqual(
      DOCK_BOUNDARY_MIN_CONTRAST,
    );
  });
});

/**
 * V1.6 VB-30 — THE MOST LIKELY WAY THIS BATCH SHIPS AN ACCESSIBILITY
 * REGRESSION, and the reason these are extensions of VB-22's assertions rather
 * than a new file.
 *
 * The bar is now the dark field in both modes, so the ramp above it ends dark
 * in List — where it used to end within a few points of white. Every control
 * in that bar therefore stands on a background it has never stood on before,
 * and the honest way to say so is to run List's block against the same stage
 * Brain's is run against and watch it hold.
 */
describe('List — the nav bar now stands on the same dark foot', () => {
  it('is the same stage as Brain: one bar, not two dressed alike', () => {
    expect(STAGE.list).toEqual(STAGE.brain);
    // …and it really is dark, not merely equal to whatever Brain happens to
    // be: a bar that reads as the globe's own field is the point of VB-30.
    expect(contrastRatio(STAGE.list, CANVAS)).toBeGreaterThan(DOCK_TEXT_MIN_CONTRAST * 2);
  });

  it('bounds each control against the ramp along its whole edge', () => {
    // The same chips and keyline Brain's block checks, now checked as List's
    // too — Back and Skip on the dock's deep navy, every control keylined
    // with the stage itself.
    expect(againstRamp(token('globe.panel'), STAGE.list)).toBeGreaterThanOrEqual(
      DOCK_BOUNDARY_MIN_CONTRAST,
    );
    expect(againstRamp(token('globe.field'), STAGE.list)).toBeGreaterThanOrEqual(
      DOCK_BOUNDARY_MIN_CONTRAST,
    );
    // The treatment List used to carry would not survive this foot, which is
    // why it did not keep it: --dock-edge held 3:1 against a near-white ramp
    // and holds nothing against a dark one.
    expect(againstRamp(token('dock-edge'), STAGE.list)).toBeLessThan(DOCK_BOUNDARY_MIN_CONTRAST);
    // Nor would the primary's bare fill, which is why every control keeps the
    // keyline in both modes now.
    expect(againstRamp(token('primary'), STAGE.list)).toBeLessThan(DOCK_BOUNDARY_MIN_CONTRAST);
  });

  it('reads every label against a ground that clears the floor', () => {
    // Back and Next on their own chips, and Skip on the quiet one — the dark
    // set, in the mode that used to use the light one.
    expect(contrastRatio(token('globe.label'), token('globe.panel'))).toBeGreaterThanOrEqual(
      DOCK_TEXT_MIN_CONTRAST,
    );
    expect(contrastRatio(token('globe.detail-key'), token('globe.panel'))).toBeGreaterThanOrEqual(
      DOCK_TEXT_MIN_CONTRAST,
    );
    expect(contrastRatio(token('ink-inv'), token('primary'))).toBeGreaterThanOrEqual(
      DOCK_TEXT_MIN_CONTRAST,
    );
    // And the bar's own two: the mode toggles and the section count, which
    // VB-30 says go light and STAY light.
    expect(contrastRatio(token('globe.detail-key'), STAGE.list)).toBeGreaterThanOrEqual(
      DOCK_TEXT_MIN_CONTRAST,
    );
    expect(contrastRatio(token('globe.label'), STAGE.list)).toBeGreaterThanOrEqual(
      DOCK_TEXT_MIN_CONTRAST,
    );
    // The ink the light bar used to carry would now be unreadable — stated so
    // a half-done revert fails here rather than on a screen.
    expect(contrastRatio(token('ink-2'), STAGE.list)).toBeLessThan(DOCK_TEXT_MIN_CONTRAST);
  });

  it('leaves the drawer’s own pane light, and --dock-edge with a job', () => {
    // What VB-30 did NOT change: below the bar, List is still the panel's own
    // light ground, and everything the drawer prints on it is measured there.
    expect(contrastRatio(token('ink'), PANE_LIST)).toBeGreaterThanOrEqual(DOCK_TEXT_MIN_CONTRAST);
    expect(contrastRatio(token('ink-2'), PANE_LIST)).toBeGreaterThanOrEqual(DOCK_TEXT_MIN_CONTRAST);
    // --ink-3 is 4.71:1 on the canvas and 4.40:1 here, which is why the pane's
    // quiet text steps up (FileDrawer.css).
    expect(contrastRatio(token('ink-3'), PANE_LIST)).toBeLessThan(DOCK_TEXT_MIN_CONTRAST);
    // And why --dock-edge exists at all: --border-i is measured against
    // --canvas and drops under the floor on this pane, where the drawer's own
    // hollow pill still needs a 3:1 boundary.
    expect(contrastRatio(token('border-i'), PANE_LIST)).toBeLessThan(DOCK_BOUNDARY_MIN_CONTRAST);
    expect(contrastRatio(token('dock-edge'), PANE_LIST)).toBeGreaterThanOrEqual(
      DOCK_BOUNDARY_MIN_CONTRAST,
    );
  });
});
