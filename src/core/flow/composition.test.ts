import { describe, it, expect } from 'vitest';
import {
  PANEL_SURFACE_TOP,
  QUESTION_AREA_CEILING_FRACTION,
  QUESTION_AREA_TARGET_FRACTION,
  QUESTION_AREA_TOLERANCE,
  fillsQuestionArea,
  questionAreaFraction,
  questionAreaHeight,
  questionAreaOffset,
} from './composition';
import { FLOW_NAV_GAP, FLOW_NAV_HEIGHT, flowBottomReserve } from './dock';
import { DRAWER_MIN_HEIGHT, DRAWER_REST_HEIGHT, drawerBounds } from '../drawer/height';

/** Every realistic panel this thing runs in: a short laptop side panel, the
 * 700px the e2e suite drives, and a tall external display. */
const PANELS = [600, 700, 800, 900];

describe('questionAreaOffset', () => {
  it('is the whole dock, its gap, and the margin above the surface', () => {
    expect(questionAreaOffset(DRAWER_REST_HEIGHT)).toBe(
      DRAWER_REST_HEIGHT + FLOW_NAV_HEIGHT + FLOW_NAV_GAP + PANEL_SURFACE_TOP,
    );
    expect(questionAreaOffset(DRAWER_REST_HEIGHT)).toBe(flowBottomReserve(DRAWER_REST_HEIGHT) + PANEL_SURFACE_TOP);
  });

  it('tracks the drawer one-for-one — the question gives up exactly what the drawer takes', () => {
    for (let height = DRAWER_MIN_HEIGHT; height <= 480; height += 29) {
      expect(questionAreaOffset(height + 10) - questionAreaOffset(height)).toBe(10);
    }
  });
});

describe('questionAreaHeight', () => {
  it('is everything the panel has that the dock has not taken', () => {
    expect(questionAreaHeight(700, DRAWER_REST_HEIGHT)).toBe(700 - questionAreaOffset(DRAWER_REST_HEIGHT));
  });

  it('never goes negative on a panel too short for its own furniture', () => {
    // Degrade, never break (docs/GUARDRAILS.md): the question simply has no
    // room to spare and the surface scrolls, rather than a negative length
    // reaching min-height and taking the layout with it.
    expect(questionAreaHeight(120, 400)).toBe(0);
    expect(questionAreaHeight(Number.NaN, DRAWER_REST_HEIGHT)).toBe(0);
  });
});

describe('VB-17 — the question area really is roughly the top 60%', () => {
  /**
   * THE RULE, held against the geometry that produces it.
   *
   * Nothing in the layout is built from 0.6. The 60% is what the resting
   * drawer height (core/drawer/height.ts) plus the docked bar
   * (core/flow/dock.ts) happen to leave, and this is the test that notices if
   * one of them moves far enough to break the composition.
   */
  it('at the resting drawer height, on every panel size this runs at', () => {
    for (const panel of PANELS) {
      const fraction = questionAreaFraction(panel, DRAWER_REST_HEIGHT);
      const at = `${panel}px panel is at ${Math.round(fraction * 100)}%`;
      expect(fillsQuestionArea(panel, DRAWER_REST_HEIGHT), at).toBe(true);
      expect(fraction, at).toBeGreaterThanOrEqual(QUESTION_AREA_TARGET_FRACTION - QUESTION_AREA_TOLERANCE);
      // ...and the drawer is still a drawer at rest, not a rule at the bottom
      // of the screen.
      expect(fraction, at).toBeLessThanOrEqual(QUESTION_AREA_CEILING_FRACTION);
    }
  });

  it('a panel of any ordinary height clears the 60% outright', () => {
    // The tolerance exists for a 600px panel, where the dock is a fixed number
    // of pixels out of very few. Anything taller passes on the number itself.
    for (const panel of [700, 800, 900]) {
      expect(questionAreaFraction(panel, DRAWER_REST_HEIGHT), `${panel}px panel`).toBeGreaterThanOrEqual(
        QUESTION_AREA_TARGET_FRACTION,
      );
    }
  });

  it('degrades in the right direction at both ends of the drag', () => {
    for (const panel of PANELS) {
      const bounds = drawerBounds(panel);
      const peek = questionAreaFraction(panel, bounds.min);
      const rest = questionAreaFraction(panel, DRAWER_REST_HEIGHT);
      const full = questionAreaFraction(panel, bounds.max);

      // Drag the drawer down and the question takes the room back; drag it up
      // and the question gives room away. Monotone, at every panel height.
      expect(peek, `${panel}px peek`).toBeGreaterThan(rest);
      expect(full, `${panel}px full`).toBeLessThan(rest);

      // And neither end is absurd: the question always keeps a real share of
      // the panel, and never claims the whole of it.
      expect(full, `${panel}px full`).toBeGreaterThan(0.25);
      expect(peek, `${panel}px peek`).toBeLessThan(0.8);
    }
  });

  it('is the same rule whichever way the panel is resized', () => {
    // A taller panel gives the question more pixels but a similar share —
    // which is what makes this a composition rather than a fixed height.
    const shortest = questionAreaFraction(600, DRAWER_REST_HEIGHT);
    const tallest = questionAreaFraction(900, DRAWER_REST_HEIGHT);
    expect(questionAreaHeight(900, DRAWER_REST_HEIGHT)).toBeGreaterThan(questionAreaHeight(600, DRAWER_REST_HEIGHT));
    expect(Math.abs(tallest - shortest)).toBeLessThan(0.15);
  });
});
