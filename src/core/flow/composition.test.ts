import { describe, it, expect } from 'vitest';
import {
  CLUSTER_MAX_INTERNAL_GAP,
  PANEL_SURFACE_TOP,
  QUESTION_AREA_CEILING_FRACTION,
  QUESTION_AREA_TARGET_FRACTION,
  QUESTION_AREA_TOLERANCE,
  fillsQuestionArea,
  gapsBetween,
  inspectCluster,
  questionAreaFraction,
  questionAreaHeight,
  questionAreaOffset,
  widestGap,
} from './composition';
import type { MeasuredRow } from './composition';
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

/**
 * VB-17's rework, in the form the e2e feeds it: a list of measured rows off a
 * real question surface.
 *
 * These fixtures are not invented. `SHIPPED` is the built extension at 400x760
 * on `preferred_name`, measured before this rework — the layout that passed
 * its own e2e and still looked wrong. If `inspectCluster` ever calls that
 * composed again, this rework has been undone.
 */
const SHIPPED: MeasuredRow[] = [
  { name: '.flowprogress', top: 34, bottom: 58 },
  { name: '.flow-q-row', top: 70, bottom: 98 },
  { name: '.flow-answer .field', top: 222, bottom: 274 },
  { name: '.flow-answer .flow-idea-row', top: 286, bottom: 330 },
  { name: '.flow-save', top: 470, bottom: 486 },
];

/** The same screen composed the way this task asks for: the cluster held
 * together at the top by its own margins, the leftover room in one seam, and
 * the save note riding on top of it just above the docked bar. */
const COMPOSED: MeasuredRow[] = [
  { name: '.flowprogress', top: 34, bottom: 58 },
  { name: '.flow-q-row', top: 70, bottom: 98 },
  { name: '.flow-answer .field', top: 106, bottom: 158 },
  { name: '.flow-answer .flow-idea-row', top: 170, bottom: 214 },
  { name: '.flow-save', top: 470, bottom: 486 },
];

describe('gapsBetween', () => {
  it('names both sides of every seam, in visual order', () => {
    expect(gapsBetween(COMPOSED)).toEqual([
      { after: '.flowprogress', before: '.flow-q-row', gap: 12 },
      { after: '.flow-q-row', before: '.flow-answer .field', gap: 8 },
      { after: '.flow-answer .field', before: '.flow-answer .flow-idea-row', gap: 12 },
      { after: '.flow-answer .flow-idea-row', before: '.flow-save', gap: 256 },
    ]);
  });

  it('sorts what it is given rather than trusting document order', () => {
    // The docked bar is `position: fixed` and the save note is pushed down by
    // a flex-grow — neither is where the DOM says it is.
    const shuffled = [COMPOSED[3]!, COMPOSED[0]!, COMPOSED[2]!, COMPOSED[1]!];
    expect(gapsBetween(shuffled).map((g) => g.after)).toEqual([
      '.flowprogress',
      '.flow-q-row',
      '.flow-answer .field',
    ]);
  });

  it('reports an overlap as no gap, never as a negative one', () => {
    const overlapping: MeasuredRow[] = [
      { name: 'a', top: 0, bottom: 40 },
      { name: 'b', top: 20, bottom: 60 },
    ];
    expect(gapsBetween(overlapping)[0]!.gap).toBe(0);
  });

  it('has nothing to say about a surface with one row or none', () => {
    expect(gapsBetween([])).toEqual([]);
    expect(gapsBetween([COMPOSED[0]!])).toEqual([]);
    expect(widestGap([])).toBeNull();
  });
});

describe('VB-17 rework — the cluster holds together and the slack falls in one place', () => {
  it('fails the layout that shipped, which is the whole reason this exists', () => {
    const shipped = inspectCluster(SHIPPED, { footRow: '.flow-save' });
    expect(shipped.composed).toBe(false);
    // And it says WHERE: the hole between the question and its own field.
    expect(shipped.worst).toEqual({ after: '.flow-q-row', before: '.flow-answer .field', gap: 124 });
  });

  it('passes the cluster this rework produces, slack and all', () => {
    const composed = inspectCluster(COMPOSED, { footRow: '.flow-save' });
    expect(composed.composed).toBe(true);
    expect(composed.worst!.gap).toBeLessThanOrEqual(CLUSTER_MAX_INTERNAL_GAP);
    // The one wide seam is deliberate, is below the cluster, and is not judged.
    expect(composed.slack).toEqual({ after: '.flow-answer .flow-idea-row', before: '.flow-save', gap: 256 });
  });

  it('does not let the slack hide anywhere but under the cluster', () => {
    // The same 256px, moved up one row — which is the shipped bug in miniature.
    const misplaced: MeasuredRow[] = [
      { name: '.flow-q-row', top: 70, bottom: 98 },
      { name: '.flow-answer .field', top: 354, bottom: 406 },
      { name: '.flow-save', top: 418, bottom: 434 },
    ];
    expect(inspectCluster(misplaced, { footRow: '.flow-save' }).composed).toBe(false);
  });

  it('holds every seam to the threshold when there is no foot row to exempt', () => {
    const noNote = COMPOSED.slice(0, 4);
    expect(inspectCluster(noNote, { footRow: '.flow-save' }).composed).toBe(true);
    // ...and the wide seam is no longer excused once the note is gone from the
    // list: nothing below the cluster means nothing to be slack.
    expect(inspectCluster(COMPOSED).composed).toBe(false);
    expect(inspectCluster(COMPOSED).slack).toBeNull();
  });

  it('accepts a threshold argument without any rule being built from it', () => {
    expect(inspectCluster(SHIPPED, { footRow: '.flow-save', maxInternalGap: 200 }).composed).toBe(true);
    expect(CLUSTER_MAX_INTERNAL_GAP).toBe(32);
  });

  it('says nothing rather than throwing on a surface it cannot measure', () => {
    expect(inspectCluster([], { footRow: '.flow-save' })).toEqual({
      internal: [],
      worst: null,
      slack: null,
      composed: true,
    });
    // A foot row with nothing above it is not a slack seam.
    expect(inspectCluster([COMPOSED[4]!], { footRow: '.flow-save' }).slack).toBeNull();
  });
});
